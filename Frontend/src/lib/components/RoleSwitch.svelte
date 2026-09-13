<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	/** The "Viewing as Admin/Member · Switch to X" bar an admin sees at the
	 * top of a group's own tabs (`/groups/[id]/+page.svelte`) and, F31, any
	 * of that group's custom pages (`/groups/[id]/pages/[slug]/+page.svelte`)
	 * — one shared bar rather than two copies of the same markup/strings,
	 * since the only real difference between the two call sites is *how* the
	 * switch happens: the main group page swaps its own local `$state` (its
	 * six built-in tabs are local view state, no navigation), so it passes
	 * `onSwitch`; a custom page is a real route with no such local state, so
	 * it passes `href` (toggling the `?view=admin` query param) instead.
	 * Exactly one of the two is expected — whichever the caller doesn't need
	 * stays `undefined`. */
	let {
		mode,
		onSwitch,
		href
	}: {
		mode: 'member' | 'admin';
		onSwitch?: () => void;
		href?: string;
	} = $props();
</script>

<div class="role-switch">
	<span>{m.groups_viewing_as({ role: mode === 'admin' ? m.groups_role_admin() : m.groups_role_member() })}</span>
	{#if href !== undefined}
		<a class="text-link" {href}>
			{m.groups_switch_to({ role: mode === 'admin' ? m.groups_role_member() : m.groups_role_admin() })}
		</a>
	{:else}
		<button type="button" class="text-link" onclick={onSwitch}>
			{m.groups_switch_to({ role: mode === 'admin' ? m.groups_role_member() : m.groups_role_admin() })}
		</button>
	{/if}
</div>

<style>
	.role-switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.role-switch .text-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
	}
</style>
