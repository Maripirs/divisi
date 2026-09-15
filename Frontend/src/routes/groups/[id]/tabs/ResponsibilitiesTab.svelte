<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import ResponsibilityDateCard from '$lib/components/ResponsibilityDateCard.svelte';
	import CoverageMeter from '$lib/components/CoverageMeter.svelte';
	import { coverageTotals, partitionDatesByUpcoming } from '$lib/components/groupCards';
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
	// below. Seeded to the soonest upcoming date (falling back to the most
	// recent past one); `selectedDate` re-resolves against the live list so
	// a deleted/selected-away id falls back to the first.
	//
	// `data.responsibilities` from the backend holds every date the group
	// ever created (admins need signup/coverage history), oldest-first.
	// `partitionDatesByUpcoming` (shared with the guest join page, see
	// `groupCards.ts`) splits it at "now": `upcomingDates` stays
	// oldest-first (soonest next), `pastDates` is reversed so the most
	// recent past date leads.
	// Plain helper mirroring the partition below, for the one-shot `$state`
	// seed (a `$state` initialiser can't read a `$derived`).
	function seedSelectedDateId(): string | null {
		const { upcoming, past } = partitionDatesByUpcoming(data.responsibilities);
		return upcoming[0]?.id ?? past[0]?.id ?? null;
	}
	let selectedDateId = $state<string | null>(seedSelectedDateId());
	let responsibilityDates = $derived(partitionDatesByUpcoming(data.responsibilities));
	let upcomingDates = $derived(responsibilityDates.upcoming);
	let pastDates = $derived(responsibilityDates.past);
	let selectedDate = $derived(
		data.responsibilities.find((d) => d.id === selectedDateId) ??
			upcomingDates[0] ??
			pastDates[0] ??
			data.responsibilities[0] ??
			null
	);
	// Which schedule's row (admin Templates panel) has swapped its role-chip
	// summary for the inline edit forms — one at a time, same click-to-reveal
	// pattern as the Homework / Tracks / Members editors.
	let editingScheduleId = $state<string | null>(null);
	// Click-to-reveal for the two create forms the header actions open.
	let showNewSchedule = $state(false);
	let showAddDate = $state(false);
	// "Duplicate next week" (selected-date panel): prefill the Add-date form
	// with the picked schedule + that date bumped seven days, open it, and
	// scroll it into view — the form renders at the top of the tab, well
	// above the panel this button lives in, so without the scroll it looks
	// like nothing happened.
	async function duplicateDateNextWeek() {
		if (!selectedDate) return;
		const next = new Date(selectedDate.date);
		next.setDate(next.getDate() + 7);
		addDateDraft = toDatetimeLocalValue(next.toISOString());
		addDateScheduleIds = selectedDate.schedules.map((s) => s.schedule_id);
		showAddDate = true;
		await tick();
		document
			.getElementById('add-date-form')
			?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	// Bound to the Add-date form's role-set checkboxes so "Duplicate next
	// week" and the quick-add panel can preselect them.
	// svelte-ignore state_referenced_locally
	const initialAddDateScheduleIds = data.schedules[0] ? [data.schedules[0].id] : [];
	let addDateScheduleIds = $state<string[]>(initialAddDateScheduleIds);
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
		<section class="card" id="add-date-form">
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
	<!-- One date chip, shared by the upcoming strip and the past-dates
	     disclosure below so the ~20 lines of coverage/formatting markup
	     live in one place. -->
	{#snippet dateChip(d: (typeof data.responsibilities)[number])}
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
	{/snippet}

	<section class="card">
		<p class="card-eyebrow">{m.responsibilities_upcoming_heading()}</p>
		{#if upcomingDates.length === 0}
			<p class="card-meta">{m.responsibilities_no_upcoming()}</p>
		{:else}
			<div class="date-strip" role="group" aria-label={m.responsibilities_upcoming_heading()}>
				{#each upcomingDates as d (d.id)}
					{@render dateChip(d)}
				{/each}
			</div>
		{/if}

	{#if selectedDate}
		{@const d = selectedDate}
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
			<ResponsibilityDateCard
				item={dateItem}
				flush
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
					<!-- Signup/assign share the `signUp` form key with the
					     member self-signup form below. A demo "Preview Admin"
					     session (F24 / Backend B20) surfaces its
					     `PREVIEW_READ_ONLY:` rejection here rather than
					     silently no-opping. -->
					{#if form?.form === 'signUp' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
				{:else if !alreadySignedUp && !d.locked && !d.canceled && role.status === 'underfilled'}
					<form method="POST" action="?/signUpResponsibility" use:enhance>
						<input type="hidden" name="dateId" value={d.id} />
						<input type="hidden" name="roleId" value={role.roleId} />
						<button type="submit" class="text-link">{m.groups_sign_up()}</button>
					</form>
					{#if form?.form === 'signUp' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
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
						<input type="hidden" name="canceled" value={d.canceled ? 'false' : 'true'} />
						<button type="submit" class="btn btn-outline">{d.canceled ? m.groups_reinstate() : m.groups_cancel_date()}</button>
					</form>
					<button type="button" class="text-link" onclick={duplicateDateNextWeek}>
						{m.responsibilities_duplicate_next_week()}
					</button>
				</div>
				<!-- Only shown outside the edit panel above (which already
				     renders `editDate` errors via `EditableCard`'s `error`
				     prop): the Cancel/Reinstate button posts the same
				     `editDate` form key from here, one level up. -->
				{#if form?.form === 'editDate' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<!-- Delete lives inside the Edit panel (EditableCard's built-in
				     confirm-then-delete), not in this action row. -->
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
	</section>

	{#if pastDates.length > 0}
		<!-- History lives collapsed below the upcoming card: admins expand it
		     for signup/coverage records, members rarely need it. A past chip
		     still drives the selected-date panel up in the card above. -->
		<details class="past-dates">
			<summary>{m.responsibilities_past_heading({ count: pastDates.length })}</summary>
			<div
				class="date-strip"
				role="group"
				aria-label={m.responsibilities_past_heading({ count: pastDates.length })}
			>
				{#each pastDates as d (d.id)}
					{@render dateChip(d)}
				{/each}
			</div>
		</details>
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

	/* Upcoming dates scroll sideways rather than wrapping, so the strip
	   stays one row tall however many dates a group has. `padding-bottom`
	   leaves room for the active chip's caret (below) and the scrollbar;
	   `overflow-y: hidden` keeps that caret from forcing a vertical scroll. */
	.date-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: 0.6rem;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
	}

	.date-chip {
		position: relative;
		flex: 0 0 10rem;
		scroll-snap-align: start;
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
		box-shadow: inset 0 0 0 1px var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
	}

	/* Solid caret from the active chip down to the accent-outlined roster
	   box below, so the chip and the box read as one connected shape. */
	.date-chip[aria-pressed='true']::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -0.5rem;
		width: 0;
		height: 0;
		transform: translateX(-50%);
		border-left: 0.45rem solid transparent;
		border-right: 0.45rem solid transparent;
		border-top: 0.5rem solid var(--accent);
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

	/* Past-dates disclosure below the upcoming card: the summary reads as a
	   muted text link, and its strip gets a little breathing room once open. */
	.past-dates summary {
		cursor: pointer;
		color: var(--text-muted);
		font-size: 0.8125rem;
		padding: 0.35rem 0;
	}

	.past-dates .date-strip {
		margin-top: 0.5rem;
	}

	/* The selected date's roster lives in the same card as the date strip,
	   inside its own accent-outlined box that the active chip's caret
	   points into, so the chip and the roster read as one connected shape. */
	.resp-selected {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.1rem;
		padding: 0.8rem;
		border: 1.5px solid var(--accent);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--accent) 4%, var(--surface));
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
