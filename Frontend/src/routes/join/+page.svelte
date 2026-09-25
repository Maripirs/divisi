<script lang="ts">
	import { goto } from '$app/navigation';
	import Logo from '$lib/components/Logo.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData } from './$types';

	// No dedicated load here — `data.user` comes straight from the root
	// layout, just to pick where "back" goes (this screen has two separate
	// entry points: `/home` for a logged-in member, `/welcome` for a
	// logged-out visitor).
	let { data }: { data: PageData } = $props();

	let code = $state('');

	function submit(e: SubmitEvent) {
		e.preventDefault();
		const trimmed = code.trim();
		if (!trimmed) return;
		goto(lh(`/join/${encodeURIComponent(trimmed)}`));
	}
</script>

<main class="shell join">
	<div class="content-narrow">
	<div class="hero">
		<Logo size={48} />
		<h1>{m.join_title()}</h1>
		<p class="pitch">
			{m.join_pitch()}
		</p>
	</div>

	<form class="card" onsubmit={submit}>
		<div class="field">
			<label for="join-code">{m.join_code_label()}</label>
			<input
				id="join-code"
				type="text"
				placeholder="ABCD-1234"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				bind:value={code}
			/>
		</div>
		<button class="btn btn-primary btn-block" type="submit" disabled={!code.trim()}>{m.join_continue()}</button
		>
	</form>

	<p class="back-link">
		<a href={lh(data.user ? '/home' : '/welcome')}>← {m.join_back()}</a>
	</p>
	</div>
</main>

<style>
	.join {
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
		font-size: 1.5rem;
		font-weight: 800;
		color: var(--text);
	}

	.pitch {
		margin: 0.35rem 0 1rem;
		max-width: 32ch;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	form.card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	input[type='text'] {
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.back-link {
		margin: 0.25rem 0 0;
		text-align: center;
		font-size: 0.8125rem;
	}

	.back-link a {
		color: var(--accent);
	}
</style>
