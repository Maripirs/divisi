// `use:enhance` callbacks in this app almost all set a "submitting" flag
// for the request's lifetime, then optionally run one line of cleanup
// (close an inline editor, clear a draft). This helper collapses the ~25
// hand-written copies of that down to a single expression:
//
//   withSubmitting((v) => (saving = v))
//   withSubmitting((v) => (saving = v), () => (editingId = null))
//
// Forms that need `update({ reset: false })`, or that branch on
// `result.type` (see `SettingsDrawer.svelte`), still write the callback
// inline — those aren't this pattern.

import type { SubmitFunction } from '@sveltejs/kit';

/**
 * Flip a "submitting" boolean for the lifetime of the request, then
 * optionally run some cleanup (close an inline editor, clear a
 * "confirm delete" flag) before applying the result with the default
 * `update()`. Cleanup runs before `update()`, matching the inline
 * versions this replaces.
 */
export function withSubmitting(
	set: (value: boolean) => void,
	onSettled?: () => void
): SubmitFunction {
	return () => {
		set(true);
		return async ({ update }) => {
			set(false);
			onSettled?.();
			await update();
		};
	};
}
