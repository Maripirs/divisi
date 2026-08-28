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
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
