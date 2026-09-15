<script lang="ts">
	import type { PlaceSelection } from '$lib/actions/googlePlaces';

	let {
		place,
		exact
	}: {
		place: PlaceSelection | null;
		exact: boolean;
	} = $props();
</script>

{#if place}
	<input type="hidden" name="originLatitude" value={place.latitude} />
	<input type="hidden" name="originLongitude" value={place.longitude} />
	{#if place.placeId}<input type="hidden" name="originPlaceId" value={place.placeId} />{/if}
	<input type="hidden" name="originPrecision" value={exact ? 'exact' : 'approximate'} />
{/if}
