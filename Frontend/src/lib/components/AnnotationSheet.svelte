<script lang="ts">
	import type { AnnotationShare } from '$lib/api/annotations';
	import { m } from '$lib/paraglide/messages';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';

	/** F4: the create/view/edit/share sheet for one score annotation,
	 * opened either from `ScoreView`'s "place a marker" tap (mode `create`)
	 * or from clicking an existing marker (mode `view`). Matches B5's real
	 * semantics — private by default, explicit share-by-email with a peer,
	 * owner-only edit/delete/share/unshare — not the fixture-era
	 * broadcast-style visibility options (from the since-removed
	 * `AnnotationModal.svelte`), which the real Backend never implemented. */
	let {
		open,
		mode,
		positionLabel,
		content = '',
		isOwner = true,
		shares = [],
		sharesLoading = false,
		saving = false,
		error = null,
		onClose,
		onSave,
		onDelete,
		onShare,
		onUnshare
	}: {
		open: boolean;
		mode: 'create' | 'view';
		positionLabel: string;
		content?: string;
		isOwner?: boolean;
		shares?: AnnotationShare[];
		sharesLoading?: boolean;
		saving?: boolean;
		error?: string | null;
		onClose: () => void;
		onSave: (content: string) => void;
		onDelete?: () => void;
		onShare?: (email: string) => void;
		onUnshare?: (userId: string) => void;
	} = $props();

	let draft = $state(content);
	let editing = $state(mode === 'create');
	let shareEmail = $state('');
	let confirmingDelete = $state(false);

	// Mirrors `AnnotationModal.svelte`'s own reasoning: the parent renders
	// this unconditionally and only toggles `open`, so the instance stays
	// alive across opens — state has to be reset here on every open rather
	// than seeded once from props, or a cancelled edit / stale email draft
	// would leak into the next annotation this gets opened for.
	$effect(() => {
		if (open) {
			draft = content;
			editing = mode === 'create';
			shareEmail = '';
			confirmingDelete = false;
		}
	});

	function save() {
		if (!draft.trim()) return;
		onSave(draft.trim());
	}

	function submitShare() {
		if (!shareEmail.trim()) return;
		onShare?.(shareEmail.trim());
		shareEmail = '';
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onClose}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={m.piece_annotation_sheet_label()}>
		<div class="grabber"></div>
		<p class="card-eyebrow">{mode === 'create' ? m.piece_annotation_new() : m.piece_annotation_title()}</p>
		<p class="position">{positionLabel}</p>

		{#if error}
			<p class="error-text">{error}</p>
		{/if}

		{#if editing}
			<label class="field">
				<span>{m.piece_annotation_note_label()}</span>
				<textarea
					bind:value={draft}
					placeholder={m.piece_annotation_placeholder()}
					disabled={saving}
				></textarea>
			</label>
			<div class="btn-row">
				{#if mode === 'view'}
					<button class="btn" onclick={() => (editing = false)} disabled={saving}>
						{m.piece_annotation_cancel()}
					</button>
				{:else}
					<button class="btn" onclick={onClose} disabled={saving}>{m.piece_annotation_cancel()}</button>
				{/if}
				<button class="btn btn-primary btn-block" onclick={save} disabled={saving || !draft.trim()}>
					{saving ? m.piece_annotation_saving() : m.piece_annotation_save()}
				</button>
			</div>
		{:else}
			<p class="content-text">{content}</p>

			{#if isOwner}
				<div class="btn-row">
					<button class="btn" onclick={() => (editing = true)}>{m.piece_annotation_edit()}</button>
					<ConfirmButton bind:confirming={confirmingDelete}>
						{#snippet trigger(start)}
							<button class="btn btn-block" onclick={start}>
								{m.piece_annotation_delete()}
							</button>
						{/snippet}
						{#snippet confirm()}
							<button class="btn btn-danger btn-block" onclick={onDelete}>
								{m.piece_annotation_confirm_delete()}
							</button>
						{/snippet}
					</ConfirmButton>
				</div>

				<div class="sharing">
					<p class="card-eyebrow">{m.piece_annotation_shared_with()}</p>
					{#if sharesLoading}
						<p class="muted-note">{m.piece_annotation_loading_shares()}</p>
					{:else if shares.length === 0}
						<p class="muted-note">{m.piece_annotation_private_note()}</p>
					{:else}
						<ul class="share-list">
							{#each shares as share (share.sharedWithUserId)}
								<li>
									<span>{share.email}</span>
									<button
										type="button"
										class="text-link"
										onclick={() => onUnshare?.(share.sharedWithUserId)}
									>
										{m.piece_annotation_unshare()}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
					<form class="share-form" onsubmit={(e) => (e.preventDefault(), submitShare())}>
						<input
							type="email"
							bind:value={shareEmail}
							placeholder={m.piece_annotation_share_placeholder()}
							aria-label={m.piece_annotation_share_placeholder()}
						/>
						<button type="submit" class="btn" disabled={!shareEmail.trim()}>
							{m.piece_annotation_share()}
						</button>
					</form>
				</div>
			{/if}

			<div class="btn-row">
				<button class="btn btn-primary btn-block" onclick={onClose}>{m.piece_annotation_close()}</button>
			</div>
		{/if}
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
		max-height: 85vh;
		overflow-y: auto;
		margin: 0 auto;
	}

	.grabber {
		width: 32px;
		height: 4px;
		border-radius: var(--radius-full);
		background: var(--border);
		margin: 0 auto 0.2rem;
	}

	/* This component is mounted from the piece player route, which (unlike
	   most of the app) doesn't import `$lib/styles/shell.css` — it has its
	   own bespoke player-shell styling instead, same as `ScoreView.svelte`.
	   These mirror shell.css's own `.btn`/`.card-eyebrow` design (tokens,
	   sizing) rather than assume it's loaded. */
	.card-eyebrow {
		margin: 0;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.position {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.error-text {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.content-text {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--text);
		white-space: pre-wrap;
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

	.btn-row {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.3rem;
		flex-wrap: wrap;
	}

	.btn {
		min-height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.8125rem;
		font-weight: 700;
		padding: 0 0.9rem;
		cursor: pointer;
	}

	.btn:hover:not(:disabled) {
		border-color: var(--accent);
		background: var(--surface-2);
	}

	.btn-primary {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}

	.btn-danger {
		color: var(--danger);
		border-color: var(--danger);
		background: transparent;
	}

	.btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger) 12%, var(--surface) 88%);
	}

	.btn-block {
		width: 100%;
	}

	.btn[disabled] {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.sharing {
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
		margin-top: 0.2rem;
	}

	.muted-note {
		margin: 0 0 0.4rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.share-list {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.share-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--text);
	}

	.share-form {
		display: flex;
		gap: 0.5rem;
	}

	.share-form input {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: 0.875rem;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.6rem;
	}

	.text-link {
		border: none;
		background: none;
		color: var(--accent);
		font-size: 0.8125rem;
		font-weight: 650;
		cursor: pointer;
		padding: 0;
	}
</style>
