<script lang="ts">
	import { page } from '$app/state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	const portfolioUrl = 'https://maripi.net';

	// Same guest-join-code handling `/settings` itself uses — this page is
	// linked from there with no `?code=` carried along automatically, but a
	// guest can still land here, and both the header's brand link and the
	// footer below should send them back to their group, not a login-gated
	// dashboard they have no access to.
	let guestJoinCode = $derived(page.url.searchParams.get('code'));
</script>

<main class="shell">
	<AppHeader title={m.settings_more()} homeHref={guestJoinCode ? lh(`/join/${guestJoinCode}`) : lh('/home')} />

	<section class="card">
		<p class="card-eyebrow">{m.more_about_title()}</p>
		<p class="card-meta body">
			{m.more_about_body1()}
		</p>
		<p class="card-meta body">
			{m.more_about_body2()}
		</p>
		<p class="card-meta body">
			{m.more_built_by()}
			<a class="text-link" href={portfolioUrl} target="_blank" rel="noreferrer">Maripi</a>
		</p>
	</section>

	<section class="card">
		<p class="card-eyebrow">{m.more_creating_group_title()}</p>
		<p class="card-meta body">
			{m.more_creating_group_body1()}
		</p>
		<p class="card-meta body">
			{m.more_creating_group_body2()}
		</p>
		<p class="card-meta body">
			{m.more_creating_group_body3()}
		</p>
	</section>
</main>

<style>
	.body {
		color: var(--text);
	}

	.text-link {
		color: var(--accent);
		font-weight: 800;
		text-decoration: none;
	}

	.text-link:hover {
		text-decoration: underline;
	}
</style>
