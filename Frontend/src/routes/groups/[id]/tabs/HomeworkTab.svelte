<script lang="ts">
	import EditableCard from '$lib/components/EditableCard.svelte';
	import HomeworkCard from '$lib/components/HomeworkCard.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { groupByLabel } from '$lib/components/groupCards';
	import { formatCalendarDate, isPastDueDate } from '$lib/utils/dates';
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

	// Local copy of the roster so a confirmed delete can drop its row the
	// instant it's clicked, instead of waiting for the reload; resynced
	// whenever the server data actually changes.
	// svelte-ignore state_referenced_locally
	let homework = $state(data.homework);
	$effect(() => {
		homework = data.homework;
	});
	// `deleteHomework` goes through `EditableCard`'s own built-in delete
	// button (its `use:enhance` lives there, not here), so there's no local
	// `use:enhance` to hook the optimistic removal into. A failed delete
	// returns `fail(...)`, which SvelteKit surfaces via `form` without
	// reloading `data` (`invalidateAll` only runs on success), so undo the
	// optimistic removal here by re-syncing from `data.homework`, which
	// still holds the item since the delete never actually landed.
	$effect(() => {
		if (form?.form === 'deleteHomework' && 'error' in form && form.error) homework = data.homework;
	});
	// `EditableCard`'s delete button submits the same `<form>` as Save, via
	// `formaction`, so the only way to tell the two apart from up here
	// (without reaching into `EditableCard` itself) is the native submit
	// event's `submitter`, caught here as it bubbles up from wherever a
	// homework card's edit form was submitted.
	function handleHomeworkFormSubmit(e: SubmitEvent) {
		if (e.submitter?.getAttribute('formaction') !== '?/deleteHomework') return;
		const id = new FormData(e.target as HTMLFormElement).get('homeworkId');
		if (typeof id === 'string') homework = homework.filter((hw) => hw.id !== id);
	}

	// Past due date -> collapsed below the active list, same current/past
	// split ResponsibilitiesTab already does for dates (`isUpcoming`/
	// `pastDates` there). No due date at all reads as "still relevant"
	// (open-ended), so only a due date that's actually passed counts as
	// past; the Home page's own feed (`routes/home/+page.server.ts`) takes
	// the same stance to decide what still surfaces there at all.
	const isPastDue = (hw: { due_date: string | null }) => hw.due_date !== null && isPastDueDate(hw.due_date);
	let currentHomework = $derived(homework.filter((hw) => !isPastDue(hw)));
	// Reversed so the most recently due item leads, same convention
	// `partitionDatesByUpcoming` uses for past responsibility dates.
	let pastHomework = $derived(homework.filter(isPastDue).reverse());

	// One header per run of same-due-date homework, same treatment Home's
	// own "For next rehearsal" card uses (`groupByLabel` in `groupCards.ts`)
	// — `currentHomework` keeps the Backend's oldest-first order, `pastHomework`
	// is reversed to newest-first above.
	const dueDateLabel = (hw: { due_date: string | null }) => formatCalendarDate(hw.due_date, m.home_no_due_date());
	let currentHomeworkGroups = $derived(groupByLabel(currentHomework, dueDateLabel));
	let pastHomeworkGroups = $derived(groupByLabel(pastHomework, dueDateLabel));
</script>

{#snippet homeworkRow(hw: (typeof data.homework)[number])}
	{@const hwItem = {
		id: hw.id,
		title: hw.title,
		range: hw.range,
		instructions: hw.instructions,
		dueDate: hw.due_date,
		pieceId: hw.piece_id,
		pieceTitle: hw.pieceTitle
	}}
	<HomeworkCard item={hwItem} collapsible bare showDate={false}>
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
{/snippet}

{#snippet dateGroup(group: (typeof currentHomeworkGroups)[number])}
	<!-- One collapsible date card per run of same-due-date homework, same
	     tap-to-collapse idea `HomeworkCard`'s own `collapsible` prop gives
	     each song below it — native `<details>` needs no state of its own,
	     the `[open]` attribute drives the chevron via CSS. Defaults open so
	     collapsing is opt-in, not a surprise on load. -->
	<details class="card date-group" open>
		<summary class="card-eyebrow">
			<span>{group.label}</span>
			<span class="chevron" aria-hidden="true"></span>
		</summary>
		{#each group.items as hw (hw.id)}
			{@render homeworkRow(hw)}
		{/each}
	</details>
{/snippet}

{#if mode === 'admin'}
	<p class="tab-meta">{m.groups_active_count({ count: currentHomework.length })}</p>
{/if}
{#if currentHomework.length === 0}
	<p class="empty">{m.join_no_homework()}</p>
{:else}
	<div class="card-grid" onsubmit={handleHomeworkFormSubmit}>
	{#each currentHomeworkGroups as group (group.label)}
		{@render dateGroup(group)}
	{/each}
	</div>
{/if}
{#if mode === 'admin'}
	<div class="btn-row">
		<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/admin/new-homework`)}>{m.groups_new_homework_short()}</a>
	</div>
{/if}

{#if pastHomework.length > 0}
	<!-- Collapsed below the active list and the admin's "Add homework"
	     button, same past/upcoming split ResponsibilitiesTab already uses
	     for dates: rarely needed once due, still there for reference. -->
	<details class="past-homework" onsubmit={handleHomeworkFormSubmit}>
		<summary>{m.homework_past_heading({ count: pastHomework.length })}</summary>
		{#each pastHomeworkGroups as group (group.label)}
			{@render dateGroup(group)}
		{/each}
	</details>
{/if}

<style>
	.tab-meta {
		margin: -0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	/* Same treatment as ResponsibilitiesTab's `.past-dates`: a muted
	   text-link summary, a little breathing room once open. `>` (not a
	   descendant selector) so this only styles `.past-homework`'s own
	   "Past homework (n)" toggle — each nested `.date-group`'s own
	   `<summary class="card-eyebrow">` is a summary too, and a descendant
	   selector here would leak these font-size/padding/color overrides onto
	   it, making every past-section date card look different from the
	   current-section ones for no reason. */
	.past-homework > summary {
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.8125rem;
		padding: 0.35rem 0;
	}

	/* The current-section date cards sit directly in the page's `.shell`
	   flex column and get its 1.1rem gap for free. These live one level
	   deeper, inside `.past-homework`, which had no gap of its own — so
	   they stacked edge-to-edge instead of matching that rhythm. Same gap
	   here (replacing the old fixed margin-bottom below the summary, which
	   `gap` now covers) makes past cards read the same as current ones. */
	.past-homework[open] {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	/* Per-date card as a native `<details>`: the eyebrow doubles as the
	   tappable summary, with the same chevron `HomeworkCard` uses per song
	   (`.chevron`/`.chevron.is-open` in shell.css) so the two collapse
	   affordances read as one visual language. No bound state needed — the
	   `[open]` attribute IS the collapse state, so the chevron rotation is
	   pure CSS. */
	.date-group summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		cursor: pointer;
		list-style: none;
	}

	.date-group summary::-webkit-details-marker {
		display: none;
	}

	.date-group[open] > summary .chevron {
		transform: rotate(225deg);
	}
</style>
