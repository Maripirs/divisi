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
	close(): void;
}

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
	private tempoBPM = 120;
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
		this.tempoBPM = parsed.tempoBPM;
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
	}

	async play(): Promise<void> {
		if (this.destroyed) return;
		if (this.playing) return;
		if (this.context.state === 'suspended') await this.context.resume();
		this.synth.seekPlayer(this.msToTick(this.pausedAtMs));
		await this.synth.playPlayer();
		this.startContextTime = this.context.currentTime - this.pausedAtMs / 1000;
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
			this.startContextTime = this.context.currentTime - clamped / 1000;
		}
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

	/** Current playback position in ms, read directly off the
	 * `AudioContext` clock while playing — never a polled value. */
	get positionMs(): number {
		if (!this.playing) return this.pausedAtMs;
		const elapsed = (this.context.currentTime - this.startContextTime) * 1000;
		return Math.min(this.durationMs, Math.max(0, elapsed));
	}

	get duration(): number {
		return this.durationMs;
	}

	private msToTick(ms: number): number {
		// `channelForPart` is only set once a piece is loaded; tempo is
		// baked into the built MIDI at `TICKS_PER_BEAT` — see
		// `playbackMidiBuilder.ts`. Recomputed from `tempoBPM` stashed at
		// load time.
		return Math.round((ms / 1000) * (this.tempoBPM / 60) * TICKS_PER_BEAT);
	}
}

export { MIX_PARTS, VOICE_PARTS };
