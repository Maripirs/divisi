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
import type { PageLoad } from './$types';

/** The resolved shape of the streamed guest promise. A discriminated union
 * on `error` so `./$types` infers `data.result` as a single consistent
 * `Promise<GuestJoinResult>` for the `{:then result}` branch in
 * +page.svelte. The three string variants map one-to-one to the known
 * guest errors; the `error: null` variant carries the full guest view. */
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
 * for the three known guest errors. Anything else still throws, so it lands
 * in the component's `{:catch}` branch. Split out of `load` so `load` can
 * hand back its promise unawaited. */
async function loadGuestJoin(
	code: string,
	password: string | undefined,
	fetch: typeof globalThis.fetch
): Promise<GuestJoinResult> {
	try {
		const group = await resolveJoinCode(code, { password, fetchFn: fetch });
		// `homeworkVisible` distinguishes "this group opted out (or the
		// admin never turned it on)" from "opted in, just nothing due yet" (
		// both resolve `listGuestHomework` to an empty array), so the flag is
		// tracked separately rather than inferred from the array's length.
		let homework: GuestHomework[] = [];
		let homeworkVisible = false;
		try {
			homework = await listGuestHomework(code, { password, fetchFn: fetch });
			homeworkVisible = true;
		} catch (err) {
			// Password was already accepted above (or this group needs none),
			// so only a 404 (homework not exposed to guests for this group)
			// is expected here. Anything else is a real error.
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}

		// B13: same optional-page shape as homework above. A 404 here means
		// this group hasn't opted `responsibilities` into guest visibility.
		let responsibilities: GuestResponsibilityDate[] = [];
		let responsibilitiesVisible = false;
		try {
			responsibilities = await listGuestResponsibilityDates(code, { password, fetchFn: fetch });
			responsibilitiesVisible = true;
		} catch (err) {
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}

		// Same optional-page shape again. A 404 here means this group hasn't
		// opted `weekly_notes` into guest visibility (members-only default).
		let weeklyNotes: GuestWeeklyNote[] = [];
		let weeklyNotesVisible = false;
		try {
			weeklyNotes = await listGuestWeeklyNotes(code, { password, fetchFn: fetch });
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

export const load: PageLoad = ({ params, url, fetch }) => {
	// Join codes are generated uppercase (see Backend's join_codes.py) but
	// people typing/reading one aloud shouldn't have to get the case right.
	const code = params.code.toUpperCase();
	// B10: an optional per-group password, carried in the URL so a wrong/
	// missing password re-runs this `load` via a plain GET form resubmit
	// rather than needing separate client-side state (see the password
	// prompt in +page.svelte). Accepted MVP tradeoff: it's visible in the
	// URL/browser history, same tier of protection as e.g. a Google Docs
	// share link's edit token.
	const password = url.searchParams.get('password') ?? undefined;

	// The guest data is returned as an UNAWAITED promise. The Backend runs
	// on Render's free tier, which sleeps after inactivity and takes ~30s to
	// cold-start. Awaiting the fetch fan-out here would hold the whole SSR
	// response open for that entire wake-up, and the visitor gets a blank
	// error until they manually refresh. Handing `load` the promise instead
	// lets SvelteKit stream: the page shell plus a `<LoadingBlock />` paint
	// immediately, and the guest view swaps in when the Backend answers.
	// `src/routes/home/` returns its `home` promise the same way for the
	// same reason. `code` and `password` stay resolved on the returned
	// object because many links and lazy loaders in +page.svelte read them
	// and must not wait on the promise.
	return { code, password, result: loadGuestJoin(code, password, fetch) };
};
