import { VOICE_PARTS, type MIDILyricEvent, type MIDINote, type VoicePart, type VoicePartInfo } from '../midi/types.ts';

/**
 * Maps a track/part's name and note pitches to a voice part — and, when the
 * file itself names a divisi split ("Soprano 1"/"Soprano 2"), to a
 * *specific* desk within that voice rather than collapsing them together.
 * Format-agnostic on purpose — originally written for `midi/parser.ts`'s
 * MIDI tracks, now shared with `musicxml/parser.ts`'s parts, since the
 * heuristic (name match, then mean-pitch fallback) doesn't care what
 * produced the `{name, pitches}` list. Ported from the iOS app's
 * `MIDIParser.swift`; divisi-desk detection is new here.
 */

/** Full-word aliases per part, matched as a *prefix* of the (trimmed,
 * lowercased) track name — covers real-world split-part naming like
 * "Soprano 1", "Soprano II", "Altos", "Tenor 2", "Sop.", "Alt". */
const WORD_ALIASES: Record<VoicePart, string[]> = {
	soprano: ['soprano', 'sop'],
	alto: ['alto', 'alt'],
	tenor: ['tenor', 'ten'],
	bass: ['bass', 'bs']
};

/** Single-letter shorthand per part ("S", "S1", "S 2", "S.", "T II", "B2")
 * — matched only when the *entire* name reduces to the code plus
 * punctuation/numbering, since a bare letter as a prefix elsewhere would
 * false-positive too easily (e.g. "Strings"). */
const SHORT_CODES: Record<string, VoicePart> = { s: 'soprano', a: 'alto', t: 'tenor', b: 'bass' };

const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10 };

/** Parses a small Roman numeral ("i", "ii", "iii", "iv", ...) — divisi desk
 * numbers never go higher than this covers in real choral parts. `null` for
 * anything that isn't a valid numeral. */
function romanToInt(roman: string): number | null {
	let total = 0;
	for (let i = 0; i < roman.length; i++) {
		const value = ROMAN_VALUES[roman[i]];
		if (value === undefined) return null;
		const next = i + 1 < roman.length ? ROMAN_VALUES[roman[i + 1]] : undefined;
		total += next !== undefined && next > value ? -value : value;
	}
	return total > 0 ? total : null;
}

/** Pulls a desk number out of whatever follows a matched voice-part alias or
 * short code — "1"/"2" in "Soprano 1"/"S 2", "II" in "Tenor II" — or
 * `undefined` when nothing numbers it (a plain "Soprano"/"Altos"). */
function extractSubIndex(remainder: string): number | undefined {
	const trimmed = remainder.trim().replace(/^[.\s]+|[.\s]+$/g, '');
	if (!trimmed) return undefined;
	if (/^\d+$/.test(trimmed)) return Number(trimmed);
	if (/^[ivx]+$/.test(trimmed)) return romanToInt(trimmed) ?? undefined;
	return undefined;
}

function matchVoicePart(rawName: string): { base: VoicePart; subIndex?: number } | null {
	const name = rawName.trim().toLowerCase();
	if (!name) return null;

	for (const part of VOICE_PARTS) {
		const alias = WORD_ALIASES[part].find((a) => name.startsWith(a));
		if (alias) return { base: part, subIndex: extractSubIndex(name.slice(alias.length)) };
	}

	const code = name[0];
	const rest = name.slice(1);
	if (![...rest].every((ch) => '.0123456789ivx '.includes(ch))) return null;
	const base = SHORT_CODES[code];
	return base ? { base, subIndex: extractSubIndex(rest) } : null;
}

function meanPitch(pitches: number[]): number {
	return pitches.reduce((a, b) => a + b, 0) / pitches.length;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface VoicePartAssignment {
	/** Track/part index -> the `VoicePartInfo.id` its notes belong to.
	 * Candidates that can't be confidently mapped (accompaniment, unnamed
	 * extras, an ambiguous leftover count) are simply absent — callers
	 * should pre-filter out anything they already know isn't a vocal line
	 * (e.g. `musicxml/parser.ts` excludes multi-staff parts before calling
	 * this) so the mean-pitch fallback's exact-count check has a real
	 * chance of matching. */
	trackParts: Record<number, string>;
	/** Every distinct part this file resolved to, canonically ordered
	 * (S->A->T->B, ascending desk number within a voice). Never includes
	 * accompaniment — that's a caller concern, since whatever wasn't
	 * matched here becomes backing notes instead. */
	parts: VoicePartInfo[];
}

export function assignVoiceParts(tracks: { name: string | null; pitches: number[] }[]): VoicePartAssignment {
	const trackParts: Record<number, string> = {};

	// Pass 1: name matching, grouped by base voice — multiple tracks can
	// match the same base on purpose (a divisi split), each becoming its own
	// numbered desk below rather than merging together.
	const matchedByBase = new Map<VoicePart, { index: number; subIndex?: number }[]>();
	tracks.forEach((track, index) => {
		if (!track.name) return;
		const match = matchVoicePart(track.name);
		if (!match) return;
		const list = matchedByBase.get(match.base) ?? [];
		list.push({ index, subIndex: match.subIndex });
		matchedByBase.set(match.base, list);
	});

	const parts: VoicePartInfo[] = [];
	for (const base of VOICE_PARTS) {
		const matches = matchedByBase.get(base);
		if (!matches || matches.length === 0) continue;

		if (matches.length === 1 && matches[0].subIndex === undefined) {
			trackParts[matches[0].index] = base;
			parts.push({ id: base, base, label: capitalize(base) });
			continue;
		}

		// Divisi split: every desk needs its own, non-colliding number. Trust
		// the file's own numbering only when it's complete and collision-free
		// across every matched track; otherwise fall back to high->low
		// mean-pitch order, the same tie-break the plain mean-pitch fallback
		// below uses.
		const explicit = matches.map((m) => m.subIndex);
		const cleanNumbering = explicit.every((n) => n !== undefined) && new Set(explicit).size === explicit.length;
		const ordered = cleanNumbering
			? matches
			: [...matches].sort((a, b) => meanPitch(tracks[b.index].pitches) - meanPitch(tracks[a.index].pitches));

		ordered.forEach((match, i) => {
			const subIndex = cleanNumbering ? match.subIndex! : i + 1;
			const id = `${base}-${subIndex}`;
			trackParts[match.index] = id;
			parts.push({ id, base, subIndex, label: `${capitalize(base)} ${subIndex}` });
		});
	}

	// Pass 2: mean-pitch fallback (high->low) for whatever voice parts
	// nothing named at all, drawn only from tracks that have notes and
	// weren't already name-matched to a different part.
	const remainingParts = VOICE_PARTS.filter((p) => !matchedByBase.has(p));
	if (remainingParts.length > 0) {
		const candidates = tracks
			.map((t, index) => ({ index, pitches: t.pitches }))
			.filter(({ index, pitches }) => trackParts[index] === undefined && pitches.length > 0);
		if (candidates.length === remainingParts.length) {
			const ranked = [...candidates].sort((a, b) => meanPitch(b.pitches) - meanPitch(a.pitches));
			remainingParts.forEach((base, i) => {
				trackParts[ranked[i].index] = base;
				parts.push({ id: base, base, label: capitalize(base) });
			});
		}
	}

	// Pass 3: a base voice nothing matched at all — not even ambiguously —
	// still gets a row, with no track pointing to it. A file missing a whole
	// voice part (e.g. an SA-only piece) should show the same four SATB rows
	// as one that has every voice, just silent, not a differently-shaped
	// mixer.
	for (const base of VOICE_PARTS) {
		if (!parts.some((p) => p.base === base)) parts.push({ id: base, base, label: capitalize(base) });
	}

	// Passes above can interleave voices (e.g. the fallback filling alto
	// before a later-processed split soprano was appended) — re-sort into
	// canonical S->A->T->B / ascending-desk order. `base` is always a plain
	// `VoicePart` here (never 'accompaniment' — that's a caller concern), so
	// it's always found in `VOICE_PARTS`.
	parts.sort((a, b) => {
		const baseDelta = VOICE_PARTS.indexOf(a.base as VoicePart) - VOICE_PARTS.indexOf(b.base as VoicePart);
		return baseDelta !== 0 ? baseDelta : (a.subIndex ?? 0) - (b.subIndex ?? 0);
	});

	return { trackParts, parts };
}

/**
 * Detects and splits *unnamed* divisi within a single plain SATB voice part
 * (a track/part that `assignVoiceParts` above resolved to a plain
 * `soprano`/`alto`/`tenor`/`bass` id, i.e. the file never named its own
 * split like "Soprano 1"/"Soprano 2"). Some sources still write real
 * two-voice divisi onto one staff/track, distinguishable only by looking at
 * which notes share an onset -- this recovers the same two-desk shape the
 * name-based split above produces, by pitch rank per onset rather than by
 * name.
 *
 * Rule: group a base voice's notes by exact `startMs` (same "onset" concept
 * the MusicXML parser's own `isChord`/`lastNoteStartMs` handling uses --
 * exact-ms equality, no epsilon, because the tempo-map conversion that
 * produces `startMs` is deterministic, so truly simultaneous notes always
 * land on the same ms value). At a 2-note onset, the higher pitch goes to
 * desk 1, the lower to desk 2 -- sopranos/altos/tenors/basses are written
 * top-voice-first by convention, so "desk 1" reads as "the higher part"
 * the same way "Soprano 1" does in a named split.
 *
 * At a 1-note onset (a unison moment within an otherwise-2-voice passage,
 * or a monophonic stretch inside a piece that also has real divisi
 * elsewhere), **both desks get the note** -- it's cloned, not assigned to
 * just one desk. This was an explicit human product decision, not an
 * obvious default: the alternative (parking every unison note on desk 1
 * only) would make desk 2 silent through the unison stretch, which sounds
 * like a missing voice rather than what's actually happening (both parts
 * are correctly singing the same pitch). Duplicating is the choice that
 * matches what the ear actually hears.
 *
 * A base voice only gets split when it *actually has* a real 2-note onset
 * somewhere -- a monophonic line left alone rather than duplicated onto two
 * identical rows for no reason (see the "no group has exactly 2 notes"
 * bail-out below). And a base voice with any onset stacking *more than* 2
 * notes is left alone entirely, not partially split -- this function only
 * handles clean 2-way divisi, not general chord-stacking; a 3+-note onset
 * has no unambiguous "desk 1 vs desk 2" pitch-rank mapping the way a 2-note
 * onset does, so it bails out rather than guessing.
 *
 * Lyrics have no pitch, and after a split both desks have a sounding note
 * at every onset, so a lyric at a split base's `startMs`/`timeMs` is
 * duplicated onto both desks too, same reasoning as the 1-note-onset note
 * case above -- there's no way to prefer one desk over the other.
 */
export function splitChordalDivisi(
	parts: VoicePartInfo[],
	notes: MIDINote[],
	lyrics: MIDILyricEvent[]
): { parts: VoicePartInfo[]; notes: MIDINote[]; lyrics: MIDILyricEvent[] } {
	let outParts = parts;
	let outNotes = notes;
	let outLyrics = lyrics;

	for (const base of VOICE_PARTS) {
		// Only a *plain*, unsplit voice is a candidate -- a track the file
		// already name-split (e.g. `soprano-1`/`soprano-2` already in `parts`)
		// has no entry with `id === base` at all, so this naturally skips it.
		const partIndex = outParts.findIndex((p) => p.id === base);
		if (partIndex === -1) continue;

		const baseNotes = outNotes.filter((n) => n.partId === base);
		if (baseNotes.length === 0) continue;

		const byOnset = new Map<number, MIDINote[]>();
		for (const note of baseNotes) {
			const group = byOnset.get(note.startMs) ?? [];
			group.push(note);
			byOnset.set(note.startMs, group);
		}

		const groups = [...byOnset.values()];
		if (groups.some((g) => g.length > 2)) continue; // 3+-note onset: bail out, no clean pitch-rank split
		if (!groups.some((g) => g.length === 2)) continue; // never actually splits: leave the plain voice alone

		const desk1Id = `${base}-1`;
		const desk2Id = `${base}-2`;
		const splitNotes: MIDINote[] = [];
		for (const group of groups) {
			if (group.length === 2) {
				const [hi, lo] = [...group].sort((a, b) => b.pitch - a.pitch);
				splitNotes.push({ ...hi, partId: desk1Id }, { ...lo, partId: desk2Id });
			} else {
				// 1-note onset: both desks play it (see doc comment above).
				const [only] = group;
				splitNotes.push({ ...only, partId: desk1Id }, { ...only, partId: desk2Id });
			}
		}

		const desk1Info: VoicePartInfo = { id: desk1Id, base, subIndex: 1, label: `${capitalize(base)} 1` };
		const desk2Info: VoicePartInfo = { id: desk2Id, base, subIndex: 2, label: `${capitalize(base)} 2` };
		outParts = [...outParts.slice(0, partIndex), desk1Info, desk2Info, ...outParts.slice(partIndex + 1)];

		outNotes = [
			...outNotes.filter((n) => n.partId !== base),
			...splitNotes.sort((a, b) => a.startMs - b.startMs)
		];

		outLyrics = outLyrics.flatMap((lyric) =>
			lyric.partId === base
				? [
						{ ...lyric, partId: desk1Id },
						{ ...lyric, partId: desk2Id }
					]
				: [lyric]
		);
	}

	return { parts: outParts, notes: outNotes, lyrics: outLyrics };
}
