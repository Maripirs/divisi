<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A3: click-to-confirm for a destructive action. Owns nothing but the
	 * idle↔confirming toggle and its mutual exclusion — the ~8 hand-rolled
	 * copies across the group page and the annotation sheet each carried
	 * their own module-level `confirming*` state var (usually keyed by item
	 * id: `confirmingDeleteX === row.id`) plus an `{#if}/{:else}` to swap a
	 * trigger for a [cancel] [do it] pair.
	 *
	 * Every one of those pairs looks different — plain text links, a
	 * `btn-danger` in a `.btn-row`, corner trash icons that submit via
	 * `formaction` — so the two views stay slotted rather than
	 * parameterised: `trigger` gets a `start` callback, `confirm` gets a
	 * `cancel` callback.
	 *
	 * State is local to each instance, so it needs no per-row keying and
	 * resets whenever the surrounding `{#if}` unmounts it (leaving an edit
	 * panel, the confirmed row disappearing after a successful delete). On a
	 * *failed* submit the pair stays open — the page renders the error, and
	 * the user retries or cancels from where they are — rather than snapping
	 * back to idle the way the old inline `afterSubmit` resets did. Pass
	 * `bind:confirming` if a caller needs to drive it. */
	let {
		trigger,
		confirm,
		confirming = $bindable(false)
	}: {
		trigger: Snippet<[() => void]>;
		confirm: Snippet<[() => void]>;
		confirming?: boolean;
	} = $props();
</script>

{#if confirming}
	{@render confirm(() => (confirming = false))}
{:else}
	{@render trigger(() => (confirming = true))}
{/if}
