<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { GroupCustomPageOut } from '$lib/server/backendTypes';
	import type { PageData } from '../$types';

	let { data, mode }: { data: PageData; mode: 'member' | 'admin' } = $props();

	// `data.customPages` holds every status for an admin (the
	// admin-management list) and published-only for a real member (the
	// separate member-facing list route, B23 fast-follow). Filtering to
	// `published` here is a no-op for a member but keeps this component
	// correct even if `data` ever carried a wider set for that mode.
	let visiblePages = $derived(
		mode === 'admin' ? data.customPages : data.customPages.filter((p) => p.status === 'published')
	);

	const STATUS_LABELS: Record<GroupCustomPageOut['status'], () => string> = {
		draft: m.pages_status_draft,
		published: m.pages_status_published,
		archived: m.pages_status_archived
	};
</script>

{#if visiblePages.length === 0}
	<p class="empty">{mode === 'admin' ? m.pages_no_pages_admin_tab() : m.pages_no_pages_member()}</p>
{:else}
	{#each visiblePages as p (p.id)}
		<div class="card">
			<div class="list-row">
				<span class="card-eyebrow">{p.title}</span>
				{#if mode === 'admin'}<span class="dim">{STATUS_LABELS[p.status]()}</span>{/if}
			</div>
			<div class="btn-row">
				<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/pages/${p.slug}`)}>{m.pages_view()}</a>
			</div>
		</div>
	{/each}
{/if}
