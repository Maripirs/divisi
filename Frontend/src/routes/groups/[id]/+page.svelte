<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import type { GroupPage, PageAudience } from '$lib/server/backendTypes';
	import '$lib/styles/shell.css';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Same five tab slots in both modes, just relabeled — see the `tab`
	// picker below. Keeping one `tab` state (rather than separate
	// member/admin tab state) means switching modes never has to remap a
	// tab selection that doesn't exist on the other side.
	type Tab = 'primary' | 'tracks' | 'members' | 'responsibilities' | 'about';

	// Admin mode is a *view* of this same group page, not a separate
	// destination (UX_WIREFRAME.md's Admin Experience) — reachable via the
	// role switcher below, or a direct `?view=admin` link (what the old
	// `/groups/[id]/admin` route now redirects to). Defaults to member
	// view even for an admin, per the human's call on this doc's own open
	// question ("member or admin view by default?").
	let mode = $state<'member' | 'admin'>(page.url.searchParams.get('view') === 'admin' ? 'admin' : 'member');
	const isAdmin = data.group.role === 'admin';

	// B12: a member only sees a tab whose page is actually enabled for
	// them — `data.*Enabled` comes back `true` unconditionally for an admin
	// (the Backend's member-page gate always passes for admins), so admin
	// mode shows every tab regardless of the real per-page settings; the
	// admin's own settings tab (below) is where those real settings show.
	// Tracks/About have no page gate on the member-facing routes yet, so
	// they're always shown.
	const tabsInOrder: Tab[] = ['primary', 'tracks', 'members', 'responsibilities', 'about'];
	function tabVisible(t: Tab): boolean {
		if (mode === 'admin') return true;
		if (t === 'primary') return data.homeworkEnabled;
		if (t === 'members') return data.membersEnabled;
		if (t === 'responsibilities') return data.responsibilitiesEnabled;
		return true;
	}
	let visibleTabs = $derived(tabsInOrder.filter(tabVisible));

	// Homework (the "primary" tab) is the default landing tab, but it's a
	// dead end with nothing to show when the group has none yet (or isn't
	// even visible to this member) — Rehearsal Tracks is the one that's
	// actually useful to land on then.
	let tab = $state<Tab>(data.homework.length === 0 || !tabVisible('primary') ? 'tracks' : 'primary');

	// One-time confirmation right after `/groups/new` creates this group —
	// UX_WIREFRAME.md's Create Group Flow wants a "created" screen with the
	// join code and quick next actions; shown as a dismissable banner here
	// rather than a separate route, since a brand-new group is otherwise
	// just this same admin view.
	let showCreatedBanner = $state(page.url.searchParams.get('created') === '1');

	let removePassword = $state(false);
	let savingGuestSettings = $state(false);
	let savingPageSettings = $state(false);
	let addingMember = $state(false);
	let memberEmail = $state('');
	let creatingSchedule = $state(false);
	let addingDate = $state(false);
	// Create-schedule form's dynamic role rows — starts with one blank row.
	let roleRowCount = $state(1);
	// Members tab: which member's row (by id) has its "Remove" button
	// expanded into a confirm/cancel pair — at most one at a time.
	let confirmingRemoveMemberId = $state<string | null>(null);
	// Members tab: which member's row (by id) has its title swapped for the
	// inline edit form — at most one at a time, same pattern as above.
	let editingTitleUserId = $state<string | null>(null);
	let titleDraft = $state('');
	let savingTitle = $state(false);
	// Responsibilities admin panel: same click-to-confirm pattern, keyed by
	// schedule id, for the destructive "Delete responsibility" action.
	let confirmingDeleteScheduleId = $state<string | null>(null);
	// Same two patterns, one level down — per responsibility date rather
	// than per responsibility.
	let editingDateId = $state<string | null>(null);
	let dateEditDraft = $state('');
	let notesEditDraft = $state('');
	let savingDateEdit = $state(false);
	let confirmingDeleteDateId = $state<string | null>(null);
	// Info/About tab: the admin's description editor.
	let editingDescription = $state(false);
	let descriptionDraft = $state(data.group.description ?? '');
	let savingDescription = $state(false);
	// Info/About tab: "Leave group" click-to-confirm.
	let confirmingLeave = $state(false);
	let leavingGroup = $state(false);

	const PAGE_LABELS: Record<GroupPage, string> = {
		homework: 'Homework',
		tracks: 'Rehearsal Tracks',
		members: 'Members',
		about: 'About',
		responsibilities: 'Responsibilities'
	};
	const PAGE_ORDER: GroupPage[] = ['homework', 'tracks', 'members', 'about', 'responsibilities'];
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

	function formatDate(iso: string | null) {
		if (!iso) return 'No due date';
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatDateTime(iso: string) {
		return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

	// `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in the
	// browser's local time, not the ISO string's own UTC offset — used to
	// prefill the responsibility date editor with its current value.
	function toDatetimeLocalValue(iso: string): string {
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function coverageLabel(status: string) {
		if (status === 'underfilled') return 'Needs volunteers';
		if (status === 'overfilled') return 'Overfilled';
		return 'Covered';
	}
</script>

<main class="shell">
	<AppHeader title={data.group.name} />

	{#if showCreatedBanner}
		<section class="card card--highlight">
			<p class="card-eyebrow">{data.group.name} created</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
			<p class="card-note">Share the join code so singers can view rehearsal tracks with no login.</p>
			<div class="btn-row">
				<button
					type="button"
					class="btn btn-outline"
					onclick={() => {
						tab = 'members';
						showCreatedBanner = false;
					}}
				>
					Invite members
				</button>
				<a class="btn btn-outline" href="/groups/{data.group.id}/admin/new-homework">Create homework</a>
				<button type="button" class="btn btn-primary" onclick={() => (showCreatedBanner = false)}>
					View group
				</button>
			</div>
		</section>
	{/if}

	{#if isAdmin}
		<div class="role-switch">
			<span>Viewing as {mode === 'admin' ? 'Admin' : 'Member'}</span>
			<button type="button" class="text-link" onclick={() => (mode = mode === 'admin' ? 'member' : 'admin')}>
				Switch to {mode === 'admin' ? 'Member' : 'Admin'}
			</button>
		</div>
	{/if}

	<div class="tabs" role="tablist">
		{#each visibleTabs as t (t)}
			<button class="tab" class:active={tab === t} onclick={() => (tab = t)}>
				{#if t === 'primary'}{mode === 'admin' ? 'Assignments' : 'Homework'}
				{:else if t === 'tracks'}{mode === 'admin' ? 'Tracks' : 'Rehearsal Tracks'}
				{:else if t === 'members'}Members
				{:else if t === 'responsibilities'}Responsibilities
				{:else}{mode === 'admin' ? 'Settings' : 'Info'}{/if}
			</button>
		{/each}
	</div>

	{#if tab === 'primary'}
		{#if mode === 'admin'}
			<p class="tab-meta">{data.homework.length} active</p>
		{/if}
		{#if data.homework.length === 0}
			<p class="empty">No homework assigned yet.</p>
		{:else}
			{#each data.homework as hw (hw.id)}
				<section class="card">
					<p class="card-eyebrow">{formatDate(hw.due_date)}</p>
					<p class="card-title">{hw.title}</p>
					<p class="card-meta">{hw.range}{hw.pieceTitle ? ` · ${hw.pieceTitle}` : ''}</p>
					{#if hw.instructions}
						<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
					{/if}
					<div class="btn-row">
						<a class="btn btn-primary" href="/groups/{data.group.id}/homework/{hw.id}">
							{mode === 'admin' ? 'View' : 'View assignment'}
						</a>
					</div>
				</section>
			{/each}
		{/if}
		{#if mode === 'admin'}
			<div class="btn-row">
				<a class="btn btn-outline" href="/groups/{data.group.id}/admin/new-homework">+ New homework</a>
			</div>
		{/if}
	{:else if tab === 'tracks'}
		{#if mode === 'admin'}
			<p class="tab-meta">{data.tracks.length} shared with this group</p>
		{/if}
		<!-- Admin sees every distributed track, including ones with no
		     practice file wired up yet (so they know what still needs
		     fixing) — a member just gets nothing to look at for those, since
		     there's nothing they could do about it anyway. -->
		{@const visibleTracks = mode === 'admin' ? data.tracks : data.tracks.filter((track) => getPieceByTitle(track.title))}
		{#if visibleTracks.length === 0}
			<p class="empty">No rehearsal tracks shared with this group yet.</p>
		{:else}
			{#each visibleTracks as track (track.piece_id)}
				{@const bundled = getPieceByTitle(track.title)}
				<section class="card track-card">
					<div class="track-info">
						<p class="card-title">{track.title}</p>
						{#if mode === 'admin'}
							<p class="card-meta">Status: {track.version_status}</p>
						{/if}
						{#if !bundled}
							<p class="card-note">
								Practice isn't wired up for this track yet (see Frontend/plan.md's backlog).
							</p>
						{/if}
					</div>
					{#if bundled}
						<a class="piece-action piece-action--primary" href="/piece/{bundled.id}" aria-label="Open player">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 5v14l11-7z" />
							</svg>
						</a>
					{/if}
				</section>
			{/each}
		{/if}
		{#if mode === 'admin'}
			<p class="card-note">
				Upload a piece via the Backend's `/library/pieces` upload endpoint, then distribute it to
				this group — no in-app upload UI yet.
			</p>
		{/if}
	{:else if tab === 'members'}
		<section class="card">
			{#each data.members as member (member.user_id)}
				<div class="member-row">
					<div class="member-identity">
						<span>{member.name}{member.role === 'admin' ? ' (Admin)' : ''}</span>
						{#if editingTitleUserId === member.user_id}
							<form
								method="POST"
								action="?/updateMemberTitle"
								use:enhance={() => {
									savingTitle = true;
									return async ({ update }) => {
										savingTitle = false;
										editingTitleUserId = null;
										await update();
									};
								}}
								class="inline-edit-row"
							>
								<input type="hidden" name="userId" value={member.user_id} />
								<input name="title" bind:value={titleDraft} placeholder="e.g. Soprano 2 — Section leader" />
								<button type="submit" class="btn btn-outline" disabled={savingTitle}>Save</button>
								<button type="button" class="text-link" onclick={() => (editingTitleUserId = null)}>Cancel</button>
							</form>
						{:else}
							{#if member.title}
								<span class="dim">{member.title}</span>
							{/if}
							<span class="dim">{member.email}</span>
							{#if mode === 'admin'}
								<button
									type="button"
									class="text-link"
									onclick={() => {
										titleDraft = member.title ?? '';
										editingTitleUserId = member.user_id;
									}}
								>
									{member.title ? 'Edit title' : '+ Add title'}
								</button>
							{/if}
						{/if}
					</div>
					{#if mode === 'admin' && member.user_id !== data.user.id}
						{#if confirmingRemoveMemberId === member.user_id}
							<div class="member-actions">
								<span class="dim">Remove?</span>
								<button type="button" class="text-link" onclick={() => (confirmingRemoveMemberId = null)}>
									Cancel
								</button>
								<form
									method="POST"
									action="?/removeMember"
									use:enhance={() => async ({ update }) => {
										confirmingRemoveMemberId = null;
										await update();
									}}
								>
									<input type="hidden" name="userId" value={member.user_id} />
									<button type="submit" class="text-link text-link--danger">Confirm</button>
								</form>
							</div>
						{:else}
							<div class="member-actions">
								<form method="POST" action="?/updateMemberRole" use:enhance>
									<input type="hidden" name="userId" value={member.user_id} />
									<input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
									<button type="submit" class="text-link">
										{member.role === 'admin' ? 'Remove admin' : 'Make admin'}
									</button>
								</form>
								<button type="button" class="text-link" onclick={() => (confirmingRemoveMemberId = member.user_id)}>
									Remove
								</button>
							</div>
						{/if}
					{/if}
				</div>
			{/each}
			{#if form?.form === 'removeMember' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if form?.form === 'updateMemberRole' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if form?.form === 'updateMemberTitle' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
		</section>
		{#if mode === 'admin'}
			<section class="card">
				<p class="card-eyebrow">Invite member</p>
				<form
					method="POST"
					action="?/addMember"
					use:enhance={() => {
						addingMember = true;
						return async ({ update }) => {
							addingMember = false;
							memberEmail = '';
							await update();
						};
					}}
				>
					<label class="field">
						<span>Email</span>
						<input type="email" name="email" bind:value={memberEmail} placeholder="singer@example.com" required />
					</label>
					{#if form?.form === 'addMember' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					{#if form?.form === 'addMember' && form?.success}
						<p class="success">Added.</p>
					{/if}
					<button class="btn btn-primary btn-block" type="submit" disabled={addingMember}>
						{addingMember ? 'Inviting…' : 'Invite member'}
					</button>
				</form>
			</section>
		{/if}
	{:else if tab === 'responsibilities'}
		{#if mode === 'admin'}
			{#each data.schedules as schedule (schedule.id)}
				<section class="card">
					<p class="card-eyebrow">Responsibility</p>
					<form method="POST" action="?/updateResponsibilitySchedule" use:enhance class="inline-edit-row">
						<input type="hidden" name="scheduleId" value={schedule.id} />
						<input name="name" value={schedule.name} required />
						<button type="submit" class="btn btn-outline">Save</button>
					</form>

					{#each schedule.roles as role (role.id)}
						<form method="POST" action="?/updateResponsibilityRole" use:enhance class="inline-edit-row">
							<input type="hidden" name="roleId" value={role.id} />
							<input name="name" value={role.name} placeholder="Role" required />
							<input name="neededCount" type="number" min="1" value={role.needed_count} />
							<button type="submit" class="btn btn-outline">Save</button>
							<button type="submit" formaction="?/deleteResponsibilityRole" class="text-link text-link--danger">
								Remove
							</button>
						</form>
					{/each}
					<form method="POST" action="?/addResponsibilityRole" use:enhance class="inline-edit-row">
						<input type="hidden" name="scheduleId" value={schedule.id} />
						<input name="name" placeholder="New role" />
						<input name="neededCount" type="number" min="1" value="1" />
						<button type="submit" class="btn btn-outline">+ Add role</button>
					</form>

					{#if form?.form === 'editSchedule' && form?.error}
						<p class="error">{form.error}</p>
					{/if}

					{#if confirmingDeleteScheduleId === schedule.id}
						<p class="card-note">Deletes all its dates and signups too — this can't be undone.</p>
						<div class="btn-row">
							<button type="button" class="btn btn-outline" onclick={() => (confirmingDeleteScheduleId = null)}>
								Cancel
							</button>
							<form
								method="POST"
								action="?/deleteResponsibilitySchedule"
								use:enhance={() => async ({ update }) => {
									confirmingDeleteScheduleId = null;
									await update();
								}}
							>
								<input type="hidden" name="scheduleId" value={schedule.id} />
								<button type="submit" class="btn btn-danger">Delete responsibility</button>
							</form>
						</div>
					{:else}
						<button
							type="button"
							class="text-link text-link--danger"
							onclick={() => (confirmingDeleteScheduleId = schedule.id)}
						>
							Delete responsibility
						</button>
					{/if}
				</section>
			{/each}

			<section class="card">
				<p class="card-eyebrow">New responsibility</p>
				<p class="card-note">
					A category of volunteer work (e.g. "Snack and rehearsal support"), made up of one or
					more roles. Add specific dates to it below once it's created.
				</p>
				<form
					method="POST"
					action="?/createResponsibilitySchedule"
					use:enhance={() => {
						creatingSchedule = true;
						return async ({ update }) => {
							creatingSchedule = false;
							roleRowCount = 1;
							await update();
						};
					}}
				>
					<label class="field">
						<span>Name</span>
						<input name="scheduleName" placeholder="Snack and rehearsal support" required />
					</label>
					{#each { length: roleRowCount } as _, i (i)}
						<div class="role-row">
							<input name="roleName" placeholder="Role (e.g. Snacks)" />
							<input name="roleNeeded" type="number" min="1" value="1" />
						</div>
					{/each}
					<button type="button" class="text-link" onclick={() => (roleRowCount += 1)}>+ Add role</button>
					{#if form?.form === 'createSchedule' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					<button class="btn btn-primary btn-block" type="submit" disabled={creatingSchedule}>
						{creatingSchedule ? 'Creating…' : 'Create responsibility'}
					</button>
				</form>
			</section>

			{#if data.schedules.length > 0}
				<section class="card">
					<p class="card-eyebrow">Add a date</p>
					<p class="card-note">One occasion members can sign up for, under one of the responsibilities above.</p>
					<form
						method="POST"
						action="?/addResponsibilityDate"
						use:enhance={() => {
							addingDate = true;
							return async ({ update }) => {
								addingDate = false;
								await update();
							};
						}}
					>
						<label class="field">
							<span>Responsibility</span>
							<select name="scheduleId">
								{#each data.schedules as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
							</select>
						</label>
						<label class="field">
							<span>Date &amp; time</span>
							<input type="datetime-local" name="date" required />
						</label>
						<label class="field">
							<span>Notes</span>
							<input name="notes" placeholder="Optional" />
						</label>
						{#if form?.form === 'addDate' && form?.error}
							<p class="error">{form.error}</p>
						{/if}
						<button class="btn btn-primary btn-block" type="submit" disabled={addingDate}>
							{addingDate ? 'Adding…' : 'Add date'}
						</button>
					</form>
				</section>
			{/if}
		{/if}

		{#if data.responsibilities.length === 0}
			<p class="empty">No responsibilities scheduled yet.</p>
		{:else}
			{#each data.responsibilities as d (d.id)}
				<section class="card">
					{#if editingDateId === d.id}
						<form
							method="POST"
							action="?/updateResponsibilityDate"
							use:enhance={() => {
								savingDateEdit = true;
								return async ({ update }) => {
									savingDateEdit = false;
									editingDateId = null;
									await update();
								};
							}}
						>
							<input type="hidden" name="dateId" value={d.id} />
							<label class="field">
								<span>Date &amp; time</span>
								<input type="datetime-local" name="date" bind:value={dateEditDraft} required />
							</label>
							<label class="field">
								<span>Notes</span>
								<input name="notes" bind:value={notesEditDraft} placeholder="Optional" />
							</label>
							{#if form?.form === 'editDate' && form?.error}
								<p class="error">{form.error}</p>
							{/if}
							<div class="btn-row">
								<button type="button" class="btn btn-outline" onclick={() => (editingDateId = null)}>
									Cancel
								</button>
								<button type="submit" class="btn btn-primary" disabled={savingDateEdit}>
									{savingDateEdit ? 'Saving…' : 'Save'}
								</button>
							</div>
						</form>
					{:else}
						<p class="card-eyebrow">
							{formatDateTime(d.date)}{#if d.canceled} · Canceled{:else if d.locked} · Locked{/if}
						</p>
						<p class="card-title">{d.schedule_name}</p>
						{#if d.notes}
							<p class="card-note">{d.notes}</p>
						{/if}
					{/if}
					{#each d.roles as role (role.role_id)}
						{@const alreadySignedUp = role.signups.some((s) => s.user_id === data.user.id)}
						<div class="responsibility-role">
							<div class="list-row">
								<span>{role.role_name} · {role.active_count}/{role.needed_count}</span>
								<span class="badge badge--{role.status}">{coverageLabel(role.status)}</span>
							</div>
							<!-- Signup names are visible to any member, not just the
							     admin (the Backend's member route returns the same
							     full signup list an admin sees — only the guest route
							     strips names) — remove/assign controls are still
							     scoped per-viewer below. -->
							{#each role.signups as s (s.id)}
								<div class="list-row">
									<span class="dim">{s.name}</span>
									{#if mode === 'admin'}
										<form method="POST" action="?/removeResponsibilitySignup" use:enhance>
											<input type="hidden" name="signupId" value={s.id} />
											<button type="submit" class="text-link">Remove</button>
										</form>
									{:else if s.user_id === data.user.id}
										<form method="POST" action="?/removeResponsibilitySignup" use:enhance>
											<input type="hidden" name="signupId" value={s.id} />
											<button type="submit" class="text-link">Remove me</button>
										</form>
									{/if}
								</div>
							{/each}
							{#if mode === 'admin' && role.status === 'underfilled'}
								<div class="assign-group">
									<form method="POST" action="?/signUpResponsibility" use:enhance class="assign-row">
										<input type="hidden" name="dateId" value={d.id} />
										<input type="hidden" name="roleId" value={role.role_id} />
										<select name="userId">
											{#each data.members as m (m.user_id)}<option value={m.user_id}>{m.name}</option>{/each}
										</select>
										<button type="submit" class="btn btn-outline">Assign</button>
									</form>
									<!-- For someone who isn't (and may never be) a group
									     member — a name only, no account. See the Backend's
									     `ResponsibilitySignup` docstring for why this and the
									     member picker above are two separate forms rather
									     than one with both fields, which the Backend rejects. -->
									<form method="POST" action="?/signUpResponsibility" use:enhance class="assign-row">
										<input type="hidden" name="dateId" value={d.id} />
										<input type="hidden" name="roleId" value={role.role_id} />
										<input name="name" placeholder="Or type a name" />
										<button type="submit" class="btn btn-outline">Assign</button>
									</form>
								</div>
							{:else if !alreadySignedUp && !d.locked && !d.canceled && role.status === 'underfilled'}
								<form method="POST" action="?/signUpResponsibility" use:enhance>
									<input type="hidden" name="dateId" value={d.id} />
									<input type="hidden" name="roleId" value={role.role_id} />
									<button type="submit" class="text-link">Sign up</button>
								</form>
							{/if}
						</div>
					{/each}
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
								Edit
							</button>
							<form method="POST" action="?/updateResponsibilityDate" use:enhance>
								<input type="hidden" name="dateId" value={d.id} />
								<input type="hidden" name="locked" value={d.locked ? 'false' : 'true'} />
								<button type="submit" class="btn btn-outline">{d.locked ? 'Unlock' : 'Lock'}</button>
							</form>
							<form method="POST" action="?/updateResponsibilityDate" use:enhance>
								<input type="hidden" name="dateId" value={d.id} />
								<input type="hidden" name="canceled" value={d.canceled ? 'false' : 'true'} />
								<button type="submit" class="btn btn-outline">{d.canceled ? 'Reinstate' : 'Cancel'}</button>
							</form>
						</div>
						{#if confirmingDeleteDateId === d.id}
							<div class="btn-row">
								<span class="dim">Delete this date?</span>
								<button type="button" class="btn btn-outline" onclick={() => (confirmingDeleteDateId = null)}>
									Cancel
								</button>
								<form
									method="POST"
									action="?/deleteResponsibilityDate"
									use:enhance={() => async ({ update }) => {
										confirmingDeleteDateId = null;
										await update();
									}}
								>
									<input type="hidden" name="dateId" value={d.id} />
									<button type="submit" class="btn btn-danger">Delete</button>
								</form>
							</div>
						{:else}
							<button
								type="button"
								class="text-link text-link--danger"
								onclick={() => (confirmingDeleteDateId = d.id)}
							>
								Delete date
							</button>
						{/if}
					{/if}
				</section>
			{/each}
		{/if}
	{:else if mode === 'admin'}
		<section class="card">
			<p class="card-eyebrow">Group settings</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
		</section>

		<section class="card">
			<p class="card-eyebrow">Description</p>
			<p class="card-note">Shown on the Info tab members (and anyone with the join code) see.</p>
			{#if editingDescription}
				<form
					method="POST"
					action="?/updateDescription"
					use:enhance={() => {
						savingDescription = true;
						return async ({ update }) => {
							savingDescription = false;
							editingDescription = false;
							await update();
						};
					}}
				>
					<label class="field">
						<span>Description</span>
						<textarea
							name="description"
							bind:value={descriptionDraft}
							rows="4"
							placeholder="Tell members (and anyone with the join code) about this group…"
						></textarea>
					</label>
					{#if form?.form === 'description' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={() => (editingDescription = false)}>
							Cancel
						</button>
						<button class="btn btn-primary" type="submit" disabled={savingDescription}>
							{savingDescription ? 'Saving…' : 'Save'}
						</button>
					</div>
				</form>
			{:else}
				{#if data.group.description}
					<p class="card-meta body">{data.group.description}</p>
				{:else}
					<p class="card-note">No description yet.</p>
				{/if}
				<button
					type="button"
					class="text-link"
					onclick={() => {
						descriptionDraft = data.group.description ?? '';
						editingDescription = true;
					}}
				>
					{data.group.description ? 'Edit description' : '+ Add description'}
				</button>
			{/if}
		</section>

		<section class="card">
			<p class="card-eyebrow">Guest access</p>
			<p class="card-note">
				Anyone with the join code (and password, if set) can view whatever pages below are set to
				"Everyone" with no login. Nothing they do is saved to the Backend.
			</p>
			<form
				method="POST"
				action="?/updateGuestSettings"
				use:enhance={() => {
					savingGuestSettings = true;
					return async ({ update }) => {
						savingGuestSettings = false;
						removePassword = false;
						await update();
					};
				}}
			>
				<label class="field">
					<span>{data.group.has_guest_password ? 'Change password' : 'Set a password'}</span>
					<input
						type="password"
						name="guestPassword"
						placeholder={data.group.has_guest_password ? 'Leave blank to keep current' : 'Leave blank for no password'}
					/>
				</label>
				{#if data.group.has_guest_password}
					<label class="checkline">
						<input type="checkbox" name="removePassword" bind:checked={removePassword} />
						<span>Remove the password entirely</span>
					</label>
				{/if}

				{#if form?.form === 'guestSettings' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				{#if form?.form === 'guestSettings' && form?.success}
					<p class="success">Saved.</p>
				{/if}

				<button class="btn btn-primary btn-block" type="submit" disabled={savingGuestSettings}>
					{savingGuestSettings ? 'Saving…' : 'Save password'}
				</button>
			</form>
		</section>

		<section class="card">
			<p class="card-eyebrow">Page visibility</p>
			<p class="card-note">
				Turn a page off entirely, or choose whether it's members-only or open to guests with the
				join code. Admins can always see every page regardless of these settings.
			</p>
			<form
				method="POST"
				action="?/updatePageSettings"
				use:enhance={() => {
					savingPageSettings = true;
					return async ({ update }) => {
						savingPageSettings = false;
						await update();
					};
				}}
			>
				{#each pageSettingsDraft as setting (setting.page)}
					<div class="page-setting-row">
						<label class="checkline">
							<input type="checkbox" name="enabled_{setting.page}" bind:checked={setting.enabled} />
							<span>{PAGE_LABELS[setting.page]}</span>
						</label>
						<select name="audience_{setting.page}" bind:value={setting.audience}>
							<option value="members">Members only</option>
							<option value="everyone">Everyone (guests too)</option>
						</select>
					</div>
				{/each}

				{#if form?.form === 'pageSettings' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				{#if form?.form === 'pageSettings' && form?.success}
					<p class="success">Saved.</p>
				{/if}

				<button class="btn btn-primary btn-block" type="submit" disabled={savingPageSettings}>
					{savingPageSettings ? 'Saving…' : 'Save page settings'}
				</button>
			</form>
		</section>
	{:else}
		<section class="card">
			<p class="card-eyebrow">About</p>

			{#if data.group.description}
				<p class="card-meta body">{data.group.description}</p>
			{/if}

			<p class="card-meta">
				{data.tracks.length} rehearsal track{data.tracks.length === 1 ? '' : 's'} shared ·
				{data.homework.length} active assignment{data.homework.length === 1 ? '' : 's'}
			</p>
			<div class="list-row"><span>Join code</span><span class="dim">{data.group.join_code}</span></div>
		</section>

		<section class="card">
			{#if confirmingLeave}
				<p class="card-eyebrow">Leave {data.group.name}?</p>
				<p class="card-note">
					You'll lose access to its rehearsal tracks and homework until someone re-invites you.
				</p>
				{#if form?.form === 'leaveGroup' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => (confirmingLeave = false)} disabled={leavingGroup}>
						Cancel
					</button>
					<form
						method="POST"
						action="?/leaveGroup"
						use:enhance={() => {
							leavingGroup = true;
							return async ({ update }) => {
								leavingGroup = false;
								await update();
							};
						}}
					>
						<button type="submit" class="btn btn-danger" disabled={leavingGroup}>
							{leavingGroup ? 'Leaving…' : 'Yes, leave group'}
						</button>
					</form>
				</div>
			{:else}
				<button type="button" class="btn btn-outline btn-block" onclick={() => (confirmingLeave = true)}>
					Leave group
				</button>
			{/if}
		</section>
	{/if}
</main>

<BottomNav />

<style>

	.role-switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.role-switch .text-link {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
	}

	.tab-meta {
		margin: -0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.member-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.member-row + .member-row {
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
	}

	.member-identity {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.text-link {
		flex: 0 0 auto;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--accent);
		cursor: pointer;
		white-space: nowrap;
	}

	.text-link--danger {
		color: var(--danger);
	}

	.member-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.body {
		color: var(--text);
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

	.track-card {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.track-info {
		min-width: 0;
	}

	.piece-action {
		flex: 0 0 auto;
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		cursor: pointer;
	}

	.piece-action:hover {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.piece-action--primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.piece-action--primary:hover {
		background: var(--accent-hover);
	}

	.piece-action svg {
		width: 20px;
		height: 20px;
		flex: 0 0 auto;
		margin-left: -0.1rem;
	}

	.error {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.success {
		margin: 0.4rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.role-row {
		display: flex;
		gap: 0.5rem;
	}

	.role-row input[name='roleName'] {
		flex: 1 1 auto;
	}

	.role-row input[name='roleNeeded'] {
		flex: 0 0 4.5rem;
	}

	.responsibility-role {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.responsibility-role:first-of-type {
		border-top: none;
		padding-top: 0;
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

	.badge {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		white-space: nowrap;
	}

	.badge--covered {
		background: var(--surface-2);
		color: var(--text-muted);
	}

	.badge--underfilled {
		background: color-mix(in srgb, var(--danger) 15%, transparent);
		color: var(--danger);
	}

	.badge--overfilled {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
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
