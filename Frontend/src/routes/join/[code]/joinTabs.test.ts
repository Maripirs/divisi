import { describe, expect, it } from 'vitest';
import { computeGuestTabs, type GuestTabData } from './joinTabs';

const allVisible: GuestTabData = {
	homeworkVisible: true,
	weeklyNotesVisible: true,
	responsibilitiesVisible: true,
	carpoolVisible: true
};

describe('computeGuestTabs', () => {
	it('leads with Tracks and lists every visible built-in in order', () => {
		const tabs = computeGuestTabs(allVisible);
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'homework', 'weeklyNotes', 'responsibilities', 'carpool']);
	});

	it('hides a built-in tab the group has not opted into guest visibility, but Tracks stays unconditional', () => {
		const tabs = computeGuestTabs({ ...allVisible, homeworkVisible: false, responsibilitiesVisible: false });
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'weeklyNotes', 'carpool']);
	});

	it('hides carpool when the group has not opted it into guest visibility', () => {
		const tabs = computeGuestTabs({ ...allVisible, carpoolVisible: false });
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'homework', 'weeklyNotes', 'responsibilities']);
	});
});
