import { m } from '$lib/paraglide/messages';

// `Group.rehearsal_weekday` is 0=Monday..6=Sunday (matches Python's
// `date.weekday()`, what the Backend stores) — distinct from JS's own
// `Date.getDay()`, which is 0=Sunday..6=Saturday. Every place below that
// converts between the two says so explicitly.
export const WEEKDAY_LABELS = [m.weekday_monday, m.weekday_tuesday, m.weekday_wednesday, m.weekday_thursday, m.weekday_friday, m.weekday_saturday, m.weekday_sunday];
// Plural/"on Wednesdays"-shaped form for the rendered schedule sentence
// below — kept as separate messages rather than an English-only "+s"
// suffix rule, since that doesn't hold in Spanish (e.g. "miércoles" is
// already both singular and plural).
export const WEEKDAY_PLURAL_LABELS = [m.weekday_mondays, m.weekday_tuesdays, m.weekday_wednesdays, m.weekday_thursdays, m.weekday_fridays, m.weekday_saturdays, m.weekday_sundays];

export function formatRehearsalSchedule(weekday: number, time: string): string {
	const [hours, minutes] = time.split(':').map(Number);
	const sample = new Date(2026, 0, 1, hours, minutes); // any date — only the time-of-day is used
	const timeLabel = sample.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	return m.rehearsal_schedule_label({ weekday: WEEKDAY_PLURAL_LABELS[weekday](), time: timeLabel });
}

// The Responsibilities tab's "Next rehearsal" quick-fill: the next
// upcoming occurrence of `weekday`/`time` (both wall-clock, no timezone
// stored — see `Group.rehearsal_weekday`'s doc comment), computed
// entirely against the browser's own local clock, formatted for direct
// use as a `datetime-local` input value. "Today, but the time already
// passed" rolls to next week rather than showing a moment in the past.
export function nextRehearsalDatetimeLocal(weekday: number, time: string): string {
	const [hours, minutes] = time.split(':').map(Number);
	const now = new Date();
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
	const jsTargetDay = (weekday + 1) % 7; // Mon=0..Sun=6 -> Sun=0..Sat=6
	let daysUntil = (jsTargetDay - next.getDay() + 7) % 7;
	if (daysUntil === 0 && next.getTime() <= now.getTime()) daysUntil = 7;
	next.setDate(next.getDate() + daysUntil);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}
