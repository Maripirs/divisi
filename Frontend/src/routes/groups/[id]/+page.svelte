<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import RoleSwitch from '$lib/components/RoleSwitch.svelte';
	import GroupGuestGate from '$lib/components/GroupGuestGate.svelte';
	import HomeworkTab from './tabs/HomeworkTab.svelte';
	import TracksTab from './tabs/TracksTab.svelte';
	import WeeklyNotesTab from './tabs/WeeklyNotesTab.svelte';
	import MembersTab from './tabs/MembersTab.svelte';
	import ResponsibilitiesTab from './tabs/ResponsibilitiesTab.svelte';
	import CarpoolTab from './tabs/CarpoolTab.svelte';
	import AboutTab from './tabs/AboutTab.svelte';
	import { computeGroupTabs, type BuiltinTabKey } from './groupTabs';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The seven built-in tabs switch with local `$state` (zero navigation) —
	// see `groupTabs.ts`.
	type Tab = BuiltinTabKey;

	// Admin mode is a *view* of this same group page, not a separate
	// destination (UX_WIREFRAME.md's Admin Experience) — reachable via the
	// role switcher below, or a direct `?view=admin` link (what the old
	// `/groups/[id]/admin` route now redirects to). Defaults to member
	// view even for an admin, per the human's call on this doc's own open
	// question ("member or admin view by default?").
	let mode = $state<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	// `data.gate`: a logged-out visitor on a password-gated group's bare link
	// (`+layout.server.ts`'s `resolveGroupGuestGate`), where the
	// `<GroupGuestGate>` card in the markup is the entire page. A truthiness
	// check, not `'gate' in data`: the shared layout always returns a `gate`
	// key (see its own doc comment on why), just `undefined` outside this
	// branch. `data.group` stays `GroupOut | undefined` in `PageData` for
	// the same reason regardless of which branch we're actually in
	// (TypeScript can't correlate two independently-optional fields), so the
	// two spots below that read it while still inside a `data.gate ?`
	// ternary use `!`: see `groupTabs.ts`'s `assertUngated` doc comment for
	// the full story; there's no assertion-function equivalent usable
	// inside a ternary.
	const isAdmin = data.gate ? false : data.group!.role === 'admin';

	// F31/B31: the ordered, filtered, labeled built-in tab list. See
	// `groupTabs.ts`.
	let tabs = $derived(data.gate ? [] : computeGroupTabs(data, mode));
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
		data.gate
			? 'tracks'
			: requestedTab && builtinVisible(requestedTab)
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

{#if data.gate}
	<GroupGuestGate
		groupName={data.gate.groupName}
		code={data.gate.code}
		targetSuffix={data.gate.targetSuffix}
		redirectTo={page.url.pathname + page.url.search}
	/>
{:else}
<main class="shell" class:shell--wide={tab === 'carpool'}>
	<!-- `data.group!` throughout this block (never plain `data.group`): its
	     type is `GroupOut | undefined` purely to accommodate the `data.gate`
	     branch above, which this whole `<main>` never renders from. See
	     `groupTabs.ts`'s `assertUngated` doc comment. `assertUngated` itself
	     narrows the *script*'s own top-level declarations (`isAdmin`/`tab`
	     above) and every Tab component's own `data` below (each calls it
	     itself); it can't reach into markup nested inside a plain element
	     like this `<main>` the same way ({@const} narrowing doesn't cross an
	     element boundary), so this file's own template reads stay on the
	     equivalent `!`. -->
	<AppHeader title={data.group!.name} />

	{#if showCreatedBanner}
		<section class="card card--highlight">
			<p class="card-eyebrow">{m.groups_created({ name: data.group!.name })}</p>
			<div class="list-row"><span>{m.groups_join_code()}</span><span class="dim">{data.group!.join_code}</span></div>
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
				<a class="btn btn-outline" href={lh(`/groups/${data.group!.id}/admin/new-homework`)}>{m.groups_create_homework()}</a>
				<button type="button" class="btn btn-primary" onclick={() => (showCreatedBanner = false)}>
					{m.groups_view_group()}
				</button>
			</div>
		</section>
	{/if}

	{#if isAdmin}
		<RoleSwitch {mode} onSwitch={() => (mode = mode === 'admin' ? 'member' : 'admin')} />
	{/if}

	<!-- F38: `.tab-strip` keeps this one row on mobile (horizontal scroll)
	     instead of `.tabs`' own wrap, which pushed page content down by a
	     variable amount as tabs toggled on/off. -->
	<div class="tabs tab-strip" role="tablist">
		{#each tabs as t (t.key)}
			<button class="tab" class:active={tab === t.key} onclick={() => (tab = t.key)}>{t.label}</button>
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
	{:else if tab === 'carpool'}
		<CarpoolTab {data} {form} {mode} />
	{:else}
		<AboutTab {data} {form} {mode} />
	{/if}
</main>

<BottomNav />
{/if}
