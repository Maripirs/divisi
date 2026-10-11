import { safeRedirectTarget } from '$lib/redirectTarget';

/** Where a member logging out from a given page should land so they can
 * get back to what they were looking at, as a guest. Pure classification
 * of the (de-localized, same-site) path the logout form posted; the
 * logout route resolves `group`/`piece` to a join code through the public
 * owner lookups.
 *
 * - `/join/{code}...` and `/piece/{id}?code=...` already work signed out:
 *   go straight back (`path`).
 * - `/piece/{id}` with no code (or one of its subpages): `piece`, to be
 *   sent to `/piece/{id}?code={owner's code}`.
 * - `/groups/{id}` or any page under it: `group`, to be sent to that
 *   group's `/join/{code}` guest view.
 * - Anything else (home, settings, ...) has no guest counterpart: `null`,
 *   meaning the usual `/welcome`. */
export type LogoutReturn =
	| { kind: 'path'; path: string }
	| { kind: 'piece'; pieceId: string }
	| { kind: 'group'; groupId: string }
	| null;

export function classifyLogoutReturn(raw: unknown): LogoutReturn {
	const target = safeRedirectTarget(raw, '');
	if (!target) return null;
	const url = new URL(target, 'http://divisi.invalid');
	const segments = url.pathname.split('/').filter(Boolean);
	const [section, id] = segments;
	if (!id) return null;
	if (section === 'join') return { kind: 'path', path: `/join/${id}` };
	if (section === 'piece') {
		const code = url.searchParams.get('code');
		if (code) return { kind: 'path', path: `/piece/${id}?code=${encodeURIComponent(code)}` };
		return { kind: 'piece', pieceId: id };
	}
	if (section === 'groups') return { kind: 'group', groupId: id };
	return null;
}
