<script lang="ts">
	import { enhance } from '$app/forms';
	import EditableCard from './EditableCard.svelte';
	import ConfirmButton from './ConfirmButton.svelte';
	import { datetimeLocalToIso, formatDateTime, toDatetimeLocalValue } from '$lib/utils/dates';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolEventOut, CarpoolPostOut } from '$lib/server/backendTypes';

	/** B24/F28: the real content behind a carpool-template `GroupCustomPage`
	 * (event selector, driver/rider lists, the "I can drive"/"I need a
	 * ride" forms, owner edit/delete, and, for an admin, event create/edit/
	 * lock/archive plus post moderation). Rendered directly by `routes/
	 * groups/[id]/pages/[slug]/+page.svelte` in place of `CustomPageView`'s
	 * placeholder once `template_key === 'carpool_board'`. The guest route
	 * keeps using that placeholder unchanged since no guest carpool routes
	 * exist on the Backend at all (writes *and* reads).
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
		form
	}: {
		pageId: string;
		isAdmin: boolean;
		userId: string;
		events: CarpoolEventOut[];
		selectedEventId: string | null;
		posts: CarpoolPostOut[];
		form: { form?: string; error?: string } | null;
	} = $props();

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
		editStartsAtDraft = toDatetimeLocalValue(ev.starts_at);
		editDestinationDraft = ev.destination_label;
		editingEvent = true;
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
</script>

{#snippet postRow(p: CarpoolPostOut)}
	{@const isOwner = p.user_id === userId}
	<div class="carpool-post">
		{#if editingPostId === p.id}
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
			{m.carpool_new_event()}
		</button>
	{/if}
</div>

{#if isAdmin && showNewEvent}
	<section class="card">
		<p class="card-eyebrow">{m.carpool_new_event()}</p>
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
					<span class="carpool-event-chip__sub">{formatDateTime(ev.starts_at)}</span>
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
						<label class="field">
							<span>{m.carpool_event_when_field()}</span>
							<input type="datetime-local" name="startsAt" bind:value={editStartsAtDraft} required />
						</label>
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
				<p class="card-meta">{formatDateTime(ev.starts_at)} · {ev.destination_label}</p>
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
							<form method="POST" action="?/updateCarpoolEvent" use:enhance>
								<input type="hidden" name="eventId" value={ev.id} />
								<input type="hidden" name="status" value="archived" />
								<button type="submit" class="btn btn-outline">{m.carpool_archive_event()}</button>
							</form>
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
				{#if offeringRide}
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
				{:else}
					<button type="button" class="btn btn-outline btn-block" onclick={() => (offeringRide = true)}>
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
				{#if requestingRide}
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
				{:else}
					<button type="button" class="btn btn-outline btn-block" onclick={() => (requestingRide = true)}>
						{m.carpool_request_ride()}
					</button>
				{/if}
			{/if}
		</section>
	{/if}
{/if}

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
</style>
