<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import ConfirmButton from './ConfirmButton.svelte';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';

	/** A2: the inline edit-in-place shell that repeats across the group
	 * page's per-item admin panels (homework, weekly note, responsibility
	 * date). The Homework flow is the reference design (per the human's
	 * call in CLEANUP.md): one `<form>` holding the type-specific fields
	 * plus a trailing row of Save / Cancel / an in-form confirm-then-delete
	 * — delete via `formaction` on a submit button so it stays one valid
	 * `<form>` and sits naturally level with Save/Cancel rather than
	 * floating at some separately-guessed position.
	 *
	 * The fields differ per type, so they stay slotted (`fields` snippet).
	 * Everything else — the enhance/submitting wiring, the hidden id input,
	 * the error line, the action row, the delete confirm pair — is here.
	 *
	 * Behavior matches the hand-rolled copies exactly, including the wart
	 * that `onCancel` (which closes the editor) runs on settle regardless
	 * of success or failure, so a failed save's page-level error is not
	 * shown inline (the form has already unmounted). Left as-is to keep
	 * this a pure refactor. */
	let {
		saveAction,
		deleteAction,
		idName,
		idValue,
		enctype,
		saving = $bindable(false),
		error,
		saveLabel = m.action_save(),
		savingLabel = m.reset_password_saving(),
		cancelLabel = m.action_cancel(),
		deleteLabel,
		deleteConfirmLabel,
		onCancel,
		fields
	}: {
		saveAction: string;
		deleteAction?: string;
		idName: string;
		idValue: string;
		enctype?: 'multipart/form-data';
		saving?: boolean;
		error?: string | false | null;
		saveLabel?: string;
		savingLabel?: string;
		cancelLabel?: string;
		deleteLabel?: string;
		deleteConfirmLabel?: string;
		onCancel: () => void;
		fields: Snippet;
	} = $props();
</script>

<form
	method="POST"
	action={saveAction}
	{enctype}
	use:enhance={withSubmitting((v) => (saving = v), onCancel)}
>
	<input type="hidden" name={idName} value={idValue} />
	{@render fields()}
	{#if error}
		<p class="error">{error}</p>
	{/if}
	<div class="btn-row editable-actions">
		<button type="submit" class="btn btn-outline" disabled={saving}>
			{saving ? savingLabel : saveLabel}
		</button>
		<button type="button" class="text-link" onclick={onCancel} disabled={saving}>
			{cancelLabel}
		</button>
		{#if deleteAction}
			<span class="editable-delete">
				<ConfirmButton>
					{#snippet trigger(start)}
						<button
							type="button"
							class="icon-btn icon-btn--danger"
							onclick={start}
							aria-label={deleteLabel}
							title={deleteLabel}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M3 6h18" />
								<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<line x1="10" y1="11" x2="10" y2="17" />
								<line x1="14" y1="11" x2="14" y2="17" />
							</svg>
						</button>
					{/snippet}
					{#snippet confirm(cancelConfirm)}
						<button
							type="submit"
							formaction={deleteAction}
							formnovalidate
							class="icon-btn icon-btn--danger"
							disabled={saving}
							aria-label={deleteConfirmLabel}
							title={deleteConfirmLabel}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<polyline points="20 6 9 17 4 12" />
							</svg>
						</button>
						<button
							type="button"
							class="icon-btn"
							onclick={cancelConfirm}
							disabled={saving}
							aria-label={cancelLabel}
							title={cancelLabel}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					{/snippet}
				</ConfirmButton>
			</span>
		{/if}
	</div>
</form>

<style>
	/* Delete sits in the same `.btn-row` as Save/Cancel, pushed to the
	   row's far end, so it's naturally level with them. Bare icon (not a
	   circular chip) — smaller and quieter, one of three controls sharing
	   a row. Was `.hw-edit-delete` / `.hw-icon-btn` on the group page. */
	.editable-delete {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.35rem;
		height: 1.35rem;
		border: none;
		background: none;
		padding: 0;
		color: var(--text-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		opacity: 0.7;
	}

	.icon-btn--danger {
		color: var(--danger);
	}
</style>
