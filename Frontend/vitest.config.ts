import { defineConfig } from 'vitest/config';

// Standalone from vite.config.js on purpose: the app's Vite config pulls in
// SvelteKit, the paraglide plugin and a dev-only self-signed-SSL plugin, none
// of which the unit tests need. These tests cover the *pure* helper modules
// extracted out of the god-components (see CLEANUP.md round 2) — plain TS in,
// plain TS out, no DOM, no Svelte runtime.
export default defineConfig({
	resolve: {
		alias: {
			$lib: new URL('./src/lib', import.meta.url).pathname
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
