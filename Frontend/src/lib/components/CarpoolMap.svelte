<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	import { loadGoogleMaps, type GoogleMapsHandle } from '$lib/utils/googleMaps';
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolEventOut, CarpoolPostOut } from '$lib/server/backendTypes';

	/** F35 (Carpool Map): the map half of a carpool board, rendered by
	 * `CarpoolBoard.svelte` alongside (desktop) or instead of (mobile "Map"
	 * toggle) the plain driver/rider lists it already renders unconditionally.
	 *
	 * There's no admin on/off switch for this any more: this component always
	 * attempts to load Maps itself, on mount, as soon as it's actually
	 * included in the DOM (never at import time, never speculatively for a
	 * page that might show it later). Whether anything actually renders comes
	 * down to two independent checks: the loader has to confirm a real handle
	 * (see `googleMaps.ts`'s own doc comment on "no Google Maps configured"
	 * behaving as a safe no-op), and there has to be at least one real pin to
	 * show (`hasAnyPin` below). Either one failing renders nothing: no
	 * placeholder box, no error, nothing a screen reader or a layout would
	 * even notice is missing.
	 *
	 * Pins: a driver/rider post only gets a marker when it actually carries
	 * `origin_latitude`/`origin_longitude` (most won't, the pin is always
	 * optional, see `CarpoolBoard.svelte`'s form doc comments), and the
	 * event only gets a destination marker the same way. No fabricated
	 * location ever appears here. If literally nothing has a pin yet, this
	 * skips creating a `google.maps.Map` at all and shows a one-line note
	 * instead of an empty gray rectangle centered on an arbitrary point,
	 * a judgment call the milestone brief left open ("show a reasonable
	 * empty/default view, or skip rendering and say so"). Skipping avoids
	 * ever having to invent a center with no real content to justify it. */
	let {
		destination,
		drivers,
		riders
	}: {
		destination: CarpoolEventOut | null;
		drivers: CarpoolPostOut[];
		riders: CarpoolPostOut[];
	} = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	// `null` = still loading (or not attempted); `false` = confirmed
	// unavailable; a real handle = ready to draw markers into.
	let handle: GoogleMapsHandle | null | false = $state(null);

	onMount(() => {
		let cancelled = false;
		void loadGoogleMaps({
			apiKey: env.PUBLIC_GOOGLE_MAPS_API_KEY || undefined,
			mapId: env.PUBLIC_GOOGLE_MAPS_MAP_ID || undefined
		}).then((h) => {
			if (cancelled) return;
			handle = h ?? false;
		});
		return () => {
			cancelled = true;
		};
	});

	function hasOrigin(p: CarpoolPostOut): p is CarpoolPostOut & { origin_latitude: number; origin_longitude: number } {
		return p.origin_latitude != null && p.origin_longitude != null;
	}

	let driverPins = $derived(drivers.filter(hasOrigin));
	let riderPins = $derived(riders.filter(hasOrigin));
	let destinationPin = $derived(
		destination?.destination_latitude != null && destination?.destination_longitude != null
			? { lat: destination.destination_latitude, lng: destination.destination_longitude }
			: null
	);
	let hasAnyPin = $derived(driverPins.length > 0 || riderPins.length > 0 || destinationPin !== null);

	let map: google.maps.Map | null = null;
	let markers: google.maps.marker.AdvancedMarkerElement[] = [];

	function pinContent(handle: GoogleMapsHandle, background: string, glyphText: string): HTMLElement {
		const pin = new handle.maps.marker.PinElement({ background, borderColor: '#00000055', glyphText });
		return pin.element;
	}

	// Rebuilds the map + markers whenever the container mounts, the loader
	// finishes, or the underlying pins change (a new post, a moved event
	// destination, switching which event is selected). Cheap enough to
	// rebuild markers from scratch each time rather than diffing: carpool
	// boards run to dozens of posts at most, not thousands.
	$effect(() => {
		if (!handle || !containerEl || !hasAnyPin) return;
		const h = handle;
		const firstDriver = driverPins[0];
		const firstRider = riderPins[0];
		const center =
			destinationPin ??
			(firstDriver ? { lat: firstDriver.origin_latitude, lng: firstDriver.origin_longitude } : null) ??
			(firstRider ? { lat: firstRider.origin_latitude, lng: firstRider.origin_longitude } : null);
		if (!center) return;

		if (!map) {
			map = new h.maps.Map(containerEl, { center, zoom: 11, mapId: h.mapId });
		} else {
			map.setCenter(center);
		}

		for (const marker of markers) marker.map = null;
		markers = [];

		if (destinationPin) {
			markers.push(
				new h.maps.marker.AdvancedMarkerElement({
					map,
					position: destinationPin,
					title: m.carpool_map_destination_label(),
					content: pinContent(h, '#c0392b', '\u{1F3C1}')
				})
			);
		}
		for (const p of driverPins) {
			markers.push(
				new h.maps.marker.AdvancedMarkerElement({
					map,
					position: { lat: p.origin_latitude, lng: p.origin_longitude },
					title: p.display_name,
					content: pinContent(h, '#2e7d32', '\u{1F697}')
				})
			);
		}
		for (const p of riderPins) {
			markers.push(
				new h.maps.marker.AdvancedMarkerElement({
					map,
					position: { lat: p.origin_latitude, lng: p.origin_longitude },
					title: p.display_name,
					content: pinContent(h, '#1565c0', '\u{1F9CD}')
				})
			);
		}
	});
</script>

{#if handle}
	{#if hasAnyPin}
		<div class="carpool-map" bind:this={containerEl} role="img" aria-label={m.carpool_map_aria_label()}></div>
	{:else}
		<p class="empty carpool-map-empty">{m.carpool_map_no_pins()}</p>
	{/if}
{/if}

<style>
	.carpool-map {
		width: 100%;
		height: 100%;
		min-height: 18rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		overflow: hidden;
	}

	.carpool-map-empty {
		min-height: 8rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
	}
</style>
