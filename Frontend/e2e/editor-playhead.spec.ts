import { test, expect } from '@playwright/test';
import {
	readProbe,
	samplePlayback,
	assertTransportAdvanced,
	assertResponsiveDuringPlayback,
	assertPlayheadMonotonic,
	assertPlayheadTracksTransport,
	assertNoteLevelGranularity,
	assertNoBackwardVisualJump
} from './helpers/playback';

const SAMPLE_WINDOW_MS = 6000;
const SAMPLE_INTERVAL_MS = 120;

// Point this at a piece owned by the test user. For the repeat-barline
// assertion to mean anything the piece must actually contain repeats
// (ideally one generated from a PDF, which is where the desync was found).
const PIECE_ID = process.env.E2E_PIECE_ID;

test.describe('editor playhead <-> audio coordination', () => {
	test.skip(
		!PIECE_ID,
		'Set E2E_PIECE_ID to a piece id owned by the test user (see e2e/README.md).'
	);

	test.beforeEach(async ({ page }) => {
		await page.goto(`/piece/${PIECE_ID}/edit?e2e=1`);
		// The editor mounts client-side; wait for the score surface + probe.
		await expect(page.locator('.play-btn')).toBeVisible();
		await expect.poll(async () => (await readProbe(page)).phase).toBe('ready');
	});

	test('playhead tracks the transport, note-by-note, without back-jumps', async ({ page }) => {
		await page.locator('.play-btn').click();

		// First Play loads the model into the synth, then playback starts.
		await expect
			.poll(async () => (await readProbe(page)).isPlaying, { timeout: 20_000 })
			.toBe(true);
		await expect.poll(async () => (await readProbe(page)).positionMs).toBeGreaterThan(0);

		const samples = await samplePlayback(page, {
			durationMs: SAMPLE_WINDOW_MS,
			intervalMs: SAMPLE_INTERVAL_MS
		});
		await page.locator('.play-btn').click(); // pause

		assertTransportAdvanced(samples);
		// Fix #3: the per-frame gating must actually stop OSMD re-engraving
		// every animation frame — otherwise the playhead position can still be
		// right while the whole UI stalls for seconds at a time.
		assertResponsiveDuringPlayback(samples, {
			windowMs: SAMPLE_WINDOW_MS,
			intervalMs: SAMPLE_INTERVAL_MS
		});
		// Fix #1: SkipInvisibleNotes = false — cursor stops on every note.
		assertNoteLevelGranularity(samples);
		// Fix #2: CursorIgnoreRepetitions = true — no back-jump at end repeats.
		assertPlayheadMonotonic(samples);
		assertNoBackwardVisualJump(samples);
		// Cursor stays pinned to the audio position.
		assertPlayheadTracksTransport(samples);
	});

	test('dragging the playhead bar seeks the audio without starting playback', async ({ page }) => {
		// Play briefly so the synth is loaded and the real base tempo is known,
		// then pause — the drag path should work purely paused.
		await page.locator('.play-btn').click();
		await expect
			.poll(async () => (await readProbe(page)).positionMs, { timeout: 20_000 })
			.toBeGreaterThan(0);
		await page.locator('.play-btn').click();
		await expect.poll(async () => (await readProbe(page)).isPlaying).toBe(false);

		const before = await readProbe(page);
		const bar = page.locator('[data-role="playhead"]');
		const box = await bar.boundingBox();
		expect(box, 'playhead bar has no box — is it shown?').not.toBeNull();

		// Pointer-capture drag: press on the bar, move right in steps so
		// `pointermove` fires, release.
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		for (const dx of [40, 90, 140, 200]) {
			await page.mouse.move(box!.x + dx, box!.y + box!.height / 2, { steps: 4 });
		}
		await page.mouse.up();

		await expect
			.poll(async () => (await readProbe(page)).positionMs)
			.not.toBe(before.positionMs);
		const after = await readProbe(page);
		expect(after.isPlaying, 'a drag must not start playback').toBe(false);
		expect(after.playheadOnset).not.toBe(before.playheadOnset);
	});
});
