// F28: pure validation for the carpool board's two post forms, mirroring
// the Backend's own `CarpoolPostCreate` model validator
// (`Backend/app/api/schemas/carpool.py`) so a bad submission gets a clear
// inline error before it ever reaches the network. Framework-free on
// purpose so it's directly unit-testable; the form actions
// (`routes/groups/[id]/pages/[slug]/actions/carpool.ts`) call these and map
// the result onto a translated message.

export type DriverOfferError = 'origin' | 'seats' | null;

/** A driver post needs a real origin label and at least 1 seat, same floor
 * as the Backend's "Drivers must offer at least 1 seat". */
export function driverOfferError(originLabel: string, seatsTotal: number | null): DriverOfferError {
	if (!originLabel.trim()) return 'origin';
	if (seatsTotal === null || Number.isNaN(seatsTotal) || seatsTotal < 1) return 'seats';
	return null;
}

export type RiderRequestError = 'origin' | null;

/** A rider post only ever needs an origin label: no seat fields exist on
 * this form at all, so there's nothing else to reject client-side (the
 * Backend's "riders don't set seat counts" check has no client-side
 * equivalent to make since this form never sends those fields). */
export function riderRequestError(originLabel: string): RiderRequestError {
	return originLabel.trim() ? null : 'origin';
}

/** Admin event create/edit form: title, a real date/time, and a destination
 * label are all required. */
export function eventFieldsMissing(title: string, startsAt: string, destinationLabel: string): boolean {
	return !title.trim() || !startsAt.trim() || !destinationLabel.trim();
}
