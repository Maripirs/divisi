/** Admin merge of an unverified (anonymous) participant into a real member
 * on the Members tab. Pure helpers so the "who is this probably a
 * duplicate of" matching is testable without the component.
 *
 * Matching mirrors the Backend's own B21 guest-name match
 * (`find_guest_matches`): case-insensitive, trimmed, exact otherwise. */

export interface MergeableMember {
	user_id: string;
	name: string;
	is_anonymous: boolean;
}

export interface MergeCandidate<T extends MergeableMember> {
	member: T;
	/** Same name as the unverified participant, so very likely the same person. */
	suggested: boolean;
}

export function normalizeMemberName(name: string): string {
	return name.trim().toLowerCase();
}

/** Every real (non-anonymous) member `guest` could be merged into, same-name
 * matches first and flagged `suggested`, then everyone else alphabetically. */
export function mergeCandidates<T extends MergeableMember>(guest: MergeableMember, members: T[]): MergeCandidate<T>[] {
	const key = normalizeMemberName(guest.name);
	return members
		.filter((mem) => !mem.is_anonymous && mem.user_id !== guest.user_id)
		.map((member) => ({ member, suggested: key !== '' && normalizeMemberName(member.name) === key }))
		.sort((a, b) => {
			if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
			return a.member.name.localeCompare(b.member.name);
		});
}

/** The real members an unverified participant shares a name with, for the
 * "Possible duplicate of ..." hint on its roster row. */
export function possibleDuplicates<T extends MergeableMember>(guest: MergeableMember, members: T[]): T[] {
	if (!guest.is_anonymous) return [];
	return mergeCandidates(guest, members)
		.filter((c) => c.suggested)
		.map((c) => c.member);
}
