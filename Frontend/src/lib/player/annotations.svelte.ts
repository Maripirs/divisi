// F4: annotations. Private-by-default notes pinned to a score position
// (e.g. "breathe here"), rendered as markers by `ScoreView` and managed
// through `AnnotationSheet`. See `$lib/api/annotations.ts` for the Backend
// shape (B5) this all round-trips through.
//
// Round-2 cleanup step 4: lifted wholesale out of
// `routes/piece/[id]/+page.svelte`. This is the first *stateful* `.svelte.ts`
// composable in the repo (steps 1-3 only moved pure fns): same runes, same
// `$lib/...` imports, just a factory that owns the annotation list/sheet/
// shares `$state` and every CRUD/share call. External reads the moved code
// needs (`remoteMeta.pieceId`, `page.data.user`, `parsed.timeSignature`) are
// threaded in as getters rather than closed over. `remoteMeta`/`parsed` are
// assigned imperatively in the component (not `$state`), and getters keep
// this testable, matching how steps 1-2 passed params instead of importing
// module state.

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
import type { MIDITimeSignature } from '$lib/midi/types';
import { m } from '$lib/paraglide/messages';

export interface AnnotationControllerDeps {
	/** `remoteMeta?.pieceId`. Annotations only exist for a real Backend
	 * piece, `undefined` until `resolveRemote()` fills `remoteMeta` in. */
	pieceId: () => string | undefined;
	/** `page.data.user`, `undefined` for a guest/logged-out session. */
	currentUser: () => { id: string } | undefined;
	/** `parsed?.timeSignature`, `undefined` until `bootstrap()` parses the
	 * file (or for a PDF-only piece that never parses anything). */
	timeSignature: () => MIDITimeSignature | undefined;
}

// `null` closed; otherwise either a brand-new marker's position (create)
// or an existing annotation being viewed/edited.
type AnnotationSheetState =
	| { mode: 'create'; positionWholeNotes: number }
	| { mode: 'view'; annotation: Annotation }
	| null;

export function createAnnotationController(deps: AnnotationControllerDeps) {
	let annotations = $state<Annotation[]>([]);
	let annotateMode = $state(false);
	let annotationSheet = $state<AnnotationSheetState>(null);
	let annotationSaving = $state(false);
	let annotationError = $state<string | null>(null);
	let annotationShares = $state<AnnotationShare[]>([]);
	let annotationSharesLoading = $state(false);

	async function loadAnnotations() {
		const pieceId = deps.pieceId();
		if (!pieceId) return;
		try {
			// F20: personal "piece notes" are stored as position-less annotations
			// (position -1) and shown in the Piece Notes panel, not as score
			// markers. Keep only real, score-positioned annotations here.
			annotations = (await listAnnotations(pieceId)).filter((a) => a.positionWholeNotes >= 0);
		} catch {
			// A failed load just means no markers show yet, not worth a
			// blocking error state layered on top of the player's own. The
			// "add annotation" control still works and will surface its own
			// error if the Backend is genuinely unreachable.
		}
	}

	function annotationErrorMessage(err: unknown): string {
		return err instanceof AnnotationApiError ? err.message : m.errors_could_not_reach_server();
	}

	/** "Measure N" rather than a raw beat/whole-note count, matching how a
	 * singer actually talks about a spot in the music (and the fixture-era
	 * `AnnotationModal`'s own framing). Tempo-independent: `positionWholeNotes`
	 * (and thus the stored position) never changes when tempo is adjusted. */
	function measureLabel(wholeNotes: number): string {
		const timeSignature = deps.timeSignature();
		if (!timeSignature) return m.piece_annotation_position_generic();
		const { numerator, denominator } = timeSignature;
		const measureLenWholeNotes = numerator / denominator;
		const measureNumber = measureLenWholeNotes > 0 ? Math.floor(wholeNotes / measureLenWholeNotes) + 1 : 1;
		return m.piece_annotation_measure({ number: measureNumber });
	}

	function toggleAnnotateMode() {
		annotateMode = !annotateMode;
	}

	function openCreate(wholeNotes: number) {
		annotationError = null;
		annotationSheet = { mode: 'create', positionWholeNotes: wholeNotes };
		// One tap places one marker: mode stays off afterward rather than
		// lingering, so closing the sheet doesn't leave the score armed to
		// place a second one from a stray tap.
		annotateMode = false;
	}

	function openMarker(id: string) {
		const found = annotations.find((a) => a.id === id);
		if (!found) return;
		annotationError = null;
		annotationShares = [];
		annotationSheet = { mode: 'view', annotation: found };
		const user = deps.currentUser();
		if (user && found.userId === user.id) void loadShares(found.id);
	}

	async function loadShares(annotationId: string) {
		const pieceId = deps.pieceId();
		if (!pieceId) return;
		annotationSharesLoading = true;
		try {
			annotationShares = await listAnnotationShares(pieceId, annotationId);
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSharesLoading = false;
		}
	}

	function closeSheet() {
		annotationSheet = null;
		annotationError = null;
		annotationShares = [];
	}

	async function save(content: string) {
		const sheet = annotationSheet;
		const pieceId = deps.pieceId();
		if (!pieceId || sheet === null) return;
		annotationSaving = true;
		annotationError = null;
		try {
			if (sheet.mode === 'create') {
				const created = await createAnnotation(pieceId, sheet.positionWholeNotes, content);
				annotations = [...annotations, created];
			} else {
				const updated = await updateAnnotation(pieceId, sheet.annotation.id, { content });
				annotations = annotations.map((a) => (a.id === updated.id ? updated : a));
			}
			closeSheet();
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSaving = false;
		}
	}

	async function deleteCurrent() {
		// Snapshotted into a local rather than narrowed via repeated
		// `annotationSheet.mode` reads: `annotationSheet` is reactive
		// (`$state`), so a plain `const` capture is what TypeScript can
		// actually narrow reliably across the statements below.
		const sheet = annotationSheet;
		const pieceId = deps.pieceId();
		if (!pieceId || sheet === null || sheet.mode !== 'view') return;
		const id = sheet.annotation.id;
		annotationSaving = true;
		annotationError = null;
		try {
			await deleteAnnotation(pieceId, id);
			annotations = annotations.filter((a) => a.id !== id);
			closeSheet();
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		} finally {
			annotationSaving = false;
		}
	}

	async function share(email: string) {
		const sheet = annotationSheet;
		const pieceId = deps.pieceId();
		if (!pieceId || sheet === null || sheet.mode !== 'view') return;
		annotationError = null;
		try {
			const created = await shareAnnotation(pieceId, sheet.annotation.id, email);
			annotationShares = [...annotationShares, created];
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		}
	}

	async function unshare(userId: string) {
		const sheet = annotationSheet;
		const pieceId = deps.pieceId();
		if (!pieceId || sheet === null || sheet.mode !== 'view') return;
		annotationError = null;
		try {
			await unshareAnnotation(pieceId, sheet.annotation.id, userId);
			annotationShares = annotationShares.filter((s) => s.sharedWithUserId !== userId);
		} catch (err) {
			annotationError = annotationErrorMessage(err);
		}
	}

	// Local, non-`?.`-narrowed derivations for `AnnotationSheet`'s props,
	// same reasoning as the snapshot-to-`const` pattern above, applied to
	// `$derived` instead: reading `annotationSheet` once into `sheet` per
	// derivation is what lets TypeScript actually narrow it.
	const positionLabel = $derived.by(() => {
		const sheet = annotationSheet;
		if (sheet === null) return '';
		return measureLabel(sheet.mode === 'create' ? sheet.positionWholeNotes : sheet.annotation.positionWholeNotes);
	});
	const content = $derived.by(() => {
		const sheet = annotationSheet;
		return sheet !== null && sheet.mode === 'view' ? sheet.annotation.content : '';
	});
	const isOwner = $derived.by(() => {
		const sheet = annotationSheet;
		if (sheet === null || sheet.mode === 'create') return true;
		return deps.currentUser()?.id === sheet.annotation.userId;
	});

	return {
		get annotations() {
			return annotations;
		},
		get annotateMode() {
			return annotateMode;
		},
		get sheet() {
			return annotationSheet;
		},
		get shares() {
			return annotationShares;
		},
		get sharesLoading() {
			return annotationSharesLoading;
		},
		get saving() {
			return annotationSaving;
		},
		get error() {
			return annotationError;
		},
		get positionLabel() {
			return positionLabel;
		},
		get content() {
			return content;
		},
		get isOwner() {
			return isOwner;
		},
		loadAnnotations,
		toggleAnnotateMode,
		openCreate,
		openMarker,
		closeSheet,
		save,
		deleteCurrent,
		share,
		unshare
	};
}

export type AnnotationController = ReturnType<typeof createAnnotationController>;
