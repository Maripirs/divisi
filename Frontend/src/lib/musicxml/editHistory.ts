/**
 * F18: the notation editor's undo / redo stack.
 *
 * Every edit in `edit/+page.svelte` already ends by re-serializing the working
 * model to a MusicXML string (`workingXml = score.serialize()`), so undo needs
 * no command log and no inverse operations: it keeps a bounded stack of those
 * serialized snapshots and, to undo, hands back the previous one for the page
 * to rebuild an `EditableScore` from. Redo is the mirror stack, cleared the
 * moment a fresh edit is recorded.
 *
 * A snapshot is a whole-score MusicXML document (tens of KB for a multi-page
 * score), so the stack is capped and the oldest entries fall off. The cap is a
 * memory bound, not a UX promise, hence the generous default.
 */
export class EditHistory {
	private undoStack: string[] = [];
	private redoStack: string[] = [];
	private readonly limit: number;

	constructor(limit = 60) {
		this.limit = Math.max(1, limit);
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/** Record the state about to be replaced by an edit. Drops the oldest
	 * snapshot once the cap is exceeded and clears the redo stack (a new edit
	 * branches away from any undone history). */
	record(snapshot: string): void {
		this.undoStack.push(snapshot);
		if (this.undoStack.length > this.limit) this.undoStack.shift();
		this.redoStack = [];
	}

	/** Pop the previous snapshot, pushing `current` onto the redo stack.
	 * Returns `undefined` when there is nothing to undo. */
	undo(current: string): string | undefined {
		const previous = this.undoStack.pop();
		if (previous === undefined) return undefined;
		this.redoStack.push(current);
		return previous;
	}

	/** Pop the next snapshot, pushing `current` back onto the undo stack.
	 * Returns `undefined` when there is nothing to redo. */
	redo(current: string): string | undefined {
		const next = this.redoStack.pop();
		if (next === undefined) return undefined;
		this.undoStack.push(current);
		return next;
	}

	/** Forget all history — on a fresh score load. */
	reset(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}
