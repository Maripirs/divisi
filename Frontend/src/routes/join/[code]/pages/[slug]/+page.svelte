<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import CustomPageView from '$lib/components/CustomPageView.svelte';
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<main class="shell">
	<AppHeader title={data.customPage.title} homeHref={lh('/welcome')} />
	<a class="text-link" href={lh(`/join/${data.code}`)}>{m.pages_back()}</a>
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
