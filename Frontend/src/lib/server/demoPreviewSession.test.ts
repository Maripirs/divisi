import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import {
	DEMO_PREVIEW_COOKIE,
	clearDemoPreviewCookie,
	normalizeJoinCodeForPreview,
	readDemoPreviewCookie,
	setDemoPreviewCookie
} from './demoPreviewSession';

describe('normalizeJoinCodeForPreview', () => {
	it('uppercases and trims', () => {
		expect(normalizeJoinCodeForPreview(' demosatb ')).toBe('DEMOSATB');
	});
	it('is a no-op for an already-normalized code', () => {
		expect(normalizeJoinCodeForPreview('DEMOSATB')).toBe('DEMOSATB');
	});
});

/** A minimal `Cookies` stand-in so the set/read/clear helpers are
 * exercised directly, mirroring how `SvelteKit`'s real `cookies` object
 * behaves for get/set/delete. */
function makeCookieJar(): Cookies {
	const store = new Map<string, string>();
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => void store.set(name, value),
		delete: (name: string) => void store.delete(name)
	} as unknown as Cookies;
}

describe('demo preview cookie helpers', () => {
	it('set then read round-trips the join code', () => {
		const cookies = makeCookieJar();
		setDemoPreviewCookie(cookies, 'DEMOSATB');
		expect(readDemoPreviewCookie(cookies)).toBe('DEMOSATB');
	});

	it('read returns null when unset', () => {
		const cookies = makeCookieJar();
		expect(readDemoPreviewCookie(cookies)).toBeNull();
	});

	it('clear removes the cookie', () => {
		const cookies = makeCookieJar();
		setDemoPreviewCookie(cookies, 'DEMOSATB');
		clearDemoPreviewCookie(cookies);
		expect(readDemoPreviewCookie(cookies)).toBeNull();
	});

	it('uses the expected cookie name', () => {
		expect(DEMO_PREVIEW_COOKIE).toBe('divisi_demo_preview');
	});
});
