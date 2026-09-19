import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { datetimeLocalToIso } from '$lib/utils/dates';
import {
	destinationCoordinatesPayload,
	driverOfferError,
	eventFieldsMissing,
	originCoordinatesPayload,
	riderRequestError
} from '$lib/utils/carpool';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
import { runAction } from './_shared';

/** B24/F28/B31/F36: form actions for the group's built-in carpool page
 * (`routes/groups/[id]`, moved here from the old `pages/[slug]/actions/
 * carpool.ts` once carpool stopped being a `GroupCustomPage` and became a
 * plain `GroupPage` like every other built-in tab). Every Backend route
 * these call requires a real bearer-authenticated member (no guest carpool
 * write routes exist here — those live behind `join/[code]/carpool/...`'s
 * own proxies instead).
 *
 * `eventId`/`postId` etc. still travel as hidden form fields rather than
 * route params: this route's own params are only `{ id }` (the group), and
 * the carpool routes address an event/post directly by id once the caller
 * has it, same "no group prefix once you have an id" shape the Backend
 * router itself documents. Creating an event is the one exception — it's
 * genuinely group-scoped (`/groups/{id}/carpool/events`), so it uses
 * `params.id` directly instead of a hidden `pageId` field the old
 * custom-page version needed (there's no more per-page id to carry). */
export const carpoolActions = {
	// Admin-only, Backend-enforced (403 surfaces via `runAction`).
	createCarpoolEvent: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const startsAt = String(form.get('startsAt') ?? '');
		const destinationLabel = String(form.get('destinationLabel') ?? '').trim();
		if (eventFieldsMissing(title, startsAt, destinationLabel)) {
			return fail(400, { error: m.carpool_fill_event_fields(), form: 'createEvent' });
		}

		// F35: the destination pin is optional (only present when the admin
		// actually picked a place via Places Autocomplete on `destinationLabel`,
		// see `CarpoolBoard.svelte`); `destinationCoordinatesPayload` returns
		// no keys at all when there's nothing to send, same as today.
		return runAction('createEvent', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/carpool/events`,
				{
					method: 'POST',
					body: JSON.stringify({
						title,
						starts_at: datetimeLocalToIso(startsAt),
						destination_label: destinationLabel,
						...destinationCoordinatesPayload({
							latitude: form.get('destinationLatitude') as string | null,
							longitude: form.get('destinationLongitude') as string | null,
							placeId: form.get('destinationPlaceId') as string | null
						})
					})
				},
				fetch
			)
		);
	},

	// Covers the edit form and the Lock/Unlock/Archive buttons below: each
	// caller only sends the field(s) it's actually changing, one partial
	// PATCH either way (same convention as `updateResponsibilityDate`).
	updateCarpoolEvent: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const eventId = String(form.get('eventId') ?? '');
		if (!eventId) return fail(400, { error: m.carpool_missing_event(), form: 'editEvent' });

		const body: {
			title?: string;
			starts_at?: string;
			destination_label?: string;
			status?: string;
			destination_latitude?: number;
			destination_longitude?: number;
			destination_place_id?: string;
		} = {};
		if (form.has('title')) body.title = String(form.get('title') ?? '').trim();
		if (form.has('startsAt')) body.starts_at = datetimeLocalToIso(String(form.get('startsAt') ?? ''));
		if (form.has('destinationLabel')) body.destination_label = String(form.get('destinationLabel') ?? '').trim();
		if (form.has('status')) body.status = String(form.get('status') ?? '');
		// F35: only touches the destination pin when the edit form's hidden
		// fields are actually present, i.e. the admin re-picked a place via
		// Places Autocomplete this submit (see `CarpoolBoard.svelte`). Same
		// "only what this patch actually sent" convention every other
		// optional field on this partial patch already follows: leaving
		// `destinationLabel` text unchanged with no new pin picked keeps
		// whatever coordinates were already stored, it doesn't clear them.
		if (form.has('destinationLatitude')) {
			Object.assign(
				body,
				destinationCoordinatesPayload({
					latitude: form.get('destinationLatitude') as string | null,
					longitude: form.get('destinationLongitude') as string | null,
					placeId: form.get('destinationPlaceId') as string | null
				})
			);
		}

		return runAction('editEvent', () =>
			backendFetch(locals.token, `/carpool/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(body) }, fetch)
		);
	},

	// "I can drive". Riders use `requestRide` below instead of a shared
	// action with a `kind` switch: the Backend rejects a rider payload that
	// carries seat fields at all (`CarpoolPostCreate`'s validator), so
	// keeping the two forms/actions separate means neither ever has to
	// remember to omit fields the other needs.
	offerRide: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const eventId = String(form.get('eventId') ?? '');
		const originLabel = String(form.get('originLabel') ?? '').trim();
		const seatsTotal = Number(form.get('seatsTotal'));
		const leaveTimeText = String(form.get('leaveTimeText') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const contactPhone = String(form.get('contactPhone') ?? '').trim();
		const contactEmail = String(form.get('contactEmail') ?? '').trim();
		// B32/F37: There / Back / Round trip, defaulting to round trip when
		// the form somehow omits it (matches the Backend's own
		// `CarpoolPostCreate.direction` default).
		const direction = String(form.get('direction') ?? 'round_trip');
		if (!eventId) return fail(400, { error: m.carpool_missing_event(), form: 'offerRide' });
		const invalid = driverOfferError(originLabel, Number.isNaN(seatsTotal) ? null : seatsTotal);
		if (invalid) {
			return fail(400, {
				error: invalid === 'seats' ? m.carpool_driver_needs_seats() : m.carpool_enter_origin(),
				form: 'offerRide'
			});
		}

		// F35: `originCoordinatesPayload` returns no keys at all unless the
		// member actually picked a place via Places Autocomplete on this
		// form's origin field (see `CarpoolBoard.svelte`'s hidden
		// `originLatitude`/`originLongitude`/`originPlaceId`/`originPrecision`
		// inputs), so a plain free-text submission (Maps unconfigured, or the
		// member just typed a label) behaves exactly as it did before.
		return runAction('offerRide', () =>
			backendFetch(
				locals.token,
				`/carpool/events/${eventId}/posts`,
				{
					method: 'POST',
					body: JSON.stringify({
						kind: 'driver',
						direction,
						origin_label: originLabel,
						seats_total: seatsTotal,
						leave_time_text: leaveTimeText || null,
						notes: notes || null,
						contact_phone: contactPhone || null,
						contact_email: contactEmail || null,
						...originCoordinatesPayload({
							latitude: form.get('originLatitude') as string | null,
							longitude: form.get('originLongitude') as string | null,
							placeId: form.get('originPlaceId') as string | null,
							precision: form.get('originPrecision') as string | null
						})
					})
				},
				fetch
			)
		);
	},

	// "I need a ride": no seat fields at all on this form.
	requestRide: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const eventId = String(form.get('eventId') ?? '');
		const originLabel = String(form.get('originLabel') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const contactPhone = String(form.get('contactPhone') ?? '').trim();
		const contactEmail = String(form.get('contactEmail') ?? '').trim();
		const direction = String(form.get('direction') ?? 'round_trip');
		if (!eventId) return fail(400, { error: m.carpool_missing_event(), form: 'requestRide' });
		if (riderRequestError(originLabel)) {
			return fail(400, { error: m.carpool_enter_origin(), form: 'requestRide' });
		}

		return runAction('requestRide', () =>
			backendFetch(
				locals.token,
				`/carpool/events/${eventId}/posts`,
				{
					method: 'POST',
					body: JSON.stringify({
						kind: 'rider',
						direction,
						origin_label: originLabel,
						notes: notes || null,
						contact_phone: contactPhone || null,
						contact_email: contactEmail || null,
						...originCoordinatesPayload({
							latitude: form.get('originLatitude') as string | null,
							longitude: form.get('originLongitude') as string | null,
							placeId: form.get('originPlaceId') as string | null,
							precision: form.get('originPrecision') as string | null
						})
					})
				},
				fetch
			)
		);
	},

	// Owner edits their own post's content (direction/origin/seats/leave-time/
	// notes/contact phone). Admin moderation (`status`) goes through
	// `moderateCarpoolPost` below, kept as a separate action so this form
	// can never accidentally flip it.
	updateCarpoolPost: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const postId = String(form.get('postId') ?? '');
		if (!postId) return fail(400, { error: m.carpool_missing_post(), form: 'editPost' });

		const body: {
			direction?: string;
			origin_label?: string;
			seats_total?: number | null;
			leave_time_text?: string | null;
			notes?: string | null;
			contact_phone?: string | null;
			contact_email?: string | null;
		} = {};
		if (form.has('direction')) body.direction = String(form.get('direction') ?? 'round_trip');
		if (form.has('originLabel')) body.origin_label = String(form.get('originLabel') ?? '').trim();
		if (form.has('seatsTotal')) {
			const raw = String(form.get('seatsTotal') ?? '').trim();
			body.seats_total = raw ? Number(raw) : null;
		}
		if (form.has('leaveTimeText')) body.leave_time_text = String(form.get('leaveTimeText') ?? '').trim() || null;
		if (form.has('notes')) body.notes = String(form.get('notes') ?? '').trim() || null;
		if (form.has('contactPhone')) body.contact_phone = String(form.get('contactPhone') ?? '').trim() || null;
		if (form.has('contactEmail')) body.contact_email = String(form.get('contactEmail') ?? '').trim() || null;

		return runAction('editPost', () =>
			backendFetch(locals.token, `/carpool/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(body) }, fetch)
		);
	},

	// Admin-only, Backend-enforced: hide/unhide a post without touching its
	// content.
	moderateCarpoolPost: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const postId = String(form.get('postId') ?? '');
		const status = String(form.get('status') ?? '');
		if (!postId || !status) return fail(400, { error: m.carpool_missing_post(), form: 'moderatePost' });

		return runAction('moderatePost', () =>
			backendFetch(locals.token, `/carpool/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ status }) }, fetch)
		);
	},

	// Shared by an owner withdrawing their own post and an admin removing
	// anyone's. The Backend applies the ownership/admin check itself, and
	// (deliberately, per its own docstring) never blocks this on a locked
	// or archived event the way it blocks new posts and edits.
	deleteCarpoolPost: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const postId = String(form.get('postId') ?? '');
		if (!postId) return fail(400, { error: m.carpool_missing_post(), form: 'editPost' });

		return runAction('editPost', () => backendFetch(locals.token, `/carpool/posts/${postId}`, { method: 'DELETE' }, fetch));
	},

	// F33/B27: claim one seat on a driver's post. No body fields at all for
	// a bearer member (identity comes from the token, same as `offerRide`);
	// the Backend's own rejections (wrong kind, full, already claimed, event
	// locked) all surface as `BackendApiError` via `runAction`. `form` is
	// keyed by the post id rather than a fixed string so a rejection on one
	// driver post's claim button doesn't render under a different one.
	claimSeat: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const driverPostId = String(form.get('driverPostId') ?? '');
		if (!driverPostId) return fail(400, { error: m.carpool_missing_post(), form: 'claimSeat' });

		return runAction(`claimSeat:${driverPostId}`, () =>
			backendFetch(locals.token, `/carpool/posts/${driverPostId}/claims`, { method: 'POST', body: JSON.stringify({}) }, fetch)
		);
	},

	// The claimant, the driver post's own owner, or an admin may release a
	// seat; the Backend 403s anyone else. Same per-row `form` keying as
	// `claimSeat` above, keyed by the claim id instead since that's what
	// identifies the specific "Release your seat" button that was clicked.
	releaseSeat: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const claimId = String(form.get('claimId') ?? '');
		if (!claimId) return fail(400, { error: m.carpool_missing_claim(), form: 'releaseSeat' });

		return runAction(`releaseSeat:${claimId}`, () =>
			backendFetch(locals.token, `/carpool/claims/${claimId}`, { method: 'DELETE' }, fetch)
		);
	},

	// B30: the rider-post mirror of `claimSeat` — a driver expressing
	// interest in a rider's request, since a rider's post has no seats to
	// claim. Same shape (no body fields for a bearer member, `form` keyed by
	// the post id) and the same Backend rejections (wrong kind, own post,
	// already interested, event locked) surfacing via `runAction`.
	expressInterest: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const riderPostId = String(form.get('riderPostId') ?? '');
		if (!riderPostId) return fail(400, { error: m.carpool_missing_post(), form: 'expressInterest' });

		return runAction(`expressInterest:${riderPostId}`, () =>
			backendFetch(
				locals.token,
				`/carpool/posts/${riderPostId}/interests`,
				{ method: 'POST', body: JSON.stringify({}) },
				fetch
			)
		);
	},

	// The interested party, the rider post's own owner, or an admin may
	// release an interest; the Backend 403s anyone else. Same per-row `form`
	// keying as `releaseSeat`, keyed by the interest id.
	releaseInterest: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const interestId = String(form.get('interestId') ?? '');
		if (!interestId) return fail(400, { error: m.carpool_missing_interest(), form: 'releaseInterest' });

		return runAction(`releaseInterest:${interestId}`, () =>
			backendFetch(locals.token, `/carpool/interests/${interestId}`, { method: 'DELETE' }, fetch)
		);
	}
} satisfies Actions;
