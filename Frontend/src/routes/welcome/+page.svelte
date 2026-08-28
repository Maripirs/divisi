<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import '$lib/styles/shell.css';

	const steps = [
		{
			title: 'Join a choir or practice on your own',
			body: 'Your choir can share rehearsal tracks and homework. You can also keep personal pieces in your own library.'
		},
		{
			title: 'Choose what you need to hear and see',
			body: 'Practice your part alone, with accompaniment, or inside the full score.'
		},
		{
			title: 'Follow the music as it plays',
			body: 'The score moves with the audio, so you always know where you are.'
		}
		// Annotations are hidden app-wide for now (see Frontend/plan.md's F3
		// log) — dropped from this step list too, so onboarding doesn't
		// promise a feature that isn't visible anywhere else in the app.
	];
</script>

<main class="shell welcome">
	<div class="hero">
		<Logo size={64} />
		<h1>Divisi</h1>
		<p class="tagline">The choir companion app</p>
		<p class="pitch">Practice choral music with the score, audio, and your part in sync.</p>
		<a class="btn btn-primary btn-block" href="/home">Get started</a>
	</div>

	<div class="card">
		<p class="card-eyebrow">How Divisi works</p>
		<ol class="steps">
			{#each steps as step, i (step.title)}
				<li>
					<span class="step-number">{i + 1}</span>
					<span class="step-text"><b>{step.title}.</b> {step.body}</span>
				</li>
			{/each}
		</ol>
	</div>

	<div class="btn-row">
		<a class="btn btn-outline btn-block" href="/join">Join a group</a>
	</div>

	<p class="login-link">Already have an account? <a href="/login">Log in</a></p>
</main>

<style>
	.welcome {
		padding-bottom: 3rem;
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		text-align: center;
		padding-top: 0.5rem;
	}

	.hero h1 {
		margin: 0.3rem 0 0;
		font-size: 1.75rem;
		font-weight: 800;
		color: var(--text);
	}

	.tagline {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.pitch {
		margin: 0.35rem 0 1rem;
		max-width: 30ch;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text);
	}

	.hero .btn {
		max-width: 20rem;
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.steps li {
		display: flex;
		gap: 0.6rem;
	}

	.step-number {
		flex: 0 0 auto;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--accent);
		font-size: 0.75rem;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.step-text {
		font-size: 0.8438rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.step-text b {
		color: var(--text);
		font-weight: 700;
	}

	.btn-row {
		display: flex;
		gap: 0.5rem;
	}

	.btn-row .btn {
		flex: 1;
	}

	.login-link {
		margin: 0.25rem 0 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.login-link a {
		color: var(--accent);
	}
</style>
