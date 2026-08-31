import { error, fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import type {
	GroupMemberOut,
	GroupOut,
	GroupPage,
	GroupPageSettingOut,
	HomeworkOut,
	LibraryEntryOut,
	PageAudience,
	ResponsibilityDateOut,
	ResponsibilityScheduleOut,
	WeeklyNoteOut
} from '$lib/server/backendTypes';
import type { Actions, PageServerLoad } from './$types';

/** B12: a member-facing page route 403s once its admin disables that page
 * (`require_member_page_access`) — admins always pass regardless, so this
 * only ever "disables" something for a non-admin caller. Wraps a group-page
 * fetch so a disabled page hides its tab instead of failing the whole load. */
async function fetchPageOrDisabled<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; enabled: boolean }> {
	try {
		return { data: await promise, enabled: true };
	} catch (err) {
		if (err instanceof BackendApiError && err.status === 403) return { data: fallback, enabled: false };
		throw err;
	}
}

// Loads everything both the member view and the admin view need in one
// pass — the admin view used to be a separate route (`/groups/[id]/admin`)
// with its own near-identical load, refetching the same three lists. Now
// it's a mode of this same page (see UX_WIREFRAME.md's "Admin mode should
// be a view of the group, not a separate destination"), so one load feeds
// both.
export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}`));

	// No single-group GET exists on the Backend — `/groups` only lists the
	// caller's own groups, so a group this user isn't in 404s here exactly
	// like an unknown id would, which is the right behavior either way.
	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const group = groups.find((g) => g.id === params.id);
	if (!group) throw error(404, m.errors_group_not_found());
	const isAdmin = group.role === 'admin';

	try {
		const [homeworkResult, membersResult, library, responsibilitiesResult, weeklyNotesResult] = await Promise.all([
			fetchPageOrDisabled(backendJson<HomeworkOut[]>(locals.token, `/groups/${group.id}/homework`, undefined, fetch), []),
			fetchPageOrDisabled(backendJson<GroupMemberOut[]>(locals.token, `/groups/${group.id}/members`, undefined, fetch), []),
			backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch),
			fetchPageOrDisabled(
				backendJson<ResponsibilityDateOut[]>(locals.token, `/groups/${group.id}/responsibilities/dates`, undefined, fetch),
				[]
			),
			fetchPageOrDisabled(backendJson<WeeklyNoteOut[]>(locals.token, `/groups/${group.id}/weekly-notes`, undefined, fetch), [])
		]);

		// Admin-only management data — these two endpoints 403 for a
		// non-admin, so only fetched when the caller actually is one.
		let schedules: ResponsibilityScheduleOut[] = [];
		let pageSettings: GroupPageSettingOut[] = [];
		if (isAdmin) {
			[schedules, pageSettings] = await Promise.all([
				backendJson<ResponsibilityScheduleOut[]>(
					locals.token,
					`/groups/${group.id}/responsibilities/schedules`,
					undefined,
					fetch
				),
				backendJson<GroupPageSettingOut[]>(locals.token, `/groups/${group.id}/page-settings`, undefined, fetch)
			]);
		}

		const tracks = library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id);
		const trackTitleById = new Map(tracks.map((t) => [t.piece_id, t.title]));

		return {
			user,
			group,
			homework: homeworkResult.data.map((hw) => ({
				...hw,
				pieceTitle: hw.piece_id ? (trackTitleById.get(hw.piece_id) ?? null) : null
			})),
			homeworkEnabled: homeworkResult.enabled,
			tracks,
			members: membersResult.data,
			membersEnabled: membersResult.enabled,
			responsibilities: responsibilitiesResult.data,
			responsibilitiesEnabled: responsibilitiesResult.enabled,
			weeklyNotes: weeklyNotesResult.data,
			weeklyNotesEnabled: weeklyNotesResult.enabled,
			schedules,
			pageSettings
		};
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};

const RESPONSIBILITY_DATE_ID = (form: FormData) => String(form.get('dateId') ?? '');

export const actions: Actions = {
	updateGuestSettings: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const newPassword = String(form.get('guestPassword') ?? '').trim();
		const removePassword = form.get('removePassword') === 'on';

		// Partial patch (see Backend's `GroupGuestSettingsUpdate`) — only
		// include `guest_password` when the admin actually typed a new one
		// or explicitly asked to remove it. The API never lets them read the
		// current password back, so a blank field must mean "leave it
		// alone", not "clear it". Per-page visibility (formerly
		// `guest_homework_visible`) is B12's separate `updatePageSettings`
		// action below, not this one.
		const body: { guest_password?: string | null } = {};
		if (newPassword) body.guest_password = newPassword;
		else if (removePassword) body.guest_password = null;

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/guest-settings`,
				{ method: 'PUT', body: JSON.stringify(body) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}
		return { success: true, form: 'guestSettings' };
	},

	// B12: admin-only replace of all 5 pages' enabled/audience in one go —
	// the form always submits every page's current state (checkboxes for
	// unchecked/disabled pages just don't appear in the FormData), so this
	// builds the full set rather than a true partial patch even though the
	// Backend endpoint itself supports one.
	updatePageSettings: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pages: GroupPage[] = ['homework', 'tracks', 'members', 'about', 'responsibilities', 'weekly_notes'];
		const updates = pages.map((page) => ({
			page,
			enabled: form.get(`enabled_${page}`) === 'on',
			audience: (form.get(`audience_${page}`) === 'everyone' ? 'everyone' : 'members') as PageAudience
		}));

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/page-settings`,
				{ method: 'PUT', body: JSON.stringify({ pages: updates }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'pageSettings' });
			throw err;
		}
		return { success: true, form: 'pageSettings' };
	},

	// Admin-only, full replace — a regular weekly rehearsal slot (e.g.
	// "Wednesdays at 7pm") the Responsibilities tab's "Next rehearsal"
	// button anchors new dates to. `weekday` empty means "clear it"; the
	// select's own options are '0'-'6' strings (Monday-Sunday, matching the
	// Backend's `date.weekday()` convention) so this just needs `Number(...)`.
	updateRehearsalSchedule: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const weekdayRaw = String(form.get('weekday') ?? '').trim();
		const time = String(form.get('time') ?? '').trim();
		const rehearsalWeekday = weekdayRaw === '' ? null : Number(weekdayRaw);
		const rehearsalTime = weekdayRaw === '' ? null : time;
		if (rehearsalWeekday !== null && (!Number.isInteger(rehearsalWeekday) || !rehearsalTime)) {
			return fail(400, { error: m.rehearsal_choose_day_time(), form: 'rehearsalSchedule' });
		}

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/rehearsal-schedule`,
				{ method: 'PUT', body: JSON.stringify({ rehearsal_weekday: rehearsalWeekday, rehearsal_time: rehearsalTime }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'rehearsalSchedule' });
			throw err;
		}
		return { success: true, form: 'rehearsalSchedule' };
	},

	// Admin-only, full replace — the free-text blurb on the Info/About tab.
	updateDescription: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const description = String(form.get('description') ?? '').trim();

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/description`,
				{ method: 'PUT', body: JSON.stringify({ description: description || null }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'description' });
			throw err;
		}
		return { success: true, form: 'description' };
	},

	addMember: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		if (!email) return fail(400, { error: m.groups_enter_email(), form: 'addMember' });

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/members`,
				{ method: 'POST', body: JSON.stringify({ email, role: 'member' }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'addMember' });
			throw err;
		}
		return { success: true, form: 'addMember' };
	},

	// Admin-only, and only for *other* members — removing yourself is a
	// separate, deliberate "Leave group" action below (the Members tab's
	// own Remove button is hidden on the caller's own row, but this checks
	// again server-side since a form POST doesn't actually enforce that).
	// `parent()` isn't available in form actions (only `load`), so this
	// re-resolves the caller via `/auth/me` rather than trusting a
	// client-supplied id. The Backend itself 409s a removal that would
	// leave the group with no admins, surfaced here as a normal form error.
	removeMember: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'removeMember' });

		try {
			const me = await backendJson<{ id: string }>(locals.token, '/auth/me', undefined, fetch);
			if (userId === me.id) {
				return fail(400, { error: m.groups_use_leave_group(), form: 'removeMember' });
			}
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'removeMember' });
			throw err;
		}

		try {
			await backendFetch(locals.token, `/groups/${params.id}/members/${userId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'removeMember' });
			throw err;
		}
		return { success: true, form: 'removeMember' };
	},

	// Admin-only. One panel, one action, for everything the Tracks tab used
	// to split across a title/composer/YouTube editor and a separate
	// default-tempo editor: title/composer/youtube_url/default_tempo_bpm go
	// to `PATCH /library/pieces/{id}` as a full replace (blank
	// composer/youtube_url/tempo clears them — same "Reset to default"
	// tempo the player uses, see `piece/[id]/+page.svelte`). A newly chosen
	// music file and/or PDF go through the same
	// upload → submit → approve → distribute chain as `uploadTrack` below,
	// so picking just one of the two file inputs replaces only that file —
	// the Backend's `upload_version` carries the untouched slot forward.
	updatePieceDetails: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const composer = String(form.get('composer') ?? '').trim();
		const youtubeUrl = String(form.get('youtube_url') ?? '').trim();
		const tempoRaw = String(form.get('defaultTempoBpm') ?? '').trim();
		if (!pieceId) return fail(400, { error: m.groups_missing_track(), form: 'pieceDetails' });
		if (!title) return fail(400, { error: m.groups_upload_name_required(), form: 'pieceDetails' });
		const defaultTempoBpm = tempoRaw ? Number(tempoRaw) : null;
		if (tempoRaw && (!Number.isFinite(defaultTempoBpm) || defaultTempoBpm! <= 0)) {
			return fail(400, { error: m.groups_enter_valid_tempo(), form: 'pieceDetails' });
		}

		const musicFile = form.get('file');
		const pdfFile = form.get('pdf_file');
		const hasMusic = musicFile instanceof File && musicFile.size > 0;
		const hasPdf = pdfFile instanceof File && pdfFile.size > 0;
		// The edit panel's file cards' "Remove" — a hidden `'1'`/`''` field per
		// slot, set only when that slot's Remove button was actually clicked
		// (see `+page.svelte`'s file-slot markup). Ignored for a slot that
		// also got a new file this same submit — picking a replacement always
		// wins over an earlier Remove click.
		const removeMusic = form.get('remove_file') === '1' && !hasMusic;
		const removePdf = form.get('remove_pdf_file') === '1' && !hasPdf;

		try {
			await backendFetch(
				locals.token,
				`/library/pieces/${pieceId}`,
				{
					method: 'PATCH',
					body: JSON.stringify({
						title,
						composer: composer || null,
						youtube_url: youtubeUrl || null,
						default_tempo_bpm: defaultTempoBpm
					})
				},
				fetch
			);

			if (hasMusic || hasPdf || removeMusic || removePdf) {
				const versionBody = new FormData();
				if (hasMusic) versionBody.set('file', musicFile);
				if (hasPdf) versionBody.set('pdf_file', pdfFile);
				if (removeMusic) versionBody.set('remove_file', 'true');
				if (removePdf) versionBody.set('remove_pdf_file', 'true');
				let versionRes: Response;
				try {
					versionRes = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces/${pieceId}/versions`, {
						method: 'POST',
						headers: { Authorization: `Bearer ${locals.token}` },
						body: versionBody
					});
				} catch {
					return fail(503, { error: m.errors_could_not_reach_server(), form: 'pieceDetails' });
				}
				if (!versionRes.ok) {
					const body = (await versionRes.json().catch(() => ({}))) as { detail?: string };
					return fail(versionRes.status, {
						error: body.detail ?? m.upload_failed({ status: versionRes.status }),
						form: 'pieceDetails'
					});
				}
				const versionId = (await versionRes.json()).id as string;
				await backendFetch(locals.token, `/library/versions/${versionId}/submit`, { method: 'POST' }, fetch);
				await backendFetch(locals.token, `/library/versions/${versionId}/approve`, { method: 'POST' }, fetch);
				await backendFetch(
					locals.token,
					`/library/pieces/${pieceId}/versions/${versionId}/distribute`,
					{ method: 'POST' },
					fetch
				);
			}
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'pieceDetails' });
			throw err;
		}
		return { success: true, form: 'pieceDetails' };
	},

	// Admin-only, `DELETE /library/pieces/{id}` — the whole track, not just
	// one of its files (that's the `remove_file`/`remove_pdf_file` flags on
	// `updatePieceDetails` above). Every version, distribution, annotation,
	// and markup mark on it goes with it — see the Backend's `delete_piece`
	// for exactly what that cleans up.
	deleteTrack: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const pieceId = String(form.get('pieceId') ?? '');
		if (!pieceId) return fail(400, { error: m.groups_missing_track(), form: 'deleteTrack' });

		try {
			await backendFetch(locals.token, `/library/pieces/${pieceId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'deleteTrack' });
			throw err;
		}
		return { success: true, form: 'deleteTrack' };
	},

	// F5, admin-only: uploads a real track (music file, PDF, or both) and
	// immediately makes it visible on this group's Tracks tab. Posts
	// straight to the Backend rather than through `backendFetch` — that
	// helper force-sets `Content-Type: application/json` whenever a body is
	// present, but a multipart body needs the browser/fetch's own generated
	// `multipart/form-data; boundary=...` header instead. Chains
	// submit → approve → distribute on the new version automatically: the
	// uploading admin already has review authority over their own group's
	// content, so this collapses what would otherwise be 4 manual calls
	// into "upload and it's on the Tracks tab".
	uploadTrack: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const musicFile = form.get('file');
		const pdfFile = form.get('pdf_file');
		const hasMusic = musicFile instanceof File && musicFile.size > 0;
		const hasPdf = pdfFile instanceof File && pdfFile.size > 0;
		if (!hasMusic && !hasPdf) {
			return fail(400, { error: m.upload_provide_file_or_pdf(), form: 'uploadTrack' });
		}

		const uploadBody = new FormData();
		uploadBody.set('title', String(form.get('title') ?? ''));
		uploadBody.set('owner_type', 'group');
		uploadBody.set('group_id', params.id);
		const composer = String(form.get('composer') ?? '').trim();
		if (composer) uploadBody.set('composer', composer);
		const youtubeUrl = String(form.get('youtube_url') ?? '').trim();
		if (youtubeUrl) uploadBody.set('youtube_url', youtubeUrl);
		const defaultTempoBpm = String(form.get('default_tempo_bpm') ?? '').trim();
		if (defaultTempoBpm) uploadBody.set('default_tempo_bpm', defaultTempoBpm);
		if (hasMusic) uploadBody.set('file', musicFile);
		if (hasPdf) uploadBody.set('pdf_file', pdfFile);

		try {
			let uploadRes: Response;
			try {
				uploadRes = await fetch(`${PUBLIC_API_BASE_URL}/library/pieces`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${locals.token}` },
					body: uploadBody
				});
			} catch {
				return fail(503, { error: m.errors_could_not_reach_server(), form: 'uploadTrack' });
			}
			if (!uploadRes.ok) {
				const body = (await uploadRes.json().catch(() => ({}))) as { detail?: string };
				return fail(uploadRes.status, { error: body.detail ?? m.upload_failed({ status: uploadRes.status }), form: 'uploadTrack' });
			}
			const uploaded = (await uploadRes.json()) as { piece: { id: string }; version: { id: string } };
			const versionId = uploaded.version.id;

			await backendFetch(locals.token, `/library/versions/${versionId}/submit`, { method: 'POST' }, fetch);
			await backendFetch(locals.token, `/library/versions/${versionId}/approve`, { method: 'POST' }, fetch);
			await backendFetch(
				locals.token,
				`/library/pieces/${uploaded.piece.id}/versions/${versionId}/distribute`,
				{ method: 'POST' },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'uploadTrack' });
			throw err;
		}
		return { success: true, form: 'uploadTrack' };
	},

	// Admin-only, full replace — same shape as `updateWeeklyNote` above, and
	// the Backend's own `update_homework` (`PUT /homework/{id}`). Homework
	// doesn't get a separate edit page (the create flow at
	// `admin/new-homework` still does, but editing an existing entry is this
	// tab's own expand-in-place card instead — see `+page.svelte`'s
	// `editingHomeworkId`) so there's no redirect on success, just like the
	// other inline-edit actions on this page.
	updateHomework: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const homeworkId = String(form.get('homeworkId') ?? '');
		const pieceId = String(form.get('pieceId') ?? '') || null;
		const title = String(form.get('title') ?? '').trim();
		const range = String(form.get('range') ?? '').trim();
		const dueDate = String(form.get('dueDate') ?? '');
		const instructions = String(form.get('instructions') ?? '');
		if (!homeworkId) return fail(400, { error: m.groups_missing_homework(), form: 'updateHomework' });
		if (!title || !range) return fail(400, { error: m.groups_enter_title_range(), form: 'updateHomework' });

		try {
			await backendFetch(
				locals.token,
				`/homework/${homeworkId}`,
				{
					method: 'PUT',
					body: JSON.stringify({ piece_id: pieceId, title, range, instructions, due_date: dueDate || null })
				},
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'updateHomework' });
			throw err;
		}
		return { success: true, form: 'updateHomework' };
	},

	// Admin-only; promoting is always allowed, demoting the last admin gets
	// the same 409 removing them would.
	updateMemberRole: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const role = form.get('role') === 'admin' ? 'admin' : 'member';
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'updateMemberRole' });

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/members/${userId}/role`,
				{ method: 'PUT', body: JSON.stringify({ role }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'updateMemberRole' });
			throw err;
		}
		return { success: true, form: 'updateMemberRole' };
	},

	// Admin-only, full replace — free-text context next to a member on the
	// Members page (e.g. "Soprano 2 — Section leader").
	updateMemberTitle: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		if (!userId) return fail(400, { error: m.groups_missing_member(), form: 'updateMemberTitle' });

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/members/${userId}/title`,
				{ method: 'PUT', body: JSON.stringify({ title: title || null }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'updateMemberTitle' });
			throw err;
		}
		return { success: true, form: 'updateMemberTitle' };
	},

	// Any member (including an admin, as long as they're not the last one
	// — the Backend's own 409 covers that) can leave a group they belong
	// to. Redirects to `/home` on success since staying on this page no
	// longer makes sense once the caller isn't a member.
	leaveGroup: async ({ locals, fetch, params }) => {
		try {
			const me = await backendJson<{ id: string }>(locals.token, '/auth/me', undefined, fetch);
			await backendFetch(locals.token, `/groups/${params.id}/members/${me.id}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'leaveGroup' });
			throw err;
		}
		throw redirect(303, lh('/home'));
	},

	// B13, admin-only: create a schedule with its roles in one call — the
	// form's role rows arrive as parallel `roleName`/`roleNeeded` arrays
	// (FormData preserves input order), zipped back together here. Rows
	// left blank (no name typed) are dropped rather than sent as empty roles.
	createResponsibilitySchedule: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const name = String(form.get('scheduleName') ?? '').trim();
		if (!name) return fail(400, { error: m.groups_enter_schedule_name(), form: 'createSchedule' });

		const roleNames = form.getAll('roleName').map((v) => String(v).trim());
		const roleCounts = form.getAll('roleNeeded').map((v) => Number(v) || 1);
		const roles = roleNames
			.map((roleName, i) => ({ name: roleName, needed_count: roleCounts[i] ?? 1 }))
			.filter((r) => r.name);

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/responsibilities/schedules`,
				{ method: 'POST', body: JSON.stringify({ name, roles }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'createSchedule' });
			throw err;
		}
		return { success: true, form: 'createSchedule' };
	},

	updateResponsibilitySchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!scheduleId || !name) return fail(400, { error: m.groups_enter_name(), form: 'editSchedule' });

		try {
			await backendFetch(
				locals.token,
				`/responsibilities/schedules/${scheduleId}`,
				{ method: 'PATCH', body: JSON.stringify({ name }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editSchedule' });
			throw err;
		}
		return { success: true, form: 'editSchedule' };
	},

	// Deletes the whole responsibility — its roles, dates, and signups go
	// with it (see the Backend route's own note on why there's no undo).
	// The confirm step lives entirely in the UI (a click-to-reveal button).
	deleteResponsibilitySchedule: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		if (!scheduleId) return fail(400, { error: m.groups_missing_responsibility(), form: 'editSchedule' });

		try {
			await backendFetch(locals.token, `/responsibilities/schedules/${scheduleId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editSchedule' });
			throw err;
		}
		return { success: true, form: 'editSchedule' };
	},

	addResponsibilityRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const neededCount = Number(form.get('neededCount')) || 1;
		if (!scheduleId || !name) return fail(400, { error: m.groups_enter_role_name(), form: 'editSchedule' });

		try {
			await backendFetch(
				locals.token,
				`/responsibilities/schedules/${scheduleId}/roles`,
				{ method: 'POST', body: JSON.stringify({ name, needed_count: neededCount }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editSchedule' });
			throw err;
		}
		return { success: true, form: 'editSchedule' };
	},

	updateResponsibilityRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const neededCount = Number(form.get('neededCount')) || 1;
		if (!roleId || !name) return fail(400, { error: m.groups_enter_role_name(), form: 'editSchedule' });

		try {
			await backendFetch(
				locals.token,
				`/responsibilities/roles/${roleId}`,
				{ method: 'PATCH', body: JSON.stringify({ name, needed_count: neededCount }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editSchedule' });
			throw err;
		}
		return { success: true, form: 'editSchedule' };
	},

	deleteResponsibilityRole: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const roleId = String(form.get('roleId') ?? '');
		if (!roleId) return fail(400, { error: m.groups_missing_role(), form: 'editSchedule' });

		try {
			await backendFetch(locals.token, `/responsibilities/roles/${roleId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editSchedule' });
			throw err;
		}
		return { success: true, form: 'editSchedule' };
	},

	// B13, admin-only: one concrete occurrence of a schedule.
	addResponsibilityDate: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const scheduleId = String(form.get('scheduleId') ?? '');
		const dateInput = String(form.get('date') ?? '');
		const notes = String(form.get('notes') ?? '').trim();
		if (!scheduleId || !dateInput) return fail(400, { error: m.groups_choose_schedule_date(), form: 'addDate' });

		try {
			await backendFetch(
				locals.token,
				`/responsibilities/schedules/${scheduleId}/dates`,
				{ method: 'POST', body: JSON.stringify({ date: new Date(dateInput).toISOString(), notes }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'addDate' });
			throw err;
		}
		return { success: true, form: 'addDate' };
	},

	// B13, admin-only: covers edit (date/notes), lock/unlock, and cancel/
	// reinstate all in one partial-patch action — each caller only submits
	// the field(s) it's actually changing, so this only ever patches what's
	// present in the form.
	updateResponsibilityDate: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		if (!dateId) return fail(400, { error: m.groups_missing_date() });

		const body: { date?: string; notes?: string; locked?: boolean; canceled?: boolean } = {};
		if (form.has('date')) {
			const dateInput = String(form.get('date') ?? '');
			if (!dateInput) return fail(400, { error: m.groups_choose_date(), form: 'editDate' });
			body.date = new Date(dateInput).toISOString();
		}
		if (form.has('notes')) body.notes = String(form.get('notes') ?? '').trim();
		if (form.has('locked')) body.locked = form.get('locked') === 'true';
		if (form.has('canceled')) body.canceled = form.get('canceled') === 'true';

		try {
			await backendFetch(locals.token, `/responsibilities/dates/${dateId}`, { method: 'PATCH', body: JSON.stringify(body) }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editDate' });
			throw err;
		}
		return { success: true, form: 'editDate' };
	},

	// Admin-only, a real delete (its signups go with it) — distinct from
	// "Cancel", which just flips a status flag and keeps the date + its
	// signup history around. Confirm step lives entirely in the UI.
	deleteResponsibilityDate: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = RESPONSIBILITY_DATE_ID(form);
		if (!dateId) return fail(400, { error: m.groups_missing_date() });

		try {
			await backendFetch(locals.token, `/responsibilities/dates/${dateId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editDate' });
			throw err;
		}
		return { success: true, form: 'editDate' };
	},

	// B13: no `userId`/`name` in the form means "sign myself up" (member
	// self-signup); an explicit `userId` is an admin assigning an existing
	// member; a `name` with no `userId` is an admin assigning someone with
	// no Divisi account at all (the Backend route enforces both admin
	// checks server-side either way).
	signUpResponsibility: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const dateId = String(form.get('dateId') ?? '');
		const roleId = String(form.get('roleId') ?? '');
		const userId = String(form.get('userId') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		if (!dateId || !roleId) return fail(400, { error: m.groups_missing_date_or_role() });

		try {
			await backendFetch(
				locals.token,
				`/responsibilities/dates/${dateId}/signups`,
				{
					method: 'POST',
					body: JSON.stringify({ role_id: roleId, user_id: userId || undefined, name: name || undefined })
				},
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'signUp' });
			throw err;
		}
		return { success: true, form: 'signUp' };
	},

	removeResponsibilitySignup: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const signupId = String(form.get('signupId') ?? '');
		if (!signupId) return fail(400, { error: m.groups_missing_signup() });

		try {
			await backendFetch(locals.token, `/responsibilities/signups/${signupId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'signUp' });
			throw err;
		}
		return { success: true, form: 'signUp' };
	},

	// Admin-only: a dated bulletin entry (title/body/note_date). `note_date`
	// arrives as a plain `<input type="date">` value ("YYYY-MM-DD"), which
	// `new Date(...)` parses as UTC midnight — good enough for a "week of"
	// date with no time-of-day meaning.
	createWeeklyNote: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const noteDateInput = String(form.get('noteDate') ?? '');
		if (!title || !noteDateInput) return fail(400, { error: m.groups_enter_title_date(), form: 'createWeeklyNote' });

		try {
			await backendFetch(
				locals.token,
				`/groups/${params.id}/weekly-notes`,
				{ method: 'POST', body: JSON.stringify({ title, body, note_date: new Date(noteDateInput).toISOString() }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'createWeeklyNote' });
			throw err;
		}
		return { success: true, form: 'createWeeklyNote' };
	},

	updateWeeklyNote: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const noteId = String(form.get('noteId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		const noteDateInput = String(form.get('noteDate') ?? '');
		if (!noteId || !title || !noteDateInput) return fail(400, { error: m.groups_enter_title_date(), form: 'editWeeklyNote' });

		try {
			await backendFetch(
				locals.token,
				`/weekly-notes/${noteId}`,
				{ method: 'PUT', body: JSON.stringify({ title, body, note_date: new Date(noteDateInput).toISOString() }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editWeeklyNote' });
			throw err;
		}
		return { success: true, form: 'editWeeklyNote' };
	},

	deleteWeeklyNote: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const noteId = String(form.get('noteId') ?? '');
		if (!noteId) return fail(400, { error: m.groups_missing_note(), form: 'editWeeklyNote' });

		try {
			await backendFetch(locals.token, `/weekly-notes/${noteId}`, { method: 'DELETE' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message, form: 'editWeeklyNote' });
			throw err;
		}
		return { success: true, form: 'editWeeklyNote' };
	}
};
