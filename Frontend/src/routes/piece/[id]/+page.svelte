<script lang="ts">
	import { onDestroy, onMount, tick as svelteTick } from 'svelte';
	import { goto } from '$app/navigation';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, MidiPlayer } from '$lib/audio/player';
	import { convertVisualParts } from '$lib/midi/musicXmlConverter';
	import {
		DISPLAY_MODES,
		MIX_PARTS,
		VOICE_PARTS,
		VISUAL_STATES,
		type DisplayMode,
		type MixPart,
		type ParsedMIDI,
		type VisualState,
		type VoicePart
	} from '$lib/midi/types';
	import { getPiece } from '$lib/pieces/registry';
	import { THEME_MODES, highlightedMutedInk, resolvedTheme, setThemeMode, themeMode, type ThemeMode } from '$lib/theme';
	import PdfView from '$lib/components/PdfView.svelte';
	import ScoreView from '$lib/components/ScoreView.svelte';

	let { data }: { data: { id: string } } = $props();
	// The keyed markup remounts this component whenever the route id changes,
	// so capturing the matching piece once per mount is intentional.
	// svelte-ignore state_referenced_locally
	const piece = getPiece(data.id);

	const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
		flat: 'Full score',
		highlighted: 'Highlighted',
		solo: 'Solo',
		custom: 'Custom'
	};

	const VISUAL_STATE_LABELS: Record<VisualState, string> = {
		off: 'Off',
		muted: 'Muted',
		active: 'Active'
	};

	const THEME_LABELS: Record<ThemeMode, string> = {
		system: 'System',
		light: 'Light',
		dark: 'Dark'
	};

	type ViewMode = 'player' | 'pdf';
	const VIEW_MODES: ViewMode[] = ['player', 'pdf'];
	const VIEW_MODE_LABELS: Record<ViewMode, string> = {
		player: 'Player',
		pdf: 'PDF'
	};

	type LoadState =
		| { kind: 'loading' }
		| { kind: 'notFound' }
		| { kind: 'error'; message: string }
		| { kind: 'ready' }
		| { kind: 'noVisibleTracks' }
		| { kind: 'noNotesForVoicePart'; part: MixPart };

	let loadState = $state<LoadState>(piece ? { kind: 'loading' } : { kind: 'notFound' });
	let parsed: ParsedMIDI | undefined;
	let player: MidiPlayer | undefined;

	let voicePart = $state<VoicePart>('soprano');
	let displayMode = $state<DisplayMode>('solo');
	let visualStates = $state<Record<MixPart, VisualState>>({
		soprano: 'active',
		alto: 'off',
		tenor: 'off',
		bass: 'off',
		accompaniment: 'off'
	});
	let xml = $state('');
	let msPerWholeNote = $state(0);
	let positionMs = $state(0);
	let durationMs = $state(0);
	let isPlaying = $state(false);
	let menuOpen = $state(false);
	let viewMode = $state<ViewMode>('player');
	let zoomLevel = $state(1);
	let pdfZoomLevel = $state(1);
	let tempoBpm = $state(120);
	let baseTempoBpm = $state(120);
	let balance = $state<Record<MixPart, number>>({
		soprano: 0.5,
		alto: 0.5,
		tenor: 0.5,
		bass: 0.5,
		accompaniment: 0.5
	});

	let scoreView: ScoreView | undefined = $state();

	let seekPct = $derived(durationMs > 0 ? (positionMs / durationMs) * 100 : 0);
	let visibleMixParts = $derived(MIX_PARTS.filter((part) => visualStates[part] !== 'off'));
	let visibleStaffStates = $derived(visibleMixParts.map((part) => visualStates[part]));
	let rafHandle: number;
	let destroyed = false;

	onMount(() => {
		if (piece) void bootstrap();
		rafHandle = requestAnimationFrame(tick);
	});

	onDestroy(() => {
		destroyed = true;
		cancelAnimationFrame(rafHandle);
		player?.destroy();
		player = undefined;
		clearMediaSession();
	});

	async function bootstrap() {
		if (!piece) return;
		const stored = loadPersistedSettings(piece.id);
		if (stored.voicePart) voicePart = stored.voicePart;
		if (stored.displayMode) displayMode = stored.displayMode;
		if (stored.visualStates) visualStates = stored.visualStates;
		if (stored.balance) balance = stored.balance;
		if (stored.viewMode) viewMode = stored.viewMode;
		if (stored.zoomLevel !== undefined) zoomLevel = Math.min(2, Math.max(0.5, stored.zoomLevel));
		if (stored.pdfZoomLevel !== undefined) pdfZoomLevel = Math.min(2, Math.max(0.5, stored.pdfZoomLevel));
		try {
			const [fetchedPlayer, loadedPiece] = await Promise.all([MidiPlayer.create(), piece.load()]);
			if (destroyed) {
				fetchedPlayer.destroy();
				return;
			}
			player = fetchedPlayer;
			parsed = loadedPiece;
			await player.load(parsed);
			if (destroyed) {
				player.destroy();
				player = undefined;
				return;
			}
			durationMs = player.duration;
			baseTempoBpm = player.baseBPM;
			const storedTempo = stored.tempoBpm;
			if (storedTempo !== undefined && storedTempo >= MIN_TEMPO_BPM && storedTempo <= MAX_TEMPO_BPM) {
				setTempo(storedTempo, false);
			} else {
				tempoBpm = player.tempoBPM;
			}
			for (const part of MIX_PARTS) player.setPartVolume(part, balance[part]);
			render();
			setupMediaSession();
		} catch (e) {
			loadState = { kind: 'error', message: String(e) };
		}
	}

	function render() {
		if (!parsed) return;
		if (visibleMixParts.length === 0) {
			xml = '';
			loadState = { kind: 'noVisibleTracks' };
			return;
		}
		if (visibleMixParts.length === 1 && !hasNotesForPart(parsed, visibleMixParts[0])) {
			xml = '';
			loadState = { kind: 'noNotesForVoicePart', part: visibleMixParts[0] };
			return;
		}
		try {
			const mutedNoteColor = highlightedMutedInk($resolvedTheme);
			const result = convertVisualParts(parsed, visualStates, mutedNoteColor);
			xml = result.xml;
			msPerWholeNote = result.msPerWholeNote;
			loadState = { kind: 'ready' };
		} catch {
			xml = '';
			loadState = { kind: 'noNotesForVoicePart', part: voicePart };
		}
	}

	function tick() {
		if (player) {
			positionMs = player.positionMs;
			isPlaying = player.isPlaying;
		}
		rafHandle = requestAnimationFrame(tick);
	}

	async function togglePlay() {
		if (!player) return;
		if (player.isPlaying) player.pause();
		else await player.play();
	}

	function seek(ms: number) {
		player?.seek(ms);
	}

	function setBalance(part: MixPart, value: number) {
		balance = { ...balance, [part]: value };
		player?.setPartVolume(part, value);
		persistSettings();
	}

	// Every user-adjustable player setting, keyed per piece id so switching
	// pieces doesn't bleed one piece's mix/tempo/view into another's, and
	// restored on the next visit instead of always starting from the
	// hardcoded defaults above.
	interface PersistedSettings {
		tempoBpm: number;
		voicePart: VoicePart;
		displayMode: DisplayMode;
		visualStates: Record<MixPart, VisualState>;
		balance: Record<MixPart, number>;
		viewMode: ViewMode;
		zoomLevel: number;
		pdfZoomLevel: number;
	}

	function settingsStorageKey(id: string): string {
		return `divisi:settings:${id}`;
	}

	function loadPersistedSettings(id: string): Partial<PersistedSettings> {
		const raw = localStorage.getItem(settingsStorageKey(id));
		if (!raw) return {};
		try {
			return JSON.parse(raw) as Partial<PersistedSettings>;
		} catch {
			return {};
		}
	}

	function persistSettings() {
		if (!piece) return;
		const settings: PersistedSettings = {
			tempoBpm,
			voicePart,
			displayMode,
			visualStates,
			balance,
			viewMode,
			zoomLevel,
			pdfZoomLevel
		};
		localStorage.setItem(settingsStorageKey(piece.id), JSON.stringify(settings));
	}

	function setTempo(bpm: number, persist = true) {
		tempoBpm = bpm;
		player?.setTempo(bpm);
		if (persist) persistSettings();
	}

	function setViewMode(mode: ViewMode) {
		viewMode = mode;
		persistSettings();
		if (mode === 'player') {
			// The score view was hidden via CSS (`display: none`), not
			// unmounted — but OSMD's `autoResize` only recalculates layout on
			// a real `window` resize event, not a ResizeObserver on its own
			// container, so it never notices regaining a real width until
			// one actually fires. A synthetic one nudges it to re-measure
			// and redraw immediately, instead of leaving a stale/blank
			// layout until the next incidental resize (e.g. zooming).
			void svelteTick().then(() => window.dispatchEvent(new Event('resize')));
		}
	}

	function setFocus(part: MixPart) {
		if (part === 'accompaniment') return;
		voicePart = part;
		if (displayMode === 'highlighted' || displayMode === 'solo') {
			visualStates = presetVisualStates(displayMode, part);
		}
		persistSettings();
	}

	function setDisplayMode(mode: DisplayMode) {
		displayMode = mode;
		if (mode !== 'custom') visualStates = presetVisualStates(mode, voicePart);
		persistSettings();
	}

	function presetVisualStates(mode: DisplayMode, focusPart: VoicePart): Record<MixPart, VisualState> {
		return Object.fromEntries(
			MIX_PARTS.map((part) => {
				let state: VisualState;
				if (mode === 'flat' || mode === 'custom') state = 'active';
				else if (mode === 'highlighted') state = part === focusPart ? 'active' : 'muted';
				else state = part === focusPart ? 'active' : 'off';
				return [part, state];
			})
		) as Record<MixPart, VisualState>;
	}

	function cycleVisualState(part: MixPart) {
		const currentIndex = VISUAL_STATES.indexOf(visualStates[part]);
		const nextState = VISUAL_STATES[(currentIndex + 1) % VISUAL_STATES.length];
		const nextStates = { ...visualStates, [part]: nextState };
		visualStates = nextStates;
		displayMode = matchingDisplayMode(nextStates, voicePart);
		persistSettings();
	}

	function matchingDisplayMode(states: Record<MixPart, VisualState>, focusPart: VoicePart): DisplayMode {
		const presetModes: DisplayMode[] = ['flat', 'highlighted', 'solo'];
		return presetModes.find((mode) => sameVisualStates(states, presetVisualStates(mode, focusPart))) ?? 'custom';
	}

	function sameVisualStates(a: Record<MixPart, VisualState>, b: Record<MixPart, VisualState>): boolean {
		return MIX_PARTS.every((part) => a[part] === b[part]);
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			menuOpen = false;
			return;
		}
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable) {
			return;
		}
		if (
			loadState.kind !== 'ready' &&
			loadState.kind !== 'noNotesForVoicePart' &&
			loadState.kind !== 'noVisibleTracks'
		) {
			return;
		}
		if (event.code === 'Space') {
			event.preventDefault();
			void togglePlay();
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			seekByMeasure(1);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			seekByMeasure(-1);
		}
	}

	function measureDurationMs(): number {
		if (!parsed || msPerWholeNote <= 0) return 0;
		const { numerator, denominator } = parsed.timeSignature;
		return msPerWholeNote * (numerator / denominator);
	}

	function seekByMeasure(direction: 1 | -1) {
		const measureMs = measureDurationMs();
		if (measureMs <= 0) return;
		seek(Math.min(durationMs, Math.max(0, positionMs + direction * measureMs)));
	}

	function describeBalance(value: number): string {
		const diff = Math.round((value - 0.5) * 200);
		if (Math.abs(diff) < 4) return 'Even';
		return diff > 0 ? `+${diff}%` : `${diff}%`;
	}

	function describeTempo(bpm: number): string {
		return `${bpm} BPM (${Math.round((bpm / baseTempoBpm) * 100)}%)`;
	}

	function stepTempo(delta: number) {
		setTempo(Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, tempoBpm + delta)));
	}

	function setupMediaSession() {
		if (!('mediaSession' in navigator) || !piece) return;
		navigator.mediaSession.metadata = new MediaMetadata({ title: piece.title, artist: piece.composer });
		navigator.mediaSession.setActionHandler('play', () => void togglePlay());
		navigator.mediaSession.setActionHandler('pause', () => void togglePlay());
	}

	function clearMediaSession() {
		if (!('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = null;
		navigator.mediaSession.setActionHandler('play', null);
		navigator.mediaSession.setActionHandler('pause', null);
	}

	$effect(() => {
		voicePart;
		displayMode;
		visualStates;
		$resolvedTheme;
		render();
	});

	// `zoomLevel` is driven two-way from inside `ScoreView` (buttons + pinch
	// gesture), not through a page-level setter like the other settings, so
	// it needs its own persist effect. Guarded on `loadState` so it doesn't
	// fire — and clobber a real stored value with the "1" default — before
	// `bootstrap()`'s restore has actually run.
	$effect(() => {
		zoomLevel;
		pdfZoomLevel;
		if (loadState.kind === 'loading') return;
		persistSettings();
	});

	function formatTime(ms: number): string {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	function mixLabel(part: MixPart): string {
		return part === 'accompaniment' ? 'Accomp.' : part;
	}

	function visualStateFor(part: MixPart): VisualState {
		return visualStates[part];
	}

	function hasNotesForPart(piece: ParsedMIDI, part: MixPart): boolean {
		if (part === 'accompaniment') return piece.backingNotes.length > 0;
		return piece.notes.some((note) => note.voicePart === part);
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#key data.id}
	<div class="player-shell">
		<header class="top-bar">
			<button class="icon-btn" onclick={() => goto('/')} aria-label="Back to library">
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>

			<div class="top-bar-title">
				<h1>{piece?.title ?? 'Divisi'}</h1>
				{#if piece}
					<p>{piece.composer}</p>
				{/if}
			</div>

			<button
				class="icon-btn"
				disabled={
					loadState.kind !== 'ready' &&
					loadState.kind !== 'noNotesForVoicePart' &&
					loadState.kind !== 'noVisibleTracks'
				}
				onclick={() => (menuOpen = true)}
				aria-label="Open settings"
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 7h16M4 12h16M4 17h16" />
				</svg>
			</button>
		</header>

		<main class="score-area">
			<!-- Both panes stay mounted once shown, toggling only via `hidden` —
			     switching view modes used to swap them with an {#if}, which tore
			     down and rebuilt OSMD's whole SVG tree (or re-fetched the PDF)
			     on every toggle, stalling the main thread long enough to glitch
			     the synth's audio callback (js-synthesizer runs on a
			     ScriptProcessorNode, not an AudioWorklet, so it's not immune to
			     main-thread jank). -->
			<div class="view-pane" class:hidden={viewMode !== 'player'}>
				{#if loadState.kind === 'loading'}
					<div class="status-card">
						<div class="spinner" aria-hidden="true"></div>
						<p>Loading score...</p>
					</div>
				{:else if loadState.kind === 'notFound'}
					<div class="status-card status-card--error">
						<p>No piece found with that id.</p>
						<button class="text-link" onclick={() => goto('/')}>Back to library</button>
					</div>
				{:else if loadState.kind === 'error'}
					<div class="status-card status-card--error">
						<p>Couldn't load the piece.</p>
						<p class="status-detail">{loadState.message}</p>
					</div>
				{:else if loadState.kind === 'noNotesForVoicePart'}
					<p class="empty-note">No notes for {mixLabel(loadState.part)} in this file.</p>
				{:else if loadState.kind === 'noVisibleTracks'}
					<p class="empty-note">No visible tracks selected.</p>
				{:else}
					<div class="score-card">
						<ScoreView
							bind:this={scoreView}
							bind:zoom={zoomLevel}
							{xml}
							{displayMode}
							staffVisualStates={visibleStaffStates}
							scoreTheme={$resolvedTheme}
							positionWholeNotes={msPerWholeNote > 0 ? positionMs / msPerWholeNote : 0}
							onNoteClick={(wholeNotes) => seek(wholeNotes * msPerWholeNote)}
						/>
					</div>
				{/if}
			</div>
			{#if piece}
				<div class="view-pane" class:hidden={viewMode !== 'pdf'}>
					<div class="pdf-card">
						<PdfView pdfUrl={piece.pdfUrl} bind:zoom={pdfZoomLevel} />
					</div>
				</div>
			{/if}
		</main>

		{#if loadState.kind === 'ready' || loadState.kind === 'noNotesForVoicePart' || loadState.kind === 'noVisibleTracks'}
			<footer class="bottom-bar">
				<button class="play-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
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
						aria-label="Seek"
						oninput={(e) => seek(Number((e.target as HTMLInputElement).value))}
					/>
					<div class="time-row">
						<span>{formatTime(positionMs)}</span>
						<span>{formatTime(durationMs)}</span>
					</div>
				</div>

				{#if viewMode === 'player'}
					<button class="icon-btn" onclick={() => scoreView?.scrollCursorIntoView()} aria-label="Scroll to cursor">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="3" />
							<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
						</svg>
					</button>
				{/if}
			</footer>
		{/if}

		{#if menuOpen}
			<button class="menu-backdrop" onclick={() => (menuOpen = false)} aria-label="Close settings"></button>
			<aside class="menu-drawer" aria-label="Settings">
				<header class="menu-header">
					<h2>Settings</h2>
					<button class="icon-btn" onclick={() => (menuOpen = false)} aria-label="Close settings">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</header>

				<section class="menu-section">
					<h3>View</h3>
					<div class="segmented" role="group" aria-label="View">
						{#each VIEW_MODES as mode (mode)}
							<button class:active={viewMode === mode} onclick={() => setViewMode(mode)}>
								{VIEW_MODE_LABELS[mode]}
							</button>
						{/each}
					</div>
				</section>

				<section class="menu-section">
					<h3>Display</h3>
					<div class="segmented" role="group" aria-label="Display mode">
						{#each DISPLAY_MODES as mode (mode)}
							<button class:active={displayMode === mode} onclick={() => setDisplayMode(mode)}>
								{DISPLAY_MODE_LABELS[mode]}
							</button>
						{/each}
					</div>
				</section>

				<section class="menu-section">
					<h3>Theme</h3>
					<div class="segmented" role="group" aria-label="Theme">
						{#each THEME_MODES as mode (mode)}
							<button class:active={$themeMode === mode} onclick={() => setThemeMode(mode)}>
								{THEME_LABELS[mode]}
							</button>
						{/each}
					</div>
				</section>

				<section class="menu-section">
					<h3>Tempo</h3>
					<div class="tempo-row">
						<button
							type="button"
							class="tempo-step-btn"
							disabled={tempoBpm <= MIN_TEMPO_BPM}
							aria-label="Decrease tempo"
							onclick={() => stepTempo(-1)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M5 12h14" />
							</svg>
						</button>
						<span class="tempo-value">{describeTempo(tempoBpm)}</span>
						<button
							type="button"
							class="tempo-step-btn"
							disabled={tempoBpm >= MAX_TEMPO_BPM}
							aria-label="Increase tempo"
							onclick={() => stepTempo(1)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M12 5v14M5 12h14" />
							</svg>
						</button>
					</div>
				</section>

				<section class="menu-section">
					<h3>Mix</h3>
					<div class="balances">
						{#each MIX_PARTS as part (part)}
							<div class="balance-row">
								<button
									type="button"
									class="visual-state-btn"
									class:visual-state-btn--off={visualStateFor(part) === 'off'}
									class:visual-state-btn--muted={visualStateFor(part) === 'muted'}
									class:visual-state-btn--active={visualStateFor(part) === 'active'}
									aria-label={`${mixLabel(part)} visual state: ${VISUAL_STATE_LABELS[visualStateFor(part)]}`}
									title={VISUAL_STATE_LABELS[visualStateFor(part)]}
									onclick={() => cycleVisualState(part)}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path d="M9 18h6" />
										<path d="M10 22h4" />
										<path
											d="M8.3 14.8A6.5 6.5 0 1 1 15.7 14.8c-.9.6-1.2 1.4-1.2 2.2h-5c0-.8-.3-1.6-1.2-2.2Z"
										/>
									</svg>
								</button>
								{#if part === 'accompaniment'}
									<span class="balance-label">{mixLabel(part)}</span>
								{:else}
									<button
										type="button"
										class="balance-label balance-label-button"
										class:active={voicePart === part}
										aria-label="Focus {part}"
										onclick={() => setFocus(part)}
									>
										{mixLabel(part)}
									</button>
								{/if}
								<input
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={balance[part]}
									aria-label="{part} balance"
									oninput={(e) => setBalance(part, Number((e.target as HTMLInputElement).value))}
								/>
								<span class="balance-value">{describeBalance(balance[part])}</span>
							</div>
						{/each}
					</div>
				</section>
			</aside>
		{/if}
	</div>
{/key}

<style>
	.player-shell {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		overscroll-behavior: none;
	}

	.top-bar,
	.bottom-bar {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: var(--surface);
		z-index: 1;
	}

	.top-bar {
		padding: calc(0.625rem + env(safe-area-inset-top, 0px)) 0.75rem 0.625rem;
		border-bottom: 1px solid var(--border);
	}

	.top-bar-title {
		flex: 1;
		min-width: 0;
		text-align: center;
	}

	.top-bar-title h1 {
		margin: 0;
		overflow: hidden;
		color: var(--text);
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.top-bar-title p {
		margin: 0.125rem 0 0;
		overflow: hidden;
		color: var(--text-muted);
		font-size: 0.75rem;
		line-height: 1.2;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.icon-btn {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.icon-btn:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.icon-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.icon-btn svg {
		width: 21px;
		height: 21px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.score-area {
		flex: 1 1 auto;
		overflow-x: hidden;
		overflow-y: auto;
		padding: 0;
		/* Without this, overscrolling past the top/bottom of the score
		   content chains into the page's own scroll/bounce — on mobile,
		   that rubber-bands the whole `body` past this fixed shell, briefly
		   revealing space below the anchored top/bottom bars. Containing it
		   here keeps any overscroll bounce inside this element only. */
		overscroll-behavior: contain;
	}

	.score-card {
		width: 100%;
		margin: 0;
		background: transparent;
		border-radius: 0;
		padding: 0;
	}

	.view-pane {
		height: 100%;
	}

	.view-pane.hidden {
		display: none;
	}

	.pdf-card {
		height: 100%;
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

	.status-card {
		max-width: 520px;
		margin: 2.5rem auto 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 2.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		color: var(--text-muted);
		text-align: center;
	}

	.status-card--error {
		color: var(--danger);
	}

	.status-detail {
		font-size: 0.8125rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		word-break: break-word;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 3px solid var(--surface-2);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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

	.play-btn svg {
		width: 20px;
		height: 20px;
	}

	.bottom-bar {
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
		border-top: 1px solid var(--border);
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

	.segmented {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--surface-2);
		border-radius: var(--radius-full);
	}

	.segmented button {
		flex: 1;
		border: none;
		background: transparent;
		color: var(--text-muted);
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.segmented button.active {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.empty-note {
		color: var(--text-muted);
		text-align: center;
		padding: 3rem 0;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		border: none;
		background: rgba(10, 10, 20, 0.35);
		z-index: 2;
		cursor: default;
	}

	.menu-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(360px, 100vw);
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow-y: auto;
		padding: calc(1rem + env(safe-area-inset-top, 0px)) 1.25rem
			calc(1.5rem + env(safe-area-inset-bottom, 0px));
		border-left: 1px solid var(--border);
		background: var(--surface);
		box-shadow: var(--shadow);
		z-index: 3;
		animation: slide-in 0.18s ease-out;
	}

	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}

		to {
			transform: translateX(0);
		}
	}

	.menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.menu-header h2 {
		margin: 0;
		color: var(--text);
		font-size: 1.0625rem;
		font-weight: 800;
	}

	.menu-section h3 {
		margin: 0 0 0.5rem;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.tempo-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.tempo-step-btn {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text);
		cursor: pointer;
	}

	.tempo-step-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.tempo-step-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.tempo-step-btn svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.tempo-value {
		flex-shrink: 0;
		min-width: 8rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
	}

	.balances {
		display: flex;
		flex-direction: column;
	}

	.balance-row {
		display: grid;
		grid-template-columns: 1.85rem 4.75rem minmax(5rem, 1fr) 3rem;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0;
	}

	.visual-state-btn {
		width: 1.85rem;
		height: 1.85rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid transparent;
		border-radius: var(--radius-full);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.visual-state-btn:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.visual-state-btn:disabled {
		opacity: 0.28;
		cursor: default;
	}

	.visual-state-btn svg {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.visual-state-btn--off {
		color: color-mix(in srgb, var(--text-muted) 42%, transparent);
	}

	.visual-state-btn--muted {
		border-color: color-mix(in srgb, var(--text-muted) 45%, transparent);
		color: var(--text-muted);
	}

	.visual-state-btn--active {
		border-color: color-mix(in srgb, var(--accent) 70%, transparent);
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
	}

	.balance-label {
		font-size: 0.8125rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.balance-label-button {
		border: 1px solid transparent;
		background: transparent;
		color: var(--text);
		text-align: left;
		border-radius: var(--radius-full);
		padding: 0.25rem 0.45rem;
		margin-left: -0.45rem;
		cursor: pointer;
	}

	.balance-label-button.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
		color: var(--text);
	}

	.balance-value {
		color: var(--text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	@media (max-width: 420px) {
		.bottom-bar {
			gap: 0.625rem;
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.balance-row {
			grid-template-columns: 1.75rem 4.1rem minmax(4.75rem, 1fr) 2.75rem;
			gap: 0.5rem;
		}
	}
</style>
