// Shared date formatters for the group site, the guest (join) site, and
// Home — three pages that render the same homework / weekly-note /
// responsibility data and previously each carried their own byte-identical
// copies of these.
//
// The one distinction worth keeping straight is UTC vs. local, and it maps
// to what the value *means*, not to which page shows it:
//
//   * A **calendar date** — a homework due date, a weekly-note date — has
//     no time-of-day. The Backend stores it round-tripped through
//     `new Date(...).toISOString()` as UTC midnight, so it MUST be read
//     back with `timeZone: 'UTC'`; local-time conversion rolls it back a
//     whole calendar day in any timezone behind UTC (caught live: a Sept 2
//     due date rendering as "Sep 1", a Sept 1 note as "Aug 31").
//   * An **event date** — a responsibility pinned to a specific rehearsal
//     hour, a "distributed at" timestamp — is a real instant, and showing
//     it in the viewer's local timezone is exactly right.

const MONTH_DAY = { month: 'short', day: 'numeric' } as const;

/**
 * A plain calendar date (homework due date, weekly-note date). Pinned to
 * UTC — see the module comment. `null`/empty → `fallback` (callers pass
 * `m.home_no_due_date()` where a missing date is meaningful).
 */
export function formatCalendarDate(iso: string | null | undefined, fallback = ''): string {
	if (!iso) return fallback;
	return new Date(iso).toLocaleDateString(undefined, { ...MONTH_DAY, timeZone: 'UTC' });
}

/**
 * The date part of a real timestamp (a time-anchored responsibility, a
 * "shared on" date) — rendered in the viewer's local timezone.
 */
export function formatEventDate(iso: string | null | undefined, fallback = ''): string {
	if (!iso) return fallback;
	return new Date(iso).toLocaleDateString(undefined, MONTH_DAY);
}

/** A real timestamp as local date + time ("Sep 2, 7:30 PM"). */
export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		...MONTH_DAY,
		hour: 'numeric',
		minute: '2-digit'
	});
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DD` for prefilling `<input type="date">`. Uses UTC getters to
 * match `formatCalendarDate` — the value round-trips as UTC midnight, so
 * local getters could roll the date a day off in a UTC-behind zone.
 */
export function toDateInputValue(iso: string): string {
	const d = new Date(iso);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * `YYYY-MM-DDTHH:mm` in the browser's local time for prefilling
 * `<input type="datetime-local">` (which ignores the ISO string's own UTC
 * offset).
 */
export function toDatetimeLocalValue(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
