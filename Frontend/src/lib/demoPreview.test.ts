import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	clearDemoPreviewGuest,
	demoPreviewGuest,
	setDemoPreviewGuest,
	shouldShowAdminPreview
} from './demoPreview';

beforeEach(() => {
	clearDemoPreviewGuest();
});

describe('shouldShowAdminPreview', () => {
	it('is false when no guest group is being viewed', () => {
		expect(shouldShowAdminPreview(null)).toBe(false);
	});

	it('is false when the current guest group does not offer preview', () => {
		expect(shouldShowAdminPreview({ joinCode: 'ABCD1234', adminPreviewAvailable: false })).toBe(false);
	});

	it('is true when the current guest group offers preview and has a join code', () => {
		expect(shouldShowAdminPreview({ joinCode: 'ABCD1234', adminPreviewAvailable: true })).toBe(true);
	});

	it('is false for a blank join code even if flagged available (defensive)', () => {
		expect(shouldShowAdminPreview({ joinCode: '   ', adminPreviewAvailable: true })).toBe(false);
	});
});

describe('demoPreviewGuest store', () => {
	it('starts unset', () => {
		expect(get(demoPreviewGuest)).toBeNull();
	});

	it('setDemoPreviewGuest sets the store, clearDemoPreviewGuest resets it', () => {
		setDemoPreviewGuest({ joinCode: 'DEMOSATB', adminPreviewAvailable: true });
		expect(get(demoPreviewGuest)).toEqual({ joinCode: 'DEMOSATB', adminPreviewAvailable: true });
		clearDemoPreviewGuest();
		expect(get(demoPreviewGuest)).toBeNull();
	});
});
