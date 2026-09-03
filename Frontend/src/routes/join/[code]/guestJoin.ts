import {
	GuestApiError,
	GuestPasswordRequiredError,
	JoinCodeNotFoundError,
	listGuestHomework,
	listGuestResponsibilityDates,
	listGuestWeeklyNotes,
	resolveJoinCode,
	type GuestGroup,
	type GuestHomework,
	type GuestResponsibilityDate,
	type GuestWeeklyNote
} from '$lib/api/guest';

/** The resolved shape of the streamed guest promise. A discriminated union
 * on `error` so `./$types` infers `data.result` as a single consistent
 * `Promise<GuestJoinResult>` for the `{:then result}` branch in
 * +page.svelte. The three string variants map one-to-one to the known
 * guest errors; the `error: null` variant carries the full guest view.
 *
 * Lives here (not in `+page.ts`) so both `+page.ts` and the
 * `./data/+server.ts` endpoint that actually runs the fan-out can import it
 * without a route module importing another route module. `+page.ts`
 * re-exports it for `./$types` inference. */
export type GuestJoinResult =
	| { error: 'not-found' }
	| { error: 'password-required' }
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
	  };

/** Runs every guest fetch and resolves (never rejects) to a `GuestJoinResult`
 * for the three known guest errors. Anything else still throws, so the
 * caller (`./data/+server.ts`) can map it to `{ error: 'server' }`.
 *
 * `token` is the opaque guest token from the per-group httpOnly cookie
 * (`$lib/server/guestSession.ts`), read server-side by the `data` endpoint —
 * equivalent to having supplied the right `?password=`. Undefined for a
 * group with no guest password (the token is simply ignored there). */
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

		return {
			error: null,
			group,
			homework,
			homeworkVisible,
			responsibilities,
			responsibilitiesVisible,
			weeklyNotes,
			weeklyNotesVisible
		};
	} catch (err) {
		if (err instanceof JoinCodeNotFoundError) return { error: 'not-found' };
		if (err instanceof GuestPasswordRequiredError) return { error: 'password-required' };
		if (err instanceof GuestApiError) return { error: 'server' };
		throw err;
	}
}
