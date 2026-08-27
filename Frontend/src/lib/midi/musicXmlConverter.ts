import {
	MIX_PARTS,
	VOICE_PARTS,
	type MIDINote,
	type MIDITimeSignature,
	type MixPart,
	type ParsedMIDI,
	type VisualState,
	type VoicePart
} from './types.ts';

/**
 * Converts one voice part's notes from `ParsedMIDI` into a MusicXML document
 * that OpenSheetMusicDisplay can render. Ported from the iOS app's
 * `MusicXMLConverter.swift` — same quantization/tie/measure algorithm, same
 * known limitations (see below), now running client-side.
 *
 * MIDI only carries millisecond timing, not a written rhythm, so this
 * quantizes every note's start/duration onto a fixed sixteenth-note grid
 * derived from the file's initial tempo — the "fixed grid snap" approach.
 * That's a real simplification: genuinely free/expressive timing, or a file
 * with tempo/meter changes mid-piece, can come out misnotated. It covers the
 * steady-tempo choral repertoire this app targets.
 *
 * Pitch spelling (sharps vs. flats) is a flat lookup table picked by the
 * sign of the key signature's fifths count, not a real harmonic-spelling
 * algorithm — so a chromatic accidental can come out enharmonically "wrong"
 * even though the pitch itself is correct. Good enough to read from, not
 * concert-hall-accurate.
 */
export class NoNotesForVoicePartError extends Error {
	constructor(voicePart: VoicePart) {
		super(`No notes for voice part: ${voicePart}`);
	}
}

/** One grid unit = a sixteenth note = one MusicXML `<divisions>` tick
 * (divisions is fixed at 4 per quarter note below, so a unit count *is* a
 * MusicXML duration value directly — no rescaling needed). */
const UNITS_PER_WHOLE_NOTE = 16;
const DIVISIONS_PER_QUARTER = 4;

export interface ConvertResult {
	xml: string;
	/** How many milliseconds of real time correspond to one whole note at
	 * this file's tempo. OSMD's cursor iterator reports its position as a
	 * timestamp in whole notes (`cursor.iterator.currentTimeStamp`), so the
	 * player converts `currentPositionMs / msPerWholeNote` to drive it — a
	 * continuous mapping, not a per-note lookup table, so it works the same
	 * whether one part or all four are on screen. */
	msPerWholeNote: number;
}

/** Fallback color applied to non-selected notes in highlighted mode
 * — a standard MusicXML `color` attribute, which OSMD renders natively (see
 * `noteXML`). Callers can override it to match the active app theme. */
export const MUTED_NOTE_COLOR = '#686b7a';

export function convert(parsed: ParsedMIDI, voicePart: VoicePart): ConvertResult {
	const notes = notesFor(parsed, voicePart);
	if (notes.length === 0) throw new NoNotesForVoicePartError(voicePart);

	const unitMs = msPerUnit(parsed.tempoBPM);
	const unitsPerMeasure = unitsPerMeasureFor(parsed.timeSignature);
	const measureUnitSpans = measuresFor(notes, unitMs, unitsPerMeasure);
	const useFlats = parsed.keySignatureFifths < 0;
	const attributes = attributesXML(parsed.timeSignature, parsed.keySignatureFifths, voicePart);

	const body = bodyXML(measureUnitSpans, useFlats, attributes);
	const xml = scoreXML([{ id: 'P1', name: capitalize(voicePart), body }]);
	return { xml, msPerWholeNote: unitMs * UNITS_PER_WHOLE_NOTE };
}

/**
 * Converts all four voice parts into one multi-part score, one `<part>` per
 * voice in SATB order, all padded to the same shared measure count so
 * barlines line up vertically across staves — needed for the flat and
 * highlighted display modes, where every part is visible at once. A part
 * with no notes at all in the file still gets its full share of rest-only
 * measures rather than being omitted, so every mode shows a consistent SATB
 * grid regardless of what a given file actually uses. `convertAllParts`
 * is now a preset wrapper around `convertVisualParts`, which can omit
 * hidden voices and tint muted voices with the active theme color.
 */
export function convertAllParts(parsed: ParsedMIDI, highlightedPart?: VoicePart, mutedNoteColor = MUTED_NOTE_COLOR): ConvertResult {
	const visualStates = Object.fromEntries(
		MIX_PARTS.map((voicePart) => [
			voicePart,
			highlightedPart && voicePart !== highlightedPart ? 'muted' : 'active'
		])
	) as Record<MixPart, VisualState>;
	return convertVisualParts(parsed, visualStates, mutedNoteColor);
}

export function convertVisualParts(
	parsed: ParsedMIDI,
	visualStates: Record<MixPart, VisualState>,
	mutedNoteColor = MUTED_NOTE_COLOR
): ConvertResult {
	const unitMs = msPerUnit(parsed.tempoBPM);
	const unitsPerMeasure = unitsPerMeasureFor(parsed.timeSignature);
	const useFlats = parsed.keySignatureFifths < 0;
	const visibleParts = MIX_PARTS.filter((part) => visualStates[part] !== 'off');

	if (visibleParts.length === 0) throw new Error('No visible voice parts selected.');

	const measureUnitSpansByPart = new Map<MixPart, MeasurePiece[][]>();
	for (const part of visibleParts) {
		const notes = notesForPart(parsed, part);
		measureUnitSpansByPart.set(part, measuresFor(notes, unitMs, unitsPerMeasure));
	}

	const sharedMeasureCount = Math.max(1, ...[...measureUnitSpansByPart.values()].map((m) => m.length));
	const restMeasure: MeasurePiece[] = [
		{ durationUnits: unitsPerMeasure, pitches: null, continuesFromPrevious: false, continuesToNext: false }
	];
	for (const part of visibleParts) {
		const spans = measureUnitSpansByPart.get(part)!;
		while (spans.length < sharedMeasureCount) spans.push(restMeasure);
	}

	const parts = visibleParts.map((part, index) => {
		const attributes = attributesXML(parsed.timeSignature, parsed.keySignatureFifths, part);
		const color = visualStates[part] === 'muted' ? mutedNoteColor : undefined;
		const body = bodyXML(measureUnitSpansByPart.get(part)!, useFlats, attributes, color);
		return { id: `P${index + 1}`, name: partLabel(part), body };
	});

	return { xml: scoreXML(parts), msPerWholeNote: unitMs * UNITS_PER_WHOLE_NOTE };
}

function notesFor(parsed: ParsedMIDI, voicePart: VoicePart): MIDINote[] {
	return parsed.notes.filter((n) => n.voicePart === voicePart).sort((a, b) => a.startMs - b.startMs);
}

type TimedNote = Pick<MIDINote, 'pitch' | 'startMs' | 'durationMs'>;

function notesForPart(parsed: ParsedMIDI, part: MixPart): TimedNote[] {
	if (part !== 'accompaniment') return notesFor(parsed, part);
	return parsed.backingNotes;
}

function msPerUnit(tempoBPM: number): number {
	return 60_000 / tempoBPM / DIVISIONS_PER_QUARTER;
}

function unitsPerMeasureFor(timeSignature: MIDITimeSignature): number {
	return timeSignature.numerator * (UNITS_PER_WHOLE_NOTE / timeSignature.denominator);
}

function measuresFor(notes: TimedNote[], unitMs: number, unitsPerMeasure: number): MeasurePiece[][] {
	const timeline = buildTimeline(notes, unitMs, unitsPerMeasure);
	return splitAtMeasureBoundaries(timeline, unitsPerMeasure);
}

function partLabel(part: MixPart): string {
	if (part === 'accompaniment') return 'Accomp.';
	return capitalize(part);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// MARK: - Grid quantization

interface GridEvent {
	startUnit: number;
	durationUnits: number;
	pitches: number[] | null; // null = rest; multiple pitches = MusicXML chord
}

/**
 * Snaps each note to the nearest grid unit, then fills every gap between
 * notes (including before the first one) with a rest so the whole part is a
 * contiguous, gap-free timeline — MusicXML has no concept of silent/
 * undefined time within a measure. Also pads a final trailing rest so the
 * last measure comes out full: a file's closing beats of silence are rarely
 * a real MIDI event (nothing follows to end them against), so without this
 * the last measure would fall short of `unitsPerMeasure` and mis-justify in
 * notation software.
 */
function buildTimeline(notes: TimedNote[], unitMs: number, unitsPerMeasure: number): GridEvent[] {
	const notesByStartUnit = new Map<number, { endUnit: number; pitch: number }[]>();
	for (const note of notes) {
		const startUnit = Math.round(note.startMs / unitMs);
		const endUnit = Math.max(Math.round((note.startMs + note.durationMs) / unitMs), startUnit + 1);
		const existing = notesByStartUnit.get(startUnit);
		if (existing) existing.push({ endUnit, pitch: note.pitch });
		else notesByStartUnit.set(startUnit, [{ endUnit, pitch: note.pitch }]);
	}

	const quantized: { startUnit: number; endUnit: number; pitches: number[] }[] = [];
	let cursor = 0;
	for (const [rawStartUnit, onsetNotes] of [...notesByStartUnit.entries()].sort(([a], [b]) => a - b)) {
		let startUnit = rawStartUnit;
		let endUnit = Math.max(...onsetNotes.map((note) => note.endUnit));
		// Rounding two adjacent onsets onto a tiny negative gap can make
		// them overlap. Clamp whole onsets, not individual notes, so notes
		// that genuinely start together can remain a displayed chord.
		startUnit = Math.max(startUnit, cursor);
		endUnit = Math.max(endUnit, startUnit + 1);
		const pitches = [...new Set(onsetNotes.map((note) => note.pitch))].sort((a, b) => a - b);
		quantized.push({ startUnit, endUnit, pitches });
		cursor = endUnit;
	}

	const timeline: GridEvent[] = [];
	let unitCursor = 0;
	for (const note of quantized) {
		if (note.startUnit > unitCursor) {
			timeline.push({ startUnit: unitCursor, durationUnits: note.startUnit - unitCursor, pitches: null });
		}
		timeline.push({ startUnit: note.startUnit, durationUnits: note.endUnit - note.startUnit, pitches: note.pitches });
		unitCursor = note.endUnit;
	}

	const remainder = unitCursor % unitsPerMeasure;
	if (remainder !== 0) {
		timeline.push({ startUnit: unitCursor, durationUnits: unitsPerMeasure - remainder, pitches: null });
	}
	return timeline;
}

/** One measure-local fragment of a `GridEvent`, after splitting at
 * barlines. `continuesFromPrevious`/`continuesToNext` mark whether this
 * fragment is tied to a sibling fragment of the *same original event* on
 * either side (always false for rests — tying rests is meaningless). */
interface MeasurePiece {
	durationUnits: number;
	pitches: number[] | null;
	continuesFromPrevious: boolean;
	continuesToNext: boolean;
}

/**
 * Splits any event that straddles a measure boundary into two (or more)
 * pieces at that boundary, and groups the result by measure — MusicXML
 * can't represent a single `<note>` crossing a barline, only two tied notes
 * either side of it.
 */
function splitAtMeasureBoundaries(timeline: GridEvent[], unitsPerMeasure: number): MeasurePiece[][] {
	const measures: MeasurePiece[][] = [[]];
	let measureStart = 0;

	for (const event of timeline) {
		// How many barline-crossing pieces this event will produce, given
		// where the measure boundary currently sits — computed up front so
		// each piece emitted below can know whether a later piece of the
		// same event follows, for tie continuation.
		const totalPieces = pieceCount(event.startUnit, event.durationUnits, measureStart, unitsPerMeasure);
		const isNote = event.pitches !== null;

		let remainingStart = event.startUnit;
		let remainingDuration = event.durationUnits;
		let pieceIndex = 0;
		while (remainingDuration > 0) {
			const measureEnd = measureStart + unitsPerMeasure;
			const roomInMeasure = measureEnd - remainingStart;
			const pieceDuration = Math.min(remainingDuration, roomInMeasure);
			measures[measures.length - 1].push({
				durationUnits: pieceDuration,
				pitches: event.pitches,
				continuesFromPrevious: isNote && pieceIndex > 0,
				continuesToNext: isNote && pieceIndex < totalPieces - 1
			});
			remainingStart += pieceDuration;
			remainingDuration -= pieceDuration;
			pieceIndex += 1;
			if (remainingStart >= measureEnd) {
				measureStart = measureEnd;
				measures.push([]);
			}
		}
	}
	if (measures.length > 0 && measures[measures.length - 1].length === 0) measures.pop();
	return measures;
}

/** Dry-run of the splitting loop above that only counts how many
 * barline-crossing pieces `duration` units starting at `start` would
 * produce — used as a look-ahead so tie-continuation flags can be set in a
 * single real pass. */
function pieceCount(start: number, duration: number, measureStart: number, unitsPerMeasure: number): number {
	let remainingStart = start;
	let remainingDuration = duration;
	let boundary = measureStart;
	let count = 0;
	while (remainingDuration > 0) {
		const measureEnd = boundary + unitsPerMeasure;
		const pieceDuration = Math.min(remainingDuration, measureEnd - remainingStart);
		remainingStart += pieceDuration;
		remainingDuration -= pieceDuration;
		count += 1;
		if (remainingStart >= measureEnd) boundary = measureEnd;
	}
	return count;
}

// MARK: - Rhythm decomposition

interface Chunk {
	units: number;
	type: string;
	dots: number;
}

/** Table of every plain/dotted note value expressible on a sixteenth-note
 * grid within one whole note, largest first, so the greedy decomposition
 * below prefers the fewest/simplest tied fragments. */
const VALUE_TABLE: { units: number; type: string; dots: number }[] = [
	{ units: 16, type: 'whole', dots: 0 },
	{ units: 12, type: 'half', dots: 1 },
	{ units: 8, type: 'half', dots: 0 },
	{ units: 6, type: 'quarter', dots: 1 },
	{ units: 4, type: 'quarter', dots: 0 },
	{ units: 3, type: 'eighth', dots: 1 },
	{ units: 2, type: 'eighth', dots: 0 },
	{ units: 1, type: '16th', dots: 0 }
];

/** Greedily breaks a unit count into standard note values, largest first.
 * Always terminates (the table includes 1) and never produces a remainder,
 * though an odd unit count (e.g. 5 = quarter + 16th) ties across the split
 * rather than picking a beat-aware grouping — a known simplification, see
 * this file's top-level doc comment. */
function decompose(units: number): Chunk[] {
	let remaining = units;
	const chunks: Chunk[] = [];
	while (remaining > 0) {
		const value = VALUE_TABLE.find((v) => v.units <= remaining);
		if (!value) break;
		chunks.push({ units: value.units, type: value.type, dots: value.dots });
		remaining -= value.units;
	}
	return chunks;
}

// MARK: - XML emission

function attributesXML(timeSignature: MIDITimeSignature, keySignatureFifths: number, part: MixPart): string {
	let clefSign: string;
	let clefLine: number;
	let clefOctaveChange: number | null;
	switch (part) {
		case 'soprano':
		case 'alto':
			clefSign = 'G';
			clefLine = 2;
			clefOctaveChange = null;
			break;
		case 'tenor':
			clefSign = 'G';
			clefLine = 2;
			clefOctaveChange = -1; // vocal tenor clef
			break;
		case 'bass':
		case 'accompaniment':
			clefSign = 'F';
			clefLine = 4;
			clefOctaveChange = null;
			break;
	}
	const octaveChangeXML =
		clefOctaveChange !== null ? `\n        <clef-octave-change>${clefOctaveChange}</clef-octave-change>` : '';
	return `      <attributes>
        <divisions>${DIVISIONS_PER_QUARTER}</divisions>
        <key>
          <fifths>${keySignatureFifths}</fifths>
        </key>
        <time>
          <beats>${timeSignature.numerator}</beats>
          <beat-type>${timeSignature.denominator}</beat-type>
        </time>
        <clef>
          <sign>${clefSign}</sign>
          <line>${clefLine}</line>${octaveChangeXML}
        </clef>
      </attributes>
`;
}

/** Sharp/flat spelling per pitch class (index 0 = C), selected by the key
 * signature's sign — see this file's top-level doc comment on the limits of
 * this approach. */
const SHARP_STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const SHARP_ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
const FLAT_STEPS = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];
const FLAT_ALTERS = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];

function noteXML(
	pitch: number | null,
	chunk: Chunk,
	useFlats: boolean,
	tieStart: boolean,
	tieStop: boolean,
	color?: string,
	isChord = false
): string {
	const dotsXML = '\n          <dot/>'.repeat(chunk.dots);
	const chordXML = isChord ? '        <chord/>\n' : '';
	let pitchOrRestXML: string;
	if (pitch !== null) {
		const pitchClass = pitch % 12;
		const octave = Math.floor(pitch / 12) - 1;
		const steps = useFlats ? FLAT_STEPS : SHARP_STEPS;
		const alters = useFlats ? FLAT_ALTERS : SHARP_ALTERS;
		const step = steps[pitchClass];
		const alter = alters[pitchClass];
		const alterXML = alter !== 0 ? `\n          <alter>${alter}</alter>` : '';
		pitchOrRestXML = `      <pitch>
        <step>${step}</step>${alterXML}
        <octave>${octave}</octave>
      </pitch>`;
	} else {
		pitchOrRestXML = '      <rest/>';
	}

	// MusicXML needs both: <tie> is the playback-level tie, <notations>
	// <tied> is what actually draws the tie curve.
	let tieXML = '';
	let tiedNotationsXML = '';
	if (tieStop) {
		tieXML += '\n        <tie type="stop"/>';
		tiedNotationsXML += '\n            <tied type="stop"/>';
	}
	if (tieStart) {
		tieXML += '\n        <tie type="start"/>';
		tiedNotationsXML += '\n            <tied type="start"/>';
	}
	const notationsXML = tiedNotationsXML ? `\n          <notations>${tiedNotationsXML}\n          </notations>` : '';
	// `color` is a standard MusicXML attribute (present on <note> and
	// several other elements) that OSMD honors directly when rendering —
	// no custom CSS/JS needed for the "highlighted" display mode's
	// notehead tinting.
	const colorAttrXML = color ? ` color="${color}"` : '';

	return `      <note${colorAttrXML}>
${chordXML}${pitchOrRestXML}
        <duration>${chunk.units}</duration>${tieXML}
        <type>${chunk.type}</type>${dotsXML}${notationsXML}
      </note>
`;
}

/** Emits one part's `<measure>` elements, shared between the single-part
 * and multi-part conversions. `color`, when given, tints this part's
 * rendered symbols for muted/custom display modes. */
function bodyXML(measureUnitSpans: MeasurePiece[][], useFlats: boolean, firstMeasureAttributesXML: string, color?: string): string {
	let body = '';
	measureUnitSpans.forEach((measureEvents, measureIndex) => {
		body += `    <measure number="${measureIndex + 1}">\n`;
		if (measureIndex === 0) body += firstMeasureAttributesXML;
		for (const piece of measureEvents) {
			const chunks = decompose(piece.durationUnits);
			const isNote = piece.pitches !== null;
			chunks.forEach((chunk, chunkIndex) => {
				// A chunk needs a tie to its neighbor whenever there's a
				// sounding note on both sides of the split — either
				// because `decompose` broke one piece into several notated
				// fragments, or because this piece itself is a
				// measure-boundary fragment of a longer original note.
				const tieStop = isNote && (chunkIndex > 0 || piece.continuesFromPrevious);
				const tieStart = isNote && (chunkIndex < chunks.length - 1 || piece.continuesToNext);
				if (piece.pitches) {
					piece.pitches.forEach((pitch, pitchIndex) => {
						body += noteXML(pitch, chunk, useFlats, tieStart, tieStop, color, pitchIndex > 0);
					});
				} else {
					body += noteXML(null, chunk, useFlats, false, false, color);
				}
			});
		}
		body += '    </measure>\n';
	});
	return body;
}

function scoreXML(parts: { id: string; name: string; body: string }[]): string {
	const scorePartsXML = parts
		.map((part) => `    <score-part id="${part.id}">\n      <part-name>${part.name}</part-name>\n    </score-part>\n`)
		.join('');
	const partsXML = parts.map((part) => `  <part id="${part.id}">\n${part.body}  </part>\n`).join('');
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
${scorePartsXML}  </part-list>
${partsXML}</score-partwise>`;
}
