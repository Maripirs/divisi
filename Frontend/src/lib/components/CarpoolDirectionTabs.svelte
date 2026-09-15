<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { CarpoolDirectionFilter } from '$lib/utils/carpool';

	let {
		value,
		onChange
	}: {
		value: CarpoolDirectionFilter;
		onChange: (value: CarpoolDirectionFilter) => void;
	} = $props();
</script>

<div class="tabs" role="tablist" aria-label={m.carpool_direction_field()}>
	<button
		type="button"
		class="tab"
		class:active={value === 'there'}
		role="tab"
		aria-selected={value === 'there'}
		onclick={() => onChange('there')}
	>
		{m.carpool_leg_there()}
	</button>
	<button
		type="button"
		class="tab"
		class:active={value === 'back'}
		role="tab"
		aria-selected={value === 'back'}
		onclick={() => onChange('back')}
	>
		{m.carpool_leg_back()}
	</button>
</div>
