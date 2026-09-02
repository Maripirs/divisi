<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	// One file attachment slot (music file, or PDF) — shared by the Tracks
	// tab's "Upload a track" form and its "Edit details" panel, so the two
	// don't drift into looking like different features. Three states: empty
	// (no current file, nothing picked), current (a file exists, nothing
	// picked), and pending (a file was just picked, replacing or adding —
	// same look either way, see `showCurrent` below). Owns its own "Replace"
	// hidden-input trigger and "Remove" flag internally — mounting a fresh
	// instance (e.g. `{#if}`-toggling the edit panel open again) resets both
	// for free, no parent-side reset code needed.
	let {
		label,
		hasCurrent,
		currentName,
		currentCaption,
		emptyTitle,
		emptyHint,
		addLabel,
		inputName,
		accept,
		removeInputName = undefined,
		files = $bindable(null)
	}: {
		label: string;
		hasCurrent: boolean;
		currentName: string | null;
		currentCaption: string;
		emptyTitle: string;
		emptyHint: string;
		addLabel: string;
		inputName: string;
		accept: string;
		// Omitted entirely (as the "Upload a track" form does) means this slot
		// can never have a "current" file to remove in the first place, so no
		// Remove button and no hidden flag are rendered at all.
		removeInputName?: string;
		files?: FileList | null;
	} = $props();

	let removed = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();
	let pending = $derived(files && files.length > 0 ? files[0] : null);
	let showCurrent = $derived(hasCurrent && !removed);

	// A short badge derived from the filename's own extension, so it says
	// what the file actually is rather than a fixed label that could go
	// stale (e.g. once MusicXML uploads are as common as MIDI ones).
	function fileChipLabel(name: string | null): string {
		if (!name) return '';
		const ext = name.split('.').pop()?.toLowerCase();
		if (ext === 'mid' || ext === 'midi') return 'MIDI';
		if (ext === 'musicxml' || ext === 'xml') return 'XML';
		if (ext === 'mxl') return 'MXL';
		if (ext === 'pdf') return 'PDF';
		return ext ? ext.toUpperCase() : '';
	}
</script>

<div class="file-slot">
	<span class="file-slot-label">{label}</span>
	{#if pending}
		<div class="file-card file-card--pending">
			{#if showCurrent}
				<p class="file-card-meta">{currentCaption}</p>
				<p class="file-card-name file-card-name--muted">{currentName}</p>
				<hr class="file-card-divider" />
			{/if}
			<p class="file-card-meta">
				{showCurrent ? m.groups_edit_replacement_selected() : m.groups_edit_selected()}
			</p>
			<p class="file-card-name">{pending.name}</p>
		</div>
		<div class="btn-row">
			<button type="button" class="btn btn-primary" onclick={() => inputEl?.click()}>
				{m.groups_edit_choose_different()}
			</button>
			<button type="button" class="btn btn-outline" onclick={() => (files = null)}>
				{showCurrent ? m.groups_edit_keep_current() : m.groups_remove()}
			</button>
		</div>
	{:else if showCurrent}
		<div class="file-card">
			<span class="file-chip">{fileChipLabel(currentName)}</span>
			<div class="file-card-body">
				<p class="file-card-name">{currentName}</p>
				<p class="file-card-meta">{currentCaption}</p>
			</div>
		</div>
		<div class="btn-row">
			<button type="button" class="btn btn-outline" onclick={() => inputEl?.click()}>
				{m.groups_replace()}
			</button>
			{#if removeInputName}
				<button type="button" class="btn btn-danger" onclick={() => (removed = true)}>
					{m.groups_remove()}
				</button>
			{/if}
		</div>
	{:else}
		<div class="file-card file-card--empty">
			<p class="file-card-name">{emptyTitle}</p>
			<p class="file-card-meta">{emptyHint}</p>
		</div>
		<button type="button" class="btn btn-primary" onclick={() => inputEl?.click()}>
			{addLabel}
		</button>
	{/if}
	<input
		bind:this={inputEl}
		name={inputName}
		type="file"
		{accept}
		class="file-input-hidden"
		bind:files
		onchange={() => (removed = false)}
	/>
	{#if removeInputName}
		<input type="hidden" name={removeInputName} value={removed ? '1' : ''} />
	{/if}
</div>

<style>
	.file-slot {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.file-slot-label {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.file-card {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		padding: 0.6rem 0.75rem;
	}

	.file-card--empty {
		color: var(--text-muted);
	}

	.file-card--pending {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--surface) 92%);
	}

	.file-chip {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.75rem;
		height: 2rem;
		padding: 0 0.4rem;
		border-radius: var(--radius-md);
		font-size: 0.6875rem;
		font-weight: 700;
		background: color-mix(in srgb, var(--accent) 15%, var(--surface) 85%);
		color: var(--accent);
	}

	.file-card-body {
		min-width: 0;
		flex: 1 1 auto;
	}

	.file-card-name {
		margin: 0;
		font-weight: 700;
		font-size: 0.875rem;
		color: var(--text);
		overflow-wrap: anywhere;
	}

	.file-card-name--muted {
		font-weight: 400;
		color: var(--text-muted);
	}

	.file-card-meta {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.file-card-divider {
		width: 100%;
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.3rem 0;
	}

	.file-input-hidden {
		display: none;
	}
</style>
