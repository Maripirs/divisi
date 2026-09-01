import { redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { subjectFromToken } from '$lib/server/jwt';
import { lh } from '$lib/i18n';
import type { GroupOut, LibraryEntryOut, WorkingDraftOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

/** Whether the caller may edit this track's music, plus its title (when
 * the piece resolved) so `+page.svelte` can name it without a second
 * lookup. `denied` means the Backend answered and this user is neither the
 * owner (personal piece) nor an admin of the owning group; `notFound`
 * means no such piece in anything the caller can see; `unreachable` is a
 * cold or down Backend (see `resolveEditAccess`'s catch). */
type EditAccess = {
	access: 'granted' | 'denied' | 'notFound' | 'unreachable';
	pieceTitle: string | null;
	/** Whether this piece has an uploaded PDF, so `+page.svelte` can offer
	 * the side-by-side reference pane without a probe request. `false` for
	 * every non-`granted` case (the editor never mounts then anyway). */
	hasPdf: boolean;
	/** B16/F15: the OMR job id whose paged run left seams to review, when
	 * the track's current music came from one. `+page.svelte` fetches its
	 * `/paged-report` and overlays a marker at each unresolved page join.
	 * Null when the music wasn't OMR'd, or the paged run merged cleanly. */
	pagedReportJobId: string | null;
	/** B17/F16: the piece's single open working draft — the version the
	 * editor loads and saves back to. Resolved by `POST
	 * /library/pieces/{id}/working-draft` (create-or-get, copy-on-edit from
	 * the live version). Null only for a non-`granted` state or if that
	 * call failed; the editor then shows its load-error card. */
	workingDraftId: string | null;
	/** True when the working-draft call just created it by copying the live
	 * version — F16's header badge starts at "Live version" until the first
	 * edit in that case, "Working draft — not yet live" otherwise. */
	forkedFromLive: boolean;
};

const NO_ACCESS = { hasPdf: false, pagedReportJobId: null, workingDraftId: null, forkedFromLive: false };

/** The OMR job id to pull a paged report from for this track, or null. */
function pagedReportJobId(entry: LibraryEntryOut): string | null {
	const job = entry.latest_omr_job;
	return job && job.paged && job.needs_review ? job.id : null;
}

/** Edit authority mirrors the Backend's own `_require_review_authority`
 * (`Backend/app/api/routes/library.py`): the owner of a personal
 * (`owner_type === 'user'`) piece, or an `admin` of the owning group. The
 * Backend re-checks it on every save (`POST /library/pieces/{id}/versions`
 * then submit/approve/distribute), so this gate isn't the last line of
 * defence. It's about not opening an editor the user could never save
 * from, and not handing a track's music to someone with no rights to it.
 *
 * A cold or unreachable Backend must not throw here: `backendFetch`
 * normalizes that into a synthetic 503, which becomes `unreachable` for
 * the page to render as a retry card. Same "never blank on a cold
 * Backend" reasoning as the player route, just handled server-side, since
 * this route is admin/owner-only and never the shared-link path a choir
 * member's first paint depends on. */
async function resolveEditAccess(pieceId: string, token: string, fetchFn: typeof fetch): Promise<EditAccess> {
	try {
		// `/library/pieces` lists every piece the caller can see (their own
		// personal pieces, plus every piece owned by a group they're in). A
		// piece missing from it is either genuinely unknown or one this user
		// has no relationship to at all. "Not found" is the right answer
		// either way, same as the player's `resolve/+server.ts`.
		const entries = await backendJson<LibraryEntryOut[]>(token, '/library/pieces', undefined, fetchFn);
		const entry = entries.find((e) => e.piece_id === pieceId);
		if (!entry) return { access: 'notFound', pieceTitle: null, ...NO_ACCESS };

		let granted: boolean;
		if (entry.owner_type === 'user') {
			// Personal piece: only its owner may edit. The caller's own id is
			// the JWT `sub` claim (`+layout.server.ts` uses the same
			// unverified decode on its cold-start path), so no extra
			// `/auth/me` round trip is needed just for an id compare.
			const userId = subjectFromToken(token);
			granted = userId !== null && entry.owner_id === userId;
		} else {
			// Group piece: edit authority is the owning group's `admin` role,
			// read the same way `groups/[id]/+page.server.ts` reads it.
			// `/groups` only lists the caller's own groups, so a group this
			// user isn't in simply won't be found, which is a denial.
			const groups = await backendJson<GroupOut[]>(token, '/groups', undefined, fetchFn);
			granted = groups.find((g) => g.id === entry.owner_id)?.role === 'admin';
		}

		if (!granted) return { access: 'denied', pieceTitle: entry.title, ...NO_ACCESS };

		// B17/F16: get (or create by copy-on-edit) the working draft this
		// editor session edits. Review authority is required for this call,
		// which `granted` above already established.
		const wd = await backendJson<WorkingDraftOut>(
			token,
			`/library/pieces/${pieceId}/working-draft`,
			{ method: 'POST' },
			fetchFn
		);
		return {
			access: 'granted',
			pieceTitle: entry.title,
			hasPdf: entry.has_pdf,
			pagedReportJobId: pagedReportJobId(entry),
			workingDraftId: wd.version.id,
			forkedFromLive: wd.forked_from_live
		};
	} catch (err) {
		if (err instanceof BackendApiError) {
			// An expired or invalid token is worth a real login bounce (it
			// mirrors the player route's logged-out handling); a genuine
			// network failure (synthetic 503) degrades to a retry card; any
			// other answer from the Backend is a real "no".
			if (err.status === 401) throw redirect(303, lh(`/login?redirectTo=/piece/${pieceId}/edit`));
			return {
				access: err.status === 503 ? 'unreachable' : 'denied',
				pieceTitle: null,
				...NO_ACCESS
			};
		}
		throw err;
	}
}

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	if (!locals.token) {
		// No session at all: send them to log in and land back on the editor
		// afterward, same shape as the player route's redirect.
		throw redirect(303, lh(`/login?redirectTo=/piece/${params.id}/edit`));
	}

	const resolved = await resolveEditAccess(params.id, locals.token, fetch);
	return { id: params.id, ...resolved };
};
