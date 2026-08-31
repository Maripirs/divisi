// Two-finger pinch-to-zoom, shared by `ScoreView` and `PdfView`. Both render
// their content into a scroll container with our own +/− zoom controls, and
// both need a pinch gesture that drives the *same* `zoom` number those buttons
// do — a component-local zoom, never the browser's native pinch. Native
// pinch-zoom is a whole-page camera pass that would scale the app's anchored
// top/bottom bars along with the score/PDF, so each container disables it via
// `touch-action` in its own stylesheet and hands the gesture here instead.
//
// Commits are throttled to one per animation frame: writing straight into
// `zoom` on every `touchmove` would trigger a full OSMD / pdf.js re-render
// dozens of times a second.
//
// `onPan` is optional — `ScoreView` passes it to disengage its auto
// cursor-follow the moment a one-finger drag starts (the human is clearly
// looking elsewhere on purpose); `PdfView` has nothing to disengage and omits
// it.

import type { Action } from 'svelte/action';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;

/** Clamp to the zoom range and round to whole percent — the exact expression
 * both the pinch gesture and the +/− buttons use, so a value from either path
 * lands on the same grid. */
export function clampZoom(value: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

export interface PinchZoomParams {
	/** Current zoom, read at gesture start to scale from. */
	zoom: number;
	/** Commit a new (already-clamped) zoom value. */
	onZoom: (zoom: number) => void;
	/** Called when a one-finger drag begins — a manual scroll/pan, not a pinch. */
	onPan?: () => void;
}

function touchDistance(touches: TouchList): number {
	return Math.hypot(
		touches[1].clientX - touches[0].clientX,
		touches[1].clientY - touches[0].clientY
	);
}

export const pinchZoom: Action<HTMLElement, PinchZoomParams> = (node, params) => {
	let current = params;
	let pinchState: { initialDistance: number; initialZoom: number } | null = null;
	let pinchRaf: number | null = null;
	let pendingZoom: number | null = null;

	function handleTouchStart(event: TouchEvent): void {
		if (event.touches.length !== 2) {
			pinchState = null;
			return;
		}
		pinchState = { initialDistance: touchDistance(event.touches), initialZoom: current.zoom };
	}

	function handleTouchMove(event: TouchEvent): void {
		if (event.touches.length === 1) {
			current.onPan?.();
			return;
		}
		if (!pinchState || event.touches.length !== 2) return;
		event.preventDefault();
		const scale = touchDistance(event.touches) / pinchState.initialDistance;
		pendingZoom = clampZoom(pinchState.initialZoom * scale);
		if (pinchRaf === null) {
			pinchRaf = requestAnimationFrame(() => {
				pinchRaf = null;
				if (pendingZoom !== null) current.onZoom(pendingZoom);
			});
		}
	}

	function handleTouchEnd(event: TouchEvent): void {
		if (event.touches.length >= 2) return;
		pinchState = null;
		if (pinchRaf !== null) {
			cancelAnimationFrame(pinchRaf);
			pinchRaf = null;
		}
		if (pendingZoom !== null) {
			current.onZoom(pendingZoom);
			pendingZoom = null;
		}
	}

	node.addEventListener('touchstart', handleTouchStart, { passive: true });
	node.addEventListener('touchmove', handleTouchMove, { passive: false });
	node.addEventListener('touchend', handleTouchEnd);
	node.addEventListener('touchcancel', handleTouchEnd);

	return {
		update(next: PinchZoomParams) {
			current = next;
		},
		destroy() {
			node.removeEventListener('touchstart', handleTouchStart);
			node.removeEventListener('touchmove', handleTouchMove);
			node.removeEventListener('touchend', handleTouchEnd);
			node.removeEventListener('touchcancel', handleTouchEnd);
			if (pinchRaf !== null) cancelAnimationFrame(pinchRaf);
		}
	};
};
