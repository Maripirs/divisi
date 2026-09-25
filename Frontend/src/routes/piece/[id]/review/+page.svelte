<script lang="ts">
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import ConfirmPartsPanel, { type PartChoice } from '$lib/components/ConfirmPartsPanel.svelte';
	import PdfView from '$lib/components/PdfView.svelte';
	import ScoreView from '$lib/components/ScoreView.svelte';
	import '$lib/styles/shell.css';
	import { resolvedTheme } from '$lib/theme';
	import { withSubmitting } from '$lib/utils/enhance';
	import { clampZoom, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '$lib/actions/pinchZoom';
	import { parseMusicXmlFile } from '$lib/musicxml/parser';
	import { applyPartNameAssignments, type PartNameAssignment } from '$lib/musicxml/partNameRewriter';
	import { capitalize } from '$lib/notation/voicePartAssignment';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let approving = $state(false);
	let discarding = $state(false);
	let submittingEdit = $state(false);
	let generatingLyrics = $state(false);
	let confirmingParts = $state(false);

	// Client-side re-parse of the draft/live version's own MusicXML, purely
	// to surface `ambiguousParts` here -- the score itself still renders via
	// `ScoreView`'s own separate rendering path below, untouched by this.
	// Wrapped defensively: `data.xml` is always real content the Backend
	// already accepted, but a parse failure here should just hide the
	// confirm-parts panel rather than break the whole review page.
	let parsed = $derived.by(() => {
		try {
			return parseMusicXmlFile(data.xml);
		} catch {
			return null;
		}
	});

	// The reviewer's in-progress part assignments for this draft, keyed by
	// `AmbiguousPart.partId`. An entry absent from this record is exactly
	// what "not yet resolved" looks like -- see `ConfirmPartsPanel`'s own
	// `PartChoice` doc comment for why there's no explicit third option.
	let assignments = $state<Record<string, PartChoice>>({});

	let allResolved = $derived(
		!parsed?.ambiguousParts?.length || parsed.ambiguousParts.every((p) => assignments[p.partId] !== undefined)
	);

	// `assignVoiceParts` always fills every SATB base with a placeholder
	// `VoicePartInfo` even when no track resolved to it (so the mixer shows
	// all four voices on an SA-only piece too) -- `ConfirmPartsPanel`'s own
	// desk-number defaulting treats any `existingParts` entry as "desk 1
	// already taken" for that voice, so a phantom placeholder here made
	// every first pick in an ambiguous-heavy file (like a whole SATB
	// export with generic part names) default to desk 2 instead of the
	// plain, unsplit id. Only pass parts genuinely backed by a track.
	let realExistingParts = $derived(
		parsed ? parsed.parts.filter((p) => Object.values(parsed.trackParts).includes(p.id)) : []
	);

	/** A resolved choice's label, matching `VoicePartInfo.label`'s own
	 * `capitalize(base)[ subIndex]` / "Accompaniment" convention exactly, so
	 * a part corrected here reads identically to one the file already named
	 * itself once it's re-parsed. */
	function choiceLabel(choice: PartChoice): string {
		if (choice.kind === 'accompaniment') return 'Accompaniment';
		return choice.subIndex !== undefined ? `${capitalize(choice.base)} ${choice.subIndex}` : capitalize(choice.base);
	}

	let correctedXml = $derived.by(() => {
		if (!parsed?.ambiguousParts?.length) return '';
		const partAssignments: PartNameAssignment[] = parsed.ambiguousParts
			.filter((p) => assignments[p.partId] !== undefined)
			.map((p) => ({ partId: p.partId, label: choiceLabel(assignments[p.partId]) }));
		return applyPartNameAssignments(data.xml, partAssignments);
	});

	// `ScoreView`'s own built-in zoom pill is hidden here (see the
	// `pane-score` style block below) and this one substituted instead --
	// its default styling (bordered/tinted buttons, an `!important`-pinned
	// solid "100%") is its own look, tuned for the full-width top bar it's
	// normally part of, and fighting that with more `!important` overrides
	// was worse than just driving `ScoreView`'s already-bindable `zoom`
	// directly from a pill built the same way `PdfView`'s already is (same
	// `$lib/actions/pinchZoom` step/clamp both already share).
	let scoreZoom = $state(1);
	function scoreZoomBy(delta: number): void {
		scoreZoom = clampZoom(scoreZoom + delta);
	}

	// Where the edit panel (approve/discard, or the AI-edit form) docks --
	// a simple two-position toggle, not free dragging (deliberately: this
	// is an occasional admin tool, not worth the real complexity of
	// position persistence/collision/touch support a draggable panel
	// would need). 'top' matches this page's original layout.
	let dock = $state<'top' | 'side'>('top');

	// AI-edit measure-range picker state -- only relevant/shown while
	// `data.draftId` is null (no pending draft to review instead). Auto-filled
	// by two clicks on the score (see `handleMeasureClick`), still
	// hand-editable -- deliberately no visual highlight band in this first
	// version, just the two number fields. Kept as strings, not numbers, so
	// the inputs start out genuinely empty rather than "0".
	let measureStartInput = $state('');
	let measureEndInput = $state('');
	let message = $state('');

	/** First click after a fresh/completed selection sets the start and
	 * clears the end; the next click sets the end, swapping the two if it
	 * landed before the start (so dragging backward doesn't have to be done
	 * in a particular order to make sense). */
	function handleMeasureClick(measureNumber: number): void {
		const start = measureStartInput ? Number(measureStartInput) : null;
		const end = measureEndInput ? Number(measureEndInput) : null;
		if (start === null || end !== null) {
			measureStartInput = String(measureNumber);
			measureEndInput = '';
		} else if (measureNumber < start) {
			measureEndInput = String(start);
			measureStartInput = String(measureNumber);
		} else {
			measureEndInput = String(measureNumber);
		}
	}

	let canSubmitEdit = $derived(!!measureStartInput && !!measureEndInput && !!message.trim());
</script>

<AppHeader title={m.review_page_title()} />

<!-- Deliberately not `<main class="shell">` (every other page's normal-flow,
     scrolls-with-the-document container) -- this page must fill exactly the
     viewport below the fixed header with no page-level scroll at all, only
     the PDF/score panes scroll internally. `.review-shell` is
     `position: fixed`, sized to that gap directly (reusing `.shell`'s own
     `6.5rem` header clearance and matching its own bottom clearance so it
     lines up with every other page), rather than a normal-flow box the
     document could still grow past. -->
<main class="review-shell">
	<div class="review-body" data-dock={dock}>
		<div class="edit-panel">
			<div class="edit-panel-head">
				<div class="review-toolbar-text">
					<h2 class="piece-title">{data.pieceTitle}</h2>
					<p class="hint">{data.draftId ? m.review_hint_with_draft() : m.ai_edit_hint()}</p>
				</div>
				<button
					type="button"
					class="dock-toggle"
					onclick={() => (dock = dock === 'top' ? 'side' : 'top')}
					aria-label={m.review_dock_toggle()}
					title={m.review_dock_toggle()}
				>
					{dock === 'top' ? '⬒' : '⬓'}
				</button>
			</div>
			{#if form?.error}<p class="error">{form.error}</p>{/if}

			{#if data.draftId}
				{#if parsed?.ambiguousParts?.length}
					<ConfirmPartsPanel
						ambiguousParts={parsed.ambiguousParts}
						existingParts={realExistingParts}
						{assignments}
						onchange={(partId, choice) => {
							if (choice === undefined) {
								const next = { ...assignments };
								delete next[partId];
								assignments = next;
							} else {
								assignments = { ...assignments, [partId]: choice };
							}
						}}
					/>
					<form method="POST" action="?/resolveParts" use:enhance={withSubmitting((v) => (confirmingParts = v))}>
						<input type="hidden" name="draftId" value={data.draftId} />
						<input type="hidden" name="correctedXml" value={correctedXml} />
						<div class="btn-row">
							<button type="submit" class="btn btn-outline" disabled={confirmingParts || !allResolved}>
								{confirmingParts ? m.confirm_parts_confirming() : m.confirm_parts_confirm_button()}
							</button>
						</div>
					</form>
					<hr class="edit-panel-divider" />
				{/if}
				<div class="btn-row">
					<a class="text-link" href={lh(`/groups/${data.groupId}?tab=tracks&view=admin`)}>
						{m.action_cancel()}
					</a>
					<ConfirmButton>
						{#snippet trigger(start)}
							<button type="button" class="btn btn-danger" onclick={start} disabled={approving || discarding}>
								{m.review_draft_discard()}
							</button>
						{/snippet}
						{#snippet confirm(cancel)}
							<p class="confirm-note">{m.review_draft_discard_confirm()}</p>
							<form method="POST" action="?/discard" use:enhance={withSubmitting((v) => (discarding = v))}>
								<input type="hidden" name="draftId" value={data.draftId} />
								<button type="submit" class="text-link text-link--danger" disabled={discarding}>
									{m.review_draft_discard()}
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
						<button type="submit" class="btn btn-primary" disabled={approving || discarding || !allResolved}>
							{approving ? m.groups_uploading() : m.review_draft_approve()}
						</button>
					</form>
				</div>
				{#if !allResolved}
					<p class="hint">{m.confirm_parts_all_resolved_hint()}</p>
				{/if}
				<hr class="edit-panel-divider" />
			{/if}

			<!-- Same trigger as the Tracks tab's own "Generate lyrics from PDF"
			     button -- hidden once a draft is already pending, same as
			     there, since this always creates a fresh draft rather than
			     touching a pending one (see `+page.server.ts`'s own
			     `generateLyrics` action). -->
			{#if !data.draftId}
				<form
					method="POST"
					action="?/generateLyrics"
					use:enhance={withSubmitting((v) => (generatingLyrics = v))}
				>
					<div class="btn-row">
						<button type="submit" class="btn btn-outline" disabled={generatingLyrics}>
							{generatingLyrics ? m.groups_uploading() : m.groups_generate_lyrics_button()}
						</button>
					</div>
				</form>
				<hr class="edit-panel-divider" />
			{/if}

			<!-- Always available, draft or not -- it complements whatever's on
			     screen (the pending draft above, if any, else the live
			     version) rather than being blocked until a draft is
			     resolved: an admin reviewing a draft with a wrong lyric
			     should be able to fix just that without discarding it first
			     (see `Backend/app/api/routes/library/edit.py`'s own doc
			     comment). Submitting refines/replaces whatever draft exists,
			     or creates a fresh one from the live version. -->
			<form
				method="POST"
				action="?/submitEdit"
				class="edit-form"
				use:enhance={withSubmitting((v) => (submittingEdit = v))}
			>
				<label class="field">
					<span>{m.ai_edit_start_label()}</span>
					<input type="number" name="measure_start" min="1" bind:value={measureStartInput} required />
				</label>
				<label class="field">
					<span>{m.ai_edit_end_label()}</span>
					<input type="number" name="measure_end" min="1" bind:value={measureEndInput} required />
				</label>
				<label class="field field-message">
					<span>{m.ai_edit_message_label()}</span>
					<textarea
						name="message"
						bind:value={message}
						placeholder={m.ai_edit_message_placeholder()}
						rows="2"
						required
					></textarea>
				</label>
				<div class="btn-row edit-form-submit-row">
					<button type="submit" class="btn btn-primary" disabled={submittingEdit || !canSubmitEdit}>
						{submittingEdit ? m.ai_edit_submitting() : m.ai_edit_submit()}
					</button>
				</div>
			</form>
		</div>

		<div class="compare-panes" class:single-pane={!data.hasPdf}>
			<!-- A Tracks-tab upload with ambiguous parts can reach this page
			     with a music file but no PDF yet (Part A's own producers --
			     "Generate lyrics from PDF", AI edit -- never run PDF-less, so
			     this only ever applies to that new path). Skipping the pane
			     outright rather than handing `PdfView` an empty/failing URL
			     -- `single-pane` above hands the score the full width instead
			     of a broken half-empty layout. -->
			{#if data.hasPdf}
				<div class="pane">
					<PdfView pdfUrl={data.pdfUrl} pieceId={data.pieceId} canMarkup={false} />
				</div>
			{/if}
			<!-- `pane-score`: unlike `PdfView` (which scrolls its own content
			     internally and keeps its zoom pill fixed outside that scroll),
			     `ScoreView` relies on an ancestor to scroll (see its own
			     `nearestScrollable` doc comment) and renders its zoom controls
			     as part of that same scrolling content, sticky-top by default.
			     `.pane-score-scroll` is that scrolling ancestor; `.pane-score`
			     itself stays non-scrolling so the zoom pill (repositioned
			     bottom-right in the style block below, to match `PdfView`'s)
			     can anchor to it and float free of the score's own scroll,
			     the same "non-positioned scroll wrapper, positioned parent"
			     escape `PdfView` gets for free from its own internal structure. -->
			<div class="pane pane-score">
				<div class="pane-score-scroll">
					<ScoreView
						xml={data.xml}
						positionWholeNotes={0}
						scoreTheme={$resolvedTheme}
						showBadge={false}
						onMeasureClick={handleMeasureClick}
						bind:zoom={scoreZoom}
					/>
				</div>
				<!-- Sibling of `.pane-score-scroll`, not inside it -- see this
				     component's own script-block comment on why this exists
				     instead of `ScoreView`'s built-in one, and why it has to
				     live outside the scrolling wrapper to float free of it,
				     same reasoning as `.pane-score`'s own doc comment above. -->
				<div class="zoom-pill">
					<button onclick={() => scoreZoomBy(-ZOOM_STEP)} disabled={scoreZoom <= MIN_ZOOM} aria-label={m.zoom_out()}>
						−
					</button>
					<button onclick={() => (scoreZoom = 1)} class="zoom-level">{Math.round(scoreZoom * 100)}%</button>
					<button onclick={() => scoreZoomBy(ZOOM_STEP)} disabled={scoreZoom >= MAX_ZOOM} aria-label={m.zoom_in()}>
						+
					</button>
				</div>
			</div>
		</div>
	</div>
</main>

<style>
	/* Fills exactly the gap below the fixed `AppHeader` -- the same
	   clearance `.shell`'s own padding reserves elsewhere (`6.5rem` top /
	   `1.75rem` bottom + safe-area), just applied as a fixed box's
	   `top`/`bottom` instead of a normal-flow box's padding, since a
	   normal-flow box can still grow taller than the viewport and hand
	   scrolling to the whole page -- exactly what this page must not do.
	   `overflow: hidden` here is the actual "no scroll outside the editor"
	   rule; only `.pane` below (and the edit panel, if its content ever
	   needs to wrap more than it has room for) scroll internally. */
	.review-shell {
		position: fixed;
		top: calc(6.5rem + env(safe-area-inset-top));
		bottom: calc(1.75rem + env(safe-area-inset-bottom));
		left: 0;
		right: 0;
		overflow: hidden;
		padding: 0 1.1rem 0.75rem;
	}

	.review-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
		min-height: 0;
	}

	/* Side dock only actually goes side-by-side once there's real width for
	   it -- below that, forcing a row would squeeze the panes into nothing
	   useful, so it falls back to stacking (same as top dock) regardless of
	   the toggle. */
	@media (min-width: 700px) {
		.review-body[data-dock='side'] {
			flex-direction: row;
		}
	}

	.edit-panel {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex-shrink: 0;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow-y: auto;
	}

	@media (min-width: 700px) {
		.review-body[data-dock='side'] .edit-panel {
			width: 18rem;
			height: 100%;
		}
	}

	.edit-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.6rem;
	}

	.dock-toggle {
		flex-shrink: 0;
		min-width: 2rem;
		min-height: 2rem;
		border: 1px solid var(--border);
		background: var(--surface-2, transparent);
		color: var(--text);
		border-radius: var(--radius-md);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.dock-toggle:hover {
		border-color: var(--accent);
		color: var(--accent);
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
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.confirm-note {
		margin: 0 0 0.35rem;
		max-width: 20rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.edit-panel-divider {
		width: 100%;
		margin: 0;
		border: none;
		border-top: 1px solid var(--border);
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

	/* Grid, not flex-wrap -- explicit columns instead of trusting wrap
	   heuristics to lay 3 differently-sized fields out sensibly on a wide
	   row, which in practice left the two narrow measure fields and the
	   message field each wrapping onto their own line with a large empty
	   gap beside them. Two fixed narrow columns for the measure numbers,
	   the message field taking all remaining width; the submit row spans
	   both. */
	.edit-form {
		display: grid;
		grid-template-columns: 6rem 6rem 1fr;
		align-items: end;
		gap: 0.6rem 0.75rem;
	}

	.edit-form-submit-row {
		grid-column: 1 / -1;
	}

	/* Side dock is a narrow (18rem) column -- the 3-across grid above has
	   no room there, so it collapses to one field per row instead, same
	   breakpoint as the rest of the side-dock rules. */
	@media (min-width: 700px) {
		.review-body[data-dock='side'] .edit-form {
			grid-template-columns: 1fr;
		}
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8125rem;
		min-width: 0;
	}

	.field input[type='number'] {
		width: 100%;
	}

	.field-message textarea {
		width: 100%;
		resize: vertical;
	}

	.compare-panes {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	/* Same 700px breakpoint as the dock-related rules above, not the 900px
	   this started at -- lowered after finding the panes only ever went
	   side-by-side on a nearly-maximized wide window in practice, which
	   read as "eats half the screen" on anything more modest. One
	   consistent threshold everywhere on this page is also just easier to
	   reason about than two nearby-but-different ones. */
	@media (min-width: 700px) {
		.compare-panes {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* No PDF pane at all (a music-only draft, see the template above) -- the
	   score pane gets the full width instead of the two-column split, at
	   every viewport. Comes after the `@media` block above on purpose so it
	   wins the cascade there too (same specificity, later wins). */
	.compare-panes.single-pane {
		grid-template-columns: 1fr;
	}

	.pane {
		position: relative;
		height: 100%;
		min-height: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		/* `ScoreView`'s own `.score-container` only ever handles horizontal
		   scroll itself (`overflow-x: auto`) -- vertical scroll is meant to
		   happen on whichever ancestor actually has `overflow-y: auto` (see
		   `ScoreView.svelte`'s `nearestScrollable` doc comment; the player
		   page uses `.score-area` for that role). This pane (the PDF one --
		   `.pane-score` below overrides this back to `hidden`, see its own
		   comment) is that ancestor here, so it must scroll, not clip. */
		overflow: auto;
		background: var(--surface);
	}

	/* This pane itself no longer scrolls -- `.pane-score-scroll` inside it
	   does instead, so the zoom pill (repositioned below) has a
	   non-scrolling ancestor to anchor to and float free of the score's own
	   scroll, matching `PdfView`'s zoom pill (which gets this for free from
	   its own internal non-scrolling-outer/scrolling-inner structure). */
	.pane-score {
		overflow: hidden;
	}

	/* Deliberately NOT `position: absolute` -- an absolutely-positioned
	   scroll wrapper would itself become the containing block for the zoom
	   pill's own `position: absolute` below, defeating the whole point (the
	   pill would go right back to scrolling with it). Plain in-flow sizing
	   (`height: 100%` inside `.pane-score`'s own definite height) is enough. */
	.pane-score-scroll {
		height: 100%;
		overflow: auto;
	}

	/* `ScoreView`'s own built-in zoom controls (a full-width bar, sticky to
	   the top of whatever scrolls it, with its own bordered/tinted button
	   styling) are hidden here -- `.zoom-pill` below substitutes for it, a
	   direct copy of `PdfView.svelte`'s own `.zoom-controls`/button/
	   `.zoom-level` rules, driving `ScoreView`'s already-bindable `zoom`
	   prop instead of fighting its built-in styling with `!important`
	   overrides. See this component's script-block comment for the fuller
	   reasoning. */
	.pane-score :global(.zoom-controls) {
		display: none;
	}

	.zoom-pill {
		position: absolute;
		right: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
		z-index: 2;
	}

	.zoom-pill button {
		min-width: 2.125rem;
		border: none;
		background: transparent;
		color: var(--text);
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 700;
		cursor: pointer;
	}

	.zoom-pill button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.zoom-pill button:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.zoom-pill .zoom-level {
		min-width: 3.5rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
