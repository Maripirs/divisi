<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolEventOut } from '$lib/server/backendTypes';

	let {
		events,
		selectedEventId,
		eventTimeLabel
	}: {
		events: CarpoolEventOut[];
		selectedEventId: string | null;
		eventTimeLabel: (event: CarpoolEventOut) => string;
	} = $props();
</script>

<div class="carpool-event-strip" role="group" aria-label={m.carpool_events_heading()}>
	{#each events as ev (ev.id)}
		<a class="carpool-event-chip" aria-current={ev.id === selectedEventId} href="?event={ev.id}">
			<span class="carpool-event-chip__title">{ev.title}</span>
			<span class="carpool-event-chip__sub">{eventTimeLabel(ev)}</span>
		</a>
	{/each}
</div>

<style>
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
</style>
