/** Reads claims out of a Backend JWT **without verifying its signature**.
 * The Frontend doesn't hold the signing secret, and doesn't need to: a
 * forged or tampered token fails every real Backend call anyway. This is
 * only for the one case where all we want is the caller's own id (the
 * `sub` claim) and paying a `/auth/me` round-trip for it would be wasteful
 * (see `+layout.server.ts`'s cold-start path). Returns `null` for anything
 * that isn't a well-formed JWT. */
export function subjectFromToken(token: string | null): string | null {
	const claims = decodeClaims(token);
	return typeof claims?.sub === 'string' ? claims.sub : null;
}

function decodeClaims(token: string | null): Record<string, unknown> | null {
	if (!token) return null;
	const payload = token.split('.')[1];
	if (!payload) return null;
	try {
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const parsed: unknown = JSON.parse(json);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
