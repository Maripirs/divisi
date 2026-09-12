import { beforeEach, describe, expect, it } from 'vitest';
import {
	forgetResponsibilitySignup,
	isOwnedResponsibilitySignup,
	rememberResponsibilitySignup
} from './responsibilitySignupOwnership';

// Same Map-backed Web Storage shim as `carpoolOwnership.test.ts` /
// `localProfile.test.ts`.
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

describe('isOwnedResponsibilitySignup', () => {
	it('is false for an id nothing has remembered', () => {
		expect(isOwnedResponsibilitySignup('s1')).toBe(false);
	});

	it('is true once remembered, and survives a fresh read (page reload)', () => {
		rememberResponsibilitySignup('s1');
		expect(isOwnedResponsibilitySignup('s1')).toBe(true);
	});

	it('tracks multiple ids independently', () => {
		rememberResponsibilitySignup('s1');
		rememberResponsibilitySignup('s2');
		expect(isOwnedResponsibilitySignup('s1')).toBe(true);
		expect(isOwnedResponsibilitySignup('s2')).toBe(true);
		expect(isOwnedResponsibilitySignup('s3')).toBe(false);
	});

	it('forgetResponsibilitySignup drops just that one id', () => {
		rememberResponsibilitySignup('s1');
		rememberResponsibilitySignup('s2');
		forgetResponsibilitySignup('s1');
		expect(isOwnedResponsibilitySignup('s1')).toBe(false);
		expect(isOwnedResponsibilitySignup('s2')).toBe(true);
	});

	it('tolerates a malformed stored blob rather than throwing', () => {
		localStorage.setItem('divisi:myResponsibilitySignupIds', '{not json');
		expect(isOwnedResponsibilitySignup('s1')).toBe(false);
	});

	it('tolerates a stored value that is not an array', () => {
		localStorage.setItem('divisi:myResponsibilitySignupIds', JSON.stringify({ foo: 'bar' }));
		expect(isOwnedResponsibilitySignup('s1')).toBe(false);
	});
});
