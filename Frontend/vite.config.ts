import basicSsl from '@vitejs/plugin-basic-ssl';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

export default defineConfig({
	plugins: [
		// i18n: generates the /es (Spanish) mirror of every route from the one
		// route tree, plus the typed `m.*()` message functions — see
		// `src/hooks.ts` (locale-prefix routing) and `src/hooks.server.ts`
		// (locale detection/HTML lang attribute). `en` (base locale) stays
		// unprefixed; only `es` gets a URL prefix — see `urlPatterns` below.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale'],
			urlPatterns: [
				{
					pattern: '/',
					localized: [
						['es', '/es'],
						['en', '/']
					]
				},
				{
					pattern: '/:path(.*)?',
					localized: [
						['es', '/es/:path(.*)?'],
						['en', '/:path(.*)?']
					]
				}
			]
		}),
		// Dev-only self-signed HTTPS: `AudioWorkletNodeSynthesizer` (player.ts)
		// needs `AudioContext.audioWorklet`, which browsers only expose in a
		// secure context (HTTPS or `localhost`). Testing over the LAN on a
		// phone (`--host`) hits a plain-HTTP IP address, which doesn't
		// qualify — Safari there sees `context.audioWorklet` as `undefined`.
		// The production Cloudflare deploy is real HTTPS, so this only
		// matters for dev; the phone's browser needs a one-time manual
		// "trust this certificate" for the self-signed cert.
		basicSsl(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Deploy target settled: Cloudflare Workers/Pages (Sites project in
			// Frontend/.openai/hosting.json). See Frontend/plan.md's Log.
			adapter: adapter()
		})
	]
});
