import { test as setup, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The app keeps the Backend JWT in an httpOnly cookie named `divisi_session`
// (src/lib/server/session.ts), set only by the `/login` server action. Rather
// than drive that form, hit the Backend's `/auth/login` directly and drop the
// token into a Playwright storageState the `chromium` project reuses.

const API_BASE = process.env.PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const EMAIL = process.env.TEST_USER_EMAIL ?? process.env.E2E_USER_EMAIL;
const PASSWORD = process.env.TEST_USER_PASSWORD ?? process.env.E2E_USER_PASSWORD;
const STATE_PATH = fileURLToPath(new URL('./.auth/state.json', import.meta.url));

setup('authenticate', async ({ request }) => {
	expect(
		EMAIL && PASSWORD,
		'Set TEST_USER_EMAIL / TEST_USER_PASSWORD (they are already in Frontend/.env.local) ' +
			'or E2E_USER_EMAIL / E2E_USER_PASSWORD in the environment.'
	).toBeTruthy();

	const res = await request.post(`${API_BASE}/auth/login`, {
		data: { email: EMAIL, password: PASSWORD }
	});
	expect(
		res.ok(),
		`Backend login failed (${res.status()}) against ${API_BASE}. Is the right Backend up, ` +
			`and do these credentials work there?`
	).toBeTruthy();

	const { access_token: token } = (await res.json()) as { access_token: string };
	expect(token, 'Backend login response had no access_token').toBeTruthy();

	const url = new URL(process.env.E2E_BASE_URL ?? 'https://localhost:5173');
	const state = {
		cookies: [
			{
				name: 'divisi_session',
				value: token,
				domain: url.hostname,
				path: '/',
				// Matches SESSION_MAX_AGE_SECONDS in src/lib/server/session.ts.
				expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
				httpOnly: true,
				secure: true,
				sameSite: 'Lax' as const
			}
		],
		origins: []
	};

	mkdirSync(fileURLToPath(new URL('./.auth/', import.meta.url)), { recursive: true });
	writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
});
