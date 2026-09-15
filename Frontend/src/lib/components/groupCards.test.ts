import { describe, expect, it } from 'vitest';
import { coverageTotals, partitionDatesByUpcoming } from './groupCards';

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

	it('rolls up across role sets when a date carries several', () => {
		// One role set fully covered, another still short — the whole-date
		// meter flat-maps every role set's roles and the date stays
		// underfilled.
		const scheduleGroups = [
			{ scheduleId: 'a', scheduleName: 'Setup', roles: [{ neededCount: 2, activeCount: 2 }] },
			{ scheduleId: 'b', scheduleName: 'Cleanup', roles: [{ neededCount: 3, activeCount: 1 }] }
		];
		const t = coverageTotals(scheduleGroups.flatMap((g) => g.roles));
		expect(t).toMatchObject({ active: 3, needed: 5, openSlots: 2, status: 'underfilled' });
	});
});

/** `partitionDatesByUpcoming` is the shared upcoming/past split used by both
 * the member Responsibilities tab and the guest join page. Dates fixed well
 * outside "now" so the assertions never depend on when the suite runs. */
describe('partitionDatesByUpcoming', () => {
	const past1 = { id: 'p1', date: '2000-01-01T00:00:00Z' };
	const past2 = { id: 'p2', date: '2000-06-01T00:00:00Z' };
	const future1 = { id: 'f1', date: '2999-01-01T00:00:00Z' };
	const future2 = { id: 'f2', date: '2999-06-01T00:00:00Z' };

	it('puts every date in upcoming, soonest-first, when all are in the future', () => {
		const { upcoming, past } = partitionDatesByUpcoming([future2, future1]);
		expect(upcoming).toEqual([future2, future1]);
		expect(past).toEqual([]);
	});

	it('puts every date in past, most-recent-first, when all are in the past', () => {
		const { upcoming, past } = partitionDatesByUpcoming([past1, past2]);
		expect(upcoming).toEqual([]);
		expect(past).toEqual([past2, past1]);
	});

	it('splits a mixed, oldest-first list into soonest-first upcoming and most-recent-first past', () => {
		const { upcoming, past } = partitionDatesByUpcoming([past1, past2, future1, future2]);
		expect(upcoming).toEqual([future1, future2]);
		expect(past).toEqual([past2, past1]);
	});

	it('returns two empty lists for an empty input', () => {
		expect(partitionDatesByUpcoming([])).toEqual({ upcoming: [], past: [] });
	});
});
