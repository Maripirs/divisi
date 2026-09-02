import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Minimal .env loader — Playwright's runner is plain Node and doesn't read
// the app's `.env*` files, and this repo has no `dotenv` dependency. Load
// `.env` then let `.env.local` override (same precedence Vite uses), but
// never clobber a value already set in the real environment (CI, or an
// inline `E2E_PIECE_ID=... npm run test:e2e`).
for (const name of ['.env', '.env.local']) {
	const path = fileURLToPath(new URL(name, import.meta.url));
	if (!existsSync(path)) continue;
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
		if (!m) continue;
		const [, key, rawValue] = m;
		const value = rawValue.replace(/^["']|["']$/g, '');
		if (name === '.env.local' || process.env[key] === undefined) process.env[key] = value;
	}
}

// The dev server is HTTPS (self-signed, via vite.config.ts's basicSsl plugin —
// AudioWorklet needs a secure context, so there's no plain-HTTP dev mode to
// fall back to). `localhost` is a secure context, so the FluidSynth
// AudioWorklet loads under headless Chromium here.
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://localhost:5173';

export default defineConfig({
	testDir: './e2e',
	// Audio + OSMD engraving + a real Backend round-trip: give each test room.
	timeout: 60_000,
	expect: { timeout: 10_000 },
	fullyParallel: false,
	workers: 1,
	// `_diagnose` / `_profile` are opt-in investigation tools, not assertions.
	grepInvert: process.env.E2E_TOOLS ? undefined : /@tools/,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	use: {
		baseURL: BASE_URL,
		ignoreHTTPSErrors: true,
		trace: 'on-first-retry',
		video: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [
		{ name: 'setup', testMatch: /.*\.setup\.ts/ },
		{
			name: 'chromium',
			dependencies: ['setup'],
			use: {
				...devices['Desktop Chrome'],
				storageState: 'e2e/.auth/state.json',
				launchOptions: {
					// A synthetic click is a user gesture already, but this keeps
					// the synth from being throttled if a test starts audio any
					// other way.
					args: ['--autoplay-policy=no-user-gesture-required']
				}
			}
		}
	],
	webServer: {
		command: 'npm run dev -- --port 5173 --strictPort',
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		ignoreHTTPSErrors: true,
		timeout: 120_000
	}
});
