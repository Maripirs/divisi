import { buildPlaybackMidi } from '../midi/playbackMidiBuilder.ts';
import { MIX_PARTS, VOICE_PARTS, type MixPart, type ParsedMIDI } from '../midi/types.ts';

const TICKS_PER_BEAT = 480; // must match `playbackMidiBuilder.ts`'s constant

// js-synthesizer ships as a plain UMD script (not an ES module — its WASM
// glue code isn't bundler-friendly, per the library's own README), loaded
// via <script> tags into `window.JSSynth` rather than `import`ed. `any` is
// deliberate here: this file is the vendor-integration boundary, not the
// portable algorithm core (that's `midi/`) — see the Android-portability
// reasoning carried over from the iOS app's plan.
declare global {
	interface Window {
		JSSynth: {
			waitForReady(): Promise<void>;
			Synthesizer: new () => JSSynthesizer;
			// Nested under `Constants` in the vendored bundle's export map
			// (`Constants: () => Constants_namespaceObject`, which holds
			// `PlayerSetTempoType`) — not a top-level `JSSynth` export.
			Constants: { PlayerSetTempoType: { Internal: 0; ExternalBpm: 1; ExternalMidi: 2 } };
		};
	}
}

interface JSSynthesizer {
	init(sampleRate: number): void;
	createAudioNode(context: AudioContext, frameCount: number): AudioNode;
	loadSFont(bin: ArrayBuffer): Promise<number>;
	resetPlayer(): Promise<void>;
	addSMFDataToPlayer(bin: ArrayBuffer): Promise<void>;
	playPlayer(): Promise<void>;
	stopPlayer(): void;
	seekPlayer(ticks: number): void;
	midiControl(chan: number, ctrl: number, val: number): void;
	setPlayerTempo(tempoType: number, tempo: number): void;
	close(): void;
}

export const MIN_TEMPO_BPM = 40;
export const MAX_TEMPO_BPM = 240;

const VENDOR_SCRIPTS = ['/vendor/libfluidsynth-2.4.6.js', '/vendor/js-synthesizer.js'];
const SOUNDFONT_URL = '/soundfonts/TimGM6mb.sf2';

let vendorScriptsLoaded: Promise<void> | null = null;

function loadVendorScript(src: string): Promise<void> {
	const existing = document.querySelector<HTMLScriptElement>(`script[data-divisi-vendor-src="${src}"]`);
	if (existing?.dataset.loaded === 'true') return Promise.resolve();
	if (existing?.dataset.loading === 'true') {
		return new Promise<void>((resolve, reject) => {
			existing.addEventListener('load', () => resolve(), { once: true });
			existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
		});
	}

	return new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.async = false;
		script.dataset.divisiVendorSrc = src;
		script.dataset.loading = 'true';
		script.onload = () => {
			delete script.dataset.loading;
			script.dataset.loaded = 'true';
			resolve();
		};
		script.onerror = () => {
			script.remove();
			reject(new Error(`Failed to load ${src}`));
		};
		document.head.appendChild(script);
	});
}

function loadVendorScripts(): Promise<void> {
	if (vendorScriptsLoaded) return vendorScriptsLoaded;
	vendorScriptsLoaded = (async () => {
		for (const src of VENDOR_SCRIPTS) {
			await loadVendorScript(src);
		}
		await window.JSSynth.waitForReady();
	})().catch((error) => {
		vendorScriptsLoaded = null;
		throw error;
	});
	return vendorScriptsLoaded;
}

/**
 * Plays a `ParsedMIDI` accurately and lets its four SATB parts be balanced
 * live, using a WASM FluidSynth instance (via js-synthesizer) as the sound
 * engine and the page's own `AudioContext` clock as the single source of
 * truth for playback position — never a polled readout.
 *
 * The whole piece is fed to one FluidSynth player instance (accurate,
 * sample-scheduled by the synth itself) rather than driving individual
 * note events ourselves; live per-part volume is a MIDI CC7 (channel
 * volume) message sent to that part's channel — see
 * `playbackMidiBuilder.ts` for why the channel numbers are ones this
 * player assigns itself rather than whatever the source file used.
 */
export class MidiPlayer {
	private readonly context: AudioContext;
	private readonly synth: JSSynthesizer;
	private channelForPart: Record<MixPart, number> | null = null;
	private durationMs = 0;
	private pausedAtMs = 0;
	private startContextTime = 0;
	private playing = false;
	// The tempo `msToTick` was built against — ticks in the loaded SMF are
	// spaced for this tempo (see `playbackMidiBuilder.ts`), so it never
	// changes after `load()` even while `currentTempoBPM` does live.
	private baseTempoBPM = 120;
	// The live playback tempo (`setTempo`) — starts equal to `baseTempoBPM`
	// and diverges only once the human moves the tempo control.
	private currentTempoBPM = 120;
	private destroyed = false;

	private constructor(context: AudioContext, synth: JSSynthesizer) {
		this.context = context;
		this.synth = synth;
	}

	static async create(): Promise<MidiPlayer> {
		await loadVendorScripts();
		const context = new AudioContext();
		const synth = new window.JSSynth.Synthesizer();
		synth.init(context.sampleRate);
		const node = synth.createAudioNode(context, 8192);
		node.connect(context.destination);

		const soundfont = await fetch(SOUNDFONT_URL).then((r) => r.arrayBuffer());
		await synth.loadSFont(soundfont);

		return new MidiPlayer(context, synth);
	}

	/** Loads a new piece, replacing whatever was previously loaded and
	 * resetting playback to the start. */
	async load(parsed: ParsedMIDI): Promise<void> {
		if (this.destroyed) return;
		this.stop();
		const { bytes, channelForPart } = buildPlaybackMidi(parsed);
		if (this.destroyed) return;
		this.channelForPart = channelForPart;
		this.baseTempoBPM = parsed.tempoBPM;
		this.currentTempoBPM = parsed.tempoBPM;
		this.durationMs = Math.max(
			0,
			...parsed.notes.map((n) => n.startMs + n.durationMs),
			...parsed.backingNotes.map((n) => n.startMs + n.durationMs),
			0
		);
		this.pausedAtMs = 0;
		await this.synth.resetPlayer();
		if (this.destroyed) return;
		await this.synth.addSMFDataToPlayer(bytes.buffer as ArrayBuffer);
		if (this.destroyed) return;
		// Set after `resetPlayer`/`addSMFDataToPlayer`, which (re)initialize
		// the underlying fluid_player_t and would otherwise clobber this back
		// to the SMF's own tempo events.
		this.synth.setPlayerTempo(window.JSSynth.Constants.PlayerSetTempoType.ExternalBpm, this.currentTempoBPM);
	}

	async play(): Promise<void> {
		if (this.destroyed) return;
		if (this.playing) return;
		if (this.context.state === 'suspended') await this.context.resume();
		this.synth.seekPlayer(this.msToTick(this.pausedAtMs));
		await this.synth.playPlayer();
		this.startContextTime = this.context.currentTime - this.pausedAtMs / 1000 / this.rate;
		this.playing = true;
	}

	pause(): void {
		if (this.destroyed) return;
		if (!this.playing) return;
		this.pausedAtMs = this.positionMs;
		this.synth.stopPlayer();
		this.playing = false;
	}

	private stop(): void {
		if (this.destroyed) return;
		this.synth.stopPlayer();
		this.playing = false;
		this.pausedAtMs = 0;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.synth.stopPlayer();
		this.playing = false;
		this.pausedAtMs = 0;
		this.channelForPart = null;
		this.destroyed = true;
		this.synth.close();
		void this.context.close().catch(() => {});
	}

	seek(ms: number): void {
		if (this.destroyed) return;
		const clamped = Math.min(this.durationMs, Math.max(0, ms));
		this.pausedAtMs = clamped;
		this.synth.seekPlayer(this.msToTick(clamped));
		if (this.playing) {
			this.startContextTime = this.context.currentTime - clamped / 1000 / this.rate;
		}
	}

	/** Live playback tempo, in BPM — re-anchors the position clock so musical
	 * position stays continuous across the change instead of jumping (see
	 * `positionMs`'s doc comment for why a rate multiplier is needed at all). */
	setTempo(bpm: number): void {
		if (this.destroyed) return;
		const clamped = Math.round(Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, bpm)));
		if (clamped === this.currentTempoBPM) return;
		if (this.playing) {
			const positionAtOldRate = this.positionMs;
			this.currentTempoBPM = clamped;
			this.pausedAtMs = positionAtOldRate;
			this.startContextTime = this.context.currentTime - positionAtOldRate / 1000 / this.rate;
		} else {
			this.currentTempoBPM = clamped;
		}
		this.synth.setPlayerTempo(window.JSSynth.Constants.PlayerSetTempoType.ExternalBpm, clamped);
	}

	get tempoBPM(): number {
		return this.currentTempoBPM;
	}

	get baseBPM(): number {
		return this.baseTempoBPM;
	}

	/** `currentTempoBPM / baseTempoBPM` — how much faster/slower than the
	 * piece's original tempo playback is currently running. */
	private get rate(): number {
		return this.currentTempoBPM / this.baseTempoBPM;
	}

	/** Live per-bucket volume, `0`–`1` — sent as a MIDI CC7 (channel volume)
	 * message to that bucket's channel, no restart needed. */
	setPartVolume(part: MixPart, volume: number): void {
		if (this.destroyed) return;
		if (!this.channelForPart) return;
		const channel = this.channelForPart[part];
		const midiValue = Math.round(Math.min(1, Math.max(0, volume)) * 127);
		this.synth.midiControl(channel, 7, midiValue);
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	/** Current playback position, in ms of *musical* time at the piece's
	 * original tempo — the same unit `durationMs`/`msPerWholeNote` (in
	 * `musicXmlConverter.ts`) already use, so score/cursor code never needs
	 * to know playback is running faster or slower than that. Read directly
	 * off the `AudioContext` clock while playing — never a polled value —
	 * scaled by `rate` so a live tempo change (which speeds up/slows down
	 * *real* elapsed time per unit of musical time) still reports the right
	 * musical position. */
	get positionMs(): number {
		if (!this.playing) return this.pausedAtMs;
		const elapsed = (this.context.currentTime - this.startContextTime) * 1000 * this.rate;
		return Math.min(this.durationMs, Math.max(0, elapsed));
	}

	get duration(): number {
		return this.durationMs;
	}

	private msToTick(ms: number): number {
		// `ms` is musical time at the original tempo (see `positionMs`'s doc
		// comment), which is exactly what the built MIDI's ticks are spaced
		// for (`TICKS_PER_BEAT` — see `playbackMidiBuilder.ts`) — so this
		// always uses `baseTempoBPM`, never the live `currentTempoBPM`.
		return Math.round((ms / 1000) * (this.baseTempoBPM / 60) * TICKS_PER_BEAT);
	}
}

export { MIX_PARTS, VOICE_PARTS };
