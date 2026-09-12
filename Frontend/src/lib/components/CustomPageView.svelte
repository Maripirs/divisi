<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	/** F27: the read-only shell every custom page (member, guest, or an
	 * admin's own preview) renders through, regardless of how it got the
	 * page's title/template: this milestone's whole content story is "title
	 * plus an empty state," so one template's worth of markup is all this
	 * needs. B24/F28 gives `carpool_board` real content; a second template
	 * value would add a branch here rather than a rewrite. */
	let { title, templateKey }: { title: string; templateKey: 'carpool_board' } = $props();
</script>

<section class="card">
	<p class="card-eyebrow">{title}</p>
	{#if templateKey === 'carpool_board'}
		<p class="empty">{m.pages_carpool_coming_soon()}</p>
	{/if}
</section>
