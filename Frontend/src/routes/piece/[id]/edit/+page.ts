// The notation editor renders with OSMD and re-uses the client-side synth
// for playback preview. Both need browser APIs, so, like the player route,
// this one stays client-rendered. `+page.server.ts`'s `load` still runs
// (server load isn't disabled by this): that's where edit access is gated
// before the page renders. Nothing left for this file to add.
export const ssr = false;
