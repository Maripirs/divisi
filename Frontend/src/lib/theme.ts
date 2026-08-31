import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const THEME_MODES = ['system', 'light', 'dark', 'classic'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
// `classic` is a warm paper skin that stands alongside light/dark rather
// than under `system` — the OS only ever reports light or dark, so it can
// only be chosen explicitly. Score-rendering code branches on `=== 'dark'`
// and otherwise treats a theme as light-on-paper, which is exactly right
// for `classic`, so it needs no special-casing there.
export type ResolvedTheme = 'light' | 'dark' | 'classic';

const STORAGE_KEY = 'divisi.theme';

export interface ThemePalette {
	background: string;
	surface: string;
	ink: string;
	muted: string;
	accent: string;
}

export const THEME_PALETTES: Record<ResolvedTheme, ThemePalette> = {
	light: {
		background: '#f5f5fa',
		surface: '#ffffff',
		ink: '#16161f',
		muted: '#686b7a',
		accent: '#4f46e5'
	},
	dark: {
		background: '#121218',
		surface: '#1b1b23',
		ink: '#d8d9e6',
		muted: '#9a9aac',
		accent: '#818cf8'
	},
	classic: {
		background: '#e9e0cc',
		surface: '#faf4e4',
		ink: '#2b2418',
		muted: '#6d5f45',
		accent: '#8a4b2f'
	}
};

export function highlightedMutedInk(theme: ResolvedTheme): string {
	const palette = THEME_PALETTES[theme];
	return mixHex(palette.surface, palette.ink, theme === 'dark' ? 0.38 : 0.3);
}

function mixHex(from: string, to: string, amount: number): string {
	const a = parseHex(from);
	const b = parseHex(to);
	const mix = (start: number, end: number) => Math.round(start + (end - start) * amount);
	return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
	const value = hex.replace('#', '');
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16)
	};
}

function systemTheme(): ResolvedTheme {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function savedThemeMode(): ThemeMode {
	if (!browser) return 'system';
	const saved = window.localStorage.getItem(STORAGE_KEY);
	return THEME_MODES.includes(saved as ThemeMode) ? (saved as ThemeMode) : 'system';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
	return mode === 'system' ? systemTheme() : mode;
}

function applyTheme(mode: ThemeMode): void {
	if (!browser) return;
	const resolved = resolveTheme(mode);
	const palette = THEME_PALETTES[resolved];
	document.documentElement.dataset.themeMode = mode;
	document.documentElement.dataset.theme = resolved;
	// `color-scheme` only understands `light`/`dark`; `classic` is a
	// light-on-paper skin as far as native form controls are concerned.
	document.documentElement.style.colorScheme = resolved === 'dark' ? 'dark' : 'light';
	document.documentElement.style.setProperty('--palette-bg', palette.background);
	document.documentElement.style.setProperty('--palette-surface', palette.surface);
	document.documentElement.style.setProperty('--palette-ink', palette.ink);
	document.documentElement.style.setProperty('--palette-muted', palette.muted);
	document.documentElement.style.setProperty('--palette-accent', palette.accent);
}

export const themeMode = writable<ThemeMode>(savedThemeMode());
export const resolvedTheme = writable<ResolvedTheme>(resolveTheme(savedThemeMode()));

export function setThemeMode(mode: ThemeMode): void {
	if (!THEME_MODES.includes(mode)) return;
	if (browser) window.localStorage.setItem(STORAGE_KEY, mode);
	themeMode.set(mode);
	const resolved = resolveTheme(mode);
	resolvedTheme.set(resolved);
	applyTheme(mode);
}

export function initTheme(): () => void {
	if (!browser) return () => {};
	const media = window.matchMedia('(prefers-color-scheme: dark)');
	let currentMode = savedThemeMode();

	const unsubscribe = themeMode.subscribe((mode) => {
		currentMode = mode;
		applyTheme(mode);
		resolvedTheme.set(resolveTheme(mode));
	});

	const handleSystemChange = () => {
		if (currentMode !== 'system') return;
		applyTheme(currentMode);
		resolvedTheme.set(resolveTheme(currentMode));
	};

	media.addEventListener('change', handleSystemChange);
	return () => {
		media.removeEventListener('change', handleSystemChange);
		unsubscribe();
	};
}
