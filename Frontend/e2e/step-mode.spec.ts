import { expect, test, type Page } from '@playwright/test';

// Step mode on a real piece: the bundled Lacrymosa demo (SATB + piano),
// drawn by notation-engine (`?renderer=engine`; Step mode does not exist on
// OSMD). Bundled, so it needs no Backend: the test runs logged out, which
// also keeps it independent of whichever Backend `auth.setup.ts` hits.
test.use({ storageState: { cookies: [], origins: [] } });

const PIECE_URL = '/piece/lacrymosa?renderer=engine';

/** "3 / 104" -> [3, 104]. */
async function stepCount(page: Page): Promise<[number, number]> {
	const text = (await page.getByTestId('step-count').textContent()) ?? '';
	const match = text.match(/(\d+)\s*\/\s*(\d+)/);
	expect(match, `unexpected step counter "${text}"`).not.toBeNull();
	return [Number(match![1]), Number(match![2])];
}

/** Where the cursor bar sits in the score's own coordinates (its inline
 * `left`/`top`), which a follow-scroll does not change. */
async function cursorBox(page: Page): Promise<{ x: number; y: number }> {
	const bar = page.locator('[data-renderer="engine"] .cursor-bar');
	await expect(bar, 'no practice cursor bar on the score').toBeVisible();
	return bar.evaluate((el: HTMLElement) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) }));
}

test('steps a real piece forward and back in Step mode', async ({ page }) => {
	await page.goto(PIECE_URL);
	// The engine view has laid the score out once its canvas is there.
	await expect(page.locator('[data-renderer="engine"] canvas')).toBeVisible({ timeout: 30_000 });

	const modes = page.getByRole('group', { name: 'Practice mode' });
	await expect(modes.getByRole('button', { name: 'Pitch' })).toBeDisabled();
	await modes.getByRole('button', { name: 'Step' }).click();
	await expect(modes.getByRole('button', { name: 'Step' })).toHaveAttribute('aria-pressed', 'true');

	// Step mode swaps the transport for previous / replay / next.
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
	const previous = page.getByRole('button', { name: 'Previous note' });
	const next = page.getByRole('button', { name: 'Next note' });
	await expect(page.getByRole('button', { name: 'Play this note again' })).toBeEnabled();

	// One part at a time: the soprano line.
	const partPicker = page.getByRole('combobox', { name: 'Part to step through' });
	await partPicker.selectOption({ label: 'Soprano' });
	await expect(page.getByRole('checkbox', { name: 'Also play the other parts' })).toBeVisible();

	const [first, total] = await stepCount(page);
	expect(first).toBe(1);
	expect(total).toBeGreaterThan(50);
	await expect(previous).toBeDisabled();
	const startBox = await cursorBox(page);

	// Replay sounds the step: the player's `<audio>` element (which carries
	// the synth's output) starts. The sound itself is not checked.
	await page.getByRole('button', { name: 'Play this note again' }).click();
	await expect.poll(() => page.evaluate(() => document.querySelector('audio')?.paused)).toBe(false);

	// Buttons.
	await next.click();
	await next.click();
	expect(await stepCount(page)).toEqual([3, total]);
	await expect(previous).toBeEnabled();
	const movedBox = await cursorBox(page);
	expect(movedBox.x !== startBox.x || movedBox.y !== startBox.y, 'practice cursor did not move').toBe(true);

	// Arrow keys move the practice cursor, even with focus left on a button.
	await page.keyboard.press('ArrowRight');
	expect(await stepCount(page)).toEqual([4, total]);
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('ArrowLeft');
	expect(await stepCount(page)).toEqual([2, total]);
	await previous.click();
	expect(await stepCount(page)).toEqual([1, total]);
	await expect(previous).toBeDisabled();
	const backBox = await cursorBox(page);
	expect([backBox.x, backBox.y]).toEqual([startBox.x, startBox.y]);

	// All parts make a denser walk than one part, from the same place.
	await partPicker.selectOption({ label: 'All parts' });
	await expect(page.getByRole('checkbox', { name: 'Also play the other parts' })).toHaveCount(0);
	const [, allTotal] = await stepCount(page);
	expect(allTotal).toBeGreaterThan(total);

	// Back to Listen: the transport returns.
	await modes.getByRole('button', { name: 'Listen' }).click();
	await expect(page.getByTestId('step-count')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('offers no Step mode on the OSMD renderer', async ({ page }) => {
	await page.goto('/piece/lacrymosa');
	await expect(page.locator('.score-view').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('group', { name: 'Practice mode' })).toHaveCount(0);
});
