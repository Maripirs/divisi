import { test, expect } from '@playwright/test';
import { readProbe } from './helpers/playback';

const PIECE_ID = process.env.E2E_PIECE_ID;

test.skip(!PIECE_ID, 'set E2E_PIECE_ID');

// Not part of the default run (see `grepInvert` in playwright.config.ts).
// Run with: E2E_TOOLS=1 E2E_PIECE_ID=... npx playwright test _diagnose
test('diagnose editor playback main-thread cadence', { tag: '@tools' }, async ({ page }) => {
	await page.goto(`/piece/${PIECE_ID}/edit?e2e=1`);
	await expect(page.locator('.play-btn')).toBeVisible();
	await expect.poll(async () => (await readProbe(page)).phase).toBe('ready');

	await page.locator('.play-btn').click();
	await expect.poll(async () => (await readProbe(page)).isPlaying, { timeout: 20_000 }).toBe(true);

	const report = await page.evaluate(
		() =>
			new Promise<Record<string, unknown>>((resolve) => {
				const rafGaps: number[] = [];
				const intervalGaps: number[] = [];
				let lastRaf = performance.now();
				let lastInt = performance.now();
				const longTasks: number[] = [];
				try {
					new PerformanceObserver((l) => {
						for (const e of l.getEntries()) longTasks.push(Math.round(e.duration));
					}).observe({ entryTypes: ['longtask'] });
				} catch {
					/* not supported */
				}
				const rafLoop = () => {
					const now = performance.now();
					rafGaps.push(Math.round(now - lastRaf));
					lastRaf = now;
					if (now - start < 4000) requestAnimationFrame(rafLoop);
				};
				const intId = setInterval(() => {
					const now = performance.now();
					intervalGaps.push(Math.round(now - lastInt));
					lastInt = now;
				}, 100);
				const start = performance.now();
				requestAnimationFrame(rafLoop);
				setTimeout(() => {
					clearInterval(intId);
					const probe = (
						window as unknown as { __divisiEditorProbe?: () => Record<string, unknown> }
					).__divisiEditorProbe?.();
					resolve({
						hidden: document.hidden,
						rafCount: rafGaps.length,
						rafGapMax: Math.max(...rafGaps),
						rafGapMedian: rafGaps.sort((a, b) => a - b)[rafGaps.length >> 1],
						intervalCount: intervalGaps.length,
						intervalGapMax: Math.max(...intervalGaps),
						longTaskCount: longTasks.length,
						longTaskMax: longTasks.length ? Math.max(...longTasks) : 0,
						longTaskTotal: longTasks.reduce((a, b) => a + b, 0),
						probe
					});
				}, 4200);
			})
	);
	console.log('[diagnose]', JSON.stringify(report, null, 2));
});
