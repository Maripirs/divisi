import { test, expect, type Page } from '@playwright/test';

// F17: Measures mode — select a bar range and set its clef. Regression cover
// for the two things that broke first time: bar selection went through
// `findByOnset` (which misfires on a part tacet at the click's onset, so every
// click landed on the same measure), and the range highlight geometry.
//
// Point E2E_PIECE_ID at a multi-part piece owned by the test user (a choral
// piece generated from a PDF is ideal — that's where it was found).
const PIECE_ID = process.env.E2E_PIECE_ID;

type Probe = {
	phase: string;
	editMode: 'note' | 'measures';
	measureSel: { partId: string; staff: number; start: number; end: number } | null;
	selMeasureClef: { sign: string; line: number } | null;
	clefAfterRange: { sign: string; line: number } | null;
	measureBand: { rectCount: number } | null;
};
const probe = (page: Page) =>
	page.evaluate(() => {
		const fn = (window as unknown as { __divisiEditorProbe?: () => unknown }).__divisiEditorProbe;
		return fn ? (fn() as Probe) : null;
	});

// Notehead centres on the first engraved system, left to right.
async function firstSystemNoteXs(page: Page): Promise<{ xs: number[]; y: number }> {
	const heads = page.locator('.score-container svg .vf-notehead');
	await heads.first().waitFor({ state: 'attached', timeout: 15_000 });
	const n = Math.min(await heads.count(), 60);
	const pts: { x: number; y: number }[] = [];
	for (let i = 0; i < n; i++) {
		const b = await heads.nth(i).boundingBox();
		if (b) pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
	}
	if (pts.length === 0) throw new Error('no noteheads rendered');
	const y = pts[0].y;
	const xs = pts
		.filter((p) => Math.abs(p.y - y) < 15)
		.map((p) => p.x)
		.sort((a, b) => a - b);
	return { xs, y };
}

test.describe('editor Measures mode', () => {
	test.skip(!PIECE_ID, 'Set E2E_PIECE_ID to a multi-part piece owned by the test user.');

	test.beforeEach(async ({ page }) => {
		await page.goto(`/piece/${PIECE_ID}/edit?e2e=1`);
		await expect.poll(async () => (await probe(page))?.phase).toBe('ready');
		await page.getByRole('button', { name: 'Measures', exact: true }).click();
		await expect.poll(async () => (await probe(page))?.editMode).toBe('measures');
	});

	test('click + Shift-click selects a bar range, and the highlight follows', async ({ page }) => {
		const { xs, y } = await firstSystemNoteXs(page);
		expect(xs.length).toBeGreaterThan(3);

		await page.mouse.click(xs[0], y);
		const first = await probe(page);
		expect(first?.measureSel?.start).not.toBeNull();
		expect(first?.measureSel?.start).toBe(first?.measureSel?.end); // one bar
		await expect(page.locator('.editor-status')).toContainText(/Measure\s+\d+/);
		await expect(page.locator('.measure-band')).toHaveCount(1);

		await page.keyboard.down('Shift');
		await page.mouse.click(xs[xs.length - 1], y);
		await page.keyboard.up('Shift');

		const range = await probe(page);
		// The far click resolved to a LATER bar — the range actually grew.
		expect(range!.measureSel!.end).toBeGreaterThan(range!.measureSel!.start);
		await expect(page.locator('.editor-status')).toContainText(/Measures\s+\d+.\d+/);
		expect((range!.measureBand as { rectCount: number }).rectCount).toBeGreaterThanOrEqual(1);
	});

	test('a clef preset sets the range and restores the prior clef after it', async ({ page }) => {
		const { xs, y } = await firstSystemNoteXs(page);
		await page.mouse.click(xs[0], y);
		await page.keyboard.down('Shift');
		await page.mouse.click(xs[Math.min(xs.length - 1, 4)], y);
		await page.keyboard.up('Shift');

		const before = await probe(page);
		const startedTreble =
			before?.selMeasureClef?.sign === 'G' && before?.selMeasureClef?.line === 2;
		expect(startedTreble, 'fixture piece should start in treble').toBe(true);

		await page.getByRole('button', { name: 'Bass', exact: true }).click();
		await expect.poll(async () => (await probe(page))?.selMeasureClef?.sign).toBe('F');
		const afterBass = await probe(page);
		expect(afterBass?.selMeasureClef).toEqual({ sign: 'F', line: 4 });
		// The bar after the range keeps the clef it had.
		expect(afterBass?.clefAfterRange).toEqual({ sign: 'G', line: 2 });
		await expect(page.getByRole('button', { name: 'Bass', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);

		// And back.
		await page.getByRole('button', { name: 'Treble', exact: true }).click();
		await expect.poll(async () => (await probe(page))?.selMeasureClef?.sign).toBe('G');
	});

	test('note-level toolbars are hidden in Measures mode; Escape returns', async ({ page }) => {
		await expect(page.getByRole('button', { name: 'Delete note' })).toHaveCount(0);
		await expect(page.locator('.editor-clef-row')).toContainText('Clef for the selected bars');

		await page.locator('.editor-surface').focus();
		await page.keyboard.press('Escape');
		await expect.poll(async () => (await probe(page))?.editMode).toBe('note');
		await expect(page.getByRole('button', { name: 'Delete note' })).toHaveCount(1);
	});
});
