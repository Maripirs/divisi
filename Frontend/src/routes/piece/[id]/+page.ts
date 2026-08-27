import type { PageLoad } from './$types';

// Audio synthesis, MIDI parsing, and OSMD notation rendering need browser
// APIs, so the player route stays client-rendered.
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ id: params.id });
