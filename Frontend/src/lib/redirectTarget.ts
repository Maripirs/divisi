/** Only ever send someone on to a same-site path. A `redirectTo` rides in
 * a URL query param, a hidden form field, or a short-lived cookie, so
 * without this check a crafted `?redirectTo=https://evil.example` link
 * could turn a normal login (or logout, or password reset) into an open
 * redirect. Rejects anything that isn't a plain absolute path: other
 * origins, protocol-relative `//host`, the `/\host` spelling browsers
 * also treat as protocol-relative, and control characters. Shared by every
 * route that honors `redirectTo`. */
export function safeRedirectTarget(value: unknown, fallback = '/home'): string {
	const target = typeof value === 'string' ? value : '';
	if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;
	return target;
}
