<script lang="ts">
	import '$lib/styles/shell.css';

	const portfolioUrl = 'https://your-portfolio-url.example';
</script>

<main class="shell">
	<p class="crumbs"><a href="/settings">Settings</a> / More</p>
	<h1 class="title">More</h1>

	<section class="card">
		<p class="card-eyebrow">About Divisi</p>
		<p class="card-meta body">
			Divisi is a choir companion app for singers, section leaders, and directors.
		</p>
		<p class="card-meta body">
			It brings scores, rehearsal tracks, assignments, and personal practice notes into one
			place. Singers can practice with their part, accompaniment, and score in sync, while
			groups can organize shared materials and homework.
		</p>
		<p class="card-meta body">
			Built by
			<a class="text-link" href={portfolioUrl} target="_blank" rel="noreferrer">Maripi</a>
		</p>
	</section>

	<section class="card">
		<p class="card-eyebrow">Creating a group</p>
		<p class="card-meta body">
			Group creation is available by request while Divisi is still small.
		</p>
		<p class="card-meta body">
			Each group needs dedicated setup for members, assignments, scores, audio, and shared
			materials. For now, new groups are created intentionally so the app can stay stable and
			useful.
		</p>
		<p class="card-meta body">
			If you would like to use Divisi with your choir, reach out to discuss setting up a
			group.
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
