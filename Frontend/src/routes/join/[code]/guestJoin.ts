import {
	GuestApiError,
	JoinCodeNotFoundError,
	getGuestTabs,
	listGuestAbout,
	listGuestCarpoolEvents,
	listGuestCarpoolPosts,
	listGuestGroupResources,
	listGuestHomework,
	listGuestResponsibilityDates,
	listGuestWeeklyNotes,
	resolveJoinCode,
	type GuestAbout,
	type GuestCarpoolEvent,
	type GuestCarpoolPost,
	type GuestGroup,
	type GuestGroupResource,
	type GuestHomework,
	type GuestResponsibilityDate,
	type GuestWeeklyNote
} from '$lib/api/guest';
import { selectDefaultCarpoolEventId } from '$lib/utils/carpool';

async function loadVisible<T>(visible: boolean, fallback: T, load: () => Promise<T>): Promise<{ visible: boolean; data: T }> {
	if (!visible) return { visible: false, data: fallback };
	try {
		return { visible: true, data: await load() };
	} catch (err) {
		if (err instanceof GuestApiError && err.status === 404) return { visible: false, data: fallback };
		throw err;
	}
}

async function loadVisibleCarpool(
	visible: boolean,
	code: string,
	token: string | undefined,
	fetch: typeof globalThis.fetch,
	requestedEventId: string | null
): Promise<{
	visible: boolean;
	events: GuestCarpoolEvent[];
	selectedEventId: string | null;
	posts: GuestCarpoolPost[];
}> {
	if (!visible) return { visible: false, events: [], selectedEventId: null, posts: [] };
	try {
		const events = await listGuestCarpoolEvents(code, { token, fetchFn: fetch });
		const selectedEventId = selectDefaultCarpoolEventId(events, requestedEventId);
		const posts = selectedEventId ? await listGuestCarpoolPosts(code, selectedEventId, { token, fetchFn: fetch }) : [];
		return { visible: true, events, selectedEventId, posts };
	} catch (err) {
		if (err instanceof GuestApiError && err.status === 404) {
			return { visible: false, events: [], selectedEventId: null, posts: [] };
		}
		throw err;
	}
}

/** The resolved shape of the streamed guest promise. A discriminated union
 * on `error` so `./$types` infers `data.result` as a single consistent
 * `Promise<GuestJoinResult>` for the `{:then result}` branch in
 * +page.svelte. The two string variants map one-to-one to the known guest
 * errors; the `error: null` variant carries the full guest view.
 *
 * There is no `'password-required'` variant any more: a valid join code
 * authorizes the guest routes on its own, so `/guest/{code}` never answers
 * 401. The guest password now only gates the bare `/piece/{id}` link (no
 * `?code=`) via `routes/piece/[id]/+page.server.ts`.
 *
 * Lives here (not in `+page.ts`) so both `+page.ts` and the
 * `./data/+server.ts` endpoint that actually runs the fan-out can import it
 * without a route module importing another route module. `+page.ts`
 * re-exports it for `./$types` inference. */
export type GuestJoinResult =
	| { error: 'not-found' }
	| { error: 'server' }
	| {
			error: null;
			group: GuestGroup;
			homework: GuestHomework[];
			homeworkVisible: boolean;
			responsibilities: GuestResponsibilityDate[];
			responsibilitiesVisible: boolean;
			weeklyNotes: GuestWeeklyNote[];
			weeklyNotesVisible: boolean;
			// B31/F36: carpool joined the other three built-in pages here once it
			// stopped being a `GroupCustomPage` — same `...Visible` shape, plus
			// its actual content (the events list and the selected one's posts),
			// since there's no more separate `pages/[slug]` route to fetch those
			// lazily on its own.
			carpoolVisible: boolean;
			carpoolEvents: GuestCarpoolEvent[];
			carpoolSelectedEventId: string | null;
			carpoolPosts: GuestCarpoolPost[];
			// B33/F39: same optional-page shape as the others — Info/About's
			// guest content (description + regular-rehearsal schedule), only
			// fetched at all once `aboutVisible` says the group opted in.
			aboutVisible: boolean;
			about: GuestAbout | null;
			// Backlog: rides along with the same `aboutVisible` gate above (see
			// the Backend `GroupResource` model docstring on why resources share
			// the `about` page's settings rather than one of its own) — always
			// `[]` when `aboutVisible` is `false`.
			groupResources: GuestGroupResource[];
	  };

/** Runs every guest fetch and resolves (never rejects) to a `GuestJoinResult`
 * for the known guest errors (`not-found`, `server`). Anything else still
 * throws, so the caller (`./data/+server.ts`) can map it to
 * `{ error: 'server' }`.
 *
 * `token` is the opaque guest token from the per-group httpOnly cookie
 * (`$lib/server/guestSession.ts`), read server-side by the `data` endpoint.
 * The guest routes authorize on the join code alone now, so the token is no
 * longer required for access — it is still forwarded when present (set by
 * `POST /guest/{code}/auth`, the no-`?code=` piece-link gate) so it isn't
 * silently dropped.
 *
 * `requestedEventId` is the guest page's own `?event=` query param (mirrors
 * the member/admin main page's own carpool event selector), threaded down
 * from `./data/+server.ts`. */
export async function loadGuestJoin(
	code: string,
	token: string | undefined,
	fetch: typeof globalThis.fetch,
	requestedEventId: string | null = null
): Promise<GuestJoinResult> {
	try {
		const group = await resolveJoinCode(code, { token, fetchFn: fetch });
		const tabs = await getGuestTabs(code, { token, fetchFn: fetch });
		const [homeworkResult, responsibilitiesResult, weeklyNotesResult, carpoolResult, aboutResult, groupResourcesResult] =
			await Promise.all([
				loadVisible(tabs.homeworkVisible, [] as GuestHomework[], () => listGuestHomework(code, { token, fetchFn: fetch })),
				loadVisible(tabs.responsibilitiesVisible, [] as GuestResponsibilityDate[], () =>
					listGuestResponsibilityDates(code, { token, fetchFn: fetch })
				),
				loadVisible(tabs.weeklyNotesVisible, [] as GuestWeeklyNote[], () => listGuestWeeklyNotes(code, { token, fetchFn: fetch })),
				loadVisibleCarpool(tabs.carpoolVisible, code, token, fetch, requestedEventId),
				loadVisible(tabs.aboutVisible, null as GuestAbout | null, () => listGuestAbout(code, { token, fetchFn: fetch })),
				loadVisible(tabs.aboutVisible, [] as GuestGroupResource[], () =>
					listGuestGroupResources(code, { token, fetchFn: fetch })
				)
			]);

		return {
			error: null,
			group,
			homework: homeworkResult.data,
			homeworkVisible: homeworkResult.visible,
			responsibilities: responsibilitiesResult.data,
			responsibilitiesVisible: responsibilitiesResult.visible,
			weeklyNotes: weeklyNotesResult.data,
			weeklyNotesVisible: weeklyNotesResult.visible,
			carpoolVisible: carpoolResult.visible,
			carpoolEvents: carpoolResult.events,
			carpoolSelectedEventId: carpoolResult.selectedEventId,
			carpoolPosts: carpoolResult.posts,
			aboutVisible: aboutResult.visible,
			about: aboutResult.data,
			groupResources: groupResourcesResult.data
		};
	} catch (err) {
		if (err instanceof JoinCodeNotFoundError) return { error: 'not-found' };
		// A 401 can't reach here any more (the join code authorizes on its
		// own), but if one ever did it arrives as a `GuestApiError` and maps
		// to the same "try again" card as any other API failure — never a
		// password prompt.
		if (err instanceof GuestApiError) return { error: 'server' };
		throw err;
	}
}
