// Ported from the iOS app's `MIDIModels.swift` (see the paused root `plan.md`) —
// same shapes, same reasoning, now in TS so it runs client-side in the browser.

/** One of the four SATB voice parts a track can be mapped to.
 *
 * Ordered high→low so the array index can drive the mean-pitch fallback
 * ranking in `parser.ts` directly, same as the Swift `CaseIterable` order did.
 */
export const VOICE_PARTS = ['soprano', 'alto', 'tenor', 'bass'] as const;
export type VoicePart = (typeof VOICE_PARTS)[number];

/** The five *base* mixer buckets every parsed piece is built from before any
 * divisi-desk splitting: the four SATB voices plus one collapsed
 * accompaniment bucket for anything that is not a vocal staff/track. Fixed
 * and file-independent — this is what account-wide state
 * (`playerDefaults.ts`, the Settings page's default-voice picker) is keyed
 * by, since "I sing soprano" doesn't depend on which file is open. Contrast
 * with `MixPart` below, which is the per-file, possibly-split id a specific
 * piece actually mixes by. */
export const MIX_PARTS = [...VOICE_PARTS, 'accompaniment'] as const;
export type MixBase = (typeof MIX_PARTS)[number];

/** A mixer bucket's identity within one *parsed* piece. Not a fixed set —
 * `'soprano'` for a file that doesn't split that voice, `'soprano-1'`/
 * `'soprano-2'` for one that does (see `notation/voicePartAssignment.ts`),
 * or `'accompaniment'`. `ParsedMIDI.parts` is the source of truth for which
 * ids exist in a given piece; this alias just makes `Record<MixPart, X>`
 * read clearly at the (many) call sites keyed by mixer bucket. */
export type MixPart = string;

/** One mixer bucket's fixed metadata for one parsed piece: which base voice
 * it belongs to, its divisi-desk number when the file splits that voice,
 * and the label to show in the UI. Always present, even for a file that
 * splits nothing — then every base has exactly one `VoicePartInfo` with
 * `subIndex` undefined and `id === base`, so an unsplit file's mixer looks
 * identical to how it did before divisi-desk detection existed.
 * `ParsedMIDI.parts` orders these canonically: S->A->T->B, ascending desk
 * number within a voice, accompaniment last — UI iterates it directly for
 * mixer-row order instead of re-sorting. */
export interface VoicePartInfo {
	id: MixPart;
	base: MixBase;
	subIndex?: number;
	label: string;
	/** True only for a desk `splitChordalDivisi` created by detecting a real
	 * chordal onset within an unnamed voice part, never set for a desk the
	 * source file named itself (e.g. real "Soprano 1"/"Soprano 2" tracks or
	 * parts, resolved by `assignVoiceParts`). Both shapes produce an
	 * identical `${base}-1`/`${base}-2` pair otherwise, so this is what lets
	 * `mergeSplitDesksForDisplay` (`notation/voicePartAssignment.ts`) tell
	 * "audio-only auto-split, merge back for display" apart from "the file
	 * wrote two real staves on purpose, leave them alone". */
	autoSplit?: true;
}

/** How the score view presents the four voice parts relative to whichever
 * one is currently chosen. Independent of what audio plays — playback
 * always plays the full mix regardless of display mode; only what's drawn
 * on screen changes. */
export const DISPLAY_MODES = ['flat', 'highlighted', 'solo', 'custom'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export const VISUAL_STATES = ['off', 'muted', 'active'] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

/** How the four mixer buckets are balanced against each other for
 * *playback* — the audio counterpart to `DisplayMode`. `'custom'` is the
 * only mode where the per-part volume sliders are shown; the other three
 * are one-tap presets that set every bucket's volume at once. */
export const MIX_MODES = ['everyone', 'minusMe', 'mostlyMe', 'custom'] as const;
export type MixMode = (typeof MIX_MODES)[number];

/** A single sung note, already resolved to a mixer bucket and to
 * milliseconds (tempo-map applied — see `parser.ts`). */
export interface MIDINote {
	pitch: number; // MIDI note number, 0-127
	startMs: number;
	durationMs: number;
	partId: MixPart;
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
	partId: MixPart;
}

/** A track/part with real notes that `notation/voicePartAssignment.ts`'s
 * `assignVoiceParts` couldn't confidently map to a voice part -- the review
 * flow (`piece/[id]/review`) surfaces these for a human to confirm before a
 * version can be approved, rather than letting them silently fall into the
 * Accompaniment bucket the way the motivating bug did (see that file's own
 * module doc comment). */
export interface AmbiguousPart {
	/** MusicXML: the `<score-part>` id (used as the rewrite target via
	 * `musicxml/partNameRewriter.ts`). MIDI: the track index as a string --
	 * informational only, no write-back UI consumes this yet (MIDI
	 * track-name rewriting needs real binary surgery, out of scope here). */
	partId: string;
	name: string | null;
	minPitch: number;
	maxPitch: number;
	meanPitch: number;
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
	/** Every mixer bucket this piece resolved to, canonically ordered — see
	 * `VoicePartInfo`. The source of truth for how many rows the mixer UI
	 * shows and what each is called; always includes exactly one
	 * accompaniment entry, even when `backingNotes` is empty. */
	parts: VoicePartInfo[];
	/** Regular MIDI track index -> the `VoicePartInfo.id` its notes were
	 * resolved to, using the same mapping that produced `notes`/`lyrics`. */
	trackParts: Record<number, MixPart>;
	/** Mixer-bucket id -> the MIDI channel number(s) its notes were on
	 * (almost always exactly one, but a part could in principle span more
	 * than one channel). The audio player uses this to send a live CC7
	 * (channel volume) message to the right channel(s) for the balance
	 * slider — the synth plays the whole file as one unit (accurate,
	 * sample-scheduled by FluidSynth itself), so per-part volume has to be
	 * a live MIDI control message rather than a separate mixer node. */
	voicePartChannels: Partial<Record<MixPart, number[]>>;
	/** Every candidate `assignVoiceParts` couldn't confidently place -- see
	 * `AmbiguousPart`'s own doc comment. Empty for a file where every real
	 * vocal candidate was either name-matched or covered by the mean-pitch
	 * fallback. */
	ambiguousParts: AmbiguousPart[];
}
