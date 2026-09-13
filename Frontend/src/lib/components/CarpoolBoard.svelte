<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { env } from '$env/dynamic/public';
	import EditableCard from './EditableCard.svelte';
	import ConfirmButton from './ConfirmButton.svelte';
	import CarpoolMap from './CarpoolMap.svelte';
	import { datetimeLocalToIso, formatDateTime, toDatetimeLocalValue } from '$lib/utils/dates';
	import { driverOfferError, riderRequestError } from '$lib/utils/carpool';
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
	import { lh } from '$lib/i18n';
	import type {
		CarpoolEventOut,
		CarpoolPostOut,
		CarpoolRiderInterestOut,
		CarpoolSeatClaimOut
	} from '$lib/server/backendTypes';

	/** B24/F28: the real content behind a carpool-template `GroupCustomPage`
	 * (event selector, driver/rider lists, the "I can drive"/"I need a
	 * ride" forms, owner edit/delete, and, for an admin, event create/edit/
	 * lock/archive plus post moderation). Rendered directly by `routes/
	 * groups/[id]/pages/[slug]/+page.svelte` in place of `CustomPageView`'s
	 * placeholder once `template_key === 'carpool_board'`.
	 *
	 * F29/B25: the `guest` prop is what a guest render passes (`routes/
	 * join/[code]/pages/[slug]/+page.svelte`) instead of leaving it unset.
	 * Its presence swaps every write control's mechanics from a SvelteKit
	 * form action (`use:enhance` against `?/offerRide` etc., resolved by
	 * this component's own route's `+page.server.ts`) to a plain `fetch`
	 * against the `/join/[code]/carpool/...` proxy routes, since a guest
	 * write needs the local profile's name/`local_id` and the lazy
	 * name-prompt/`SAVE_REQUIRED` handling those proxies (and only those)
	 * carry — the same reason the guest join page's own responsibility
	 * self-signup isn't a form action either. `isAdmin` is always `false`
	 * for a guest (never true), so every admin-only block below already
	 * stays hidden with no `guest`-specific branch needed.
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
	 * usable or there's simply nothing to put a pin on. */
	let {
		pageId,
		isAdmin,
		userId,
		userName = null,
		events,
		selectedEventId,
		posts,
		form,
		guest = null
	}: {
		pageId: string;
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
	let drivers = $derived(posts.filter((p) => p.kind === 'driver'));
	let riders = $derived(posts.filter((p) => p.kind === 'rider'));
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
	let newEventPlace = $state<PlaceSelection | null>(null);
	let editEventPlace = $state<PlaceSelection | null>(null);

	// The admin edit-event destination field is a controlled `bind:value`
	// input (`editDestinationDraft`), unlike the create form's plain
	// uncontrolled one: Places Autocomplete sets the input's DOM value
	// directly on selection, which doesn't fire a real `input` event (see
	// `googlePlaces.ts`'s doc comment on why `oninput` never fires for a
	// selection), so the bound state needs that mirrored back by hand here
	// or Svelte's own reactivity would stomp the widget's chosen text back
	// to whatever `editDestinationDraft` still held.
	function onSelectEditDestination(p: PlaceSelection) {
		editEventPlace = p;
		editDestinationDraft = p.label;
	}

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

	const STATUS_LABELS: Record<CarpoolEventOut['status'], () => string> = {
		open: m.carpool_status_open,
		locked: m.carpool_status_locked,
		archived: m.carpool_status_archived
	};

	function startsAtToIso(formData: FormData) {
		const raw = String(formData.get('startsAt') ?? '');
		if (raw) formData.set('startsAt', datetimeLocalToIso(raw));
	}

	// Admin: create-event form, click-to-reveal like the rest of the group
	// page's create flows.
	let showNewEvent = $state(events.length === 0);
	let creatingEvent = $state(false);

	// Admin: event edit panel.
	let editingEvent = $state(false);
	let editTitleDraft = $state('');
	let editStartsAtDraft = $state('');
	let editDestinationDraft = $state('');
	let savingEventEdit = $state(false);
	function startEditEvent(ev: CarpoolEventOut) {
		editTitleDraft = ev.title;
		// B26: the standing event has neither field, so there's nothing to
		// prefill; its edit panel omits the "when" input entirely (see the
		// markup below) so this draft never actually gets submitted for it.
		editStartsAtDraft = ev.starts_at ? toDatetimeLocalValue(ev.starts_at) : '';
		editDestinationDraft = ev.destination_label ?? '';
		// F35: no place re-picked yet this edit, so the patch leaves whatever
		// destination coordinates are already stored untouched (see
		// `destinationCoordinatesPayload`'s call site in `updateCarpoolEvent`).
		editEventPlace = null;
		editingEvent = true;
	}

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
	let editOriginDraft = $state('');
	let editSeatsDraft = $state<number | undefined>(undefined);
	let editLeaveDraft = $state('');
	let editNotesDraft = $state('');
	// B30: shared by both the member (`EditableCard`) and guest (fetch-based)
	// edit form variants below, same as every other draft in this block.
	let editContactPhoneDraft = $state('');
	let savingPostEdit = $state(false);
	function startEditPost(p: CarpoolPostOut) {
		editOriginDraft = p.origin_label;
		editSeatsDraft = p.seats_total ?? undefined;
		editLeaveDraft = p.leave_time_text ?? '';
		editNotesDraft = p.notes ?? '';
		// B30: prefilled from `p.contact_phone` when it's visible to this
		// viewer at all — always true here, since only the post's own owner
		// (or an admin, who never sees this inline-edit form) reaches this.
		editContactPhoneDraft = p.contact_phone ?? '';
		editingPostId = p.id;
	}

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

	let guestOfferOrigin = $state('');
	let guestOfferSeats = $state<number | undefined>(undefined);
	let guestOfferLeaveTime = $state('');
	let guestOfferNotes = $state('');
	let guestOfferContactPhone = $state('');
	let guestRequestOrigin = $state('');
	let guestRequestNotes = $state('');
	let guestRequestContactPhone = $state('');

	let guestEditError = $state('');

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
		else if (target === 'claim' && claimTargetPostId) void submitGuestClaim(claimTargetPostId);
		else if (target === 'interest' && interestTargetPostId) void submitGuestInterest(interestTargetPostId);
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
		submittingOffer = true;
		await submitGuestPost(
			eventId,
			{
				kind: 'driver',
				originLabel: guestOfferOrigin,
				seatsTotal: guestOfferSeats,
				leaveTimeText: guestOfferLeaveTime,
				notes: guestOfferNotes,
				contactPhone: guestOfferContactPhone,
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
				guestOfferSeats = undefined;
				guestOfferLeaveTime = '';
				guestOfferNotes = '';
				guestOfferContactPhone = '';
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
		submittingRequest = true;
		await submitGuestPost(
			eventId,
			{
				kind: 'rider',
				originLabel: guestRequestOrigin,
				notes: guestRequestNotes,
				contactPhone: guestRequestContactPhone,
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
				guestRequestNotes = '';
				guestRequestContactPhone = '';
				guestRequestPlace = null;
			}
		);
		submittingRequest = false;
	}

	async function submitGuestPostEdit(p: CarpoolPostOut) {
		if (!guest) return;
		guestEditError = '';
		savingPostEdit = true;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/posts/${p.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					originLabel: editOriginDraft,
					seatsTotal: p.kind === 'driver' ? (editSeatsDraft ?? null) : undefined,
					leaveTimeText: editLeaveDraft || null,
					notes: editNotesDraft || null,
					contactPhone: editContactPhoneDraft || null,
					localId: ensureLocalId()
				})
			});
			const result = (await res.json()) as GuestWriteResult;
			if (result.ok) {
				editingPostId = null;
				await invalidateAll();
			} else if (result.error === 'conflict') {
				guestEditError = result.message || m.carpool_guest_action_failed();
			} else {
				guestEditError = m.carpool_guest_action_failed();
			}
		} catch {
			guestEditError = m.carpool_guest_action_failed();
		} finally {
			savingPostEdit = false;
		}
	}

	async function deleteGuestPost(p: CarpoolPostOut) {
		if (!guest) return;
		guestEditError = '';
		savingPostEdit = true;
		try {
			const res = await fetch(
				`/join/${guest.code}/carpool/posts/${p.id}?localId=${encodeURIComponent(ensureLocalId())}`,
				{ method: 'DELETE' }
			);
			const result = (await res.json()) as GuestWriteResult;
			if (result.ok) {
				editingPostId = null;
				await invalidateAll();
			} else {
				guestEditError = m.carpool_guest_action_failed();
			}
		} catch {
			guestEditError = m.carpool_guest_action_failed();
		} finally {
			savingPostEdit = false;
		}
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
		void submitGuestClaim(postId);
	}

	async function submitGuestClaim(postId: string) {
		if (!guest) return;
		claimActionErrorFor = null;
		claimActionError = '';
		claimActionSaveRequired = false;
		claimActionBusyId = postId;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/posts/${postId}/claims`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ localId: ensureLocalId(), displayName: $localProfile.displayName })
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
		void submitGuestInterest(postId);
	}

	async function submitGuestInterest(postId: string) {
		if (!guest) return;
		interestActionErrorFor = null;
		interestActionError = '';
		interestActionSaveRequired = false;
		interestActionBusyId = postId;
		try {
			const res = await fetch(`/join/${guest.code}/carpool/posts/${postId}/interests`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ localId: ensureLocalId(), displayName: $localProfile.displayName })
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
			{#if isGuest}
				<!-- F29: no form action to `use:enhance` against (see this
				     component's doc comment), so this is a plain fetch-backed
				     form instead of `EditableCard` — same fields, same Save/
				     Cancel/Delete row, laid out by hand. -->
				<form
					onsubmit={(e) => {
						e.preventDefault();
						void submitGuestPostEdit(p);
					}}
				>
					<label class="field">
						<span>{m.carpool_origin_field()}</span>
						<input bind:value={editOriginDraft} required />
					</label>
					{#if p.kind === 'driver'}
						<label class="field">
							<span>{m.carpool_seats_field()}</span>
							<input type="number" min="1" bind:value={editSeatsDraft} required />
						</label>
						<label class="field">
							<span>{m.carpool_leave_time_field()}</span>
							<input bind:value={editLeaveDraft} placeholder={m.groups_optional()} />
						</label>
					{/if}
					<label class="field">
						<span>{m.carpool_notes_field()}</span>
						<input bind:value={editNotesDraft} placeholder={m.groups_optional()} />
					</label>
					<label class="field">
						<span>{m.carpool_contact_phone_field()}</span>
						<input type="tel" bind:value={editContactPhoneDraft} placeholder={m.groups_optional()} />
					</label>
					{#if guestEditError}
						<p class="error">{guestEditError}</p>
					{/if}
					<div class="btn-row">
						<button type="submit" class="btn btn-outline" disabled={savingPostEdit}>
							{savingPostEdit ? m.reset_password_saving() : m.action_save()}
						</button>
						<button
							type="button"
							class="text-link"
							onclick={() => (editingPostId = null)}
							disabled={savingPostEdit}
						>
							{m.action_cancel()}
						</button>
						<ConfirmButton>
							{#snippet trigger(start)}
								<button
									type="button"
									class="text-link text-link--danger"
									onclick={start}
									disabled={savingPostEdit}
								>
									{m.carpool_delete_post()}
								</button>
							{/snippet}
							{#snippet confirm(cancel)}
								<p class="card-note">{m.carpool_delete_post_confirm()}</p>
								<div class="btn-row">
									<button type="button" class="btn btn-outline" onclick={cancel}>{m.action_cancel()}</button>
									<button
										type="button"
										class="btn btn-danger"
										disabled={savingPostEdit}
										onclick={() => void deleteGuestPost(p)}
									>
										{m.carpool_delete_post()}
									</button>
								</div>
							{/snippet}
						</ConfirmButton>
					</div>
				</form>
			{:else}
				<EditableCard
					saveAction="?/updateCarpoolPost"
					deleteAction="?/deleteCarpoolPost"
					idName="postId"
					idValue={p.id}
					bind:saving={savingPostEdit}
					error={form?.form === 'editPost' && form?.error}
					deleteLabel={m.carpool_delete_post()}
					deleteConfirmLabel={m.carpool_delete_post_confirm()}
					onCancel={() => (editingPostId = null)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.carpool_origin_field()}</span>
							<input name="originLabel" bind:value={editOriginDraft} required />
						</label>
						{#if p.kind === 'driver'}
							<label class="field">
								<span>{m.carpool_seats_field()}</span>
								<input name="seatsTotal" type="number" min="1" bind:value={editSeatsDraft} required />
							</label>
							<label class="field">
								<span>{m.carpool_leave_time_field()}</span>
								<input name="leaveTimeText" bind:value={editLeaveDraft} placeholder={m.groups_optional()} />
							</label>
						{/if}
						<label class="field">
							<span>{m.carpool_notes_field()}</span>
							<input name="notes" bind:value={editNotesDraft} placeholder={m.groups_optional()} />
						</label>
						<label class="field">
							<span>{m.carpool_contact_phone_field()}</span>
							<input
								name="contactPhone"
								type="tel"
								bind:value={editContactPhoneDraft}
								placeholder={m.groups_optional()}
							/>
						</label>
					{/snippet}
				</EditableCard>
			{/if}
		{:else}
			{@const myClaim = p.kind === 'driver' ? myClaimFor(p) : undefined}
			{@const myInterest = p.kind === 'rider' ? myInterestFor(p) : undefined}
			<div class="carpool-post-main">
				<p class="card-title">
					{p.display_name}
					{#if p.status === 'hidden'}<span class="dim">· {m.carpool_hidden_badge()}</span>{/if}
				</p>
				<p class="card-meta">{m.carpool_origin_label({ origin: p.origin_label })}</p>
				{#if p.kind === 'driver'}
					<p class="card-meta">
						{m.carpool_seats_left({ available: p.seats_available ?? 0, total: p.seats_total ?? 0 })}
						{#if p.leave_time_text}· {p.leave_time_text}{/if}
					</p>
					{#if p.claims.length > 0}
						<!-- F33: claimant names, same "posted content is visible to
						     whoever can see the board" stance the rest of carpool
						     already takes — no ownership check gates this. -->
						<p class="card-meta">
							{m.carpool_claimed_by({ names: p.claims.map((c) => c.display_name).join(', ') })}
						</p>
					{/if}
				{:else if p.interests.length > 0}
					<!-- B30: interested drivers' names, same "posted content is
					     visible to whoever can see the board" stance as `claims`
					     above — only the phone number itself is gated, not who's
					     interested. -->
					<p class="card-meta">
						{m.carpool_interested_by({ names: p.interests.map((i) => i.display_name).join(', ') })}
					</p>
				{/if}
				{#if p.notes}<p class="card-note">{p.notes}</p>{/if}
				{#if p.contact_phone}
					<!-- B30: already visibility-gated by the Backend
					     (`serialize_post`) — this just renders whatever it got,
					     exactly like `origin_label`/`notes` above, no client-side
					     ownership/claim check needed here. -->
					<p class="card-meta">{m.carpool_contact_phone_label({ phone: p.contact_phone })}</p>
				{/if}
			</div>
			<div class="btn-row">
				{#if isOwner}
					<button type="button" class="text-link" onclick={() => startEditPost(p)}>{m.drawer_edit()}</button>
				{:else if isAdmin}
					<form method="POST" action="?/moderateCarpoolPost" use:enhance>
						<input type="hidden" name="postId" value={p.id} />
						<input type="hidden" name="status" value={p.status === 'hidden' ? 'open' : 'hidden'} />
						<button type="submit" class="text-link">
							{p.status === 'hidden' ? m.carpool_unhide_post() : m.carpool_hide_post()}
						</button>
					</form>
					<ConfirmButton>
						{#snippet trigger(start)}
							<button type="button" class="text-link text-link--danger" onclick={start}>{m.carpool_delete_post()}</button>
						{/snippet}
						{#snippet confirm(cancel)}
							<p class="card-note">{m.carpool_delete_post_confirm()}</p>
							<div class="btn-row">
								<button type="button" class="btn btn-outline" onclick={cancel}>{m.action_cancel()}</button>
								<form method="POST" action="?/deleteCarpoolPost" use:enhance>
									<input type="hidden" name="postId" value={p.id} />
									<button type="submit" class="btn btn-danger">{m.carpool_delete_post()}</button>
								</form>
							</div>
						{/snippet}
					</ConfirmButton>
				{/if}
			</div>
			{#if isOwner && form?.form === 'editPost' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			{#if p.kind === 'driver'}
				<!-- F33/B27: first-come-first-served claim/release. `canPost`
				     (same admin-bypasses-lock gate the offer/request forms use)
				     only governs a *new* claim — the Backend never blocks a
				     release on a locked/archived event, so that button ignores
				     it. A full post with no claim from this viewer renders
				     nothing here at all, just the seat count/claimant list above.
				     `!isOwner` guards the "Claim seat" button specifically: a
				     driver can't claim a seat on their own post (the Backend
				     rejects it with 400 too, see `create_claim`'s own doc
				     comment), so this just keeps the button from ever offering
				     an action that would fail. -->
				<div class="btn-row">
					{#if myClaim}
						{#if isGuest}
							<button
								type="button"
								class="btn btn-outline"
								disabled={claimActionBusyId === myClaim.id}
								onclick={() => releaseGuestClaim(p.id, myClaim.id)}
							>
								{claimActionBusyId === myClaim.id ? m.carpool_releasing() : m.carpool_release_seat()}
							</button>
						{:else}
							<form method="POST" action="?/releaseSeat" use:enhance>
								<input type="hidden" name="claimId" value={myClaim.id} />
								<button type="submit" class="btn btn-outline">{m.carpool_release_seat()}</button>
							</form>
						{/if}
					{:else if !isOwner && canPost && isGuest && guestNamePromptFor === 'claim' && guestClaimTargetPostId === p.id}
						{@render guestNamePrompt(m.carpool_claim_seat())}
					{:else if !isOwner && canPost && (p.seats_available ?? 0) > 0}
						{#if isGuest}
							<button
								type="button"
								class="btn btn-outline"
								disabled={claimActionBusyId === p.id}
								onclick={() => startClaimSeat(p.id)}
							>
								{claimActionBusyId === p.id ? m.carpool_claiming() : m.carpool_claim_seat()}
							</button>
						{:else}
							<form method="POST" action="?/claimSeat" use:enhance>
								<input type="hidden" name="driverPostId" value={p.id} />
								<button type="submit" class="btn btn-outline">{m.carpool_claim_seat()}</button>
							</form>
						{/if}
					{/if}
				</div>
				{#if isGuest}
					{#if claimActionErrorFor === p.id && claimActionSaveRequired}
						{@render guestSaveRequiredNotice()}
					{:else if claimActionErrorFor === p.id && claimActionError}
						<p class="error">{claimActionError}</p>
					{/if}
				{:else if form?.form === `claimSeat:${p.id}` && form?.error}
					<p class="error">{form.error}</p>
				{:else if myClaim && form?.form === `releaseSeat:${myClaim.id}` && form?.error}
					<p class="error">{form.error}</p>
				{/if}
			{/if}
			{#if p.kind === 'rider'}
				<!-- B30: the rider-post mirror of the driver claim/release block
				     above. No capacity check here at all (a rider's request isn't
				     seat-limited the way a driver's post is), just a single
				     "you already expressed interest" state per viewer. `!isOwner`
				     guards the "I'm interested" button specifically: a rider can't
				     express interest in their own post (the Backend rejects it
				     with 400 too, see `create_interest`'s own doc comment), same
				     reasoning as the driver self-claim guard above. -->
				<div class="btn-row">
					{#if myInterest}
						{#if isGuest}
							<button
								type="button"
								class="btn btn-outline"
								disabled={interestActionBusyId === myInterest.id}
								onclick={() => releaseGuestInterest(p.id, myInterest.id)}
							>
								{interestActionBusyId === myInterest.id ? m.carpool_releasing() : m.carpool_withdraw_interest()}
							</button>
						{:else}
							<form method="POST" action="?/releaseInterest" use:enhance>
								<input type="hidden" name="interestId" value={myInterest.id} />
								<button type="submit" class="btn btn-outline">{m.carpool_withdraw_interest()}</button>
							</form>
						{/if}
					{:else if !isOwner && canPost && isGuest && guestNamePromptFor === 'interest' && guestInterestTargetPostId === p.id}
						{@render guestNamePrompt(m.carpool_im_interested())}
					{:else if !isOwner && canPost}
						{#if isGuest}
							<button
								type="button"
								class="btn btn-outline"
								disabled={interestActionBusyId === p.id}
								onclick={() => startExpressInterest(p.id)}
							>
								{interestActionBusyId === p.id ? m.carpool_expressing_interest() : m.carpool_im_interested()}
							</button>
						{:else}
							<form method="POST" action="?/expressInterest" use:enhance>
								<input type="hidden" name="riderPostId" value={p.id} />
								<button type="submit" class="btn btn-outline">{m.carpool_im_interested()}</button>
							</form>
						{/if}
					{/if}
				</div>
				{#if isGuest}
					{#if interestActionErrorFor === p.id && interestActionSaveRequired}
						{@render guestSaveRequiredNotice()}
					{:else if interestActionErrorFor === p.id && interestActionError}
						<p class="error">{interestActionError}</p>
					{/if}
				{:else if form?.form === `expressInterest:${p.id}` && form?.error}
					<p class="error">{form.error}</p>
				{:else if myInterest && form?.form === `releaseInterest:${myInterest.id}` && form?.error}
					<p class="error">{form.error}</p>
				{/if}
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
	<section class="card">
		<p class="card-eyebrow">{m.carpool_add_one_time_event()}</p>
		<form
			method="POST"
			action="?/createCarpoolEvent"
			use:enhance={({ formData }) => {
				startsAtToIso(formData);
				creatingEvent = true;
				return async ({ result, update }) => {
					creatingEvent = false;
					if (result.type === 'success') {
						showNewEvent = false;
						newEventPlace = null;
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="pageId" value={pageId} />
			<label class="field">
				<span>{m.carpool_event_title_field()}</span>
				<input name="title" required />
			</label>
			<label class="field">
				<span>{m.carpool_event_when_field()}</span>
				<input type="datetime-local" name="startsAt" required />
			</label>
			<label class="field">
				<span>{m.carpool_event_destination_field()}</span>
				<input
					name="destinationLabel"
					required
					oninput={() => (newEventPlace = null)}
					use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: (p) => (newEventPlace = p) }}
				/>
			</label>
			{@render destinationHiddenFields(newEventPlace)}
			{#if form?.form === 'createEvent' && form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<button class="btn btn-primary btn-block" type="submit" disabled={creatingEvent}>
				{creatingEvent ? m.carpool_creating_event() : m.carpool_create_event()}
			</button>
		</form>
	</section>
{/if}

{#if events.length === 0}
	<p class="empty">{isAdmin ? m.carpool_no_events_admin() : m.carpool_no_events_member()}</p>
{:else}
	{#if events.length > 1}
		<div class="carpool-event-strip" role="group" aria-label={m.carpool_events_heading()}>
			{#each events as ev (ev.id)}
				<a
					class="carpool-event-chip"
					aria-current={ev.id === selectedEventId}
					href="?event={ev.id}"
				>
					<span class="carpool-event-chip__title">{ev.title}</span>
					<span class="carpool-event-chip__sub">{eventTimeLabel(ev)}</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if selectedEvent}
		{@const ev = selectedEvent}
		<section class="card">
			{#if isAdmin && editingEvent}
				<EditableCard
					saveAction="?/updateCarpoolEvent"
					idName="eventId"
					idValue={ev.id}
					bind:saving={savingEventEdit}
					error={form?.form === 'editEvent' && form?.error}
					beforeSubmit={startsAtToIso}
					onCancel={() => (editingEvent = false)}
				>
					{#snippet fields()}
						<label class="field">
							<span>{m.carpool_event_title_field()}</span>
							<input name="title" bind:value={editTitleDraft} required />
						</label>
						{#if !ev.is_standing}
							<!-- B26: the Backend 400s on any starts_at patch to the
							     standing event, so this input isn't rendered at all
							     for it (an unchanged value would still be "set"). -->
							<label class="field">
								<span>{m.carpool_event_when_field()}</span>
								<input type="datetime-local" name="startsAt" bind:value={editStartsAtDraft} required />
							</label>
						{/if}
						<label class="field">
							<span>{m.carpool_event_destination_field()}</span>
							<!-- Autocomplete sets the input's DOM value directly, which
							     doesn't fire a real `input` event (see `googlePlaces.ts`'s
							     own doc comment on why `oninput` below never fires for a
							     selection). A controlled `bind:value` input like this one
							     needs that mirrored back into the bound state by hand
							     (`onSelectDestination` below), or Svelte's own reactivity
							     would stomp the widget's chosen text back to whatever
							     `editDestinationDraft` still held. -->
							<input
								name="destinationLabel"
								bind:value={editDestinationDraft}
								required
								oninput={() => (editEventPlace = null)}
								use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: onSelectEditDestination }}
							/>
						</label>
						{@render destinationHiddenFields(editEventPlace)}
					{/snippet}
				</EditableCard>
			{:else}
				<div class="list-row">
					<span class="card-title">{ev.title}</span>
					<span class="dim">{STATUS_LABELS[ev.status]()}</span>
				</div>
				<p class="card-meta">{eventTimeLabel(ev)}{#if ev.destination_label} · {ev.destination_label}{/if}</p>
				{#if isAdmin}
					<div class="btn-row">
						<button type="button" class="btn btn-outline" onclick={() => startEditEvent(ev)}>{m.drawer_edit()}</button>
						{#if ev.status !== 'archived'}
							<form method="POST" action="?/updateCarpoolEvent" use:enhance>
								<input type="hidden" name="eventId" value={ev.id} />
								<input type="hidden" name="status" value={ev.status === 'locked' ? 'open' : 'locked'} />
								<button type="submit" class="btn btn-outline">
									{ev.status === 'locked' ? m.carpool_unlock_event() : m.carpool_lock_event()}
								</button>
							</form>
							{#if !ev.is_standing}
								<!-- B26: the Backend rejects archiving the standing
								     event outright, so this button never renders for
								     it in the first place. -->
								<form method="POST" action="?/updateCarpoolEvent" use:enhance>
									<input type="hidden" name="eventId" value={ev.id} />
									<input type="hidden" name="status" value="archived" />
									<button type="submit" class="btn btn-outline">{m.carpool_archive_event()}</button>
								</form>
							{/if}
						{/if}
					</div>
					{#if form?.form === 'editEvent' && form?.error}
						<p class="error">{form.error}</p>
					{/if}
				{:else if ev.status !== 'open'}
					<p class="card-note">
						{ev.status === 'locked' ? m.carpool_event_locked_notice() : m.carpool_event_archived_notice()}
					</p>
				{/if}
			{/if}
		</section>

		<!-- F35: one stacked view, map above the list, whenever `mapsAvailable`
		     (the loader actually confirmed Maps/Places usable), no separate
		     list/map subpage or toggle to switch between them. Otherwise this
		     falls straight through to `driversRidersSections` with no map at
		     all, i.e. today's exact list-only markup, unchanged. -->
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
					{@render guestNamePrompt(m.carpool_offer_ride())}
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
							{#if guestCreateError}
								<p class="error">{guestCreateError}</p>
							{/if}
							{#if guestSaveRequired}
								{@render guestSaveRequiredNotice()}
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
							{@render originHiddenFields(offerPlace, offerExact)}
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
					{@render guestNamePrompt(m.carpool_request_ride())}
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
								<span>{m.carpool_notes_field()}</span>
								<input bind:value={guestRequestNotes} placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input type="tel" bind:value={guestRequestContactPhone} placeholder={m.groups_optional()} />
							</label>
							{#if guestCreateError}
								<p class="error">{guestCreateError}</p>
							{/if}
							{#if guestSaveRequired}
								{@render guestSaveRequiredNotice()}
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
							{@render originHiddenFields(requestPlace, requestExact)}
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input name="notes" placeholder={m.groups_optional()} />
							</label>
							<label class="field">
								<span>{m.carpool_contact_phone_field()}</span>
								<input name="contactPhone" type="tel" placeholder={m.groups_optional()} />
							</label>
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

{#snippet guestNamePrompt(confirmLabel: string)}
	<form
		class="signup-name-form"
		onsubmit={(e) => {
			e.preventDefault();
			confirmGuestName();
		}}
	>
		<label class="field">
			<span>{m.responsibilities_name_prompt()}</span>
			<input bind:value={guestNameDraft} required autocomplete="name" />
		</label>
		<div class="btn-row">
			<button type="button" class="text-link" onclick={() => (guestNamePromptFor = null)}>
				{m.join_not_now()}
			</button>
			<button type="submit" class="btn btn-primary" disabled={guestNameDraft.trim().length === 0}>
				{confirmLabel}
			</button>
		</div>
	</form>
{/snippet}

{#snippet guestSaveRequiredNotice()}
	<p class="signup-save-required">
		{m.carpool_save_required()}
		<a class="text-link" href={lh('/login?mode=register')}>{m.settings_create_account()}</a>
	</p>
{/snippet}

<!-- F35: the member offer/request forms' hidden coordinate fields, shared
     between the two so a real `<form>` submit's `FormData` carries them
     without repeating the same four inputs at both call sites. Nothing
     renders at all when `place` is `null` (Places unavailable, or the
     member never picked a place), so a plain free-text submission sends
     none of these, exactly as it did before this milestone; see
     `originCoordinatesPayload` (`$lib/utils/carpool.ts`) on the receiving
     end in `actions/carpool.ts`. -->
{#snippet originHiddenFields(place: PlaceSelection | null, exact: boolean)}
	{#if place}
		<input type="hidden" name="originLatitude" value={place.latitude} />
		<input type="hidden" name="originLongitude" value={place.longitude} />
		{#if place.placeId}<input type="hidden" name="originPlaceId" value={place.placeId} />{/if}
		<input type="hidden" name="originPrecision" value={exact ? 'exact' : 'approximate'} />
	{/if}
{/snippet}

<!-- Same idea as `originHiddenFields` above, for the admin event create/edit
     forms' destination pin. No `precision` field here at all: a venue pin
     is never privacy-rounded (see `destinationCoordinatesPayload`'s own
     doc comment), so there's nothing to pick between exact/approximate. -->
{#snippet destinationHiddenFields(place: PlaceSelection | null)}
	{#if place}
		<input type="hidden" name="destinationLatitude" value={place.latitude} />
		<input type="hidden" name="destinationLongitude" value={place.longitude} />
		{#if place.placeId}<input type="hidden" name="destinationPlaceId" value={place.placeId} />{/if}
	{/if}
{/snippet}

<style>
	.carpool-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	/* Same horizontal-scroll strip shape as Responsibilities' date chips:
	   stays one row tall however many events a group has. */
	.carpool-event-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.carpool-event-chip {
		flex: 0 0 9rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		color: inherit;
		text-decoration: none;
	}

	.carpool-event-chip[aria-current='true'] {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
	}

	.carpool-event-chip__title {
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--text);
	}

	.carpool-event-chip__sub {
		font-size: 0.75rem;
		color: var(--text-muted);
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

	.carpool-post-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	/* F29 guest write path — same shapes as the join page's own responsibility
	   self-signup prompt (`routes/join/[code]/+page.svelte`), duplicated here
	   rather than shared since Svelte scopes `<style>` per component. */
	.signup-name-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.signup-save-required {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
</style>
