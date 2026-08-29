import { redirect } from '@sveltejs/kit';
import { backendJson } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { GroupOut, LibraryEntryOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

/** Logged-out visitors land on `/welcome` (onboarding), not straight into
 * the library — a bare `/` used to show the guest-accessible demo library
 * directly, which meant a first-time/logged-out visit skipped the welcome
 * screen entirely. `?guest=1` (set by `/welcome`'s "Explore demo" link and
 * `BottomNav`'s Library tab) opts back into the library without a login,
 * so guest browsing still works once someone's chosen to be here. */
export const load: PageServerLoad = async ({ parent, locals, fetch, url }) => {
	const { user } = await parent();
	if (!user) {
		if (url.searchParams.get('guest') !== '1') throw redirect(303, lh('/welcome'));
		return { groupSections: [] };
	}

	const groups = await backendJson<GroupOut[]>(locals.token, '/groups', undefined, fetch);
	const library = await backendJson<LibraryEntryOut[]>(locals.token, '/library/pieces', undefined, fetch);

	const groupSections = groups.map((group) => ({
		group,
		pieces: library.filter((entry) => entry.owner_type === 'group' && entry.owner_id === group.id)
	}));

	return { groupSections };
};
