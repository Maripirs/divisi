<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import RoleSwitch from '$lib/components/RoleSwitch.svelte';
	import HomeworkTab from './tabs/HomeworkTab.svelte';
	import TracksTab from './tabs/TracksTab.svelte';
	import WeeklyNotesTab from './tabs/WeeklyNotesTab.svelte';
	import MembersTab from './tabs/MembersTab.svelte';
	import ResponsibilitiesTab from './tabs/ResponsibilitiesTab.svelte';
	import AboutTab from './tabs/AboutTab.svelte';
	import { computeGroupTabs, type BuiltinTabKey } from './groupTabs';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The six built-in tabs still switch with local `$state` (zero
	// navigation) — a custom page is never one of these, see `groupTabs.ts`.
	type Tab = BuiltinTabKey;

	// Admin mode is a *view* of this same group page, not a separate
	// destination (UX_WIREFRAME.md's Admin Experience) — reachable via the
	// role switcher below, or a direct `?view=admin` link (what the old
	// `/groups/[id]/admin` route now redirects to). Defaults to member
	// view even for an admin, per the human's call on this doc's own open
	// question ("member or admin view by default?").
	let mode = $state<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	const isAdmin = data.group.role === 'admin';

	// F31: the ordered, filtered, labeled tab list — built-ins plus one
	// entry per visible custom page — shared with `pages/[slug]/+page.svelte`
	// so the strip renders identically on either route. See `groupTabs.ts`.
	let tabs = $derived(computeGroupTabs(data, mode));
	function builtinVisible(key: Tab): boolean {
		return tabs.some((t) => t.key === key);
	}

	// Homework (the "primary" tab) is the default landing tab, but it's a
	// dead end with nothing to show when the group has none yet (or isn't
	// even visible to this member) — Rehearsal Tracks is the one that's
	// actually useful to land on then. A deep link (`?tab=responsibilities`,
	// used by Home's "Upcoming responsibilities" list, and by a custom
	// page's own tab strip linking back here) overrides that default when
	// the requested tab is actually reachable.
	const requestedTab = page.url.searchParams.get('tab') as Tab | null;
	let tab = $state<Tab>(
		requestedTab && builtinVisible(requestedTab)
			? requestedTab
			: data.homework.length === 0 || !builtinVisible('primary')
				? 'tracks'
				: 'primary'
	);

	// One-time confirmation right after `/groups/new` creates this group —
	// UX_WIREFRAME.md's Create Group Flow wants a "created" screen with the
	// join code and quick next actions; shown as a dismissable banner here
	// rather than a separate route, since a brand-new group is otherwise
	// just this same admin view.
	let showCreatedBanner = $state(page.url.searchParams.get('created') === '1');
</script>

<main class="shell">
	<AppHeader title={data.group.name} />

	{#if showCreatedBanner}
		<section class="card card--highlight">
			<p class="card-eyebrow">{m.groups_created({ name: data.group.name })}</p>
			<div class="list-row"><span>{m.groups_join_code()}</span><span class="dim">{data.group.join_code}</span></div>
			<p class="card-note">{m.groups_share_join_code()}</p>
			<div class="btn-row">
				<button
					type="button"
					class="btn btn-outline"
					onclick={() => {
						tab = 'members';
						showCreatedBanner = false;
					}}
				>
					{m.groups_invite_members()}
				</button>
				<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/admin/new-homework`)}>{m.groups_create_homework()}</a>
				<button type="button" class="btn btn-primary" onclick={() => (showCreatedBanner = false)}>
					{m.groups_view_group()}
				</button>
			</div>
		</section>
	{/if}

	{#if isAdmin}
		<RoleSwitch {mode} onSwitch={() => (mode = mode === 'admin' ? 'member' : 'admin')} />
	{/if}

	<div class="tabs" role="tablist">
		{#each tabs as t (t.key ?? t.slug)}
			{@const key = t.key}
			{#if key !== null}
				<button class="tab" class:active={tab === key} onclick={() => (tab = key)}>{t.label}</button>
			{:else}
				<!-- F31: a custom page is a real route, not local state — this is
				     a plain link, carrying the current admin/member view along so
				     landing on it (and coming back) doesn't reset that choice. -->
				<a class="tab" href={lh(`/groups/${data.group.id}/pages/${t.slug}${mode === 'admin' ? '?view=admin' : ''}`)}>
					{t.label}
				</a>
			{/if}
		{/each}
	</div>

	{#if tab === 'primary'}
		<HomeworkTab {data} {form} {mode} />
	{:else if tab === 'tracks'}
		<TracksTab {data} {form} {mode} />
	{:else if tab === 'weeklyNotes'}
		<WeeklyNotesTab {data} {form} {mode} />
	{:else if tab === 'members'}
		<MembersTab {data} {form} {mode} />
	{:else if tab === 'responsibilities'}
		<ResponsibilitiesTab {data} {form} {mode} />
	{:else}
		<AboutTab {data} {form} {mode} />
	{/if}
</main>

<BottomNav />
