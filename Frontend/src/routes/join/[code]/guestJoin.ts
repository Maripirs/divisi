import {
	GuestApiError,
	JoinCodeNotFoundError,
	listGuestCustomPages,
	listGuestHomework,
	listGuestResponsibilityDates,
	listGuestWeeklyNotes,
	resolveJoinCode,
	type GuestCustomPageListItem,
	type GuestGroup,
	type GuestHomework,
	type GuestResponsibilityDate,
	type GuestWeeklyNote
} from '$lib/api/guest';

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
			customPages: GuestCustomPageListItem[];
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
 * silently dropped. */
export async function loadGuestJoin(
	code: string,
	token: string | undefined,
	fetch: typeof globalThis.fetch
): Promise<GuestJoinResult> {
	try {
		const group = await resolveJoinCode(code, { token, fetchFn: fetch });
		// `homeworkVisible` distinguishes "this group opted out (or the
		// admin never turned it on)" from "opted in, just nothing due yet" (
		// both resolve `listGuestHomework` to an empty array), so the flag is
		// tracked separately rather than inferred from the array's length.
		let homework: GuestHomework[] = [];
		let homeworkVisible = false;
		try {
			homework = await listGuestHomework(code, { token, fetchFn: fetch });
			homeworkVisible = true;
		} catch (err) {
			// Token was already accepted above (or this group needs none),
			// so only a 404 (homework not exposed to guests for this group)
			// is expected here. Anything else is a real error.
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}

		// B13: same optional-page shape as homework above. A 404 here means
		// this group hasn't opted `responsibilities` into guest visibility.
		let responsibilities: GuestResponsibilityDate[] = [];
		let responsibilitiesVisible = false;
		try {
			responsibilities = await listGuestResponsibilityDates(code, { token, fetchFn: fetch });
			responsibilitiesVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}

		// Same optional-page shape again. A 404 here means this group hasn't
		// opted `weekly_notes` into guest visibility (members-only default).
		let weeklyNotes: GuestWeeklyNote[] = [];
		let weeklyNotesVisible = false;
		try {
			weeklyNotes = await listGuestWeeklyNotes(code, { token, fetchFn: fetch });
			weeklyNotesVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}

		// B25/F29: published + `audience: everyone` custom pages (carpool
		// boards, today). Unlike the three lists above, this route has no
		// per-group opt-in to gate on — it always answers with whatever
		// matches, possibly empty — so there's no `...Visible` flag: an empty
		// array already means "nothing to discover."
		const customPages = await listGuestCustomPages(code, { token, fetchFn: fetch });

		return {
			error: null,
			group,
			homework,
			homeworkVisible,
			responsibilities,
			responsibilitiesVisible,
			weeklyNotes,
			weeklyNotesVisible,
			customPages
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
