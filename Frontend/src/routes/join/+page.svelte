<script lang="ts">
	import { goto } from '$app/navigation';
	import Logo from '$lib/components/Logo.svelte';
	import '$lib/styles/shell.css';
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
		goto(`/join/${encodeURIComponent(trimmed)}`);
	}
</script>

<main class="shell join">
	<div class="hero">
		<Logo size={48} />
		<h1>Join a group</h1>
		<p class="pitch">
			Enter the join code your choir admin shared with you. No account needed to view and
			practice a group's rehearsal tracks.
		</p>
	</div>

	<form class="card" onsubmit={submit}>
		<div class="field">
			<label for="join-code">Join code</label>
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
		<button class="btn btn-primary btn-block" type="submit" disabled={!code.trim()}>Continue</button
		>
	</form>

	<p class="back-link">
		<a href={data.user ? '/home' : '/welcome'}>← Back</a>
	</p>
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
