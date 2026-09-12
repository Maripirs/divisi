import { error, redirect } from '@sveltejs/kit';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { lh } from '$lib/i18n';
import type { GroupCustomPageOut } from '$lib/server/backendTypes';
import type { PageServerLoad } from './$types';

/** F27: the by-slug counterpart to the admin management list the group
 * page's own `+page.server.ts` loads: this is how a member actually
 * reaches one custom page, since there's no member-facing "list every
 * custom page" route yet (see that file's comment on why `GET
 * .../custom-pages` 403s for a non-admin). An admin lands here too, via
 * the Pages tab's own "View" link, and bypasses every gate exactly like
 * `require_member_page_access` does on the Backend. */
export const load: PageServerLoad = async ({ parent, locals, fetch, params }) => {
	const { user } = await parent();
	if (!user) throw redirect(303, lh(`/login?redirectTo=/groups/${params.id}/pages/${params.slug}`));

	try {
		const customPage = await backendJson<GroupCustomPageOut>(
			locals.token,
			`/groups/${params.id}/pages/${params.slug}`,
			undefined,
			fetch
		);
		return { groupId: params.id, customPage };
	} catch (err) {
		if (err instanceof BackendApiError) throw error(err.status, err.message);
		throw err;
	}
};
