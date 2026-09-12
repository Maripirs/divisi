import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	LOCAL_PROFILE_KEY,
	dismissSignupBanner,
	ensureLocalId,
	localProfile,
	makeLocalProfile,
	markSignedUp,
	needsName,
	newLocalId,
	parseStoredProfile,
	readLocalProfile,
	resetLocalProfile,
	serializeProfile,
	setDisplayName,
	shouldShowSignupBanner
} from './localProfile';

// Map-backed Web Storage shim — same approach as player/persistence.test.ts.
// vitest's node env has no real `localStorage`, and this module only ever
// touches getItem/setItem/removeItem.
beforeEach(() => {
	const store = new Map<string, string>();
	globalThis.localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
		key: (i: number) => [...store.keys()][i] ?? null,
		get length() {
			return store.size;
		}
	} as Storage;
	resetLocalProfile();
});

describe('newLocalId', () => {
	it('returns a uuid-shaped string', () => {
		expect(newLocalId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});
	it('is unique across calls', () => {
		expect(newLocalId()).not.toBe(newLocalId());
	});
});

describe('parseStoredProfile', () => {
	it('returns null for a missing value', () => {
		expect(parseStoredProfile(null)).toBeNull();
	});
	it('returns null for malformed JSON rather than throwing', () => {
		expect(parseStoredProfile('{not json')).toBeNull();
	});
	it('returns null when there is no usable localId', () => {
		expect(parseStoredProfile(JSON.stringify({ displayName: 'Sam' }))).toBeNull();
		expect(parseStoredProfile(JSON.stringify({ localId: '' }))).toBeNull();
	});
	it('round-trips a full profile', () => {
		const profile = makeLocalProfile({
			localId: 'abc',
			displayName: 'Sam',
			signedUp: true,
			bannerDismissed: true
		});
		expect(parseStoredProfile(serializeProfile(profile))).toEqual(profile);
	});
	it('fills in missing flags from an older blob shape', () => {
		const parsed = parseStoredProfile(JSON.stringify({ localId: 'abc' }));
		expect(parsed).toEqual({
			localId: 'abc',
			displayName: '',
			signedUp: false,
			bannerDismissed: false
		});
	});
	it('drops a stale pre-B21 `saved` field rather than surfacing it', () => {
		const parsed = parseStoredProfile(JSON.stringify({ localId: 'abc', saved: true }));
		expect(parsed).toEqual({
			localId: 'abc',
			displayName: '',
			signedUp: false,
			bannerDismissed: false
		});
	});
});

describe('needsName', () => {
	it('is true when there is no display name and the visitor is anonymous', () => {
		expect(needsName({ displayName: '' })).toBe(true);
		expect(needsName({ displayName: '   ' })).toBe(true);
	});
	it('is false once a display name is set', () => {
		expect(needsName({ displayName: 'Sam' })).toBe(false);
	});
	it('is false for a logged-in member regardless of local display name', () => {
		expect(needsName({ displayName: '' }, { loggedIn: true })).toBe(false);
	});
});

describe('shouldShowSignupBanner', () => {
	it('is false before the first signup', () => {
		expect(shouldShowSignupBanner({ signedUp: false, bannerDismissed: false })).toBe(false);
	});
	it('is true after a signup, until dismissed', () => {
		expect(shouldShowSignupBanner({ signedUp: true, bannerDismissed: false })).toBe(true);
	});
	it('is false once dismissed', () => {
		expect(shouldShowSignupBanner({ signedUp: true, bannerDismissed: true })).toBe(false);
	});
});

describe('readLocalProfile', () => {
	it('creates and persists a profile on first read', () => {
		localStorage.removeItem(LOCAL_PROFILE_KEY);
		const first = readLocalProfile();
		expect(first.localId).not.toBe('');
		expect(localStorage.getItem(LOCAL_PROFILE_KEY)).not.toBeNull();
	});
	it('returns the same localId on a later read (survives a reload)', () => {
		const first = readLocalProfile();
		const second = readLocalProfile();
		expect(second.localId).toBe(first.localId);
		expect(second.displayName).toBe('');
	});
});

describe('local profile lifecycle (store + mutators)', () => {
	it('setDisplayName trims, persists, and clears needsName for later actions', () => {
		setDisplayName('  Sam  ');
		expect(get(localProfile).displayName).toBe('Sam');
		expect(needsName(get(localProfile))).toBe(false);
		// Re-reading from storage sees the same name (reused silently after).
		expect(readLocalProfile().displayName).toBe('Sam');
	});

	it('markSignedUp then the banner shows once, then stays gone after dismiss', () => {
		expect(shouldShowSignupBanner(get(localProfile))).toBe(false);
		markSignedUp();
		expect(shouldShowSignupBanner(get(localProfile))).toBe(true);
		dismissSignupBanner();
		expect(shouldShowSignupBanner(get(localProfile))).toBe(false);
		// Persisted: a fresh read still has the flags.
		const reread = readLocalProfile();
		expect(reread.signedUp).toBe(true);
		expect(reread.bannerDismissed).toBe(true);
	});

	it('ensureLocalId returns a stable id and syncs the store', () => {
		const id = ensureLocalId();
		expect(id).toBe(get(localProfile).localId);
		expect(ensureLocalId()).toBe(id);
	});

	it('resetLocalProfile drops the stored profile and issues a new id', () => {
		const before = get(localProfile).localId;
		resetLocalProfile();
		expect(get(localProfile).localId).not.toBe(before);
	});
});
