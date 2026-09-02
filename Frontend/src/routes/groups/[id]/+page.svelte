<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import FileSlot from '$lib/components/FileSlot.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import PieceNotesPanel from '$lib/components/PieceNotesPanel.svelte';
	import EditableCard from '$lib/components/EditableCard.svelte';
	import HomeworkCard from '$lib/components/HomeworkCard.svelte';
	import WeeklyNoteCard from '$lib/components/WeeklyNoteCard.svelte';
	import ResponsibilityDateCard from '$lib/components/ResponsibilityDateCard.svelte';
	import CoverageMeter from '$lib/components/CoverageMeter.svelte';
	import { coverageTotals } from '$lib/components/groupCards';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import type { GroupPage, PageAudience } from '$lib/server/backendTypes';
	import {
		formatDateTime,
		formatEventDate,
		formatWeekdayTime,
		toDateInputValue,
		toDatetimeLocalValue
	} from '$lib/utils/dates';
	import { withSubmitting } from '$lib/utils/enhance';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Same five tab slots in both modes, just relabeled — see the `tab`
	// picker below. Keeping one `tab` state (rather than separate
	// member/admin tab state) means switching modes never has to remap a
	// tab selection that doesn't exist on the other side.
	type Tab = 'primary' | 'tracks' | 'weeklyNotes' | 'members' | 'responsibilities' | 'about';

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
	const tabsInOrder: Tab[] = ['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about'];
	function tabVisible(t: Tab): boolean {
		if (mode === 'admin') return true;
		if (t === 'primary') return data.homeworkEnabled;
		if (t === 'weeklyNotes') return data.weeklyNotesEnabled;
		if (t === 'members') return data.membersEnabled;
		if (t === 'responsibilities') return data.responsibilitiesEnabled;
		return true;
	}
	let visibleTabs = $derived(tabsInOrder.filter(tabVisible));

	// Homework (the "primary" tab) is the default landing tab, but it's a
	// dead end with nothing to show when the group has none yet (or isn't
	// even visible to this member) — Rehearsal Tracks is the one that's
	// actually useful to land on then. A deep link (`?tab=responsibilities`,
	// used by Home's "Upcoming responsibilities" list) overrides that
	// default when the requested tab is actually reachable.
	const requestedTab = page.url.searchParams.get('tab') as Tab | null;
	let tab = $state<Tab>(
		requestedTab && tabsInOrder.includes(requestedTab) && tabVisible(requestedTab)
			? requestedTab
			: data.homework.length === 0 || !tabVisible('primary')
				? 'tracks'
				: 'primary'
	);

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
	// "Use next rehearsal" quick-fill target for the "Add a date" form above.
	let addDateDraft = $state('');
	// Create-schedule form's dynamic role rows — starts with one blank row.
	let roleRowCount = $state(1);
	// Homework tab: each card shows its full detail by default and can be
	// tapped to collapse to a single "date · piece" row — that collapse
	// state now lives inside `HomeworkCard` (local per card, any number
	// collapsed at once). Homework never got its own detail page (per the
	// human's call — same reasoning applies on Home); the card is the
	// entire replacement for what `/groups/[id]/homework/[hwId]` showed.
	//
	// Same tab, admin only: which card's "Edit details" link has swapped
	// for the inline edit form — same click-to-reveal pattern as the
	// Tracks tab's "Edit details" panel below.
	let editingHomeworkId = $state<string | null>(null);
	let hwTitleDraft = $state('');
	let hwPieceIdDraft = $state('');
	let hwRangeDraft = $state('');
	let hwDueDateDraft = $state('');
	let hwInstructionsDraft = $state('');
	// Shared by both submit buttons in the edit form's row (Save and the
	// delete-confirm icon, via `formaction` — see below) since both trigger
	// the same submit/disable/reset behavior.
	let savingHomework = $state(false);
	// Tracks tab (admin only): which track's row (by piece id) has its
	// title/composer/YouTube link/default-tempo/files swapped for the
	// inline edit form — one panel for the whole track, same
	// click-to-reveal pattern as the Members tab's title editor below.
	let editingDetailsPieceId = $state<string | null>(null);
	// F20: which track cards have their "Piece Notes" disclosure open, so the
	// notes panel (and its list fetch) only mounts once a card is expanded.
	let notesExpanded = $state<Record<string, boolean>>({});
	let titleEditDraft = $state('');
	let composerEditDraft = $state('');
	let youtubeEditDraft = $state('');
	let tempoEditDraft = $state('');
	let savingDetails = $state(false);
	// F5: Tracks tab (admin only) upload form — click-to-reveal, same pattern
	// as the other create forms on this page.
	let showUploadForm = $state(false);
	let uploadingTrack = $state(false);
	// Client-side mirror of the Backend's "at least one of music/PDF"
	// validation — real enforcement stays server-side (`form?.error`
	// below), this just keeps the submit button honest before that round
	// trip.
	let uploadMusicFiles = $state<FileList | null>(null);
	let uploadPdfFiles = $state<FileList | null>(null);
	let canSubmitUpload = $derived(!!uploadMusicFiles?.length || !!uploadPdfFiles?.length);
	// Tracks tab (admin only): a whole track (every version, distribution,
	// annotation, markup mark on it) is a lot more to lose than one file
	// slot, so unlike the file Remove buttons inside the edit panel (which
	// only take effect on Save), deleting a track is its own explicit
	// click-to-confirm step (see the `ConfirmButton` in the edit panel).
	let deletingTrack = $state(false);
	// Tracks tab (admin only): "Generate music from PDF" — in-flight flags for
	// starting a job and for discarding the draft a finished job leaves on the
	// track. Promoting the draft to live now happens in the editor's "Publish
	// as live version" (F16), not from here. Not keyed by piece id: the whole
	// block only renders inside the one open edit panel (`editingDetailsPieceId`).
	let generatingFromPdf = $state(false);
	let discardingGenerated = $state(false);
	// Members tab: which member's row (by id) has its title swapped for the
	// inline edit form — at most one at a time, same pattern as above.
	let editingTitleUserId = $state<string | null>(null);
	let titleDraft = $state('');
	let savingTitle = $state(false);
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
	// pattern as the Homework / Tracks / Members editors above.
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
	// Label for the whole-date coverage badge above the selected-date roster —
	// mirrors `coverageTotals(...).status` from groupCards.ts.
	function dateStatusLabel(status: string): string {
		if (status === 'empty') return m.responsibilities_badge_empty();
		if (status === 'underfilled') return m.responsibilities_badge_needs_people();
		if (status === 'overfilled') return m.join_coverage_overfilled();
		return m.responsibilities_badge_covered();
	}
	// Weekly Notes admin panel: same create/inline-edit patterns as
	// Responsibilities' dates above, one level flatter (no separate schedule
	// concept — every note stands alone).
	let creatingWeeklyNote = $state(false);
	let editingWeeklyNoteId = $state<string | null>(null);
	let weeklyNoteTitleDraft = $state('');
	let weeklyNoteDateDraft = $state('');
	let weeklyNoteBodyDraft = $state('');
	let savingWeeklyNoteEdit = $state(false);
	// Info/About tab: the admin's description editor.
	let editingDescription = $state(false);
	let descriptionDraft = $state(data.group.description ?? '');
	let savingDescription = $state(false);
	// Info/About tab: the admin's "Regular rehearsals" editor — a weekly
	// day+time (e.g. "Wednesdays at 7:00 PM") the Responsibilities tab's
	// "Next rehearsal" button (below) anchors new dates to.
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
		const link = `${page.url.origin}/join/${data.group.join_code}`;
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

	// `Group.rehearsal_weekday` is 0=Monday..6=Sunday (matches Python's
	// `date.weekday()`, what the Backend stores) — distinct from JS's own
	// `Date.getDay()`, which is 0=Sunday..6=Saturday. Every place below that
	// converts between the two says so explicitly.
	const WEEKDAY_LABELS = [m.weekday_monday, m.weekday_tuesday, m.weekday_wednesday, m.weekday_thursday, m.weekday_friday, m.weekday_saturday, m.weekday_sunday];
	// Plural/"on Wednesdays"-shaped form for the rendered schedule sentence
	// below — kept as separate messages rather than an English-only "+s"
	// suffix rule, since that doesn't hold in Spanish (e.g. "miércoles" is
	// already both singular and plural).
	const WEEKDAY_PLURAL_LABELS = [m.weekday_mondays, m.weekday_tuesdays, m.weekday_wednesdays, m.weekday_thursdays, m.weekday_fridays, m.weekday_saturdays, m.weekday_sundays];

	function formatRehearsalSchedule(weekday: number, time: string): string {
		const [hours, minutes] = time.split(':').map(Number);
		const sample = new Date(2026, 0, 1, hours, minutes); // any date — only the time-of-day is used
		const timeLabel = sample.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
		return m.rehearsal_schedule_label({ weekday: WEEKDAY_PLURAL_LABELS[weekday](), time: timeLabel });
	}

	// The Responsibilities tab's "Next rehearsal" quick-fill: the next
	// upcoming occurrence of `weekday`/`time` (both wall-clock, no timezone
	// stored — see `Group.rehearsal_weekday`'s doc comment), computed
	// entirely against the browser's own local clock, formatted for direct
	// use as a `datetime-local` input value. "Today, but the time already
	// passed" rolls to next week rather than showing a moment in the past.
	function nextRehearsalDatetimeLocal(weekday: number, time: string): string {
		const [hours, minutes] = time.split(':').map(Number);
		const now = new Date();
		const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
		const jsTargetDay = (weekday + 1) % 7; // Mon=0..Sun=6 -> Sun=0..Sat=6
		let daysUntil = (jsTargetDay - next.getDay() + 7) % 7;
		if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7;
		next.setDate(next.getDate() + daysUntil);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
	}
</script>

<main class="shell">
	<AppHeader title={data.group.name} />

	{#if showCreatedBanner}
		<section class="card card--highlight">
			<p class="card-eyebrow">{m.groups_created({ name: data.group.name })}</p>
			<div class="list-row"><span>{m.groups_join_code()}</span><span class="dim">{data.group.join_code}</span></div>
			<p class="card-note">{m.groups_share_join_code()}</p>
			<div class="btn-row">
				<button
					type="button"
					class="btn btn-outline"
					onclick={() => {
						tab = 'members';
						showCreatedBanner = false;
					}}
				>
					{m.groups_invite_members()}
				</button>
				<a class="btn btn-outline" href={lh(`/groups/${data.group.id}/admin/new-homework`)}>{m.groups_create_homework()}</a>
				<button type="button" class="btn btn-primary" onclick={() => (showCreatedBanner = false)}>
					{m.groups_view_group()}
				</button>
			</div>
		</section>
	{/if}

	{#if isAdmin}
		<div class="role-switch">
			<span>{m.groups_viewing_as({ role: mode === 'admin' ? m.groups_role_admin() : m.groups_role_member() })}</span>
			<button type="button" class="text-link" onclick={() => (mode = mode === 'admin' ? 'member' : 'admin')}>
				{m.groups_switch_to({ role: mode === 'admin' ? m.groups_role_member() : m.groups_role_admin() })}
			</button>
		</div>
	{/if}

	<div class="tabs" role="tablist">
		{#each visibleTabs as t (t)}
			<button class="tab" class:active={tab === t} onclick={() => (tab = t)}>
				{#if t === 'primary'}{mode === 'admin' ? m.groups_assignments() : m.homework_tab_title()}
				{:else if t === 'tracks'}{mode === 'admin' ? m.groups_tracks() : m.tracks_tab_title()}
				{:else if t === 'weeklyNotes'}{m.weekly_notes_tab_title()}
				{:else if t === 'members'}{m.groups_members_tab_title()}
				{:else if t === 'responsibilities'}{m.responsibilities_tab_title()}
				{:else}{mode === 'admin' ? m.groups_settings() : m.groups_info()}{/if}
			</button>
		{/each}
	</div>

	{#if tab === 'primary'}
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
	{:else if tab === 'tracks'}
		{#if mode === 'admin'}
			<p class="tab-meta">{m.groups_shared_count({ count: data.tracks.length })}</p>
		{/if}
		<!-- Admin sees every distributed track, including ones with no
		     practice file wired up yet (so they know what still needs
		     fixing) — a member just gets nothing to look at for those, since
		     there's nothing they could do about it anyway. F5: a track is
		     practicable either by title-matching a bundled fixture (the old
		     path) or, now, by being a real Backend piece with its own music
		     file/PDF — either is enough. -->
		{@const visibleTracks =
			mode === 'admin'
				? data.tracks
				: data.tracks.filter((track) => getPieceByTitle(track.title) || track.has_music || track.has_pdf)}
		{#if visibleTracks.length === 0}
			<p class="empty">{m.library_no_tracks()}</p>
		{:else}
			{#each visibleTracks as track (track.piece_id)}
				<!-- The bundled-registry title match is only a fallback for a
				     track with nothing of its own wired up yet — once an admin
				     uploads a real music file/PDF/reference link for it (even
				     one that happens to share a bundled piece's title, e.g.
				     "Lacrymosa"), that real content has to win, or every admin
				     edit to it would silently keep playing/showing the bundled
				     fixture instead. Real bug this fixed: the reference-audio
				     picker (F13) always showed disabled for such a track, no
				     matter what the admin set its YouTube link to. -->
				{@const bundled = track.has_music || track.has_pdf ? undefined : getPieceByTitle(track.title)}
				{@const tempoQuery = track.default_tempo_bpm ? `?defaultTempo=${track.default_tempo_bpm}` : ''}
				{@const practiceHref = bundled
					? lh(`/piece/${bundled.id}${tempoQuery}`)
					: track.has_music || track.has_pdf
						? lh(`/piece/${track.piece_id}${tempoQuery}`)
						: null}
				<section class="card track-card" id={`track-${track.piece_id}`}>
					<div class="track-card-row">
					<div class="track-info">
						{#if mode === 'admin' && editingDetailsPieceId === track.piece_id}
							<form
								method="POST"
								action="?/updatePieceDetails"
								enctype="multipart/form-data"
								use:enhance={withSubmitting((v) => (savingDetails = v), () => (editingDetailsPieceId = null))}
							>
								<input type="hidden" name="pieceId" value={track.piece_id} />
								<label class="field">
									<span>{m.groups_upload_name()}</span>
									<input name="title" required bind:value={titleEditDraft} />
								</label>
								<label class="field">
									<span>{m.groups_upload_author()}</span>
									<input name="composer" bind:value={composerEditDraft} placeholder={m.groups_optional()} />
								</label>
								<label class="field">
									<span>{m.groups_upload_youtube()}</span>
									<input
										name="youtube_url"
										type="url"
										bind:value={youtubeEditDraft}
										placeholder={m.groups_optional()}
									/>
								</label>
								<label class="field">
									<span>{m.groups_upload_default_tempo()}</span>
									<input name="defaultTempoBpm" type="number" min="1" bind:value={tempoEditDraft} placeholder="e.g. 96" />
								</label>

								<p class="card-eyebrow">{m.groups_edit_attachments()}</p>

								<FileSlot
									label={m.groups_edit_music_file_label()}
									hasCurrent={track.has_music}
									currentName={track.music_file_name ?? m.groups_edit_unnamed_file()}
									currentCaption={m.groups_edit_current_music_file()}
									emptyTitle={m.groups_edit_no_music_added()}
									emptyHint={m.groups_edit_music_hint()}
									addLabel={m.groups_edit_add_music_file_button()}
									inputName="file"
									accept=".mid,.midi,.musicxml,.xml,.mxl"
									removeInputName="remove_file"
								/>

								<FileSlot
									label={m.groups_edit_pdf_file_label()}
									hasCurrent={track.has_pdf}
									currentName={track.pdf_file_name ?? m.groups_edit_unnamed_file()}
									currentCaption={m.groups_edit_current_pdf()}
									emptyTitle={m.groups_edit_no_pdf_added()}
									emptyHint={m.groups_edit_pdf_hint()}
									addLabel={m.groups_edit_add_pdf_button()}
									inputName="pdf_file"
									accept="application/pdf"
									removeInputName="remove_pdf_file"
								/>

								{#if form?.form === 'pieceDetails' && form?.error}
									<p class="error">{form.error}</p>
								{/if}
								<div class="btn-row">
									<button type="submit" class="btn btn-outline" disabled={savingDetails}>
										{savingDetails ? m.groups_uploading() : m.action_save()}
									</button>
									<button
										type="button"
										class="text-link"
										onclick={() => (editingDetailsPieceId = null)}
										disabled={savingDetails}
									>
										{m.action_cancel()}
									</button>
								</div>
							</form>

							<!-- "Generate music from PDF (prone to error)" — runs the
							     Backend's OMR pipeline on the track's current PDF and lands
							     the result as a draft version to review. Its own <form>s
							     (can't nest in the edit form above), only shown when there's
							     a PDF to read. Fire-and-forget: OMR can take hours, so the
							     panel just switches to a "check back later" note. -->
							{#if track.has_pdf}
								{@const omrJob = track.latest_omr_job}
								<div class="generate-from-pdf">
									{#if omrJob?.status === 'pending' || omrJob?.status === 'running'}
										<p class="card-note">
											{#if omrJob.status === 'running' && omrJob.pages_total}
												{m.groups_generate_page_progress({
													done: omrJob.pages_done ?? 0,
													total: omrJob.pages_total
												})}
											{:else}
												{m.groups_generate_in_progress()}
											{/if}
										</p>
									{:else if track.pending_generated_version_id}
										<p class="card-eyebrow">{m.groups_generate_draft_ready()}</p>
										{#if omrJob?.needs_review}
											<p class="card-note">{m.groups_generate_needs_review()}</p>
										{/if}
										<div class="btn-row">
											<a class="btn btn-outline" href={lh(`/piece/${track.piece_id}/edit`)}>
												{m.groups_generate_open_editor()}
											</a>
											<ConfirmButton>
												{#snippet trigger(start)}
													<button
														type="button"
														class="text-link text-link--danger"
														onclick={start}
														disabled={discardingGenerated}
													>
														{m.groups_generate_discard()}
													</button>
												{/snippet}
												{#snippet confirm(cancel)}
													<form
														method="POST"
														action="?/discardGeneratedVersion"
														use:enhance={withSubmitting((v) => (discardingGenerated = v))}
													>
														<input type="hidden" name="versionId" value={track.pending_generated_version_id} />
														<button type="submit" class="text-link text-link--danger" disabled={discardingGenerated}>
															{m.groups_generate_discard_confirm()}
														</button>
														<button type="button" class="text-link" onclick={cancel} disabled={discardingGenerated}>
															{m.action_cancel()}
														</button>
													</form>
												{/snippet}
											</ConfirmButton>
										</div>
										<p class="card-note">{m.groups_generate_open_editor_hint()}</p>
									{:else}
										{#if omrJob?.status === 'failed'}
											<p class="error">{m.groups_generate_failed({ error: omrJob.error_message ?? '' })}</p>
										{/if}
										<form
											method="POST"
											action="?/generateTrackFromPdf"
											use:enhance={withSubmitting((v) => (generatingFromPdf = v))}
										>
											<input type="hidden" name="pieceId" value={track.piece_id} />
											<input type="hidden" name="versionId" value={track.version_id} />
											<button type="submit" class="text-link" disabled={generatingFromPdf}>
												{generatingFromPdf ? m.groups_generating() : m.groups_generate_from_pdf()}
											</button>
										</form>
										<p class="card-note">{m.groups_generate_hint()}</p>
									{/if}
									{#if form?.form === 'generateFromPdf' && form?.error}
										<p class="error">{form.error}</p>
									{/if}
								</div>
							{/if}

							<!-- F14/F16: open the in-app notation editor on this track.
							     Hidden while a generated draft is pending — that block
							     above already links to the editor for its working
							     draft. The editor route re-checks admin access
							     server-side and the Backend re-checks on save/publish. -->
							{#if track.has_music && !track.pending_generated_version_id}
								<div class="edit-music-row">
									<a class="text-link" href={lh(`/piece/${track.piece_id}/edit`)}>
										{track.latest_omr_job?.needs_review
											? m.groups_generate_review_in_editor()
											: m.piece_editor_title()}
									</a>
									<p class="card-note">
										{track.latest_omr_job?.needs_review
											? m.groups_generate_review_hint()
											: m.piece_editor_entry_hint()}
									</p>
								</div>
							{/if}

							<!-- Delete-the-whole-track: a minimal trash icon pinned to the
							     card's top-right corner rather than a button sitting next to
							     Save — those two are one click apart and this is a much more
							     destructive action, so it shouldn't share their weight or
							     row. Its own `<form>` (can't nest inside the one above), and
							     still gated behind a click-to-confirm — the icon alone isn't
							     enough friction for something this hard to undo. Only shown
							     in edit mode, same as the rest of this panel. -->
							<div class="track-delete-corner">
								<ConfirmButton>
									{#snippet trigger(start)}
										<button
											type="button"
											class="piece-action piece-action--sm piece-action--danger"
											onclick={start}
											aria-label={m.groups_delete_track()}
											title={m.groups_delete_track()}
										>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<path d="M3 6h18" />
												<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
												<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
												<line x1="10" y1="11" x2="10" y2="17" />
												<line x1="14" y1="11" x2="14" y2="17" />
											</svg>
										</button>
									{/snippet}
									{#snippet confirm(cancel)}
										<form
											method="POST"
											action="?/deleteTrack"
											use:enhance={withSubmitting((v) => (deletingTrack = v), () => (editingDetailsPieceId = null))}
											class="track-delete-corner-form"
										>
											<input type="hidden" name="pieceId" value={track.piece_id} />
											<button
												type="submit"
												class="piece-action piece-action--sm piece-action--danger"
												disabled={deletingTrack}
												aria-label={m.groups_delete()}
												title={m.groups_delete_track_confirm()}
											>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<polyline points="20 6 9 17 4 12" />
												</svg>
											</button>
											<button
												type="button"
												class="piece-action piece-action--sm"
												onclick={cancel}
												disabled={deletingTrack}
												aria-label={m.action_cancel()}
												title={m.action_cancel()}
											>
												<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<line x1="18" y1="6" x2="6" y2="18" />
													<line x1="6" y1="6" x2="18" y2="18" />
												</svg>
											</button>
										</form>
									{/snippet}
								</ConfirmButton>
							</div>
						{:else}
							<p class="card-title">{track.title}</p>
							{#if track.composer}
								<p class="card-meta">{track.composer}</p>
							{/if}
							{#if mode === 'admin'}
								<p class="card-meta">{m.groups_status({ status: track.version_status })}</p>
								<p class="card-meta track-contents">
									<span class:present={track.has_music}>{track.has_music ? '✓' : '–'} {m.groups_track_has_music()}</span>
									<span class:present={track.has_pdf}>{track.has_pdf ? '✓' : '–'} {m.groups_track_has_pdf()}</span>
									<span class:present={!!track.youtube_url}>
										{track.youtube_url ? '✓' : '–'} {m.groups_track_has_reference()}
									</span>
								</p>
								<p class="card-meta">
									{track.default_tempo_bpm ? m.groups_default_tempo({ bpm: track.default_tempo_bpm }) : m.groups_default_tempo_midi()}
								</p>
								<button
									type="button"
									class="text-link"
									onclick={() => {
										titleEditDraft = track.title;
										composerEditDraft = track.composer ?? '';
										youtubeEditDraft = track.youtube_url ?? '';
										tempoEditDraft = track.default_tempo_bpm ? String(track.default_tempo_bpm) : '';
										editingDetailsPieceId = track.piece_id;
									}}
								>
									{m.groups_edit_details()}
								</button>
							{/if}
						{/if}
						{#if !practiceHref}
							<p class="card-note">
								{m.groups_practice_not_wired_up()}
							</p>
						{/if}
					</div>
					{#if practiceHref}
						<a class="piece-action piece-action--primary" href={practiceHref} aria-label={m.join_open_player()}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 5v14l11-7z" />
							</svg>
						</a>
					{/if}
					</div>
					<!-- F20: expand a track to read/manage this piece's notes without
					     opening the player. -->
					<details class="track-notes" bind:open={notesExpanded[track.piece_id]}>
						<summary>
							<svg class="track-notes-chevron" viewBox="0 0 24 24" aria-hidden="true"
								><path d="M6 9l6 6 6-6" /></svg
							>
							{m.piece_notes_title()}
						</summary>
						{#if notesExpanded[track.piece_id]}
							<PieceNotesPanel
								pieceId={track.piece_id}
								groupId={data.group.id}
								canManage={mode === 'admin'}
								chrome="bare"
							/>
						{/if}
					</details>
				</section>
			{/each}
		{/if}
		{#if mode === 'admin'}
			{#if showUploadForm}
				<section class="card">
					<p class="card-eyebrow">{m.groups_upload_track()}</p>
					<form
						method="POST"
						action="?/uploadTrack"
						enctype="multipart/form-data"
						use:enhance={withSubmitting((v) => (uploadingTrack = v), () => (showUploadForm = false))}
					>
						<label class="field">
							<span>{m.groups_upload_name()}</span>
							<input name="title" required />
						</label>
						<label class="field">
							<span>{m.groups_upload_author()}</span>
							<input name="composer" placeholder={m.groups_optional()} />
						</label>
						<FileSlot
							label={m.groups_edit_music_file_label()}
							hasCurrent={false}
							currentName={null}
							currentCaption={m.groups_edit_current_music_file()}
							emptyTitle={m.groups_edit_no_music_added()}
							emptyHint={m.groups_edit_music_hint()}
							addLabel={m.groups_edit_add_music_file_button()}
							inputName="file"
							accept=".mid,.midi,.musicxml,.xml,.mxl"
							bind:files={uploadMusicFiles}
						/>
						<FileSlot
							label={m.groups_edit_pdf_file_label()}
							hasCurrent={false}
							currentName={null}
							currentCaption={m.groups_edit_current_pdf()}
							emptyTitle={m.groups_edit_no_pdf_added()}
							emptyHint={m.groups_edit_pdf_hint()}
							addLabel={m.groups_edit_add_pdf_button()}
							inputName="pdf_file"
							accept="application/pdf"
							bind:files={uploadPdfFiles}
						/>
						{#if !canSubmitUpload}
							<p class="card-note">{m.upload_provide_file_or_pdf()}</p>
						{/if}
						<label class="field">
							<span>{m.groups_upload_default_tempo()}</span>
							<input name="default_tempo_bpm" type="number" min="1" placeholder="e.g. 96" />
						</label>
						<label class="field">
							<span>{m.groups_upload_youtube()}</span>
							<input name="youtube_url" type="url" placeholder={m.groups_optional()} />
						</label>
						{#if form?.form === 'uploadTrack' && form?.error}
							<p class="error">{form.error}</p>
						{/if}
						<div class="btn-row">
							<button class="btn btn-primary" type="submit" disabled={uploadingTrack || !canSubmitUpload}>
								{uploadingTrack ? m.groups_uploading() : m.groups_upload_and_share()}
							</button>
							<button
								type="button"
								class="text-link"
								onclick={() => (showUploadForm = false)}
								disabled={uploadingTrack}
							>
								{m.action_cancel()}
							</button>
						</div>
					</form>
				</section>
			{:else}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => (showUploadForm = true)}>
						{m.groups_upload_track_button()}
					</button>
				</div>
			{/if}
		{/if}
	{:else if tab === 'weeklyNotes'}
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
						</div>
					{/if}
				</WeeklyNoteCard>
			{/each}
		{/if}
	{:else if tab === 'members'}
		<section class="card">
			{#each data.members as member (member.user_id)}
				<div class="member-row">
					<div class="member-identity">
						<span>{member.name}{member.role === 'admin' ? ` (${m.groups_role_admin()})` : ''}</span>
						{#if editingTitleUserId === member.user_id}
							<form
								method="POST"
								action="?/updateMemberTitle"
								use:enhance={withSubmitting((v) => (savingTitle = v), () => (editingTitleUserId = null))}
								class="inline-edit-row"
							>
								<input type="hidden" name="userId" value={member.user_id} />
								<input name="title" bind:value={titleDraft} placeholder="e.g. Soprano 2, Section leader" />
								<button type="submit" class="btn btn-outline" disabled={savingTitle}>{m.action_save()}</button>
								<button type="button" class="text-link" onclick={() => (editingTitleUserId = null)}>{m.action_cancel()}</button>
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
									{member.title ? m.groups_edit_title() : m.groups_add_title()}
								</button>
							{/if}
						{/if}
					</div>
					{#if mode === 'admin' && member.user_id !== data.user.id}
						<ConfirmButton>
							{#snippet trigger(start)}
								<div class="member-actions">
									<form method="POST" action="?/updateMemberRole" use:enhance>
										<input type="hidden" name="userId" value={member.user_id} />
										<input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
										<button type="submit" class="text-link">
											{member.role === 'admin' ? m.groups_remove_admin() : m.groups_make_admin()}
										</button>
									</form>
									<button type="button" class="text-link" onclick={start}>
										{m.groups_remove()}
									</button>
								</div>
							{/snippet}
							{#snippet confirm(cancel)}
								<div class="member-actions">
									<span class="dim">{m.groups_remove_confirm()}</span>
									<button type="button" class="text-link" onclick={cancel}>
										{m.action_cancel()}
									</button>
									<form method="POST" action="?/removeMember" use:enhance>
										<input type="hidden" name="userId" value={member.user_id} />
										<button type="submit" class="text-link text-link--danger">{m.groups_confirm()}</button>
									</form>
								</div>
							{/snippet}
						</ConfirmButton>
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
				<p class="card-eyebrow">{m.groups_invite_member()}</p>
				<form
					method="POST"
					action="?/addMember"
					use:enhance={withSubmitting((v) => (addingMember = v), () => (memberEmail = ''))}
				>
					<label class="field">
						<span>{m.login_email()}</span>
						<input type="email" name="email" bind:value={memberEmail} placeholder="singer@example.com" required />
					</label>
					{#if form?.form === 'addMember' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
					{#if form?.form === 'addMember' && form?.success}
						<p class="success">{m.groups_added()}</p>
					{/if}
					<button class="btn btn-primary btn-block" type="submit" disabled={addingMember}>
						{addingMember ? m.groups_inviting() : m.groups_invite_member()}
					</button>
				</form>
			</section>
		{/if}
	{:else if tab === 'responsibilities'}
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
						use:enhance={() => {
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
					use:enhance={withSubmitting((v) => (addingDate = v))}
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
					<p class="card-meta">{formatDateTime(new Date(nextRehearsalLocal).toISOString())}</p>
					<input type="hidden" name="date" value={nextRehearsalLocal} />
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
	{:else if mode === 'admin'}
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

	/* `.text-link` / `.text-link--danger` / `.error` / `.success` now live
	   in shell.css (shared with EditableCard and the group cards). */

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

	.track-contents {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.track-contents span {
		color: var(--text-muted);
	}

	.track-contents span.present {
		color: var(--text);
	}

	/* Base `.track-card` layout + `.track-info` + `.piece-action*` live in
	   shell.css as a flex row. F20 made the card a column — the original
	   info+play row (`.track-card-row`), then an optional "Piece Notes"
	   disclosure below it — so these override shell's row rules. */
	.track-card {
		position: relative;
		flex-direction: column;
		align-items: stretch;
		/* The header OMR alert deep-links to `#track-<pieceId>`; keep the
		   scrolled-to card off the very top edge, and flash it briefly so
		   it's obvious which track the alert meant. */
		scroll-margin-top: 1.5rem;
	}

	.track-card-row {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.track-notes {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.track-notes > summary {
		cursor: pointer;
		list-style: none;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--accent);
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.track-notes > summary::-webkit-details-marker {
		display: none;
	}

	.track-notes-chevron {
		width: 0.9rem;
		height: 0.9rem;
		flex: 0 0 auto;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 0.15s ease;
	}

	.track-notes[open] .track-notes-chevron {
		transform: rotate(180deg);
	}

	.track-notes[open] > summary {
		margin-bottom: 0.5rem;
	}

	.track-card:target {
		animation: track-card-flash 1.6s ease-out;
	}

	@keyframes track-card-flash {
		from {
			box-shadow: 0 0 0 2px var(--accent);
		}
		to {
			box-shadow: 0 0 0 2px transparent;
		}
	}

	.track-delete-corner {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		display: flex;
		gap: 0.35rem;
	}

	.track-delete-corner-form {
		display: flex;
		gap: 0.35rem;
	}

	/* "Generate music from PDF" block — a hairline rule sets it apart from
	   the edit form's own Save/Cancel row just above it. */
	.generate-from-pdf {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
	}

	.edit-music-row {
		margin-top: 0.9rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
	}

	/* Homework summary/collapsed-row styles moved to HomeworkCard.svelte;
	   the inline-edit delete-icon styles moved to EditableCard.svelte. */

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

	/* `.responsibility-role` (the per-role divider) moved to
	   ResponsibilityDateCard.svelte, which renders that wrapper. */

	/* ---------- Responsibilities tab ---------- */

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

	/* `.badge` coverage chips moved to ResponsibilityDateCard.svelte. */

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
