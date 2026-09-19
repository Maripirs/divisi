<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import CarpoolDirectionTabs from './CarpoolDirectionTabs.svelte';
	import CarpoolEventCreateForm from './CarpoolEventCreateForm.svelte';
	import CarpoolEventEditForm from './CarpoolEventEditForm.svelte';
	import CarpoolEventStrip from './CarpoolEventStrip.svelte';
	import CarpoolEventSummary from './CarpoolEventSummary.svelte';
	import CarpoolDriverClaimActions from './CarpoolDriverClaimActions.svelte';
	import CarpoolGuestNamePrompt from './CarpoolGuestNamePrompt.svelte';
	import CarpoolMap from './CarpoolMap.svelte';
	import CarpoolOriginHiddenFields from './CarpoolOriginHiddenFields.svelte';
	import CarpoolPostActions from './CarpoolPostActions.svelte';
	import CarpoolPostDetails from './CarpoolPostDetails.svelte';
	import CarpoolPostEditForm from './CarpoolPostEditForm.svelte';
	import CarpoolRiderInterestActions from './CarpoolRiderInterestActions.svelte';
	import CarpoolSaveRequiredNotice from './CarpoolSaveRequiredNotice.svelte';
	import { formatDateTime } from '$lib/utils/dates';
	import {
		contactEmailError,
		driverOfferError,
		postMatchesDirection,
		riderRequestError,
		type CarpoolDirectionFilter
	} from '$lib/utils/carpool';
	import {
		forgetCarpoolClaim,
		forgetCarpoolInterest,
		isOwnedCarpoolClaim,
		isOwnedCarpoolInterest,
		isOwnedCarpoolPost,
		rememberCarpoolClaim,
		rememberCarpoolInterest,
		rememberCarpoolPost
	} from '$lib/utils/carpoolOwnership';
	import { ensureLocalId, localProfile, markSignedUp, needsName, setDisplayName } from '$lib/localProfile';
	import { loadGoogleMaps, type GoogleMapsHandle } from '$lib/utils/googleMaps';
	import { googlePlacesAutocomplete, type PlaceSelection } from '$lib/actions/googlePlaces';
	import { m } from '$lib/paraglide/messages';
	import type {
		CarpoolEventOut,
		CarpoolPostDirection,
		CarpoolPostOut,
		CarpoolRiderInterestOut,
		CarpoolSeatClaimOut
	} from '$lib/server/backendTypes';

	/** B24/F28/B31/F36: the real content behind the group's built-in carpool
	 * page (event selector, driver/rider lists, the "I can drive"/"I need a
	 * ride" forms, owner edit/delete, and, for an admin, event create/edit/
	 * lock/archive plus post moderation). Rendered directly by `routes/
	 * groups/[id]/tabs/CarpoolTab.svelte`, one plain tab like every other
	 * builtin — there's no more custom-page id to carry: `createCarpoolEvent`
	 * (`actions/carpool.ts`) reads the group id straight off that route's own
	 * `params.id` instead of a hidden form field.
	 *
	 * F29/B25: the `guest` prop is what a guest render passes (`routes/
	 * join/[code]/+page.svelte`) instead of leaving it unset. Its presence
	 * swaps every write control's mechanics from a SvelteKit form action
	 * (`use:enhance` against `?/offerRide` etc., resolved by the group
	 * route's own `+page.server.ts`) to a plain `fetch` against the
	 * `/join/[code]/carpool/...` proxy routes, since a guest write needs the
	 * local profile's name/`local_id` and the lazy name-prompt/`SAVE_REQUIRED`
	 * handling those proxies (and only those) carry — the same reason the
	 * guest join page's own responsibility self-signup isn't a form action
	 * either. `isAdmin` is always `false` for a guest (never true), so every
	 * admin-only block below already stays hidden with no `guest`-specific
	 * branch needed.
	 *
	 * `form`/`ActionData` is typed loosely rather than imported from this
	 * route's own `./$types`, so this component stays a plain, reusable
	 * `$lib` piece rather than one tied to a specific route's generated
	 * types.
	 *
	 * F35 (Carpool Map): there's no admin on/off toggle for the map. Maps
	 * always attempts to load once this board mounts; whether anything
	 * actually renders comes down to `mapsAvailable` below (the loader
	 * resolved a real handle: a real api key configured, script actually
	 * reachable) and, inside `CarpoolMap` itself, whether the selected
	 * event/posts have a real pin to show at all (`hasAnyPin`). So this
	 * component falls back to today's list-only layout whenever Maps isn't
	 * usable or there's simply nothing to put a pin on.
	 *
	 * B32/F37: the driver/rider lists only ever show one of the two toggle
	 * states at a time. A round-trip post matches either state
	 * (`postMatchesDirection`, `$lib/utils/carpool.ts`), so it's never
	 * actually hidden by this toggle. `directionFilter` defaulted to
	 * `'there'` under F37 ("there" reads naturally as the first leg); human
	 * feedback 2026-09-14 flipped the default to `'back'` instead, since the
	 * ride-home leg is the one people actually open the board to check.
	 *
	 * F40 briefly replaced this exclusive toggle with per-card auto-grouping
	 * (a flat list when every post was round trip, "Getting there"/"Getting
	 * home" subsections the moment a one-way post appeared). Human feedback:
	 * the board's shape changing depending on what other people posted read
	 * as inconsistent. F41 reverts to this explicit toggle, F37's shape, and
	 * fixes the one thing F37 never covered: the map used to always plot
	 * every pin regardless of which leg was selected, since it read from an
	 * unfiltered `posts` array; now that `drivers`/`riders` are filtered by
	 * `directionFilter` again, `CarpoolMap` inherits that filtering for
	 * free, see the `drivers`/`riders` `$derived`s below. */
	let {
		isAdmin,
		userId,
		userName = null,
		events,
		selectedEventId,
		posts,
		form,
		guest = null
	}: {
		isAdmin: boolean;
		userId: string;
		/** A member's own account name, shown as "Posting as {name}" on the
		 * offer/request forms so it's clear which name a post will carry
		 * (`display_name` comes from the Backend session, not a form field,
		 * see `CarpoolPostCreate`). `null` for a guest, whose name instead
		 * comes reactively from `localProfile` below, since it can change
		 * mid-session (the lazy name prompt) in a way a member's account
		 * name never does. */
		userName?: string | null;
		events: CarpoolEventOut[];
		selectedEventId: string | null;
		posts: CarpoolPostOut[];
		form: { form?: string; error?: string } | null;
		guest?: { code: string } | null;
	} = $props();

	let isGuest = $derived(guest !== null);
	// Shown as "Posting as {name}" right on the offer/request forms: a
	// member's name never changes mid-session, but a guest's does the
	// moment the lazy name prompt below sets it, so this has to stay
	// reactive to the store rather than read once.
	let postingAsName = $derived(isGuest ? $localProfile.displayName : (userName ?? ''));

	let selectedEvent = $derived(events.find((e) => e.id === selectedEventId) ?? null);

	// F41: "On the way there" / "On the way home" toggle above the map and
	// the driver/rider lists, filtering the already-fetched `posts` array
	// client-side (`postMatchesDirection`) rather than a second round trip —
	// a round-trip post matches either state, so it's never hidden by this.
	// `CarpoolMap` below is passed these same filtered arrays, so the map's
	// pins respect the toggle too (F37 never did this; F40 accidentally did,
	// as a side effect of its own since-reverted filtering, so F41 makes it
	// deliberate).
	let directionFilter = $state<CarpoolDirectionFilter>('back');
	let drivers = $derived(
		posts.filter((p) => p.kind === 'driver' && postMatchesDirection(p.direction, directionFilter))
	);
	let riders = $derived(posts.filter((p) => p.kind === 'rider' && postMatchesDirection(p.direction, directionFilter)));
	// Admin always bypasses the lock/archive gate when posting (the Backend
	// does the same); a member can only post to a genuinely open event.
	let canPost = $derived(isAdmin || selectedEvent?.status === 'open');

	// --- F35 map state -----------------------------------------------------
	// Loaded once, lazily, on mount: never at import time (see `googleMaps.ts`'s
	// own doc comment on the loader's "singleton, on-demand" contract). No
	// admin toggle gates this attempt any more; a missing/unreachable api key
	// just resolves to `false` below like any other carpool board would.
	// `mapsHandle` triples as "still loading" (`null`), "confirmed unavailable"
	// (`false`), and "ready" (the real handle), so `mapsAvailable` below, and
	// every "only when Maps/Places is actually usable" gate in the markup,
	// all read off the one value.
	const mapsConfig = {
		apiKey: env.PUBLIC_GOOGLE_MAPS_API_KEY || undefined,
		mapId: env.PUBLIC_GOOGLE_MAPS_MAP_ID || undefined
	};
	let mapsHandle: GoogleMapsHandle | null | false = $state(null);
	onMount(() => {
		let cancelled = false;
		void loadGoogleMaps(mapsConfig).then((h) => {
			if (!cancelled) mapsHandle = h ?? false;
		});
		return () => {
			cancelled = true;
		};
	});
	let mapsAvailable = $derived(mapsHandle !== null && mapsHandle !== false);

	// --- F35 approximate-pin picker state -----------------------------------
	// One `PlaceSelection | null` (what Places Autocomplete last resolved,
	// `null` meaning "no place picked", either because Places isn't
	// available at all or the poster just typed a free-text label) plus one
	// "share exact location" bool, per form that can carry a pin: member
	// offer/request, guest offer/request, and (destination, no precision
	// concept there, see `destinationCoordinatesPayload`'s own doc comment)
	// admin event create/edit. `originCoordinatesPayload`/
	// `destinationCoordinatesPayload` (`$lib/utils/carpool.ts`) both already
	// treat "no place picked" as "send nothing", so a plain free-text
	// submission behaves exactly as it did before this milestone.
	let offerPlace = $state<PlaceSelection | null>(null);
	let offerExact = $state(false);
	let requestPlace = $state<PlaceSelection | null>(null);
	let requestExact = $state(false);
	let guestOfferPlace = $state<PlaceSelection | null>(null);
	let guestOfferExact = $state(false);
	let guestRequestPlace = $state<PlaceSelection | null>(null);
	let guestRequestExact = $state(false);
	/** F33/B27: this viewer's own active claim on a driver post, if any —
	 * a member compares `user_id` (same as post ownership), a guest checks
	 * `carpoolOwnership.ts`'s claim-id tracking instead, for the same
	 * "the Backend never says 'this one is yours'" reason post ownership
	 * already works around. */
	function myClaimFor(p: CarpoolPostOut): CarpoolSeatClaimOut | undefined {
		return p.claims.find((c) => (isGuest ? isOwnedCarpoolClaim(c.id) : c.user_id === userId));
	}

	/** B30: the rider-post mirror of `myClaimFor` — this viewer's own active
	 * interest in a rider post, if any. Same "member compares `user_id`,
	 * guest checks `carpoolOwnership.ts`'s tracking instead" reasoning. */
	function myInterestFor(p: CarpoolPostOut): CarpoolRiderInterestOut | undefined {
		return p.interests.find((i) => (isGuest ? isOwnedCarpoolInterest(i.id) : i.user_id === userId));
	}

	// Admin: create-event form, click-to-reveal like the rest of the group
	// page's create flows.
	// svelte-ignore state_referenced_locally
	let showNewEvent = $state(events.length === 0);

	let editingEventId = $state<string | null>(null);

	/** B26/F32: the standing event has no `starts_at`, so its chip/detail
	 * label reads as "Ongoing" instead of formatting a `null` date. Only the
	 * standing event ever lacks one, so this doubles as the `is_standing`
	 * check without a second lookup. */
	function eventTimeLabel(ev: CarpoolEventOut): string {
		return ev.starts_at ? formatDateTime(ev.starts_at) : m.carpool_ongoing_label();
	}

	// "I can drive" / "I need a ride" forms: one flag for whether the form
	// is open, a separate one for the in-flight submit label. Closing the
	// form only on success keeps a failed submit's error visible instead of
	// unmounting the very form it belongs to.
	let offeringRide = $state(false);
	let submittingOffer = $state(false);
	let requestingRide = $state(false);
	let submittingRequest = $state(false);

	// Owner's own post: inline edit (content only; status is admin-only).
	let editingPostId = $state<string | null>(null);

	// --- F29 guest write path -------------------------------------------
	// Everything below only runs when `guest` is set. A guest has no
	// SvelteKit form action to `use:enhance` against (see the doc comment
	// above), so these forms submit via plain `fetch` instead, mirroring
	// the guest join page's own `doSignup` (`routes/join/[code]/
	// +page.svelte`): a small `{ ok, error? }` JSON verdict from the proxy,
	// `SAVE_REQUIRED` mapped to an inline prompt, everything else to one
	// generic retry message.

	let guestCreateError = $state('');
	let guestSaveRequired = $state(false);
	// Which write is waiting on a name before it can proceed — the ride
	// form itself only appears once a name is on file, same "prompt first,
	// then act" order the responsibility self-signup uses. F33: 'claim'
	// reuses the same prompt for a driver post's seat claim, with
	// `guestClaimTargetPostId` pinning it to the specific post that was
	// clicked (offer/request have no such target — there's only ever one
	// open offer/request form at a time). B30: 'interest' is the rider-post
	// mirror of 'claim', with `guestInterestTargetPostId` pinning it the
	// same way.
	let guestNamePromptFor = $state<'offer' | 'request' | 'claim' | 'interest' | null>(null);
	let guestNameDraft = $state('');
	let guestClaimTargetPostId = $state<string | null>(null);
	let guestInterestTargetPostId = $state<string | null>(null);

	// B34: the guest claim/interest paths' own optional contact-info step,
	// expanded after the name is known (or right after the name prompt
	// confirms) and before the actual claim/interest `fetch` fires. Pinned
	// to a specific post the same way `guestClaimTargetPostId`/
	// `guestInterestTargetPostId` already are: there's only ever one open
	// contact form at a time.
	let guestClaimContactTargetPostId = $state<string | null>(null);
	let guestClaimContactPhone = $state('');
	let guestClaimContactEmail = $state('');
	let guestInterestContactTargetPostId = $state<string | null>(null);
	let guestInterestContactPhone = $state('');
	let guestInterestContactEmail = $state('');

	let guestOfferOrigin = $state('');
	// B32/F37: same There/Back/Round trip choice the member offer/request
	// forms carry, defaulting to round trip like the Backend's own
	// `CarpoolPostCreate.direction` default.
	let guestOfferDirection = $state<CarpoolPostDirection>('round_trip');
	let guestOfferSeats = $state<number | undefined>(undefined);
	let guestOfferLeaveTime = $state('');
	let guestOfferNotes = $state('');
	let guestOfferContactPhone = $state('');
	let guestOfferContactEmail = $state('');
	let guestRequestOrigin = $state('');
	let guestRequestDirection = $state<CarpoolPostDirection>('round_trip');
	let guestRequestNotes = $state('');
	let guestRequestContactPhone = $state('');
	let guestRequestContactEmail = $state('');

	function startOfferRide() {
		guestCreateError = '';
		guestSaveRequired = false;
		if (needsName($localProfile)) {
			guestNamePromptFor = 'offer';
			guestNameDraft = '';
			return;
		}
		offeringRide = true;
	}

	function startRequestRide() {
		guestCreateError = '';
		guestSaveRequired = false;
		if (needsName($localProfile)) {
			guestNamePromptFor = 'request';
			guestNameDraft = '';
			return;
		}
		requestingRide = true;
	}

	function confirmGuestName() {
		const name = guestNameDraft.trim();
		if (!name) return;
		setDisplayName(name);
		const target = guestNamePromptFor;
		const claimTargetPostId = guestClaimTargetPostId;
		const interestTargetPostId = guestInterestTargetPostId;
		guestNamePromptFor = null;
		guestClaimTargetPostId = null;
		guestInterestTargetPostId = null;
		if (target === 'offer') offeringRide = true;
		else if (target === 'request') requestingRide = true;
		else if (target === 'claim' && claimTargetPostId) {
			guestClaimContactTargetPostId = claimTargetPostId;
			guestClaimContactPhone = '';
			guestClaimContactEmail = '';
		} else if (target === 'interest' && interestTargetPostId) {
			guestInterestContactTargetPostId = interestTargetPostId;
			guestInterestContactPhone = '';
			guestInterestContactEmail = '';
		}
	}

	type GuestWriteResult =
		| { ok: true; post: CarpoolPostOut }
		| { ok: false; error: 'save-required' }
		| { ok: false; error: 'conflict'; message?: string }
		| { ok: false; error: 'forbidden' }
		| { ok: false; error: 'server' };

	async function submitGuestPost(
		eventId: string,
		body: Record<string, unknown>,
		onSuccess: (post: CarpoolPostOut) => void
	): Promise<void> {
		if (!guest) return;
		guestCreateError = '';
		guestSaveRequired = false;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/events/${eventId}/posts`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...body, localId: ensureLocalId(), displayName: $localProfile.displayName })
			});
			const result = (await res.json()) as GuestWriteResult;
			if (result.ok) {
				rememberCarpoolPost(result.post.id);
				markSignedUp();
				onSuccess(result.post);
				await invalidateAll();
			} else if (result.error === 'save-required') {
				guestSaveRequired = true;
			} else if (result.error === 'conflict') {
				guestCreateError = result.message || m.carpool_guest_action_failed();
			} else {
				guestCreateError = m.carpool_guest_action_failed();
			}
		} catch {
			guestCreateError = m.carpool_guest_action_failed();
		}
	}

	async function submitGuestOffer(eventId: string) {
		const invalid = driverOfferError(guestOfferOrigin, guestOfferSeats ?? null);
		if (invalid) {
			guestCreateError = invalid === 'seats' ? m.carpool_driver_needs_seats() : m.carpool_enter_origin();
			return;
		}
		if (contactEmailError(guestOfferContactEmail)) {
			guestCreateError = m.carpool_invalid_email();
			return;
		}
		submittingOffer = true;
		await submitGuestPost(
			eventId,
			{
				kind: 'driver',
				direction: guestOfferDirection,
				originLabel: guestOfferOrigin,
				seatsTotal: guestOfferSeats,
				leaveTimeText: guestOfferLeaveTime,
				notes: guestOfferNotes,
				contactPhone: guestOfferContactPhone,
				contactEmail: guestOfferContactEmail,
				...(guestOfferPlace
					? {
							originLatitude: guestOfferPlace.latitude,
							originLongitude: guestOfferPlace.longitude,
							originPlaceId: guestOfferPlace.placeId ?? undefined,
							originPrecision: guestOfferExact ? 'exact' : 'approximate'
						}
					: {})
			},
			() => {
				offeringRide = false;
				guestOfferOrigin = '';
				guestOfferDirection = 'round_trip';
				guestOfferSeats = undefined;
				guestOfferLeaveTime = '';
				guestOfferNotes = '';
				guestOfferContactPhone = '';
				guestOfferContactEmail = '';
				guestOfferPlace = null;
			}
		);
		submittingOffer = false;
	}

	async function submitGuestRequest(eventId: string) {
		if (riderRequestError(guestRequestOrigin)) {
			guestCreateError = m.carpool_enter_origin();
			return;
		}
		if (contactEmailError(guestRequestContactEmail)) {
			guestCreateError = m.carpool_invalid_email();
			return;
		}
		submittingRequest = true;
		await submitGuestPost(
			eventId,
			{
				kind: 'rider',
				direction: guestRequestDirection,
				originLabel: guestRequestOrigin,
				notes: guestRequestNotes,
				contactPhone: guestRequestContactPhone,
				contactEmail: guestRequestContactEmail,
				...(guestRequestPlace
					? {
							originLatitude: guestRequestPlace.latitude,
							originLongitude: guestRequestPlace.longitude,
							originPlaceId: guestRequestPlace.placeId ?? undefined,
							originPrecision: guestRequestExact ? 'exact' : 'approximate'
						}
					: {})
			},
			() => {
				requestingRide = false;
				guestRequestOrigin = '';
				guestRequestDirection = 'round_trip';
				guestRequestNotes = '';
				guestRequestContactPhone = '';
				guestRequestContactEmail = '';
				guestRequestPlace = null;
			}
		);
		submittingRequest = false;
	}

	// --- F33 guest claim/release path -----------------------------------
	// Same `fetch`-backed proxy shape as the guest offer/request path above,
	// against `/join/[code]/carpool/posts/{id}/claims` and `/join/[code]/
	// carpool/claims/{id}`. `claimActionBusyId` doubles as a driver-post id
	// (a claim in flight) or a claim id (a release in flight) — the two
	// button states never render for the same post at once, so there's no
	// ambiguity reading it back in the markup below.

	let claimActionBusyId = $state<string | null>(null);
	// Which post the last claim/release error (or save-required prompt)
	// belongs to, so it renders under that post specifically rather than
	// every driver post at once.
	let claimActionErrorFor = $state<string | null>(null);
	let claimActionError = $state('');
	let claimActionSaveRequired = $state(false);

	type GuestClaimResult =
		| { ok: true; claim: CarpoolSeatClaimOut }
		| { ok: false; error: 'save-required' }
		| { ok: false; error: 'conflict'; message?: string }
		| { ok: false; error: 'server' };

	function startClaimSeat(postId: string) {
		if (needsName($localProfile)) {
			guestNamePromptFor = 'claim';
			guestClaimTargetPostId = postId;
			guestNameDraft = '';
			return;
		}
		guestClaimContactTargetPostId = postId;
		guestClaimContactPhone = '';
		guestClaimContactEmail = '';
	}

	function cancelGuestClaimContact() {
		guestClaimContactTargetPostId = null;
	}

	function confirmGuestClaimContact(postId: string) {
		const contactPhone = guestClaimContactPhone;
		const contactEmail = guestClaimContactEmail;
		guestClaimContactTargetPostId = null;
		void submitGuestClaim(postId, contactPhone, contactEmail);
	}

	async function submitGuestClaim(postId: string, contactPhone = '', contactEmail = '') {
		if (!guest) return;
		if (contactEmailError(contactEmail)) {
			claimActionErrorFor = postId;
			claimActionError = m.carpool_invalid_email();
			return;
		}
		claimActionErrorFor = null;
		claimActionError = '';
		claimActionSaveRequired = false;
		claimActionBusyId = postId;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/posts/${postId}/claims`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					localId: ensureLocalId(),
					displayName: $localProfile.displayName,
					contactPhone,
					contactEmail
				})
			});
			const result = (await res.json()) as GuestClaimResult;
			if (result.ok) {
				rememberCarpoolClaim(result.claim.id);
				markSignedUp();
				await invalidateAll();
			} else if (result.error === 'save-required') {
				claimActionErrorFor = postId;
				claimActionSaveRequired = true;
			} else {
				claimActionErrorFor = postId;
				claimActionError = result.error === 'conflict' && result.message ? result.message : m.carpool_guest_action_failed();
			}
		} catch {
			claimActionErrorFor = postId;
			claimActionError = m.carpool_guest_action_failed();
		} finally {
			claimActionBusyId = null;
		}
	}

	type GuestReleaseResult = { ok: true } | { ok: false; error: 'forbidden' | 'server' };

	async function releaseGuestClaim(postId: string, claimId: string) {
		if (!guest) return;
		claimActionErrorFor = null;
		claimActionError = '';
		claimActionSaveRequired = false;
		claimActionBusyId = claimId;
		try {
			const res = await fetch(
				`/join/${guest.code}/carpool/claims/${claimId}?localId=${encodeURIComponent(ensureLocalId())}`,
				{ method: 'DELETE' }
			);
			const result = (await res.json()) as GuestReleaseResult;
			if (result.ok) {
				forgetCarpoolClaim(claimId);
				await invalidateAll();
			} else {
				claimActionErrorFor = postId;
				claimActionError = m.carpool_guest_action_failed();
			}
		} catch {
			claimActionErrorFor = postId;
			claimActionError = m.carpool_guest_action_failed();
		} finally {
			claimActionBusyId = null;
		}
	}

	// --- B30 guest interest/withdraw path --------------------------------
	// The rider-post mirror of the guest claim/release path above, same
	// `fetch`-backed proxy shape against `/join/[code]/carpool/posts/{id}/
	// interests` and `/join/[code]/carpool/interests/{id}`.
	// `interestActionBusyId` doubles as a rider-post id (an interest in
	// flight) or an interest id (a release in flight), same "the two button
	// states never render for the same post at once" reasoning as
	// `claimActionBusyId`.

	let interestActionBusyId = $state<string | null>(null);
	let interestActionErrorFor = $state<string | null>(null);
	let interestActionError = $state('');
	let interestActionSaveRequired = $state(false);

	type GuestInterestResult =
		| { ok: true; interest: CarpoolRiderInterestOut }
		| { ok: false; error: 'save-required' }
		| { ok: false; error: 'conflict'; message?: string }
		| { ok: false; error: 'server' };

	function startExpressInterest(postId: string) {
		if (needsName($localProfile)) {
			guestNamePromptFor = 'interest';
			guestInterestTargetPostId = postId;
			guestNameDraft = '';
			return;
		}
		guestInterestContactTargetPostId = postId;
		guestInterestContactPhone = '';
		guestInterestContactEmail = '';
	}

	function cancelGuestInterestContact() {
		guestInterestContactTargetPostId = null;
	}

	function confirmGuestInterestContact(postId: string) {
		const contactPhone = guestInterestContactPhone;
		const contactEmail = guestInterestContactEmail;
		guestInterestContactTargetPostId = null;
		void submitGuestInterest(postId, contactPhone, contactEmail);
	}

	async function submitGuestInterest(postId: string, contactPhone = '', contactEmail = '') {
		if (!guest) return;
		if (contactEmailError(contactEmail)) {
			interestActionErrorFor = postId;
			interestActionError = m.carpool_invalid_email();
			return;
		}
		interestActionErrorFor = null;
		interestActionError = '';
		interestActionSaveRequired = false;
		interestActionBusyId = postId;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/posts/${postId}/interests`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					localId: ensureLocalId(),
					displayName: $localProfile.displayName,
					contactPhone,
					contactEmail
				})
			});
			const result = (await res.json()) as GuestInterestResult;
			if (result.ok) {
				rememberCarpoolInterest(result.interest.id);
				markSignedUp();
				await invalidateAll();
			} else if (result.error === 'save-required') {
				interestActionErrorFor = postId;
				interestActionSaveRequired = true;
			} else {
				interestActionErrorFor = postId;
				interestActionError =
					result.error === 'conflict' && result.message ? result.message : m.carpool_guest_action_failed();
			}
		} catch {
			interestActionErrorFor = postId;
			interestActionError = m.carpool_guest_action_failed();
		} finally {
			interestActionBusyId = null;
		}
	}

	async function releaseGuestInterest(postId: string, interestId: string) {
		if (!guest) return;
		interestActionErrorFor = null;
		interestActionError = '';
		interestActionSaveRequired = false;
		interestActionBusyId = interestId;
		try {
			const res = await fetch(
				`/join/${guest.code}/carpool/interests/${interestId}?localId=${encodeURIComponent(ensureLocalId())}`,
				{ method: 'DELETE' }
			);
			const result = (await res.json()) as GuestReleaseResult;
			if (result.ok) {
				forgetCarpoolInterest(interestId);
				await invalidateAll();
			} else {
				interestActionErrorFor = postId;
				interestActionError = m.carpool_guest_action_failed();
			}
		} catch {
			interestActionErrorFor = postId;
			interestActionError = m.carpool_guest_action_failed();
		} finally {
			interestActionBusyId = null;
		}
	}
</script>

{#snippet postRow(p: CarpoolPostOut)}
	{@const isOwner = isGuest ? isOwnedCarpoolPost(p.id) : p.user_id === userId}
	<div class="carpool-post">
		{#if editingPostId === p.id}
			<CarpoolPostEditForm
				post={p}
				{isGuest}
				guestCode={guest?.code ?? null}
				{form}
				onDone={() => (editingPostId = null)}
			/>
		{:else}
			{@const myClaim = p.kind === 'driver' ? myClaimFor(p) : undefined}
			{@const myInterest = p.kind === 'rider' ? myInterestFor(p) : undefined}
			<CarpoolPostDetails post={p} />
			<CarpoolPostActions post={p} {isOwner} {isAdmin} {form} onEdit={(post) => (editingPostId = post.id)} />
			{#if p.kind === 'driver'}
				<CarpoolDriverClaimActions
					post={p}
					{isOwner}
					{canPost}
					{isGuest}
					{myClaim}
					guestNamePromptActive={guestNamePromptFor === 'claim' && guestClaimTargetPostId === p.id}
					{guestNameDraft}
					guestClaimContactActive={guestClaimContactTargetPostId === p.id}
					{guestClaimContactPhone}
					{guestClaimContactEmail}
					{claimActionBusyId}
					{claimActionErrorFor}
					{claimActionSaveRequired}
					{claimActionError}
					{form}
					onGuestNameInput={(value) => (guestNameDraft = value)}
					onGuestNameCancel={() => (guestNamePromptFor = null)}
					onGuestNameConfirm={confirmGuestName}
					onStartClaim={startClaimSeat}
					onGuestClaimContactPhoneInput={(value) => (guestClaimContactPhone = value)}
					onGuestClaimContactEmailInput={(value) => (guestClaimContactEmail = value)}
					onGuestClaimContactCancel={cancelGuestClaimContact}
					onGuestClaimContactConfirm={confirmGuestClaimContact}
					onReleaseGuestClaim={releaseGuestClaim}
				/>
			{/if}
			{#if p.kind === 'rider'}
				<CarpoolRiderInterestActions
					post={p}
					{isOwner}
					{canPost}
					{isGuest}
					{myInterest}
					guestNamePromptActive={guestNamePromptFor === 'interest' && guestInterestTargetPostId === p.id}
					{guestNameDraft}
					guestInterestContactActive={guestInterestContactTargetPostId === p.id}
					{guestInterestContactPhone}
					{guestInterestContactEmail}
					{interestActionBusyId}
					{interestActionErrorFor}
					{interestActionSaveRequired}
					{interestActionError}
					{form}
					onGuestNameInput={(value) => (guestNameDraft = value)}
					onGuestNameCancel={() => (guestNamePromptFor = null)}
					onGuestNameConfirm={confirmGuestName}
					onStartInterest={startExpressInterest}
					onGuestInterestContactPhoneInput={(value) => (guestInterestContactPhone = value)}
					onGuestInterestContactEmailInput={(value) => (guestInterestContactEmail = value)}
					onGuestInterestContactCancel={cancelGuestInterestContact}
					onGuestInterestContactConfirm={confirmGuestInterestContact}
					onReleaseGuestInterest={releaseGuestInterest}
				/>
			{/if}
		{/if}
	</div>
{/snippet}

<div class="carpool-head">
	<p class="card-eyebrow">{m.carpool_events_heading()}</p>
	{#if isAdmin}
		<button type="button" class="text-link" onclick={() => (showNewEvent = !showNewEvent)}>
			{m.carpool_add_one_time_event()}
		</button>
	{/if}
</div>

{#if isAdmin && showNewEvent}
	<CarpoolEventCreateForm {mapsConfig} {form} onCreated={() => (showNewEvent = false)} />
{/if}

{#if events.length === 0}
	<p class="empty">{isAdmin ? m.carpool_no_events_admin() : m.carpool_no_events_member()}</p>
{:else}
	{#if events.length > 1}
		<CarpoolEventStrip {events} {selectedEventId} {eventTimeLabel} />
	{/if}

	{#if selectedEvent}
		{@const ev = selectedEvent}
		<section class="card">
			{#if isAdmin && editingEventId === ev.id}
				<CarpoolEventEditForm event={ev} {mapsConfig} {form} onCancel={() => (editingEventId = null)} />
			{:else}
				<CarpoolEventSummary event={ev} {isAdmin} {form} {eventTimeLabel} onEdit={(event) => (editingEventId = event.id)} />
			{/if}
		</section>

		<CarpoolDirectionTabs value={directionFilter} onChange={(value) => (directionFilter = value)} />

		<!-- F35: one stacked view, map above the list, whenever `mapsAvailable`
		     (the loader actually confirmed Maps/Places usable), no separate
		     list/map subpage or toggle to switch between them. Otherwise this
		     falls straight through to `driversRidersSections` with no map at
		     all, i.e. today's exact list-only markup, unchanged. F41: `drivers`/
		     `riders` are already direction-filtered above, so the map's pins
		     respect the toggle too, no prop changes needed inside
		     `CarpoolMap.svelte` itself. -->
		{#if mapsAvailable}
			<CarpoolMap destination={ev} {drivers} {riders} />
		{/if}

		{@render driversRidersSections(ev)}
	{/if}
{/if}

{#snippet driversRidersSections(ev: CarpoolEventOut)}
	<section class="card">
		<p class="card-eyebrow">{m.carpool_drivers_heading()}</p>
		{#each drivers as p (p.id)}
			{@render postRow(p)}
		{:else}
			<p class="empty">{m.carpool_no_drivers()}</p>
		{/each}
			{#if canPost}
				{#if isGuest && guestNamePromptFor === 'offer'}
					<CarpoolGuestNamePrompt
						value={guestNameDraft}
						confirmLabel={m.carpool_offer_ride()}
						onInput={(value) => (guestNameDraft = value)}
						onCancel={() => (guestNamePromptFor = null)}
						onConfirm={confirmGuestName}
					/>
				{:else if offeringRide}
					{#if isGuest}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								void submitGuestOffer(ev.id);
							}}
						>
							<p class="card-note">{m.carpool_posting_as({ name: postingAsName })}</p>
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input
									bind:value={guestOfferOrigin}
									required
									oninput={() => (guestOfferPlace = null)}
									use:googlePlacesAutocomplete={{
										config: mapsConfig,
										onSelect: (p) => {
											guestOfferPlace = p;
											guestOfferOrigin = p.label;
										}
									}}
								/>
							</label>
							{#if mapsAvailable}
								<label class="checkline">
									<input type="checkbox" bind:checked={guestOfferExact} />
									<span>{m.carpool_share_exact_location()}</span>
								</label>
							{/if}
							<label class="field">
								<span>{m.carpool_direction_field()}</span>
								<select bind:value={guestOfferDirection}>
									<option value="round_trip">{m.carpool_direction_round_trip()}</option>
									<option value="there">{m.carpool_direction_there()}</option>
									<option value="back">{m.carpool_direction_back()}</option>
								</select>
							</label>
							<label class="field">
								<span>{m.carpool_seats_field()}</span>
								<input type="number" min="1" bind:value={guestOfferSeats} required />
							</label>
							<label class="field">
								<span>{m.carpool_leave_time_field()}</span>
								<input bind:value={guestOfferLeaveTime} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input bind:value={guestOfferNotes} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input type="tel" bind:value={guestOfferContactPhone} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_email_field()}</span>
								<input type="email" bind:value={guestOfferContactEmail} placeholder={m.groups_optional()} />
							</label>
							<p class="card-note">{m.carpool_contact_email_hint()}</p>
							{#if guestCreateError}
								<p class="error">{guestCreateError}</p>
							{/if}
							{#if guestSaveRequired}
								<CarpoolSaveRequiredNotice />
							{/if}
							<div class="btn-row">
								<button type="submit" class="btn btn-primary" disabled={submittingOffer}>
									{submittingOffer ? m.carpool_posting() : m.carpool_submit_offer()}
								</button>
								<button type="button" class="text-link" onclick={() => (offeringRide = false)}>{m.action_cancel()}</button>
							</div>
						</form>
					{:else}
						<form
							method="POST"
							action="?/offerRide"
							use:enhance={() => {
								submittingOffer = true;
								return async ({ result, update }) => {
									submittingOffer = false;
									if (result.type === 'success') {
										offeringRide = false;
										offerPlace = null;
									}
									await update();
								};
							}}
						>
							<input type="hidden" name="eventId" value={ev.id} />
							<p class="card-note">{m.carpool_posting_as({ name: postingAsName })}</p>
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input
									name="originLabel"
									required
									oninput={() => (offerPlace = null)}
									use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: (p) => (offerPlace = p) }}
								/>
							</label>
							{#if mapsAvailable}
								<label class="checkline">
									<input type="checkbox" bind:checked={offerExact} />
									<span>{m.carpool_share_exact_location()}</span>
								</label>
							{/if}
							<CarpoolOriginHiddenFields place={offerPlace} exact={offerExact} />
							<label class="field">
								<span>{m.carpool_direction_field()}</span>
								<select name="direction">
									<option value="round_trip" selected>{m.carpool_direction_round_trip()}</option>
									<option value="there">{m.carpool_direction_there()}</option>
									<option value="back">{m.carpool_direction_back()}</option>
								</select>
							</label>
							<label class="field">
								<span>{m.carpool_seats_field()}</span>
								<input name="seatsTotal" type="number" min="1" required />
							</label>
							<label class="field">
								<span>{m.carpool_leave_time_field()}</span>
								<input name="leaveTimeText" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input name="notes" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input name="contactPhone" type="tel" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_email_field()}</span>
								<input name="contactEmail" type="email" placeholder={m.groups_optional()} />
							</label>
							<p class="card-note">{m.carpool_contact_email_hint()}</p>
							{#if form?.form === 'offerRide' && form?.error}
								<p class="error">{form.error}</p>
							{/if}
							<div class="btn-row">
								<button type="submit" class="btn btn-primary" disabled={submittingOffer}>
									{submittingOffer ? m.carpool_posting() : m.carpool_submit_offer()}
								</button>
								<button type="button" class="text-link" onclick={() => (offeringRide = false)}>{m.action_cancel()}</button>
							</div>
						</form>
					{/if}
				{:else}
					<button
						type="button"
						class="btn btn-outline btn-block"
						onclick={() => (isGuest ? startOfferRide() : (offeringRide = true))}
					>
						{m.carpool_offer_ride()}
					</button>
				{/if}
			{/if}
		</section>

		<section class="card">
			<p class="card-eyebrow">{m.carpool_riders_heading()}</p>
			{#each riders as p (p.id)}
				{@render postRow(p)}
			{:else}
				<p class="empty">{m.carpool_no_riders()}</p>
			{/each}
			{#if canPost}
				{#if isGuest && guestNamePromptFor === 'request'}
					<CarpoolGuestNamePrompt
						value={guestNameDraft}
						confirmLabel={m.carpool_request_ride()}
						onInput={(value) => (guestNameDraft = value)}
						onCancel={() => (guestNamePromptFor = null)}
						onConfirm={confirmGuestName}
					/>
				{:else if requestingRide}
					{#if isGuest}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								void submitGuestRequest(ev.id);
							}}
						>
							<p class="card-note">{m.carpool_posting_as({ name: postingAsName })}</p>
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input
									bind:value={guestRequestOrigin}
									required
									oninput={() => (guestRequestPlace = null)}
									use:googlePlacesAutocomplete={{
										config: mapsConfig,
										onSelect: (p) => {
											guestRequestPlace = p;
											guestRequestOrigin = p.label;
										}
									}}
								/>
							</label>
							{#if mapsAvailable}
								<label class="checkline">
									<input type="checkbox" bind:checked={guestRequestExact} />
									<span>{m.carpool_share_exact_location()}</span>
								</label>
							{/if}
							<label class="field">
								<span>{m.carpool_direction_field()}</span>
								<select bind:value={guestRequestDirection}>
									<option value="round_trip">{m.carpool_direction_round_trip()}</option>
									<option value="there">{m.carpool_direction_there()}</option>
									<option value="back">{m.carpool_direction_back()}</option>
								</select>
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input bind:value={guestRequestNotes} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input type="tel" bind:value={guestRequestContactPhone} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_email_field()}</span>
								<input type="email" bind:value={guestRequestContactEmail} placeholder={m.groups_optional()} />
							</label>
							<p class="card-note">{m.carpool_contact_email_hint()}</p>
							{#if guestCreateError}
								<p class="error">{guestCreateError}</p>
							{/if}
							{#if guestSaveRequired}
								<CarpoolSaveRequiredNotice />
							{/if}
							<div class="btn-row">
								<button type="submit" class="btn btn-primary" disabled={submittingRequest}>
									{submittingRequest ? m.carpool_posting() : m.carpool_submit_request()}
								</button>
								<button type="button" class="text-link" onclick={() => (requestingRide = false)}>{m.action_cancel()}</button>
							</div>
						</form>
					{:else}
						<form
							method="POST"
							action="?/requestRide"
							use:enhance={() => {
								submittingRequest = true;
								return async ({ result, update }) => {
									submittingRequest = false;
									if (result.type === 'success') {
										requestingRide = false;
										requestPlace = null;
									}
									await update();
								};
							}}
						>
							<input type="hidden" name="eventId" value={ev.id} />
							<p class="card-note">{m.carpool_posting_as({ name: postingAsName })}</p>
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input
									name="originLabel"
									required
									oninput={() => (requestPlace = null)}
									use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: (p) => (requestPlace = p) }}
								/>
							</label>
							{#if mapsAvailable}
								<label class="checkline">
									<input type="checkbox" bind:checked={requestExact} />
									<span>{m.carpool_share_exact_location()}</span>
								</label>
							{/if}
							<CarpoolOriginHiddenFields place={requestPlace} exact={requestExact} />
							<label class="field">
								<span>{m.carpool_direction_field()}</span>
								<select name="direction">
									<option value="round_trip" selected>{m.carpool_direction_round_trip()}</option>
									<option value="there">{m.carpool_direction_there()}</option>
									<option value="back">{m.carpool_direction_back()}</option>
								</select>
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input name="notes" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input name="contactPhone" type="tel" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_email_field()}</span>
								<input name="contactEmail" type="email" placeholder={m.groups_optional()} />
							</label>
							<p class="card-note">{m.carpool_contact_email_hint()}</p>
							{#if form?.form === 'requestRide' && form?.error}
								<p class="error">{form.error}</p>
							{/if}
							<div class="btn-row">
								<button type="submit" class="btn btn-primary" disabled={submittingRequest}>
									{submittingRequest ? m.carpool_posting() : m.carpool_submit_request()}
								</button>
								<button type="button" class="text-link" onclick={() => (requestingRide = false)}>{m.action_cancel()}</button>
							</div>
						</form>
					{/if}
				{:else}
					<button
						type="button"
						class="btn btn-outline btn-block"
						onclick={() => (isGuest ? startRequestRide() : (requestingRide = true))}
					>
						{m.carpool_request_ride()}
					</button>
				{/if}
			{/if}
		</section>
{/snippet}

<style>
	.carpool-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.carpool-post {
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.carpool-post:first-of-type {
		border-top: none;
		padding-top: 0;
	}

</style>
