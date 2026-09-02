<script lang="ts">
	import EditableCard from '$lib/components/EditableCard.svelte';
	import HomeworkCard from '$lib/components/HomeworkCard.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();

	// Homework tab, admin only: which card's "Edit details" link has swapped
	// for the inline edit form — same click-to-reveal pattern as the Tracks
	// tab's "Edit details" panel. The per-card collapse state lives inside
	// `HomeworkCard` (local per card, any number collapsed at once).
	let editingHomeworkId = $state<string | null>(null);
	let hwTitleDraft = $state('');
	let hwPieceIdDraft = $state('');
	let hwRangeDraft = $state('');
	let hwDueDateDraft = $state('');
	let hwInstructionsDraft = $state('');
	// Shared by both submit buttons in the edit form's row (Save and the
	// delete-confirm icon, via `formaction`) since both trigger the same
	// submit/disable/reset behavior.
	let savingHomework = $state(false);
</script>

{#if mode === 'admin'}
	<p class="tab-meta">{m.groups_active_count({ count: data.homework.length })}</p>
{/if}
{#if data.homework.length === 0}
	<p class="empty">{m.join_no_homework()}</p>
{:else}
	{#each data.homework as hw (hw.id)}
		{@const hwItem = {
			id: hw.id,
			title: hw.title,
			range: hw.range,
			instructions: hw.instructions,
			dueDate: hw.due_date,
			pieceTitle: hw.pieceTitle
		}}
		<HomeworkCard item={hwItem} collapsible>
			{#if mode === 'admin' && editingHomeworkId === hw.id}
				<EditableCard
					saveAction="?/updateHomework"
					deleteAction="?/deleteHomework"
					idName="homeworkId"
					idValue={hw.id}
					bind:saving={savingHomework}
					error={form?.form === 'updateHomework' && form?.error}
					savingLabel={m.new_homework_assigning()}
					deleteLabel={m.groups_delete_homework()}
					deleteConfirmLabel={m.groups_delete_homework_confirm()}
					onCancel={() => (editingHomeworkId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.new_homework_piece()}</span>
							<select name="pieceId" bind:value={hwPieceIdDraft}>
								<option value="">{m.new_homework_no_piece()}</option>
								{#each data.tracks as track (track.piece_id)}
									<option value={track.piece_id}>{track.title}</option>
								{/each}
							</select>
						</label>
						<label class="field">
							<span>{m.new_homework_title_field()}</span>
							<input type="text" name="title" bind:value={hwTitleDraft} required />
						</label>
						<label class="field">
							<span>{m.new_homework_range()}</span>
							<input type="text" name="range" bind:value={hwRangeDraft} required />
						</label>
						<label class="field">
							<span>{m.new_homework_due_date()}</span>
							<input type="date" name="dueDate" bind:value={hwDueDateDraft} />
						</label>
						<label class="field">
							<span>{m.new_homework_instructions()}</span>
							<textarea name="instructions" bind:value={hwInstructionsDraft}></textarea>
						</label>
					{/snippet}
				</EditableCard>
			{:else}
				{#if hw.piece_id}
					<div class="btn-row">
						<a class="btn btn-outline" href={lh(`/piece/${hw.piece_id}`)}>{m.homework_detail_practice()}</a>
					</div>
				{/if}
				{#if mode === 'admin'}
					<button
						type="button"
						class="text-link"
						onclick={() => {
							hwTitleDraft = hw.title;
							hwPieceIdDraft = hw.piece_id ?? '';
							hwRangeDraft = hw.range;
							hwDueDateDraft = hw.due_date ? hw.due_date.slice(0, 10) : '';
							hwInstructionsDraft = hw.instructions;
							editingHomeworkId = hw.id;
						}}
					>
						{m.groups_edit_details()}
					</button>
				{/if}
			{/if}
		</HomeworkCard>
	{/each}
{/if}
{#if mode === 'admin'}
	<div class="btn-row">
		<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/admin/new-homework`)}>{m.groups_new_homework_short()}</a>
	</div>
{/if}

<style>
	.tab-meta {
		margin: -0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
