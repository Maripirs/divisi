/** Shared OpenSheetMusicDisplay setup for the two score mounts —
 * `ScoreView.svelte` (playback) and `EditorScoreView.svelte` (notation
 * editor). Only the genuinely common bits live here; each component still
 * owns its cursor/marker wiring and its own theme resolution. */

/** The three colours both mounts feed OSMD, already resolved from the
 * active theme by the caller (they resolve it differently — a
 * `DisplayMode`-aware palette vs. a straight `THEME_PALETTES` lookup). */
export interface OsmdColors {
	/** Noteheads, stems, staff lines, most engraved ink. */
	ink: string;
	/** Rests and text labels — a step back from `ink`. */
	muted: string;
	/** The page/canvas background behind the engraving. */
	page: string;
}

/** The OSMD constructor options common to both mounts: no title, no
 * built-in follow/resize surprises, colouring on so the caller can tint
 * ink/rests per theme. Spread this and add the mount-specific keys
 * (`cursorsOptions`, and `backend: 'svg'` for the editor). */
export function baseOsmdOptions(colors: OsmdColors) {
	return {
		autoResize: true,
		drawTitle: false,
		followCursor: false,
		coloringEnabled: true,
		colorStemsLikeNoteheads: true,
		defaultColorMusic: colors.ink,
		defaultColorNotehead: colors.ink,
		defaultColorStem: colors.ink,
		defaultColorRest: colors.muted,
		defaultColorLabel: colors.muted,
		pageBackgroundColor: colors.page
	};
}

/** Drop OSMD's default `warn` log level to `error`. `warn` floods the
 * console with harmless engraving noise on real scores
 * ("SkyBottomLineCalculator: width not > 0 in measure N" — a narrow/empty
 * bar it recovers from with a fallback width); `error` still surfaces
 * genuine failures. Call once, right after construction. */
export function quietOsmdLogging(osmd: { setLogLevel(level: string): void }): void {
	osmd.setLogLevel('error');
}
