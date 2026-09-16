import { error, fail, redirect } from '@sveltejs/kit';
import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { m } from '$lib/paraglide/messages';
import { lh } from '$lib/i18n';
import { backendFetch, backendJson, BackendApiError } from '$lib/server/backend';
import type { GroupOut, LibraryEntryOut, PieceVersionOut } from '$lib/server/backendTypes';
import type { PageServerLoad, Actions } from './$types';

/** Admin-only review page for a lyrics draft "Generate lyrics from PDF"
 * left pending (see `Backend/app/api/routes/library/lyrics.py`'s own doc
 * comment for why it no longer auto-publishes). Blocking SSR load here on
 * purpose, unlike the player at `piece/[id]/+page.server.ts` — that
 * route's `ssr:false`/deferred-fetch dance exists specifically to avoid
 * blanking a public, frequently-opened share link on a cold Backend; this
 * is an admin-only, occasional page where waiting for the Backend once is
 * the simpler and entirely acceptable trade. */
export const load: PageServerLoad = async ({ params, locals, url, fetch }) => {
	if (!locals.token) throw redirect(303, lh(`/login?redirectTo=${url.pathname}`));

	const entries = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);
	const entry = entries.find((e) => e.piece_id === params.id);
	if (!entry) throw error(404, m.piece_not_found());
	if (!entry.pending_generated_version_id) {
		throw error(404, m.review_lyrics_nothing_pending());
	}

	let isAdmin = false;
	if (entry.owner_type === 'group') {
		const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
		isAdmin = groups.find((g) => g.id === entry.owner_id)?.role === 'admin';
	}
	if (!isAdmin) throw error(403, m.errors_admin_required());

	const draftId = entry.pending_generated_version_id;
	// Raw text, not `backendJson` — this is the draft's MusicXML file
	// content, not a JSON API response.
	let xml: string;
	try {
		const res = await fetch(`${PUBLIC_API_BASE_URL}/library/versions/${draftId}/file`, {
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
		pdfUrl: `/piece/${params.id}/versions/${draftId}/pdf`,
		xml
	};
};

export const actions: Actions = {
	approve: async ({ params, locals, fetch, request }) => {
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

	discard: async ({ locals, fetch, request }) => {
		const form = await request.formData();
		const draftId = String(form.get('draftId') ?? '');
		if (!draftId) return fail(400, { error: m.groups_missing_track() });
		try {
			await backendFetch(locals.token, `/library/versions/${draftId}/reject`, { method: 'POST' }, fetch);
		} catch (err) {
			if (err instanceof BackendApiError) return fail(err.status, { error: err.message });
			throw err;
		}
		const groupId = String(form.get('groupId') ?? '');
		throw redirect(303, lh(`/groups/${groupId}?tab=tracks&view=admin`));
	}
};
