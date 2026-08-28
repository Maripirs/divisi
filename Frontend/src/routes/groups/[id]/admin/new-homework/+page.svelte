<script lang="ts">
	import { enhance } from '$app/forms';
	import '$lib/styles/shell.css';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let pieceId = $state('');
	let title = $state('');
	let rangeMode = $state<'full' | 'measures'>('full');
	let measureFrom = $state('');
	let measureTo = $state('');
	let dueDate = $state('');
	let instructions = $state('');
	let submitting = $state(false);

	function onPieceChange() {
		if (!title) {
			const track = data.tracks.find((t) => t.piece_id === pieceId);
			if (track) title = track.title;
		}
	}
</script>

<main class="shell">
	<p class="crumbs"><a href="/groups/{data.group.id}?view=admin">{data.group.name} / Admin</a></p>
	<h1 class="title">New homework</h1>

	{#if data.tracks.length === 0}
		<p class="empty">No rehearsal tracks shared with this group yet — nothing to assign homework against.</p>
	{:else}
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
					<span>Piece</span>
					<select name="pieceId" bind:value={pieceId} onchange={onPieceChange} required>
						<option value="" disabled>Choose piece</option>
						{#each data.tracks as track (track.piece_id)}
							<option value={track.piece_id}>{track.title}</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span>Title</span>
					<input type="text" name="title" bind:value={title} required placeholder="e.g. Lacrymosa" />
				</label>

				<div class="field">
					<span>Range</span>
					<input type="hidden" name="rangeMode" value={rangeMode} />
					<div class="tabs range-tabs">
						<button type="button" class="tab" class:active={rangeMode === 'full'} onclick={() => (rangeMode = 'full')}>
							Full piece
						</button>
						<button
							type="button"
							class="tab"
							class:active={rangeMode === 'measures'}
							onclick={() => (rangeMode = 'measures')}
						>
							Measures
						</button>
					</div>
					{#if rangeMode === 'measures'}
						<div class="measure-row">
							<input type="number" name="measureFrom" min="1" placeholder="From" bind:value={measureFrom} />
							<span>to</span>
							<input type="number" name="measureTo" min="1" placeholder="To" bind:value={measureTo} />
						</div>
					{/if}
				</div>

				<label class="field">
					<span>Due date</span>
					<input type="date" name="dueDate" bind:value={dueDate} />
				</label>

				<label class="field">
					<span>Instructions</span>
					<textarea name="instructions" bind:value={instructions} placeholder="Focus on entrances after rests…"
					></textarea>
				</label>
			</section>

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={!pieceId || !title || submitting}>
				{submitting ? 'Assigning…' : 'Assign'}
			</button>
		</form>
	{/if}
</main>

<style>
	.title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
		color: var(--text);
	}

	.range-tabs {
		border-bottom: none;
		padding-bottom: 0;
		margin-top: 0.2rem;
	}

	.measure-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}

	.measure-row input {
		width: 5rem;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.measure-row span {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}

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
