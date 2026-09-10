import { writable } from 'svelte/store';

/** F23 "Local profile + Save across devices".
 *
 * Every visitor gets a local-only profile on their first visit, with no
 * prompt: a `localId` (uuid) that owns their per-device state, and a
 * `displayName` that stays empty until the first action other people see
 * (a responsibility signup). "Save across devices" (the Settings drawer)
 * is how that local profile becomes a real cross-device account via
 * Backend B19's `POST /auth/save` (name + numeric PIN).
 *
 * The reactive surface is a `svelte/store` (same choice as `theme.ts`), so
 * this file stays plain `.ts` and unit-testable without the Svelte
 * compiler. The pure helpers below (`parseStoredProfile`, `needsName`,
 * `shouldShowSignupBanner`, ...) carry the logic; the store is a thin
 * localStorage-backed wrapper over them.
 *
 * Storage is guarded on `typeof localStorage` rather than SvelteKit's
 * `$app/environment` `browser` flag so the vitest `node` env (which stubs
 * `globalThis.localStorage`) exercises the real read/write path. */

export const LOCAL_PROFILE_KEY = 'divisi:localProfile';

export interface LocalProfile {
	/** Opaque per-device id. Sent to the Backend on a shared action so it
	 * can mint (and later re-resolve) this client's anonymous participant
	 * row even if the `divisi_participant` cookie is lost. */
	localId: string;
	/** The name the choir sees. Empty until lazily prompted at the first
	 * shared action. */
	displayName: string;
	/** True once "Save across devices" has attached a real credential. From
	 * then on the device holds a normal logged-in session and the Save
	 * prompt is replaced by the ordinary account section. */
	saved: boolean;
	/** True once the visitor has completed at least one responsibility
	 * signup. Gates the one-time "you're only on this device" banner. */
	signedUp: boolean;
	/** True once that banner has been dismissed. It never reappears after
	 * this (or after `saved`). */
	bannerDismissed: boolean;
}

/** A v4-ish uuid. Prefers the platform `crypto.randomUUID` (present in
 * every secure context, which dev and prod both are); the manual fallback
 * only matters for an odd runtime that lacks it. */
export function newLocalId(): string {
	const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
	if (c && typeof c.randomUUID === 'function') return c.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
		const r = (Math.random() * 16) | 0;
		const v = ch === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/** A brand-new profile. `overrides` is only for tests / restoring a
 * partially-valid stored blob. */
export function makeLocalProfile(overrides: Partial<LocalProfile> = {}): LocalProfile {
	return {
		localId: newLocalId(),
		displayName: '',
		saved: false,
		signedUp: false,
		bannerDismissed: false,
		...overrides
	};
}

/** Parse a stored JSON blob back into a `LocalProfile`, tolerating a
 * missing/short/malformed value (returns `null`) and a blob written by an
 * older shape (fills in the new flags). A blob with no usable `localId`
 * is treated as absent. */
export function parseStoredProfile(raw: string | null): LocalProfile | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const obj = parsed as Record<string, unknown>;
	if (typeof obj.localId !== 'string' || obj.localId.length === 0) return null;
	return {
		localId: obj.localId,
		displayName: typeof obj.displayName === 'string' ? obj.displayName : '',
		saved: obj.saved === true,
		signedUp: obj.signedUp === true,
		bannerDismissed: obj.bannerDismissed === true
	};
}

export function serializeProfile(profile: LocalProfile): string {
	return JSON.stringify(profile);
}

function hasStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

/** Read the stored profile, creating and persisting a fresh one the first
 * time (so it is durable from the first visit with no prompt). On a
 * server render (no `localStorage`) this returns a throwaway profile that
 * is never persisted; the client re-reads the real one on hydration. */
export function readLocalProfile(): LocalProfile {
	if (!hasStorage()) return makeLocalProfile();
	const existing = parseStoredProfile(localStorage.getItem(LOCAL_PROFILE_KEY));
	if (existing) return existing;
	const fresh = makeLocalProfile();
	localStorage.setItem(LOCAL_PROFILE_KEY, serializeProfile(fresh));
	return fresh;
}

export function writeLocalProfile(profile: LocalProfile): void {
	if (!hasStorage()) return;
	localStorage.setItem(LOCAL_PROFILE_KEY, serializeProfile(profile));
}

/** Does a shared action need to prompt for a display name first? Only when
 * there is no name yet and the caller isn't already an authenticated
 * member (a member's account name is used instead). */
export function needsName(
	profile: Pick<LocalProfile, 'displayName'>,
	opts: { loggedIn?: boolean } = {}
): boolean {
	if (opts.loggedIn) return false;
	return profile.displayName.trim().length === 0;
}

/** The one-time post-signup "you're only on this device" banner shows once
 * the visitor has signed up, until they dismiss it or Save. */
export function shouldShowSignupBanner(
	profile: Pick<LocalProfile, 'saved' | 'signedUp' | 'bannerDismissed'>
): boolean {
	return profile.signedUp && !profile.bannerDismissed && !profile.saved;
}

// --- reactive store -------------------------------------------------------

/** The live local profile. Components read `$localProfile`; every mutator
 * below updates the store and persists in one step. */
export const localProfile = writable<LocalProfile>(readLocalProfile());

function update(mut: (profile: LocalProfile) => LocalProfile): void {
	localProfile.update((current) => {
		const next = mut(current);
		writeLocalProfile(next);
		return next;
	});
}

/** Ensure a profile exists and return its `localId`. Safe to call from an
 * event handler right before a shared action. */
export function ensureLocalId(): string {
	const profile = readLocalProfile();
	localProfile.set(profile);
	return profile.localId;
}

export function setDisplayName(name: string): void {
	update((profile) => ({ ...profile, displayName: name.trim() }));
}

export function markProfileSaved(): void {
	update((profile) => ({ ...profile, saved: true }));
}

export function markSignedUp(): void {
	update((profile) => ({ ...profile, signedUp: true }));
}

export function dismissSignupBanner(): void {
	update((profile) => ({ ...profile, bannerDismissed: true }));
}

/** Test seam: drop the stored profile and reset the store to a fresh one. */
export function resetLocalProfile(): void {
	if (hasStorage()) localStorage.removeItem(LOCAL_PROFILE_KEY);
	localProfile.set(readLocalProfile());
}
