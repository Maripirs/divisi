// Same reasoning as `piece/[id]/+page.ts`: this page renders `ScoreView`
// (OSMD) and `PdfView` (pdf.js), both browser-only. Without this, SSR hits
// a real crash -- `ScoreView`'s `onDestroy` (unlike `onMount`, not
// automatically browser-only in Svelte) touches `window` directly, which
// doesn't exist during server-side rendering. `+page.server.ts`'s `load`
// still runs (server load isn't disabled by this) and supplies `data` here
// unchanged.
export const ssr = false;
