import { beforeEach, describe, expect, it } from 'vitest';
import {
	loadPersistedSettings,
	savePersistedSettings,
	settingsStorageKey,
	type PersistedSettings
} from './persistence';

// Minimal Web Storage shim — this module only ever touches
// getItem/setItem. vitest's jsdom env doesn't reliably expose a working
// `localStorage` (opaque-origin / Node stub), and these are pure
// string-in/string-out functions, so a Map-backed stub is enough and
// keeps the file in the default `node` env.
beforeEach(() => {
	const store = new Map<string, string>();
	globalThis.localStorage = {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
		key: (i: number) => [...store.keys()][i] ?? null,
		get length() {
			return store.size;
		}
	} as Storage;
});

const sample: PersistedSettings = {
	tempoBpm: 96,
	voicePart: 'alto',
	subPart: null,
	displayMode: 'highlighted',
	visualStates: { soprano: 'muted', alto: 'active' },
	mixMode: 'minusMe',
	balance: { soprano: 0.5, alto: 0 },
	viewMode: 'player',
	zoomLevel: 1,
	pdfZoomLevel: 1.5
};

describe('settingsStorageKey', () => {
	it('namespaces by piece id', () => {
		expect(settingsStorageKey('abc')).toBe('divisi:settings:abc');
	});
});

describe('loadPersistedSettings', () => {
	it('returns {} when nothing is stored', () => {
		expect(loadPersistedSettings('missing')).toEqual({});
	});
	it('returns {} on malformed JSON rather than throwing', () => {
		localStorage.setItem(settingsStorageKey('bad'), '{not json');
		expect(loadPersistedSettings('bad')).toEqual({});
	});
	it('round-trips a saved settings object', () => {
		savePersistedSettings('p1', sample);
		expect(loadPersistedSettings('p1')).toEqual(sample);
	});
	it('keeps piece settings isolated by id', () => {
		savePersistedSettings('p1', sample);
		expect(loadPersistedSettings('p2')).toEqual({});
	});
});
