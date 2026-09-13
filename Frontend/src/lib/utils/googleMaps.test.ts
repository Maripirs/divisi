// @vitest-environment jsdom
//
// F35: covers `loadGoogleMaps`'s "maps unavailable is a normal, silent
// case" contract (no key, no `document`, a failing script) plus the happy
// path, with a fake `<script>`/`google.maps` instead of any real network
// call: "Tests mock the map loader rather than calling Google in CI" per
// plan.md's B22/F26 acceptance criteria. `_resetGoogleMapsLoaderForTests`
// resets the module's singleton between cases so each test starts clean.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetGoogleMapsLoaderForTests, loadGoogleMaps } from './googleMaps';

/** Test-only stand-in for the real `window.google` global: only shaped
 * enough for `loadGoogleMaps` itself to use (`maps.importLibrary`), cast
 * through `unknown` rather than satisfying the full real `typeof google`
 * (hundreds of unrelated fields no test here touches). */
function setFakeGoogle(fake: { maps: Record<string, unknown> }): void {
	(window as unknown as { google: unknown }).google = fake;
}

function clearFakeGoogle(): void {
	(window as unknown as Record<string, unknown>).google = undefined;
}

/** Real Google's loader signals readiness by invoking the function named in
 * the script's own `callback=` URL param, not by firing the script's `load`
 * event (see `injectScript`'s doc comment in `googleMaps.ts` for why). Reads
 * that name back off the injected `<script>` tag and calls it, so these
 * tests drive `loadGoogleMaps` the same way the real API does. */
function fireReadyCallback(script: HTMLScriptElement): void {
	const name = new URL(script.src).searchParams.get('callback');
	if (!name) throw new Error('injected script has no callback= param');
	(window as unknown as Record<string, () => void>)[name]();
}

describe('loadGoogleMaps', () => {
	beforeEach(() => {
		_resetGoogleMapsLoaderForTests();
		document.head.innerHTML = '';
		clearFakeGoogle();
	});

	afterEach(() => {
		_resetGoogleMapsLoaderForTests();
		document.head.innerHTML = '';
		clearFakeGoogle();
	});

	it('resolves to null with no api key configured, without touching the DOM', async () => {
		const result = await loadGoogleMaps({ apiKey: undefined, mapId: undefined });
		expect(result).toBeNull();
		expect(document.head.querySelector('script')).toBeNull();
	});

	it('resolves to null for an empty-string api key too', async () => {
		const result = await loadGoogleMaps({ apiKey: '', mapId: undefined });
		expect(result).toBeNull();
	});

	it('injects exactly one script tag and resolves the maps handle on success', async () => {
		// Simulate the real loader: once "ready" it plants `window.google`
		// itself (same as the real Google bootstrap loader would), then
		// invokes the `callback=` function the module is waiting on - not a
		// `load` event, see `fireReadyCallback`'s doc comment.
		let scriptEl: HTMLScriptElement | null = null;
		const observer = new MutationObserver(() => {
			const el = document.head.querySelector<HTMLScriptElement>('script[data-divisi-google-maps]');
			if (el && el !== scriptEl) {
				scriptEl = el;
				setFakeGoogle({
					maps: {
						importLibrary: vi.fn().mockResolvedValue({}),
						Map: vi.fn(),
						marker: { AdvancedMarkerElement: vi.fn(), PinElement: vi.fn() }
					}
				});
				fireReadyCallback(el);
			}
		});
		observer.observe(document.head, { childList: true });

		const result = await loadGoogleMaps({ apiKey: 'test-key', mapId: 'test-map-id' });
		observer.disconnect();

		expect(result).not.toBeNull();
		expect(result?.mapId).toBe('test-map-id');
		expect(document.head.querySelectorAll('script[data-divisi-google-maps]').length).toBe(1);
		expect(result?.maps.importLibrary).toHaveBeenCalledWith('marker');
	});

	it('memoizes: a second call reuses the first without injecting another script', async () => {
		const observer = new MutationObserver(() => {
			const el = document.head.querySelector<HTMLScriptElement>('script[data-divisi-google-maps]');
			if (el && !el.dataset.fired) {
				el.dataset.fired = 'true';
				setFakeGoogle({ maps: { importLibrary: vi.fn().mockResolvedValue({}) } });
				fireReadyCallback(el);
			}
		});
		observer.observe(document.head, { childList: true });

		const config = { apiKey: 'test-key', mapId: undefined };
		const [first, second] = await Promise.all([loadGoogleMaps(config), loadGoogleMaps(config)]);
		observer.disconnect();

		expect(first).toBe(second);
		expect(document.head.querySelectorAll('script[data-divisi-google-maps]').length).toBe(1);
	});

	it('resolves to null (not a rejection) when the script fails to load', async () => {
		const observer = new MutationObserver(() => {
			const el = document.head.querySelector<HTMLScriptElement>('script[data-divisi-google-maps]');
			if (el) el.dispatchEvent(new Event('error'));
		});
		observer.observe(document.head, { childList: true });

		await expect(loadGoogleMaps({ apiKey: 'test-key', mapId: undefined })).resolves.toBeNull();
		observer.disconnect();
	});

	it('resolves to null if the callback fires but google.maps.importLibrary never actually shows up', async () => {
		const observer = new MutationObserver(() => {
			const el = document.head.querySelector<HTMLScriptElement>('script[data-divisi-google-maps]');
			if (el) fireReadyCallback(el);
		});
		observer.observe(document.head, { childList: true });

		await expect(loadGoogleMaps({ apiKey: 'test-key', mapId: undefined })).resolves.toBeNull();
		observer.disconnect();
	});
});
