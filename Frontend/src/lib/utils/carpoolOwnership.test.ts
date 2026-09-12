import { beforeEach, describe, expect, it } from 'vitest';
import { forgetCarpoolPost, isOwnedCarpoolPost, rememberCarpoolPost } from './carpoolOwnership';

// Same Map-backed Web Storage shim as `localProfile.test.ts`.
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
});

describe('isOwnedCarpoolPost', () => {
	it('is false for an id nothing has remembered', () => {
		expect(isOwnedCarpoolPost('p1')).toBe(false);
	});

	it('is true once remembered, and survives a fresh read (page reload)', () => {
		rememberCarpoolPost('p1');
		expect(isOwnedCarpoolPost('p1')).toBe(true);
	});

	it('tracks multiple ids independently', () => {
		rememberCarpoolPost('p1');
		rememberCarpoolPost('p2');
		expect(isOwnedCarpoolPost('p1')).toBe(true);
		expect(isOwnedCarpoolPost('p2')).toBe(true);
		expect(isOwnedCarpoolPost('p3')).toBe(false);
	});

	it('forgetCarpoolPost drops just that one id', () => {
		rememberCarpoolPost('p1');
		rememberCarpoolPost('p2');
		forgetCarpoolPost('p1');
		expect(isOwnedCarpoolPost('p1')).toBe(false);
		expect(isOwnedCarpoolPost('p2')).toBe(true);
	});

	it('tolerates a malformed stored blob rather than throwing', () => {
		localStorage.setItem('divisi:myCarpoolPostIds', '{not json');
		expect(isOwnedCarpoolPost('p1')).toBe(false);
	});

	it('tolerates a stored value that is not an array', () => {
		localStorage.setItem('divisi:myCarpoolPostIds', JSON.stringify({ foo: 'bar' }));
		expect(isOwnedCarpoolPost('p1')).toBe(false);
	});
});
