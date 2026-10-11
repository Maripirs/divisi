import { deLocalizeHref } from '$lib/paraglide/runtime';
import { safeRedirectTarget } from '$lib/redirectTarget';

/** The `/login` link for a Create account / Log in button that should bring
 * the visitor back to where they were once they're signed in, via the login
 * page's `redirectTo` (which its server actions already honor, same-site
 * paths only). The real incident this exists for: a guest on a group's join
 * link tapped Create account, landed on an empty `/home`, and had to find
 * their way back to the group by retyping its code.
 *
 * `returnTo` is the current path + search (`page.url.pathname +
 * page.url.search`). It's de-localized here because the login actions run
 * it back through `lh`, which adds the locale prefix itself. `null`, or
 * anything that isn't a same-site path, just omits `redirectTo` (the login
 * page then defaults to `/home`). Returns an unlocalized path: wrap it in
 * `lh` like any other internal link. */
export function authHref(mode: 'login' | 'register', returnTo: string | null): string {
	const params = new URLSearchParams();
	if (mode === 'register') params.set('mode', 'register');
	if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
		const path = deLocalizeHref(returnTo);
		// Coming back to the login page itself would be a loop, not a return.
		if (!/^\/login(?:[/?#]|$)/.test(path)) params.set('redirectTo', path);
	}
	const query = params.toString();
	return query ? `/login?${query}` : '/login';
}

/** `path` with `?redirectTo=` carried along when there is a same-site
 * place to return to: threads a login page's `redirectTo` through the
 * forgot-password and reset-password screens (and back to login), so a
 * member who forgot their password mid-way still ends up where they were
 * headed. `null`, `''`, or an unsafe value just returns `path`. Returns an
 * unlocalized path: wrap it in `lh`. */
export function withReturnTo(path: string, returnTo: string | null): string {
	const safe = safeRedirectTarget(returnTo, '');
	if (!safe) return path;
	return `${path}${path.includes('?') ? '&' : '?'}redirectTo=${encodeURIComponent(safe)}`;
}
