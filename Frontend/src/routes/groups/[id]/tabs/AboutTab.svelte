<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import type { GroupCustomPageOut, GroupPage, PageAudience, PageMinIdentity } from '$lib/server/backendTypes';
	import { WEEKDAY_LABELS, formatRehearsalSchedule } from '../rehearsalSchedule';
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

	// Info/About tab: the admin's description editor.
	let editingDescription = $state(false);
	let descriptionDraft = $state(data.group.description ?? '');
	let savingDescription = $state(false);
	// Info/About tab: the admin's "Regular rehearsals" editor — a weekly
	// day+time (e.g. "Wednesdays at 7:00 PM") the Responsibilities tab's
	// "Next rehearsal" button anchors new dates to.
	let editingRehearsal = $state(false);
	let rehearsalWeekdayDraft = $state(
		data.group.rehearsal_weekday !== null ? String(data.group.rehearsal_weekday) : ''
	);
	let rehearsalTimeDraft = $state(data.group.rehearsal_time ?? '');
	let savingRehearsal = $state(false);
	// Info/About tab: "Leave group" in-flight flag (the click-to-confirm
	// toggle itself lives in its `ConfirmButton`).
	let leavingGroup = $state(false);
	// Info/About tab: "Copy link" briefly confirms itself, same pattern as
	// elsewhere in this file for a one-shot action with no server round trip.
	let joinLinkCopied = $state(false);
	async function copyJoinLink() {
		// `data.group!`, not plain `data.group`: `assertUngated(data)` above
		// narrows it for this file's own top-level code, but not inside a
		// closure like this one (TS doesn't carry narrowing into a function
		// body that might run later). See `groupTabs.ts`'s `assertUngated`
		// doc comment.
		const link = `${page.url.origin}/join/${data.group!.join_code}`;
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			// Clipboard access can be denied (permissions, non-secure
			// context) — nothing useful to recover into beyond not showing
			// a false "Copied!".
			return;
		}
		joinLinkCopied = true;
		setTimeout(() => (joinLinkCopied = false), 2000);
	}

	let removePassword = $state(false);
	let savingGuestSettings = $state(false);
	let savingPageSettings = $state(false);

	const PAGE_LABELS: Record<GroupPage, () => string> = {
		homework: m.homework_tab_title,
		tracks: m.tracks_tab_title,
		weekly_notes: m.weekly_notes_tab_title,
		members: m.groups_members_tab_title,
		about: m.groups_about_tab_title,
		responsibilities: m.responsibilities_tab_title
	};
	const PAGE_ORDER: GroupPage[] = ['homework', 'tracks', 'weekly_notes', 'members', 'about', 'responsibilities'];
	// Real two-way local state for the page-visibility form (matching the
	// tabs' order, not the Backend's alphabetical one) — a plain one-way
	// `checked={...}`/`selected={...}` binding here was the actual bug
	// behind "saving page settings reset all the checkmarks": with no
	// `bind:`, a re-render (e.g. `savingPageSettings` flipping) reapplies
	// the checkbox's DOM property straight from `data`, discarding whatever
	// the user had just clicked. `bind:` makes this state the source of
	// truth instead, so a re-render has nothing to discredit it with.
	let pageSettingsDraft = $state(
		PAGE_ORDER.map((page) => {
			const existing = data.pageSettings.find((s) => s.page === page);
			return {
				page,
				enabled: existing?.enabled ?? true,
				audience: (existing?.audience ?? 'members') as PageAudience
			};
		})
	);

	// F30: custom pages (carpool board, etc.) moved here from PagesTab so
	// all page-visibility controls, built-in and custom, live in one place.
	const CUSTOM_PAGE_STATUS_LABELS: Record<GroupCustomPageOut['status'], () => string> = {
		draft: m.pages_status_draft,
		published: m.pages_status_published,
		archived: m.pages_status_archived
	};

	// Inline edit (title + visibility) for a custom page, same shape as the
	// per-page edit state PagesTab used to hold. `status` isn't editable
	// here: that's the toggle/Archive controls below, not this form.
	let editingCustomPageId = $state<string | null>(null);
	let editCustomTitleDraft = $state('');
	let editCustomAudienceDraft = $state<PageAudience>('members');
	let editCustomMinIdentityDraft = $state<PageMinIdentity>('anyone');
	let savingCustomPageEdit = $state(false);

	function startCustomPageEdit(p: GroupCustomPageOut) {
		editCustomTitleDraft = p.title;
		editCustomAudienceDraft = p.audience;
		editCustomMinIdentityDraft = p.min_identity;
		editingCustomPageId = p.id;
	}

	// Admin create-page flow. Only Carpool board exists as a template today
	// (`GroupCustomPageTemplate` has one member), but the field is still a
	// real `<select>` sent to the Backend rather than hardcoded, so a second
	// template value shows up here first.
	let creatingCustomPage = $state(false);
</script>

{#if mode === 'admin'}
	<section class="card">
		<p class="card-eyebrow">{m.groups_settings()}</p>
		<div class="list-row"><span>{m.groups_join_code()}</span><span class="dim">{data.group.join_code}</span></div>
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.groups_description()}</p>
		<p class="card-note">{m.groups_description_note()}</p>
		{#if editingDescription}
			<form
				method="POST"
				action="?/updateDescription"
				use:enhance={withSubmitting((v) => (savingDescription = v), () => (editingDescription = false))}
			>
				<label class="field">
					<span>{m.groups_description()}</span>
					<textarea
						name="description"
						bind:value={descriptionDraft}
						rows="4"
						placeholder={m.groups_description_placeholder()}
					></textarea>
				</label>
				{#if form?.form === 'description' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => (editingDescription = false)}>
						{m.action_cancel()}
					</button>
					<button class="btn btn-primary" type="submit" disabled={savingDescription}>
						{savingDescription ? m.reset_password_saving() : m.action_save()}
					</button>
				</div>
			</form>
		{:else}
			{#if data.group.description}
				<p class="card-meta body">{data.group.description}</p>
			{:else}
				<p class="card-note">{m.groups_no_description()}</p>
			{/if}
			<button
				type="button"
				class="text-link"
				onclick={() => {
					descriptionDraft = data.group.description ?? '';
					editingDescription = true;
				}}
			>
				{data.group.description ? m.groups_edit_description() : m.groups_add_description()}
			</button>
		{/if}
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.groups_rehearsals()}</p>
		<p class="card-note">
			{m.groups_rehearsals_note()}
		</p>
		{#if editingRehearsal}
			<form
				method="POST"
				action="?/updateRehearsalSchedule"
				use:enhance={withSubmitting((v) => (savingRehearsal = v), () => (editingRehearsal = false))}
			>
				<label class="field">
					<span>{m.groups_day()}</span>
					<select name="weekday" bind:value={rehearsalWeekdayDraft}>
						<option value="">{m.groups_no_regular_rehearsal()}</option>
						{#each WEEKDAY_LABELS as label, i (i)}
							<option value={String(i)}>{label()}</option>
						{/each}
					</select>
				</label>
				{#if rehearsalWeekdayDraft !== ''}
					<label class="field">
						<span>{m.groups_time()}</span>
						<input type="time" name="time" bind:value={rehearsalTimeDraft} required />
					</label>
				{/if}
				{#if form?.form === 'rehearsalSchedule' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => (editingRehearsal = false)}>
						{m.action_cancel()}
					</button>
					<button class="btn btn-primary" type="submit" disabled={savingRehearsal}>
						{savingRehearsal ? m.reset_password_saving() : m.action_save()}
					</button>
				</div>
			</form>
		{:else}
			{#if data.group.rehearsal_weekday !== null && data.group.rehearsal_time !== null}
				<p class="card-meta">{formatRehearsalSchedule(data.group.rehearsal_weekday, data.group.rehearsal_time)}</p>
			{:else}
				<p class="card-note">{m.groups_no_regular_rehearsal_set()}</p>
			{/if}
			<button
				type="button"
				class="text-link"
				onclick={() => {
					rehearsalWeekdayDraft = data.group.rehearsal_weekday !== null ? String(data.group.rehearsal_weekday) : '';
					rehearsalTimeDraft = data.group.rehearsal_time ?? '';
					editingRehearsal = true;
				}}
			>
				{data.group.rehearsal_weekday !== null ? m.drawer_edit() : m.groups_set_regular_rehearsal()}
			</button>
		{/if}
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.groups_guest_access()}</p>
		<p class="card-note">
			{m.groups_guest_access_note()}
		</p>
		<form
			method="POST"
			action="?/updateGuestSettings"
			use:enhance={withSubmitting((v) => (savingGuestSettings = v), () => (removePassword = false))}
		>
			<label class="field">
				<span>{data.group.has_guest_password ? m.groups_change_password() : m.groups_set_password()}</span>
				<input
					type="password"
					name="guestPassword"
					placeholder={data.group.has_guest_password ? m.groups_leave_blank_keep() : m.groups_leave_blank_none()}
				/>
			</label>
			{#if data.group.has_guest_password}
				<label class="checkline">
					<input type="checkbox" name="removePassword" bind:checked={removePassword} />
					<span>{m.groups_remove_password_entirely()}</span>
				</label>
			{/if}

			{#if form?.form === 'guestSettings' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if form?.form === 'guestSettings' && form?.success}
				<p class="success">{m.groups_saved()}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={savingGuestSettings}>
				{savingGuestSettings ? m.reset_password_saving() : m.groups_save_password()}
			</button>
		</form>
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.groups_page_visibility()}</p>
		<p class="card-note">
			{m.groups_page_visibility_note()}
		</p>
		<form
			method="POST"
			action="?/updatePageSettings"
			use:enhance={() => {
				savingPageSettings = true;
				return async ({ update }) => {
					savingPageSettings = false;
					// SvelteKit's default `update()` calls the native
					// `form.reset()` on success — fine for a one-shot
					// "type something, submit, clear it" form, but wrong
					// here: this form stays visible after saving, and a
					// native reset snaps every checkbox/select back to
					// its bare-markup default (unchecked / first option)
					// since `bind:` values aren't written as literal
					// `checked`/`selected` attributes. The real
					// `pageSettingsDraft` state (and the actual saved
					// data) is untouched either way — this was a purely
					// visual "my toggles reset" bug. `reset: false` is
					// SvelteKit's own escape hatch for exactly this.
					await update({ reset: false });
				};
			}}
		>
			{#each pageSettingsDraft as setting (setting.page)}
				<div class="page-setting-row">
					<label class="checkline">
						<input type="checkbox" name="enabled_{setting.page}" bind:checked={setting.enabled} />
						<span>{PAGE_LABELS[setting.page]()}</span>
					</label>
					<select name="audience_{setting.page}" bind:value={setting.audience}>
						<option value="members">{m.groups_members_only()}</option>
						<option value="everyone">{m.groups_everyone_guests_too()}</option>
					</select>
				</div>
			{/each}

			{#if form?.form === 'pageSettings' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if form?.form === 'pageSettings' && form?.success}
				<p class="success">{m.groups_saved()}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={savingPageSettings}>
				{savingPageSettings ? m.reset_password_saving() : m.groups_save_page_settings()}
			</button>
		</form>

		<!-- Custom pages (carpool board, etc.) as siblings of the built-in
		     rows above, same card/list, not a separate section: the only
		     reason this isn't inside the `<form>` above is that HTML
		     forbids nesting a `<form>` inside another `<form>`, and a
		     custom page's toggle needs its own per-row submit (publish/
		     unpublish), unlike the built-in rows' one shared batch save. -->
		{#each data.customPages as p (p.id)}
			{#if editingCustomPageId === p.id}
				<EditableCard
					saveAction="?/updateCustomPage"
					deleteAction="?/deleteCustomPage"
					idName="pageId"
					idValue={p.id}
					bind:saving={savingCustomPageEdit}
					error={form?.form === 'editPage' && form?.error}
					deleteLabel={m.pages_delete()}
					deleteConfirmLabel={m.pages_delete_confirm()}
					onCancel={() => (editingCustomPageId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.new_homework_title_field()}</span>
							<input name="title" bind:value={editCustomTitleDraft} required />
						</label>
						<label class="field">
							<span>{m.pages_visibility_field()}</span>
							<select name="audience" bind:value={editCustomAudienceDraft}>
								<option value="members">{m.groups_members_only()}</option>
								<option value="everyone">{m.groups_everyone_guests_too()}</option>
							</select>
						</label>
						<label class="field">
							<span>{m.pages_min_identity_field()}</span>
							<select name="minIdentity" bind:value={editCustomMinIdentityDraft}>
								<option value="anyone">{m.pages_min_identity_anyone()}</option>
								<option value="saved">{m.pages_min_identity_saved()}</option>
							</select>
						</label>
					{/snippet}
				</EditableCard>
			{:else}
				<div class="page-setting-row">
					<!-- A custom page has three states, not the built-in rows'
					     plain boolean, so the checkbox only maps draft<->published
					     (via the existing publish/unpublish actions); archived is a
					     separate, more final state reached only through the
					     explicit Archive button below, never by re-checking this
					     box. -->
					<form method="POST" action={p.status === 'published' ? '?/unpublishCustomPage' : '?/publishCustomPage'} use:enhance>
						<input type="hidden" name="pageId" value={p.id} />
						<label class="checkline">
							<input
								type="checkbox"
								checked={p.status === 'published'}
								disabled={p.status === 'archived'}
								onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()}
							/>
							<span>{p.title}</span>
						</label>
					</form>
					<span class="dim">{CUSTOM_PAGE_STATUS_LABELS[p.status]()}</span>
				</div>
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => startCustomPageEdit(p)}>{m.drawer_edit()}</button>
					{#if p.status !== 'archived'}
						<form method="POST" action="?/archiveCustomPage" use:enhance>
							<input type="hidden" name="pageId" value={p.id} />
							<button type="submit" class="btn btn-outline">{m.pages_archive()}</button>
						</form>
					{/if}
				</div>
				{#if form?.form === 'pageStatus' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
			{/if}
		{/each}
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.pages_create_page()}</p>
		<form method="POST" action="?/createCustomPage" use:enhance={withSubmitting((v) => (creatingCustomPage = v))}>
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
			<button class="btn btn-primary btn-block" type="submit" disabled={creatingCustomPage}>
				{creatingCustomPage ? m.pages_creating() : m.pages_create_button()}
			</button>
		</form>
	</section>
{:else}
	<section class="card">
		<p class="card-eyebrow">{m.groups_about_tab_title()}</p>

		{#if data.group.description}
			<p class="card-meta body">{data.group.description}</p>
		{/if}

		{#if data.group.rehearsal_weekday !== null && data.group.rehearsal_time !== null}
			<div class="list-row">
				<span>{m.groups_rehearsals()}</span>
				<span class="dim">{formatRehearsalSchedule(data.group.rehearsal_weekday, data.group.rehearsal_time)}</span>
			</div>
		{/if}

		<p class="card-meta">
			{data.tracks.length === 1 ? m.groups_tracks_shared_one({ count: data.tracks.length }) : m.groups_tracks_shared_other({ count: data.tracks.length })} ·
			{data.homework.length === 1 ? m.groups_assignments_active_one({ count: data.homework.length }) : m.groups_assignments_active_other({ count: data.homework.length })}
		</p>
		<div class="list-row">
			<span>{m.groups_join_code()}</span>
			<span class="dim">{data.group.join_code}</span>
		</div>
		<div class="list-row">
			<span>{m.groups_join_link()}</span>
			<button type="button" class="text-link" onclick={() => copyJoinLink()}>
				{joinLinkCopied ? m.groups_copied() : m.groups_copy_link()}
			</button>
		</div>
	</section>

	<section class="card">
		<ConfirmButton>
			{#snippet trigger(start)}
				<button type="button" class="btn btn-outline btn-block" onclick={start}>
					{m.groups_leave_group()}
				</button>
			{/snippet}
			{#snippet confirm(cancel)}
				<p class="card-eyebrow">{m.groups_leave_confirm({ name: data.group.name })}</p>
				<p class="card-note">
					{m.groups_leave_note()}
				</p>
				{#if form?.form === 'leaveGroup' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={cancel} disabled={leavingGroup}>
						{m.action_cancel()}
					</button>
					<form
						method="POST"
						action="?/leaveGroup"
						use:enhance={withSubmitting((v) => (leavingGroup = v))}
					>
						<button type="submit" class="btn btn-danger" disabled={leavingGroup}>
							{leavingGroup ? m.groups_leaving() : m.groups_yes_leave()}
						</button>
					</form>
				</div>
			{/snippet}
		</ConfirmButton>
	</section>
{/if}

<style>
	.body {
		color: var(--text);
	}

	.page-setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.35rem 0;
	}

	.page-setting-row select {
		flex: 0 0 auto;
	}
</style>
