<script lang="ts">
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import '$lib/styles/shell.css';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let name = $state('');
	let submitting = $state(false);
</script>

<main class="shell">
	<AppHeader title="Create group" />
	<p class="crumbs"><a href="/home">Home</a> / Create group</p>

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		<section class="card">
			<label class="field">
				<span>Group name</span>
				<input type="text" name="name" bind:value={name} required placeholder="e.g. SFCC Chamber Choir" />
			</label>
			<p class="card-note">You'll be the group admin.</p>
		</section>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button class="btn btn-primary btn-block" type="submit" disabled={!name.trim() || submitting}>
			{submitting ? 'Creating…' : 'Create group'}
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
