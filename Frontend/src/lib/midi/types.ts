// Ported from the iOS app's `MIDIModels.swift` (see the paused root `plan.md`) —
// same shapes, same reasoning, now in TS so it runs client-side in the browser.

/** One of the four SATB voice parts a track can be mapped to.
 *
 * Ordered high→low so the array index can drive the mean-pitch fallback
 * ranking in `parser.ts` directly, same as the Swift `CaseIterable` order did.
 */
export const VOICE_PARTS = ['soprano', 'alto', 'tenor', 'bass'] as const;
export type VoicePart = (typeof VOICE_PARTS)[number];

/** Mixer buckets. The four SATB parts stay individually controllable, while
 * anything that is not a vocal staff/track is collapsed into one
 * accompaniment bucket. */
export const MIX_PARTS = [...VOICE_PARTS, 'accompaniment'] as const;
export type MixPart = (typeof MIX_PARTS)[number];

/** How the score view presents the four voice parts relative to whichever
 * one is currently chosen. Independent of what audio plays — playback
 * always plays the full mix regardless of display mode; only what's drawn
 * on screen changes. */
export const DISPLAY_MODES = ['flat', 'highlighted', 'solo', 'custom'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const VISUAL_STATES = ['off', 'muted', 'active'] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

/** A single sung note, already resolved to a voice part and to milliseconds
 * (tempo-map applied — see `parser.ts`). */
export interface MIDINote {
	pitch: number; // MIDI note number, 0-127
	startMs: number;
	durationMs: number;
	voicePart: VoicePart;
}

/** A note that belongs to accompaniment or another non-SATB source. These
 * notes play back as one collapsed mixer bucket and can be rendered as a
 * simplified accompaniment cue staff in the practice score. */
export interface BackingNote {
	pitch: number;
	startMs: number;
	durationMs: number;
}

/** A lyric syllable/word, timestamped to when its note starts. */
export interface MIDILyricEvent {
	text: string;
	timeMs: number;
	voicePart: VoicePart;
}

/** A MIDI time-signature meta-event's payload: `numerator` beats of
 * `denominator` note value per measure (e.g. 4/4, 6/8). */
export interface MIDITimeSignature {
	numerator: number;
	denominator: number;
}

/** Common-practice default when a file has no time-signature meta-event
 * (rare, but not worth failing over) — 4/4 is the overwhelmingly likely
 * case for the choral repertoire this app targets. */
export const DEFAULT_TIME_SIGNATURE: MIDITimeSignature = { numerator: 4, denominator: 4 };

/** The result of parsing one MIDI or MusicXML file: every note and lyric
 * event across tracks/parts that were successfully mapped to a voice part,
 * plus one collapsed accompaniment bucket for anything intentionally kept
 * out of SATB assignment.
 *
 * `tempoBPM`/`timeSignature`/`keySignatureFifths` are the file's *initial*
 * values only — mid-file tempo/meter/key changes aren't tracked. That's
 * consistent with the rhythm quantizer's fixed-grid-snap approach (see
 * `musicXmlConverter.ts`): both assume a single steady grid for the whole
 * piece, which covers the choral repertoire this app targets but not
 * pieces with meter/tempo changes.
 */
export interface ParsedMIDI {
	notes: MIDINote[];
	backingNotes: BackingNote[];
	lyrics: MIDILyricEvent[];
	tempoBPM: number;
	timeSignature: MIDITimeSignature;
	/** Signed count of sharps (positive) or flats (negative) in the initial
	 * key signature. 0 (C major/A minor) when absent. */
	keySignatureFifths: number;
	/** Regular MIDI track index -> SATB voice part, using the same mapping
	 * that produced `notes`/`lyrics`. */
	trackVoiceParts: Record<number, VoicePart>;
	/** SATB voice part -> the MIDI channel number(s) its notes were on
	 * (almost always exactly one, but a part could in principle span more
	 * than one channel). The audio player uses this to send a live CC7
	 * (channel volume) message to the right channel(s) for the balance
	 * slider — the synth plays the whole file as one unit (accurate,
	 * sample-scheduled by FluidSynth itself), so per-part volume has to be
	 * a live MIDI control message rather than a separate mixer node. */
	voicePartChannels: Partial<Record<VoicePart, number[]>>;
}
