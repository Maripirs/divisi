import { VOICE_PARTS, type VoicePart } from '../midi/types.ts';

/**
 * Maps a track/part's name and note pitches to an SATB voice part. Format-
 * agnostic on purpose — originally written for `midi/parser.ts`'s MIDI
 * tracks, now shared with `musicxml/parser.ts`'s parts, since the heuristic
 * (name match, then mean-pitch fallback) doesn't care what produced the
 * `{name, pitches}` list. Ported from the iOS app's `MIDIParser.swift`.
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

function matchVoicePart(rawName: string): VoicePart | null {
	const name = rawName.trim().toLowerCase();
	if (!name) return null;

	for (const part of VOICE_PARTS) {
		if (WORD_ALIASES[part].some((alias) => name.startsWith(alias))) return part;
	}

	const code = name[0];
	const rest = name.slice(1);
	if (![...rest].every((ch) => '.0123456789ivx '.includes(ch))) return null;
	return SHORT_CODES[code] ?? null;
}

function meanPitch(pitches: number[]): number {
	return pitches.reduce((a, b) => a + b, 0) / pitches.length;
}

/** Maps track/part index -> voice part. Candidates that can't be confidently
 * mapped (accompaniment, unnamed extras, an ambiguous leftover count) are
 * simply absent from the result — callers should pre-filter out anything
 * they already know isn't a vocal line (e.g. `musicxml/parser.ts` excludes
 * multi-staff parts before calling this) so the mean-pitch fallback's
 * exact-count check has a real chance of matching. */
export function assignVoiceParts(tracks: { name: string | null; pitches: number[] }[]): Record<number, VoicePart> {
	const assignments: Record<number, VoicePart> = {};
	const assignedParts = new Set<VoicePart>();

	// Pass 1: name matching. Multiple tracks can map to the same part on
	// purpose — divisi splits ("Soprano 1"/"Soprano 2") both belong in the
	// same voice-part bucket.
	tracks.forEach((track, index) => {
		if (!track.name) return;
		const part = matchVoicePart(track.name);
		if (!part) return;
		assignments[index] = part;
		assignedParts.add(part);
	});

	// Pass 2: mean-pitch fallback (high→low) for whatever voice parts are
	// still unassigned, drawn only from tracks that have notes and weren't
	// already name-matched to a different part.
	const remainingParts = VOICE_PARTS.filter((p) => !assignedParts.has(p));
	if (remainingParts.length === 0) return assignments;

	const candidates = tracks
		.map((t, index) => ({ index, pitches: t.pitches }))
		.filter(({ index, pitches }) => assignments[index] === undefined && pitches.length > 0);
	if (candidates.length !== remainingParts.length) {
		// More or fewer note-bearing candidate tracks than remaining voice
		// parts — too ambiguous to guess at safely.
		return assignments;
	}

	const ranked = [...candidates].sort((a, b) => meanPitch(b.pitches) - meanPitch(a.pitches));
	remainingParts.forEach((part, i) => {
		assignments[ranked[i].index] = part;
	});
	return assignments;
}
