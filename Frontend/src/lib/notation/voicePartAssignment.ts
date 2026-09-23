import {
	VOICE_PARTS,
	type MIDILyricEvent,
	type MIDINote,
	type MixPart,
	type VisualState,
	type VoicePart,
	type VoicePartInfo
} from '../midi/types.ts';

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

export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One candidate track/part `assignVoiceParts` couldn't confidently map to a
 * voice part -- real notes, but neither name-matched (pass 1) nor covered by
 * the mean-pitch fallback (pass 2, which only fires when the unmatched-
 * candidate count exactly equals the remaining-SATB-slot count). This is the
 * shape that let a real 5-part divisi split silently vanish into the
 * Accompaniment bucket -- see this file's own module doc comment -- so
 * callers surface these for a human to resolve instead of guessing. */
export interface AmbiguousCandidate {
	/** Index into the `tracks` array passed to `assignVoiceParts` -- same
	 * indexing `trackParts` uses, so callers can map back to their own raw
	 * part/track list. */
	index: number;
	name: string | null;
	minPitch: number;
	maxPitch: number;
	meanPitch: number;
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
	/** Candidates with real notes that neither pass matched — a caller-
	 * facing "please confirm these" list, not consumed anywhere else in
	 * this function. See `AmbiguousCandidate`'s own doc comment. */
	ambiguous: AmbiguousCandidate[];
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

	// Every candidate that never got a `trackParts` entry despite having real
	// notes -- pass 2's exact-count check failing (the real "5 unnamed vocal
	// parts" bug this feature exists to prevent, see this file's own module
	// doc comment) is the main source; a base voice pass 3 filled with no
	// track at all never lands here either way. Multi-staff/instrumental
	// candidates are excluded for free: callers (e.g. `musicxml/parser.ts`)
	// already fake those to `{ name: null, pitches: [] }` before calling
	// this, so `pitches.length > 0` filters them out here too.
	const ambiguous: AmbiguousCandidate[] = tracks
		.map((t, index) => ({ index, name: t.name, pitches: t.pitches }))
		.filter(({ index, pitches }) => trackParts[index] === undefined && pitches.length > 0)
		.map(({ index, name, pitches }) => ({
			index,
			name,
			minPitch: Math.min(...pitches),
			maxPitch: Math.max(...pitches),
			meanPitch: meanPitch(pitches)
		}));

	return { trackParts, parts, ambiguous };
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

		const desk1Info: VoicePartInfo = { id: desk1Id, base, subIndex: 1, label: `${capitalize(base)} 1`, autoSplit: true };
		const desk2Info: VoicePartInfo = { id: desk2Id, base, subIndex: 2, label: `${capitalize(base)} 2`, autoSplit: true };
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

/** Dedupes a note list, keyed by part + onset + pitch, keeping the first of
 * any exact repeat. Used by `mergeSplitDesksForDisplay` to collapse a
 * unison-onset note that `splitChordalDivisi` cloned onto both desks back
 * down to the single note it started as -- two genuinely different pitches
 * at the same onset (a real 2-note chord) have different keys, so they're
 * never touched by this. */
function dedupeNotes(notes: MIDINote[]): MIDINote[] {
	const seen = new Set<string>();
	const result: MIDINote[] = [];
	for (const note of notes) {
		const key = `${note.partId}:${note.startMs}:${note.pitch}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(note);
	}
	return result;
}

/** Same idea as `dedupeNotes` but for lyrics, which have no pitch to key on
 * -- text + onset is the only thing distinguishing a real repeated lyric
 * from a duplicate `splitChordalDivisi` produced. */
function dedupeLyrics(lyrics: MIDILyricEvent[]): MIDILyricEvent[] {
	const seen = new Set<string>();
	const result: MIDILyricEvent[] = [];
	for (const lyric of lyrics) {
		const key = `${lyric.partId}:${lyric.timeMs}:${lyric.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(lyric);
	}
	return result;
}

/** Merging rule for one pair of desks' visual states -- see the doc comment
 * below for why "favor showing it plainly" is the right default here. */
function mergeVisualState(a: VisualState, b: VisualState): VisualState {
	if (a === 'off' && b === 'off') return 'off';
	if (a === 'muted' && b === 'muted') return 'muted';
	return 'active';
}

export interface MergedForDisplay {
	parts: VoicePartInfo[];
	notes: MIDINote[];
	lyrics: MIDILyricEvent[];
	visualStates: Record<MixPart, VisualState>;
}

/**
 * The inverse of `splitChordalDivisi` above, for the *score* only: collapses
 * an auto-split base voice's two desks (`${base}-1`/`${base}-2`) back into
 * one combined `${base}` entry, so a chordal divisi that exists purely to
 * give the mixer independent volume/mute/solo control over two voices does
 * not also turn one printed staff into two. The mixer keeps reading the
 * split desks exactly as `splitChordalDivisi` left them -- this function
 * never touches its inputs, it builds and returns a fresh transformed copy
 * for the score-rendering path to consume instead.
 *
 * Only pairs `splitChordalDivisi` itself produced are eligible -- both
 * `VoicePartInfo` entries must carry `autoSplit` (see that field's doc
 * comment on `VoicePartInfo`). A divisi the *file* named itself (real
 * "Soprano 1"/"Soprano 2" tracks/parts, resolved by `assignVoiceParts`
 * above) produces an identically-shaped `${base}-1`/`${base}-2` pair but is
 * a genuine two-staff engraving choice the source material made on purpose
 * -- left as two staves, not merged.
 *
 * Reversing note-by-note mirrors the split in reverse:
 * - A genuine 2-note onset (different pitches, one per desk) retags both
 *   notes to the base id at the same onset -- the existing same-partId/
 *   same-onset chord grouping in `musicXmlConverter.ts` already renders
 *   that as one 2-pitch chord on one staff, no changes needed there.
 * - A 1-note (unison) onset was *duplicated* onto both desks by the split,
 *   not divided, so retagging both copies produces two identical notes at
 *   one onset under one partId -- `dedupeNotes` above collapses that back
 *   down to the single original note.
 * Lyrics get the same duplicate-then-dedupe treatment (`dedupeLyrics`),
 * keyed by text + onset rather than pitch, since `splitChordalDivisi`
 * duplicates a base voice's lyric event onto both desks unconditionally
 * (every onset, not just unison ones -- see its own doc comment).
 *
 * The two desks' visual states can differ if a user manually soloed/muted
 * just one desk in the mixer. `mergeVisualState` favors showing the merged
 * staff plainly over inventing partial-chord coloring (out of scope here):
 * both `'off'` -> `'off'`, both `'muted'` -> `'muted'`, anything else
 * (including one desk `'active'`) -> `'active'`. In the common case both
 * desks already share one state (see `convertAllParts`'s doc comment: "every
 * desk of a split voice highlights together"), so this rule rarely has to
 * arbitrate a real conflict.
 */
export function mergeSplitDesksForDisplay(
	parts: VoicePartInfo[],
	notes: MIDINote[],
	lyrics: MIDILyricEvent[],
	visualStates: Record<MixPart, VisualState>
): MergedForDisplay {
	let outParts = parts;
	let outNotes = notes;
	let outLyrics = lyrics;
	const outVisualStates = { ...visualStates };

	for (const base of VOICE_PARTS) {
		const desk1Id = `${base}-1`;
		const desk2Id = `${base}-2`;
		const desk1Info = outParts.find((p) => p.id === desk1Id);
		const desk2Info = outParts.find((p) => p.id === desk2Id);
		if (!desk1Info?.autoSplit || !desk2Info?.autoSplit) continue; // no auto-split pair here: leave it be

		const mergedInfo: VoicePartInfo = { id: base, base, subIndex: undefined, label: capitalize(base) };
		let inserted = false;
		outParts = outParts.flatMap((part) => {
			if (part.id !== desk1Id && part.id !== desk2Id) return [part];
			if (inserted) return [];
			inserted = true;
			return [mergedInfo];
		});

		outNotes = outNotes.map((n) => (n.partId === desk1Id || n.partId === desk2Id ? { ...n, partId: base } : n));
		outLyrics = outLyrics.map((l) => (l.partId === desk1Id || l.partId === desk2Id ? { ...l, partId: base } : l));

		outVisualStates[base] = mergeVisualState(outVisualStates[desk1Id], outVisualStates[desk2Id]);
		delete outVisualStates[desk1Id];
		delete outVisualStates[desk2Id];
	}

	return {
		parts: outParts,
		notes: dedupeNotes(outNotes),
		lyrics: dedupeLyrics(outLyrics),
		visualStates: outVisualStates
	};
}
