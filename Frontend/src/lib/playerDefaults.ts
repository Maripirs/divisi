/**
 * Global "Practice defaults" — the account-wide View/Display/Mix a fresh
 * piece seeds from, per UX_WIREFRAME.md's "Track Settings vs App Settings"
 * section. Distinct from the per-piece settings the player itself persists
 * (`divisi:settings:<id>` in `routes/piece/[id]/+page.svelte`): those win
 * once a piece has been opened before, this only supplies the starting
 * point the first time, until the user explicitly promotes a piece's
 * current setting via "Make this my default". Same localStorage-backed-
 * store shape as `theme.ts`'s `themeMode` (which needs no such per-piece/
 * global split — it's simply global, full stop).
 */
import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import {
	DISPLAY_MODES,
	MIX_MODES,
	MIX_PARTS,
	VISUAL_STATES,
	VOICE_PARTS,
	type DisplayMode,
	type MixBase,
	type MixMode,
	type VisualState,
	type VoicePart
} from '$lib/midi/types';

const STORAGE_KEY = 'divisi.playerDefaults';

/** Score vs PDF — the player's "View" menu section. Lives here (rather than
 * only in the piece route) so both it and the Settings page can share the
 * one type. */
export type ViewMode = 'player' | 'pdf';
export const VIEW_MODES: readonly ViewMode[] = ['player', 'pdf'];

/** The player's "Mix" section: per-part balance sliders plus the
 * off/muted/active toggle. Fixed to the 5 base buckets (SATB +
 * accompaniment), not a specific piece's possibly-split mixer ids — a
 * divisi desk always inherits its base voice's default (see
 * `+page.svelte`'s `materializePartRecord`), since which voice you sing is
 * an account-wide fact but which desk of it a given file happens to split
 * into isn't. Kept separate from `displayMode` even though they're edited
 * from adjacent sections, because raw slider/toggle values (e.g. a custom
 * balance) aren't representable by a preset name. */
export interface MixDefaults {
	balance: Record<MixBase, number>;
	visualStates: Record<MixBase, VisualState>;
}

export interface PlayerDefaults {
	voicePart: VoicePart;
	/** Which desk of `voicePart` you sing, when a piece happens to split it
	 * (e.g. "Soprano 2") — `null` means no preference (sing the whole
	 * section). Unlike a piece's own `subPart` (`routes/piece/[id]`'s
	 * per-file desk id), this is a plain desk *number*: file-independent,
	 * since "I'm second soprano" doesn't depend on which file is open, only
	 * whether that file happens to split soprano at all. A fresh piece that
	 * splits `voicePart` into a desk numbered this seeds `subPart` from it;
	 * one that doesn't split, or splits without a matching number, ignores
	 * it exactly like today (see `+page.svelte`'s `bootstrap()`). */
	voiceDesk: number | null;
	/** Only the three presets are offered as an account-wide default —
	 * "Custom" is a manual mixer state, captured instead by `mix` below. */
	displayMode: Exclude<DisplayMode, 'custom'>;
	/** Same idea as `displayMode`, for the audio balance presets. */
	mixMode: Exclude<MixMode, 'custom'>;
	viewMode: ViewMode;
	mix: MixDefaults;
}

const DEFAULT_MIX: MixDefaults = {
	balance: { soprano: 0.5, alto: 0.5, tenor: 0.5, bass: 0.5, accompaniment: 0.5 },
	visualStates: { soprano: 'active', alto: 'off', tenor: 'off', bass: 'off', accompaniment: 'off' }
};

export const DEFAULT_PLAYER_DEFAULTS: PlayerDefaults = {
	voicePart: 'soprano',
	voiceDesk: null,
	displayMode: 'solo',
	mixMode: 'mostlyMe',
	viewMode: 'player',
	mix: DEFAULT_MIX
};

// Same breakpoint app.css already uses for its own mobile/desktop split —
// a first-time visitor's display default follows screen size: small
// screens default to solo (dense notation is hard to read at that size
// with every part visible), bigger screens default to Highlighted (My
// part + others), since there's room to show everyone without it
// crowding the score.
const SMALL_SCREEN_QUERY = '(max-width: 768px)';

function firstTimeDefaults(): PlayerDefaults {
	if (!browser || !window.matchMedia(SMALL_SCREEN_QUERY).matches) {
		return { ...DEFAULT_PLAYER_DEFAULTS, displayMode: 'highlighted' };
	}
	return DEFAULT_PLAYER_DEFAULTS;
}

function isVoicePart(value: unknown): value is VoicePart {
	return VOICE_PARTS.includes(value as VoicePart);
}

/** A desk number's only real constraint is "positive integer" — divisi
 * splits into more than a handful of desks are vanishingly rare in actual
 * choral music, but nothing here should silently cap a genuine one. */
function isVoiceDesk(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

function isNonCustomDisplayMode(value: unknown): value is PlayerDefaults['displayMode'] {
	return typeof value === 'string' && DISPLAY_MODES.includes(value as DisplayMode) && value !== 'custom';
}

function isNonCustomMixMode(value: unknown): value is PlayerDefaults['mixMode'] {
	return typeof value === 'string' && MIX_MODES.includes(value as MixMode) && value !== 'custom';
}

function isViewMode(value: unknown): value is ViewMode {
	return VIEW_MODES.includes(value as ViewMode);
}

function sanitizeMix(value: unknown): MixDefaults {
	const candidate = value as Partial<MixDefaults> | undefined;
	const balance = candidate?.balance;
	const visualStates = candidate?.visualStates;
	const validBalance =
		balance && MIX_PARTS.every((part) => typeof balance[part] === 'number' && balance[part] >= 0 && balance[part] <= 1);
	const validVisualStates =
		visualStates && MIX_PARTS.every((part) => VISUAL_STATES.includes(visualStates[part] as VisualState));
	return {
		balance: validBalance ? (balance as Record<MixBase, number>) : DEFAULT_MIX.balance,
		visualStates: validVisualStates ? (visualStates as Record<MixBase, VisualState>) : DEFAULT_MIX.visualStates
	};
}

function loadDefaults(): PlayerDefaults {
	if (!browser) return DEFAULT_PLAYER_DEFAULTS;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return firstTimeDefaults();
	try {
		const parsed = JSON.parse(raw) as Partial<Record<keyof PlayerDefaults, unknown>>;
		return {
			voicePart: isVoicePart(parsed.voicePart) ? parsed.voicePart : DEFAULT_PLAYER_DEFAULTS.voicePart,
			voiceDesk: isVoiceDesk(parsed.voiceDesk) ? parsed.voiceDesk : DEFAULT_PLAYER_DEFAULTS.voiceDesk,
			displayMode: isNonCustomDisplayMode(parsed.displayMode) ? parsed.displayMode : DEFAULT_PLAYER_DEFAULTS.displayMode,
			mixMode: isNonCustomMixMode(parsed.mixMode) ? parsed.mixMode : DEFAULT_PLAYER_DEFAULTS.mixMode,
			viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : DEFAULT_PLAYER_DEFAULTS.viewMode,
			mix: sanitizeMix(parsed.mix)
		};
	} catch {
		return DEFAULT_PLAYER_DEFAULTS;
	}
}

export const playerDefaults = writable<PlayerDefaults>(loadDefaults());

export function setPlayerDefaults(next: PlayerDefaults): void {
	if (browser) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	playerDefaults.set(next);
}
