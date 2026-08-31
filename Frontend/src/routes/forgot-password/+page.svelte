<script lang="ts">
	import { enhance } from '$app/forms';
	import { withSubmitting } from '$lib/utils/enhance';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let email = $state('');
	let submitting = $state(false);
</script>

<AuthShell title={m.forgot_password_title()}>
	{#if form?.success}
		<section class="card">
			<p class="card-eyebrow">{m.forgot_password_check_email()}</p>
			<p class="card-meta">
				{m.forgot_password_check_email_body()}
			</p>
			<a class="btn btn-outline btn-block" href={lh('/login')}>{m.forgot_password_back_to_login()}</a>
		</section>
	{:else}
		<form
			class="card"
			method="POST"
			use:enhance={withSubmitting((v) => (submitting = v))}
		>
			<p class="card-note">{m.forgot_password_instructions()}</p>
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
