<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatDateTime } from '$lib/utils/dates';
	import { m } from '$lib/paraglide/messages';
	import type { ResponsibilityDateCardItem, ResponsibilityRole } from './groupCards';

	/** A1: one responsibility-date card, shared between the member group
	 * page and the guest join page. Both render the same
	 * date (+ canceled/locked) eyebrow, schedule-name title, optional
	 * notes, and one coverage row per role.
	 *
	 * The coverage indicator is standardized on the `badge--{status}` chip
	 * both sides (the guest page previously used a plain dimmed label);
	 * `coverageLabel` moved in here from the two identical copies.
	 *
	 * `editing` + `edit` (member admin): replaces the header with the
	 * slotted edit form. `roleExtra(role)` renders under each role's
	 * coverage row — the member page's signup list + assign/sign-up
	 * controls; the guest page passes nothing. `children` renders after all
	 * roles — the member page's edit / lock / cancel / delete row. */
	let {
		item,
		editing = false,
		edit,
		roleExtra,
		children
	}: {
		item: ResponsibilityDateCardItem;
		editing?: boolean;
		edit?: Snippet;
		roleExtra?: Snippet<[ResponsibilityRole]>;
		children?: Snippet;
	} = $props();

	function coverageLabel(status: string): string {
		if (status === 'underfilled') return m.join_coverage_underfilled();
		if (status === 'overfilled') return m.join_coverage_overfilled();
		return m.join_coverage_covered();
	}
</script>

<section class="card">
	{#if editing && edit}
		{@render edit()}
	{:else}
		<p class="card-eyebrow">
			{formatDateTime(item.date)}{#if item.canceled} · {m.responsibilities_canceled()}{:else if item.locked} · {m.responsibilities_locked()}{/if}
		</p>
		<p class="card-title">{item.scheduleName}</p>
		{#if item.notes}
			<p class="card-note">{item.notes}</p>
		{/if}
	{/if}

	{#each item.roles as role (role.roleId)}
		<div class="responsibility-role">
			<div class="list-row">
				<span>{role.roleName} · {role.activeCount}/{role.neededCount}</span>
				<span class="badge badge--{role.status}">{coverageLabel(role.status)}</span>
			</div>
			{@render roleExtra?.(role)}
		</div>
	{/each}

	{@render children?.()}
</section>

<style>
	.responsibility-role {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.responsibility-role:first-of-type {
		border-top: none;
		padding-top: 0;
	}

	.badge {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.badge--covered {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.badge--underfilled {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
	}

	.badge--overfilled {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
	}
</style>
