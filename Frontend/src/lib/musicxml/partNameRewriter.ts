/**
 * Rewrites a MusicXML file's `<part-name>` text for one or more parts, by
 * id, without a full parse/re-serialize round trip. Used by the review
 * flow (`piece/[id]/review`) to write a human's part-confirmation choices
 * back into the file before it's re-parsed and approved.
 *
 * Deliberately NOT `DOMParser`/`XMLSerializer` round-tripped -- serializing
 * a re-parsed document risks dropping the `<!DOCTYPE>` declaration (a known
 * `XMLSerializer` gap) and reformats the whole file for no benefit. Instead,
 * each assignment is applied with a targeted regex over the raw text: find
 * the `<score-part id="...">...</score-part>` block for that id (these
 * elements don't nest, so a non-greedy match between the opening tag and the
 * next `</score-part>` is safe) and, within just that span, replace the
 * `<part-name>` element's text and strip any `print-object="no"` on it so
 * the corrected name also renders on the score, not just internally.
 */

export interface PartNameAssignment {
	partId: string;
	label: string;
}

/** Escapes a string for safe interpolation into a `RegExp` source -- `partId`
 * comes from the file itself, so it could in principle contain regex-special
 * characters even though real MusicXML ids never do in practice. */
function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Minimal XML text-content escaping -- covers the three characters that are
 * ever unsafe inside element text (`&`, `<`, `>`); a label is always a short
 * plain voice-part name, never markup, so nothing fancier is needed. */
function escapeXmlText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function applyPartNameAssignments(xmlText: string, assignments: PartNameAssignment[]): string {
	let result = xmlText;

	for (const { partId, label } of assignments) {
		const scorePartRegex = new RegExp(
			`(<score-part\\s+id="${escapeRegExp(partId)}"[^>]*>)([\\s\\S]*?)(<\\/score-part>)`
		);
		const match = scorePartRegex.exec(result);
		if (!match) continue; // no such part in this file -- ignore rather than fail the whole rewrite

		const [full, openTag, body, closeTag] = match;
		const escapedLabel = escapeXmlText(label);
		const partNameRegex = /<part-name\b([^>]*)>[\s\S]*?<\/part-name>/;
		const partNameMatch = partNameRegex.exec(body);

		let newBody: string;
		if (partNameMatch) {
			// Strip any `print-object="no"` so the corrected name actually
			// renders on the score -- not just resolvable internally.
			const attrs = partNameMatch[1].replace(/\s*print-object="no"/g, '');
			newBody = body.slice(0, partNameMatch.index) + `<part-name${attrs}>${escapedLabel}</part-name>` + body.slice(partNameMatch.index + partNameMatch[0].length);
		} else {
			// Defensive only -- MusicXML's schema requires every `<score-part>`
			// to have a `<part-name>` child, so a real file always matches
			// above. Insert one as the first child if it's somehow missing.
			newBody = `<part-name>${escapedLabel}</part-name>` + body;
		}

		result = result.slice(0, match.index) + openTag + newBody + closeTag + result.slice(match.index + full.length);
	}

	return result;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number -> scientific pitch notation, e.g. 60 -> "C4" (middle
 * C), same convention `notation/voicePartAssignment.ts`'s pitch math already
 * assumes (no existing octave-numbering helper in the codebase to match
 * against otherwise). */
export function midiPitchToNoteName(pitch: number): string {
	const octave = Math.floor(pitch / 12) - 1;
	const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
	return `${name}${octave}`;
}
