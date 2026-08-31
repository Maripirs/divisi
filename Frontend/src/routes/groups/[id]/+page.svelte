<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import FileSlot from '$lib/components/FileSlot.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import type { GroupPage, PageAudience } from '$lib/server/backendTypes';
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
	// Members tab: which member's row (by id) has its "Remove" button
	// expanded into a confirm/cancel pair — at most one at a time.
	let confirmingRemoveMemberId = $state<string | null>(null);
	// Tracks tab (admin only): which track's row (by piece id) has its
	// title/composer/YouTube link/default-tempo/files swapped for the
	// inline edit form — one panel for the whole track, same
	// click-to-reveal pattern as the Members tab's title editor below.
	let editingDetailsPieceId = $state<string | null>(null);
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
	// Tracks tab (admin only): which track's row has its "Delete track"
	// button expanded into a confirm/cancel pair — same click-to-confirm
	// pattern as the Members tab's "Remove" below, at most one at a time.
	// A whole track (every version, distribution, annotation, markup mark
	// on it) is a lot more to lose than one file slot, so unlike the file
	// Remove buttons inside the edit panel (which only take effect on
	// Save), this is its own explicit step.
	let confirmingDeleteTrackPieceId = $state<string | null>(null);
	let deletingTrack = $state(false);
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
	// Weekly Notes admin panel: same create/inline-edit/click-to-confirm
	// patterns as Responsibilities' dates above, one level flatter (no
	// separate schedule concept — every note stands alone).
	let creatingWeeklyNote = $state(false);
	let editingWeeklyNoteId = $state<string | null>(null);
	let weeklyNoteTitleDraft = $state('');
	let weeklyNoteDateDraft = $state('');
	let weeklyNoteBodyDraft = $state('');
	let savingWeeklyNoteEdit = $state(false);
	let confirmingDeleteWeeklyNoteId = $state<string | null>(null);
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
	// Info/About tab: "Leave group" click-to-confirm.
	let confirmingLeave = $state(false);
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

	function formatDate(iso: string | null) {
		if (!iso) return m.home_no_due_date();
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	// Weekly Notes' `note_date` has no time-of-day meaning (see the
	// create/update actions' UTC-midnight round trip) — formatting it with
	// `formatDate`'s local-time conversion rolls it back a calendar day in
	// any timezone behind UTC (caught live: a Sept 1 note showed "Aug 31").
	// Pinning the display to UTC keeps it matching the date the admin typed.
	function formatNoteDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	function formatDateTime(iso: string) {
		return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
	}

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

	// `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm" in the
	// browser's local time, not the ISO string's own UTC offset — used to
	// prefill the responsibility date editor with its current value.
	function toDatetimeLocalValue(iso: string): string {
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	// Same idea as `toDatetimeLocalValue`, for a plain `<input type="date">`
	// (Weekly Notes' `note_date` has no time-of-day meaning) — uses UTC
	// getters since `note_date` round-trips through `new Date(...).toISOString()`
	// as UTC midnight (see the create/update actions), so reading it back
	// with local getters could roll the date a day off in a UTC-behind zone.
	function toDateInputValue(iso: string): string {
		const d = new Date(iso);
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
	}

	function coverageLabel(status: string) {
		if (status === 'underfilled') return m.join_coverage_underfilled();
		if (status === 'overfilled') return m.join_coverage_overfilled();
		return m.join_coverage_covered();
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
				<section class="card">
					<p class="card-eyebrow">{formatDate(hw.due_date)}</p>
					<p class="card-title">{hw.title}</p>
					<p class="card-meta">{hw.range}{hw.pieceTitle ? ` · ${hw.pieceTitle}` : ''}</p>
					{#if hw.instructions}
						<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
					{/if}
					<div class="btn-row">
						<a class="btn btn-primary" href={lh(`/groups/${data.group.id}/homework/${hw.id}`)}>
							{mode === 'admin' ? m.groups_view() : m.groups_view_assignment()}
						</a>
					</div>
				</section>
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
				<section class="card track-card">
					<div class="track-info">
						{#if mode === 'admin' && editingDetailsPieceId === track.piece_id}
							<form
								method="POST"
								action="?/updatePieceDetails"
								enctype="multipart/form-data"
								use:enhance={() => {
									savingDetails = true;
									return async ({ update }) => {
										savingDetails = false;
										editingDetailsPieceId = null;
										await update();
									};
								}}
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
									accept=".mid,.midi,.musicxml,.xml"
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

							<!-- Delete-the-whole-track: a minimal trash icon pinned to the
							     card's top-right corner rather than a button sitting next to
							     Save — those two are one click apart and this is a much more
							     destructive action, so it shouldn't share their weight or
							     row. Its own `<form>` (can't nest inside the one above), and
							     still gated behind a click-to-confirm — the icon alone isn't
							     enough friction for something this hard to undo. Only shown
							     in edit mode, same as the rest of this panel. -->
							<div class="track-delete-corner">
								{#if confirmingDeleteTrackPieceId === track.piece_id}
									<form
										method="POST"
										action="?/deleteTrack"
										use:enhance={() => {
											deletingTrack = true;
											return async ({ update }) => {
												deletingTrack = false;
												confirmingDeleteTrackPieceId = null;
												editingDetailsPieceId = null;
												await update();
											};
										}}
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
											onclick={() => (confirmingDeleteTrackPieceId = null)}
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
								{:else}
									<button
										type="button"
										class="piece-action piece-action--sm piece-action--danger"
										onclick={() => (confirmingDeleteTrackPieceId = track.piece_id)}
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
								{/if}
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
										confirmingDeleteTrackPieceId = null;
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
						use:enhance={() => {
							uploadingTrack = true;
							return async ({ update }) => {
								uploadingTrack = false;
								showUploadForm = false;
								await update();
							};
						}}
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
							accept=".mid,.midi,.musicxml,.xml"
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
					use:enhance={() => {
						creatingWeeklyNote = true;
						return async ({ update }) => {
							creatingWeeklyNote = false;
							await update();
						};
					}}
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
				<section class="card">
					{#if editingWeeklyNoteId === n.id}
						<form
							method="POST"
							action="?/updateWeeklyNote"
							use:enhance={() => {
								savingWeeklyNoteEdit = true;
								return async ({ update }) => {
									savingWeeklyNoteEdit = false;
									editingWeeklyNoteId = null;
									await update();
								};
							}}
						>
							<input type="hidden" name="noteId" value={n.id} />
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
							{#if form?.form === 'editWeeklyNote' && form?.error}
								<p class="error">{form.error}</p>
							{/if}
							<div class="btn-row">
								<button type="button" class="btn btn-outline" onclick={() => (editingWeeklyNoteId = null)}>
									{m.action_cancel()}
								</button>
								<button type="submit" class="btn btn-primary" disabled={savingWeeklyNoteEdit}>
									{savingWeeklyNoteEdit ? m.reset_password_saving() : m.action_save()}
								</button>
							</div>
						</form>
					{:else}
						<p class="card-eyebrow">{m.join_week_of({ date: formatNoteDate(n.note_date) })}</p>
						<p class="card-title">{n.title}</p>
						{#if n.body}
							<p class="card-note">{n.body}</p>
						{/if}
					{/if}
					{#if mode === 'admin' && editingWeeklyNoteId !== n.id}
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
						{#if confirmingDeleteWeeklyNoteId === n.id}
							<div class="btn-row">
								<span class="dim">{m.groups_delete_note_confirm()}</span>
								<button type="button" class="btn btn-outline" onclick={() => (confirmingDeleteWeeklyNoteId = null)}>
									{m.action_cancel()}
								</button>
								<form
									method="POST"
									action="?/deleteWeeklyNote"
									use:enhance={() => async ({ update }) => {
										confirmingDeleteWeeklyNoteId = null;
										await update();
									}}
								>
									<input type="hidden" name="noteId" value={n.id} />
									<button type="submit" class="btn btn-danger">{m.groups_delete()}</button>
								</form>
							</div>
						{:else}
							<button
								type="button"
								class="text-link text-link--danger"
								onclick={() => (confirmingDeleteWeeklyNoteId = n.id)}
							>
								{m.groups_delete_note()}
							</button>
						{/if}
					{/if}
				</section>
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
						{#if confirmingRemoveMemberId === member.user_id}
							<div class="member-actions">
								<span class="dim">{m.groups_remove_confirm()}</span>
								<button type="button" class="text-link" onclick={() => (confirmingRemoveMemberId = null)}>
									{m.action_cancel()}
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
									<button type="submit" class="text-link text-link--danger">{m.groups_confirm()}</button>
								</form>
							</div>
						{:else}
							<div class="member-actions">
								<form method="POST" action="?/updateMemberRole" use:enhance>
									<input type="hidden" name="userId" value={member.user_id} />
									<input type="hidden" name="role" value={member.role === 'admin' ? 'member' : 'admin'} />
									<button type="submit" class="text-link">
										{member.role === 'admin' ? m.groups_remove_admin() : m.groups_make_admin()}
									</button>
								</form>
								<button type="button" class="text-link" onclick={() => (confirmingRemoveMemberId = member.user_id)}>
									{m.groups_remove()}
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
				<p class="card-eyebrow">{m.groups_invite_member()}</p>
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
		{#if mode === 'admin'}
			{#each data.schedules as schedule (schedule.id)}
				<section class="card">
					<p class="card-eyebrow">{m.responsibilities_singular()}</p>
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

					{#if confirmingDeleteScheduleId === schedule.id}
						<p class="card-note">{m.groups_delete_responsibility_warning()}</p>
						<div class="btn-row">
							<button type="button" class="btn btn-outline" onclick={() => (confirmingDeleteScheduleId = null)}>
								{m.action_cancel()}
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
								<button type="submit" class="btn btn-danger">{m.groups_delete_responsibility()}</button>
							</form>
						</div>
					{:else}
						<button
							type="button"
							class="text-link text-link--danger"
							onclick={() => (confirmingDeleteScheduleId = schedule.id)}
						>
							{m.groups_delete_responsibility()}
						</button>
					{/if}
				</section>
			{/each}

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
						return async ({ update }) => {
							creatingSchedule = false;
							roleRowCount = 1;
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

			{#if data.schedules.length > 0}
				<section class="card">
					<p class="card-eyebrow">{m.groups_add_date()}</p>
					<p class="card-note">{m.groups_add_date_note()}</p>
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
							<span>{m.responsibilities_singular()}</span>
							<select name="scheduleId">
								{#each data.schedules as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
							</select>
						</label>
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
								<span>{m.groups_date_and_time()}</span>
								<input type="datetime-local" name="date" bind:value={dateEditDraft} required />
							</label>
							<label class="field">
								<span>{m.groups_note()}</span>
								<input name="notes" bind:value={notesEditDraft} placeholder={m.groups_optional()} />
							</label>
							{#if form?.form === 'editDate' && form?.error}
								<p class="error">{form.error}</p>
							{/if}
							<div class="btn-row">
								<button type="button" class="btn btn-outline" onclick={() => (editingDateId = null)}>
									{m.action_cancel()}
								</button>
								<button type="submit" class="btn btn-primary" disabled={savingDateEdit}>
									{savingDateEdit ? m.reset_password_saving() : m.action_save()}
								</button>
							</div>
						</form>
					{:else}
						<p class="card-eyebrow">
							{formatDateTime(d.date)}{#if d.canceled} · {m.responsibilities_canceled()}{:else if d.locked} · {m.responsibilities_locked()}{/if}
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
											<button type="submit" class="text-link">{m.groups_remove()}</button>
										</form>
									{:else if s.user_id === data.user.id}
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
										<input type="hidden" name="roleId" value={role.role_id} />
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
										<input type="hidden" name="roleId" value={role.role_id} />
										<input name="name" placeholder={m.groups_or_type_name()} />
										<button type="submit" class="btn btn-outline">{m.groups_assign()}</button>
									</form>
								</div>
							{:else if !alreadySignedUp && !d.locked && !d.canceled && role.status === 'underfilled'}
								<form method="POST" action="?/signUpResponsibility" use:enhance>
									<input type="hidden" name="dateId" value={d.id} />
									<input type="hidden" name="roleId" value={role.role_id} />
									<button type="submit" class="text-link">{m.groups_sign_up()}</button>
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
						</div>
						{#if confirmingDeleteDateId === d.id}
							<div class="btn-row">
								<span class="dim">{m.groups_delete_date_confirm()}</span>
								<button type="button" class="btn btn-outline" onclick={() => (confirmingDeleteDateId = null)}>
									{m.action_cancel()}
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
									<button type="submit" class="btn btn-danger">{m.groups_delete()}</button>
								</form>
							</div>
						{:else}
							<button
								type="button"
								class="text-link text-link--danger"
								onclick={() => (confirmingDeleteDateId = d.id)}
							>
								{m.groups_delete_date()}
							</button>
						{/if}
					{/if}
				</section>
			{/each}
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
					use:enhance={() => {
						savingRehearsal = true;
						return async ({ update }) => {
							savingRehearsal = false;
							editingRehearsal = false;
							await update();
						};
					}}
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
			{#if confirmingLeave}
				<p class="card-eyebrow">{m.groups_leave_confirm({ name: data.group.name })}</p>
				<p class="card-note">
					{m.groups_leave_note()}
				</p>
				{#if form?.form === 'leaveGroup' && form?.error}
					<p class="error">{form.error}</p>
				{/if}
				<div class="btn-row">
					<button type="button" class="btn btn-outline" onclick={() => (confirmingLeave = false)} disabled={leavingGroup}>
						{m.action_cancel()}
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
							{leavingGroup ? m.groups_leaving() : m.groups_yes_leave()}
						</button>
					</form>
				</div>
			{:else}
				<button type="button" class="btn btn-outline btn-block" onclick={() => (confirmingLeave = true)}>
					{m.groups_leave_group()}
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

	.track-card {
		position: relative;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
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

	.piece-action--sm {
		width: 1.75rem;
		height: 1.75rem;
	}

	.piece-action--sm svg {
		width: 15px;
		height: 15px;
		margin-left: 0;
	}

	.piece-action--danger {
		border-color: var(--danger);
		color: var(--danger);
	}

	.piece-action--danger:hover {
		background: color-mix(in srgb, var(--danger) 12%, var(--surface) 88%);
		border-color: var(--danger);
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
