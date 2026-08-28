/** Raw (snake_case) shapes returned by the Backend's authenticated JSON API
 * — mirrors `Backend/app/api/schemas.py`. Each route maps these to whatever
 * view shape its template wants, same convention `$lib/api/guest.ts` uses
 * for the unauthenticated guest routes. */

export type GroupRole = 'admin' | 'member';
export type VersionStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type VersionSource = 'original' | 'modification';
export type OwnerType = 'user' | 'group';

export interface GroupOut {
	id: string;
	name: string;
	join_code: string;
	role: GroupRole;
	has_guest_password: boolean;
	guest_homework_visible: boolean;
}

export interface GroupMemberOut {
	user_id: string;
	email: string;
	name: string;
	role: GroupRole;
}

export interface HomeworkOut {
	id: string;
	group_id: string;
	piece_id: string | null;
	title: string;
	range: string;
	instructions: string;
	due_date: string | null;
	created_by: string;
	created_at: string;
}

export interface LibraryEntryOut {
	piece_id: string;
	title: string;
	owner_type: OwnerType;
	owner_id: string;
	version_id: string;
	version_status: VersionStatus;
	version_source: VersionSource;
	version_created_at: string;
}
