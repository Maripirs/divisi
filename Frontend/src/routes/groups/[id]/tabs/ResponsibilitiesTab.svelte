<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import ResponsibilityDateCard from '$lib/components/ResponsibilityDateCard.svelte';
	import CoverageMeter from '$lib/components/CoverageMeter.svelte';
	import { coverageTotals } from '$lib/components/groupCards';
	import {
		datetimeLocalToIso,
		formatDateTime,
		formatEventDate,
		formatWeekdayTime,
		toDatetimeLocalValue
	} from '$lib/utils/dates';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import { formatRehearsalSchedule, nextRehearsalDatetimeLocal } from '../rehearsalSchedule';
	import type { PageData, ActionData } from '../$types';

	let { data, form, mode }: { data: PageData; form: ActionData; mode: 'member' | 'admin' } = $props();

	let creatingSchedule = $state(false);
	let addingDate = $state(false);
	// "Use next rehearsal" quick-fill target for the "Add a date" form above.
	let addDateDraft = $state('');
	// Create-schedule form's dynamic role rows — starts with one blank row.
	let roleRowCount = $state(1);
	// Responsibilities admin panel: per-responsibility-date inline edit
	// (one level down from the schedule).
	let editingDateId = $state<string | null>(null);
	let dateEditDraft = $state('');
	let notesEditDraft = $state('');
	let savingDateEdit = $state(false);
	// Responsibilities tab restructure: the upcoming dates render as a
	// compact strip and only the one picked here shows its full roster
	// below. Seeded to the soonest date; `selectedDate` re-resolves against
	// the live list so a deleted/selected-away id falls back to the first.
	let selectedDateId = $state<string | null>(data.responsibilities[0]?.id ?? null);
	let selectedDate = $derived(
		data.responsibilities.find((d) => d.id === selectedDateId) ?? data.responsibilities[0] ?? null
	);
	// Which schedule's row (admin Templates panel) has swapped its role-chip
	// summary for the inline edit forms — one at a time, same click-to-reveal
	// pattern as the Homework / Tracks / Members editors.
	let editingScheduleId = $state<string | null>(null);
	// Click-to-reveal for the two create forms the header actions open.
	let showNewSchedule = $state(false);
	let showAddDate = $state(false);
	// "Duplicate next week" (selected-date panel): prefill the Add-date form
	// with the picked schedule + that date bumped seven days, then open it.
	function duplicateDateNextWeek() {
		if (!selectedDate) return;
		const next = new Date(selectedDate.date);
		next.setDate(next.getDate() + 7);
		addDateDraft = toDatetimeLocalValue(next.toISOString());
		addDateScheduleIds = selectedDate.schedules.map((s) => s.schedule_id);
		showAddDate = true;
	}
	// Bound to the Add-date form's role-set checkboxes so "Duplicate next
	// week" and the quick-add panel can preselect them.
	let addDateScheduleIds = $state<string[]>(data.schedules[0] ? [data.schedules[0].id] : []);
	// Quick-add "Next rehearsal" panel: the concrete next occurrence of the
	// group's weekly rehearsal slot, as a `datetime-local` value. Filled by
	// an effect so it's computed client-side only — every other
	// `nextRehearsalDatetimeLocal` call in this file is already client-only
	// (an onclick handler), and rendering it during SSR would disagree with
	// hydration on the browser's wall clock.
	let nextRehearsalLocal = $state('');
	$effect(() => {
		const weekday = data.group.rehearsal_weekday;
		const time = data.group.rehearsal_time;
		nextRehearsalLocal =
			weekday !== null && time !== null ? nextRehearsalDatetimeLocal(weekday, time) : '';
	});
	// Quick-add panel's ‹ / › stepper: how many whole weeks past the next
	// rehearsal the panel is currently pointing at. 0 is the floor — the
	// next occurrence — so you can't step back into the past.
	let quickAddWeekOffset = $state(0);
	let quickAddLocal = $derived.by(() => {
		if (!nextRehearsalLocal) return '';
		const d = new Date(nextRehearsalLocal);
		d.setDate(d.getDate() + quickAddWeekOffset * 7);
		return toDatetimeLocalValue(d.toISOString());
	});
	// Label for the whole-date coverage badge above the selected-date roster —
	// mirrors `coverageTotals(...).status` from groupCards.ts.
	function dateStatusLabel(status: string): string {
		if (status === 'empty') return m.responsibilities_badge_empty();
		if (status === 'underfilled') return m.responsibilities_badge_needs_people();
		if (status === 'overfilled') return m.join_coverage_overfilled();
		return m.responsibilities_badge_covered();
	}
	// The date forms submit a tz-naive `datetime-local` string; the form
	// action runs on Cloudflare (UTC clock), so it has to be resolved to a
	// UTC instant here on the client instead. Rewrites the field in place
	// right before `use:enhance` sends it.
	function dateFieldToIso(formData: FormData) {
		const raw = String(formData.get('date') ?? '');
		if (raw) formData.set('date', datetimeLocalToIso(raw));
	}
</script>

<div class="resp-head">
	<div>
		<p class="card-title">{m.responsibilities_tab_title()}</p>
		<p class="card-meta">{m.responsibilities_page_meta()}</p>
	</div>
	{#if mode === 'admin'}
		<div class="btn-row">
			<button
				type="button"
				class="btn btn-primary"
				disabled={data.schedules.length === 0}
				onclick={() => (showAddDate = !showAddDate)}
			>
				{m.groups_add_date()}
			</button>
			<button type="button" class="btn" onclick={() => (showNewSchedule = !showNewSchedule)}>
				{m.groups_new_responsibility()}
			</button>
		</div>
	{/if}
</div>

{#if mode === 'admin'}
	{#if showNewSchedule}
		<section class="card">
			<p class="card-eyebrow">{m.groups_new_responsibility()}</p>
			<p class="card-note">
				{m.groups_new_responsibility_note()}
			</p>
			<form
				method="POST"
				action="?/createResponsibilitySchedule"
				use:enhance={() => {
					creatingSchedule = true;
					return async ({ result, update }) => {
						creatingSchedule = false;
						if (result.type === 'success') {
							roleRowCount = 1;
							showNewSchedule = false;
						}
						await update();
					};
				}}
			>
				<label class="field">
					<span>{m.groups_upload_name()}</span>
					<input name="scheduleName" placeholder={m.groups_schedule_name_placeholder()} required />
				</label>
				{#each { length: roleRowCount } as _, i (i)}
					<div class="role-row">
						<input name="roleName" placeholder={m.groups_role_placeholder()} />
						<input name="roleNeeded" type="number" min="1" value="1" />
					</div>
				{/each}
				<button type="button" class="text-link" onclick={() => (roleRowCount += 1)}>{m.groups_add_role()}</button>
				{#if form?.form === 'createSchedule' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<button class="btn btn-primary btn-block" type="submit" disabled={creatingSchedule}>
					{creatingSchedule ? m.groups_creating() : m.groups_create_responsibility()}
				</button>
			</form>
		</section>
	{/if}

	{#if showAddDate && data.schedules.length > 0}
		<section class="card">
			<p class="card-eyebrow">{m.groups_add_date()}</p>
			<p class="card-note">{m.groups_add_date_note()}</p>
			<form
				method="POST"
				action="?/addResponsibilityDate"
				use:enhance={({ formData }) => {
					dateFieldToIso(formData);
					addingDate = true;
					return async ({ result, update }) => {
						addingDate = false;
						if (result.type === 'success') showAddDate = false;
						await update();
					};
				}}
			>
				<div class="field">
					<span>{m.responsibilities_pick_role_sets()}</span>
					{#each data.schedules as s (s.id)}
						<label class="checkline">
							<input
								type="checkbox"
								name="scheduleId"
								value={s.id}
								bind:group={addDateScheduleIds}
							/>
							<span>{s.name}</span>
						</label>
					{/each}
				</div>
				<label class="field">
					<span>{m.groups_date_and_time()}</span>
					<input type="datetime-local" name="date" bind:value={addDateDraft} required />
				</label>
				{#if data.group.rehearsal_weekday !== null && data.group.rehearsal_time !== null}
					{@const weekday = data.group.rehearsal_weekday}
					{@const time = data.group.rehearsal_time}
					<button
						type="button"
						class="text-link"
						onclick={() => {
							addDateDraft = nextRehearsalDatetimeLocal(weekday, time);
						}}
					>
						{m.groups_use_next_rehearsal({ schedule: formatRehearsalSchedule(weekday, time) })}
					</button>
				{/if}
				<label class="field">
					<span>{m.groups_note()}</span>
					<input name="notes" placeholder={m.groups_optional()} />
				</label>
				{#if form?.form === 'addDate' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<button class="btn btn-primary btn-block" type="submit" disabled={addingDate}>
					{addingDate ? m.groups_adding() : m.groups_add_date()}
				</button>
			</form>
		</section>
	{/if}
{/if}

{#if data.responsibilities.length === 0}
	<p class="empty">{m.join_no_responsibilities()}</p>
{:else}
	<section class="card">
		<p class="card-eyebrow">{m.responsibilities_upcoming_heading()}</p>
		<div class="date-strip" role="group" aria-label={m.responsibilities_upcoming_heading()}>
			{#each data.responsibilities as d (d.id)}
				{@const totals = coverageTotals(
					d.schedules
						.flatMap((s) => s.roles)
						.map((role) => ({
							neededCount: role.needed_count,
							activeCount: role.active_count
						}))
				)}
				<button
					type="button"
					class="date-chip"
					aria-pressed={selectedDate?.id === d.id}
					onclick={() => (selectedDateId = d.id)}
				>
					<span class="date-chip__date">
						{formatEventDate(d.date)}{#if d.canceled} · {m.responsibilities_canceled()}{:else if d.locked} · {m.responsibilities_locked()}{/if}
					</span>
					<span class="date-chip__sub">{formatWeekdayTime(d.date)}</span>
					<span class="date-chip__fill">
						{m.responsibilities_filled({ active: totals.active, needed: totals.needed })}
					</span>
					<CoverageMeter active={totals.active} needed={totals.needed} />
				</button>
			{/each}
		</div>
	</section>

	{#if selectedDate}
		{@const d = selectedDate}
		{@const totals = coverageTotals(
			d.schedules
				.flatMap((s) => s.roles)
				.map((role) => ({
					neededCount: role.needed_count,
					activeCount: role.active_count
				}))
		)}
		{@const dateItem = {
			id: d.id,
			date: d.date,
			notes: d.notes,
			locked: d.locked,
			canceled: d.canceled,
			scheduleGroups: d.schedules.map((s) => ({
				scheduleId: s.schedule_id,
				scheduleName: s.schedule_name,
				roles: s.roles.map((role) => ({
					roleId: role.role_id,
					roleName: role.role_name,
					neededCount: role.needed_count,
					activeCount: role.active_count,
					status: role.status,
					signups: role.signups.map((x) => ({ id: x.id, name: x.name, userId: x.user_id }))
				}))
			}))
		}}
		<div class="resp-selected">
			<div class="resp-selected__head">
				<p class="card-eyebrow">{m.responsibilities_selected_heading()}</p>
				<span class="resp-badge resp-badge--{totals.status}">{dateStatusLabel(totals.status)}</span>
			</div>
			<ResponsibilityDateCard
				item={dateItem}
				editing={mode === 'admin' && editingDateId === d.id}
			>
				{#snippet edit()}
				<EditableCard
					saveAction="?/updateResponsibilityDate"
					deleteAction="?/deleteResponsibilityDate"
					idName="dateId"
					idValue={d.id}
					bind:saving={savingDateEdit}
					error={form?.form === 'editDate' && form?.error}
					deleteLabel={m.groups_delete_date()}
					deleteConfirmLabel={m.groups_delete_date_confirm()}
					beforeSubmit={dateFieldToIso}
					onCancel={() => (editingDateId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.groups_date_and_time()}</span>
							<input type="datetime-local" name="date" bind:value={dateEditDraft} required />
						</label>
						<label class="field">
							<span>{m.groups_note()}</span>
							<input name="notes" bind:value={notesEditDraft} placeholder={m.groups_optional()} />
						</label>
					{/snippet}
				</EditableCard>
			{/snippet}

			{#snippet roleExtra(role)}
				{@const alreadySignedUp = (role.signups ?? []).some((s) => s.userId === data.user.id)}
				<!-- Signup names are visible to any member, not just the
				     admin (the Backend's member route returns the same
				     full signup list an admin sees — only the guest route
				     strips names) — remove/assign controls are still
				     scoped per-viewer below. -->
				{#each role.signups ?? [] as s (s.id)}
					<div class="list-row">
						<span class="dim">{s.name}</span>
						{#if mode === 'admin'}
							<form method="POST" action="?/removeResponsibilitySignup" use:enhance>
								<input type="hidden" name="signupId" value={s.id} />
								<button type="submit" class="text-link">{m.groups_remove()}</button>
							</form>
						{:else if s.userId === data.user.id}
							<form method="POST" action="?/removeResponsibilitySignup" use:enhance>
								<input type="hidden" name="signupId" value={s.id} />
								<button type="submit" class="text-link">{m.groups_remove_me()}</button>
							</form>
						{/if}
					</div>
				{/each}
				{#if mode === 'admin' && role.status === 'underfilled'}
					<div class="assign-group">
						<form method="POST" action="?/signUpResponsibility" use:enhance class="assign-row">
							<input type="hidden" name="dateId" value={d.id} />
							<input type="hidden" name="roleId" value={role.roleId} />
							<select name="userId">
								{#each data.members as mem (mem.user_id)}<option value={mem.user_id}>{mem.name}</option>{/each}
							</select>
							<button type="submit" class="btn btn-outline">{m.groups_assign()}</button>
						</form>
						<!-- For someone who isn't (and may never be) a group
						     member — a name only, no account. See the Backend's
						     `ResponsibilitySignup` docstring for why this and the
						     member picker above are two separate forms rather
						     than one with both fields, which the Backend rejects. -->
						<form method="POST" action="?/signUpResponsibility" use:enhance class="assign-row">
							<input type="hidden" name="dateId" value={d.id} />
							<input type="hidden" name="roleId" value={role.roleId} />
							<input name="name" placeholder={m.groups_or_type_name()} />
							<button type="submit" class="btn btn-outline">{m.groups_assign()}</button>
						</form>
					</div>
				{:else if !alreadySignedUp && !d.locked && !d.canceled && role.status === 'underfilled'}
					<form method="POST" action="?/signUpResponsibility" use:enhance>
						<input type="hidden" name="dateId" value={d.id} />
						<input type="hidden" name="roleId" value={role.roleId} />
						<button type="submit" class="text-link">{m.groups_sign_up()}</button>
					</form>
				{/if}
			{/snippet}

			{#if mode === 'admin' && editingDateId !== d.id}
				<div class="btn-row">
					<button
						type="button"
						class="btn btn-outline"
						onclick={() => {
							dateEditDraft = toDatetimeLocalValue(d.date);
							notesEditDraft = d.notes;
							editingDateId = d.id;
						}}
					>
						{m.drawer_edit()}
					</button>
					<form method="POST" action="?/updateResponsibilityDate" use:enhance>
						<input type="hidden" name="dateId" value={d.id} />
						<input type="hidden" name="locked" value={d.locked ? 'false' : 'true'} />
						<button type="submit" class="btn btn-outline">{d.locked ? m.groups_unlock() : m.groups_lock()}</button>
					</form>
					<form method="POST" action="?/updateResponsibilityDate" use:enhance>
						<input type="hidden" name="dateId" value={d.id} />
						<input type="hidden" name="canceled" value={d.canceled ? 'false' : 'true'} />
						<button type="submit" class="btn btn-outline">{d.canceled ? m.groups_reinstate() : m.action_cancel()}</button>
					</form>
					<button type="button" class="text-link" onclick={duplicateDateNextWeek}>
						{m.responsibilities_duplicate_next_week()}
					</button>
					<ConfirmButton>
						{#snippet trigger(start)}
							<button type="button" class="text-link text-link--danger" onclick={start}>
								{m.groups_delete_date()}
							</button>
						{/snippet}
						{#snippet confirm(cancel)}
							<p class="card-note">{m.groups_delete_date_confirm()}</p>
							<div class="btn-row">
								<button type="button" class="btn btn-outline" onclick={cancel}>
									{m.action_cancel()}
								</button>
								<form method="POST" action="?/deleteResponsibilityDate" use:enhance>
									<input type="hidden" name="dateId" value={d.id} />
									<button type="submit" class="btn btn-danger">{m.groups_delete_date()}</button>
								</form>
							</div>
						{/snippet}
					</ConfirmButton>
				</div>
				{#if data.schedules.length > 0}
					<div class="date-role-sets">
						<p class="card-eyebrow">{m.responsibilities_role_sets_on_date()}</p>
						{#each data.schedules as schedule (schedule.id)}
							{@const attached = d.schedules.some((s) => s.schedule_id === schedule.id)}
							<form
								method="POST"
								action={attached
									? '?/detachResponsibilityDateSchedule'
									: '?/attachResponsibilityDateSchedule'}
								use:enhance
							>
								<input type="hidden" name="dateId" value={d.id} />
								<input type="hidden" name="scheduleId" value={schedule.id} />
								<label class="checkline">
									<input
										type="checkbox"
										checked={attached}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
									<span>{schedule.name}</span>
								</label>
							</form>
						{/each}
						{#if form?.form === 'dateRoleSets' && form?.error}
							<p class="error">{form.error}</p>
						{/if}
					</div>
				{/if}
			{/if}
			</ResponsibilityDateCard>
		</div>
	{/if}
{/if}

{#if mode === 'admin' && data.schedules.length > 0 && nextRehearsalLocal}
	<section class="card">
		<p class="card-eyebrow">{m.responsibilities_quick_add()}</p>
		<p class="card-title">{m.responsibilities_next_rehearsal()}</p>
		<form
			method="POST"
			action="?/addResponsibilityDate"
			use:enhance={withSubmitting(
				(v) => (addingDate = v),
				() => (quickAddWeekOffset = 0)
			)}
		>
			{#if data.schedules.length > 1}
				<div class="field">
					<span>{m.responsibilities_pick_role_sets()}</span>
					{#each data.schedules as s (s.id)}
						<label class="checkline">
							<input
								type="checkbox"
								name="scheduleId"
								value={s.id}
								bind:group={addDateScheduleIds}
							/>
							<span>{s.name}</span>
						</label>
					{/each}
				</div>
			{:else}
				<input type="hidden" name="scheduleId" value={data.schedules[0].id} />
			{/if}
			<div class="quick-add-step">
				<button
					type="button"
					class="quick-add-step__arrow"
					onclick={() => (quickAddWeekOffset -= 1)}
					disabled={quickAddWeekOffset === 0}
					aria-label={m.responsibilities_quick_add_prev_week()}
					title={m.responsibilities_quick_add_prev_week()}
				>
					‹
				</button>
				<p class="card-meta">{formatDateTime(datetimeLocalToIso(quickAddLocal))}</p>
				<button
					type="button"
					class="quick-add-step__arrow"
					onclick={() => (quickAddWeekOffset += 1)}
					aria-label={m.responsibilities_quick_add_next_week()}
					title={m.responsibilities_quick_add_next_week()}
				>
					›
				</button>
			</div>
			<input type="hidden" name="date" value={datetimeLocalToIso(quickAddLocal)} />
			{#if form?.form === 'addDate' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button class="btn btn-primary btn-block" type="submit" disabled={addingDate}>
				{addingDate ? m.groups_adding() : m.groups_add_date()}
			</button>
		</form>
	</section>
{/if}

{#if mode === 'admin' && data.schedules.length > 0}
	<!-- Role-set editor lives at the bottom of the tab: it's an
	     admin-planning surface, below the upcoming dates members
	     actually act on. -->
	<section class="card">
		<p class="card-eyebrow">{m.responsibilities_templates_heading()}</p>
		{#each data.schedules as schedule (schedule.id)}
			<div class="responsibility-template">
				{#if editingScheduleId === schedule.id}
					<form method="POST" action="?/updateResponsibilitySchedule" use:enhance class="inline-edit-row">
						<input type="hidden" name="scheduleId" value={schedule.id} />
						<input name="name" value={schedule.name} required />
						<button type="submit" class="btn btn-outline">{m.action_save()}</button>
					</form>

					{#each schedule.roles as role (role.id)}
						<form method="POST" action="?/updateResponsibilityRole" use:enhance class="inline-edit-row">
							<input type="hidden" name="roleId" value={role.id} />
							<input name="name" value={role.name} placeholder={m.groups_role()} required />
							<input name="neededCount" type="number" min="1" value={role.needed_count} />
							<button type="submit" class="btn btn-outline">{m.action_save()}</button>
							<button type="submit" formaction="?/deleteResponsibilityRole" class="text-link text-link--danger">
								{m.groups_remove()}
							</button>
						</form>
					{/each}
					<form method="POST" action="?/addResponsibilityRole" use:enhance class="inline-edit-row">
						<input type="hidden" name="scheduleId" value={schedule.id} />
						<input name="name" placeholder={m.groups_new_role()} />
						<input name="neededCount" type="number" min="1" value="1" />
						<button type="submit" class="btn btn-outline">{m.groups_add_role()}</button>
					</form>

					{#if form?.form === 'editSchedule' && form?.error}
						<p class="error">{form.error}</p>
					{/if}

					<div class="btn-row">
						<button type="button" class="text-link" onclick={() => (editingScheduleId = null)}>
							{m.responsibilities_done()}
						</button>
						<ConfirmButton>
							{#snippet trigger(start)}
								<button type="button" class="text-link text-link--danger" onclick={start}>
									{m.groups_delete_responsibility()}
								</button>
							{/snippet}
							{#snippet confirm(cancel)}
								<p class="card-note">{m.groups_delete_responsibility_warning()}</p>
								<div class="btn-row">
									<button type="button" class="btn btn-outline" onclick={cancel}>
										{m.action_cancel()}
									</button>
									<form method="POST" action="?/deleteResponsibilitySchedule" use:enhance>
										<input type="hidden" name="scheduleId" value={schedule.id} />
										<button type="submit" class="btn btn-danger">{m.groups_delete_responsibility()}</button>
									</form>
								</div>
							{/snippet}
						</ConfirmButton>
					</div>
				{:else}
					<div class="template-summary">
						<div>
							<p class="card-title">{schedule.name}</p>
							<div class="resp-chips">
								{#each schedule.roles as role (role.id)}
									<span class="resp-chip">{role.name} ×{role.needed_count}</span>
								{:else}
									<span class="resp-chip resp-chip--empty">{m.responsibilities_no_roles()}</span>
								{/each}
							</div>
						</div>
						<button type="button" class="text-link" onclick={() => (editingScheduleId = schedule.id)}>
							{m.drawer_edit()}
						</button>
					</div>
				{/if}
			</div>
		{/each}
	</section>
{/if}

<style>
	/* Quick-add ‹ / › week stepper: the rehearsal date sits between two
	   arrows that walk the group's weekly slot forward/back a week at a
	   time. Back is disabled at offset 0 (the next occurrence). */
	.quick-add-step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.quick-add-step .card-meta {
		flex: 1 1 auto;
		text-align: center;
	}

	.quick-add-step__arrow {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}

	.quick-add-step__arrow:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.quick-add-step__arrow:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.inline-edit-row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.inline-edit-row input:not([type]) {
		flex: 1 1 auto;
		min-width: 0;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.inline-edit-row input[type='number'] {
		flex: 0 0 4.5rem;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.role-row {
		display: flex;
		gap: 0.5rem;
	}

	.role-row input {
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
		min-width: 0;
	}

	.role-row input[name='roleName'] {
		flex: 1 1 auto;
	}

	.role-row input[name='roleNeeded'] {
		flex: 0 0 4.5rem;
	}

	/* Role-set pickers (add-date + quick-add forms) reuse the global
	   `.checkline` row inside a normal `.field`; this only keeps
	   `.field input`'s text-input chrome off the checkboxes themselves. */
	.field .checkline input {
		border: none;
		padding: 0;
		background: none;
	}

	.date-role-sets {
		border-top: 1px solid var(--border);
		margin-top: 0.75rem;
		padding-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.resp-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	/* One template inside the Templates card — same divider treatment the
	   per-role rows get inside ResponsibilityDateCard. */
	.responsibility-template {
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
	}

	.responsibility-template:first-of-type {
		border-top: none;
		padding-top: 0;
	}

	.template-summary {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.resp-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.4rem;
	}

	.resp-chip {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.resp-chip--empty {
		font-style: italic;
		font-weight: 400;
	}

	.date-strip {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.5rem;
	}

	.date-chip {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-height: 5rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.date-chip:hover {
		border-color: var(--accent);
	}

	.date-chip[aria-pressed='true'] {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}

	.date-chip__date {
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--text);
	}

	.date-chip__sub {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.date-chip__fill {
		margin-top: auto;
		padding-top: 0.25rem;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.resp-selected {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.resp-selected__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.resp-badge {
		flex: 0 0 auto;
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-full);
		white-space: nowrap;
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.resp-badge--empty,
	.resp-badge--underfilled {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
	}

	.resp-badge--overfilled {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
	}

	.assign-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.assign-row {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.assign-row select,
	.assign-row input {
		flex: 1 1 auto;
		min-width: 0;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}
</style>
