// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** JWT from the `divisi_session` httpOnly cookie (see
			 * `hooks.server.ts`/`$lib/server/session.ts`), or `null` if the
			 * visitor isn't logged in. Never exposed to client-side JS —
			 * only `+page.server.ts`/`+layout.server.ts` code should read it. */
			token: string | null;
			/** F24 / Backend B20: the join code from the `divisi_demo_preview`
			 * marker cookie (see `$lib/server/demoPreviewSession.ts`), or
			 * `null` when this session isn't a demo "Preview Admin" session.
			 * Threaded into `PageData` by the root `+layout.server.ts` so
			 * `+layout.svelte` can render the persistent preview banner. */
			demoPreviewJoinCode: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
