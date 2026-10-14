<script lang="ts">
	import ScoreView from './ScoreView.svelte';
	import ScoreZoomControls from './score/ScoreZoomControls.svelte';
	import ScoreRenderBadge from './score/ScoreRenderBadge.svelte';
	import type { StaffLayoutSection } from '$lib/musicxml/adaptiveStaffLayout';
	import type { DisplayMode } from '$lib/midi/types';
	import type { ResolvedTheme } from '$lib/theme';

	interface Marker {
		id: string;
		positionWholeNotes: number;
	}

	let {
		sections,
		positionWholeNotes,
		displayMode,
		scoreTheme,
		onNoteClick,
		annotations = [],
		annotateMode = false,
		onAnnotationPlace,
		onAnnotationMarkerClick,
		zoom = $bindable(1),
		autoFitZoom = $bindable(false),
		rendering = $bindable(false),
		showBadge = true
	}: {
		sections: StaffLayoutSection[];
		positionWholeNotes: number;
		displayMode?: DisplayMode;
		scoreTheme?: ResolvedTheme;
		onNoteClick?: (wholeNotes: number) => void;
		annotations?: Marker[];
		annotateMode?: boolean;
		onAnnotationPlace?: (wholeNotes: number) => void;
		onAnnotationMarkerClick?: (id: string) => void;
		zoom?: number;
		autoFitZoom?: boolean;
		rendering?: boolean;
		showBadge?: boolean;
	} = $props();

	let views = $state<Record<number, ScoreView>>({});
	let renderingSections = $state<boolean[]>([]);
	let sectionAnnotations = $derived(sections.map((section, index) =>
		annotations
			.filter((marker) => marker.positionWholeNotes >= section.startWholeNotes &&
				(marker.positionWholeNotes < section.endWholeNotes || index === sections.length - 1))
			.map((marker) => ({ ...marker, positionWholeNotes: marker.positionWholeNotes - section.startWholeNotes }))
	));
	let activeIndex = $derived.by(() => {
		const index = sections.findIndex((section, i) =>
			positionWholeNotes >= section.startWholeNotes &&
			(positionWholeNotes < section.endWholeNotes || i === sections.length - 1)
		);
		return index >= 0 ? index : positionWholeNotes < sections[0]?.startWholeNotes ? 0 : sections.length - 1;
	});

	$effect(() => {
		rendering = renderingSections.some(Boolean);
	});

	// The active view's own jump already walks up to whichever ancestor
	// scrolls and centers its cursor there, so a second scroll of the
	// section wrapper would only fight it.
	export function scrollCursorIntoView(): void {
		views[activeIndex]?.scrollCursorIntoView();
	}
</script>

<!-- One zoom pill and one render badge for every section: each inner
	 ScoreView would otherwise draw its own, stacking up to three of each. -->
<div class="adaptive-score score-tokens">
	<ScoreZoomControls bind:zoom />
	{#each sections as section, index (section.firstMeasure)}
		<div class="score-section">
			{#if index === 0}
				<ScoreView
					bind:this={views[index]}
					bind:zoom
					bind:autoFitZoom
					bind:rendering={() => renderingSections[index] ?? false, (value) => (renderingSections[index] = value)}
					showBadge={false}
					showZoomControls={false}
					xml={section.xml}
					{displayMode}
					staffVisualStates={section.staffVisualStates}
					{scoreTheme}
					positionWholeNotes={positionWholeNotes - section.startWholeNotes}
					cursorActive={activeIndex === index}
					onNoteClick={(position) => onNoteClick?.(position + section.startWholeNotes)}
					annotations={sectionAnnotations[index]}
					{annotateMode}
					onAnnotationPlace={(position) => onAnnotationPlace?.(position + section.startWholeNotes)}
					{onAnnotationMarkerClick}
				/>
			{:else}
				<ScoreView
					bind:this={views[index]}
					bind:zoom
					bind:rendering={() => renderingSections[index] ?? false, (value) => (renderingSections[index] = value)}
					showBadge={false}
					showZoomControls={false}
					xml={section.xml}
					{displayMode}
					staffVisualStates={section.staffVisualStates}
					{scoreTheme}
					positionWholeNotes={positionWholeNotes - section.startWholeNotes}
					cursorActive={activeIndex === index}
					onNoteClick={(position) => onNoteClick?.(position + section.startWholeNotes)}
					annotations={sectionAnnotations[index]}
					{annotateMode}
					onAnnotationPlace={(position) => onAnnotationPlace?.(position + section.startWholeNotes)}
					{onAnnotationMarkerClick}
				/>
			{/if}
		</div>
	{/each}
	{#if rendering && showBadge}
		<ScoreRenderBadge />
	{/if}
</div>

<style>
	.adaptive-score {
		position: relative;
	}

	.score-section + .score-section {
		margin-top: 0.75rem;
	}
</style>
