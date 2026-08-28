<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { getPieceByTitle } from '$lib/pieces/registry';
	import '$lib/styles/shell.css';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Tab = 'tracks' | 'homework';
	let tab = $state<Tab>('tracks');

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function formatDueDate(iso: string | null) {
		return iso ? formatDate(iso) : 'No due date';
	}
</script>

<main class="shell join-result">
	{#if !data.group}
		<div class="hero">
			<Logo size={48} />
		</div>
	{/if}

	{#if data.error === 'not-found'}
		<section class="card">
			<p class="card-title">Code not found</p>
			<p class="card-meta">
				"{data.code}" doesn't match any group. Double-check the code with your choir admin and
				try again.
			</p>
			<a class="btn btn-outline btn-block" href="/join">Try another code</a>
		</section>
	{:else if data.error === 'password-required'}
		<section class="card">
			<p class="card-title">Password required</p>
			<p class="card-meta">This group's admin protected it with a password. Ask them for it.</p>
			<form method="GET">
				<label class="field">
					<span>Password</span>
					<input type="password" name="password" required autofocus />
				</label>
				<button class="btn btn-primary btn-block" type="submit">Continue</button>
			</form>
		</section>
	{:else if data.error === 'server'}
		<section class="card">
			<p class="card-title">Something went wrong</p>
			<p class="card-meta">Couldn't reach the server. Please try again in a moment.</p>
			<a class="btn btn-outline btn-block" href="/join">Back</a>
		</section>
	{:else if data.group}
		<AppHeader
			title={data.group.groupName}
			homeHref="/join/{data.code}"
			settingsHref="/settings?code={data.code}"
		/>

		{#if data.homeworkVisible}
			<div class="tabs" role="tablist">
				<button class="tab" class:active={tab === 'tracks'} onclick={() => (tab = 'tracks')}>
					Rehearsal Tracks
				</button>
				<button class="tab" class:active={tab === 'homework'} onclick={() => (tab = 'homework')}>
					Homework
				</button>
			</div>
		{/if}

		{#if !data.homeworkVisible || tab === 'tracks'}
			<section class="card">
				{#if data.group.pieces.length === 0}
					<p class="empty">No rehearsal tracks shared with this group yet.</p>
				{:else}
					{#each data.group.pieces as piece (piece.pieceId)}
						{@const bundled = getPieceByTitle(piece.title)}
						<div class="list-row">
							<span>{piece.title}</span>
							<span class="dim">Shared {formatDate(piece.distributedAt)}</span>
						</div>
						{#if bundled}
							<div class="btn-row">
								<a class="btn btn-primary" href="/piece/{bundled.id}?guest=1&code={data.code}">Practice</a>
							</div>
						{/if}
					{/each}
				{/if}
			</section>
		{:else}
			{#if data.homework.length === 0}
				<p class="empty">No homework assigned yet.</p>
			{:else}
				{#each data.homework as hw (hw.id)}
					<section class="card">
						<p class="card-eyebrow">{formatDueDate(hw.dueDate)}</p>
						<p class="card-title">{hw.title}</p>
						<p class="card-meta">{hw.range}</p>
						{#if hw.instructions}
							<p class="card-note">&ldquo;{hw.instructions}&rdquo;</p>
						{/if}
					</section>
				{/each}
			{/if}
		{/if}
	{/if}
</main>

<style>
	.join-result {
		padding-bottom: 3rem;
	}

	.hero {
		display: flex;
		justify-content: center;
		padding: 0.5rem 0 1rem;
	}
</style>
