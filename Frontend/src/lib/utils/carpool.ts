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

/** F35: the driver/rider post forms' optional lat/lng/place-id/precision
 * fields (a form's hidden inputs, or a guest proxy's JSON body) reduced to
 * the partial Backend payload shape `CarpoolPostCreate`/`CarpoolPostUpdate`
 * accept. Raw field values come in as strings (hidden `<input>`s), numbers
 * (a guest proxy's already-parsed JSON body), or are simply absent (no
 * place was ever picked, either because Places wasn't available at all or
 * the user never opened the autocomplete dropdown). This normalizes all
 * three into one shape so every call site (member form action, guest
 * proxy route) shares the same coercion instead of repeating it.
 *
 * Returns an empty object (no keys at all) whenever there's no usable
 * coordinate pair, so spreading this into a JSON body never sends a
 * half-set pair the Backend's own validator would reject, and never
 * regresses a plain free-text submission into sending `null` coordinates
 * where today it sends nothing. `precision` defaults to `'approximate'`
 * whenever real coordinates are present but no exact choice was recorded,
 * matching the Backend's own default (see `CarpoolPostCreate`'s doc
 * comment on `origin_precision`). */
export interface OriginCoordinatesInput {
	latitude?: string | number | null;
	longitude?: string | number | null;
	placeId?: string | null;
	precision?: string | null;
}

export interface OriginCoordinatesPayload {
	origin_latitude?: number;
	origin_longitude?: number;
	origin_place_id?: string;
	origin_precision?: 'exact' | 'approximate';
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

export function originCoordinatesPayload(input: OriginCoordinatesInput): OriginCoordinatesPayload {
	const latitude = toFiniteNumber(input.latitude);
	const longitude = toFiniteNumber(input.longitude);
	if (latitude === null || longitude === null) return {};
	const payload: OriginCoordinatesPayload = {
		origin_latitude: latitude,
		origin_longitude: longitude,
		origin_precision: input.precision === 'exact' ? 'exact' : 'approximate'
	};
	if (input.placeId) payload.origin_place_id = input.placeId;
	return payload;
}

/** Same shape as `originCoordinatesPayload` above, for the admin event
 * create/edit form's destination pin: no `precision` here at all, since
 * `destination_*` is never privacy-rounded (see `CarpoolEventCreate`'s doc
 * comment): a venue pin has nothing to be "approximate" about. */
export interface DestinationCoordinatesInput {
	latitude?: string | number | null;
	longitude?: string | number | null;
	placeId?: string | null;
}

export interface DestinationCoordinatesPayload {
	destination_latitude?: number;
	destination_longitude?: number;
	destination_place_id?: string;
}

export function destinationCoordinatesPayload(input: DestinationCoordinatesInput): DestinationCoordinatesPayload {
	const latitude = toFiniteNumber(input.latitude);
	const longitude = toFiniteNumber(input.longitude);
	if (latitude === null || longitude === null) return {};
	const payload: DestinationCoordinatesPayload = { destination_latitude: latitude, destination_longitude: longitude };
	if (input.placeId) payload.destination_place_id = input.placeId;
	return payload;
}

/** B26/F32: which event a load should show when the caller didn't pick one
 * via `?event=`. A requested id that matches a real event always wins;
 * otherwise the standing event wins over "first by `starts_at`", which
 * stopped making sense once a `null` `starts_at` joined the list. Shared by
 * the member and guest `+page.server.ts` loads (identical logic, different
 * event types) rather than duplicated per route. */
export function selectDefaultCarpoolEventId<T extends { id: string; is_standing: boolean }>(
	events: T[],
	requestedId: string | null
): string | null {
	return (
		events.find((e) => e.id === requestedId)?.id ??
		events.find((e) => e.is_standing)?.id ??
		events[0]?.id ??
		null
	);
}
