import { redirect } from '@sveltejs/kit';
import { backendJson } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { GroupOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

export interface GroupSection {
	group: GroupOut;
	pieces: LibraryEntryOut[];
}

/** Logged-out visitors land on `/welcome` (onboarding), not straight into
 * the library — a bare `/` used to show the guest-accessible demo library
 * directly, which meant a first-time/logged-out visit skipped the welcome
 * screen entirely. `?guest=1` (set by `/welcome`'s "Explore demo" link and
 * `BottomNav`'s Library tab) opts back into the library without a login,
 * so guest browsing still works once someone's chosen to be here.
 *
 * The redirect gate keys off the session cookie, not the resolved `user`
 * from `parent()`: the root layout may hand back an optimistic user on a
 * cold Backend start (see `+layout.server.ts`), and a plain "do you have a
 * token" check is all this redirect ever needed anyway. The actual library
 * data is returned as an unawaited promise so the shell + loading state
 * paint immediately instead of the whole document blocking on these two
 * Backend calls. */
export const load: PageServerLoad = ({ locals, fetch, url }) => {
	if (!locals.token) {
		if (url.searchParams.get('guest') !== '1') throw redirect(303, lh('/welcome'));
		return { groupSections: Promise.resolve<GroupSection[]>([]) };
	}

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
