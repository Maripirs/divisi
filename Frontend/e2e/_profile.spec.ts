import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { readProbe } from './helpers/playback';

const PIECE_ID = process.env.E2E_PIECE_ID;
test.skip(!PIECE_ID, 'set E2E_PIECE_ID');

// Not part of the default run (see `grepInvert` in playwright.config.ts).
// Run with: E2E_TOOLS=1 E2E_PIECE_ID=... npx playwright test _profile
test('cpu profile of editor playback', { tag: '@tools' }, async ({ page }) => {
	await page.goto(`/piece/${PIECE_ID}/edit?e2e=1`);
	await expect(page.locator('.play-btn')).toBeVisible();
	await expect.poll(async () => (await readProbe(page)).phase).toBe('ready');

	const client = await page.context().newCDPSession(page);
	await client.send('Profiler.enable');
	await client.send('Profiler.setSamplingInterval', { interval: 200 });

	await page.locator('.play-btn').click();
	await expect.poll(async () => (await readProbe(page)).isPlaying, { timeout: 20_000 }).toBe(true);

	await client.send('Profiler.start');
	await page.waitForTimeout(5000);
	const { profile } = await client.send('Profiler.stop');
	writeFileSync('test-results/editor-playback.cpuprofile', JSON.stringify(profile));

	// Roll the profile up into self-time per function so the hog is obvious in
	// the test log without opening the .cpuprofile.
	const byNode = new Map<number, { name: string; url: string; line: number; self: number }>();
	for (const n of profile.nodes ?? []) {
		byNode.set(n.id, {
			name: n.callFrame.functionName || '(anonymous)',
			url: n.callFrame.url.replace(/^https?:\/\/[^/]+/, ''),
			line: n.callFrame.lineNumber,
			self: 0
		});
	}
	const dt = profile.timeDeltas ?? [];
	const samples = profile.samples ?? [];
	for (let i = 0; i < samples.length; i++) {
		const node = byNode.get(samples[i]);
		if (node) node.self += dt[i] ?? 0;
	}
	const top = [...byNode.values()]
		.filter((n) => n.self > 0)
		.sort((a, b) => b.self - a.self)
		.slice(0, 25)
		.map((n) => `${(n.self / 1000).toFixed(1)}ms  ${n.name}  ${n.url}:${n.line + 1}`);
	console.log('[profile] top self-time during 5s of playback:\n' + top.join('\n'));
});
