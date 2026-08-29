<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	const steps = [
		{
			title: m.welcome_step1_title,
			body: m.welcome_step1_body
		},
		{
			title: m.welcome_step2_title,
			body: m.welcome_step2_body
		},
		{
			title: m.welcome_step3_title,
			body: m.welcome_step3_body
		}
		// Annotations are hidden app-wide for now (see Frontend/plan.md's F3
		// log) — dropped from this step list too, so onboarding doesn't
		// promise a feature that isn't visible anywhere else in the app.
	];
</script>

<main class="shell welcome">
	<LanguageSwitcher />
	<div class="hero">
		<Logo size={64} />
		<h1>Divisi</h1>
		<p class="tagline">{m.welcome_tagline()}</p>
		<p class="pitch">{m.welcome_pitch()}</p>
		<a class="btn btn-primary btn-block" href={lh('/home')}>{m.welcome_get_started()}</a>
	</div>

	<div class="card">
		<p class="card-eyebrow">{m.welcome_how_it_works()}</p>
		<ol class="steps">
			{#each steps as step, i (i)}
				<li>
					<span class="step-number">{i + 1}</span>
					<span class="step-text"><b>{step.title()}.</b> {step.body()}</span>
				</li>
			{/each}
		</ol>
	</div>

	<div class="btn-row">
		<a class="btn btn-outline btn-block" href={lh('/join')}>{m.welcome_join_group()}</a>
	</div>

	<p class="login-link">{m.welcome_already_have_account()} <a href={lh('/login')}>{m.welcome_log_in()}</a></p>
</main>

<style>
	.welcome {
		position: relative;
		/* `.shell`'s own padding (6.5rem top / 5.5rem bottom) reserves room
		   for the fixed `AppHeader`/`BottomNav` every other page has —
		   Welcome has neither, so inheriting that padding was the actual
		   reason this page needed scrolling on a phone screen: ~190px of
		   pure empty space top and bottom, not real content. */
		padding-top: calc(1.25rem + env(safe-area-inset-top, 0px));
		padding-bottom: calc(1.25rem + env(safe-area-inset-bottom, 0px));
		gap: 0.85rem;
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		text-align: center;
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
		margin: 0.35rem 0 0.75rem;
		max-width: 30ch;
		font-size: 0.9375rem;
		line-height: 1.4;
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
		gap: 0.55rem;
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
