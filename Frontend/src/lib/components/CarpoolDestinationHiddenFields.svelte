<script lang="ts">
	import type { PlaceSelection } from '$lib/actions/googlePlaces';

	let { place }: { place: PlaceSelection | null } = $props();
</script>

{#if place}
	<input type="hidden" name="destinationLatitude" value={place.latitude} />
	<input type="hidden" name="destinationLongitude" value={place.longitude} />
	{#if place.placeId}<input type="hidden" name="destinationPlaceId" value={place.placeId} />{/if}
{/if}
