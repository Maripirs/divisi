<script lang="ts">
	import { enhance } from '$app/forms';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { GroupCustomPageOut, PageAudience, PageMinIdentity } from '$lib/server/backendTypes';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();

	// F27: `data.customPages` already holds every status for an admin (the
	// admin-management list `+page.server.ts` loads) and is empty for a real
	// member (that list route 403s for a non-admin, see this codebase's own
	// comment there on why there's no member-facing "list" route yet, only a
	// by-slug one). A member never sees a draft/archived page either way, so
	// filtering to `published` here is a no-op for a real member today and
	// exactly the right thing to do once a member-facing list exists.
	let visiblePages = $derived(
		mode === 'admin' ? data.customPages : data.customPages.filter((p) => p.status === 'published')
	);

	const STATUS_LABELS: Record<GroupCustomPageOut['status'], () => string> = {
		draft: m.pages_status_draft,
		published: m.pages_status_published,
		archived: m.pages_status_archived
	};

	// Admin create-page flow. Only Carpool board exists as a template today
	// (`GroupCustomPageTemplate` has one member), but the field is still a
	// real `<select>` sent to the Backend rather than hardcoded, so a second
	// template value shows up here first.
	let creatingPage = $state(false);

	// Inline edit (title + visibility), same shape as WeeklyNotesTab's
	// per-item edit state. `status` isn't editable here: that's the
	// publish/unpublish/archive buttons below, not this form.
	let editingPageId = $state<string | null>(null);
	let editTitleDraft = $state('');
	let editAudienceDraft = $state<PageAudience>('members');
	let editMinIdentityDraft = $state<PageMinIdentity>('anyone');
	let savingPageEdit = $state(false);

	function startEdit(p: GroupCustomPageOut) {
		editTitleDraft = p.title;
		editAudienceDraft = p.audience;
		editMinIdentityDraft = p.min_identity;
		editingPageId = p.id;
	}
</script>

{#if mode === 'admin'}
	<section class="card">
		<p class="card-eyebrow">{m.pages_create_page()}</p>
		<form method="POST" action="?/createCustomPage" use:enhance={withSubmitting((v) => (creatingPage = v))}>
			<label class="field">
				<span>{m.new_homework_title_field()}</span>
				<input name="title" required />
			</label>
			<label class="field">
				<span>{m.pages_template_field()}</span>
				<select name="templateKey">
					<option value="carpool_board">{m.pages_template_carpool_board()}</option>
				</select>
			</label>
			<label class="field">
				<span>{m.pages_visibility_field()}</span>
				<select name="audience">
					<option value="members">{m.groups_members_only()}</option>
					<option value="everyone">{m.groups_everyone_guests_too()}</option>
				</select>
			</label>
			<label class="field">
				<span>{m.pages_min_identity_field()}</span>
				<select name="minIdentity">
					<option value="anyone">{m.pages_min_identity_anyone()}</option>
					<option value="saved">{m.pages_min_identity_saved()}</option>
				</select>
			</label>
			{#if form?.form === 'createPage' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button class="btn btn-primary btn-block" type="submit" disabled={creatingPage}>
				{creatingPage ? m.pages_creating() : m.pages_create_button()}
			</button>
		</form>
	</section>
{/if}

{#if visiblePages.length === 0}
	<p class="empty">{mode === 'admin' ? m.pages_no_pages_admin() : m.pages_no_pages_member()}</p>
{:else}
	{#each visiblePages as p (p.id)}
		<div class="card">
			<div class="list-row">
				<span class="card-eyebrow">{p.title}</span>
				{#if mode === 'admin'}<span class="dim">{STATUS_LABELS[p.status]()}</span>{/if}
			</div>

			{#if mode === 'admin' && editingPageId === p.id}
				<EditableCard
					saveAction="?/updateCustomPage"
					deleteAction="?/deleteCustomPage"
					idName="pageId"
					idValue={p.id}
					bind:saving={savingPageEdit}
					error={form?.form === 'editPage' && form?.error}
					deleteLabel={m.pages_delete()}
					deleteConfirmLabel={m.pages_delete_confirm()}
					onCancel={() => (editingPageId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.new_homework_title_field()}</span>
							<input name="title" bind:value={editTitleDraft} required />
						</label>
						<label class="field">
							<span>{m.pages_visibility_field()}</span>
							<select name="audience" bind:value={editAudienceDraft}>
								<option value="members">{m.groups_members_only()}</option>
								<option value="everyone">{m.groups_everyone_guests_too()}</option>
							</select>
						</label>
						<label class="field">
							<span>{m.pages_min_identity_field()}</span>
							<select name="minIdentity" bind:value={editMinIdentityDraft}>
								<option value="anyone">{m.pages_min_identity_anyone()}</option>
								<option value="saved">{m.pages_min_identity_saved()}</option>
							</select>
						</label>
					{/snippet}
				</EditableCard>
			{:else}
				<div class="btn-row">
					<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/pages/${p.slug}`)}>{m.pages_view()}</a>
					{#if mode === 'admin'}
						<button type="button" class="btn btn-outline" onclick={() => startEdit(p)}>{m.drawer_edit()}</button>
						{#if p.status === 'published'}
							<form method="POST" action="?/unpublishCustomPage" use:enhance>
								<input type="hidden" name="pageId" value={p.id} />
								<button type="submit" class="btn btn-outline">{m.pages_unpublish()}</button>
							</form>
						{:else if p.status === 'draft'}
							<form method="POST" action="?/publishCustomPage" use:enhance>
								<input type="hidden" name="pageId" value={p.id} />
								<button type="submit" class="btn btn-outline">{m.pages_publish()}</button>
							</form>
						{/if}
						{#if p.status !== 'archived'}
							<form method="POST" action="?/archiveCustomPage" use:enhance>
								<input type="hidden" name="pageId" value={p.id} />
								<button type="submit" class="btn btn-outline">{m.pages_archive()}</button>
							</form>
						{/if}
					{/if}
				</div>
				{#if form?.form === 'pageStatus' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
			{/if}
		</div>
	{/each}
{/if}
