import { m } from '$lib/paraglide/messages';
import type { VoicePart } from '$lib/midi/types';
import type { SectionFilter } from './sections';

/** Display labels for section tags, kept apart from `sections.ts` so that
 * module stays free of message imports. Reuses the player's voice labels. */
export const VOICE_PART_LABELS: Record<VoicePart, () => string> = {
	soprano: m.voice_soprano,
	alto: m.voice_alto,
	tenor: m.voice_tenor,
	bass: m.voice_bass
};

export function sectionFilterLabel(filter: SectionFilter): string {
	return filter === 'everyone' ? m.notes_sections_everyone() : VOICE_PART_LABELS[filter]();
}
