<script lang="ts">
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import PdfView from '$lib/components/PdfView.svelte';
	import ScoreView from '$lib/components/ScoreView.svelte';
	import '$lib/styles/shell.css';
	import { resolvedTheme } from '$lib/theme';
	import { withSubmitting } from '$lib/utils/enhance';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let approving = $state(false);
	let discarding = $state(false);
</script>

<main class="shell">
	<AppHeader title={m.review_lyrics_title()} />

	<div class="review-page">
		<div class="review-toolbar">
			<div class="review-toolbar-text">
				<h2 class="piece-title">{data.pieceTitle}</h2>
				<p class="hint">{m.review_lyrics_hint()}</p>
			</div>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<div class="btn-row">
				<a class="text-link" href={lh(`/groups/${data.groupId}?tab=tracks&view=admin`)}>
					{m.action_cancel()}
				</a>
				<ConfirmButton>
					{#snippet trigger(start)}
						<button type="button" class="btn btn-danger" onclick={start} disabled={approving || discarding}>
							{m.review_lyrics_discard()}
						</button>
					{/snippet}
					{#snippet confirm(cancel)}
						<p class="confirm-note">{m.review_lyrics_discard_confirm()}</p>
						<form
							method="POST"
							action="?/discard"
							use:enhance={withSubmitting((v) => (discarding = v))}
						>
							<input type="hidden" name="draftId" value={data.draftId} />
							<input type="hidden" name="groupId" value={data.groupId} />
							<button type="submit" class="text-link text-link--danger" disabled={discarding}>
								{m.review_lyrics_discard()}
							</button>
							<button type="button" class="text-link" onclick={cancel} disabled={discarding}>
								{m.action_cancel()}
							</button>
						</form>
					{/snippet}
				</ConfirmButton>
				<form method="POST" action="?/approve" use:enhance={withSubmitting((v) => (approving = v))}>
					<input type="hidden" name="draftId" value={data.draftId} />
					<input type="hidden" name="groupId" value={data.groupId} />
					<button type="submit" class="btn btn-primary" disabled={approving || discarding}>
						{approving ? m.groups_uploading() : m.review_lyrics_approve()}
					</button>
				</form>
			</div>
		</div>

		<div class="compare-panes">
			<div class="pane">
				<PdfView pdfUrl={data.pdfUrl} pieceId={data.pieceId} canMarkup={false} />
			</div>
			<div class="pane">
				<ScoreView xml={data.xml} positionWholeNotes={0} scoreTheme={$resolvedTheme} showBadge={false} />
			</div>
		</div>
	</div>

	<BottomNav />
</main>

<style>
	.review-page {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem 1rem 1rem;
		min-height: 0;
		flex: 1;
	}

	.review-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.review-toolbar-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.piece-title {
		margin: 0;
		font-size: 1.05rem;
	}

	.hint {
		margin: 0;
		max-width: 42rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.confirm-note {
		margin: 0 0 0.35rem;
		max-width: 20rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.btn-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.error {
		width: 100%;
		margin: 0;
		font-size: 0.8125rem;
		color: var(--danger);
	}

	.text-link {
		border: none;
		background: none;
		color: var(--accent);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.text-link--danger {
		color: var(--danger);
	}

	.compare-panes {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		min-height: 0;
		flex: 1;
	}

	@media (min-width: 900px) {
		.compare-panes {
			grid-template-columns: 1fr 1fr;
		}
	}

	.pane {
		position: relative;
		height: 65vh;
		min-height: 22rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: var(--surface);
	}

	@media (min-width: 900px) {
		.pane {
			height: calc(100vh - 12rem);
		}
	}
</style>
