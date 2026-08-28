import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Admin is now a *view* of `/groups/[id]` (the role switcher), not its own
// destination — see UX_WIREFRAME.md's Admin Experience direction. This
// route stays only so any existing link/bookmark to it still lands
// somewhere sensible.
export const load: PageServerLoad = async ({ params }) => {
	throw redirect(303, `/groups/${params.id}?view=admin`);
};
