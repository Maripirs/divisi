<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import { MidiPlayer } from '$lib/audio/player';
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

	// Whether the floating AI-edit chat panel is expanded. Independent of
	// the measure-range state below -- a click on the score while this is
	// closed still populates `measureStartInput`/`measureEndInput`, so
	// opening the panel afterward shows the range already filled in.
	let chatOpen = $state(false);

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

	// Playback: this page already re-parses the draft/live version's own
	// MusicXML into `parsed` above (for the ambiguous-parts panel), which is
	// exactly the `ParsedMIDI` shape `MidiPlayer` needs -- no mixer/tempo
	// control or cursor-follow here, this is the same bottom playback bar
	// the main piece page uses (play/pause + scrubber), just "let an admin
	// hear the piece while reviewing it", same synth.
	let player: MidiPlayer | undefined = $state();
	let isPlaying = $state(false);
	let positionMs = $state(0);
	let durationMs = $state(0);
	let rafHandle: number;

	function tick() {
		if (player) {
			positionMs = player.positionMs;
			isPlaying = player.isPlaying;
		}
		rafHandle = requestAnimationFrame(tick);
	}

	onMount(() => {
		let destroyed = false;
		MidiPlayer.create().then((created) => {
			if (destroyed) {
				created.destroy();
				return;
			}
			player = created;
		});
		rafHandle = requestAnimationFrame(tick);
		return () => {
			destroyed = true;
			cancelAnimationFrame(rafHandle);
			player?.destroy();
		};
	});

	// Loads (or reloads) whenever either becomes available/changes -- covers
	// the ordinary case (player finishes initializing after `parsed` is
	// already there) and a client-side nav to a different piece reusing this
	// same component instance.
	$effect(() => {
		if (!player || !parsed) return;
		void player.load(parsed).then(() => {
			durationMs = player?.duration ?? 0;
		});
	});

	async function togglePlay() {
		if (!player) return;
		if (player.isPlaying) player.pause();
		else await player.play();
	}

	function seek(ms: number) {
		player?.seek(ms);
	}

	function formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	let seekPct = $derived(durationMs > 0 ? (positionMs / durationMs) * 100 : 0);
</script>

<AppHeader title={data.pieceTitle} />

<!-- Deliberately not `<main class="shell">` (every other page's normal-flow,
     scrolls-with-the-document container) -- this page must fill exactly the
     viewport below the fixed header with no page-level scroll at all, only
     the PDF/score panes scroll internally. `.review-shell` is
     `position: fixed`, sized to that gap directly (reusing `.shell`'s own
     `6.5rem` header clearance and matching its own bottom clearance so it
     lines up with every other page), rather than a normal-flow box the
     document could still grow past. -->
<main class="review-shell">
	<!-- Only rendered while a draft is actually pending -- sized to its own
	     content (`flex: 0 0 auto`), not a fixed-height docked panel, and
	     simply absent otherwise so the compare panes below get the room. -->
	{#if data.draftId}
		<div class="draft-bar">
			{#if form?.error}<p class="error">{form.error}</p>{/if}
			<p class="hint">{m.review_hint_with_draft()}</p>
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
		</div>
	{/if}

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

	<!-- Floating AI-edit entry point -- replaces the old docked edit panel.
	     `position: absolute` within `.review-shell` (itself `position: fixed`),
	     so this anchors to the viewport-sized shell rather than scrolling
	     with either pane. Always rendered, draft or not -- see the panel's
	     own doc comment below for why the AI-edit form stays available
	     regardless of draft state. -->
	<button
		type="button"
		class="chat-fab"
		onclick={() => (chatOpen = !chatOpen)}
		aria-label={m.review_chat_toggle()}
		title={m.review_chat_toggle()}
	>
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
		</svg>
	</button>

	{#if chatOpen}
		<div class="chat-panel">
			<div class="chat-panel-head">
				<p class="hint">{m.ai_edit_hint()}</p>
				<button type="button" class="icon-btn" onclick={() => (chatOpen = false)} aria-label={m.review_chat_close()}>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Same trigger as the Tracks tab's own "Generate lyrics from
			     PDF" button -- hidden once a draft is already pending, same
			     as there, since this always creates a fresh draft rather
			     than touching a pending one (see `+page.server.ts`'s own
			     `generateLyrics` action). -->
			{#if !data.draftId}
				<form method="POST" action="?/generateLyrics" use:enhance={withSubmitting((v) => (generatingLyrics = v))}>
					<button type="submit" class="btn btn-outline" disabled={generatingLyrics}>
						{generatingLyrics ? m.groups_uploading() : m.groups_generate_lyrics_button()}
					</button>
				</form>
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
				class="chat-composer"
				use:enhance={withSubmitting((v) => (submittingEdit = v))}
			>
				<div class="measure-fields">
					<label class="field">
						<span>{m.ai_edit_start_label()}</span>
						<input type="number" name="measure_start" min="1" bind:value={measureStartInput} required />
					</label>
					<label class="field">
						<span>{m.ai_edit_end_label()}</span>
						<input type="number" name="measure_end" min="1" bind:value={measureEndInput} required />
					</label>
				</div>
				<div class="composer-row">
					<textarea
						name="message"
						bind:value={message}
						aria-label={m.ai_edit_message_label()}
						placeholder={m.ai_edit_message_placeholder()}
						rows="2"
						required
					></textarea>
					<button
						type="submit"
						class="send-btn"
						disabled={submittingEdit || !canSubmitEdit}
						aria-label={submittingEdit ? m.ai_edit_submitting() : m.ai_edit_submit()}
						title={submittingEdit ? m.ai_edit_submitting() : m.ai_edit_submit()}
					>
						<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M3 11.5 20.5 3l-5 17.5-4-7-7-1.5z" />
						</svg>
					</button>
				</div>
			</form>
			{#if form?.error}<p class="error">{form.error}</p>{/if}
		</div>
	{/if}

	<footer class="review-playbar">
		<button
			type="button"
			class="play-btn"
			onclick={togglePlay}
			disabled={!player || !parsed}
			aria-label={isPlaying ? m.piece_pause() : m.piece_play()}
		>
			{#if isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M6 5h4v14H6zM14 5h4v14h-4z" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>
		<div class="scrubber">
			<input
				type="range"
				class="seek-slider"
				style:--fill="{seekPct}%"
				min="0"
				max={durationMs}
				value={positionMs}
				aria-label={m.piece_seek()}
				oninput={(e) => seek(Number((e.target as HTMLInputElement).value))}
			/>
			<div class="time-row">
				<span>{formatTime(positionMs)}</span>
				<span>{formatTime(durationMs)}</span>
			</div>
		</div>
	</footer>
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
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0 1.1rem 0.75rem;
	}

	/* Same play/pause + scrubber bar as the main piece page's bottom-bar
	   (`piece/[id]/+page.svelte`) -- reusing its exact look rather than the
	   small icon-only control this replaced, so playback reads the same
	   way everywhere in the app. Its own bordered card, not edge-to-edge,
	   since this page's other regions (`.draft-bar`/`.compare-panes`) are
	   already cards floating inside `.review-shell`'s padding. */
	.review-playbar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}

	.play-btn {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.play-btn:hover {
		background: var(--accent-hover);
	}

	.play-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.play-btn svg {
		width: 20px;
		height: 20px;
	}

	.scrubber {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}

	.seek-slider {
		background: linear-gradient(
			to right,
			var(--accent) 0%,
			var(--accent) var(--fill),
			var(--surface-2) var(--fill),
			var(--surface-2) 100%
		);
	}

	.time-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}

	/* The slim draft-decision bar -- only rendered while `data.draftId` is
	   set (see the template), so this never needs to account for a "no
	   draft" state itself. Sized to its own content (`flex: 0 0 auto`),
	   same card look as `.pane`/`.review-playbar`, not a fixed-height
	   docked panel. */
	.draft-bar {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 0 0 auto;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		overflow-y: auto;
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

	/* The floating AI-edit entry point. `position: absolute` within
	   `.review-shell` (itself `position: fixed`), bottom-right, sitting
	   just above `.review-playbar` -- that bar is ~4.1rem tall (its 44px
	   `.play-btn` plus 0.6rem top/bottom padding plus its 1px border), so
	   `bottom` clears it with a bit of room to spare. */
	.chat-fab {
		position: absolute;
		right: 1.25rem;
		bottom: calc(4.1rem + 1rem);
		width: 3.25rem;
		height: 3.25rem;
		border-radius: 50%;
		border: none;
		background: var(--accent);
		color: var(--accent-contrast);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: var(--shadow);
		z-index: 3;
		transition: background-color 0.15s ease;
	}

	.chat-fab:hover {
		background: var(--accent-hover);
	}

	.chat-fab svg {
		width: 22px;
		height: 22px;
	}

	/* Anchored just above the FAB (its own 3.25rem height plus a small
	   gap), same card treatment as `.draft-bar`/`.pane`. Fixed-ish width,
	   capped height with internal scroll so a long error/hint never pushes
	   it off the top of `.review-shell`. */
	.chat-panel {
		position: absolute;
		right: 1.25rem;
		bottom: calc(4.1rem + 1rem + 3.25rem + 0.75rem);
		width: 21rem;
		max-width: calc(100vw - 2.5rem);
		max-height: min(32rem, calc(100% - 2rem));
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow);
		z-index: 3;
	}

	.chat-panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.chat-panel-head .hint {
		flex: 1;
	}

	/* Same icon-button look `SettingsDrawer.svelte`'s own close button
	   uses -- a plain stroke glyph on a transparent, circular hover
	   target, not this page's filled-icon convention (`.play-btn`/
	   `.chat-fab`/`.send-btn`), since this is a close affordance tucked
	   into a corner rather than a primary action. */
	.icon-btn {
		flex-shrink: 0;
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--surface-2);
	}

	.icon-btn svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chat-composer {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* The two measure-range fields side by side, compact -- this panel is
	   ~21rem wide, with no room for the old wide page's 4-across grid. */
	.measure-fields {
		display: flex;
		gap: 0.5rem;
	}

	.measure-fields .field {
		flex: 1;
	}

	/* The chat-style composer row: a rounded textarea with the submit
	   button as a small circular send icon at its trailing edge, instead
	   of a separate full-width pill button below it. */
	.composer-row {
		position: relative;
		display: flex;
	}

	.composer-row textarea {
		flex: 1;
		width: 100%;
		resize: vertical;
		padding: 0.55rem 2.5rem 0.55rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface-2, transparent);
		color: var(--text);
		font: inherit;
	}

	.send-btn {
		position: absolute;
		right: 0.35rem;
		bottom: 0.35rem;
		width: 1.9rem;
		height: 1.9rem;
		flex-shrink: 0;
		border: none;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.send-btn svg {
		width: 15px;
		height: 15px;
	}

	.compare-panes {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	/* 700px, not the 900px this started at -- lowered after finding the
	   panes only ever went side-by-side on a nearly-maximized wide window
	   in practice, which read as "eats half the screen" on anything more
	   modest. */
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
