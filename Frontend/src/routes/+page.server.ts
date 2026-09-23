import { redirect } from '@sveltejs/kit';
import { backendJson } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { GroupOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

export interface GroupSection {
	group: GroupOut;
	pieces: LibraryEntryOut[];
}

/** The bare root is not the library for either audience:
 *  - logged out → `/welcome` (onboarding), so a first-time visit can't skip it
 *  - logged in  → `/home`, the real landing page
 * The library still lives at `/`, reached explicitly with `?lib=1` — set by
 * Home's library link and the player's back-to-library fallback.
 * `?guest=1` is accepted as a legacy alias for the same intent.
 *
 * The redirect gate keys off the session cookie, not the resolved `user`
 * from `parent()`: the root layout may hand back an optimistic user on a
 * cold Backend start (see `+layout.server.ts`), and a plain "do you have a
 * token" check is all this redirect ever needed anyway. The actual library
 * data is returned as an unawaited promise so the shell + loading state
 * paint immediately instead of the whole document blocking on these two
 * Backend calls. */
export const load: PageServerLoad = ({ locals, fetch, url }) => {
	const wantsLibrary =
		url.searchParams.get('lib') === '1' || url.searchParams.get('guest') === '1';

	if (!locals.token) {
		if (!wantsLibrary) throw redirect(303, lh('/welcome'));
		return { groupSections: Promise.resolve<GroupSection[]>([]) };
	}

	if (!wantsLibrary) throw redirect(303, lh('/home'));

	return { groupSections: loadGroupSections(locals.token, fetch) };
};

async function loadGroupSections(
	token: string,
	fetch: typeof globalThis.fetch
): Promise<GroupSection[]> {
	const [groups, library] = await Promise.all([
		backendJson<GroupOut[]>(token, '/groups', undefined, fetch),
		backendJson<LibraryEntryOut[]>(token, '/library/pieces', undefined, fetch)
	]);

	return groups.map((group) => ({
		group,
		pieces: library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id)
	}));
}
