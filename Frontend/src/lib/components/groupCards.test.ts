import { describe, expect, it } from 'vitest';
import { coverageTotals } from './groupCards';

/** `coverageTotals` rolls a responsibility date's per-role signup counts
 * into the one status the upcoming-date strip and the selected-date badge
 * render. Only `neededCount` / `activeCount` are read. */
describe('coverageTotals', () => {
	it('is empty when no role has any signup', () => {
		const t = coverageTotals([
			{ neededCount: 1, activeCount: 0 },
			{ neededCount: 3, activeCount: 0 }
		]);
		expect(t).toMatchObject({ active: 0, needed: 4, openSlots: 4, status: 'empty' });
		expect(t.filledFraction).toBe(0);
	});

	it('is underfilled when some but not all slots are taken', () => {
		const t = coverageTotals([
			{ neededCount: 1, activeCount: 1 },
			{ neededCount: 3, activeCount: 1 }
		]);
		expect(t).toMatchObject({ active: 2, needed: 4, openSlots: 2, status: 'underfilled' });
		expect(t.filledFraction).toBeCloseTo(0.5);
	});

	it('is covered when every role has exactly its needed count', () => {
		const t = coverageTotals([
			{ neededCount: 1, activeCount: 1 },
			{ neededCount: 2, activeCount: 2 }
		]);
		expect(t).toMatchObject({ active: 3, needed: 3, openSlots: 0, status: 'covered' });
		expect(t.filledFraction).toBe(1);
	});

	it('is overfilled when a role has extras and none is short', () => {
		const t = coverageTotals([
			{ neededCount: 1, activeCount: 1 },
			{ neededCount: 2, activeCount: 4 }
		]);
		expect(t).toMatchObject({ active: 5, needed: 3, openSlots: 0, status: 'overfilled' });
	});

	it('stays underfilled (not overfilled) when one role is short and another has extras', () => {
		const t = coverageTotals([
			{ neededCount: 3, activeCount: 1 },
			{ neededCount: 1, activeCount: 4 }
		]);
		expect(t).toMatchObject({ openSlots: 2, status: 'underfilled' });
	});

	it('treats a role-less date as covered', () => {
		expect(coverageTotals([])).toMatchObject({
			active: 0,
			needed: 0,
			openSlots: 0,
			filledFraction: 1,
			status: 'covered'
		});
	});
});
