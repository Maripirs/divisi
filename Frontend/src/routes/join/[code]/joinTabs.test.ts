import { describe, expect, it } from 'vitest';
import { computeGuestTabs, type GuestTabData } from './joinTabs';

const allVisible: GuestTabData = {
	homeworkVisible: true,
	weeklyNotesVisible: true,
	responsibilitiesVisible: true,
	customPages: []
};

describe('computeGuestTabs', () => {
	it('leads with Tracks and lists every visible built-in in order', () => {
		const tabs = computeGuestTabs(allVisible);
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'homework', 'weeklyNotes', 'responsibilities']);
	});

	it('hides a built-in tab the group has not opted into guest visibility, but Tracks stays unconditional', () => {
		const tabs = computeGuestTabs({ ...allVisible, homeworkVisible: false, responsibilitiesVisible: false });
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'weeklyNotes']);
	});

	it('appends one entry per discoverable custom page after the built-ins', () => {
		const tabs = computeGuestTabs({
			...allVisible,
			customPages: [{ id: 'p1', title: 'Carpool', slug: 'carpool', templateKey: 'carpool_board' }]
		});
		expect(tabs.map((t) => t.key ?? t.slug)).toEqual(['tracks', 'homework', 'weeklyNotes', 'responsibilities', 'carpool']);
		expect(tabs.find((t) => t.slug === 'carpool')?.label).toBe('Carpool');
	});
});
