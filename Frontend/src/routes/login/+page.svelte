<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import '$lib/styles/shell.css';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let mode = $state<'login' | 'register'>(
		form?.mode ?? (page.url.searchParams.get('mode') === 'register' ? 'register' : 'login')
	);
	let submitting = $state(false);
	// Where to land after a successful login/register — set when a
	// protected page redirected here (see e.g. `/home`'s `+page.server.ts`),
	// so logging in from a deep link doesn't strand the user back at
	// `/home` instead of where they were headed.
	const redirectTo = page.url.searchParams.get('redirectTo') ?? '/home';
</script>

<main class="shell">
	<header class="shell-header">
		<h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
	</header>

	<div class="tabs" role="tablist">
		<button type="button" class="tab" class:active={mode === 'login'} onclick={() => (mode = 'login')}>
			Log in
		</button>
		<button type="button" class="tab" class:active={mode === 'register'} onclick={() => (mode = 'register')}>
			Register
		</button>
	</div>

	<form
		class="card"
		method="POST"
		action={mode === 'login' ? '?/login' : '?/register'}
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		<input type="hidden" name="redirectTo" value={redirectTo} />
		{#if mode === 'register'}
			<label class="field">
				<span>Name</span>
				<input type="text" name="name" required autocomplete="name" />
			</label>
		{/if}
		<label class="field">
			<span>Email</span>
			<input type="email" name="email" required autocomplete="email" />
		</label>
		<label class="field">
			<span>Password</span>
			<input
				type="password"
				name="password"
				required
				minlength="8"
				autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
			/>
		</label>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button class="btn btn-primary btn-block" type="submit" disabled={submitting}>
			{submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
		</button>
	</form>

	<p class="note">
		Browsing, playback, and joining a group with a code never require an account —
		<a href="/welcome">back to welcome</a>.
	</p>
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
