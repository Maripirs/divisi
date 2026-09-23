import { assignVoiceParts, splitChordalDivisi } from '../notation/voicePartAssignment.ts';
import {
	DEFAULT_TIME_SIGNATURE,
	type AmbiguousPart,
	type BackingNote,
	type MIDILyricEvent,
	type MIDINote,
	type MIDITimeSignature,
	type ParsedMIDI,
	type VoicePartInfo
} from '../midi/types.ts';

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEFAULT_TEMPO_BPM = 120; // same fallback as `midi/parser.ts`, for files with no tempo direction at all

/**
 * Parses a MusicXML (`<score-partwise>`) file into the same `ParsedMIDI`
 * shape `midi/parser.ts` produces, so everything downstream — the audio
 * player's `playbackMidiBuilder`, `musicXmlConverter`'s notation output —
 * works unchanged regardless of which parser produced the notes.
 *
 * Exists for pieces whose only clean source is a score export rather than a
 * well-behaved MIDI file. The motivating case (see `Frontend/plan.md`'s
 * log): "The Challenge of Thor"'s MIDI crams all parts + accompaniment onto
 * one track across 12 channels with no track names — undecodable by the
 * MIDI parser's per-track heuristic. Its MusicXML has one `<part>` per
 * staff instead, which is enough structure to resolve even though its part
 * *names* are just as useless ("Part 1".."Part 5", `print-object="no"`,
 * i.e. not even meant to be displayed) — see `readPart`'s `staffCount`
 * filtering below for how.
 *
 * `voicePartChannels` is always empty: that field only represents source
 * MIDI channel numbers. Playback still gets separate live mixer channels
 * because `playbackMidiBuilder` rebuilds a fresh MIDI blob from `notes` and
 * `backingNotes` regardless of source format.
 */
export function parseMusicXmlFile(xmlText: string): ParsedMIDI {
	const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
	if (doc.querySelector('parsererror')) {
		throw new Error(`Malformed MusicXML: ${doc.querySelector('parsererror')!.textContent}`);
	}

	const partList = [...doc.querySelectorAll('part-list > score-part')].map((el) => ({
		id: el.getAttribute('id') ?? '',
		name: el.querySelector('part-name')?.textContent?.trim() || null
	}));
	// A real-world export's tempo direction almost always lives on one part
	// only (usually the first) rather than being repeated on every part's
	// own stream, unlike `divisions`, which every part must declare for
	// itself. Pre-scanning across the whole document — first occurrence in
	// document order, i.e. whichever part has it — means every part starts
	// its own note-timing math from the same tempo instead of the parts
	// without their own direction silently falling back to
	// `DEFAULT_TEMPO_BPM` and racing ahead of/lagging the one that does.
	const scoreTempoAttr = doc.querySelector('part > measure > direction > sound[tempo]')?.getAttribute('tempo');
	const scoreTempoBPM = scoreTempoAttr ? Number(scoreTempoAttr) : DEFAULT_TEMPO_BPM;
	const rawParts = partList.map(({ id, name }) => readPart(doc, id, name, scoreTempoBPM));

	// Keep multi-staff parts (a grand staff — `<staves>` > 1 — is a
	// keyboard/harp/organ-style part) out of SATB assignment, then carry
	// their notes through as backing. This makes an unnamed export
	// resolvable without losing accompaniment: 4 vocal candidates map to
	// SATB, and the remaining part becomes the single mixer accompaniment
	// bucket.
	const candidates = rawParts.map((part) =>
		part.staffCount > 1 ? { name: null, pitches: [] } : { name: part.name, pitches: part.notes.map((n) => n.pitch) }
	);
	const { trackParts, parts, ambiguous } = assignVoiceParts(candidates);
	// Map the generic candidate-index shape back to this format's own
	// identity: the real `<score-part id="...">` value (already computed
	// above as `partList`) is what `musicxml/partNameRewriter.ts` needs to
	// find the right element to correct, and the raw part's own name (same
	// value `candidates` fed in, just re-read from `partList` for clarity)
	// is what the review UI shows for a human to recognize the part by.
	const ambiguousParts: AmbiguousPart[] = ambiguous.map((c) => ({
		partId: partList[c.index].id,
		name: partList[c.index].name,
		minPitch: c.minPitch,
		maxPitch: c.maxPitch,
		meanPitch: c.meanPitch
	}));
	// Accompaniment is always a single, unsplit bucket for everything
	// `assignVoiceParts` didn't confidently map to a voice — present even
	// when nothing ends up backing, so the mixer always has an
	// accompaniment row.
	const accompanimentPart: VoicePartInfo = { id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' };
	const allParts = [...parts, accompanimentPart];

	const notes: MIDINote[] = [];
	const backingNotes: BackingNote[] = [];
	const lyrics: MIDILyricEvent[] = [];
	for (const [index, raw] of rawParts.entries()) {
		const partId = trackParts[index];
		if (partId) {
			for (const note of raw.notes) notes.push({ ...note, partId });
			for (const lyric of raw.lyrics) lyrics.push({ ...lyric, partId });
		} else {
			for (const note of raw.notes) backingNotes.push(note);
		}
	}
	notes.sort((a, b) => a.startMs - b.startMs);
	backingNotes.sort((a, b) => a.startMs - b.startMs);
	lyrics.sort((a, b) => a.timeMs - b.timeMs);

	// Recover unnamed chord-based divisi (a plain SATB part whose notes still
	// stack into 2-voice chords per onset) into the same two-desk shape a
	// named split produces. `trackParts` above intentionally still reflects
	// the pre-split, part-level id (a chord-split part has no per-desk
	// source part to point at) -- not consumed anywhere outside these parser
	// files, so the imprecision is harmless. `voicePartChannels` is always
	// empty here regardless (MusicXML has no MIDI channel concept), so
	// there's nothing to reconcile there.
	const split = splitChordalDivisi(allParts, notes, lyrics);
	split.notes.sort((a, b) => a.startMs - b.startMs);
	split.lyrics.sort((a, b) => a.timeMs - b.timeMs);

	// First-occurrence-in-part-order wins — same simplification
	// `midi/parser.ts` already makes for these two fields (see its own doc
	// comment): a single steady time signature/key for the whole piece, not
	// a full change map. Tempo uses the same document-wide `scoreTempoBPM`
	// every part was seeded with above, rather than re-deriving from
	// per-part results, since most parts never carry their own direction.
	const keySignatureFifths = rawParts.map((p) => p.keySignatureFifths).find((v) => v != null) ?? 0;
	const timeSignature = rawParts.map((p) => p.timeSignature).find((v) => v != null) ?? DEFAULT_TIME_SIGNATURE;
	const tempoBPM = scoreTempoBPM;

	return {
		notes: split.notes,
		backingNotes,
		lyrics: split.lyrics,
		tempoBPM,
		timeSignature,
		keySignatureFifths,
		parts: split.parts,
		trackParts,
		voicePartChannels: {},
		ambiguousParts
	};
}

// MARK: - Per-part reading

interface RawNote {
	pitch: number;
	startMs: number;
	durationMs: number;
}

interface RawPart {
	name: string | null;
	/** Max `<staves>` declared anywhere in the part — >1 means a grand
	 * staff (keyboard-family instrument), used to exclude accompaniment
	 * parts before voice-part assignment. */
	staffCount: number;
	notes: RawNote[];
	lyrics: { text: string; timeMs: number }[];
	keySignatureFifths: number | null;
	timeSignature: MIDITimeSignature | null;
}

/**
 * Walks one `<part>`'s measures in document order, maintaining a single
 * time cursor per measure that `<backup>`/`<forward>` rewind/advance —
 * standard MusicXML multi-voice handling, since a part's several `<voice>`
 * streams (e.g. a divisi split notated on one staff) interleave by each
 * backing up to re-walk the measure from its start. A measure's notional
 * length — and so the next measure's starting position — is the *furthest*
 * any voice reached, not wherever the last `<backup>` left the cursor.
 *
 * Tied notes (`<tie type="start/stop">`, the sounding tie — not
 * `<notations><tied>`, which is only the visual slur) are merged into one
 * `RawNote` spanning both, matching how a MIDI file would represent the
 * same held note with no separate tie concept.
 */
function readPart(doc: Document, partId: string, name: string | null, initialTempoBPM: number): RawPart {
	const result: RawPart = {
		name,
		staffCount: 1,
		notes: [],
		lyrics: [],
		keySignatureFifths: null,
		timeSignature: null
	};

	const partEl = doc.querySelector(`part[id="${partId}"]`);
	if (!partEl) return result;

	let divisions = 1; // divisions-per-quarter-note; always set by a real file's first <attributes>
	let tempoBPM = initialTempoBPM;
	let measureStartMs = 0;
	// Open ties, keyed by "voice:pitch" -> the note being extended. A tie
	// chain (stop+start on the same note, continuing into a third note)
	// keeps re-pointing this at the *original* note, not the middle one.
	const openTies = new Map<string, RawNote>();
	let lastNoteStartMs = 0;

	const divisionsToMs = (durationDivisions: number) => (durationDivisions / divisions) * (60_000 / tempoBPM);

	for (const measure of partEl.querySelectorAll(':scope > measure')) {
		let cursorMs = measureStartMs;
		let measureEndMs = measureStartMs;

		for (const el of measure.children) {
			switch (el.tagName) {
				case 'attributes': {
					const divisionsText = el.querySelector(':scope > divisions')?.textContent;
					if (divisionsText) divisions = Number(divisionsText);
					const stavesText = el.querySelector(':scope > staves')?.textContent;
					if (stavesText) result.staffCount = Math.max(result.staffCount, Number(stavesText));
					const fifthsText = el.querySelector(':scope > key > fifths')?.textContent;
					if (fifthsText && result.keySignatureFifths === null) result.keySignatureFifths = Number(fifthsText);
					const beatsText = el.querySelector(':scope > time > beats')?.textContent;
					const beatTypeText = el.querySelector(':scope > time > beat-type')?.textContent;
					if (beatsText && beatTypeText && result.timeSignature === null) {
						result.timeSignature = { numerator: Number(beatsText), denominator: Number(beatTypeText) };
					}
					break;
				}
				case 'direction': {
					const tempoAttr = el.querySelector(':scope > sound[tempo]')?.getAttribute('tempo');
					if (tempoAttr) tempoBPM = Number(tempoAttr);
					break;
				}
				case 'backup': {
					const duration = Number(el.querySelector(':scope > duration')?.textContent ?? '0');
					cursorMs -= divisionsToMs(duration);
					break;
				}
				case 'forward': {
					const duration = Number(el.querySelector(':scope > duration')?.textContent ?? '0');
					cursorMs += divisionsToMs(duration);
					measureEndMs = Math.max(measureEndMs, cursorMs);
					break;
				}
				case 'note': {
					const isChord = el.querySelector(':scope > chord') !== null;
					const isRest = el.querySelector(':scope > rest') !== null;
					const isGrace = el.querySelector(':scope > grace') !== null;
					const voice = el.querySelector(':scope > voice')?.textContent ?? '1';
					const durationMs = divisionsToMs(Number(el.querySelector(':scope > duration')?.textContent ?? '0'));
					const startMs = isChord ? lastNoteStartMs : cursorMs;

					const pitchEl = el.querySelector(':scope > pitch');
					if (!isRest && !isGrace && pitchEl) {
						const step = pitchEl.querySelector(':scope > step')?.textContent ?? 'C';
						const alter = Number(pitchEl.querySelector(':scope > alter')?.textContent ?? '0');
						const octave = Number(pitchEl.querySelector(':scope > octave')?.textContent ?? '4');
						const pitch = (octave + 1) * 12 + (STEP_SEMITONES[step] ?? 0) + alter;

						const tieTypes = [...el.querySelectorAll(':scope > tie')].map((t) => t.getAttribute('type'));
						const tieKey = `${voice}:${pitch}`;
						const openNote = tieTypes.includes('stop') ? openTies.get(tieKey) : undefined;

						let note: RawNote;
						if (openNote) {
							openNote.durationMs += durationMs;
							note = openNote;
						} else {
							note = { pitch, startMs, durationMs };
							result.notes.push(note);
						}

						if (tieTypes.includes('start')) openTies.set(tieKey, note);
						else openTies.delete(tieKey);

						for (const lyricText of el.querySelectorAll(':scope > lyric > text')) {
							if (lyricText.textContent) result.lyrics.push({ text: lyricText.textContent, timeMs: startMs });
						}
					}

					lastNoteStartMs = startMs;
					if (!isChord && !isGrace) {
						cursorMs += durationMs;
						measureEndMs = Math.max(measureEndMs, cursorMs);
					}
					break;
				}
				default:
					break;
			}
		}
		measureStartMs = measureEndMs;
	}

	return result;
}
