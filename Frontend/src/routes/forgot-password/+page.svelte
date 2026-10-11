<script lang="ts">
	import { enhance } from '$app/forms';
	import { withSubmitting } from '$lib/utils/enhance';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import { page } from '$app/state';
	import { withReturnTo } from '$lib/authLinks';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let email = $state('');
	let submitting = $state(false);
	// Carried from the login page so the reset link (and the way back to
	// login) still returns the member to where they were headed.
	const returnTo = page.url.searchParams.get('redirectTo');
</script>

<AuthShell title={m.forgot_password_title()}>
	{#if form?.success}
		<section class="card">
			<p class="card-eyebrow">{m.forgot_password_check_email()}</p>
			<p class="card-meta">
				{m.forgot_password_check_email_body()}
			</p>
			<a class="btn btn-outline btn-block" href={lh(withReturnTo('/login', returnTo))}>{m.forgot_password_back_to_login()}</a>
		</section>
	{:else}
		<form
			class="card"
			method="POST"
			use:enhance={withSubmitting((v) => (submitting = v))}
		>
			<p class="card-note">{m.forgot_password_instructions()}</p>
			{#if returnTo}<input type="hidden" name="redirectTo" value={returnTo} />{/if}
			<label class="field">
				<span>{m.login_email()}</span>
				<input type="email" name="email" bind:value={email} required autocomplete="email" />
			</label>

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={submitting || !email.trim()}>
				{submitting ? m.forgot_password_sending() : m.forgot_password_send_link()}
			</button>
		</form>
	{/if}
</AuthShell>
