<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import { computeGuestTabs } from '../../joinTabs';
	import '$lib/styles/shell.css';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tabs = $derived(computeGuestTabs(data));
</script>

<main class="shell">
	<!-- The group's own name, not this custom page's title, same fix as the
	     member-side route: every other guest tab keeps the group name in the
	     header. -->
	<AppHeader title={data.groupName} homeHref={lh('/welcome')} />

	<div class="tabs" role="tablist">
		{#each tabs as t (t.key ?? t.slug)}
			{#if t.key !== null}
				<a class="tab" href={lh(`/join/${data.code}?tab=${t.key}`)}>{t.label}</a>
			{:else}
				<a class="tab" class:active={t.slug === data.slug} href={lh(`/join/${data.code}/pages/${t.slug}`)}>
					{t.label}
				</a>
			{/if}
		{/each}
	</div>

	{#if data.customPage.templateKey === 'carpool_board'}
		<!-- F29: `pageId`/`userId` are member-only concerns (event create is
		     admin-only, and ownership uses `guest` mode's own tracking
		     instead) — the `guest` prop is what actually switches
		     `CarpoolBoard` from form-action submits to the `/join/[code]/
		     carpool/...` proxy routes below, with no admin controls since a
		     guest is never an admin. -->
		<CarpoolBoard
			pageId=""
			isAdmin={false}
			userId=""
			events={data.events}
			selectedEventId={data.selectedEventId}
			posts={data.posts}
			form={null}
			guest={{ code: data.code }}
		/>
	{:else}
		<CustomPageView title={data.customPage.title} templateKey={data.customPage.templateKey} />
	{/if}
</main>
