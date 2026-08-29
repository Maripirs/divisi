<script lang="ts">
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	const portfolioUrl = 'https://your-portfolio-url.example';
</script>

<main class="shell">
	<p class="crumbs"><a href={lh('/settings')}>{m.settings_title()}</a> / {m.settings_more()}</p>
	<h1 class="title">{m.settings_more()}</h1>

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
	.title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text);
	}

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
