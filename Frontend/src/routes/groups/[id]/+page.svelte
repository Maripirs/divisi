<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import HomeworkTab from './tabs/HomeworkTab.svelte';
	import TracksTab from './tabs/TracksTab.svelte';
	import WeeklyNotesTab from './tabs/WeeklyNotesTab.svelte';
	import MembersTab from './tabs/MembersTab.svelte';
	import ResponsibilitiesTab from './tabs/ResponsibilitiesTab.svelte';
	import AboutTab from './tabs/AboutTab.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Same five tab slots in both modes, just relabeled — see the `tab`
	// picker below. Keeping one `tab` state (rather than separate
	// member/admin tab state) means switching modes never has to remap a
	// tab selection that doesn't exist on the other side.
	type Tab = 'primary' | 'tracks' | 'weeklyNotes' | 'members' | 'responsibilities' | 'about';

	// Admin mode is a *view* of this same group page, not a separate
	// destination (UX_WIREFRAME.md's Admin Experience) — reachable via the
	// role switcher below, or a direct `?view=admin` link (what the old
	// `/groups/[id]/admin` route now redirects to). Defaults to member
	// view even for an admin, per the human's call on this doc's own open
	// question ("member or admin view by default?").
	let mode = $state<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	const isAdmin = data.group.role === 'admin';

	// B12: a member only sees a tab whose page is actually enabled for
	// them — `data.*Enabled` comes back `true` unconditionally for an admin
	// (the Backend's member-page gate always passes for admins), so admin
	// mode shows every tab regardless of the real per-page settings; the
	// admin's own settings tab (below) is where those real settings show.
	// Tracks/About have no page gate on the member-facing routes yet, so
	// they're always shown.
	const tabsInOrder: Tab[] = ['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about'];
	function tabVisible(t: Tab): boolean {
		if (mode === 'admin') return true;
		if (t === 'primary') return data.homeworkEnabled;
		if (t === 'weeklyNotes') return data.weeklyNotesEnabled;
		if (t === 'members') return data.membersEnabled;
		if (t === 'responsibilities') return data.responsibilitiesEnabled;
		return true;
	}
	let visibleTabs = $derived(tabsInOrder.filter(tabVisible));

	// Homework (the "primary" tab) is the default landing tab, but it's a
	// dead end with nothing to show when the group has none yet (or isn't
	// even visible to this member) — Rehearsal Tracks is the one that's
	// actually useful to land on then. A deep link (`?tab=responsibilities`,
	// used by Home's "Upcoming responsibilities" list) overrides that
	// default when the requested tab is actually reachable.
	const requestedTab = page.url.searchParams.get('tab') as Tab | null;
	let tab = $state<Tab>(
		requestedTab && tabsInOrder.includes(requestedTab) && tabVisible(requestedTab)
			? requestedTab
			: data.homework.length === 0 || !tabVisible('primary')
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
		<div class="role-switch">
			<span>{m.groups_viewing_as({ role: mode === 'admin' ? m.groups_role_admin() : m.groups_role_member() })}</span>
			<button type="button" class="text-link" onclick={() => (mode = mode === 'admin' ? 'member' : 'admin')}>
				{m.groups_switch_to({ role: mode === 'admin' ? m.groups_role_member() : m.groups_role_admin() })}
			</button>
		</div>
	{/if}

	<div class="tabs" role="tablist">
		{#each visibleTabs as t (t)}
			<button class="tab" class:active={tab === t} onclick={() => (tab = t)}>
				{#if t === 'primary'}{mode === 'admin' ? m.groups_assignments() : m.homework_tab_title()}
				{:else if t === 'tracks'}{mode === 'admin' ? m.groups_tracks() : m.tracks_tab_title()}
				{:else if t === 'weeklyNotes'}{m.weekly_notes_tab_title()}
				{:else if t === 'members'}{m.groups_members_tab_title()}
				{:else if t === 'responsibilities'}{m.responsibilities_tab_title()}
				{:else}{mode === 'admin' ? m.groups_settings() : m.groups_info()}{/if}
			</button>
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
