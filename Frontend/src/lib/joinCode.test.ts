import { describe, expect, it } from 'vitest';
import { normalizeJoinCode } from './joinCode';

describe('normalizeJoinCode', () => {
	it('uppercases and strips dashes and whitespace', () => {
		expect(normalizeJoinCode('9cjm-7vru')).toBe('9CJM7VRU');
		expect(normalizeJoinCode('9CJM 7VRU')).toBe('9CJM7VRU');
		expect(normalizeJoinCode('  9cjm 7vru\n')).toBe('9CJM7VRU');
		expect(normalizeJoinCode('9cj-m7 v-ru')).toBe('9CJM7VRU');
	});

	it('treats typographic dashes from a pasted message like a hyphen', () => {
		expect(normalizeJoinCode('9CJM\u20137VRU')).toBe('9CJM7VRU');
	});

	it('leaves an already-canonical code alone', () => {
		expect(normalizeJoinCode('DEMOSATB')).toBe('DEMOSATB');
		expect(normalizeJoinCode('')).toBe('');
	});
});
