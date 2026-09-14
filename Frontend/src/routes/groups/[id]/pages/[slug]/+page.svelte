<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import RoleSwitch from '$lib/components/RoleSwitch.svelte';
	import GroupGuestGate from '$lib/components/GroupGuestGate.svelte';
	import { computeGroupTabs } from '../../groupTabs';
	import '$lib/styles/shell.css';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// F31: same "which view is this" query param the main group page reads
	// (`+page.svelte`) — a link into this page carries it along so the tab
	// strip shows the same set of tabs the visitor just left, and every
	// link back out carries it forward again.
	let mode = $derived<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	// `data.gate`: a logged-out visitor on a password-gated group's
	// custom-page link (`+layout.server.ts`'s `resolveGroupGuestGate`), where
	// the `<GroupGuestGate>` card below is the entire page. A truthiness
	// check, not `'gate' in data`: the shared layout always returns a `gate`
	// key, just `undefined` outside this branch. See the main group page's
	// own `+page.svelte` for the same guard on the same reasoning.
	let tabs = $derived(data.gate ? [] : computeGroupTabs(data, mode));
</script>

{#if data.gate}
	<GroupGuestGate
		groupName={data.gate.groupName}
		code={data.gate.code}
		targetSuffix={data.gate.targetSuffix}
		redirectTo={page.url.pathname + page.url.search}
	/>
{:else}
<main class="shell">
	<!-- The group's name, not this custom page's own title: every other tab
	     under this group keeps the group name in the header (the main group
	     page passes data.group.name the same way), so a custom page like
	     Carpool switching the header to its own title read like leaving the
	     group entirely rather than just changing tabs.

	     `data.group!`/`data.user!` here and below: their types are
	     `GroupOut | undefined`/`SessionUser | null` purely to accommodate
	     the `data.gate` branch above, which this whole `<main>` never
	     renders from. See `groupTabs.ts`'s `assertUngated` doc comment
	     (that assertion narrows every Tab component's own `data`, but can't
	     reach into markup nested inside a plain element like this `<main>`,
	     hence the equivalent `!` here instead). -->
	<AppHeader title={data.group!.name} />

	{#if data.isAdmin}
		<!-- A custom page is a real route rather than the main group page's
		     local tab state, so unlike there (`RoleSwitch` gets `onSwitch`
		     flipping `$state`), this passes `href`: a plain link toggling
		     `?view=admin` on the current URL, same source of truth the tab
		     strip below already reads `mode` from. -->
		<RoleSwitch
			{mode}
			href={lh(`/groups/${data.groupId}/pages/${data.customPage.slug}${mode === 'admin' ? '' : '?view=admin'}`)}
		/>
	{/if}

	<div class="tabs" role="tablist">
		{#each tabs as t (t.key ?? t.slug)}
			{#if t.key !== null}
				<a class="tab" href={lh(`/groups/${data.groupId}?tab=${t.key}${mode === 'admin' ? '&view=admin' : ''}`)}>
					{t.label}
				</a>
			{:else}
				<a
					class="tab"
					class:active={t.slug === data.customPage.slug}
					href={lh(`/groups/${data.groupId}/pages/${t.slug}${mode === 'admin' ? '?view=admin' : ''}`)}
				>
					{t.label}
				</a>
			{/if}
		{/each}
	</div>

	{#if data.customPage.template_key === 'carpool_board'}
		<CarpoolBoard
			pageId={data.customPage.id}
			isAdmin={data.isAdmin && mode === 'admin'}
			userId={data.user!.id}
			userName={data.user!.name}
			events={data.events}
			selectedEventId={data.selectedEventId}
			posts={data.posts}
			{form}
		/>
	{:else}
		<CustomPageView title={data.customPage.title} templateKey={data.customPage.template_key} />
	{/if}
</main>

<BottomNav />
{/if}
