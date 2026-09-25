<script lang="ts">
	import { enhance } from '$app/forms';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import WeeklyNoteCard from '$lib/components/WeeklyNoteCard.svelte';
	import { toDateInputValue } from '$lib/utils/dates';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();

	// Weekly Notes admin panel: same create/inline-edit patterns as
	// Responsibilities' dates, one level flatter (no separate schedule
	// concept — every note stands alone).
	let creatingWeeklyNote = $state(false);
	let editingWeeklyNoteId = $state<string | null>(null);
	let weeklyNoteTitleDraft = $state('');
	let weeklyNoteDateDraft = $state('');
	let weeklyNoteBodyDraft = $state('');
	let savingWeeklyNoteEdit = $state(false);

	// Backlog: "Promote to rehearsal note" — same click-to-reveal pattern as
	// the edit form above, just a one-field piece picker instead of a full
	// edit. `data.tracks` is the same "this group's pieces" source
	// `HomeworkTab.svelte`'s own piece dropdown already reuses.
	let promotingWeeklyNoteId = $state<string | null>(null);
	let promotingPieceIdDraft = $state('');
	let savingPromote = $state(false);
</script>

{#if mode === 'admin'}
	<section class="card">
		<p class="card-eyebrow">{m.groups_new_note()}</p>
		<form
			method="POST"
			action="?/createWeeklyNote"
			use:enhance={withSubmitting((v) => (creatingWeeklyNote = v))}
		>
			<label class="field">
				<span>{m.new_homework_title_field()}</span>
				<input name="title" placeholder={m.groups_week_of_placeholder()} required />
			</label>
			<label class="field">
				<span>{m.groups_week_of()}</span>
				<input type="date" name="noteDate" required />
			</label>
			<label class="field">
				<span>{m.groups_note()}</span>
				<textarea name="body" placeholder={m.groups_optional()}></textarea>
			</label>
			{#if form?.form === 'createWeeklyNote' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button class="btn btn-primary btn-block" type="submit" disabled={creatingWeeklyNote}>
				{creatingWeeklyNote ? m.groups_posting() : m.groups_post_note()}
			</button>
		</form>
	</section>
{/if}

{#if data.weeklyNotes.length === 0}
	<p class="empty">{m.join_no_weekly_notes()}</p>
{:else}
	<div class="card-grid">
	{#each data.weeklyNotes as n (n.id)}
		{@const noteItem = { id: n.id, title: n.title, body: n.body, noteDate: n.note_date }}
		<WeeklyNoteCard
			item={noteItem}
			editing={mode === 'admin' && editingWeeklyNoteId === n.id}
		>
			{#snippet edit()}
				<EditableCard
					saveAction="?/updateWeeklyNote"
					deleteAction="?/deleteWeeklyNote"
					idName="noteId"
					idValue={n.id}
					bind:saving={savingWeeklyNoteEdit}
					error={form?.form === 'editWeeklyNote' && form?.error}
					deleteLabel={m.groups_delete_note()}
					deleteConfirmLabel={m.groups_delete_note_confirm()}
					onCancel={() => (editingWeeklyNoteId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.new_homework_title_field()}</span>
							<input name="title" bind:value={weeklyNoteTitleDraft} required />
						</label>
						<label class="field">
							<span>{m.groups_week_of()}</span>
							<input type="date" name="noteDate" bind:value={weeklyNoteDateDraft} required />
						</label>
						<label class="field">
							<span>{m.groups_note()}</span>
							<textarea name="body" bind:value={weeklyNoteBodyDraft}></textarea>
						</label>
					{/snippet}
				</EditableCard>
			{/snippet}

			{#if mode === 'admin'}
				<div class="btn-row">
					<button
						type="button"
						class="btn btn-outline"
						onclick={() => {
							weeklyNoteTitleDraft = n.title;
							weeklyNoteDateDraft = toDateInputValue(n.note_date);
							weeklyNoteBodyDraft = n.body;
							editingWeeklyNoteId = n.id;
						}}
					>
						{m.drawer_edit()}
					</button>
					{#if promotingWeeklyNoteId !== n.id}
						<button
							type="button"
							class="btn btn-outline"
							onclick={() => {
								promotingPieceIdDraft = '';
								promotingWeeklyNoteId = n.id;
							}}
						>
							{m.groups_promote_to_rehearsal_note()}
						</button>
					{/if}
				</div>
				{#if promotingWeeklyNoteId === n.id}
					<form
						method="POST"
						action="?/promoteWeeklyNote"
						use:enhance={withSubmitting((v) => (savingPromote = v), () => (promotingWeeklyNoteId = null))}
					>
						<input type="hidden" name="noteId" value={n.id} />
						<label class="field">
							<span>{m.groups_promote_piece_field()}</span>
							<select name="pieceId" bind:value={promotingPieceIdDraft} required>
								<option value="" disabled>{m.groups_promote_choose_piece()}</option>
								{#each data.tracks as track (track.piece_id)}
									<option value={track.piece_id}>{track.title}</option>
								{/each}
							</select>
						</label>
						{#if form?.form === 'promoteWeeklyNote' && form?.error}
							<p class="error">{form.error}</p>
						{/if}
						<div class="btn-row">
							<button type="button" class="btn btn-outline" onclick={() => (promotingWeeklyNoteId = null)}>
								{m.action_cancel()}
							</button>
							<button class="btn btn-primary" type="submit" disabled={savingPromote}>
								{savingPromote ? m.groups_promoting() : m.groups_promote_action()}
							</button>
						</div>
					</form>
				{/if}
			{/if}
		</WeeklyNoteCard>
	{/each}
	</div>
{/if}
