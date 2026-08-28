import {
	GuestApiError,
	GuestPasswordRequiredError,
	JoinCodeNotFoundError,
	listGuestHomework,
	resolveJoinCode,
	type GuestHomework
} from '$lib/api/guest';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, fetch }) => {
	// Join codes are generated uppercase (see Backend's join_codes.py) but
	// people typing/reading one aloud shouldn't have to get the case right.
	const code = params.code.toUpperCase();
	// B10: an optional per-group password, carried in the URL so a wrong/
	// missing password re-runs this `load` via a plain GET form resubmit
	// rather than needing separate client-side state — see the password
	// prompt in +page.svelte. Accepted MVP tradeoff: it's visible in the
	// URL/browser history, same tier of protection as e.g. a Google Docs
	// share link's edit token.
	const password = url.searchParams.get('password') ?? undefined;

	try {
		const group = await resolveJoinCode(code, { password, fetchFn: fetch });
		// `homeworkVisible` distinguishes "this group opted out (or the
		// admin never turned it on)" from "opted in, just nothing due yet" —
		// both resolve `listGuestHomework` to an empty array, so the flag is
		// tracked separately rather than inferred from the array's length.
		let homework: GuestHomework[] = [];
		let homeworkVisible = false;
		try {
			homework = await listGuestHomework(code, { password, fetchFn: fetch });
			homeworkVisible = true;
		} catch (err) {
			// Password was already accepted above (or this group needs none),
			// so only a 404 (homework not exposed to guests for this group)
			// is expected here — anything else is a real error.
			if (!(err instanceof GuestApiError && err.status === 404)) throw err;
		}
		return { code, password, group, homework, homeworkVisible, error: null };
	} catch (err) {
		if (err instanceof JoinCodeNotFoundError) {
			return { code, password, group: null, homework: [], homeworkVisible: false, error: 'not-found' as const };
		}
		if (err instanceof GuestPasswordRequiredError) {
			return {
				code,
				password,
				group: null,
				homework: [],
				homeworkVisible: false,
				error: 'password-required' as const
			};
		}
		if (err instanceof GuestApiError) {
			return { code, password, group: null, homework: [], homeworkVisible: false, error: 'server' as const };
		}
		throw err;
	}
};
