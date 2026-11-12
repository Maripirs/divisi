/** Which engraver draws the score views. `'osmd'` (OpenSheetMusicDisplay)
 * is the shipped one; `'engine'` is notation-engine, the from-scratch
 * replacement being A/B tested behind `?renderer=engine` (see
 * `EngineScoreView.svelte`). */
export type ScoreRenderer = 'osmd' | 'engine';

/** `?renderer=engine` opts a page into notation-engine; anything else
 * (absent, empty, a typo) keeps OSMD, so the flag can never break the
 * default path. */
export function scoreRendererFromUrl(url: URL): ScoreRenderer {
	return url.searchParams.get('renderer') === 'engine' ? 'engine' : 'osmd';
}

/** Any `renderer` param, even `?renderer=osmd`, marks a test session: the
 * page then labels which tools make the sound and the picture (see
 * `RenderSourceBadge`), so an OSMD baseline is labelled as clearly as the
 * engine. Without it nothing extra shows. */
export function showRenderSources(url: URL): boolean {
	return url.searchParams.has('renderer');
}
