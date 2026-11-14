import { describe, expect, it, vi } from 'vitest';

// Same reason as `playerDefaults.test.ts`: this standalone vitest config
// can't resolve SvelteKit's `$app/environment`. Every function under test
// takes its storage explicitly, so `browser: false` costs nothing here.
vi.mock('$app/environment', () => ({ browser: false }));
import {
	applyAudioDiagnosticsUrlFlags,
	DEFAULT_AUDIO_DIAGNOSTICS,
	diagnosticsFromUrl,
	parseStoredDiagnostics,
	readAudioDiagnostics,
	writeAudioDiagnostics,
	type DiagnosticsStorage
} from './audioDiagnostics';

function memoryStorage(initial: Record<string, string> = {}): DiagnosticsStorage & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => {
			data[key] = value;
		}
	};
}

const throwingStorage: DiagnosticsStorage = {
	getItem: () => {
		throw new Error('SecurityError');
	},
	setItem: () => {
		throw new Error('QuotaExceededError');
	}
};

describe('diagnosticsFromUrl', () => {
	it('reads each flag', () => {
		expect(diagnosticsFromUrl(new URLSearchParams('latency=playback'), DEFAULT_AUDIO_DIAGNOSTICS)).toEqual({
			latencyPlayback: true,
			directOutput: false
		});
		expect(diagnosticsFromUrl(new URLSearchParams('audio=direct'), DEFAULT_AUDIO_DIAGNOSTICS)).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
	});

	it('turns flags back off and leaves the other setting alone', () => {
		const current = { latencyPlayback: true, directOutput: true };
		expect(diagnosticsFromUrl(new URLSearchParams('latency=default'), current)).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
		expect(diagnosticsFromUrl(new URLSearchParams('audio=bridge'), current)).toEqual({
			latencyPlayback: true,
			directOutput: false
		});
	});

	it('applies both flags together', () => {
		expect(
			diagnosticsFromUrl(new URLSearchParams('?latency=playback&audio=direct'), DEFAULT_AUDIO_DIAGNOSTICS)
		).toEqual({ latencyPlayback: true, directOutput: true });
	});

	it('returns null when there is nothing recognized to apply', () => {
		expect(diagnosticsFromUrl(new URLSearchParams(''), DEFAULT_AUDIO_DIAGNOSTICS)).toBeNull();
		expect(diagnosticsFromUrl(new URLSearchParams('code=ABC&audio=loud&latency='), DEFAULT_AUDIO_DIAGNOSTICS)).toBeNull();
	});
});

describe('parseStoredDiagnostics', () => {
	it('falls back to defaults for missing, corrupt or wrongly typed values', () => {
		expect(parseStoredDiagnostics(null)).toEqual(DEFAULT_AUDIO_DIAGNOSTICS);
		expect(parseStoredDiagnostics('{not json')).toEqual(DEFAULT_AUDIO_DIAGNOSTICS);
		expect(parseStoredDiagnostics('null')).toEqual(DEFAULT_AUDIO_DIAGNOSTICS);
		expect(parseStoredDiagnostics(JSON.stringify({ latencyPlayback: 'yes', directOutput: true }))).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
	});
});

describe('storage persistence', () => {
	it('round-trips through storage', () => {
		const storage = memoryStorage();
		writeAudioDiagnostics({ latencyPlayback: true, directOutput: false }, storage);
		expect(readAudioDiagnostics(storage)).toEqual({ latencyPlayback: true, directOutput: false });
	});

	it('writes URL flags to storage so they stick across page loads', () => {
		const storage = memoryStorage();
		expect(applyAudioDiagnosticsUrlFlags(new URLSearchParams('audio=direct'), storage)).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
		// A later page load with no flags keeps what the first one stored.
		expect(applyAudioDiagnosticsUrlFlags(new URLSearchParams(''), storage)).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
		expect(readAudioDiagnostics(storage)).toEqual({ latencyPlayback: false, directOutput: true });
	});

	it('does not write when the URL has no flags', () => {
		const storage = memoryStorage();
		const setItem = vi.spyOn(storage, 'setItem');
		applyAudioDiagnosticsUrlFlags(new URLSearchParams('code=ABC'), storage);
		expect(setItem).not.toHaveBeenCalled();
	});

	it('survives storage that throws, still honoring the URL for this load', () => {
		expect(readAudioDiagnostics(throwingStorage)).toEqual(DEFAULT_AUDIO_DIAGNOSTICS);
		expect(() => writeAudioDiagnostics({ latencyPlayback: true, directOutput: true }, throwingStorage)).not.toThrow();
		expect(applyAudioDiagnosticsUrlFlags(new URLSearchParams('latency=playback'), throwingStorage)).toEqual({
			latencyPlayback: true,
			directOutput: false
		});
	});

	it('treats no storage at all (server side) as defaults', () => {
		expect(readAudioDiagnostics(null)).toEqual(DEFAULT_AUDIO_DIAGNOSTICS);
		expect(applyAudioDiagnosticsUrlFlags(new URLSearchParams('audio=direct'), null)).toEqual({
			latencyPlayback: false,
			directOutput: true
		});
	});
});
