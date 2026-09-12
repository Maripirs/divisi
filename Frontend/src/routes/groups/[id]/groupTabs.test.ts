import { describe, expect, it } from 'vitest';
import { computeGroupTabs, type GroupTabData } from './groupTabs';
import type { GroupCustomPageOut } from '$lib/server/backendTypes';

function page(overrides: Partial<GroupCustomPageOut> = {}): GroupCustomPageOut {
	return {
		id: 'p1',
		group_id: 'g1',
		title: 'Carpool',
		slug: 'carpool',
		template_key: 'carpool_board',
		status: 'published',
		audience: 'members',
		min_identity: 'anyone',
		created_by: null,
		created_at: '',
		updated_at: '',
		...overrides
	};
}

const allEnabled: GroupTabData = {
	homeworkEnabled: true,
	weeklyNotesEnabled: true,
	membersEnabled: true,
	responsibilitiesEnabled: true,
	customPages: []
};

describe('computeGroupTabs', () => {
	it('lists every built-in tab, in order, with Info last, when every page is enabled', () => {
		const tabs = computeGroupTabs(allEnabled, 'member');
		expect(tabs.map((t) => t.key)).toEqual(['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about']);
	});

	it('hides a built-in tab a member has no access to, but tracks/about stay unconditional', () => {
		const tabs = computeGroupTabs({ ...allEnabled, homeworkEnabled: false, membersEnabled: false }, 'member');
		expect(tabs.map((t) => t.key)).toEqual(['tracks', 'weeklyNotes', 'responsibilities', 'about']);
	});

	it('admin mode shows every built-in tab regardless of the member flags', () => {
		const tabs = computeGroupTabs(
			{ homeworkEnabled: false, weeklyNotesEnabled: false, membersEnabled: false, responsibilitiesEnabled: false, customPages: [] },
			'admin'
		);
		expect(tabs.map((t) => t.key)).toEqual(['primary', 'tracks', 'weeklyNotes', 'members', 'responsibilities', 'about']);
	});

	it('places one entry per published custom page between Responsibilities and Info for a member', () => {
		const tabs = computeGroupTabs(
			{ ...allEnabled, customPages: [page({ slug: 'carpool', title: 'Carpool', status: 'published' })] },
			'member'
		);
		expect(tabs.map((t) => t.key ?? t.slug)).toEqual([
			'primary',
			'tracks',
			'weeklyNotes',
			'members',
			'responsibilities',
			'carpool',
			'about'
		]);
		expect(tabs.find((t) => t.slug === 'carpool')?.label).toBe('Carpool');
	});

	it('hides a draft or archived custom page from a member, but admin mode shows every status', () => {
		const customPages = [
			page({ slug: 'draft-page', status: 'draft' }),
			page({ slug: 'archived-page', status: 'archived' }),
			page({ slug: 'live-page', status: 'published' })
		];
		const memberTabs = computeGroupTabs({ ...allEnabled, customPages }, 'member');
		expect(memberTabs.map((t) => t.slug).filter(Boolean)).toEqual(['live-page']);

		const adminTabs = computeGroupTabs({ ...allEnabled, customPages }, 'admin');
		expect(adminTabs.map((t) => t.slug).filter(Boolean)).toEqual(['draft-page', 'archived-page', 'live-page']);
	});
});
