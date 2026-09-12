// F29: which carpool posts *this browser* created, for a guest.
//
// A guest's carpool identity is the `divisi_participant` cookie (Backend
// B25), not anything the frontend holds directly — the Backend never tells
// a read caller "this one is yours." Rather than plumb the resolved
// anonymous participant id all the way through `CarpoolBoard.svelte`'s
// props, this just remembers the id of every post this browser has
// successfully created, in `localStorage`, keyed by nothing but the post id
// (globally unique, so no per-group/page scoping is needed). `CarpoolBoard`
// checks it only for a guest; a real member's ownership check stays the
// existing `post.user_id === userId` compare.
//
// Same storage-guard convention as `$lib/localProfile.ts` (`typeof
// localStorage` rather than `$app/environment`'s `browser` flag), so this
// stays plain, unit-testable `.ts`.

const OWNED_POST_IDS_KEY = 'divisi:myCarpoolPostIds';

function hasStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function readOwnedIds(): Set<string> {
	if (!hasStorage()) return new Set();
	let raw: string | null;
	try {
		raw = localStorage.getItem(OWNED_POST_IDS_KEY);
	} catch {
		return new Set();
	}
	if (!raw) return new Set();
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(parsed.filter((id): id is string => typeof id === 'string'));
	} catch {
		return new Set();
	}
}

function writeOwnedIds(ids: Set<string>): void {
	if (!hasStorage()) return;
	localStorage.setItem(OWNED_POST_IDS_KEY, JSON.stringify([...ids]));
}

export function isOwnedCarpoolPost(postId: string): boolean {
	return readOwnedIds().has(postId);
}

/** Called right after a guest's own create succeeds, so the post's Edit/
 * Delete controls show up the moment it appears in the list (and again on
 * every later reload, since this persists). */
export function rememberCarpoolPost(postId: string): void {
	const ids = readOwnedIds();
	ids.add(postId);
	writeOwnedIds(ids);
}

/** Called after a guest deletes their own post, so a stale id doesn't sit in
 * storage forever. Not load-bearing (a deleted post never appears in a read
 * again either way) — just housekeeping. */
export function forgetCarpoolPost(postId: string): void {
	const ids = readOwnedIds();
	if (!ids.delete(postId)) return;
	writeOwnedIds(ids);
}
