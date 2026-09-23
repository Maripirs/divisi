<script module lang="ts">
	import type { VoicePart } from '$lib/midi/types';

	/** One reviewer's decision for one ambiguous part -- a specific voice
	 * (with an optional desk number for a divisi split) or the collapsed
	 * Accompaniment bucket. No third "leave unresolved" option on purpose:
	 * an unvisited row (absent from the caller's `assignments` record) is
	 * what "not yet resolved" already looks like. */
	export type PartChoice = { kind: 'voice'; base: VoicePart; subIndex?: number } | { kind: 'accompaniment' };
</script>

<script lang="ts">
	import { VOICE_PARTS } from '$lib/midi/types';
	import type { AmbiguousPart, VoicePartInfo } from '$lib/midi/types';
	import { capitalize } from '$lib/notation/voicePartAssignment';
	import { midiPitchToNoteName } from '$lib/musicxml/partNameRewriter';
	import { m } from '$lib/paraglide/messages';

	let {
		ambiguousParts,
		existingParts,
		assignments,
		onchange
	}: {
		ambiguousParts: AmbiguousPart[];
		/** The file's already-resolved voices (`parsed.parts`) -- used only
		 * to pick a non-colliding default desk number, alongside every other
		 * row's current choice in this same panel. */
		existingParts: VoicePartInfo[];
		assignments: Record<string, PartChoice>;
		onchange: (partId: string, choice: PartChoice | undefined) => void;
	} = $props();

	type SelectValue = '' | VoicePart | 'accompaniment';

	function selectValueFor(choice: PartChoice | undefined): SelectValue {
		if (!choice) return '';
		return choice.kind === 'accompaniment' ? 'accompaniment' : choice.base;
	}

	/** Desk numbers already spoken for by a given base voice -- either a
	 * real resolved part (`existingParts`) or another ambiguous row's
	 * current pick in this same panel (excluding the row being computed
	 * for). A plain, un-numbered entry counts as desk 1, the same id a
	 * lone/first desk of a voice always gets. */
	function usedDesks(base: VoicePart, excludePartId: string): Set<number> {
		const used = new Set<number>();
		for (const part of existingParts) {
			if (part.base === base) used.add(part.subIndex ?? 1);
		}
		for (const [partId, choice] of Object.entries(assignments)) {
			if (partId === excludePartId || !choice) continue;
			if (choice.kind === 'voice' && choice.base === base) used.add(choice.subIndex ?? 1);
		}
		return used;
	}

	/** `undefined` (a plain, un-numbered id) when nothing else claims this
	 * base voice at all; otherwise the lowest free desk number -- so two
	 * ambiguous rows defaulting to the same base voice don't collide on the
	 * same id by default. The picker still allows overriding into a
	 * collision on purpose (see the desk `<input>` below); this is only the
	 * default. */
	function defaultDesk(base: VoicePart, partId: string): number | undefined {
		const used = usedDesks(base, partId);
		if (used.size === 0) return undefined;
		let n = 1;
		while (used.has(n)) n++;
		return n;
	}

	function handleSelect(part: AmbiguousPart, value: SelectValue): void {
		if (value === '') {
			onchange(part.partId, undefined);
		} else if (value === 'accompaniment') {
			onchange(part.partId, { kind: 'accompaniment' });
		} else {
			onchange(part.partId, { kind: 'voice', base: value, subIndex: defaultDesk(value, part.partId) });
		}
	}

	function handleDeskInput(part: AmbiguousPart, choice: PartChoice, raw: string): void {
		if (choice.kind !== 'voice') return;
		const n = raw.trim() ? Number(raw) : undefined;
		onchange(part.partId, { kind: 'voice', base: choice.base, subIndex: n && n > 0 ? n : undefined });
	}

	function pitchRangeText(part: AmbiguousPart): string {
		return m.confirm_parts_pitch_range({
			low: midiPitchToNoteName(Math.round(part.minPitch)),
			high: midiPitchToNoteName(Math.round(part.maxPitch)),
			avg: midiPitchToNoteName(Math.round(part.meanPitch))
		});
	}
</script>

<div class="card confirm-parts">
	<p class="card-eyebrow">{m.confirm_parts_title()}</p>
	<p class="card-note">{m.confirm_parts_hint()}</p>

	{#each ambiguousParts as part (part.partId)}
		{@const choice = assignments[part.partId]}
		<div class="confirm-parts-row">
			<div class="confirm-parts-info">
				<span class="confirm-parts-name">{part.name ?? m.confirm_parts_unnamed()}</span>
				<span class="confirm-parts-pitch">{pitchRangeText(part)}</span>
			</div>
			<label class="field confirm-parts-select">
				<span>{m.confirm_parts_assign_label()}</span>
				<select value={selectValueFor(choice)} onchange={(e) => handleSelect(part, (e.target as HTMLSelectElement).value as SelectValue)}>
					<option value="">{m.confirm_parts_choose_placeholder()}</option>
					{#each VOICE_PARTS as base (base)}
						<option value={base}>{capitalize(base)}</option>
					{/each}
					<option value="accompaniment">{m.confirm_parts_accompaniment_option()}</option>
				</select>
			</label>
			{#if choice?.kind === 'voice'}
				<label class="field confirm-parts-desk">
					<span>{m.confirm_parts_desk_label()}</span>
					<input
						type="number"
						min="1"
						value={choice.subIndex ?? ''}
						oninput={(e) => handleDeskInput(part, choice, (e.target as HTMLInputElement).value)}
					/>
				</label>
			{/if}
		</div>
	{/each}
</div>

<style>
	.confirm-parts {
		gap: 0.75rem;
	}

	.confirm-parts-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}

	.confirm-parts-row:first-of-type {
		padding-top: 0;
		border-top: none;
	}

	.confirm-parts-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1 1 8rem;
	}

	.confirm-parts-name {
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--text);
	}

	.confirm-parts-pitch {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.confirm-parts-select {
		flex: 1 1 9rem;
	}

	.confirm-parts-desk {
		flex: 0 0 4.5rem;
	}

	.confirm-parts-desk input {
		width: 100%;
	}
</style>
