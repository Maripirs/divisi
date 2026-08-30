<script lang="ts">
	import { onDestroy, onMount, tick as svelteTick } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, MidiPlayer } from '$lib/audio/player';
	import { convertVisualParts } from '$lib/midi/musicXmlConverter';
	import { playerDefaults, setPlayerDefaults, VIEW_MODES, type ViewMode } from '$lib/playerDefaults';
	import {
		DISPLAY_MODES,
		MIX_MODES,
		MIX_PARTS,
		VOICE_PARTS,
		VISUAL_STATES,
		type DisplayMode,
		type MixBase,
		type MixMode,
		type MixPart,
		type ParsedMIDI,
		type VisualState,
		type VoicePart
	} from '$lib/midi/types';
	import { getPiece } from '$lib/pieces/registry';
	import { buildRemotePiece, type RemotePieceMeta } from '$lib/pieces/remotePiece';
	import { highlightedMutedInk, resolvedTheme } from '$lib/theme';
	import PdfView from '$lib/components/PdfView.svelte';
	import ScoreView from '$lib/components/ScoreView.svelte';
	import AnnotationSheet from '$lib/components/AnnotationSheet.svelte';
	import {
		AnnotationApiError,
		createAnnotation,
		deleteAnnotation,
		listAnnotations,
		listAnnotationShares,
		shareAnnotation,
		unshareAnnotation,
		updateAnnotation,
		type Annotation,
		type AnnotationShare
	} from '$lib/api/annotations';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	let { data }: { data: { id: string; remote: RemotePieceMeta | null } } = $props();
	// The keyed markup remounts this component whenever the route id changes,
	// so capturing the matching piece once per mount is intentional. Bundled
	// fixtures win a same-id collision (can't happen in practice — fixture
	// ids are short slugs, real Backend piece ids are UUIDs — but bundled
	// first matches this file's existing behavior before F5).
	// svelte-ignore state_referenced_locally
	const piece =
		getPiece(data.id) ??
		(data.remote ? buildRemotePiece(data.remote, page.url.searchParams.get('code')) : undefined);
	// F5: a piece can carry a music file, a PDF, or both — the player adapts
	// to whichever subset this piece actually has. Every bundled fixture has
	// both today, so this is a no-op for them (both stay true, exactly like
	// before F5 existed).
	const hasPlayer = !!piece?.load;
	const hasPdfPane = !!piece?.pdfUrl;
	const availableViewModes = VIEW_MODES.filter((mode) => (mode === 'player' ? hasPlayer : hasPdfPane));

	// Reached via a join-code link (`routes/join/[code]`) rather than a
	// logged-in dashboard — same player, same "Make this my default" (per
	// `playerDefaults.ts`, that's `localStorage`-only for everyone already,
	// nothing Backend-bound to restrict for a guest). Only set for a guest
	// who came from a specific group's join link (as opposed to the
	// guest-accessible demo library), so "back" can return there instead of
	// the generic library.
	const guestJoinCode = page.url.searchParams.get('code');

	// The admin's chosen tempo for this piece (`PUT
	// /library/pieces/{id}/default-tempo`, set from a group's Tracks tab),
	// bridged in via the URL rather than looked up directly — this route is
	// `ssr:false` and keyed off `$lib/pieces/registry`'s fixture id, not the
	// Backend's real piece id, so whatever generated this link (Tracks tab,
	// personal Library, guest join page) is the one place that actually has
	// both ids to correlate. `null` when the admin never set one, or the
	// piece has no real Backend counterpart yet (fixture-only demo tracks).
	const adminDefaultTempoParam = page.url.searchParams.get('defaultTempo');
	const adminDefaultTempo: number | null = (() => {
		const parsed = adminDefaultTempoParam ? Number(adminDefaultTempoParam) : NaN;
		return Number.isFinite(parsed) && parsed >= MIN_TEMPO_BPM && parsed <= MAX_TEMPO_BPM ? parsed : null;
	})();

	// Singer-facing labels per UX_WIREFRAME.md's "Practice View Labels" —
	// these are the same DisplayMode values (flat/highlighted/solo/custom)
	// the converter/mixer logic already uses, just relabeled in the UI.
	const DISPLAY_MODE_LABELS: Record<DisplayMode, () => string> = {
		flat: m.display_mode_everyone,
		highlighted: m.display_mode_highlighted,
		solo: m.display_mode_solo,
		custom: m.mode_custom
	};

	// Names for the audio-balance presets — the "Minus Me" one is the
	// standard rehearsal/karaoke term for a track missing just one part.
	const MIX_MODE_LABELS: Record<MixMode, () => string> = {
		everyone: m.mix_mode_everyone,
		minusMe: m.mix_mode_minus_me,
		mostlyMe: m.mix_mode_mostly_me,
		custom: m.mode_custom
	};

	// Same labels/pattern as the Settings page's "Default voice" dropdown.
	const VOICE_PART_LABELS: Record<VoicePart, () => string> = {
		soprano: m.voice_soprano,
		alto: m.voice_alto,
		tenor: m.voice_tenor,
		bass: m.voice_bass
	};

	const VISUAL_STATE_LABELS: Record<VisualState, () => string> = {
		off: m.piece_visual_off,
		muted: m.piece_visual_muted,
		active: m.piece_visual_active
	};

	const VIEW_MODE_LABELS: Record<ViewMode, () => string> = {
		player: m.piece_view_player,
		pdf: m.settings_view_pdf
	};

	type LoadState =
		| { kind: 'loading' }
		| { kind: 'notFound' }
		| { kind: 'error'; message: string }
		| { kind: 'ready' }
		| { kind: 'noVisibleTracks' }
		| { kind: 'noNotesForVoicePart'; part: MixPart }
		// F5: a piece with no music file (PDF-only) never parses anything —
		// nothing in the allow-lists below ever matches this, so the menu
		// button/bottom playback bar stay correctly hidden, same as they'd be
		// mid-load, with no special-casing needed at each check site.
		| { kind: 'pdfOnly' };

	let loadState = $state<LoadState>(!piece ? { kind: 'notFound' } : hasPlayer ? { kind: 'loading' } : { kind: 'pdfOnly' });
	let parsed: ParsedMIDI | undefined;
	let player: MidiPlayer | undefined;

	// Seeded from the account-wide "Practice defaults" (Settings page, and
	// each section's own "Make this my default" below), not hardcoded — a
	// piece opened for the first time starts here; one opened before
	// overrides it in `bootstrap()` with its own saved settings.
	const initialDefaults = get(playerDefaults);
	let voicePart = $state<VoicePart>(initialDefaults.voicePart);
	// Which desk of `voicePart` is "mine" when this piece splits it (e.g.
	// "Soprano 2") — `null` means "all of them" (the usual, unsplit case).
	// File-specific by nature (a desk id only means anything for the piece
	// that split it), so unlike `voicePart` this has no account-wide default
	// and isn't seeded from `playerDefaults` — every piece starts at `null`
	// until `bootstrap()` restores its own saved pick, if any.
	let subPart = $state<MixPart | null>(null);
	let displayMode = $state<DisplayMode>(initialDefaults.displayMode);
	let mixMode = $state<MixMode>(initialDefaults.mixMode);
	let visualStates = $state<Record<MixPart, VisualState>>(initialDefaults.mix.visualStates);
	let xml = $state('');
	let msPerWholeNote = $state(0);
	let positionMs = $state(0);
	let durationMs = $state(0);
	let isPlaying = $state(false);
	let menuOpen = $state(false);
	// F5: forced to whichever single pane exists when a piece doesn't have
	// both — a stale/default 'pdf'/'player' pick from before this piece was
	// opened must never select a pane this piece doesn't have.
	let viewMode = $state<ViewMode>(
		!hasPlayer ? 'pdf' : !hasPdfPane ? 'player' : initialDefaults.viewMode
	);
	let zoomLevel = $state(1);
	let pdfZoomLevel = $state(1);
	let tempoBpm = $state(120);
	let baseTempoBpm = $state(120);
	let balance = $state<Record<MixPart, number>>(initialDefaults.mix.balance);

	let scoreView: ScoreView | undefined = $state();

	// F4: annotations only ever exist for a real Backend piece (Backend's
	// `Annotation.piece_id` has to be a real `Piece`), and only for a
	// logged-in user (the Backend's endpoints all require `get_current_user`
	// — there's no guest annotation path at all, unlike homework/tracks).
	const canAnnotate = $derived(!!data.remote && !!page.data.user);
	let annotations = $state<Annotation[]>([]);
	let annotateMode = $state(false);
	// `null` closed; otherwise either a brand-new marker's position (create)
	// or an existing annotation being viewed/edited.
	let annotationSheet = $state<{ mode: 'create'; positionWholeNotes: number } | { mode: 'view'; annotation: Annotation } | null>(
		null
	);
	let annotationSaving = $state(false);
	let annotationError = $state<string | null>(null);
	let annotationShares = $state<AnnotationShare[]>([]);
	let annotationSharesLoading = $state(false);

	let seekPct = $derived(durationMs > 0 ? (positionMs / durationMs) * 100 : 0);
	// `parsed` isn't `$state` (it's set once, imperatively, in `bootstrap()`
	// before anything reads it), so this derived's only *tracked* dependency
	// is `visualStates` — which is exactly what needs to invalidate it, since
	// `parsed.parts` never changes again after that initial assignment.
	let visibleMixParts = $derived((parsed?.parts ?? []).filter((part) => visualStates[part.id] !== 'off').map((part) => part.id));
	let visibleStaffStates = $derived(visibleMixParts.map((part) => visualStates[part]));
	// Every desk `voicePart` splits into, in this piece — length <= 1 means
	// it isn't split here, which is when the desk picker stays hidden.
	let desksForFocus = $derived((parsed?.parts ?? []).filter((part) => part.base === voicePart));

	// Each "Make this my default" link only makes sense to show when there's
	// actually a change to promote — otherwise it's just always-on clutter.
	let viewMatchesDefault = $derived(viewMode === $playerDefaults.viewMode);
	let displayMatchesDefault = $derived(
		displayMode === $playerDefaults.displayMode && voicePart === $playerDefaults.voicePart
	);
	let mixMatchesDefault = $derived(
		parsed !== undefined &&
			sameBalances(balance, expandBaseRecord(parsed.parts, $playerDefaults.mix.balance)) &&
			sameVisualStates(visualStates, expandBaseRecord(parsed.parts, $playerDefaults.mix.visualStates))
	);
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

	// Expands a record keyed by the 5 base buckets into one with exactly the
	// ids this piece's `parsed.parts` uses — every desk of a base starts out
	// inheriting that base's value.
	function expandBaseRecord<T>(parts: ParsedMIDI['parts'], baseDefaults: Record<MixBase, T>): Record<MixPart, T> {
		return Object.fromEntries(parts.map((part) => [part.id, baseDefaults[part.base]])) as Record<MixPart, T>;
	}

	// Same idea, but `current` (a piece's own, possibly-persisted ids) is
	// checked first so a persisted per-piece choice always wins; only a
	// divisi desk with no id-specific entry yet — a brand-new split, or a
	// stale value left over from before this file happened to split —
	// inherits its base voice's value instead of coming up empty.
	function materializePartRecord<T>(
		parts: ParsedMIDI['parts'],
		current: Record<MixPart, T>,
		baseDefaults: Record<MixBase, T>
	): Record<MixPart, T> {
		const expanded = expandBaseRecord(parts, baseDefaults);
		return Object.fromEntries(parts.map((part) => [part.id, current[part.id] ?? expanded[part.id]])) as Record<
			MixPart,
			T
		>;
	}

	async function bootstrap() {
		if (!piece) return;
		if (canAnnotate) void loadAnnotations();
		const stored = loadPersistedSettings(piece.id);
		if (stored.voicePart) voicePart = stored.voicePart;
		if (stored.subPart !== undefined) subPart = stored.subPart;
		if (stored.displayMode) displayMode = stored.displayMode;
		if (stored.visualStates) visualStates = stored.visualStates;
		if (stored.mixMode) mixMode = stored.mixMode;
		if (stored.balance) balance = stored.balance;
		// F5: only ever restore a stored viewMode this piece can actually
		// show — a persisted 'pdf' pick must never win for a piece that
		// (now) has no PDF, and vice versa.
		if (stored.viewMode && availableViewModes.includes(stored.viewMode)) viewMode = stored.viewMode;
		if (stored.zoomLevel !== undefined) zoomLevel = Math.min(2, Math.max(0.5, stored.zoomLevel));
		if (stored.pdfZoomLevel !== undefined) pdfZoomLevel = Math.min(2, Math.max(0.5, stored.pdfZoomLevel));
		// F5: PDF-only piece — no music file to parse or play, so there's
		// nothing left for the MIDI/audio pipeline below to do. Captured to a
		// local rather than narrowing `piece.load` itself, which TS won't
		// carry across the `await` below.
		const load = piece.load;
		if (!load) return;
		try {
			const [fetchedPlayer, loadedPiece] = await Promise.all([MidiPlayer.create(), load()]);
			if (destroyed) {
				fetchedPlayer.destroy();
				return;
			}
			player = fetchedPlayer;
			parsed = loadedPiece;
			// A stored desk pick only means something if this piece still
			// splits `voicePart` into that exact desk — stale otherwise (the
			// file changed, or `voicePart` itself was restored to something
			// that desk doesn't belong to).
			if (subPart && !parsed.parts.some((p) => p.id === subPart)) subPart = null;
			// First time this piece has ever been opened (no stored desk pick
			// either way) — seed from the account-wide "Split part" default
			// (Settings), same seed-once-then-persisted-per-piece treatment as
			// `voicePart`/`displayMode`/etc. above. A no-op unless this piece
			// actually splits `voicePart` into a desk numbered to match.
			if (subPart === null && stored.subPart === undefined && initialDefaults.voiceDesk !== null) {
				const preferred = parsed.parts.find(
					(p) => p.base === voicePart && p.subIndex === initialDefaults.voiceDesk
				);
				if (preferred) subPart = preferred.id;
			}
			balance = materializePartRecord(parsed.parts, balance, initialDefaults.mix.balance);
			visualStates = materializePartRecord(parsed.parts, visualStates, initialDefaults.mix.visualStates);
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
			} else if (adminDefaultTempo !== null) {
				// First time this piece has ever been opened here (no stored
				// tempo yet) — start at the admin's chosen default instead of
				// the MIDI file's own native tempo.
				setTempo(adminDefaultTempo, false);
			} else {
				tempoBpm = player.tempoBPM;
			}
			for (const part of parsed.parts) player.setPartVolume(part.id, balance[part.id]);
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
		const nextBalance = { ...balance, [part]: value };
		balance = nextBalance;
		mixMode = matchingMixMode(nextBalance, voicePart);
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
		subPart: MixPart | null;
		displayMode: DisplayMode;
		visualStates: Record<MixPart, VisualState>;
		mixMode: MixMode;
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
			subPart,
			displayMode,
			visualStates,
			mixMode,
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

	function setFocus(part: VoicePart) {
		voicePart = part;
		// A desk pick only makes sense for the voice it was made under.
		subPart = null;
		if (displayMode === 'highlighted' || displayMode === 'solo') {
			visualStates = presetVisualStates(displayMode, part);
		}
		if (mixMode !== 'custom') applyMixPreset(mixMode, part);
		persistSettings();
	}

	/** "Do you sing a specific desk?" — only meaningful once `voicePart` is
	 * split in this piece (see `desksForFocus`). `null` reverts to treating
	 * every desk of `voicePart` as "mine", same as before this existed. */
	function setSubPart(id: MixPart | null) {
		subPart = id;
		if (displayMode === 'highlighted' || displayMode === 'solo') {
			visualStates = presetVisualStates(displayMode, voicePart);
		}
		if (mixMode !== 'custom') applyMixPreset(mixMode, voicePart);
		persistSettings();
	}

	function setDisplayMode(mode: DisplayMode) {
		displayMode = mode;
		if (mode !== 'custom') visualStates = presetVisualStates(mode, voicePart);
		persistSettings();
	}

	function setMixMode(mode: MixMode) {
		mixMode = mode;
		if (mode !== 'custom') applyMixPreset(mode, voicePart);
		persistSettings();
	}

	/** Pushes a mix preset's volumes into both `balance` (so the UI reflects
	 * it) and the live player (so it's heard immediately, no restart). */
	function applyMixPreset(mode: Exclude<MixMode, 'custom'>, focusPart: VoicePart) {
		balance = presetBalances(mode, focusPart);
		for (const part of parsed?.parts ?? []) player?.setPartVolume(part.id, balance[part.id]);
	}

	// "Make this my default" (UX_WIREFRAME.md's Track Settings vs App
	// Settings section): promotes the current per-piece View/Display/Mix
	// choice to the account-wide starting point new pieces seed from. Each
	// menu section promotes only its own slice, spread on top of whatever
	// defaults already exist for the others. `defaultFlash` is a brief
	// per-section confirmation, not persisted state.
	let defaultFlash = $state({ view: false, display: false, mix: false });

	function flashDefault(key: keyof typeof defaultFlash) {
		defaultFlash = { ...defaultFlash, [key]: true };
		setTimeout(() => {
			defaultFlash = { ...defaultFlash, [key]: false };
		}, 1500);
	}

	function saveViewAsDefault() {
		setPlayerDefaults({ ...get(playerDefaults), viewMode });
		flashDefault('view');
	}

	function saveDisplayAsDefault() {
		if (displayMode === 'custom') return;
		setPlayerDefaults({ ...get(playerDefaults), voicePart, displayMode });
		flashDefault('display');
	}

	function saveMixAsDefault() {
		if (!parsed) return;
		setPlayerDefaults({
			...get(playerDefaults),
			mix: {
				balance: collapseToBaseRecord(parsed.parts, balance),
				visualStates: collapseToBaseRecord(parsed.parts, visualStates)
			},
			...(mixMode !== 'custom' ? { mixMode } : {})
		});
		flashDefault('mix');
	}

	// Presets below all key off `isFocusPart`, not a bare `part.base`
	// comparison — "my part"/"highlighted" is a file-independent choice (see
	// `VoicePart` vs `MixPart` in `midi/types.ts`), so every desk of a split
	// voice moves together under a preset *unless* `subPart` narrows it down
	// to one specific desk. Individual desks only diverge on their own once
	// the user switches to Custom mode and adjusts one directly.
	function isFocusPart(part: { id: MixPart; base: MixBase }, focusPart: VoicePart): boolean {
		if (part.base !== focusPart) return false;
		return subPart === null || part.id === subPart;
	}

	function presetVisualStates(mode: DisplayMode, focusPart: VoicePart): Record<MixPart, VisualState> {
		return Object.fromEntries(
			(parsed?.parts ?? []).map((part) => {
				let state: VisualState;
				if (mode === 'flat' || mode === 'custom') state = 'active';
				else if (mode === 'highlighted') state = isFocusPart(part, focusPart) ? 'active' : 'muted';
				else state = isFocusPart(part, focusPart) ? 'active' : 'off';
				return [part.id, state];
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
		return (parsed?.parts ?? []).every((part) => a[part.id] === b[part.id]);
	}

	// 0.5 is this app's "normal" per-part volume (see `describeBalance`,
	// which labels it "Even") — so "Everyone" leaves every bucket there,
	// "Minus Me" just cuts the non-focus buckets to silence rather than
	// boosting anything above normal. "Mostly Me" is the first preset that
	// actually deviates from that: focus part boosted to full (1),
	// everyone else turned down low but still audible (0.15) -- singing
	// along with a quiet backing track, per the human's own description
	// of it. ("My Part" — focus-only, everyone else silenced — used to be
	// a preset here too; removed per the human's call, true solo is still
	// reachable via the Custom sliders if someone wants it.)
	function presetBalances(mode: Exclude<MixMode, 'custom'>, focusPart: VoicePart): Record<MixPart, number> {
		return Object.fromEntries(
			(parsed?.parts ?? []).map((part) => {
				let value: number;
				if (mode === 'everyone') value = 0.5;
				else if (mode === 'minusMe') value = isFocusPart(part, focusPart) ? 0 : 0.5;
				else value = isFocusPart(part, focusPart) ? 1 : 0.15; // mostlyMe
				return [part.id, value];
			})
		) as Record<MixPart, number>;
	}

	function matchingMixMode(balances: Record<MixPart, number>, focusPart: VoicePart): MixMode {
		const presetModes: Exclude<MixMode, 'custom'>[] = ['everyone', 'minusMe', 'mostlyMe'];
		return presetModes.find((mode) => sameBalances(balances, presetBalances(mode, focusPart))) ?? 'custom';
	}

	function sameBalances(a: Record<MixPart, number>, b: Record<MixPart, number>): boolean {
		return (parsed?.parts ?? []).every((part) => a[part.id] === b[part.id]);
	}

	// Collapses a per-piece, possibly-split record down to the 5 base
	// buckets `playerDefaults.ts` stores — "Make this my default" promotes
	// the *voice's* balance, not a specific file's desk numbering. Presets
	// keep every desk of a base in lockstep (see above), so this is lossless
	// for anything but a Custom mix with desks pulled apart on purpose, where
	// it keeps the first desk's value as the base's representative.
	function collapseToBaseRecord<T>(parts: ParsedMIDI['parts'], record: Record<MixPart, T>): Record<MixBase, T> {
		return Object.fromEntries(
			MIX_PARTS.map((base) => [base, record[parts.find((p) => p.base === base)!.id]])
		) as Record<MixBase, T>;
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
		if (Math.abs(diff) < 4) return m.piece_balance_even();
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

	// F5: converts whatever YouTube URL shape an admin pasted in the upload
	// form (`watch?v=`, `youtu.be/`, already an `/embed/` link) into an
	// embeddable URL — falls back to the input unchanged if no video id is
	// recognizable, so a malformed link just fails to embed rather than
	// throwing.
	function toYoutubeEmbedUrl(url: string): string {
		try {
			const parsed = new URL(url);
			if (parsed.pathname.startsWith('/embed/')) return url;
			const id = parsed.hostname.includes('youtu.be')
				? parsed.pathname.slice(1)
				: (parsed.searchParams.get('v') ?? '');
			return id ? `https://www.youtube.com/embed/${id}` : url;
		} catch {
			return url;
		}
	}

	function mixLabel(part: MixPart): string {
		if (part === 'accompaniment') return m.piece_accomp_short();
		return parsed?.parts.find((p) => p.id === part)?.label ?? part;
	}

	function visualStateFor(part: MixPart): VisualState {
		return visualStates[part];
	}

	function hasNotesForPart(piece: ParsedMIDI, part: MixPart): boolean {
		if (part === 'accompaniment') return piece.backingNotes.length > 0;
		return piece.notes.some((note) => note.partId === part);
	}

	// Root `+page.server.ts` redirects a logged-out, non-guest hit on `/` to
	// `/welcome` — a bare `goto('/')` would bounce a guest who opened the
	// player straight there instead of back to where they came from. A guest
	// who arrived via a specific group's join code (`guestJoinCode` set) goes
	// back to that group's page, not the unrelated demo library.
	function backToLibrary() {
		if (guestJoinCode) goto(lh(`/join/${encodeURIComponent(guestJoinCode)}`));
		else goto(lh(page.data.user ? '/' : '/?guest=1'));
	}

	// F4: annotations — private-by-default notes pinned to a score position
	// (e.g. "breathe here"), rendered as markers by `ScoreView` and managed
	// through this sheet. See `$lib/api/annotations.ts` for the Backend
	// shape (B5) this all round-trips through.

	async function loadAnnotations() {
		if (!data.remote) return;
		try {
			annotations = await listAnnotations(data.remote.pieceId);
		} catch {
			// A failed load just means no markers show yet — not worth a
			// blocking error state layered on top of the player's own; the
			// "add annotation" control still works and will surface its own
			// error if the Backend is genuinely unreachable.
		}
	}

	function annotationErrorMessage(err: unknown): string {
		return err instanceof AnnotationApiError ? err.message : m.errors_could_not_reach_server();
	}

	/** "Measure N" rather than a raw beat/whole-note count — matches how a
	 * singer actually talks about a spot in the music (and the fixture-era
	 * `AnnotationModal`'s own framing). Tempo-independent: `positionWholeNotes`
	 * (and thus the stored position) never changes when tempo is adjusted. */
	function measureLabel(wholeNotes: number): string {
		if (!parsed) return m.piece_annotation_position_generic();
		const { numerator, denominator } = parsed.timeSignature;
		const measureLenWholeNotes = numerator / denominator;
		const measureNumber = measureLenWholeNotes > 0 ? Math.floor(wholeNotes / measureLenWholeNotes) + 1 : 1;
		return m.piece_annotation_measure({ number: measureNumber });
	}

	function toggleAnnotateMode() {
		annotateMode = !annotateMode;
	}

	function openCreateAnnotation(wholeNotes: number) {
		annotationError = null;
		annotationSheet = { mode: 'create', positionWholeNotes: wholeNotes };
		// One tap places one marker — mode stays off afterward rather than
		// lingering, so closing the sheet doesn't leave the score armed to
		// place a second one from a stray tap.
		annotateMode = false;
	}

	function openAnnotation(id: string) {
		const found = annotations.find((a) => a.id === id);
		if (!found) return;
		annotationError = null;
		annotationShares = [];
		annotationSheet = { mode: 'view', annotation: found };
		if (page.data.user && found.userId === page.data.user.id) void loadShares(found.id);
	}

	async function loadShares(annotationId: string) {
		if (!data.remote) return;
		annotationSharesLoading = true;
		try {
			annotationShares = await listAnnotationShares(data.remote.pieceId, annotationId);
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSharesLoading = false;
		}
	}

	function closeAnnotationSheet() {
		annotationSheet = null;
		annotationError = null;
		annotationShares = [];
	}

	async function saveAnnotation(content: string) {
		const sheet = annotationSheet;
		if (!data.remote || sheet === null) return;
		annotationSaving = true;
		annotationError = null;
		try {
			if (sheet.mode === 'create') {
				const created = await createAnnotation(data.remote.pieceId, sheet.positionWholeNotes, content);
				annotations = [...annotations, created];
			} else {
				const updated = await updateAnnotation(data.remote.pieceId, sheet.annotation.id, { content });
				annotations = annotations.map((a) => (a.id === updated.id ? updated : a));
			}
			closeAnnotationSheet();
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSaving = false;
		}
	}

	async function deleteCurrentAnnotation() {
		// Snapshotted into a local rather than narrowed via repeated
		// `annotationSheet.mode` reads — `annotationSheet` is reactive
		// (`$state`), so a plain `const` capture is what TypeScript can
		// actually narrow reliably across the statements below.
		const sheet = annotationSheet;
		if (!data.remote || sheet === null || sheet.mode !== 'view') return;
		const id = sheet.annotation.id;
		annotationSaving = true;
		annotationError = null;
		try {
			await deleteAnnotation(data.remote.pieceId, id);
			annotations = annotations.filter((a) => a.id !== id);
			closeAnnotationSheet();
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSaving = false;
		}
	}

	async function shareCurrentAnnotation(email: string) {
		const sheet = annotationSheet;
		if (!data.remote || sheet === null || sheet.mode !== 'view') return;
		annotationError = null;
		try {
			const share = await shareAnnotation(data.remote.pieceId, sheet.annotation.id, email);
			annotationShares = [...annotationShares, share];
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		}
	}

	async function unshareCurrentAnnotation(userId: string) {
		const sheet = annotationSheet;
		if (!data.remote || sheet === null || sheet.mode !== 'view') return;
		annotationError = null;
		try {
			await unshareAnnotation(data.remote.pieceId, sheet.annotation.id, userId);
			annotationShares = annotationShares.filter((s) => s.sharedWithUserId !== userId);
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		}
	}

	// Local, non-`?.`-narrowed derivations for `AnnotationSheet`'s props —
	// same reasoning as the snapshot-to-`const` pattern above, applied to
	// `$derived` instead: reading `annotationSheet` once into `sheet` per
	// derivation is what lets TypeScript actually narrow it.
	let annotationPositionLabel = $derived.by(() => {
		const sheet = annotationSheet;
		if (sheet === null) return '';
		return measureLabel(sheet.mode === 'create' ? sheet.positionWholeNotes : sheet.annotation.positionWholeNotes);
	});
	let annotationContent = $derived.by(() => {
		const sheet = annotationSheet;
		return sheet !== null && sheet.mode === 'view' ? sheet.annotation.content : '';
	});
	let annotationIsOwner = $derived.by(() => {
		const sheet = annotationSheet;
		if (sheet === null || sheet.mode === 'create') return true;
		return page.data.user?.id === sheet.annotation.userId;
	});
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#key data.id}
	<div class="player-shell">
		<header class="top-bar">
			<button class="icon-btn" onclick={backToLibrary} aria-label={m.piece_back_to_library()}>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>

			<div class="top-bar-title">
				<h1>{piece?.title ?? 'Divisi'}</h1>
				{#if piece?.composer}
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
				aria-label={m.piece_open_practice_setup()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 7h16M4 12h16M4 17h16" />
				</svg>
			</button>
		</header>

		{#if piece?.youtubeUrl}
			<!-- F5: reference-audio link, shown regardless of which of
			     music-file/PDF this piece has — not gated behind the
			     player/PDF toggle above, per the human's explicit call. -->
			<details class="youtube-disclosure">
				<summary>{m.piece_reference_recording()}</summary>
				<div class="youtube-embed">
					<iframe
						src={toYoutubeEmbedUrl(piece.youtubeUrl)}
						title={m.piece_reference_recording()}
						frameborder="0"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
						allowfullscreen
					></iframe>
				</div>
			</details>
		{/if}

		<main class="score-area">
			<!-- Both panes stay mounted once shown, toggling only via `hidden` —
			     switching view modes used to swap them with an {#if}, which tore
			     down and rebuilt OSMD's whole SVG tree (or re-fetched the PDF)
			     on every toggle, stalling the main thread long enough to glitch
			     the synth's audio callback (js-synthesizer runs on a
			     ScriptProcessorNode, not an AudioWorklet, so it's not immune to
			     main-thread jank). -->
			{#if hasPlayer || !piece}
			<div class="view-pane" class:hidden={viewMode !== 'player'}>
				{#if loadState.kind === 'loading'}
					<div class="status-card">
						<div class="spinner" aria-hidden="true"></div>
						<p>{m.piece_loading_score()}</p>
					</div>
				{:else if loadState.kind === 'notFound'}
					<div class="status-card status-card--error">
						<p>{m.piece_not_found()}</p>
						<button class="text-link" onclick={backToLibrary}>{m.piece_back_to_library()}</button>
					</div>
				{:else if loadState.kind === 'error'}
					<div class="status-card status-card--error">
						<p>{m.piece_load_error()}</p>
						<p class="status-detail">{loadState.message}</p>
					</div>
				{:else if loadState.kind === 'noNotesForVoicePart'}
					<p class="empty-note">{m.piece_no_notes_for_part({ part: mixLabel(loadState.part) })}</p>
				{:else if loadState.kind === 'noVisibleTracks'}
					<p class="empty-note">{m.piece_no_visible_tracks()}</p>
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
							{annotations}
							{annotateMode}
							onAnnotationPlace={openCreateAnnotation}
							onAnnotationMarkerClick={openAnnotation}
						/>
					</div>
				{/if}
			</div>
			{/if}
			{#if piece?.pdfUrl}
				<div class="view-pane" class:hidden={viewMode !== 'pdf'}>
					<div class="pdf-card">
						<PdfView
						pdfUrl={piece.pdfUrl}
						bind:zoom={pdfZoomLevel}
						active={viewMode === 'pdf'}
						pieceId={data.remote?.pieceId}
						canMarkup={canAnnotate}
					/>
					</div>
				</div>
			{/if}
		</main>

		{#if loadState.kind === 'ready' || loadState.kind === 'noNotesForVoicePart' || loadState.kind === 'noVisibleTracks'}
			<footer class="bottom-bar">
				<button class="play-btn" onclick={togglePlay} aria-label={isPlaying ? m.piece_pause() : m.piece_play()}>
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

				{#if viewMode === 'player'}
					<button class="icon-btn" onclick={() => scoreView?.scrollCursorIntoView()} aria-label={m.piece_scroll_to_cursor()}>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="3" />
							<path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
						</svg>
					</button>
					{#if canAnnotate}
						<!-- F4: toggles "tap a note to place a marker there" (see
						     ScoreView's `annotateMode`) — e.g. marking a breath.
						     Only offered for a real Backend piece, logged in
						     (`canAnnotate`); a bundled demo/guest session never
						     reaches the Backend's annotation endpoints at all. -->
						<button
							class="icon-btn"
							class:icon-btn--active={annotateMode}
							onclick={toggleAnnotateMode}
							aria-label={annotateMode ? m.piece_cancel_add_annotation() : m.piece_add_annotation()}
							aria-pressed={annotateMode}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M12 5v14M5 12h14" />
							</svg>
						</button>
					{/if}
				{/if}
			</footer>
		{/if}

		{#if menuOpen}
			<!-- Named "Practice Setup", not "Settings" — this drawer only
			     applies to the current piece, per UX_WIREFRAME.md's
			     Redundancy Rules ("Do not call the player drawer Settings").
			     The account-wide screen keeps the "Settings" name. -->
			<button class="menu-backdrop" onclick={() => (menuOpen = false)} aria-label={m.piece_close_practice_setup()}></button>
			<aside class="menu-drawer" aria-label={m.piece_practice_setup()}>
				<header class="menu-header">
					<h2>{m.piece_practice_setup()}</h2>
					<button class="icon-btn" onclick={() => (menuOpen = false)} aria-label={m.piece_close_practice_setup()}>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</header>

				<section class="menu-section">
					<h3>{m.piece_tempo()}</h3>
					<div class="tempo-row">
						<button
							type="button"
							class="tempo-step-btn"
							disabled={tempoBpm <= MIN_TEMPO_BPM}
							aria-label={m.piece_decrease_tempo()}
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
							aria-label={m.piece_increase_tempo()}
							onclick={() => stepTempo(1)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<path d="M12 5v14M5 12h14" />
							</svg>
						</button>
					</div>
					{#if adminDefaultTempo !== null && tempoBpm !== adminDefaultTempo}
						<button type="button" class="text-link default-link" onclick={() => setTempo(adminDefaultTempo)}>
							{m.piece_reset_to_default({ bpm: adminDefaultTempo })}
						</button>
					{/if}
				</section>

				<section class="menu-section">
					<h3>{m.piece_your_part()}</h3>
					<select
						class="your-part-select"
						aria-label={m.piece_your_part()}
						value={voicePart}
						onchange={(e) => setFocus((e.target as HTMLSelectElement).value as VoicePart)}
					>
						{#each VOICE_PARTS as part (part)}
							<option value={part}>{VOICE_PART_LABELS[part]()}</option>
						{/each}
					</select>
					{#if desksForFocus.length > 1}
						<p class="subsection-hint">{m.piece_specific_desk()}</p>
						<div class="segmented" role="group" aria-label={m.piece_desk()}>
							<button class:active={subPart === null} onclick={() => setSubPart(null)}>{m.piece_all()}</button>
							{#each desksForFocus as desk (desk.id)}
								<button class:active={subPart === desk.id} onclick={() => setSubPart(desk.id)}>
									{desk.label}
								</button>
							{/each}
						</div>
					{/if}
				</section>

				{#if availableViewModes.length > 1}
					<!-- F5: only rendered when this piece actually has both a
					     music file and a PDF to toggle between — a piece with
					     just one of the two has nothing to toggle, so it skips
					     straight to that view with no menu section at all. -->
					<section class="menu-section">
						<h3>{m.settings_view()}</h3>
						<div class="segmented" role="group" aria-label={m.settings_view()}>
							{#each availableViewModes as mode (mode)}
								<button class:active={viewMode === mode} onclick={() => setViewMode(mode)}>
									{VIEW_MODE_LABELS[mode]()}
								</button>
							{/each}
						</div>
						{#if !viewMatchesDefault}
							<button type="button" class="text-link default-link" onclick={saveViewAsDefault}>
								{defaultFlash.view ? m.piece_saved_as_default() : m.piece_make_my_default()}
							</button>
						{/if}
					</section>
				{/if}

				{#if viewMode === 'player'}
					<section class="menu-section">
						<h3>{m.settings_display()}</h3>
						<div class="segmented" role="group" aria-label={m.piece_display_mode()}>
							{#each DISPLAY_MODES as mode (mode)}
								<button class:active={displayMode === mode} onclick={() => setDisplayMode(mode)}>
									{DISPLAY_MODE_LABELS[mode]()}
								</button>
							{/each}
						</div>
						{#if displayMode !== 'custom' && !displayMatchesDefault}
							<button type="button" class="text-link default-link" onclick={saveDisplayAsDefault}>
								{defaultFlash.display ? m.piece_saved_as_default() : m.piece_make_my_default()}
							</button>
						{/if}
					</section>
				{/if}

				<!-- Theme is app-wide, not per-piece — lives in Settings, not
				     here (see UX_WIREFRAME.md's Track Settings vs App
				     Settings). -->

				<section class="menu-section">
					<h3>{m.piece_mix()}</h3>
					<div class="segmented" role="group" aria-label={m.piece_mix_mode()}>
						{#each MIX_MODES as mode (mode)}
							<button class:active={mixMode === mode} onclick={() => setMixMode(mode)}>
								{MIX_MODE_LABELS[mode]()}
							</button>
						{/each}
					</div>
					{#if displayMode === 'custom' || mixMode === 'custom'}
					<div class="balances">
						{#each parsed?.parts ?? [] as part (part.id)}
							<div class="balance-row">
								{#if displayMode === 'custom'}
									<button
										type="button"
										class="visual-state-btn"
										class:visual-state-btn--off={visualStateFor(part.id) === 'off'}
										class:visual-state-btn--muted={visualStateFor(part.id) === 'muted'}
										class:visual-state-btn--active={visualStateFor(part.id) === 'active'}
										aria-label={m.piece_visual_state_label({ part: part.label, state: VISUAL_STATE_LABELS[visualStateFor(part.id)]() })}
										title={VISUAL_STATE_LABELS[visualStateFor(part.id)]()}
										onclick={() => cycleVisualState(part.id)}
									>
										<svg viewBox="0 0 24 24" aria-hidden="true">
											<path d="M9 18h6" />
											<path d="M10 22h4" />
											<path
												d="M8.3 14.8A6.5 6.5 0 1 1 15.7 14.8c-.9.6-1.2 1.4-1.2 2.2h-5c0-.8-.3-1.6-1.2-2.2Z"
											/>
										</svg>
									</button>
								{/if}
								<span class="balance-label" class:active={voicePart === part.base}>{part.label}</span>
								{#if mixMode === 'custom'}
									<input
										type="range"
										min="0"
										max="1"
										step="0.01"
										value={balance[part.id]}
										aria-label={m.piece_balance_label({ part: part.label })}
										oninput={(e) => setBalance(part.id, Number((e.target as HTMLInputElement).value))}
									/>
									<span class="balance-value">{describeBalance(balance[part.id])}</span>
								{/if}
							</div>
						{/each}
					</div>
					{/if}
					{#if !mixMatchesDefault}
						<button type="button" class="text-link default-link" onclick={saveMixAsDefault}>
							{defaultFlash.mix ? m.piece_saved_as_default() : m.piece_make_my_default()}
						</button>
					{/if}
				</section>
			</aside>
		{/if}

		<AnnotationSheet
			open={annotationSheet !== null}
			mode={annotationSheet?.mode ?? 'create'}
			positionLabel={annotationPositionLabel}
			content={annotationContent}
			isOwner={annotationIsOwner}
			shares={annotationShares}
			sharesLoading={annotationSharesLoading}
			saving={annotationSaving}
			error={annotationError}
			onClose={closeAnnotationSheet}
			onSave={saveAnnotation}
			onDelete={deleteCurrentAnnotation}
			onShare={shareCurrentAnnotation}
			onUnshare={unshareCurrentAnnotation}
		/>
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

	/* F4: the "add annotation" toggle while armed — same active-state
	   language (filled accent) as `.segmented button.active` elsewhere in
	   this drawer, so it reads consistently as "this is the current mode". */
	.icon-btn--active {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.icon-btn--active:hover:not(:disabled) {
		background: var(--accent-hover);
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

	.youtube-disclosure {
		flex: 0 0 auto;
		padding: 0 1rem;
	}

	.youtube-disclosure summary {
		cursor: pointer;
		padding: 0.5rem 0;
		font-size: 0.875rem;
		color: var(--text-muted, inherit);
	}

	.youtube-embed {
		position: relative;
		width: 100%;
		max-width: 32rem;
		aspect-ratio: 16 / 9;
		margin: 0 auto 0.75rem;
	}

	.youtube-embed iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: 0.5rem;
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

	.default-link {
		display: block;
		margin-top: 0.5rem;
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

	.your-part-select {
		width: 100%;
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: var(--radius-md);
		padding: 0.55rem 0.7rem;
	}

	.subsection-hint {
		margin: 0.6rem 0 0.4rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
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

	/* Explicit tracks so each piece stays aligned across rows even when the
	   icon (Display=Custom only) or slider/value (Mix=Custom only) aren't
	   rendered at all — grid auto-placement would otherwise shift everything
	   left into the gap. */
	.visual-state-btn {
		grid-column: 1;
	}

	.balance-label {
		grid-column: 2;
	}

	.balance-row input[type='range'] {
		grid-column: 3;
	}

	.balance-value {
		grid-column: 4;
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
		color: var(--text-muted);
	}

	/* Highlights whichever row is "Your Part" — the part itself is now
	   changed up in the Your Part section, not from here. */
	.balance-label.active {
		color: var(--accent);
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
