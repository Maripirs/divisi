import { describe, expect, it } from 'vitest';
import { mergeCandidates, normalizeMemberName, possibleDuplicates } from './memberMerge';

const guest = { user_id: 'g1', name: '  nisha anand ', is_anonymous: true };
const members = [
	{ user_id: 'a', name: 'Zoe Admin', is_anonymous: false },
	guest,
	{ user_id: 'n', name: 'Nisha Anand', is_anonymous: false },
	{ user_id: 'b', name: 'Ben', is_anonymous: false },
	{ user_id: 'g2', name: 'Nisha Anand', is_anonymous: true }
];

describe('normalizeMemberName', () => {
	it('trims and lowercases', () => {
		expect(normalizeMemberName('  Nisha ANAND ')).toBe('nisha anand');
	});
});

describe('mergeCandidates', () => {
	it('lists only real members other than the guest, same-name first then alphabetical', () => {
		const result = mergeCandidates(guest, members);
		expect(result.map((c) => [c.member.user_id, c.suggested])).toEqual([
			['n', true],
			['b', false],
			['a', false]
		]);
	});

	it('suggests nothing for a blank name', () => {
		const blank = { user_id: 'x', name: '   ', is_anonymous: true };
		expect(mergeCandidates(blank, members).some((c) => c.suggested)).toBe(false);
	});
});

describe('possibleDuplicates', () => {
	it('returns same-name real members for an unverified participant', () => {
		expect(possibleDuplicates(guest, members).map((mem) => mem.user_id)).toEqual(['n']);
	});

	it('returns nothing for a real member', () => {
		expect(possibleDuplicates(members[2], members)).toEqual([]);
	});

	it('returns nothing when no real member shares the name', () => {
		const lone = { user_id: 'g3', name: 'Someone Else', is_anonymous: true };
		expect(possibleDuplicates(lone, members)).toEqual([]);
	});
});
