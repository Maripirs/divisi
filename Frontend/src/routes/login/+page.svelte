<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { withSubmitting } from '$lib/utils/enhance';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let mode = $state<'login' | 'register'>(
		form?.mode ?? (page.url.searchParams.get('mode') === 'register' ? 'register' : 'login')
	);
	let submitting = $state(false);
	let password = $state('');
	let confirmPassword = $state('');
	// Client-side only — the real enforcement is server-side (both the
	// match check in this route's `register` action and the length check
	// in the Backend's own `UserCreate` validator) — this just avoids a
	// round trip for the single most common typo.
	let passwordMismatch = $derived(
		mode === 'register' && confirmPassword.length > 0 && password !== confirmPassword
	);
	// Where to land after a successful login/register — set when a
	// protected page redirected here (see e.g. `/home`'s `+page.server.ts`),
	// so logging in from a deep link doesn't strand the user back at
	// `/home` instead of where they were headed.
	const redirectTo = page.url.searchParams.get('redirectTo') ?? '/home';

	// Guest path: joining a group by code needs no account, so it lives on
	// this same page rather than sending the visitor off to `/welcome` and
	// back before they can even type a code (see `/join` for the standalone
	// version of this same form, used from links elsewhere in the app).
	let groupCode = $state('');
	function submitGroupCode(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = groupCode.trim();
		if (!trimmed) return;
		goto(lh(`/join/${encodeURIComponent(trimmed)}`));
	}
</script>

<AuthShell title={mode === 'login' ? m.login_title() : m.login_create_account()}>
	{#if page.url.searchParams.get('reset')}
		<p class="success reset-success">{m.login_password_updated()}</p>
	{/if}

	<div class="tabs" role="tablist">
		<button type="button" class="tab" class:active={mode === 'login'} onclick={() => (mode = 'login')}>
			{m.login_title()}
		</button>
		<button type="button" class="tab" class:active={mode === 'register'} onclick={() => (mode = 'register')}>
			{m.login_register()}
		</button>
	</div>

	<form
		class="card"
		method="POST"
		action={mode === 'login' ? '?/login' : '?/register'}
		use:enhance={withSubmitting((v) => (submitting = v))}
	>
		<input type="hidden" name="redirectTo" value={redirectTo} />
		{#if mode === 'register'}
			<label class="field">
				<span>{m.login_name()}</span>
				<input type="text" name="name" required autocomplete="name" />
			</label>
		{/if}
		<label class="field">
			<span>{m.login_email()}</span>
			<input type="email" name="email" required autocomplete="email" />
		</label>
		<label class="field">
			<span>{m.login_password()}</span>
			<input
				type="password"
				name="password"
				bind:value={password}
				required
				minlength="8"
				autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
			/>
		</label>
		{#if mode === 'register'}
			<label class="field">
				<span>{m.login_confirm_password()}</span>
				<input
					type="password"
					name="passwordConfirm"
					bind:value={confirmPassword}
					required
					minlength="8"
					autocomplete="new-password"
				/>
			</label>
			{#if passwordMismatch}
				<p class="error">{m.login_passwords_dont_match()}</p>
			{/if}
		{/if}

		{#if mode === 'login'}
			<p class="forgot-link"><a href={lh('/forgot-password')}>{m.login_forgot_password()}</a></p>
		{/if}

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button
			class="btn btn-primary btn-block"
			type="submit"
			disabled={submitting || (mode === 'register' && (passwordMismatch || confirmPassword.length === 0))}
		>
			{submitting ? m.login_please_wait() : mode === 'login' ? m.login_title() : m.login_create_account()}
		</button>
	</form>

	{#if data.oauthProviders.google || data.oauthProviders.apple}
		<div class="card">
			<span class="oauth-divider">{m.login_or()}</span>
			{#if data.oauthProviders.google}
				<a class="btn btn-outline btn-block" href="{data.apiBaseUrl}/auth/oauth/google/start">
					{m.login_continue_with_google()}
				</a>
			{/if}
			{#if data.oauthProviders.apple}
				<a class="btn btn-outline btn-block" href="{data.apiBaseUrl}/auth/oauth/apple/start">
					{m.login_continue_with_apple()}
				</a>
			{/if}
		</div>
	{/if}

	{#if page.url.searchParams.get('oauth_error')}
		<p class="error oauth-error">{m.login_oauth_error()}</p>
	{/if}

	<!-- Own card, own form, styled identically to `/join`'s (same `.field`
	     input, same primary-button pattern) — this is the same guest flow,
	     just reachable without leaving the login page. -->
	<form class="card" onsubmit={submitGroupCode}>
		<p class="card-eyebrow">{m.login_guest_divider()}</p>
		<label class="field">
			<span>{m.join_code_label()}</span>
			<input
				type="text"
				placeholder="ABCD-1234"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				bind:value={groupCode}
			/>
		</label>
		<button class="btn btn-outline btn-block" type="submit" disabled={!groupCode.trim()}>
			{m.join_continue()}
		</button>
	</form>

	{#snippet footer()}{/snippet}
</AuthShell>

<style>
	.forgot-link {
		margin: -0.2rem 0 0;
		text-align: right;
		font-size: 0.8125rem;
	}

	.forgot-link a {
		color: var(--accent);
	}

	.oauth-divider {
		text-align: center;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.oauth-error {
		text-align: center;
	}

	.reset-success {
		text-align: center;
	}
</style>
