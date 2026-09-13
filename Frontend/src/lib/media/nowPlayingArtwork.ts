import { get } from 'svelte/store';
import { resolvedTheme, THEME_PALETTES } from '$lib/theme';
import logoMask from '$lib/assets/divisi-logo-mask.png';

/** Square size (px) requested for MediaSession artwork. Matches the source
 * logo mask's own resolution (so painting it never upscales), and is well
 * above what iOS actually renders on a lock screen. */
const ARTWORK_SIZE = 512;

let cachedLogoArtwork: Promise<string> | undefined;

/**
 * Renders the Divisi logo (the same accent-tinted mask `Logo.svelte` paints
 * via CSS) onto an opaque square canvas, for use as Now Playing lock-screen
 * artwork when there's no PDF to pull a segment from.
 *
 * This exists because leaving `MediaMetadata.artwork` unset entirely made
 * iOS Safari fall back to the page's `/favicon.ico` — a 32x32 icon that
 * comes out badly pixelated once the lock screen blows it up to fill its
 * artwork tile.
 *
 * Cached after the first call: the mask image and the resolved theme at
 * call time don't change mid-session, so there's no reason to re-decode and
 * re-paint on every track change.
 */
export function getLogoArtworkDataUrl(): Promise<string> {
	if (!cachedLogoArtwork) cachedLogoArtwork = renderLogoArtwork();
	return cachedLogoArtwork;
}

async function renderLogoArtwork(): Promise<string> {
	const palette = THEME_PALETTES[get(resolvedTheme)];
	const image = await loadImage(logoMask);
	const canvas = document.createElement('canvas');
	canvas.width = ARTWORK_SIZE;
	canvas.height = ARTWORK_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return '';

	// Rounded-square backdrop in the theme's surface color, echoing
	// Logo.svelte's `border-radius: 22%` app-icon treatment — an opaque
	// background rather than a transparent one, since the lock screen has
	// no page behind it to show through.
	ctx.fillStyle = palette.surface;
	roundedRectPath(ctx, 0, 0, ARTWORK_SIZE, ARTWORK_SIZE, ARTWORK_SIZE * 0.22);
	ctx.fill();

	// Paint the mask's shape in the accent color: draw the mask, then keep
	// only the accent fill where the mask was opaque (`source-in`) — the
	// canvas equivalent of Logo.svelte's `mask-image` + `background-color`.
	const inset = ARTWORK_SIZE * 0.18;
	const drawSize = ARTWORK_SIZE - inset * 2;
	ctx.drawImage(image, inset, inset, drawSize, drawSize);
	ctx.globalCompositeOperation = 'source-in';
	ctx.fillStyle = palette.accent;
	ctx.fillRect(inset, inset, drawSize, drawSize);
	ctx.globalCompositeOperation = 'source-over';

	return canvas.toDataURL('image/png');
}

function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void {
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + width, y, x + width, y + height, radius);
	ctx.arcTo(x + width, y + height, x, y + height, radius);
	ctx.arcTo(x, y + height, x, y, radius);
	ctx.arcTo(x, y, x + width, y, radius);
	ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`failed to load ${src}`));
		img.src = src;
	});
}

/**
 * Crops a square segment from the top of an already-rendered PDF page
 * canvas (the title and first system, typically) and downscales it to
 * `size`x`size`, for use as Now Playing lock-screen artwork.
 *
 * A crop rather than a shrunk full page: sheet music pages are tall and
 * narrow, so squeezing an entire page into a square thumbnail would come
 * out too small to read anything on a lock screen — a recognizable segment
 * reads far better than the whole page in miniature.
 *
 * Returns `undefined` if the canvas hasn't actually rendered anything yet
 * (zero-sized), so the caller can fall back to the logo instead.
 */
export function cropPageArtwork(source: HTMLCanvasElement, size = ARTWORK_SIZE): string | undefined {
	if (!source.width || !source.height) return undefined;
	const cropSize = Math.min(source.width, source.height);
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return undefined;
	// A scanned page's margins are usually white, but fill explicitly rather
	// than trust that — an opaque background beats a transparent one showing
	// whatever the lock screen paints behind it.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, size, size);
	ctx.drawImage(source, 0, 0, cropSize, cropSize, 0, 0, size, size);
	return canvas.toDataURL('image/jpeg', 0.85);
}
