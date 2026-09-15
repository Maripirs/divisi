<script lang="ts">
	import { enhance } from '$app/forms';
	import { googlePlacesAutocomplete, type PlaceSelection } from '$lib/actions/googlePlaces';
	import { datetimeLocalToIso } from '$lib/utils/dates';
	import type { GoogleMapsConfig } from '$lib/utils/googleMaps';
	import { m } from '$lib/paraglide/messages';
	import CarpoolDestinationHiddenFields from './CarpoolDestinationHiddenFields.svelte';

	let {
		mapsConfig,
		form,
		onCreated
	}: {
		mapsConfig: GoogleMapsConfig;
		form: { form?: string; error?: string } | null;
		onCreated: () => void;
	} = $props();

	let destinationPlace = $state<PlaceSelection | null>(null);
	let creating = $state(false);

	function startsAtToIso(formData: FormData) {
		const raw = String(formData.get('startsAt') ?? '');
		if (raw) formData.set('startsAt', datetimeLocalToIso(raw));
	}
</script>

<section class="card">
	<p class="card-eyebrow">{m.carpool_add_one_time_event()}</p>
	<form
		method="POST"
		action="?/createCarpoolEvent"
		use:enhance={({ formData }) => {
			startsAtToIso(formData);
			creating = true;
			return async ({ result, update }) => {
				creating = false;
				if (result.type === 'success') {
					destinationPlace = null;
					onCreated();
				}
				await update();
			};
		}}
	>
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
				oninput={() => (destinationPlace = null)}
				use:googlePlacesAutocomplete={{ config: mapsConfig, onSelect: (p) => (destinationPlace = p) }}
			/>
		</label>
		<CarpoolDestinationHiddenFields place={destinationPlace} />
		{#if form?.form === 'createEvent' && form?.error}
			<p class="error">{form.error}</p>
		{/if}
		<button class="btn btn-primary btn-block" type="submit" disabled={creating}>
			{creating ? m.carpool_creating_event() : m.carpool_create_event()}
		</button>
	</form>
</section>
