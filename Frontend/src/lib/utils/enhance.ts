// `use:enhance` callbacks in this app almost all follow one of two shapes.
// These two helpers collapse the ~30 hand-written copies down to a single
// expression each.
//
//   withSubmitting((v) => (saving = v))
//   withSubmitting((v) => (saving = v), () => (editingId = null))
//   afterSubmit(() => (confirmingDeleteId = null))
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

/**
 * No in-flight flag — just run some cleanup once the action resolves, then
 * `update()`. Used by the click-to-confirm delete forms, which only need
 * to drop their "confirming" state.
 */
export function afterSubmit(onSettled: () => void): SubmitFunction {
	return () => async ({ update }) => {
		onSettled();
		await update();
	};
}
