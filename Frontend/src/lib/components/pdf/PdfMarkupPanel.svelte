<script lang="ts">
	import StampShape from '$lib/components/StampShape.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		PEN_COLORS,
		PEN_WIDTHS,
		STAMPS,
		MIN_STAMP_SIZE,
		MAX_STAMP_SIZE,
		STAMP_SIZE_STEP,
		MIN_TEXT_SIZE,
		MAX_TEXT_SIZE,
		TEXT_SIZE_STEP,
		type PdfMarkupController
	} from './pdfMarkup.svelte';

	/**
	 * The floating markup toolbar for `PdfView`: a master on/off button plus,
	 * when on, the tool row (pen / stamp / text / eraser / undo) and the
	 * per-tool option rows (colors, pen widths, stamp picker + size, text
	 * size). All state lives in the shared `createPdfMarkupController`; this
	 * component only reads it and calls its setters/actions.
	 */
	let { markup }: { markup: PdfMarkupController } = $props();

	// Read-only `$derived` aliases so the template reads like the inline
	// version it was lifted from; writes go through the controller's setters.
	const annotationMode = $derived(markup.annotationMode);
	const drawTarget = $derived(markup.drawTarget);
	const canDrawDirector = $derived(markup.canDrawDirector);
	const tool = $derived(markup.tool);
	const penColor = $derived(markup.penColor);
	const penWidth = $derived(markup.penWidth);
	const stampType = $derived(markup.stampType);
	const stampSize = $derived(markup.stampSize);
	const textSize = $derived(markup.textSize);
	const recentMarkIds = $derived(markup.recentMarkIds);
	const markupError = $derived(markup.markupError);
</script>

<!-- F12: bottom-left. The master on/off button sits at the bottom;
     turning it on expands the tool panel upward directly above it, so
     the two read as one control. Saved marks stay visible as
     read-only markup whenever the button is off. -->
<div class="markup-panel">
	<button
		class="annotation-mode-toggle"
		class:active={annotationMode}
		onclick={markup.toggleAnnotationMode}
		aria-label={annotationMode ? m.markup_mode_off() : m.markup_mode_on()}
		aria-pressed={annotationMode}
	>
		✎
	</button>
	{#if annotationMode}
	<div class="markup-toolbar">
	{#if canDrawDirector}
		<div class="draw-target">
			<span class="draw-target-label">{m.markup_draw_target()}</span>
			<div class="segmented" role="group" aria-label={m.markup_draw_target()}>
				<button
					type="button"
					class:active={drawTarget === 'mine'}
					aria-pressed={drawTarget === 'mine'}
					onclick={() => markup.setDrawTarget('mine')}
				>
					{m.markup_draw_target_mine()}
				</button>
				<button
					type="button"
					class:active={drawTarget === 'director'}
					aria-pressed={drawTarget === 'director'}
					onclick={() => markup.setDrawTarget('director')}
				>
					{m.markup_draw_target_director()}
				</button>
			</div>
		</div>
	{/if}
	<div class="tool-row">
		<button
			class="tool-btn"
			class:active={tool === 'pen'}
			onclick={() => markup.setTool('pen')}
			aria-label={m.markup_tool_pen()}
			aria-pressed={tool === 'pen'}
		>
			✎
		</button>
		<button
			class="tool-btn"
			class:active={tool === 'stamp'}
			onclick={() => markup.setTool('stamp')}
			aria-label={m.markup_tool_stamp()}
			aria-pressed={tool === 'stamp'}
		>
			<svg class="tool-stamp-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
				<StampShape type={stampType} />
			</svg>
		</button>
		<button
			class="tool-btn tool-btn--text"
			class:active={tool === 'text'}
			onclick={() => markup.setTool('text')}
			aria-label={m.markup_tool_text()}
			aria-pressed={tool === 'text'}
		>
			T
		</button>
		<button
			class="tool-btn"
			class:active={tool === 'eraser'}
			onclick={() => markup.setTool('eraser')}
			aria-label={m.markup_tool_eraser()}
			aria-pressed={tool === 'eraser'}
		>
			⌫
		</button>
		<button class="tool-btn" onclick={markup.undoLastMark} disabled={recentMarkIds.length === 0} aria-label={m.markup_undo()}>
			↺
		</button>
	</div>
	{#if tool === 'pen' || tool === 'stamp' || tool === 'text'}
		<div class="option-row">
			{#each PEN_COLORS as color (color)}
				<button
					class="color-swatch"
					class:active={penColor === color}
					style:background={color}
					onclick={() => markup.setPenColor(color)}
					aria-label={color}
				></button>
			{/each}
		</div>
	{/if}
	{#if tool === 'pen'}
		<div class="option-row">
			{#each PEN_WIDTHS as width, i (width)}
				<button
					class="width-btn"
					class:active={penWidth === width}
					onclick={() => markup.setPenWidth(width)}
					aria-label={m.markup_pen_width()}
				>
					<span class="width-dot" style:width="{4 + i * 3}px" style:height="{4 + i * 3}px"></span>
				</button>
			{/each}
		</div>
	{/if}
	{#if tool === 'stamp'}
		<div class="option-row">
			{#each STAMPS as stamp (stamp.type)}
				<button
					class="stamp-btn"
					class:active={stampType === stamp.type}
					onclick={() => markup.setStampType(stamp.type)}
					aria-label={stamp.label()}
				>
					<svg class="stamp-icon" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
						<StampShape type={stamp.type} />
					</svg>
				</button>
			{/each}
		</div>
		<div class="stamp-size-control">
			<svg class="stamp-size-preview stamp-size-preview--small" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
				<StampShape type={stampType} />
			</svg>
			<input
				type="range"
				min={MIN_STAMP_SIZE}
				max={MAX_STAMP_SIZE}
				step={STAMP_SIZE_STEP}
				value={stampSize}
				oninput={(event) => markup.setStampSize(Number((event.currentTarget as HTMLInputElement).value))}
				aria-label={m.markup_stamp_size()}
			/>
			<svg class="stamp-size-preview stamp-size-preview--large" viewBox="-0.5 -0.5 1 1" aria-hidden="true">
				<StampShape type={stampType} />
			</svg>
		</div>
	{/if}
	{#if tool === 'text'}
		<div class="text-size-control">
			<span class="text-size-preview text-size-preview--small" aria-hidden="true">T</span>
			<input
				type="range"
				min={MIN_TEXT_SIZE}
				max={MAX_TEXT_SIZE}
				step={TEXT_SIZE_STEP}
				value={textSize}
				oninput={(event) => markup.setTextSize(Number((event.currentTarget as HTMLInputElement).value))}
				aria-label={m.markup_text_size()}
			/>
			<span class="text-size-preview text-size-preview--large" aria-hidden="true">T</span>
		</div>
	{/if}
	{#if markupError}
		<p class="markup-error">{markupError}</p>
	{/if}
	</div>
	{/if}
	{#if annotationMode && drawTarget === 'director'}
		<!-- F21: persistent, always-visible reminder (not a dismissible toast).
		     Last in the DOM so `column-reverse` / `row` both float it clear of
		     the toolbar. Stays up the entire time the draw target is the
		     shared layer. -->
		<p class="director-reminder" role="status">{m.markup_director_reminder()}</p>
	{/if}
</div>

<style>
	/* Bottom-left, opposite `.zoom-controls` (bottom-right). The always-present
	   on/off button anchors the group; the tool panel (when open) sits beside
	   it on a wide enough viewport, or stacked above it on a narrow one.
	   `column-reverse` keeps the button pinned to the bottom while the panel
	   grows upward (button is first in the DOM). */
	.markup-panel {
		position: absolute;
		left: 0.75rem;
		bottom: 0.75rem;
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: 0.4rem;
		max-width: calc(100% - 1.5rem);
		max-height: calc(100% - 1.5rem);
	}

	/* Enough room to lay the panel out to the right of the button rather
	   than above it. */
	@media (min-width: 560px) {
		.markup-panel {
			flex-direction: row;
			align-items: flex-end;
		}
	}

	.annotation-mode-toggle {
		min-width: 2.125rem;
		min-height: 2.125rem;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.annotation-mode-toggle:hover {
		background: var(--surface-2);
	}

	.annotation-mode-toggle.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.markup-toolbar {
		min-height: 0;
		min-width: 0;
		flex: 0 1 auto;
		overflow-y: auto;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.4rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		transform-origin: bottom left;
		animation: markup-toolbar-expand-up 0.16s ease-out;
	}

	@keyframes markup-toolbar-expand-up {
		from {
			opacity: 0;
			transform: scaleY(0.55) translateY(0.35rem);
		}

		to {
			opacity: 1;
			transform: none;
		}
	}

	/* Beside-the-button layout: unfold horizontally out of the button
	   instead of upward. */
	@media (min-width: 560px) {
		.markup-toolbar {
			transform-origin: left center;
			animation-name: markup-toolbar-expand-side;
		}
	}

	@keyframes markup-toolbar-expand-side {
		from {
			opacity: 0;
			transform: scaleX(0.55) translateX(-0.35rem);
		}

		to {
			opacity: 1;
			transform: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.markup-toolbar {
			animation: none;
		}
	}

	.tool-row,
	.option-row {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	/* F21: persistent reminder that edits go to the shared group layer. A
	   solid coloured bar pinned above the toolbar, always visible while the
	   director draw target is active. Deliberately not dismissible. */
	.director-reminder {
		margin: 0;
		max-width: 18rem;
		padding: 0.4rem 0.6rem;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 0.75rem;
		font-weight: 650;
		line-height: 1.3;
		box-shadow: var(--shadow);
	}

	.draw-target {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.1rem 0.15rem 0.15rem;
	}

	.draw-target-label {
		font-size: 0.7rem;
		font-weight: 650;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.draw-target .segmented {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--surface-2);
		border-radius: var(--radius-md);
	}

	.draw-target .segmented button {
		flex: 1;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text);
		padding: 0.25rem 0.5rem;
		border-radius: 0.35rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.draw-target .segmented button.active {
		background: var(--surface);
		border-color: var(--accent);
		color: var(--accent);
	}

	.tool-btn {
		min-width: 2.125rem;
		min-height: 2.125rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text);
		border-radius: var(--radius-md);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.tool-btn:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.tool-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.tool-btn.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.tool-btn--text {
		font-family: ui-serif, Georgia, serif;
		font-size: 1.05rem;
		font-weight: 800;
	}

	.color-swatch {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid transparent;
		border-radius: 50%;
		padding: 0;
		cursor: pointer;
	}

	.color-swatch.active {
		border-color: var(--text);
	}

	.width-btn,
	.stamp-btn {
		min-width: 2rem;
		min-height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		border-radius: var(--radius-md);
		font-size: 0.9375rem;
		cursor: pointer;
	}

	.stamp-btn {
		width: 2rem;
		height: 2rem;
	}

	.width-btn.active,
	.stamp-btn.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--accent);
	}

	.tool-stamp-icon,
	.stamp-icon,
	.stamp-size-preview {
		display: block;
		color: currentColor;
		overflow: visible;
	}

	.tool-stamp-icon {
		width: 1.2rem;
		height: 1.2rem;
	}

	.stamp-icon {
		width: 1.15rem;
		height: 1.15rem;
	}

	.stamp-size-control,
	.text-size-control {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.1rem 0.25rem 0.15rem;
		color: var(--text-muted);
	}

	.stamp-size-control input,
	.text-size-control input {
		width: min(10rem, 48vw);
		accent-color: var(--accent);
		cursor: pointer;
	}

	.stamp-size-preview {
		color: var(--text-muted);
	}

	.stamp-size-preview--small {
		width: 0.85rem;
		height: 0.85rem;
	}

	.stamp-size-preview--large {
		width: 1.45rem;
		height: 1.45rem;
	}

	.text-size-preview {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.45rem;
		font-family: ui-serif, Georgia, serif;
		font-weight: 800;
		line-height: 1;
		color: var(--text-muted);
	}

	.text-size-preview--small {
		font-size: 0.8rem;
	}

	.text-size-preview--large {
		font-size: 1.35rem;
	}

	.width-dot {
		display: block;
		border-radius: 50%;
		background: currentColor;
	}

	.markup-error {
		margin: 0;
		max-width: 14rem;
		font-size: 0.75rem;
		color: var(--danger);
	}
</style>
