import { error, fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { PageServerLoad, Actions } from './$types';

/** Admin-only "review & AI edit" page, always reachable for a piece that
 * has both a music file and a PDF -- not gated on anything having been
 * generated first (merged from two earlier, separately-reachable pages:
 * a review-only page only reachable while a draft was pending, and an
 * "AI edit" page only reachable when nothing was pending -- the user
 * wanted one page, always available, that does both).
 *
 * Shows whichever of two things is relevant right now:
 * - A pending working-draft `PieceVersion` (left unpublished by either
 *   "Generate lyrics from PDF" or "AI edit" -- both land in the same
 *   one-working-draft-slot per piece, see either Backend route's own doc
 *   comment for why neither auto-publishes): its PDF/score, with
 *   Approve/Discard actions.
 * - Otherwise, the piece's current *live* version: its PDF/score, with
 *   the AI-edit measure-range-and-message form active instead (submitting
 *   it lands a new draft and redirects back to this same page, which then
 *   shows that draft's Approve/Discard state).
 *
 * Blocking SSR load here on purpose, unlike the player at
 * `piece/[id]/+page.server.ts` -- that route's `ssr:false`/deferred-fetch
 * dance exists specifically to avoid blanking a public, frequently-opened
 * share link on a cold Backend; this is an admin-only, occasional page
 * where waiting for the Backend once is the simpler and entirely
 * acceptable trade. */
export const load: PageServerLoad = async ({ params, locals, url, fetch }) => {
	if (!locals.token) throw redirect(303, lh(`/login?redirectTo=${url.pathname}`));

	const entries = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
	const entry = entries.find((e) => e.piece_id === params.id);
	if (!entry) throw error(404, m.piece_not_found());
	if (!entry.has_music || !entry.has_pdf) {
		throw error(400, m.ai_edit_missing_files());
	}

	let isAdmin = false;
	if (entry.owner_type === 'group') {
		const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
		isAdmin = groups.find((g) => g.id === entry.owner_id)?.role === 'admin';
	}
	if (!isAdmin) throw error(403, m.errors_admin_required());

	// A pending draft (if any) takes priority over the live version -- it's
	// the thing that actually needs a decision. `versionId` is whichever of
	// the two this page is actually showing; `draftId` (only set in the
	// draft case) is what the template uses to decide which mode it's in.
	const draftId = entry.pending_generated_version_id;
	const versionId = draftId ?? entry.version_id;

	// Raw text, not `backendJson` -- this is a version's MusicXML file
	// content, not a JSON API response.
	let xml: string;
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${versionId}/file`, {
			headers: { Authorization: `Bearer ${locals.token}` }
		});
		if (!res.ok) throw error(res.status, m.errors_could_not_reach_server());
		xml = await res.text();
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(503, m.errors_could_not_reach_server());
	}

	return {
		pieceId: params.id,
		pieceTitle: entry.title,
		groupId: entry.owner_id,
		draftId,
		pdfUrl: `/piece/${params.id}/versions/${versionId}/pdf`,
		xml
	};
};

export const actions: Actions = {
	approve: async ({ locals, fetch, request }) => {
		const form = await request.formData();
		const draftId = String(form.get('draftId') ?? '');
		if (!draftId) return fail(400, { error: m.groups_missing_track() });
		try {
			await backendFetch(
				locals.token,
				`/library/versions/${draftId}/publish`,
				{ method: 'POST', body: JSON.stringify({ seams_resolved: true }) },
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}
		const groupId = String(form.get('groupId') ?? '');
		throw redirect(303, lh(`/groups/${groupId}?tab=tracks&view=admin`));
	},

	discard: async ({ params, locals, fetch, request }) => {
		const form = await request.formData();
		const draftId = String(form.get('draftId') ?? '');
		if (!draftId) return fail(400, { error: m.groups_missing_track() });
		try {
			await backendFetch(locals.token, `/library/versions/${draftId}/reject`, { method: 'POST' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}
		// Back to this same page, not the Tracks tab -- discarding just
		// clears the pending draft, so the piece's live version (still
		// untouched) is exactly what this page shows next, ready for
		// another AI edit if that's what's next.
		throw redirect(303, lh(`/piece/${params.id}/review`));
	},

	submitEdit: async ({ params, locals, fetch, request }) => {
		const form = await request.formData();
		const startRaw = String(form.get('measure_start') ?? '').trim();
		const endRaw = String(form.get('measure_end') ?? '').trim();
		const message = String(form.get('message') ?? '').trim();
		const measureStart = Number(startRaw);
		const measureEnd = Number(endRaw);
		if (!startRaw || !endRaw || !Number.isInteger(measureStart) || !Number.isInteger(measureEnd)) {
			return fail(400, { error: m.ai_edit_range_required() });
		}
		if (!message) {
			return fail(400, { error: m.ai_edit_message_required() });
		}

		try {
			await backendFetch(
				locals.token,
				`/library/pieces/${params.id}/edit-measures`,
				{
					method: 'POST',
					body: JSON.stringify({ measure_start: measureStart, measure_end: measureEnd, message }),
					// One real Groq call, not lyrics generation's many sequential
					// per-page ones, but still a real LLM round trip --
					// `backendFetch`'s default 20s timeout has no margin for that.
					// Same 2-minute budget `ai-edit`'s own action used.
					signal: AbortSignal.timeout(2 * 60 * 1000)
				},
				fetch
			);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}

		// Back to this same page -- it now has a pending draft, so the next
		// load shows it with Approve/Discard instead of the edit form.
		throw redirect(303, lh(`/piece/${params.id}/review`));
	}
};
