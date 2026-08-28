<script lang="ts">
	import type { Annotation } from '$lib/fixtures/appData';

	interface Props {
		open: boolean;
		pieceTitle: string;
		measure: number;
		defaultVisibility?: Annotation['visibility'];
		onClose: () => void;
		onSave: (entry: { measure: number; note: string; visibility: Annotation['visibility'] }) => void;
	}

	let { open = $bindable(), pieceTitle, measure, defaultVisibility = 'private', onClose, onSave }: Props =
		$props();

	let note = $state('');
	// Real value is set by the $effect below on every open, not seeded here
	// — the component instance stays alive across opens (the parent renders
	// it unconditionally, `{#if open}` only toggles the sheet inside), so a
	// one-time seed from `defaultVisibility` would leak an unsaved/cancelled
	// edit into the next open instead of resetting.
	let visibility = $state<Annotation['visibility']>('private');
	let noteField: HTMLTextAreaElement | undefined = $state();
	$effect(() => {
		if (open) {
			note = '';
			visibility = defaultVisibility;
			noteField?.focus();
		}
	});

	const visibilityOptions: { value: Annotation['visibility']; label: string }[] = [
		{ value: 'private', label: 'Private to me' },
		{ value: 'director', label: 'Share with director only' },
		{ value: 'selected', label: 'Share with selected people' },
		{ value: 'group', label: 'Share with group' }
	];

	function save() {
		if (!note.trim()) return;
		onSave({ measure, note: note.trim(), visibility });
		onClose();
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onClose}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Add annotation">
		<div class="grabber"></div>
		<p class="card-eyebrow">Add annotation</p>
		<p class="position">{pieceTitle} — Measure {measure}</p>

		<label class="field">
			<span>Note</span>
			<textarea bind:value={note} bind:this={noteField} placeholder="Watch entrance after bass…"></textarea>
		</label>

		<div class="visibility">
			<p class="card-eyebrow">Visibility</p>
			{#each visibilityOptions as opt (opt.value)}
				<label class="checkline">
					<input type="radio" name="visibility" value={opt.value} bind:group={visibility} />
					{opt.label}
				</label>
			{/each}
		</div>

		<div class="btn-row">
			<button class="btn btn-outline" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary btn-block" onclick={save} disabled={!note.trim()}>Save</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(10, 10, 16, 0.45);
		z-index: 20;
		border: none;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 21;
		background: var(--surface);
		border-top: 1px solid var(--border);
		border-top-left-radius: var(--radius-lg);
		border-top-right-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 0.75rem 1.1rem calc(1.1rem + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: 640px;
		margin: 0 auto;
	}

	.grabber {
		width: 32px;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--border);
		margin: 0 auto 0.2rem;
	}

	.position {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field span {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.field textarea {
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.55rem 0.65rem;
		min-height: 4.5rem;
		resize: vertical;
	}

	.visibility {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.checkline {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--text);
		padding: 0.15rem 0;
	}

	.checkline input {
		accent-color: var(--accent);
	}

	.btn-row {
		margin-top: 0.3rem;
	}

	.btn[disabled] {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
