import { describe, expect, it, vi } from 'vitest';

// `playerDefaults.ts` reads SvelteKit's `browser` flag, which this
// standalone vitest config (no SvelteKit plugin) can't resolve; the parser
// under test doesn't depend on it.
vi.mock('$app/environment', () => ({ browser: false }));
import { DEFAULT_PLAYER_DEFAULTS, parseStoredDefaults } from './playerDefaults';

describe('parseStoredDefaults voicePartChosen', () => {
	it('counts a stored voicePart from before the flag existed as chosen', () => {
		const parsed = parseStoredDefaults(JSON.stringify({ voicePart: 'bass', displayMode: 'solo' }));
		expect(parsed.voicePart).toBe('bass');
		expect(parsed.voicePartChosen).toBe(true);
	});

	it('trusts the flag once it is written', () => {
		const unchosen = parseStoredDefaults(JSON.stringify({ voicePart: 'soprano', voicePartChosen: false }));
		expect(unchosen.voicePartChosen).toBe(false);
		const chosen = parseStoredDefaults(JSON.stringify({ voicePart: 'tenor', voicePartChosen: true }));
		expect(chosen).toMatchObject({ voicePart: 'tenor', voicePartChosen: true });
	});

	it('is not chosen without a valid voicePart, or when storage is corrupt', () => {
		expect(parseStoredDefaults(JSON.stringify({ viewMode: 'pdf' })).voicePartChosen).toBe(false);
		expect(parseStoredDefaults(JSON.stringify({ voicePart: 'kazoo', voicePartChosen: true })).voicePartChosen).toBe(
			false
		);
		expect(parseStoredDefaults('{not json')).toEqual(DEFAULT_PLAYER_DEFAULTS);
	});

	it('defaults to not chosen', () => {
		expect(DEFAULT_PLAYER_DEFAULTS.voicePartChosen).toBe(false);
	});
});
