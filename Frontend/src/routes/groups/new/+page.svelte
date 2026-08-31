<script lang="ts">
	import { enhance } from '$app/forms';
	import { withSubmitting } from '$lib/utils/enhance';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let name = $state('');
	let submitting = $state(false);
</script>

<main class="shell">
	<AppHeader title={m.groups_new_title()} />
	<p class="crumbs"><a href={lh('/home')}>{m.home_title()}</a> / {m.groups_new_title()}</p>

	<form
		method="POST"
		use:enhance={withSubmitting((v) => (submitting = v))}
	>
		<section class="card">
			<label class="field">
				<span>{m.groups_new_name()}</span>
				<input type="text" name="name" bind:value={name} required placeholder="e.g. SFCC Chamber Choir" />
			</label>
			<p class="card-note">{m.groups_new_admin_note()}</p>
		</section>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button class="btn btn-primary btn-block" type="submit" disabled={!name.trim() || submitting}>
			{submitting ? m.groups_new_creating() : m.groups_new_title()}
		</button>
	</form>
</main>

<BottomNav />

<style>
	.error {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.btn[disabled] {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
