<script lang="ts">
	import { enhance } from '$app/forms';
	import { withSubmitting } from '$lib/utils/enhance';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let password = $state('');
	let passwordConfirm = $state('');
	let submitting = $state(false);
	let mismatch = $derived(passwordConfirm.length > 0 && password !== passwordConfirm);
</script>

<AuthShell title={m.reset_password_title()}>
	{#if !data.token}
		<section class="card">
			<p class="card-eyebrow">{m.reset_password_link_missing()}</p>
			<p class="card-meta">
				{m.reset_password_link_missing_body()} <a href={lh('/forgot-password')}>{m.reset_password_request_new()}</a>.
			</p>
		</section>
	{:else}
		<form
			class="card"
			method="POST"
			use:enhance={withSubmitting((v) => (submitting = v))}
		>
			<input type="hidden" name="token" value={data.token} />
			<label class="field">
				<span>{m.reset_password_new_password()}</span>
				<input type="password" name="password" bind:value={password} required minlength="8" autocomplete="new-password" />
			</label>
			<label class="field">
				<span>{m.reset_password_confirm_new_password()}</span>
				<input
					type="password"
					name="passwordConfirm"
					bind:value={passwordConfirm}
					required
					minlength="8"
					autocomplete="new-password"
				/>
			</label>
			{#if mismatch}
				<p class="error">{m.login_passwords_dont_match()}</p>
			{/if}

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button
				class="btn btn-primary btn-block"
				type="submit"
				disabled={submitting || mismatch || passwordConfirm.length === 0}
			>
				{submitting ? m.reset_password_saving() : m.reset_password_set_new()}
			</button>
		</form>
	{/if}
</AuthShell>
