<script lang="ts">
	import '$lib/styles/shell.css';
</script>

<main class="shell">
	<p class="crumbs"><a href="/settings">Settings</a> / More</p>
	<h1 class="title">More</h1>

	<section class="card">
		<p class="card-eyebrow">About Divisi</p>
		<p class="card-meta body">
			Divisi is a small, self-hosted choir companion app — score, audio, homework, and your
			part, kept in sync.
		</p>
	</section>

	<section class="card">
		<p class="card-eyebrow">Creating a group</p>
		<p class="card-meta body">
			Group creation isn't open to everyone right now — Divisi runs on one small server, and a
			new group is real hosting cost, not just a database row.
		</p>
		<p class="card-meta body">
			If you'd like to start a group here for your own choir — and you're open to helping cover
			hosting so the app can support more of them — get in touch and we'll set one up.
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
</style>
