/** F35 (Carpool Map): lazy-loading singleton for the Google Maps JavaScript
 * API. Nothing in this module runs at import time or app boot: the Maps
 * `<script>` tag is only injected the first time `loadGoogleMaps()` is
 * actually called, which only happens once a carpool page with
 * `map_enabled` is visible (see `CarpoolMap.svelte` and `CarpoolBoard.svelte`,
 * both of which call this on mount, never eagerly).
 *
 * Deliberately framework-free: this file never imports `$env/static/public`
 * or `$env/dynamic/public` itself. The api key / map id are read by
 * whichever `.svelte` file calls `loadGoogleMaps()` and passed in as a plain
 * `GoogleMapsConfig` argument, so this module has no SvelteKit virtual-module
 * import that would need the SvelteKit Vite plugin to resolve. That's what
 * keeps it importable from the plain `vitest.config.ts` this project's other
 * `$lib` unit tests already run under (no SvelteKit plugin at all, see that
 * file's own doc comment), and keeps `loadGoogleMaps` itself a plain function
 * a test can import and monkey-patch/replace outright rather than needing a
 * DOM or a real network call: "Tests mock the map loader rather than calling
 * Google in CI" per plan.md's B22/F26 acceptance criteria.
 *
 * "Maps unavailable" (no key configured, `document` doesn't exist, the
 * script gets blocked by an ad blocker, a network failure, ...) is always a
 * normal, silent outcome here: every failure path below resolves to `null`
 * rather than throwing, so a caller never needs a try/catch to treat "don't
 * show the map" as anything other than the ordinary case it is today with
 * zero Google Maps configured anywhere. */

export interface GoogleMapsConfig {
	/** `PUBLIC_GOOGLE_MAPS_API_KEY`, or `undefined`/empty when unset. */
	apiKey: string | undefined;
	/** `PUBLIC_GOOGLE_MAPS_MAP_ID`, or `undefined`/empty when unset. A map
	 * still renders without one (Advanced Markers just need *some* map id,
	 * even the default "DEMO_MAP_ID" Google documents for testing), so this
	 * is carried through rather than treated as a second required key. */
	mapId: string | undefined;
}

export interface GoogleMapsHandle {
	/** The real `google.maps` namespace, once loaded, so a caller never has
	 * to reach for the ambient `google` global directly (and so a test can
	 * hand back a fake one shaped however a given test needs). */
	maps: typeof google.maps;
	mapId: string | undefined;
}

const SCRIPT_MARKER_ATTR = 'data-divisi-google-maps';

let loadPromise: Promise<GoogleMapsHandle | null> | null = null;

/** Injects the Maps JavaScript API script tag and resolves once it (and the
 * `marker` library Advanced Markers live in) has actually run. Split out of
 * `loadGoogleMaps` only so the "how do we wait for a `<script>` tag" bit
 * isn't tangled up with the memoization/short-circuit logic below. */
function injectScript(apiKey: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const existing = document.querySelector<HTMLScriptElement>(`script[${SCRIPT_MARKER_ATTR}]`);
		if (existing) {
			existing.addEventListener('load', () => resolve());
			existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')));
			return;
		}
		const script = document.createElement('script');
		script.setAttribute(SCRIPT_MARKER_ATTR, 'true');
		// `libraries=marker` preloads Advanced Markers alongside the base
		// script; `loading=async` plus `v=weekly` is Google's own current
		// recommendation for this pattern (see the Maps JS API docs' "load
		// the API" guide) and is what makes `google.maps.importLibrary`
		// (used lazily for Places, see `$lib/actions/googlePlaces.ts`)
		// available at all.
		script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker&v=weekly&loading=async`;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Google Maps script failed to load'));
		document.head.appendChild(script);
	});
}

/** Resolves once `google.maps` (and the Advanced Marker library) is ready
 * to use, or `null` if maps aren't usable for any reason: no api key
 * configured, no `document` to inject a script into (SSR), or the script
 * failing to load at all. Memoized process-wide: the script tag is only
 * ever injected once per page load no matter how many components
 * (`CarpoolMap`, the Places-autocomplete-attached form inputs) call this
 * in the same session: they all share the one in-flight/resolved
 * promise. */
export async function loadGoogleMaps(config: GoogleMapsConfig): Promise<GoogleMapsHandle | null> {
	if (!config.apiKey) return null;
	if (typeof document === 'undefined') return null;

	if (!loadPromise) {
		const apiKey = config.apiKey;
		const mapId = config.mapId;
		loadPromise = (async () => {
			try {
				const existingGoogle = (window as typeof window & { google?: typeof google }).google;
				if (!existingGoogle?.maps) {
					await injectScript(apiKey);
				}
				const g = (window as typeof window & { google?: typeof google }).google;
				if (!g?.maps) return null;
				// `libraries=marker` in the script URL only *permits* the
				// marker library to load; `importLibrary` is what actually
				// resolves once it's ready to use (a no-op await if it's
				// already loaded by the time this runs).
				await g.maps.importLibrary('marker');
				return { maps: g.maps, mapId };
			} catch {
				return null;
			}
		})();
	}
	return loadPromise;
}

/** Test-only escape hatch: clears the memoized promise so a fresh test can
 * call `loadGoogleMaps` again from a clean slate instead of getting back
 * whatever an earlier test's call already resolved to. Never called by app
 * code. */
export function _resetGoogleMapsLoaderForTests(): void {
	loadPromise = null;
}
