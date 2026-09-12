import { fail } from '@sveltejs/kit';
import { backendFetch } from '$lib/server/backend';
import { datetimeLocalToIso } from '$lib/utils/dates';
import { driverOfferError, eventFieldsMissing, riderRequestError } from '$lib/utils/carpool';
import { m } from '$lib/paraglide/messages';
import type { Actions } from '../$types';
// Reuses the same `runAction` tail the group page's own action files share
// (see its own doc comment) rather than a second copy of 12 identical lines.
import { runAction } from '../../../actions/_shared';

/** B24/F28: form actions for one carpool board (`routes/groups/[id]/pages/
 * [slug]`). Every Backend route these call requires a real bearer-
 * authenticated member (no guest carpool routes exist at all), which this
 * route already guarantees via its own `load`.
 *
 * `pageId`/`eventId`/`postId` all travel as hidden form fields rather than
 * route params: this route's own params are only `{ id, slug }`, and the
 * carpool routes nest under the custom page's real id (`GroupCustomPage.id`,
 * not the slug) or address an event/post directly once the caller has that
 * id, same "no group/page prefix once you have an id" shape the Backend
 * router itself documents. */
export const carpoolActions = {
	// Admin-only, Backend-enforced (403 surfaces via `runAction`).
	createCarpoolEvent: async ({ request, locals, fetch, params }) => {
		const form = await request.formData();
		const pageId = String(form.get('pageId') ?? '');
		const title = String(form.get('title') ?? '').trim();
		const startsAt = String(form.get('startsAt') ?? '');
		const destinationLabel = String(form.get('destinationLabel') ?? '').trim();
		if (!pageId || eventFieldsMissing(title, startsAt, destinationLabel)) {
			return fail(400, { error: m.carpool_fill_event_fields(), form: 'createEvent' });
		}

		return runAction('createEvent', () =>
			backendFetch(
				locals.token,
				`/groups/${params.id}/pages/${pageId}/carpool/events`,
				{
					method: 'POST',
					body: JSON.stringify({
						title,
						starts_at: datetimeLocalToIso(startsAt),
						destination_label: destinationLabel
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
		} = {};
		if (form.has('title')) body.title = String(form.get('title') ?? '').trim();
		if (form.has('startsAt')) body.starts_at = datetimeLocalToIso(String(form.get('startsAt') ?? ''));
		if (form.has('destinationLabel')) body.destination_label = String(form.get('destinationLabel') ?? '').trim();
		if (form.has('status')) body.status = String(form.get('status') ?? '');

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
		if (!eventId) return fail(400, { error: m.carpool_missing_event(), form: 'offerRide' });
		const invalid = driverOfferError(originLabel, Number.isNaN(seatsTotal) ? null : seatsTotal);
		if (invalid) {
			return fail(400, {
				error: invalid === 'seats' ? m.carpool_driver_needs_seats() : m.carpool_enter_origin(),
				form: 'offerRide'
			});
		}

		return runAction('offerRide', () =>
			backendFetch(
				locals.token,
				`/carpool/events/${eventId}/posts`,
				{
					method: 'POST',
					body: JSON.stringify({
						kind: 'driver',
						origin_label: originLabel,
						seats_total: seatsTotal,
						leave_time_text: leaveTimeText || null,
						notes: notes || null
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
		if (!eventId) return fail(400, { error: m.carpool_missing_event(), form: 'requestRide' });
		if (riderRequestError(originLabel)) {
			return fail(400, { error: m.carpool_enter_origin(), form: 'requestRide' });
		}

		return runAction('requestRide', () =>
			backendFetch(
				locals.token,
				`/carpool/events/${eventId}/posts`,
				{ method: 'POST', body: JSON.stringify({ kind: 'rider', origin_label: originLabel, notes: notes || null }) },
				fetch
			)
		);
	},

	// Owner edits their own post's content (origin/seats/leave-time/notes).
	// Admin moderation (`status`) goes through `moderateCarpoolPost` below,
	// kept as a separate action so this form can never accidentally flip it.
	updateCarpoolPost: async ({ request, locals, fetch }) => {
		const form = await request.formData();
		const postId = String(form.get('postId') ?? '');
		if (!postId) return fail(400, { error: m.carpool_missing_post(), form: 'editPost' });

		const body: {
			origin_label?: string;
			seats_total?: number | null;
			leave_time_text?: string | null;
			notes?: string | null;
		} = {};
		if (form.has('originLabel')) body.origin_label = String(form.get('originLabel') ?? '').trim();
		if (form.has('seatsTotal')) {
			const raw = String(form.get('seatsTotal') ?? '').trim();
			body.seats_total = raw ? Number(raw) : null;
		}
		if (form.has('leaveTimeText')) body.leave_time_text = String(form.get('leaveTimeText') ?? '').trim() || null;
		if (form.has('notes')) body.notes = String(form.get('notes') ?? '').trim() || null;

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
	}
} satisfies Actions;
