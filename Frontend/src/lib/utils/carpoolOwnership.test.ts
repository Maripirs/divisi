import { beforeEach, describe, expect, it } from 'vitest';
import {
	forgetCarpoolClaim,
	forgetCarpoolInterest,
	forgetCarpoolPost,
	isOwnedCarpoolClaim,
	isOwnedCarpoolInterest,
	isOwnedCarpoolPost,
	rememberCarpoolClaim,
	rememberCarpoolInterest,
	rememberCarpoolPost
} from './carpoolOwnership';

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

// F33: the parallel claim-ownership tracking, same shape, separate storage
// key so a post id and a claim id never collide.
describe('isOwnedCarpoolClaim', () => {
	it('is false for an id nothing has remembered', () => {
		expect(isOwnedCarpoolClaim('c1')).toBe(false);
	});

	it('is true once remembered, and survives a fresh read (page reload)', () => {
		rememberCarpoolClaim('c1');
		expect(isOwnedCarpoolClaim('c1')).toBe(true);
	});

	it('forgetCarpoolClaim drops just that one id', () => {
		rememberCarpoolClaim('c1');
		rememberCarpoolClaim('c2');
		forgetCarpoolClaim('c1');
		expect(isOwnedCarpoolClaim('c1')).toBe(false);
		expect(isOwnedCarpoolClaim('c2')).toBe(true);
	});

	it('does not confuse a claim id with a post id remembered under the other key', () => {
		rememberCarpoolPost('shared-id');
		expect(isOwnedCarpoolClaim('shared-id')).toBe(false);
	});
});

// B30: the parallel interest-ownership tracking, same shape, separate
// storage key so a claim id and an interest id never collide.
describe('isOwnedCarpoolInterest', () => {
	it('is false for an id nothing has remembered', () => {
		expect(isOwnedCarpoolInterest('i1')).toBe(false);
	});

	it('is true once remembered, and survives a fresh read (page reload)', () => {
		rememberCarpoolInterest('i1');
		expect(isOwnedCarpoolInterest('i1')).toBe(true);
	});

	it('forgetCarpoolInterest drops just that one id', () => {
		rememberCarpoolInterest('i1');
		rememberCarpoolInterest('i2');
		forgetCarpoolInterest('i1');
		expect(isOwnedCarpoolInterest('i1')).toBe(false);
		expect(isOwnedCarpoolInterest('i2')).toBe(true);
	});

	it('does not confuse an interest id with a claim id remembered under the other key', () => {
		rememberCarpoolClaim('shared-id');
		expect(isOwnedCarpoolInterest('shared-id')).toBe(false);
	});
});
