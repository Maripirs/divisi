// F35: Svelte action that attaches Google Places Autocomplete to a plain
// text `<input>`, used on the carpool board's origin/destination fields
// (`CarpoolBoard.svelte`). Kept as a standalone action rather than inline
// component logic so the same wiring works on every input that needs it
// (member/guest offer/request forms, admin event create/edit) without
// duplicating the load/attach/cleanup dance at each call site.
//
// A no-op by construction whenever Maps isn't configured/available: this
// just awaits `loadGoogleMaps` (see that module's own "maps unavailable is
// a normal, silent case" doc comment) and never attaches anything if that
// resolves to `null`, so a form using this action keeps working as a plain
// text input with no behavior change at all in that case.

import type { Action } from 'svelte/action';
import { loadGoogleMaps, type GoogleMapsConfig } from '$lib/utils/googleMaps';

export interface PlaceSelection {
	/** The human-readable label to show back in the input (falls back to
	 * whatever the user had already typed if Google returns neither). */
	label: string;
	latitude: number;
	longitude: number;
	placeId: string | null;
}

export interface GooglePlacesAutocompleteParams {
	config: GoogleMapsConfig;
	onSelect: (place: PlaceSelection) => void;
}

export const googlePlacesAutocomplete: Action<HTMLInputElement, GooglePlacesAutocompleteParams> = (
	node,
	params
) => {
	let current = params;
	let cancelled = false;
	let autocomplete: google.maps.places.Autocomplete | null = null;

	async function attach() {
		const handle = await loadGoogleMaps(current.config);
		if (cancelled || !handle) return;
		// Places is deliberately not part of the base script's `libraries=`
		// param: the plan doc's cost strategy calls for deferring it until a
		// form that actually needs it is open, and this action only ever
		// mounts on an input that's already visible for that reason.
		const places = (await handle.maps.importLibrary('places')) as google.maps.PlacesLibrary;
		if (cancelled) return;
		autocomplete = new places.Autocomplete(node, {
			fields: ['geometry', 'place_id', 'formatted_address', 'name']
		});
		autocomplete.addListener('place_changed', () => {
			const place = autocomplete?.getPlace();
			const location = place?.geometry?.location;
			if (!place || !location) return; // A free-text Enter with no real place picked: nothing to capture.
			current.onSelect({
				label: place.formatted_address ?? place.name ?? node.value,
				latitude: location.lat(),
				longitude: location.lng(),
				placeId: place.place_id ?? null
			});
		});
	}

	void attach();

	return {
		update(newParams) {
			current = newParams;
		},
		destroy() {
			cancelled = true;
			if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
		}
	};
};
