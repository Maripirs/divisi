import { buildPlaybackMidi } from '../midi/playbackMidiBuilder.ts';
import { MIX_PARTS, VOICE_PARTS, type MixPart, type ParsedMIDI } from '../midi/types.ts';

const TICKS_PER_BEAT = 480; // must match `playbackMidiBuilder.ts`'s constant

// js-synthesizer ships as a plain UMD script (not an ES module — its WASM
// glue code isn't bundler-friendly, per the library's own README), loaded
// via <script> tags into `window.JSSynth` rather than `import`ed. `any` is
// deliberate here: this file is the vendor-integration boundary, not the
// portable algorithm core (that's `midi/`) — see the Android-portability
// reasoning carried over from the iOS app's plan.
//
// `AudioWorkletNodeSynthesizer` (not the plain `Synthesizer`) is the class
// actually used below — it runs FluidSynth's render loop on the dedicated
// audio-rendering thread via an AudioWorklet, rather than on the main
// thread via a `ScriptProcessorNode`. That matters because main-thread work
// (e.g. an OSMD re-render on a display-mode change) can stall a
// `ScriptProcessorNode`'s callback long enough to be audible; an
// AudioWorkletNode's `process()` runs regardless of main-thread load. See
// the backlog note this closed in `plan.md`.
declare global {
	interface Window {
		JSSynth: {
			waitForReady(): Promise<void>;
			AudioWorkletNodeSynthesizer: new () => JSSynthesizer;
			// Nested under `Constants` in the vendored bundle's export map
			// (`Constants: () => Constants_namespaceObject`, which holds
			// `PlayerSetTempoType`) — not a top-level `JSSynth` export.
			Constants: { PlayerSetTempoType: { Internal: 0; ExternalBpm: 1; ExternalMidi: 2 } };
		};
	}
}

interface JSSynthesizer {
	init(sampleRate: number): void;
	// No frame-count/buffer-size argument here (unlike the plain
	// `Synthesizer`'s `createAudioNode`) — the AudioWorklet's render
	// quantum is fixed by the browser, not something this library lets
	// callers tune.
	createAudioNode(context: AudioContext): AudioNode;
	loadSFont(bin: ArrayBuffer): Promise<number>;
	resetPlayer(): Promise<void>;
	addSMFDataToPlayer(bin: ArrayBuffer): Promise<void>;
	playPlayer(): Promise<void>;
	stopPlayer(): void;
	seekPlayer(ticks: number): void;
	midiControl(chan: number, ctrl: number, val: number): void;
	midiNoteOn(chan: number, key: number, vel: number): void;
	midiNoteOff(chan: number, key: number): void;
	midiProgramChange(chan: number, prognum: number): void;
	setPlayerTempo(tempoType: number, tempo: number): void;
	close(): void;
}

export const MIN_TEMPO_BPM = 40;
export const MAX_TEMPO_BPM = 240;

// F14: a MIDI channel reserved for `previewNote` (short single-note
// auditions when a note is selected/re-pitched in the editor). Kept well
// clear of the mixer buckets (`buildPlaybackMidi` assigns channels 0..n-1
// in `parsed.parts` order — SATB + accompaniment, plus any divisi desks)
// and off channel 9 (percussion). Not affected by the per-part mix.
const PREVIEW_CHANNEL = 15;
// Grand piano — a neutral voice for the audition regardless of what a
// score reload left on this channel.
const PREVIEW_PROGRAM = 0;

// Loaded onto the main thread as `window.JSSynth` — needed there for the
// `AudioWorkletNodeSynthesizer` constructor and `Constants`, even though
// the actual synthesis work happens on the worklet thread below.
const VENDOR_SCRIPTS = ['/vendor/libfluidsynth-2.4.6.js', '/vendor/js-synthesizer.js'];
// Registered into the AudioWorklet's own global scope via
// `audioWorklet.addModule()` (a separate JS environment from the main
// thread's `window` — the two `libfluidsynth-2.4.6.js` loads are not
// redundant). `js-synthesizer.worklet.js` self-registers the processor
// (`registerAudioWorkletProcessor()`) as soon as the module loads.
const WORKLET_MODULES = ['/vendor/libfluidsynth-2.4.6.js', '/vendor/js-synthesizer.worklet.js'];
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
 * live, using a WASM FluidSynth instance (via js-synthesizer's
 * `AudioWorkletNodeSynthesizer`, rendering on the audio thread rather than
 * the main thread) as the sound engine and the page's own `AudioContext`
 * clock as the single source of truth for playback position — never a
 * polled readout.
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
	// The synth's output is routed here rather than straight to
	// `context.destination`, then re-played through a real `<audio>` element
	// below — plain Web Audio API output gets suspended by iOS Safari the
	// moment the tab is backgrounded or the phone locks, since iOS only
	// grants continued background execution to genuine `HTMLMediaElement`
	// playback (the Media Session API's lock-screen controls need that same
	// real element to attach to; they don't grant background execution by
	// themselves).
	private readonly streamDestination: MediaStreamAudioDestinationNode;
	private readonly audioEl: HTMLAudioElement;
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
	// F14 note preview: the key currently sounding on `PREVIEW_CHANNEL` (so a
	// rapid re-preview can release it first) and its scheduled note-off.
	private previewKey: number | null = null;
	private previewOffTimer: ReturnType<typeof setTimeout> | null = null;
	private previewChannelReady = false;

	private constructor(
		context: AudioContext,
		synth: JSSynthesizer,
		streamDestination: MediaStreamAudioDestinationNode,
		audioEl: HTMLAudioElement
	) {
		this.context = context;
		this.synth = synth;
		this.streamDestination = streamDestination;
		this.audioEl = audioEl;
	}

	static async create(): Promise<MidiPlayer> {
		await loadVendorScripts();
		const context = new AudioContext();
		// Must happen before constructing the node below — these register
		// the processor into this context's own AudioWorklet global scope,
		// a separate environment per `AudioContext`.
		for (const url of WORKLET_MODULES) {
			await context.audioWorklet.addModule(url);
		}
		const synth = new window.JSSynth.AudioWorkletNodeSynthesizer();
		synth.init(context.sampleRate);
		const node = synth.createAudioNode(context);
		const streamDestination = context.createMediaStreamDestination();
		node.connect(streamDestination);

		// Not attached to the visible DOM tree (no layout/paint role — audio
		// only) but still appended to `document.body`, which some browsers
		// require for the background-audio/lock-screen allowances above to
		// actually apply.
		const audioEl = document.createElement('audio');
		audioEl.style.display = 'none';
		audioEl.setAttribute('playsinline', ''); // iOS Safari: never take over fullscreen
		audioEl.srcObject = streamDestination.stream;
		document.body.appendChild(audioEl);

		const soundfont = await fetch(SOUNDFONT_URL).then((r) => r.arrayBuffer());
		await synth.loadSFont(soundfont);

		return new MidiPlayer(context, synth, streamDestination, audioEl);
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
		// `resetPlayer` re-inits the synth's channel state, so the preview
		// channel's program/volume has to be re-sent on the next preview.
		this.previewChannelReady = false;
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
		// Both fired before any other await, so the `<audio>` element's
		// play() call still originates from the same user gesture that
		// invoked this method — iOS Safari's autoplay gate requires that,
		// not just that a gesture happened *somewhere* earlier in the chain.
		const resumeAudioEl = this.audioEl.play().catch(() => {});
		const resumeContext = this.context.state === 'suspended' ? this.context.resume() : Promise.resolve();
		await Promise.all([resumeAudioEl, resumeContext]);
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
		this.audioEl.pause();
		this.playing = false;
	}

	private stop(): void {
		if (this.destroyed) return;
		this.synth.stopPlayer();
		this.audioEl.pause();
		this.playing = false;
		this.pausedAtMs = 0;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.synth.stopPlayer();
		this.playing = false;
		this.pausedAtMs = 0;
		this.channelForPart = null;
		if (this.previewOffTimer) {
			clearTimeout(this.previewOffTimer);
			this.previewOffTimer = null;
		}
		if (this.previewKey !== null) {
			this.synth.midiNoteOff(PREVIEW_CHANNEL, this.previewKey);
			this.previewKey = null;
		}
		this.destroyed = true;
		this.audioEl.pause();
		this.audioEl.srcObject = null;
		this.audioEl.remove();
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

	/** F14: briefly sound a single note (default ~0.7 s) on the reserved
	 * preview channel, so a correction in the notation editor can be *heard*
	 * as it's selected or re-pitched — independent of transport state and the
	 * per-part mix. Re-calling before the previous note has released cuts it
	 * short and starts the new one. Resumes the audio graph from the caller's
	 * gesture (a click / key press), same as `play()` does. */
	previewNote(midi: number, durationMs = 700): void {
		if (this.destroyed) return;
		const key = Math.round(midi);
		if (key < 0 || key > 127) return;
		// Same gesture-time resume as `play()` — a preview can be the first
		// sound the page makes, before the transport has ever run.
		void this.audioEl.play().catch(() => {});
		if (this.context.state === 'suspended') void this.context.resume();
		if (!this.previewChannelReady) {
			this.synth.midiProgramChange(PREVIEW_CHANNEL, PREVIEW_PROGRAM);
			this.synth.midiControl(PREVIEW_CHANNEL, 7, 110);
			this.previewChannelReady = true;
		}
		if (this.previewOffTimer) {
			clearTimeout(this.previewOffTimer);
			this.previewOffTimer = null;
		}
		if (this.previewKey !== null) this.synth.midiNoteOff(PREVIEW_CHANNEL, this.previewKey);
		this.synth.midiNoteOn(PREVIEW_CHANNEL, key, 100);
		this.previewKey = key;
		this.previewOffTimer = setTimeout(() => {
			if (this.destroyed) return;
			this.synth.midiNoteOff(PREVIEW_CHANNEL, key);
			if (this.previewKey === key) this.previewKey = null;
			this.previewOffTimer = null;
		}, Math.max(50, durationMs));
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
