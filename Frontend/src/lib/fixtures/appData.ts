/**
 * Local, frontend-only fixture data for the app-shell screens (home, groups,
 * homework, admin, settings) — same "no backend" philosophy as the piece
 * registry (see `pieces/registry.ts`), just for the product-model concepts
 * (Group/Homework/Annotation/User) rather than pieces themselves. Swap for
 * real Backend calls once these screens move past the UI-shell stage; every
 * consumer only imports the exported shapes below, so that swap shouldn't
 * touch the routes themselves.
 */

export interface Group {
	id: string;
	name: string;
	/** Piece ids from `pieces/registry.ts` distributed to this group — drives
	 * the group's "Rehearsal Tracks" tab. Empty is a valid, real state. */
	pieceIds: string[];
}

export interface Homework {
	id: string;
	groupId: string;
	pieceId: string;
	title: string;
	range: string;
	dueLabel: string;
	dueDate: string;
	instructions: string;
}

export interface Member {
	section: string;
	count: number;
	isAdmin?: boolean;
}

export interface Annotation {
	id: string;
	pieceTitle: string;
	measure: number;
	note: string;
	visibility: 'private' | 'director' | 'selected' | 'group';
}

export interface ContinuePractice {
	pieceId: string;
	voiceView: string;
	lastOpened: string;
}

export const CURRENT_USER = {
	name: 'Maria P.',
	email: 'maria@example.com'
};

export const GROUPS: Group[] = [
	{ id: 'sfcc', name: 'SFCC Chamber Choir', pieceIds: ['lacrymosa', 'der-abend', 'proserpine'] },
	{ id: 'community-chorus', name: 'Community Chorus', pieceIds: [] }
];

export const HOMEWORK: Homework[] = [
	{
		id: 'lacrymosa-mm18-42',
		groupId: 'sfcc',
		pieceId: 'lacrymosa',
		title: 'Lacrymosa',
		range: 'mm. 18–42',
		dueLabel: 'Due Friday',
		dueDate: 'Friday, Aug 28',
		instructions: 'Focus on entrances after rests.'
	},
	{
		id: 'der-abend-full',
		groupId: 'sfcc',
		pieceId: 'der-abend',
		title: 'Der Abend',
		range: 'Full piece',
		dueLabel: 'Due Friday',
		dueDate: 'Friday, Aug 28',
		instructions: 'Watch dynamics in the last verse.'
	},
	{
		id: 'proserpine-mm1-30',
		groupId: 'sfcc',
		pieceId: 'proserpine',
		title: 'Proserpine',
		range: 'mm. 1–30',
		dueLabel: 'Due next week',
		dueDate: 'Next week',
		instructions: 'Sightread through with a metronome.'
	}
];

export const MEMBERS: Record<string, Member[]> = {
	sfcc: [
		{ section: 'Director', count: 1, isAdmin: true },
		{ section: 'Soprano', count: 12 },
		{ section: 'Alto', count: 10 },
		{ section: 'Tenor', count: 8 },
		{ section: 'Bass', count: 9 }
	],
	'community-chorus': [
		{ section: 'Director', count: 1, isAdmin: true },
		{ section: 'Members', count: 22 }
	]
};

export const RECENT_ANNOTATIONS: Annotation[] = [
	{
		id: 'a1',
		pieceTitle: 'Lacrymosa',
		measure: 24,
		note: 'Watch entrance after bass.',
		visibility: 'private'
	}
];

export const CONTINUE_PRACTICE: ContinuePractice = {
	pieceId: 'lacrymosa',
	voiceView: 'Alto + Accomp',
	lastOpened: '20 min ago'
};

export function homeworkForGroup(groupId: string): Homework[] {
	return HOMEWORK.filter((hw) => hw.groupId === groupId);
}

export function getGroup(id: string): Group | undefined {
	return GROUPS.find((g) => g.id === id);
}

export function getHomework(groupId: string, homeworkId: string): Homework | undefined {
	return HOMEWORK.find((hw) => hw.groupId === groupId && hw.id === homeworkId);
}

/** "What should I practice now?" — earliest-due homework across all groups.
 * A real version would sort by actual due date; the fixture list is already
 * in that order. */
export function nextPractice(): Homework | undefined {
	return HOMEWORK[0];
}

export const VOICE_PARTS = ['Soprano', 'Alto', 'Tenor', 'Bass'] as const;
export const VIEW_MODES = ['My part', 'My part + Accomp', 'Everyone', 'Custom'] as const;

export interface AppSettings {
	defaultVoice: (typeof VOICE_PARTS)[number];
	defaultView: (typeof VIEW_MODES)[number];
	theme: 'system' | 'light' | 'dark';
	keepScreenAwake: boolean;
	countIn: boolean;
	backgroundAudio: boolean;
	defaultZoom: number;
	annotationSharingDefault: Annotation['visibility'];
}

export const DEFAULT_SETTINGS: AppSettings = {
	defaultVoice: 'Soprano',
	defaultView: 'My part + Accomp',
	theme: 'system',
	keepScreenAwake: true,
	countIn: false,
	backgroundAudio: true,
	defaultZoom: 1,
	annotationSharingDefault: 'private'
};
