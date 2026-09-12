<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import EditableCard from './EditableCard.svelte';
	import ConfirmButton from './ConfirmButton.svelte';
	import { datetimeLocalToIso, formatDateTime, toDatetimeLocalValue } from '$lib/utils/dates';
	import { driverOfferError, riderRequestError } from '$lib/utils/carpool';
	import { isOwnedCarpoolPost, rememberCarpoolPost } from '$lib/utils/carpoolOwnership';
	import { ensureLocalId, localProfile, markSignedUp, needsName, setDisplayName } from '$lib/localProfile';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { CarpoolEventOut, CarpoolPostOut } from '$lib/server/backendTypes';

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
	 * types. */
	let {
		pageId,
		isAdmin,
		userId,
		events,
		selectedEventId,
		posts,
		form,
		guest = null
	}: {
		pageId: string;
		isAdmin: boolean;
		userId: string;
		events: CarpoolEventOut[];
		selectedEventId: string | null;
		posts: CarpoolPostOut[];
		form: { form?: string; error?: string } | null;
		guest?: { code: string } | null;
	} = $props();

	let isGuest = $derived(guest !== null);

	let selectedEvent = $derived(events.find((e) => e.id === selectedEventId) ?? null);
	let drivers = $derived(posts.filter((p) => p.kind === 'driver'));
	let riders = $derived(posts.filter((p) => p.kind === 'rider'));
	// Admin always bypasses the lock/archive gate when posting (the Backend
	// does the same); a member can only post to a genuinely open event.
	let canPost = $derived(isAdmin || selectedEvent?.status === 'open');

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
	let savingPostEdit = $state(false);
	function startEditPost(p: CarpoolPostOut) {
		editOriginDraft = p.origin_label;
		editSeatsDraft = p.seats_total ?? undefined;
		editLeaveDraft = p.leave_time_text ?? '';
		editNotesDraft = p.notes ?? '';
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
	// then act" order the responsibility self-signup uses.
	let guestNamePromptFor = $state<'offer' | 'request' | null>(null);
	let guestNameDraft = $state('');

	let guestOfferOrigin = $state('');
	let guestOfferSeats = $state<number | undefined>(undefined);
	let guestOfferLeaveTime = $state('');
	let guestOfferNotes = $state('');
	let guestRequestOrigin = $state('');
	let guestRequestNotes = $state('');

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
		guestNamePromptFor = null;
		if (target === 'offer') offeringRide = true;
		else if (target === 'request') requestingRide = true;
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
				notes: guestOfferNotes
			},
			() => {
				offeringRide = false;
				guestOfferOrigin = '';
				guestOfferSeats = undefined;
				guestOfferLeaveTime = '';
				guestOfferNotes = '';
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
			{ kind: 'rider', originLabel: guestRequestOrigin, notes: guestRequestNotes },
			() => {
				requestingRide = false;
				guestRequestOrigin = '';
				guestRequestNotes = '';
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
					{/snippet}
				</EditableCard>
			{/if}
		{:else}
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
				{/if}
				{#if p.notes}<p class="card-note">{p.notes}</p>{/if}
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
					if (result.type === 'success') showNewEvent = false;
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
				<input name="destinationLabel" required />
			</label>
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
							<input name="destinationLabel" bind:value={editDestinationDraft} required />
						</label>
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
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input bind:value={guestOfferOrigin} required />
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
									if (result.type === 'success') offeringRide = false;
									await update();
								};
							}}
						>
							<input type="hidden" name="eventId" value={ev.id} />
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input name="originLabel" required />
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
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input bind:value={guestRequestOrigin} required />
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input bind:value={guestRequestNotes} placeholder={m.groups_optional()} />
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
									if (result.type === 'success') requestingRide = false;
									await update();
								};
							}}
						>
							<input type="hidden" name="eventId" value={ev.id} />
							<label class="field">
								<span>{m.carpool_origin_field()}</span>
								<input name="originLabel" required />
							</label>
							<label class="field">
								<span>{m.carpool_notes_field()}</span>
								<input name="notes" placeholder={m.groups_optional()} />
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
	{/if}
{/if}

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
