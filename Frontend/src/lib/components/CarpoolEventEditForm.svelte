<script lang="ts">
	import { googlePlacesAutocomplete, type PlaceSelection } from '$lib/actions/googlePlaces';
	import { datetimeLocalToIso, toDatetimeLocalValue } from '$lib/utils/dates';
	import type { GoogleMapsConfig } from '$lib/utils/googleMaps';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolEventOut } from '$lib/server/backendTypes';
	import CarpoolDestinationHiddenFields from './CarpoolDestinationHiddenFields.svelte';
	import EditableCard from './EditableCard.svelte';

	let {
		event,
		mapsConfig,
		form,
		onCancel
	}: {
		event: CarpoolEventOut;
		mapsConfig: GoogleMapsConfig;
		form: { form?: string; error?: string } | null;
		onCancel: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let titleDraft = $state(event.title);
	// svelte-ignore state_referenced_locally
	let startsAtDraft = $state(event.starts_at ? toDatetimeLocalValue(event.starts_at) : '');
	// svelte-ignore state_referenced_locally
	let destinationDraft = $state(event.destination_label ?? '');
	let destinationPlace = $state<PlaceSelection | null>(null);
	let saving = $state(false);

	function startsAtToIso(formData: FormData) {
		const raw = String(formData.get('startsAt') ?? '');
		if (raw) formData.set('startsAt', datetimeLocalToIso(raw));
	}

	function onSelectDestination(place: PlaceSelection) {
		destinationPlace = place;
		destinationDraft = place.label;
	}
</script>

<EditableCard
	saveAction="?/updateCarpoolEvent"
	idName="eventId"
	idValue={event.id}
	bind:saving
	error={form?.form === 'editEvent' && form?.error}
	beforeSubmit={startsAtToIso}
	{onCancel}
>
	{#snippet fields()}
		<label class="field">
			<span>{m.carpool_event_title_field()}</span>
			<input name="title" bind:value={titleDraft} required />
		</label>
		{#if !event.is_standing}
			<label class="field">
				<span>{m.carpool_event_when_field()}</span>
				<input type="datetime-local" name="startsAt" bind:value={startsAtDraft} required />
			</label>
		{/if}
		<label class="field">
			<span>{m.carpool_event_destination_field()}</span>
			<input
				name="destinationLabel"
				bind:value={destinationDraft}
				required
				oninput={() => (destinationPlace = null)}
				use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: onSelectDestination }}
			/>
		</label>
		<CarpoolDestinationHiddenFields place={destinationPlace} />
	{/snippet}
</EditableCard>
