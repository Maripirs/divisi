// Per-piece player settings persistence, lifted out of
// `routes/piece/[id]/+page.svelte` (round-2 cleanup step 2). The component
// keeps a thin `persistSettings()` that snapshots its reactive state into a
// `PersistedSettings` and hands it to `savePersistedSettings`.

import type { DisplayMode, MixMode, MixPart, VisualState, VoicePart } from '$lib/midi/types';
import type { ViewMode } from '$lib/playerDefaults';

// Every user-adjustable player setting, keyed per piece id so switching
// pieces doesn't bleed one piece's mix/tempo/view into another's, and
// restored on the next visit instead of always starting from the
// hardcoded defaults in the player page.
export interface PersistedSettings {
	tempoBpm: number;
	voicePart: VoicePart;
	subPart: MixPart | null;
	displayMode: DisplayMode;
	visualStates: Record<MixPart, VisualState>;
	mixMode: MixMode;
	balance: Record<MixPart, number>;
	viewMode: ViewMode;
	zoomLevel: number;
	pdfZoomLevel: number;
	// F21 markup layer visibility toggles + F13 audio source, persisted
	// per piece so reopening restores the layers and reference/mix pick you
	// last used. All optional: older stored blobs predate them, and the
	// audio source is only ever restored under the guard in the piece page
	// (PDF view + a reference recording actually present).
	showMineMarkup?: boolean;
	showDirectorMarkup?: boolean;
	audioSource?: 'mix' | 'reference';
}

export function settingsStorageKey(id: string): string {
	return `divisi:settings:${id}`;
}

export function loadPersistedSettings(id: string): Partial<PersistedSettings> {
	const raw = localStorage.getItem(settingsStorageKey(id));
	if (!raw) return {};
	try {
		return JSON.parse(raw) as Partial<PersistedSettings>;
	} catch {
		return {};
	}
}

export function savePersistedSettings(id: string, settings: PersistedSettings): void {
	localStorage.setItem(settingsStorageKey(id), JSON.stringify(settings));
}
