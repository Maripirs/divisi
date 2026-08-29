import type { Reroute } from '@sveltejs/kit';
import { deLocalizeUrl } from '$lib/paraglide/runtime';

/** i18n: SvelteKit routes never actually live under `/es/...` on disk — this
 * strips the locale prefix before route matching, so `/es/login` resolves
 * to the same `+page.svelte` as `/login`; the locale itself is picked up
 * server-side in `hooks.server.ts`'s `paraglideMiddleware`. */
export const reroute: Reroute = (request) => {
	return deLocalizeUrl(request.url).pathname;
};
