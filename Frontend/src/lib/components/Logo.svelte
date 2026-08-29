<script lang="ts">
	import logoMask from '$lib/assets/divisi-logo-mask.png';
	import { m } from '$lib/paraglide/messages';

	interface Props {
		size?: number;
	}

	let { size = 40 }: Props = $props();
</script>

<!-- Painted via CSS mask + `background-color: var(--accent)` rather than a
     flat-colored image, so it tracks the live accent token — theme swap or
     any future custom palette — instead of a color baked into the asset. -->
<span
	class="logo"
	role="img"
	aria-label={m.logo_aria_label()}
	style="--logo-size: {size}px; --logo-mask: url({logoMask})"
></span>

<style>
	.logo {
		display: block;
		width: var(--logo-size);
		height: var(--logo-size);
		flex-shrink: 0;
		border-radius: 22%;
		background-color: var(--accent);
		-webkit-mask-image: var(--logo-mask);
		mask-image: var(--logo-mask);
		-webkit-mask-repeat: no-repeat;
		mask-repeat: no-repeat;
		-webkit-mask-position: center;
		mask-position: center;
		-webkit-mask-size: contain;
		mask-size: contain;
	}
</style>
