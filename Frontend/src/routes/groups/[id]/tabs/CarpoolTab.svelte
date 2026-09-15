<script lang="ts">
	import CarpoolBoard from '$lib/components/CarpoolBoard.svelte';
	import { assertUngated } from '../groupTabs';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();
	// This tab only ever mounts from `+page.svelte`'s non-gate branch, so
	// `data.group`/`data.user` are always genuinely defined here: see
	// `groupTabs.ts`'s `assertUngated` doc comment for why they're typed
	// optional/nullable in `PageData` at all. A one-time check at mount, not
	// a reactive read of `data` (it never meaningfully changes afterward).
	// svelte-ignore state_referenced_locally
	assertUngated(data);
</script>

<!-- B31/F36: carpool as a plain built-in tab, same shape as every other
     `tabs/*.svelte` component — `mode === 'admin'` is this tab's own
     admin-view gate, same as `ResponsibilitiesTab`'s. `CarpoolBoard` itself
     is unchanged from the old `pages/[slug]` custom-page route: it never
     cared whether its content lived behind a slug or a plain tab, only
     whether it's rendering for an admin, a member, or a guest. -->
<CarpoolBoard
	isAdmin={mode === 'admin'}
	userId={data.user.id}
	userName={data.user.name}
	events={data.carpoolEvents}
	selectedEventId={data.carpoolSelectedEventId}
	posts={data.carpoolPosts}
	{form}
/>
