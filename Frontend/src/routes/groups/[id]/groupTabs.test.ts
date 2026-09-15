import { describe, expect, it } from 'vitest';
import { computeGroupTabs, type GroupTabData } from './groupTabs';

const allEnabled: GroupTabData = {
	homeworkEnabled: true,
	weeklyNotesEnabled: true,
	membersEnabled: true,
	responsibilitiesEnabled: true,
	carpoolEnabled: true,
	pageSettings: []
};

describe('computeGroupTabs', () => {
	it('lists every built-in tab, in order, with Info last, when every page is enabled', () => {
		const tabs = computeGroupTabs(allEnabled, 'member');
		expect(tabs.map((t) => t.key)).toEqual([
			'primary',
			'tracks',
			'weeklyNotes',
			'members',
			'responsibilities',
			'carpool',
			'about'
		]);
	});

	it('hides a built-in tab a member has no access to, but tracks/about stay unconditional', () => {
		const tabs = computeGroupTabs({ ...allEnabled, homeworkEnabled: false, membersEnabled: false }, 'member');
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'weeklyNotes', 'responsibilities', 'carpool', 'about']);
	});

	it('hides carpool from a member when it is disabled, but tracks/about stay unconditional', () => {
		const tabs = computeGroupTabs({ ...allEnabled, carpoolEnabled: false }, 'member');
		expect(tabs.map((t) => t.key)).toEqual(['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about']);
	});

	it('admin mode shows every built-in tab regardless of the member flags', () => {
		const tabs = computeGroupTabs(
			{
				homeworkEnabled: false,
				weeklyNotesEnabled: false,
				membersEnabled: false,
				responsibilitiesEnabled: false,
				carpoolEnabled: false,
				pageSettings: []
			},
			'admin'
		);
		expect(tabs.map((t) => t.key)).toEqual([
			'primary',
			'tracks',
			'weeklyNotes',
			'members',
			'responsibilities',
			'carpool',
			'about'
		]);
	});

	it("member-mode preview reflects pageSettings' real enabled value, not the admin-bypassed *Enabled flags", () => {
		// B12 fix: an admin's own `homeworkEnabled` etc. are always `true`
		// (the Backend lets an admin's request through regardless), so the
		// "view as member" preview must consult the real `page-settings` row
		// instead when one is present.
		const tabs = computeGroupTabs(
			{
				...allEnabled,
				pageSettings: [{ page: 'homework', enabled: false, audience: 'members', min_identity: 'anyone' }]
			},
			'member'
		);
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'weeklyNotes', 'members', 'responsibilities', 'carpool', 'about']);
	});

	it("member-mode preview reflects carpool's real pageSettings enabled value too", () => {
		const tabs = computeGroupTabs(
			{
				...allEnabled,
				pageSettings: [{ page: 'carpool', enabled: false, audience: 'members', min_identity: 'anyone' }]
			},
			'member'
		);
		expect(tabs.map((t) => t.key)).toEqual(['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about']);
	});
});
