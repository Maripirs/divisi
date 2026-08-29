// Audio synthesis, MIDI parsing, and OSMD notation rendering need browser
// APIs, so the player route stays client-rendered. `+page.server.ts`'s
// `load` still runs (server load isn't disabled by this) and supplies
// `data` here unchanged — nothing left for this file to add.
export const ssr = false;
