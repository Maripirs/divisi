import { PUBLIC_API_BASE_URL } from '$env/static/public';
import { backendJson, BackendApiError } from '$lib/server/backend';
import { normalizeJoinCode } from '$lib/joinCode';
import type { GroupOut } from '$lib/server/backendTypes';

/** The one place a signed-in account self-joins a group by its join code
 * (`POST /groups/join`), shared by every route that can land a non-member
 * on a group's content: `/join/[code]`, a piece link (with or without
 * `?code=`), and a bare `/groups/{id}` link. Resolves to the joined group,
 * or `null` when the Backend refused (the demo group, an unknown code, an
 * anonymous token, a cold Backend's synthetic 503), so each caller can fall
 * back to the guest view the code already grants. Anything that isn't a
 * Backend answer is rethrown. */
export async function selfJoinGroup(
	token: string | null,
	joinCode: string,
	fetchFn: typeof fetch
): Promise<GroupOut | null> {
	try {
		return await backendJson<GroupOut>(
			token,
			'/groups/join',
			{ method: 'POST', body: JSON.stringify({ join_code: normalizeJoinCode(joinCode) }) },
			fetchFn
		);
	} catch (err) {
		if (err instanceof BackendApiError) return null;
		throw err;
	}
}

/** A Backend status that means "ask again in a moment" rather than a real
 * answer (Render's free tier serves 5xx from its edge while waking). */
function isTransient(status: number): boolean {
	return status >= 500 || status === 429 || status === 408;
}

export interface PieceOwner {
	group_name: string;
	join_code: string;
	guest_password_required: boolean;
}

/** The public `GET /guest/pieces/{id}/owner` lookup: which group owns a
 * piece, and its join code. `transient` is true when the Backend gave no
 * real answer (network error or a 5xx), so a caller can show its "waking
 * up" state instead of a hard "not found". Never throws. */
export async function fetchPieceOwner(
	pieceId: string,
	fetchFn: typeof fetch,
	signal?: AbortSignal
): Promise<{ owner: PieceOwner | null; transient: boolean }> {
	try {
		const res = await fetchFn(`${PUBLIC_API_BASE_URL}/guest/pieces/${encodeURIComponent(pieceId)}/owner`, {
			signal
		});
		if (res.ok) return { owner: (await res.json()) as PieceOwner, transient: false };
		return { owner: null, transient: isTransient(res.status) };
	} catch {
		return { owner: null, transient: true };
	}
}

export interface GroupInfo {
	group_name: string;
	join_code: string;
	guest_password_required: boolean;
}

/** The public `GET /guest/groups/{id}/info` lookup (the group-id
 * counterpart to `fetchPieceOwner`). `null` on any error or non-OK
 * response; never throws. */
export async function fetchGroupInfo(groupId: string, fetchFn: typeof fetch): Promise<GroupInfo | null> {
	try {
		const res = await fetchFn(`${PUBLIC_API_BASE_URL}/guest/groups/${encodeURIComponent(groupId)}/info`);
		if (res.ok) return (await res.json()) as GroupInfo;
	} catch {
		// Fall through.
	}
	return null;
}
