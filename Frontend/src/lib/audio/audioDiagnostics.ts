/**
 * TEMPORARY (CarPlay audio diagnostics): remove once we know which fix wins.
 *
 * On iPhone over CarPlay, play-along synth audio has intermittent crackle
 * and few-second silences that recover on their own (no pitch drift, not a
 * navigation interruption). That reads like buffer underruns, and there are
 * two suspects, each behind one switch here so they can be tried in the car
 * independently:
 *
 *  - `latencyPlayback`: build `MidiPlayer`'s `AudioContext` with
 *    `latencyHint: 'playback'` instead of the default `'interactive'`, so
 *    the browser picks a larger output buffer (more latency, which a
 *    play-along doesn't care about, in exchange for more slack before an
 *    underrun).
 *  - `directOutput`: connect the synth node straight to
 *    `context.destination` instead of through the
 *    `MediaStreamAudioDestinationNode` to hidden `<audio>` element bridge
 *    (see `player.ts`). That bridge adds a second buffering stage, which is
 *    exactly the kind of thing that can starve on a Bluetooth/CarPlay route.
 *
 * Both are read once, when `MidiPlayer.create()` builds its context, so a
 * change takes effect the next time a piece's player is created (reload the
 * piece). They are per-browser (localStorage), not per-account, like the
 * other player prefs in `$lib/playerDefaults.ts`.
 *
 * Two ways in: the admin-only toggles in the Settings drawer's Playback
 * section, and URL flags anyone can use (`?latency=playback|default`,
 * `?audio=direct|bridge`), applied by the root layout on page load and
 * written to storage so they stick across navigation.
 */
import { browser } from '$app/environment';
import { writable } from 'svelte/store';

const STORAGE_KEY = 'divisi.audioDiagnostics';

export interface AudioDiagnostics {
	/** `new AudioContext({ latencyHint: 'playback' })` instead of the
	 * default (`'interactive'`). */
	latencyPlayback: boolean;
	/** Synth node to `context.destination` directly, no `<audio>` bridge. */
	directOutput: boolean;
}

export const DEFAULT_AUDIO_DIAGNOSTICS: AudioDiagnostics = {
	latencyPlayback: false,
	directOutput: false
};

/** The slice of `Storage` this module uses, so tests can hand in a fake
 * (including one that throws). */
export type DiagnosticsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** `window.localStorage` itself, or `null` off the browser. Even the
 * property access can throw (Safari with storage blocked, some private
 * modes), hence the try/catch around the getter, not just its methods. */
function defaultStorage(): DiagnosticsStorage | null {
	if (!browser) return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** Parses the stored JSON field by field, falling back to the defaults for
 * anything missing, invalid or corrupt. */
export function parseStoredDiagnostics(raw: string | null): AudioDiagnostics {
	if (!raw) return DEFAULT_AUDIO_DIAGNOSTICS;
	try {
		const parsed = JSON.parse(raw) as Partial<Record<keyof AudioDiagnostics, unknown>> | null;
		return {
			latencyPlayback:
				typeof parsed?.latencyPlayback === 'boolean'
					? parsed.latencyPlayback
					: DEFAULT_AUDIO_DIAGNOSTICS.latencyPlayback,
			directOutput:
				typeof parsed?.directOutput === 'boolean' ? parsed.directOutput : DEFAULT_AUDIO_DIAGNOSTICS.directOutput
		};
	} catch {
		return DEFAULT_AUDIO_DIAGNOSTICS;
	}
}

export function readAudioDiagnostics(storage: DiagnosticsStorage | null = defaultStorage()): AudioDiagnostics {
	if (!storage) return DEFAULT_AUDIO_DIAGNOSTICS;
	try {
		return parseStoredDiagnostics(storage.getItem(STORAGE_KEY));
	} catch {
		return DEFAULT_AUDIO_DIAGNOSTICS;
	}
}

/** Best-effort: a storage that throws (quota, blocked) just means the
 * setting lasts for this page load only (the in-memory store still has it). */
export function writeAudioDiagnostics(
	next: AudioDiagnostics,
	storage: DiagnosticsStorage | null = defaultStorage()
): void {
	if (!storage) return;
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// See the doc comment above.
	}
}

/** Merges whichever recognized URL flags `params` carries onto `current`.
 * Returns `null` when there's nothing recognized to apply, so callers can
 * skip a pointless storage write on every ordinary page load. Unknown
 * values (`?audio=loud`) are ignored rather than treated as "off". */
export function diagnosticsFromUrl(params: URLSearchParams, current: AudioDiagnostics): AudioDiagnostics | null {
	const latency = params.get('latency');
	const audio = params.get('audio');
	let next: AudioDiagnostics | null = null;
	if (latency === 'playback' || latency === 'default') {
		next = { ...(next ?? current), latencyPlayback: latency === 'playback' };
	}
	if (audio === 'direct' || audio === 'bridge') {
		next = { ...(next ?? current), directOutput: audio === 'direct' };
	}
	return next;
}

/** Reads storage, applies any URL flags in `params` on top, and writes the
 * result back when a flag was present. Returns the effective settings. */
export function applyAudioDiagnosticsUrlFlags(
	params: URLSearchParams,
	storage: DiagnosticsStorage | null = defaultStorage()
): AudioDiagnostics {
	const current = readAudioDiagnostics(storage);
	const next = diagnosticsFromUrl(params, current);
	if (!next) return current;
	writeAudioDiagnostics(next, storage);
	return next;
}

/** The live settings. `MidiPlayer.create()` reads this (via `get`) rather
 * than storage directly, so a URL flag still applies for the current page
 * load even when storage is blocked. */
export const audioDiagnostics = writable<AudioDiagnostics>(readAudioDiagnostics());

export function setAudioDiagnostics(next: AudioDiagnostics): void {
	writeAudioDiagnostics(next);
	audioDiagnostics.set(next);
}

/** Called once from the root layout's script (not `onMount`: a child
 * route's `onMount`, e.g. the piece page creating its `MidiPlayer`, runs
 * before the layout's own `onMount`, which would be too late on a direct
 * load of a piece URL). */
export function initAudioDiagnosticsFromUrl(search: string): void {
	audioDiagnostics.set(applyAudioDiagnosticsUrlFlags(new URLSearchParams(search)));
}

/** Whether the piece page currently open says its caller is an admin of the
 * piece's owning group. The piece page learns that client-side (from
 * `resolve/+server.ts`), not through `page.data`, so the Settings drawer
 * can't see it on its own; the piece page sets this while mounted. Only
 * used to decide whether to show the diagnostic toggles. */
export const pieceAdminForDiagnostics = writable(false);
