<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolEventOut } from '$lib/server/backendTypes';

	let {
		event,
		isAdmin,
		form,
		eventTimeLabel,
		onEdit
	}: {
		event: CarpoolEventOut;
		isAdmin: boolean;
		form: { form?: string; error?: string } | null;
		eventTimeLabel: (event: CarpoolEventOut) => string;
		onEdit: (event: CarpoolEventOut) => void;
	} = $props();

	const STATUS_LABELS: Record<CarpoolEventOut['status'], () => string> = {
		open: m.carpool_status_open,
		locked: m.carpool_status_locked,
		archived: m.carpool_status_archived
	};
</script>

<div class="list-row">
	<span class="card-title">{event.title}</span>
	<span class="dim">{STATUS_LABELS[event.status]()}</span>
</div>
<p class="card-meta">{eventTimeLabel(event)}{#if event.destination_label} · {event.destination_label}{/if}</p>
{#if isAdmin}
	<div class="btn-row">
		<button type="button" class="btn btn-outline" onclick={() => onEdit(event)}>{m.drawer_edit()}</button>
		{#if event.status !== 'archived'}
			<form method="POST" action="?/updateCarpoolEvent" use:enhance>
				<input type="hidden" name="eventId" value={event.id} />
				<input type="hidden" name="status" value={event.status === 'locked' ? 'open' : 'locked'} />
				<button type="submit" class="btn btn-outline">
					{event.status === 'locked' ? m.carpool_unlock_event() : m.carpool_lock_event()}
				</button>
			</form>
			{#if !event.is_standing}
				<form method="POST" action="?/updateCarpoolEvent" use:enhance>
					<input type="hidden" name="eventId" value={event.id} />
					<input type="hidden" name="status" value="archived" />
					<button type="submit" class="btn btn-outline">{m.carpool_archive_event()}</button>
				</form>
			{/if}
		{/if}
	</div>
	{#if form?.form === 'editEvent' && form?.error}
		<p class="error">{form.error}</p>
	{/if}
{:else if event.status !== 'open'}
	<p class="card-note">
		{event.status === 'locked' ? m.carpool_event_locked_notice() : m.carpool_event_archived_notice()}
	</p>
{/if}
