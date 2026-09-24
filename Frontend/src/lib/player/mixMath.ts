// Pure mixer/display-preset math lifted out of `routes/piece/[id]/+page.svelte`
// (round-2 cleanup step 2). No component state: every function takes the
// piece's `parts` list (and, where a preset keys off "my desk", the current
// `subPart`) explicitly instead of closing over module-level `$state`.

import { MIX_PARTS } from '$lib/midi/types';
import type {
	DisplayMode,
	MixBase,
	MixMode,
	MixPart,
	ParsedMIDI,
	VisualState,
	VoicePart
} from '$lib/midi/types';
import { capitalize } from '../notation/voicePartAssignment';

type Parts = ParsedMIDI['parts'];

// Expands a record keyed by the 5 base buckets into one with exactly the
// ids this piece's `parts` uses — every desk of a base starts out
// inheriting that base's value.
export function expandBaseRecord<T>(parts: Parts, baseDefaults: Record<MixBase, T>): Record<MixPart, T> {
	return Object.fromEntries(parts.map((part) => [part.id, baseDefaults[part.base]])) as Record<MixPart, T>;
}

// Same idea, but `current` (a piece's own, possibly-persisted ids) is
// checked first so a persisted per-piece choice always wins; only a
// divisi desk with no id-specific entry yet — a brand-new split, or a
// stale value left over from before this file happened to split —
// inherits its base voice's value instead of coming up empty.
export function materializePartRecord<T>(
	parts: Parts,
	current: Record<MixPart, T>,
	baseDefaults: Record<MixBase, T>
): Record<MixPart, T> {
	const expanded = expandBaseRecord(parts, baseDefaults);
	return Object.fromEntries(parts.map((part) => [part.id, current[part.id] ?? expanded[part.id]])) as Record<
		MixPart,
		T
	>;
}

// Collapses a per-piece, possibly-split record down to the 5 base
// buckets `playerDefaults.ts` stores — "Make this my default" promotes
// the *voice's* balance, not a specific file's desk numbering. Presets
// keep every desk of a base in lockstep (see below), so this is lossless
// for anything but a Custom mix with desks pulled apart on purpose, where
// it keeps the first desk's value as the base's representative.
export function collapseToBaseRecord<T>(parts: Parts, record: Record<MixPart, T>): Record<MixBase, T> {
	return Object.fromEntries(
		MIX_PARTS.map((base) => [base, record[parts.find((p) => p.base === base)!.id]])
	) as Record<MixBase, T>;
}

// Presets below all key off `isFocusPart`, not a bare `part.base`
// comparison — "my part"/"highlighted" is a file-independent choice (see
// `VoicePart` vs `MixPart` in `midi/types.ts`), so every desk of a split
// voice moves together under a preset *unless* `subPart` narrows it down
// to one specific desk. Individual desks only diverge on their own once
// the user switches to Custom mode and adjusts one directly.
export function isFocusPart(
	part: { id: MixPart; base: MixBase },
	focusPart: VoicePart,
	subPart: MixPart | null
): boolean {
	if (part.base !== focusPart) return false;
	return subPart === null || part.id === subPart;
}

// One mixer row per part id, except a non-focus voice's own auto-/named
// divisi desks (e.g. "Soprano 1"/"Soprano 2") collapse into a single row
// covering the whole section. The mixer only gives independent per-desk
// control to the voice the singer actually cares about — every other
// section is one slider, not one per desk, regardless of *why* the file
// splits it (a real named split or `splitChordalDivisi`'s own auto-detect
// both collapse the same way here, unlike `mergeSplitDesksForDisplay`,
// which only merges auto-split pairs and only for the score, where a
// genuine named split is a real two-staff engraving choice worth keeping
// visible). Canonical S->A->T->B order falls out for free from `parts`
// already being in that order.
export interface MixerRow {
	id: MixPart;
	base: MixBase;
	label: string;
	/** Every underlying part id this row's slider/toggle controls — one for
	 * the focus voice's own desks (each gets its own row), every desk of a
	 * non-focus voice otherwise (adjusting the row moves them all together,
	 * the same "every desk of a base in lockstep" rule presets already use
	 * — see `isFocusPart`'s doc comment). */
	deskIds: MixPart[];
}

export function mixerRows(parts: Parts, focusPart: VoicePart): MixerRow[] {
	const rows: MixerRow[] = [];
	const collapsedBases = new Set<MixBase>();
	for (const part of parts) {
		if (part.base === focusPart) {
			rows.push({ id: part.id, base: part.base, label: part.label, deskIds: [part.id] });
			continue;
		}
		if (collapsedBases.has(part.base)) continue;
		collapsedBases.add(part.base);
		const deskIds = parts.filter((p) => p.base === part.base).map((p) => p.id);
		const label = deskIds.length > 1 ? capitalize(part.base) : part.label;
		rows.push({ id: part.id, base: part.base, label, deskIds });
	}
	return rows;
}

export function presetVisualStates(
	parts: Parts,
	mode: DisplayMode,
	focusPart: VoicePart,
	subPart: MixPart | null
): Record<MixPart, VisualState> {
	return Object.fromEntries(
		parts.map((part) => {
			let state: VisualState;
			if (mode === 'flat' || mode === 'custom') state = 'active';
			else if (mode === 'highlighted') state = isFocusPart(part, focusPart, subPart) ? 'active' : 'muted';
			else state = isFocusPart(part, focusPart, subPart) ? 'active' : 'off';
			return [part.id, state];
		})
	) as Record<MixPart, VisualState>;
}

export function matchingDisplayMode(
	parts: Parts,
	states: Record<MixPart, VisualState>,
	focusPart: VoicePart,
	subPart: MixPart | null
): DisplayMode {
	const presetModes: DisplayMode[] = ['flat', 'highlighted', 'solo'];
	return (
		presetModes.find((mode) =>
			sameVisualStates(parts, states, presetVisualStates(parts, mode, focusPart, subPart))
		) ?? 'custom'
	);
}

export function sameVisualStates(
	parts: Parts,
	a: Record<MixPart, VisualState>,
	b: Record<MixPart, VisualState>
): boolean {
	return parts.every((part) => a[part.id] === b[part.id]);
}

// 0.5 is this app's "normal" per-part volume (see `describeBalance`,
// which labels it "Even") — so "Everyone" leaves every bucket there,
// "Minus Me" just cuts the non-focus buckets to silence rather than
// boosting anything above normal. "Mostly Me" is the first preset that
// actually deviates from that: focus part boosted +50 from even to full
// (1), everyone else dropped -50 from even to silent (0). ("My Part" —
// focus-only, everyone else silenced — used to be a preset here too;
// removed per the human's call, true solo is still reachable via the
// Custom sliders if someone wants it.)
export function presetBalances(
	parts: Parts,
	mode: Exclude<MixMode, 'custom'>,
	focusPart: VoicePart,
	subPart: MixPart | null
): Record<MixPart, number> {
	return Object.fromEntries(
		parts.map((part) => {
			let value: number;
			if (mode === 'everyone') value = 0.5;
			else if (mode === 'minusMe') value = isFocusPart(part, focusPart, subPart) ? 0 : 0.5;
			else value = isFocusPart(part, focusPart, subPart) ? 1 : 0; // mostlyMe
			return [part.id, value];
		})
	) as Record<MixPart, number>;
}

export function matchingMixMode(
	parts: Parts,
	balances: Record<MixPart, number>,
	focusPart: VoicePart,
	subPart: MixPart | null
): MixMode {
	const presetModes: Exclude<MixMode, 'custom'>[] = ['everyone', 'minusMe', 'mostlyMe'];
	return (
		presetModes.find((mode) =>
			sameBalances(parts, balances, presetBalances(parts, mode, focusPart, subPart))
		) ?? 'custom'
	);
}

export function sameBalances(parts: Parts, a: Record<MixPart, number>, b: Record<MixPart, number>): boolean {
	return parts.every((part) => a[part.id] === b[part.id]);
}
