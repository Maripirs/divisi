import { describe, expect, it } from 'vitest';
import { authHref, withReturnTo } from './authLinks';

describe('authHref', () => {
	it('carries the current path and search back through redirectTo', () => {
		expect(authHref('register', '/join/9CJM7VRU')).toBe('/login?mode=register&redirectTo=%2Fjoin%2F9CJM7VRU');
		const href = authHref('login', '/piece/abc?code=9CJM7VRU');
		expect(new URLSearchParams(href.split('?')[1]).get('redirectTo')).toBe('/piece/abc?code=9CJM7VRU');
		expect(new URLSearchParams(href.split('?')[1]).get('mode')).toBeNull();
	});

	it('strips the locale prefix (the login action re-adds it via lh)', () => {
		const href = authHref('register', '/es/join/9CJM7VRU');
		expect(new URLSearchParams(href.split('?')[1]).get('redirectTo')).toBe('/join/9CJM7VRU');
	});

	it('omits redirectTo when there is nowhere sensible to return to', () => {
		expect(authHref('register', null)).toBe('/login?mode=register');
		expect(authHref('login', null)).toBe('/login');
		expect(authHref('login', 'https://evil.example/x')).toBe('/login');
		expect(authHref('login', '//evil.example/x')).toBe('/login');
		expect(authHref('register', '/login?mode=register')).toBe('/login?mode=register');
	});
});

describe('withReturnTo', () => {
	it('carries a same-site return path along', () => {
		expect(withReturnTo('/forgot-password', '/join/9CJM7VRU')).toBe('/forgot-password?redirectTo=%2Fjoin%2F9CJM7VRU');
		expect(withReturnTo('/login?reset=1', '/piece/p?code=X')).toBe('/login?reset=1&redirectTo=%2Fpiece%2Fp%3Fcode%3DX');
	});

	it('drops a missing or unsafe return path', () => {
		expect(withReturnTo('/forgot-password', null)).toBe('/forgot-password');
		expect(withReturnTo('/forgot-password', '')).toBe('/forgot-password');
		expect(withReturnTo('/forgot-password', 'https://evil.example')).toBe('/forgot-password');
	});
});
