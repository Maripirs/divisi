<script lang="ts">
	import { enhance } from '$app/forms';
	import { withSubmitting } from '$lib/utils/enhance';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import '$lib/styles/shell.css';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
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
	<AppHeader title={m.new_homework_title()} />
	<p class="crumbs"><a href={lh(`/groups/${data.group.id}?view=admin`)}>{data.group.name} / {m.new_homework_admin()}</a></p>

	{#if data.tracks.length === 0}
		<p class="empty">{m.new_homework_no_tracks()}</p>
	{:else}
		<form
			method="POST"
			use:enhance={withSubmitting((v) => (submitting = v))}
		>
			<section class="card">
				<label class="field">
					<span>{m.new_homework_piece()}</span>
					<select name="pieceId" bind:value={pieceId} onchange={onPieceChange} required>
						<option value="" disabled>{m.new_homework_choose_piece()}</option>
						{#each data.tracks as track (track.piece_id)}
							<option value={track.piece_id}>{track.title}</option>
						{/each}
					</select>
				</label>

				<label class="field">
					<span>{m.new_homework_title_field()}</span>
					<input type="text" name="title" bind:value={title} required placeholder="e.g. Lacrymosa" />
				</label>

				<div class="field">
					<span>{m.new_homework_range()}</span>
					<input type="hidden" name="rangeMode" value={rangeMode} />
					<div class="tabs range-tabs">
						<button type="button" class="tab" class:active={rangeMode === 'full'} onclick={() => (rangeMode = 'full')}>
							{m.new_homework_full_piece()}
						</button>
						<button
							type="button"
							class="tab"
							class:active={rangeMode === 'measures'}
							onclick={() => (rangeMode = 'measures')}
						>
							{m.new_homework_measures()}
						</button>
					</div>
					{#if rangeMode === 'measures'}
						<div class="measure-row">
							<input type="number" name="measureFrom" min="1" placeholder={m.new_homework_from()} bind:value={measureFrom} />
							<span>{m.new_homework_to()}</span>
							<input type="number" name="measureTo" min="1" placeholder={m.new_homework_to()} bind:value={measureTo} />
						</div>
					{/if}
				</div>

				<label class="field">
					<span>{m.new_homework_due_date()}</span>
					<input type="date" name="dueDate" bind:value={dueDate} />
				</label>

				<label class="field">
					<span>{m.new_homework_instructions()}</span>
					<textarea name="instructions" bind:value={instructions} placeholder="Focus on entrances after rests…"
					></textarea>
				</label>
			</section>

			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}

			<button class="btn btn-primary btn-block" type="submit" disabled={!pieceId || !title || submitting}>
				{submitting ? m.new_homework_assigning() : m.new_homework_assign()}
			</button>
		</form>
	{/if}
</main>

<style>
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
