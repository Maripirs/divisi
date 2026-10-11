/**
 * Section tags on weekly notes and piece notes ("this note is for the
 * tenors and basses"), plus the singer-side section filter. The Backend
 * stores a tag as `part_scope`: a canonical comma-separated list of voice
 * parts in SATB order (`"tenor,bass"`), `null` meaning everyone ("All"),
 * and all four parts normalizing back to `null` (see the Backend's
 * `app/services/part_scope.py`, which this mirrors). Here a tag is a
 * `VoicePart[]`, `[]` meaning All.
 *
 * Pure functions only (no stores, no messages) so they stay unit-testable;
 * the chip row, picker, and badges live in `$lib/components/Section*.svelte`.
 */
import { VOICE_PARTS, type VoicePart } from '$lib/midi/types';

/** The singer-side filter: one section, or `'everyone'` (no filter). */
export type SectionFilter = VoicePart | 'everyone';

export const SECTION_FILTERS: readonly SectionFilter[] = ['everyone', ...VOICE_PARTS];

/** Anything carrying a parsed section tag. */
export interface Sectioned {
	sections: readonly VoicePart[];
}

/** Read-side parse, deliberately tolerant: unknown tokens (an old freeform
 * value, a future part) are ignored, so a value with no recognized tokens
 * reads as All rather than hiding the note from everyone. */
export function parsePartScope(raw: string | null | undefined): VoicePart[] {
	if (!raw) return [];
	const tokens = new Set(raw.split(',').map((t) => t.trim().toLowerCase()));
	const parts = VOICE_PARTS.filter((p) => tokens.has(p));
	return parts.length === VOICE_PARTS.length ? [] : parts;
}

/** Write-side serialize: SATB order, deduped, `null` for All (none or all
 * four selected), matching what the Backend's validator would store. */
export function serializePartScope(parts: readonly VoicePart[]): string | null {
	const chosen = VOICE_PARTS.filter((p) => parts.includes(p));
	if (chosen.length === 0 || chosen.length === VOICE_PARTS.length) return null;
	return chosen.join(',');
}

/** The authoring picker's toggle rule: "All" clears every section; a
 * section toggles itself (implicitly unchecking All); picking the last
 * missing section collapses back to All, since all four is the same note. */
export function toggleSection(current: readonly VoicePart[], choice: VoicePart | 'all'): VoicePart[] {
	if (choice === 'all') return [];
	const next = current.includes(choice) ? current.filter((p) => p !== choice) : [...current, choice];
	return parsePartScope(serializePartScope(next));
}

/** A section filter shows notes tagged with that section plus notes for
 * everyone; `'everyone'` shows every note. */
export function matchesSection(sections: readonly VoicePart[], filter: SectionFilter): boolean {
	return filter === 'everyone' || sections.length === 0 || sections.includes(filter);
}

export function filterBySection<T extends Sectioned>(items: readonly T[], filter: SectionFilter): T[] {
	return items.filter((item) => matchesSection(item.sections, filter));
}

/** Whether a chip row is worth showing: if every note is for everyone,
 * every chip would show the same list, so the row is just noise. */
export function hasSectionTags(items: readonly Sectioned[]): boolean {
	return items.some((item) => item.sections.length > 0);
}

/** The chip a singer starts on: their saved voice part, once they've
 * actually chosen one (the stored Soprano is only a fallback until then). */
export function defaultSectionFilter(defaults: {
	voicePart: VoicePart;
	voicePartChosen: boolean;
}): SectionFilter {
	return defaults.voicePartChosen ? defaults.voicePart : 'everyone';
}
