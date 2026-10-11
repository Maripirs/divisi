import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirectTarget';

describe('safeRedirectTarget', () => {
	it('keeps a same-site path with its query', () => {
		expect(safeRedirectTarget('/join/9CJM7VRU')).toBe('/join/9CJM7VRU');
		expect(safeRedirectTarget('/piece/abc?code=9CJM7VRU')).toBe('/piece/abc?code=9CJM7VRU');
	});

	it('falls back for anything that could leave the site', () => {
		expect(safeRedirectTarget('https://evil.example/x')).toBe('/home');
		expect(safeRedirectTarget('//evil.example/x')).toBe('/home');
		expect(safeRedirectTarget('/\\evil.example/x')).toBe('/home');
		expect(safeRedirectTarget('javascript:alert(1)')).toBe('/home');
		expect(safeRedirectTarget('/ok\nSet-Cookie: x')).toBe('/home');
	});

	it('falls back for missing or non-string values, with a custom fallback', () => {
		expect(safeRedirectTarget(null)).toBe('/home');
		expect(safeRedirectTarget(undefined, '/welcome')).toBe('/welcome');
		expect(safeRedirectTarget('', '/welcome')).toBe('/welcome');
		expect(safeRedirectTarget(42)).toBe('/home');
	});
});
