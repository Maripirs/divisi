<script lang="ts">
	import { onDestroy, onMount, tick as svelteTick } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { MAX_TEMPO_BPM, MIN_TEMPO_BPM, MidiPlayer } from '$lib/audio/player';
	import { extractYoutubeVideoId, YoutubeAudioPlayer } from '$lib/audio/youtubeAudioPlayer';
	import { convertVisualParts } from '$lib/midi/musicXmlConverter';
	import { playerDefaults, setPlayerDefaults, VIEW_MODES, type ViewMode } from '$lib/playerDefaults';
	import {
		DISPLAY_MODES,
		MIX_MODES,
		VOICE_PARTS,
		VISUAL_STATES,
		type DisplayMode,
		type MixMode,
		type MixPart,
		type ParsedMIDI,
		type VisualState,
		type VoicePart
	} from '$lib/midi/types';
	import {
		collapseToBaseRecord,
		expandBaseRecord,
		materializePartRecord,
		matchingDisplayMode,
		matchingMixMode,
		presetBalances,
		presetVisualStates,
		sameBalances,
		sameVisualStates
	} from '$lib/player/mixMath';
	import { loadPersistedSettings, savePersistedSettings } from '$lib/player/persistence';
	import { getPiece } from '$lib/pieces/registry';
	import { buildRemotePiece, type RemotePieceMeta } from '$lib/pieces/remotePiece';
	import type { Piece } from '$lib/pieces/types';
	import { highlightedMutedInk, resolvedTheme } from '$lib/theme';
	import { getLogoArtworkDataUrl } from '$lib/media/nowPlayingArtwork';
	import PdfView from '$lib/components/PdfView.svelte';
	import ScoreView from '$lib/components/ScoreView.svelte';
	import AnnotationSheet from '$lib/components/AnnotationSheet.svelte';
	import PieceNotesPanel from '$lib/components/PieceNotesPanel.svelte';
	import { listGuestGroupNotes, type PieceNote } from '$lib/api/pieceNotes';
	import { listGroupCues } from '$lib/api/pieceMarkup';
	import { createAnnotationController } from '$lib/player/annotations.svelte';
	import { m } from '$lib/paraglide/messages';
	import { lh } from '$lib/i18n';

	let {
		data
	}: {
		data: { id: string; guestGate?: { groupName: string; code: string } };
	} = $props();

	// A bare `/piece/{id}` link opened logged-out, when the owning group has
	// a guest password: `+page.server.ts` resolved the group and handed us
	// its name + join code instead of the piece. Show a gate card that names
	// the group rather than mounting the player or kicking off a codeless
	// `resolveRemote()` (which would just 404). A logged-in user is never
	// gated — `page.data.user` being set means the server returned the plain
	// `{ id }` shape and the normal logged-in path applies.
	const showGuestGate = $derived(!!data.guestGate && !page.data.user);
	// The keyed markup remounts this component whenever the route id changes,
	// so capturing the matching piece once per mount is intentional. Bundled
	// fixtures win a same-id collision (can't happen in practice — fixture
	// ids are short slugs, real Backend piece ids are UUIDs — but bundled
	// first matches this file's existing behavior before F5) — and resolve
	// synchronously, no network involved. A real Backend piece starts
	// unresolved: `onMount` below fetches `resolve/+server.ts` (deliberately
	// *not* awaited in `+page.server.ts`'s `load` — see that file's doc
	// comment) and fills `piece`/`remoteMeta` in once the Backend actually
	// answers, however long that takes. Either way this component has
	// already mounted and painted a "loading" status card by then — see the
	// "never blank, even with the Backend down" fix this shape exists for.
	// svelte-ignore state_referenced_locally
	let piece = $state<Piece | undefined>(getPiece(data.id));
	let remoteMeta = $state<RemotePieceMeta | null>(null);
	// Whether this caller is an admin of the piece's owning group. F20: the
	// Piece Notes panel shows its add/edit/delete controls for the group's
	// notes. F21: the PDF markup layer lets an admin draw into the shared
	// "director" layer. Members see both read-only.
	let isOwningGroupAdmin = $state(false);
	// Kept as the name the Piece Notes panel already binds to.
	const canManagePieceNotes = $derived(isOwningGroupAdmin);
	// F5: a piece can carry a music file, a PDF, or both — the player adapts
	// to whichever subset this piece actually has. Every bundled fixture has
	// both today, so this is a no-op for them (both stay true, exactly like
	// before F5 existed).
	let hasPlayer = $derived(!!piece?.load);
	let hasPdfPane = $derived(!!piece?.pdfUrl);
	let availableViewModes = $derived(VIEW_MODES.filter((mode) => (mode === 'player' ? hasPlayer : hasPdfPane)));

	// Reached via a join-code link (`routes/join/[code]`) rather than a
	// logged-in dashboard — same player, same "Make this my default" (per
	// `playerDefaults.ts`, that's `localStorage`-only for everyone already,
	// nothing Backend-bound to restrict for a guest). Only set for a guest
	// who came from a specific group's join link (as opposed to the
	// guest-accessible demo library), so "back" can return there instead of
	// the generic library.
	const guestJoinCode = page.url.searchParams.get('code');

	/** F20 guest expansion: the "From the director" notes for a guest
	 * viewing this piece via a join code. Read-only; the "My notes" section
	 * is omitted (no session for per-member B5 annotations). The group's
	 * guest token is injected server-side by the `/piece/[id]/notes?code=`
	 * proxy from its httpOnly cookie, so nothing authed reaches this browser. */
	function loadGuestDirectorNotes(): Promise<PieceNote[]> {
		return listGuestGroupNotes(guestJoinCode ?? '', remoteMeta?.pieceId ?? '');
	}

	// Guest password gate state, for the `data.guestGate` card only (a bare
	// `/piece/{id}` link, no `?code=`, whose owning group has a guest
	// password — see `+page.server.ts`). A join-code link never reaches this:
	// the code alone authorizes the guest routes now, so `resolve/+server.ts`
	// no longer has a "password required" outcome. The entered password is
	// POSTed to `/join/{code}/auth`; on success we navigate to the piece
	// *with* `?code=` and the normal guest flow takes over. Nothing sensitive
	// is ever put in the URL.
	let gatePassword = $state('');
	let gatePasswordWrong = $state(false);
	let gateSubmitting = $state(false);

	/** Submit handler for the `data.guestGate` card (bare piece link,
	 * password group, before any `?code=`). `/join/{code}/auth` mints the
	 * per-group guest-token cookie; the code comes from the server-resolved
	 * `data.guestGate` rather than the URL. On success, navigate to the
	 * piece *with* `?code=` so the normal guest flow (and this component's
	 * `resolveRemote()`) takes over.
	 *
	 * This is a full-document navigation, not a `goto()`: the whole page is
	 * wrapped in `{#key data.id}`, so adding `?code=` to the same route would
	 * reuse this component instance and never re-run `onMount` — which is the
	 * only place `resolveRemote()` (and the render loop) is kicked off. The
	 * gate card would swap for the player, but `loadState` would sit on its
	 * initial `'loading'` forever ("Loading score..." that only a manual
	 * refresh cleared). A hard nav remounts clean with `?code=` already
	 * present. It is a one-time step per browser (30-day cookie), so the
	 * extra full load costs nothing. */
	async function submitGuestGatePassword(event: SubmitEvent) {
		event.preventDefault();
		if (!data.guestGate) return;
		gateSubmitting = true;
		gatePasswordWrong = false;
		try {
			const res = await fetch(`/join/${data.guestGate.code}/auth`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: gatePassword })
			});
			const body = (await res.json()) as { ok: boolean };
			if (body.ok) {
				gatePassword = '';
				window.location.href = lh(
					`/piece/${data.id}?code=${encodeURIComponent(data.guestGate.code)}`
				);
			} else {
				gatePasswordWrong = true;
			}
		} catch {
			gatePasswordWrong = true;
		} finally {
			gateSubmitting = false;
		}
	}

	// The admin's chosen tempo for this piece (`PUT
	// /library/pieces/{id}/default-tempo`, set from a group's Tracks tab).
	// `null` when the admin never set one, or the piece has no real Backend
	// counterpart (fixture-only demo tracks).
	//
	// Primary source is `remoteMeta.defaultTempoBpm`, resolved from
	// `/library/pieces` by `resolve/+server.ts` and available by the time
	// `bootstrap()` reads this. The `?defaultTempo=` URL param is a legacy
	// fallback: only the group Tracks tab ever attached it, so pieces
	// opened from Home, the Library, a homework link, or a guest join link
	// were all ignoring the configured tempo and falling back to the
	// parser's 120 BPM default. Kept as the fallback because a bundled
	// fixture matched by title (see `getPieceByTitle`) has no `remoteMeta`.
	const adminDefaultTempoParam = page.url.searchParams.get('defaultTempo');
	function normalizeDefaultTempo(bpm: number | null | undefined): number | null {
		const n = bpm == null ? NaN : Number(bpm);
		return Number.isFinite(n) && n >= MIN_TEMPO_BPM && n <= MAX_TEMPO_BPM ? Math.round(n) : null;
	}
	const urlDefaultTempo = normalizeDefaultTempo(
		adminDefaultTempoParam ? Number(adminDefaultTempoParam) : null
	);
	const adminDefaultTempo: number | null = $derived(
		normalizeDefaultTempo(remoteMeta?.defaultTempoBpm) ?? urlDefaultTempo
	);

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
		// Distinct from `notFound`: the Backend never actually answered
		// (most often Render's free-tier instance waking from an idle
		// spin-down — see `+page.server.ts`'s `RemoteResolution`), so saying
		// "not found" would be actively misleading — the piece is very
		// likely fine, the server just hasn't responded yet.
		//
		// `waking` is that same "no answer yet" case while `resolveRemote()`
		// is still auto-retrying it — a Render free-tier cold start takes
		// ~30s, and the request that failed is the one that triggered the
		// wake-up, so a retry almost always succeeds. Only once retries have
		// run past `WAKE_RETRY_DEADLINE_MS` with no answer do we fall back to
		// the terminal `unreachable` card (manual "Try again").
		| { kind: 'waking' }
		| { kind: 'unreachable' }
		| { kind: 'error'; message: string }
		| { kind: 'ready' }
		| { kind: 'noVisibleTracks' }
		| { kind: 'noNotesForVoicePart'; part: MixPart }
		// F5: a piece with no music file (PDF-only) never parses anything —
		// nothing in the allow-lists below ever matches this, so the menu
		// button/bottom playback bar stay correctly hidden, same as they'd be
		// mid-load, with no special-casing needed at each check site.
		| { kind: 'pdfOnly' };

	// A bundled fixture is already resolved by now (see `piece` above), so
	// this is the same `hasPlayer ? 'loading' : 'pdfOnly'` this always
	// computed. A real Backend piece hasn't resolved yet at mount time —
	// `'loading'` covers that too, same card either way, until `onMount`'s
	// `resolveRemote()` (below) finds out whether it's actually 'notFound'
	// or 'unreachable'.
	// svelte-ignore state_referenced_locally
	let loadState = $state<LoadState>(piece && !hasPlayer ? { kind: 'pdfOnly' } : { kind: 'loading' });
	let parsed: ParsedMIDI | undefined;
	let player: MidiPlayer | undefined;
	// F13: while viewing the PDF, the bottom bar can be driven by either the
	// synthesized mix (`player`, same as always) or the reference recording's
	// real audio, via a hidden `YoutubeAudioPlayer` — see `setAudioSource`.
	// Forced to `'reference'` (no picker shown) for a PDF-only piece with no
	// music file at all, since `'mix'` has no player to mean anything there.
	let audioSource = $state<'mix' | 'reference'>('mix');
	let referencePlayer: YoutubeAudioPlayer | undefined;
	let referencePlayerLoading = $state(false);
	let referencePlayerError = $state<string | null>(null);

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
	// Bound out of `ScoreView`: true while OSMD re-engraves the score after a
	// Practice Setup change. Used to dim/disable the drawer controls and show
	// an "updating" hint right there, since the re-render blocks the main
	// thread for a second or two and the tap otherwise looks ignored.
	let scoreRendering = $state(false);
	// F5: forced to whichever single pane exists when a piece doesn't have
	// both — a stale/default 'pdf'/'player' pick from before this piece was
	// opened must never select a pane this piece doesn't have. `!piece` is
	// its own case, not just "no player": `hasPlayer`/`hasPdfPane` are both
	// false with nothing resolved yet, and `!hasPlayer ? 'pdf' : ...` used
	// to read that the same as a real PDF-only piece — defaulting to the
	// 'pdf' pane, which never renders anything when there's no `piece.pdfUrl`
	// to show. The status card (loading/notFound/unreachable/error) lives in
	// the *player* pane (see below), so a real bug: this was the actual
	// cause of the page going blank on a slow/unreachable Backend, not just
	// a missing message — the right state was already there, just hidden
	// behind `class:hidden={viewMode !== 'player'}`.
	// svelte-ignore state_referenced_locally
	let viewMode = $state<ViewMode>(
		!piece ? 'player' : !hasPlayer ? 'pdf' : !hasPdfPane ? 'player' : initialDefaults.viewMode
	);
	let zoomLevel = $state(1);
	let pdfZoomLevel = $state(1);
	// F21: two independent, session-local PDF-markup visibility toggles, both
	// default off and additive. Driven from the Practice Setup drawer below
	// and bound into `PdfView`, which no longer floats its own control.
	// "Show director markup" only applies to a group-owned piece.
	let showMineMarkup = $state(false);
	let showDirectorMarkup = $state(false);
	// Gate for the markup-toggle persist `$effect` below: stays false until
	// `bootstrap()` has restored the stored toggle values, so the effect
	// can't clobber a stored `true` with the `false` default on first run.
	let markupPersistReady = false;
	let tempoBpm = $state(120);
	let baseTempoBpm = $state(120);
	let balance = $state<Record<MixPart, number>>(initialDefaults.mix.balance);

	let scoreView: ScoreView | undefined = $state();
	let pdfView: PdfView | undefined = $state();

	// F4: annotations only ever exist for a real Backend piece (Backend's
	// `Annotation.piece_id` has to be a real `Piece`), and only for a
	// logged-in user (the Backend's endpoints all require `get_current_user`
	// — there's no guest annotation path at all, unlike homework/tracks).
	// `canAnnotate` stays here (not in the controller) because it also gates
	// the PDF markup UI, which is not annotation-specific.
	const canAnnotate = $derived(!!remoteMeta && !!page.data.user);
	// F4: the whole annotation feature (list/sheet/shares state + CRUD/share
	// calls) lives in this composable now (round-2 cleanup step 4). The three
	// external reads it needs are threaded in as getters: `remoteMeta`/`parsed`
	// are assigned imperatively later in this file (not `$state`), and the
	// arrow-fn getters aren't invoked until the controller acts, so referring
	// to them here is safe.
	const ann = createAnnotationController({
		pieceId: () => remoteMeta?.pieceId,
		currentUser: () => page.data.user ?? undefined,
		timeSignature: () => parsed?.timeSignature
	});

	// F22: cue glyphs render in the PDF player for everyone with the reference
	// recording selected — members through the authed markup proxy, guests
	// through its `?code=` guest branch. A bundled fixture or a piece with no
	// reference recording resolves to `null`, so no cues load. Independent of
	// the "Show director markup" toggle (which still gates the rest of the
	// director ink) and of `canAnnotate`.
	const cueLoader = $derived(() => {
		if (!remoteMeta || !piece?.youtubeUrl) return null;
		if (canAnnotate) return () => listGroupCues(remoteMeta!.pieceId);
		if (guestJoinCode) return () => listGroupCues(remoteMeta!.pieceId, guestJoinCode);
		return null;
	});

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
			sameBalances(parsed.parts, balance, expandBaseRecord(parsed.parts, $playerDefaults.mix.balance)) &&
			sameVisualStates(
				parsed.parts,
				visualStates,
				expandBaseRecord(parsed.parts, $playerDefaults.mix.visualStates)
			)
	);
	let rafHandle: number;
	let destroyed = false;

	onMount(() => {
		// `data.guestGate` (logged-out bare link to a password-protected
		// group's piece): the gate card below is all this mount shows — no
		// player, and crucially no `resolveRemote()`, which with no `?code=`
		// would 404. `bootstrap()`/`tick` have nothing to drive either.
		if (showGuestGate) return;
		if (piece) void bootstrap();
		else void resolveRemote();
		rafHandle = requestAnimationFrame(tick);
	});

	// F13: a PDF-only piece (no music file) has no `'mix'` to fall back to —
	// force `'reference'` and preload the player as soon as that's known, so
	// the bottom bar's scrubber already has a real duration before the human
	// even taps play, same as a music-file piece does via `bootstrap()`.
	$effect(() => {
		if (!hasPlayer && piece?.youtubeUrl && audioSource !== 'reference') audioSource = 'reference';
	});
	$effect(() => {
		// `referencePlayerError` also gates this — otherwise a failed load
		// (e.g. a malformed/deleted video) would retry in a loop forever,
		// since this effect re-runs the moment `referencePlayerLoading` flips
		// back to `false` in `ensureReferencePlayer`'s `finally`.
		// `togglePlay` still retries deliberately on an explicit tap.
		if (audioSource === 'reference' && !referencePlayer && !referencePlayerLoading && !referencePlayerError) {
			void ensureReferencePlayer();
		}
	});

	/** The seed view/audio for a piece being opened. An admin can set
	 * `piece.presentation` to land a first-time viewer on the PDF score plus
	 * reference recording, or on the play-along mix, but only when this
	 * piece actually has the panes that presentation needs, and only for a
	 * viewer with no saved settings for it (a returning viewer's own pick,
	 * restored in `bootstrap()`, always wins). Absent a usable hint this is
	 * the same pane-shape default the page has always used. */
	function seededPresentation(): { viewMode: ViewMode; audioSource: 'mix' | 'reference' } {
		const paneDefault = {
			viewMode: !hasPlayer ? 'pdf' : !hasPdfPane ? 'player' : initialDefaults.viewMode,
			audioSource: 'mix' as const
		};
		const hint = piece?.presentation;
		if (!hint || !piece) return paneDefault;
		// "Opened before" == this piece has a persisted blob; every save
		// writes `viewMode`, so its presence is the reliable signal. The
		// admin hint only seeds the very first open.
		if (loadPersistedSettings(piece.id).viewMode !== undefined) return paneDefault;
		if (hint === 'score_reference' && hasPdfPane && piece.youtubeUrl) {
			return { viewMode: 'pdf', audioSource: 'reference' };
		}
		if (hint === 'play_along' && hasPlayer) {
			return { viewMode: 'player', audioSource: 'mix' };
		}
		return paneDefault;
	}

	/** Wall-clock budget for auto-retrying a Backend that hasn't answered
	 * yet. A Render free-tier cold start is ~30s; the resolve proxy itself
	 * waits up to 20s per attempt (see `resolve/+server.ts`), so this leaves
	 * room for a slow wake plus a couple of retries before we give up and
	 * show the manual "Try again" card. */
	const WAKE_RETRY_DEADLINE_MS = 90_000;
	/** Gap between auto-retries while the Backend is still waking. */
	const WAKE_RETRY_GAP_MS = 2_500;
	let wakeRetryUntil = 0;
	let wakeRetryTimer: ReturnType<typeof setTimeout> | undefined;

	/** A transient resolve failure means the Backend hasn't answered yet —
	 * nearly always Render's free-tier instance waking from a spin-down, and
	 * the request that just failed is the one that triggered the wake-up. So
	 * keep the `waking` card up and retry `resolveRemote()` on a short loop
	 * rather than telling the user we couldn't load the piece. Only after
	 * `WAKE_RETRY_DEADLINE_MS` of no answer do we fall back to the terminal
	 * `unreachable` card. */
	function retryWhileBackendWakes() {
		if (wakeRetryUntil === 0) wakeRetryUntil = Date.now() + WAKE_RETRY_DEADLINE_MS;
		if (Date.now() >= wakeRetryUntil) {
			loadState = { kind: 'unreachable' };
			return;
		}
		loadState = { kind: 'waking' };
		clearTimeout(wakeRetryTimer);
		wakeRetryTimer = setTimeout(() => {
			if (!destroyed) void resolveRemote();
		}, WAKE_RETRY_GAP_MS);
	}

	/** Fetches `resolve/+server.ts` for a real Backend piece — deliberately
	 * from here, not `+page.server.ts`'s `load` (which returns instantly
	 * now): by the time this runs, the component has already mounted and
	 * painted the 'loading' status card above, so however long the Backend
	 * takes to answer (or fails to), the user is looking at that card, never
	 * a blank pane. See `resolve/+server.ts`'s doc comment for the full
	 * story. */
	async function resolveRemote() {
		try {
			const code = page.url.searchParams.get('code');
			const res = await fetch(`/piece/${encodeURIComponent(data.id)}/resolve${code ? `?code=${encodeURIComponent(code)}` : ''}`);
			if (!res.ok) {
				retryWhileBackendWakes();
				return;
			}
			const body = (await res.json()) as {
				remote: RemotePieceMeta | null;
				unreachable: boolean;
				isOwningGroupAdmin?: boolean;
				canManagePieceNotes?: boolean;
			};
			if (!body.remote) {
				if (body.unreachable) {
					retryWhileBackendWakes();
				} else {
					loadState = { kind: 'notFound' };
				}
				return;
			}
			// The Backend answered — stop any wake-retry loop.
			wakeRetryUntil = 0;
			clearTimeout(wakeRetryTimer);
			remoteMeta = body.remote;
			isOwningGroupAdmin = body.isOwningGroupAdmin ?? body.canManagePieceNotes ?? false;
			piece = buildRemotePiece(body.remote, guestJoinCode);
			// `viewMode`/`audioSource` were seeded assuming no piece at all.
			// Now that `hasPlayer`/`hasPdfPane` are known, apply the pane-shape
			// default, or the admin's `presentation` hint when this is a
			// first-time open of a piece that carries one. `bootstrap()` (next)
			// still gets the final say via this piece's own persisted settings,
			// exactly as before.
			const seed = seededPresentation();
			viewMode = seed.viewMode;
			audioSource = seed.audioSource;
			loadState = hasPlayer ? { kind: 'loading' } : { kind: 'pdfOnly' };
			void bootstrap();
		} catch {
			retryWhileBackendWakes();
		}
	}

	onDestroy(() => {
		destroyed = true;
		cancelAnimationFrame(rafHandle);
		clearTimeout(wakeRetryTimer);
		player?.destroy();
		player = undefined;
		referencePlayer?.destroy();
		referencePlayer = undefined;
		clearMediaSession();
	});

	async function bootstrap() {
		if (!piece) return;
		if (canAnnotate) void ann.loadAnnotations();
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
		// F21: restore the markup layer toggles (the persisted visibility
		// state, not the transient armed-pencil/tool state).
		if (stored.showMineMarkup !== undefined) showMineMarkup = stored.showMineMarkup;
		if (stored.showDirectorMarkup !== undefined) showDirectorMarkup = stored.showDirectorMarkup;
		// F13: only bring back a stored `'reference'` pick when it can
		// actually mean something on open: PDF view, and the piece has a
		// reference recording. Otherwise stay on `'mix'`. Done after
		// `viewMode` is restored above. The `!hasPlayer` PDF-only case is
		// already forced to `'reference'` by its own `$effect`.
		if (stored.audioSource === 'reference' && viewMode === 'pdf' && piece?.youtubeUrl) {
			audioSource = 'reference';
		}
		markupPersistReady = true;
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
			// The "100%" anchor for the tempo readout is the piece's *opening*
			// tempo — the admin's configured default if there is one, otherwise
			// the file's own tempo. So a piece always opens showing 100%, and
			// the steppers move you off it, rather than the readout starting at
			// some odd percentage because the admin default (or a
			// tempo the parser couldn't read from the file) differs from the
			// file's declared tempo.
			baseTempoBpm = adminDefaultTempo ?? player.baseBPM;
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
		if (audioSource === 'reference' && referencePlayer) {
			positionMs = referencePlayer.positionMs;
			isPlaying = referencePlayer.isPlaying;
			// The IFrame API reports `0` until the video's metadata has
			// actually loaded — never overwrite an already-known duration
			// with that "not ready yet" value.
			if (referencePlayer.duration > 0) durationMs = referencePlayer.duration;
		} else if (player) {
			positionMs = player.positionMs;
			isPlaying = player.isPlaying;
		}
		rafHandle = requestAnimationFrame(tick);
	}

	/** Lazily creates the hidden YouTube player behind `audioSource ===
	 * 'reference'` — not eagerly at piece-load time, since most pieces with a
	 * reference recording are still practiced against the synthesized mix and
	 * would otherwise pay for a YouTube API load/network round trip nobody
	 * asked for. */
	async function ensureReferencePlayer(): Promise<void> {
		if (referencePlayer || referencePlayerLoading || !piece?.youtubeUrl) return;
		const videoId = extractYoutubeVideoId(piece.youtubeUrl);
		if (!videoId) {
			referencePlayerError = m.piece_reference_unavailable();
			return;
		}
		referencePlayerLoading = true;
		referencePlayerError = null;
		try {
			referencePlayer = await YoutubeAudioPlayer.create(videoId);
		} catch {
			referencePlayerError = m.piece_reference_unavailable();
		} finally {
			referencePlayerLoading = false;
		}
	}

	/** Switches which audio the bottom bar controls — never lets the source
	 * being left keep playing underneath the one being switched to. The
	 * disabled state on each picker button already prevents a normal click
	 * from getting here for a source this piece doesn't have; this is just
	 * the same guard belt-and-suspenders style. */
	function setAudioSource(source: 'mix' | 'reference') {
		if (source === audioSource) return;
		if (source === 'mix' && !hasPlayer) return;
		if (source === 'reference' && !piece?.youtubeUrl) return;
		if (audioSource === 'reference') referencePlayer?.pause();
		else player?.pause();
		audioSource = source;
		// F13: remember the pick per piece (restored on reopen only under
		// the PDF-view + reference-recording guard in `bootstrap()`).
		persistSettings();
	}

	async function togglePlay() {
		if (audioSource === 'reference') {
			if (!referencePlayer) await ensureReferencePlayer();
			if (!referencePlayer) return;
			if (referencePlayer.isPlaying) referencePlayer.pause();
			else referencePlayer.play();
			return;
		}
		if (!player) return;
		if (player.isPlaying) player.pause();
		else await player.play();
	}

	function seek(ms: number) {
		if (audioSource === 'reference') referencePlayer?.seek(ms);
		else player?.seek(ms);
	}

	function setBalance(part: MixPart, value: number) {
		const nextBalance = { ...balance, [part]: value };
		balance = nextBalance;
		mixMode = matchingMixMode(parsed?.parts ?? [], nextBalance, voicePart, subPart);
		player?.setPartVolume(part, value);
		persistSettings();
	}

	function persistSettings() {
		if (!piece) return;
		savePersistedSettings(piece.id, {
			tempoBpm,
			voicePart,
			subPart,
			displayMode,
			visualStates,
			mixMode,
			balance,
			viewMode,
			zoomLevel,
			pdfZoomLevel,
			showMineMarkup,
			showDirectorMarkup,
			audioSource
		});
	}

	function setTempo(bpm: number, persist = true) {
		tempoBpm = bpm;
		player?.setTempo(bpm);
		if (persist) persistSettings();
	}

	function setViewMode(mode: ViewMode) {
		viewMode = mode;
		persistSettings();
		// F13: the reference-audio choice only makes sense while looking at
		// the PDF — leaving it always lands back on the synthesized mix (the
		// one the notation cursor is actually synced to), rather than letting
		// a picked reference recording keep playing under the score view.
		if (mode !== 'pdf' && audioSource === 'reference' && hasPlayer) {
			referencePlayer?.pause();
			audioSource = 'mix';
		}
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
			visualStates = presetVisualStates(parsed?.parts ?? [], displayMode, part, subPart);
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
			visualStates = presetVisualStates(parsed?.parts ?? [], displayMode, voicePart, subPart);
		}
		if (mixMode !== 'custom') applyMixPreset(mixMode, voicePart);
		persistSettings();
	}

	function setDisplayMode(mode: DisplayMode) {
		displayMode = mode;
		if (mode !== 'custom') visualStates = presetVisualStates(parsed?.parts ?? [], mode, voicePart, subPart);
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
		balance = presetBalances(parsed?.parts ?? [], mode, focusPart, subPart);
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

	function cycleVisualState(part: MixPart) {
		const currentIndex = VISUAL_STATES.indexOf(visualStates[part]);
		const nextState = VISUAL_STATES[(currentIndex + 1) % VISUAL_STATES.length];
		const nextStates = { ...visualStates, [part]: nextState };
		visualStates = nextStates;
		displayMode = matchingDisplayMode(parsed?.parts ?? [], nextStates, voicePart, subPart);
		persistSettings();
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

	// Bumped by `clearMediaSession` so a `getArtworkDataUrl()` still in
	// flight from a since-left piece doesn't land its result on a
	// `mediaSession` that's now either cleared or belongs to a different
	// piece.
	let mediaSessionToken = 0;

	function setupMediaSession() {
		if (!('mediaSession' in navigator) || !piece) return;
		navigator.mediaSession.metadata = new MediaMetadata({ title: piece.title, artist: piece.composer });
		navigator.mediaSession.setActionHandler('play', () => void togglePlay());
		navigator.mediaSession.setActionHandler('pause', () => void togglePlay());
		void applyMediaSessionArtwork();
	}

	/**
	 * Fills in lock-screen artwork once it's ready: a segment of the piece's
	 * PDF when it has one, otherwise the app logo. Split out from
	 * `setupMediaSession` (rather than awaited inline there) so the
	 * title/artist and play/pause handlers land immediately — the PDF
	 * segment can take a moment (page 1 has to actually finish rendering),
	 * and there's no reason play/pause controls should wait on that.
	 *
	 * Without *some* explicit artwork, iOS Safari falls back to the page's
	 * tiny `/favicon.ico`, which comes out badly pixelated blown up to the
	 * lock screen's artwork size — this is what replaces that fallback.
	 */
	async function applyMediaSessionArtwork() {
		const token = ++mediaSessionToken;
		const pdfArtwork = piece?.pdfUrl ? await pdfView?.getArtworkDataUrl() : undefined;
		const src = pdfArtwork ?? (await getLogoArtworkDataUrl());
		if (token !== mediaSessionToken || !navigator.mediaSession.metadata || !piece) return;
		navigator.mediaSession.metadata = new MediaMetadata({
			title: piece.title,
			artist: piece.composer,
			artwork: [{ src, sizes: '512x512', type: pdfArtwork ? 'image/jpeg' : 'image/png' }]
		});
	}

	function clearMediaSession() {
		mediaSessionToken++;
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
	// `bootstrap()`'s restore has actually run (`waking` is another
	// pre-`bootstrap()` state: the Backend hasn't resolved the piece yet).
	$effect(() => {
		zoomLevel;
		pdfZoomLevel;
		if (loadState.kind === 'loading' || loadState.kind === 'waking') return;
		persistSettings();
	});

	// F21: `showMineMarkup` / `showDirectorMarkup` are two-way-bound into
	// `PdfView` (Practice Setup drawer + the view itself), so like the zoom
	// levels above they have no page-level setter to hang a `persistSettings()`
	// call off. Guarded on `markupPersistReady` so it doesn't write the
	// `false` defaults before `bootstrap()` has restored the stored values.
	$effect(() => {
		showMineMarkup;
		showDirectorMarkup;
		if (!markupPersistReady) return;
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

	/** Real browser/app history back whenever there's actually somewhere to go
	 * back to — lands wherever the human genuinely came from (a specific
	 * group's Tracks tab, its scroll position, the admin view they had open,
	 * etc.), not always the generic library/join page regardless of that.
	 * Falls back to the old destination-guessing logic only when there's
	 * nothing to go back to at all (opened directly/a fresh tab/a deep
	 * link) — `history.back()` there would leave the app entirely instead of
	 * landing anywhere useful. Root `+page.server.ts` redirects a bare `/` to
	 * `/welcome` (logged out) or `/home` (logged in), so the library needs the
	 * explicit `?lib=1` opt-in. A guest who arrived via a specific group's join
	 * code (`guestJoinCode` set) goes back to that group's page, not the
	 * unrelated demo library. */
	function backToLibrary() {
		if (window.history.length > 1) {
			history.back();
			return;
		}
		if (guestJoinCode) goto(lh(`/join/${encodeURIComponent(guestJoinCode)}`));
		else goto(lh('/?lib=1'));
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#key data.id}
	{#if showGuestGate && data.guestGate}
		<!-- Bare `/piece/{id}` link, logged out, owning group has a guest
		     password (`data.guestGate` from `+page.server.ts`): this gate card
		     is the whole page — no player, and no header controls that would
		     reference a `piece` we never resolved. It reuses the same
		     `.status-card` / `.gate-form` shell the player's own status cards
		     use. Entering the right password mints the guest-token cookie and
		     navigates to `/piece/{id}?code=...`, where the normal guest flow
		     takes over (the code alone authorizes from there — the password
		     only ever gates this no-`?code=` entry point). A join-code link
		     never lands here. -->
		<div class="player-shell">
			<main class="score-area">
				<div class="view-pane">
					<div class="status-card">
						<p>{m.piece_password_gate_group_title({ group: data.guestGate.groupName })}</p>
						<p class="status-detail-text">{m.piece_password_gate_group_body()}</p>
						<form class="gate-form" onsubmit={submitGuestGatePassword}>
							<input
								type="password"
								bind:value={gatePassword}
								placeholder={m.login_password()}
								aria-label={m.login_password()}
								required
								autocomplete="current-password"
							/>
							{#if gatePasswordWrong}
								<p class="status-note status-note--error">{m.join_password_wrong()}</p>
							{/if}
							<button class="gate-submit" type="submit" disabled={gateSubmitting}>
								{m.piece_password_gate_submit()}
							</button>
						</form>
						<a
							class="text-link"
							href={lh(
								`/login?redirectTo=${encodeURIComponent(`/piece/${data.id}?code=${data.guestGate.code}`)}`
							)}
						>
							{m.piece_password_gate_login()}
						</a>
					</div>
				</div>
			</main>
		</div>
	{:else}
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
					loadState.kind !== 'noVisibleTracks' &&
					loadState.kind !== 'pdfOnly'
				}
				onclick={() => (menuOpen = true)}
				aria-label={m.piece_open_practice_setup()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M4 7h16M4 12h16M4 17h16" />
				</svg>
			</button>
		</header>

		{#if remoteMeta?.groupId && page.data.user}
			<!-- F20: short text notes pinned to this piece (Backend B16 group
			     notes; personal notes pending). Read-only for members; group
			     admins get authoring controls. The panel hides itself when
			     the group's Weekly Notes page is disabled for members or
			     there's nothing to show. -->
			<PieceNotesPanel
				pieceId={remoteMeta.pieceId}
				groupId={remoteMeta.groupId}
				canManage={canManagePieceNotes}
			/>
		{:else if guestJoinCode && remoteMeta && !page.data.user}
			<!-- F20 guest expansion: a guest viewing this piece via a join
			     code sees the "From the director" notes read-only (Backend
			     B16 guest route, gated on the group's Tracks page being
			     public). No "My notes" section — a guest has no session. -->
			<PieceNotesPanel pieceId={remoteMeta.pieceId} directorLoader={loadGuestDirectorNotes} />
		{/if}

		{#if piece?.youtubeUrl && !hasPdfPane}
			<!-- F5: reference-audio link. F13 replaced this video embed with
			     an audio-only bottom-bar source (see the "Audio source"
			     Practice Setup section + the PDF pane) for any piece that has
			     a PDF to host that picker in — this fallback only remains for
			     the narrower shape a real Backend piece can still have (a
			     music file + a reference recording, no PDF at all), where
			     there's no PDF view for that picker to live in. -->
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
				{:else if loadState.kind === 'waking'}
					<div class="status-card">
						<div class="spinner" aria-hidden="true"></div>
						<p>{m.piece_backend_waking()}</p>
					</div>
				{:else if loadState.kind === 'unreachable'}
					<div class="status-card status-card--error">
						<p>{m.errors_could_not_reach_server()}</p>
						<button class="text-link" onclick={() => location.reload()}>{m.piece_retry()}</button>
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
							bind:rendering={scoreRendering}
							showBadge={!menuOpen}
							{xml}
							{displayMode}
							staffVisualStates={visibleStaffStates}
							scoreTheme={$resolvedTheme}
							positionWholeNotes={msPerWholeNote > 0 ? positionMs / msPerWholeNote : 0}
							onNoteClick={(wholeNotes) => seek(wholeNotes * msPerWholeNote)}
							annotations={ann.annotations}
							annotateMode={ann.annotateMode}
							onAnnotationPlace={ann.openCreate}
							onAnnotationMarkerClick={ann.openMarker}
						/>
					</div>
				{/if}
			</div>
			{/if}
			{#if piece?.pdfUrl}
				<div class="view-pane" class:hidden={viewMode !== 'pdf'}>
					<div class="pdf-card">
						<PdfView
						bind:this={pdfView}
						pdfUrl={piece.pdfUrl}
						bind:zoom={pdfZoomLevel}
						active={viewMode === 'pdf'}
						pieceId={remoteMeta?.pieceId}
						canMarkup={canAnnotate}
						currentUserId={page.data.user?.id}
						isOwningGroupAdmin={isOwningGroupAdmin && !!remoteMeta?.groupId}
						bind:showMineMarkup
						bind:showDirectorMarkup
						audioSourceIsReference={audioSource === 'reference'}
						getReferencePositionMs={() => referencePlayer?.positionMs ?? null}
						canPlaceCue={() => !!piece?.youtubeUrl && audioSource === 'reference'}
						onCueTap={(ms) => {
							if (audioSource !== 'reference') setAudioSource('reference');
							referencePlayer?.seek(ms);
							referencePlayer?.play();
						}}
						cueLoader={cueLoader}
					/>
					</div>
				</div>
			{/if}
		</main>

		{#if loadState.kind === 'ready' || loadState.kind === 'noNotesForVoicePart' || loadState.kind === 'noVisibleTracks' || (loadState.kind === 'pdfOnly' && piece?.youtubeUrl)}
			<!-- F13: the `pdfOnly` branch is a PDF-only piece whose only
			     playable audio is its reference recording — `audioSource` is
			     forced to `'reference'` for that shape (see the `$effect`
			     above), so every control below already routes correctly. -->
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
							class:icon-btn--active={ann.annotateMode}
							onclick={ann.toggleAnnotateMode}
							aria-label={ann.annotateMode ? m.piece_cancel_add_annotation() : m.piece_add_annotation()}
							aria-pressed={ann.annotateMode}
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

				{#if scoreRendering}
					<!-- Sticks to the top of the drawer as you scroll, so the
					     "your tap landed, the score is redrawing" hint stays next
					     to whichever control was just used. The controls below go
					     `inert` + dimmed for the same second or two. -->
					<div class="menu-updating" role="status" aria-live="polite">
						<span class="menu-updating__dot" aria-hidden="true"></span>
						{m.piece_updating_score()}
					</div>
				{/if}

				<div class="menu-body" class:menu-body--updating={scoreRendering} inert={scoreRendering}>
				{#if hasPlayer}
				<!-- F13: tempo only means anything against the synthesized
				     mix — a PDF-only piece (or one whose PDF view is showing
				     the reference recording, see the Mix section's own gate
				     below) has no player-driven clock to speed up/slow down. -->
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
				{/if}

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

				{#if viewMode === 'pdf' && (hasPlayer || piece?.youtubeUrl)}
					<!-- F13: pops up right under View the moment PDF is picked
					     (View's own section right above) — always shown in
					     PDF view as long as *some* audio exists for this
					     piece, with whichever source this piece doesn't
					     actually have disabled rather than the whole section
					     disappearing (a PDF-only piece has no `'mix'`; a piece
					     with no reference recording has nothing to switch to).
					     Leaving the PDF pane always snaps back to `'mix'` —
					     see `setViewMode`. -->
					<section class="menu-section">
						<h3>{m.piece_audio_source()}</h3>
						<div class="segmented" role="group" aria-label={m.piece_audio_source()}>
							<button class:active={audioSource === 'mix'} disabled={!hasPlayer} onclick={() => setAudioSource('mix')}>
								{m.piece_audio_source_mix()}
							</button>
							<button
								class:active={audioSource === 'reference'}
								disabled={!piece?.youtubeUrl}
								onclick={() => setAudioSource('reference')}
							>
								{m.piece_audio_source_reference()}
							</button>
						</div>
						{#if audioSource === 'reference' && referencePlayerLoading}
							<p class="status-note">{m.piece_reference_loading()}</p>
						{:else if audioSource === 'reference' && referencePlayerError}
							<p class="status-note status-note--error">{referencePlayerError}</p>
						{/if}
					</section>
				{/if}

				{#if viewMode === 'pdf' && canAnnotate}
					<!-- F21: two independent, additive toggles (was an exclusive
					     None/Mine/Group picker). "Show director markup" only
					     applies to a group-owned piece. `PdfView` two-way-binds
					     both. -->
					<section class="menu-section">
						<h3>{m.markup_visibility_heading()}</h3>
						<button
							type="button"
							class="markup-toggle"
							class:active={showMineMarkup}
							role="switch"
							aria-checked={showMineMarkup}
							onclick={() => (showMineMarkup = !showMineMarkup)}
						>
							<span class="markup-toggle-box" aria-hidden="true"></span>
							{m.markup_show_mine()}
						</button>
						{#if remoteMeta?.groupId}
							<button
								type="button"
								class="markup-toggle"
								class:active={showDirectorMarkup}
								role="switch"
								aria-checked={showDirectorMarkup}
								onclick={() => (showDirectorMarkup = !showDirectorMarkup)}
							>
								<span class="markup-toggle-box" aria-hidden="true"></span>
								{m.markup_show_director()}
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

				{#if hasPlayer && audioSource !== 'reference'}
				<!-- F13: the mixer balances the synthesized mix's own parts —
				     meaningless with no player at all (a PDF-only piece), and
				     just as meaningless while the bottom bar is actually
				     playing the reference recording's single audio track
				     instead. -->
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
				{/if}
				</div>
			</aside>
		{/if}

		<AnnotationSheet
			open={ann.sheet !== null}
			mode={ann.sheet?.mode ?? 'create'}
			positionLabel={ann.positionLabel}
			content={ann.content}
			isOwner={ann.isOwner}
			shares={ann.shares}
			sharesLoading={ann.sharesLoading}
			saving={ann.saving}
			error={ann.error}
			onClose={ann.closeSheet}
			onSave={ann.save}
			onDelete={ann.deleteCurrent}
			onShare={ann.share}
			onUnshare={ann.unshare}
		/>
	</div>
	{/if}
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

	.status-note {
		margin: 0.5rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.status-note--error {
		color: var(--danger);
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

	/* Guest password gate (`data.guestGate` — a bare `/piece/{id}` link
	   whose owning group has a guest password). Sits in a plain
	   `.status-card`; this is just the little form inside it. */
	.status-detail-text {
		font-size: 0.8125rem;
	}

	.gate-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		max-width: 260px;
	}

	.gate-form input {
		width: 100%;
		padding: 0.5rem 0.625rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-size: 0.875rem;
	}

	.gate-submit {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: none;
		border-radius: var(--radius-md);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 0.875rem;
		font-weight: 650;
		cursor: pointer;
	}

	.gate-submit:disabled {
		opacity: 0.6;
		cursor: default;
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

	.segmented button:disabled {
		opacity: 0.4;
		cursor: default;
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

	/* Holds every drawer section so they can all be dimmed/`inert` as one
	   while the score re-engraves — keeps the drawer's own column gap. */
	.menu-body {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		transition: opacity 0.15s ease;
	}
	.menu-body--updating {
		opacity: 0.45;
		/* `inert` already blocks interaction; this is the belt-and-suspenders
		   visual + a guard for anything that ignores `inert`. */
		pointer-events: none;
	}

	.menu-updating {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: -0.375rem 0;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--surface-2);
		color: var(--text);
		font-size: 0.8125rem;
		font-weight: 650;
	}
	.menu-updating__dot {
		width: 0.55rem;
		height: 0.55rem;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--accent);
		animation: menu-updating-pulse 0.9s ease-in-out infinite;
	}
	@keyframes menu-updating-pulse {
		0%,
		100% {
			opacity: 0.35;
			transform: scale(0.75);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.menu-updating__dot {
			animation: none;
			opacity: 0.8;
		}
		.menu-body {
			transition: none;
		}
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

	/* F21: independent on/off markup-visibility toggles. */
	.markup-toggle {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.55rem 0.7rem;
		margin-bottom: 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}

	.markup-toggle:last-child {
		margin-bottom: 0;
	}

	.markup-toggle-box {
		flex: none;
		width: 1.1rem;
		height: 1.1rem;
		border: 2px solid var(--border);
		border-radius: 0.35rem;
		background: var(--surface-2);
	}

	.markup-toggle.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
	}

	.markup-toggle.active .markup-toggle-box {
		border-color: var(--accent);
		background: var(--accent);
		box-shadow: inset 0 0 0 3px var(--surface);
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

	/* Landscape phones have almost no vertical room, so the score gets
	   squeezed between the top and bottom chrome. Trim that chrome: cut the
	   top/bottom bar padding, drop the composer subtitle, and inline the
	   scrubber so its time readout sits beside the slider instead of on a
	   second stacked line. Scoped tight (landscape + very short viewport) so
	   portrait phones, tablets, and desktop keep the roomier layout. */
	@media (orientation: landscape) and (max-height: 500px) {
		.top-bar {
			padding-top: calc(0.15rem + env(safe-area-inset-top, 0px));
			padding-bottom: 0.15rem;
		}

		.top-bar-title p {
			display: none;
		}

		.top-bar-title h1 {
			font-size: 0.9rem;
		}

		.bottom-bar {
			padding-top: 0.2rem;
			padding-bottom: calc(0.2rem + env(safe-area-inset-bottom, 0px));
		}

		.scrubber {
			flex-direction: row;
			align-items: center;
			gap: 0.6rem;
		}

		.time-row {
			flex: 0 0 auto;
			justify-content: flex-start;
			gap: 0.35rem;
		}

		/* Shrink the bar controls so the bar height tracks the control, not
		   a 36/44px touch target. A deliberate density trade for landscape:
		   these are all secondary taps (back, menu, follow cursor, annotate)
		   plus the play button, which stays the largest of them. */
		.top-bar .icon-btn,
		.bottom-bar .icon-btn {
			width: 30px;
			height: 30px;
		}

		.top-bar .icon-btn svg,
		.bottom-bar .icon-btn svg {
			width: 18px;
			height: 18px;
		}

		.play-btn {
			width: 32px;
			height: 32px;
		}

		.play-btn svg {
			width: 16px;
			height: 16px;
		}
	}
</style>
