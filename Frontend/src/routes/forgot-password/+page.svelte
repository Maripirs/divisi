<script lang="ts">
	import { enhance } from '$app/forms';
	import '$lib/styles/shell.css';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let email = $state('');
	let submitting = $state(false);
</script>

<main class="shell">
	<header class="shell-header">
		<h1>Forgot password</h1>
	</header>

	{#if form?.success}
		<section class="card">
			<p class="card-eyebrow">Check your email</p>
			<p class="card-meta">
				If an account exists for that address, a reset link is on its way. It's good for one
				hour.
			</p>
			<a class="btn btn-outline btn-block" href="/login">Back to log in</a>
		</section>
	{:else}
		<form
			class="card"
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<p class="card-note">Enter the email you signed up with and we'll send a reset link.</p>
			<label class="field">
				<span>Email</span>
				<input type="email" name="email" bind:value={email} required autocomplete="email" />
			</label>

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={submitting || !email.trim()}>
				{submitting ? 'Sending…' : 'Send reset link'}
			</button>
		</form>
	{/if}

	<p class="note"><a href="/login">Back to log in</a></p>
</main>

<style>
	.error {
		margin: 0.25rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.note {
		margin: 0;
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.note a {
		color: var(--accent);
	}
</style>
