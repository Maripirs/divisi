<script lang="ts">
	import { tick } from 'svelte';
	import StampShape from '$lib/components/StampShape.svelte';
	import { m } from '$lib/paraglide/messages';
	import {
		strokePathD,
		PEN_WIDTHS,
		MIN_TEXT_SIZE,
		MAX_TEXT_SIZE,
		TEXT_SIZE_NUDGE,
		type MarkupVisibility,
		type PdfMarkupController
	} from './pdfMarkup.svelte';

	/**
	 * One page's freehand-markup overlay: the SVG layer that draws saved
	 * strokes / stamps / text marks (plus the in-progress stroke preview) and
	 * the floating text-editor `<form>`. `PdfView` renders one of these per
	 * page inside its page loop. All markup state and behavior live in the
	 * shared `createPdfMarkupController`; this component is the per-page view
	 * plus the text input's own focus handling (the input ref stays here, not
	 * in the controller).
	 */
	let {
		pageIndex,
		aspect,
		canvas,
		markup,
		canMarkup,
		markupVisibility
	}: {
		pageIndex: number;
		/** `height / width` of this page's rendered canvas, for the SVG
		 * overlay's `viewBox`. pdf.js owns the value (`PdfView.pageAspects`). */
		aspect: number;
		/** This page's canvas element, owned by `PdfView`. */
		canvas: HTMLCanvasElement | undefined;
		markup: PdfMarkupController;
		canMarkup: boolean;
		markupVisibility: MarkupVisibility;
	} = $props();

	// Local `$derived` alias so `{#if textEditor && ...}` narrows the way it
	// did when this markup lived inline in `PdfView` (Svelte narrows a plain
	// identifier, not a `markup.textEditor` member access). Read-only: writes
	// go back through the controller.
	const textEditor = $derived(markup.textEditor);

	let textEditorInput = $state<HTMLInputElement | undefined>();

	// Focus (and select) this page's text field whenever the editor opens on
	// this page, and again on the blur-guard re-focus path. Both bump
	// `markup.textEditorFocusRequest`, which this effect depends on.
	$effect(() => {
		markup.textEditorFocusRequest;
		if (textEditor && textEditor.pageIndex === pageIndex) void focusTextEditor();
	});

	async function focusTextEditor(): Promise<void> {
		await tick();
		textEditorInput?.focus();
		textEditorInput?.select();
	}
</script>

{#if canMarkup && markupVisibility !== 'none'}
	<svg
		class="markup-layer"
		class:markup-layer--editable={markup.annotationMode}
		class:markup-layer--active={markup.annotationMode && markup.tool !== null}
		viewBox="0 0 1 {aspect}"
		preserveAspectRatio="xMidYMid meet"
		role="presentation"
		onpointerdown={(e) => markup.handleMarkupPointerDown(e, pageIndex)}
		onpointermove={(e) => markup.handleMarkupPointerMove(e, pageIndex)}
		onpointerup={markup.handleMarkupPointerUp}
		onpointercancel={markup.handleMarkupPointerUp}
	>
		{#each markup.marksForPage(pageIndex) as mark (mark.id)}
			{#if mark.kind === 'stroke' && mark.points}
				<path
					d={strokePathD(mark.points)}
					stroke={mark.color}
					stroke-width={mark.width ?? PEN_WIDTHS[1]}
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{:else if mark.kind === 'stamp' && mark.x !== null && mark.y !== null}
				<g class="stamp-mark" style:color={mark.color} transform={`translate(${mark.x} ${mark.y}) scale(${markup.sizeForStamp(mark)})`}>
					<StampShape type={mark.stampType} />
				</g>
			{:else if mark.kind === 'text' && mark.x !== null && mark.y !== null && mark.text}
				<g
					class="text-mark"
					class:text-mark--editable={markup.annotationMode && markup.isOwnMark(mark)}
					style:color={mark.color}
					transform={`translate(${mark.x} ${mark.y})`}
					role="button"
					tabindex={markup.annotationMode && markup.isOwnMark(mark) ? 0 : -1}
					aria-label={m.markup_text_field()}
					onpointerdown={(e) => markup.handleTextPointerDown(e, mark, pageIndex)}
					onpointermove={markup.handleTextPointerMove}
					onpointerup={(e) => markup.handleTextPointerUp(e, mark, pageIndex)}
					onpointercancel={() => markup.handleTextPointerCancel(mark)}
					onkeydown={(event) => {
						if ((event.key === 'Enter' || event.key === ' ') && markup.annotationMode && markup.isOwnMark(mark)) {
							event.preventDefault();
							markup.openTextEditorForMark(mark, pageIndex);
						}
					}}
				>
					<rect
						class="text-mark-hitbox"
						x="-0.006"
						y="-0.006"
						width={markup.textHitWidth(mark) + 0.012}
						height={markup.sizeForText(mark) * 1.25}
						rx="0.004"
					/>
					<text x="0" y="0" font-size={markup.sizeForText(mark)} fill="currentColor" dominant-baseline="hanging">{mark.text}</text>
				</g>
			{/if}
		{/each}
		{#if markup.activeStroke && markup.activeStrokePage === pageIndex}
			<path
				d={strokePathD(markup.activeStroke)}
				stroke={markup.penColor}
				stroke-width={markup.penWidth}
				fill="none"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}
	</svg>
	{#if textEditor && textEditor.pageIndex === pageIndex}
		<form
			class="text-editor"
			style={markup.textEditorStyle(pageIndex)}
			onsubmit={(event) => {
				event.preventDefault();
				void markup.commitTextEditor();
			}}
		>
			<!-- `pointerdown` preventDefault keeps focus in the field so the
			     blur-commit does not fire (and null `textEditor`) before these
			     handlers run. -->
			<div class="text-editor-tools">
				<button
					type="button"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => markup.nudgeTextEditorSize(-TEXT_SIZE_NUDGE)}
					disabled={textEditor.width <= MIN_TEXT_SIZE}
					aria-label={m.markup_text_smaller()}
				>
					−
				</button>
				<button
					type="button"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => markup.nudgeTextEditorSize(TEXT_SIZE_NUDGE)}
					disabled={textEditor.width >= MAX_TEXT_SIZE}
					aria-label={m.markup_text_larger()}
				>
					+
				</button>
				<button
					type="button"
					class="text-editor-delete"
					onpointerdown={(event) => event.preventDefault()}
					onclick={() => markup.deleteTextEditorMark()}
					aria-label={m.markup_text_delete()}
				>
					×
				</button>
			</div>
			<input
				bind:this={textEditorInput}
				value={textEditor.value}
				oninput={(event) => markup.setTextEditorValue((event.currentTarget as HTMLInputElement).value)}
				onkeydown={(event) => {
					if (event.key === 'Escape') markup.cancelTextEditor();
				}}
				onblur={() => markup.handleTextEditorBlur()}
				aria-label={m.markup_text_field()}
			/>
		</form>
	{/if}
{/if}

<style>
	.markup-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: pan-x pan-y;
		pointer-events: none;
	}

	.markup-layer--editable {
		pointer-events: auto;
	}

	.markup-layer--active {
		/* A tool is armed: a single-finger drag draws instead of scrolling
		   the page, so native panning has to be fully handed over here. */
		touch-action: none;
		cursor: crosshair;
	}

	.stamp-mark {
		pointer-events: none;
	}

	.text-mark {
		pointer-events: none;
	}

	.markup-layer--editable .text-mark--editable {
		pointer-events: auto;
		cursor: move;
	}

	.text-mark-hitbox {
		fill: transparent;
	}

	.text-mark text {
		font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		font-weight: 750;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 0.003;
		stroke-linejoin: round;
		user-select: none;
	}

	.text-editor {
		position: absolute;
		z-index: 2;
		transform: translate(-0.25rem, -0.25rem);
		margin: 0;
		color: inherit;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
	}

	/* Sits just above the field while a text is being written or edited:
	   −/+ nudge its size, × drops it. */
	.text-editor-tools {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow);
	}

	.text-editor-tools button {
		width: 1.75rem;
		height: 1.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text);
		border-radius: var(--radius-full);
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
	}

	.text-editor-tools button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.text-editor-tools button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.text-editor-tools .text-editor-delete {
		color: var(--danger);
	}

	.text-editor input {
		min-width: 7rem;
		max-width: min(18rem, 58vw);
		border: 2px solid currentColor;
		border-radius: var(--radius-md);
		background: var(--surface);
		color: currentColor;
		box-shadow: var(--shadow);
		padding: 0.2rem 0.35rem;
		font: inherit;
		font-weight: 750;
		outline: none;
	}
</style>
