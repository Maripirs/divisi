import type { GuestJoinResult } from './guestJoin';
import type { PageLoad } from './$types';

// Re-exported so `+page.svelte` keeps getting the result type through
// `./$types` inference. The resolver itself now lives in `./guestJoin.ts`,
// and the fan-out runs in `./data/+server.ts`, where the group's
// httpOnly guest-token cookie is actually readable.
export type { GuestJoinResult };

export const load: PageLoad = ({ params, fetch, url }) => {
	// Join codes are generated uppercase (see Backend's join_codes.py) but
	// people typing/reading one aloud shouldn't have to get the case right.
	const code = params.code.toUpperCase();
	// B31/F36: carpool's event switcher (`CarpoolBoard.svelte`'s event chips)
	// links to `?event=<id>` on this same page — forwarded to the `data`
	// endpoint below so a clicked event actually changes which one's posts
	// come back, same query param the member/admin main page reads directly
	// in its own `+page.server.ts`.
	const eventQuery = url.searchParams.get('event');
	const dataUrl = `/join/${code}/data${eventQuery ? `?event=${encodeURIComponent(eventQuery)}` : ''}`;

	// The guest data is returned as an UNAWAITED promise. The Backend runs
	// on Render's free tier, which sleeps after inactivity and takes ~30s to
	// cold-start. Awaiting the fetch here would hold the whole SSR response
	// open for that entire wake-up, and the visitor gets a blank error until
	// they manually refresh. Handing `load` the promise instead lets
	// SvelteKit stream: the page shell plus a `<LoadingBlock />` paint
	// immediately, and the guest view swaps in when the Backend answers.
	// `src/routes/home/` returns its `home` promise the same way for the
	// same reason. `code` stays resolved on the returned object because many
	// links and lazy loaders in +page.svelte read it and must not wait on
	// the promise.
	//
	// The fan-out itself moved to `./data/+server.ts` because it needs to
	// read the group's httpOnly guest-token cookie, which this universal
	// `load` cannot on a client-side navigation. A rejected or non-ok fetch
	// resolves to `{ error: 'server' }`, the same shape +page.svelte's
	// retry-card branch already handles.
	const result: Promise<GuestJoinResult> = fetch(dataUrl)
		.then((res) => (res.ok ? (res.json() as Promise<GuestJoinResult>) : ({ error: 'server' } as const)))
		.catch(() => ({ error: 'server' }) as const);

	return { code, result };
};
