// F34: which responsibility signups *this browser* created, for a guest.
//
// Same problem F29's `carpoolOwnership.ts` solved for guest carpool posts,
// and the identical shape of fix: a guest's identity is the
// `divisi_participant` cookie (or `local_id`), never anything the Backend
// hands back on a read. `ResponsibilityGuestSignupOut` doesn't even carry a
// `user_id` field to compare against (name only, deliberately), so this is
// the same "remember the ids I created, in localStorage" trick, just for a
// different id namespace. Kept as its own small module rather than
// generalizing `carpoolOwnership.ts` into a shared one: that file may be
// under concurrent edit for F33 at the same time this was built, and the two
// modules are a few lines each, so duplicating is cheaper than coordinating
// a shared abstraction mid-flight.
//
// Same storage-guard convention as `$lib/localProfile.ts` (`typeof
// localStorage` rather than `$app/environment`'s `browser` flag), so this
// stays plain, unit-testable `.ts`.

const OWNED_SIGNUP_IDS_KEY = 'divisi:myResponsibilitySignupIds';

function hasStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function readOwnedIds(): Set<string> {
	if (!hasStorage()) return new Set();
	let raw: string | null;
	try {
		raw = localStorage.getItem(OWNED_SIGNUP_IDS_KEY);
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
	localStorage.setItem(OWNED_SIGNUP_IDS_KEY, JSON.stringify([...ids]));
}

export function isOwnedResponsibilitySignup(signupId: string): boolean {
	return readOwnedIds().has(signupId);
}

/** Called right after a guest's own signup succeeds, so the "Remove me"
 * control shows up the moment the row appears in the list (and again on
 * every later reload, since this persists). */
export function rememberResponsibilitySignup(signupId: string): void {
	const ids = readOwnedIds();
	ids.add(signupId);
	writeOwnedIds(ids);
}

/** Called after a guest removes their own signup, so a stale id doesn't sit
 * in storage forever. Not load-bearing (a removed signup never appears in a
 * read again either way), just housekeeping. */
export function forgetResponsibilitySignup(signupId: string): void {
	const ids = readOwnedIds();
	if (!ids.delete(signupId)) return;
	writeOwnedIds(ids);
}
