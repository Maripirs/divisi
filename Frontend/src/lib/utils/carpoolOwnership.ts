// F29: which carpool posts *this browser* created, for a guest.
// F33: same problem, for a guest's own seat claims (B27).
//
// A guest's carpool identity is the `divisi_participant` cookie (Backend
// B25), not anything the frontend holds directly — the Backend never tells
// a read caller "this one is yours." Rather than plumb the resolved
// anonymous participant id all the way through `CarpoolBoard.svelte`'s
// props, this just remembers the id of every post (and, since F33, every
// claim) this browser has successfully created, in `localStorage`, keyed by
// nothing but that row's own id (globally unique, so no per-group/page
// scoping is needed). `CarpoolBoard` checks it only for a guest; a real
// member's ownership check stays the existing `user_id === userId` compare.
//
// Same storage-guard convention as `$lib/localProfile.ts` (`typeof
// localStorage` rather than `$app/environment`'s `browser` flag), so this
// stays plain, unit-testable `.ts`.

const OWNED_POST_IDS_KEY = 'divisi:myCarpoolPostIds';
const OWNED_CLAIM_IDS_KEY = 'divisi:myCarpoolClaimIds';

function hasStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function readOwnedIds(key: string): Set<string> {
	if (!hasStorage()) return new Set();
	let raw: string | null;
	try {
		raw = localStorage.getItem(key);
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

function writeOwnedIds(key: string, ids: Set<string>): void {
	if (!hasStorage()) return;
	localStorage.setItem(key, JSON.stringify([...ids]));
}

export function isOwnedCarpoolPost(postId: string): boolean {
	return readOwnedIds(OWNED_POST_IDS_KEY).has(postId);
}

/** Called right after a guest's own create succeeds, so the post's Edit/
 * Delete controls show up the moment it appears in the list (and again on
 * every later reload, since this persists). */
export function rememberCarpoolPost(postId: string): void {
	const ids = readOwnedIds(OWNED_POST_IDS_KEY);
	ids.add(postId);
	writeOwnedIds(OWNED_POST_IDS_KEY, ids);
}

/** Called after a guest deletes their own post, so a stale id doesn't sit in
 * storage forever. Not load-bearing (a deleted post never appears in a read
 * again either way) — just housekeeping. */
export function forgetCarpoolPost(postId: string): void {
	const ids = readOwnedIds(OWNED_POST_IDS_KEY);
	if (!ids.delete(postId)) return;
	writeOwnedIds(OWNED_POST_IDS_KEY, ids);
}

/** F33: is this claim (on some driver's post) one *this browser* made?
 * Checked instead of a `user_id` compare for a guest, same reason
 * `isOwnedCarpoolPost` exists — a guest never learns its own anonymous
 * participant id. */
export function isOwnedCarpoolClaim(claimId: string): boolean {
	return readOwnedIds(OWNED_CLAIM_IDS_KEY).has(claimId);
}

/** Called right after a guest's own claim succeeds, so that post's button
 * flips from "Claim a seat" to "Release your seat" immediately, and again
 * on a later reload. */
export function rememberCarpoolClaim(claimId: string): void {
	const ids = readOwnedIds(OWNED_CLAIM_IDS_KEY);
	ids.add(claimId);
	writeOwnedIds(OWNED_CLAIM_IDS_KEY, ids);
}

/** Called after a guest releases their own claim; same housekeeping as
 * `forgetCarpoolPost`, not load-bearing. */
export function forgetCarpoolClaim(claimId: string): void {
	const ids = readOwnedIds(OWNED_CLAIM_IDS_KEY);
	if (!ids.delete(claimId)) return;
	writeOwnedIds(OWNED_CLAIM_IDS_KEY, ids);
}
