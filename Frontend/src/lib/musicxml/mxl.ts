/**
 * `.mxl` is compressed MusicXML: a ZIP archive holding one score document
 * plus a `META-INF/container.xml` that names it. Every music-file entry
 * point in this app (`loadEditableScore`, the player's
 * `loadRemoteMusicFile`) works on plain MusicXML *text*, so this unpacks an
 * `.mxl` payload to that text before it reaches `DOMParser` / the parser.
 *
 * Mirrors the Backend's own `.mxl` handling in
 * `Backend/app/omr/pipeline.py` (`_normalize_to_musicxml`), which the OMR
 * runner uses on Audiveris output — the difference is this one reads
 * `container.xml` for the exact rootfile rather than guessing the first
 * non-`META-INF/` `.xml`, then falls back to that same guess.
 */
import { strFromU8, unzipSync } from 'fflate';

/** The local-file-header signature every ZIP (and so every `.mxl`) starts
 * with: `PK\x03\x04`. */
export function isMxl(bytes: Uint8Array): boolean {
	return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** UTF-8/UTF-16 BOM strip — some exporters (Sibelius) prepend one, and it
 * makes `DOMParser` reject the document as junk before the prolog. */
function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Pulls the score document out of an `.mxl` archive and returns it as
 * MusicXML text.
 *
 * @throws {Error} when the archive holds no readable score document.
 */
export function extractMusicXmlText(bytes: Uint8Array): string {
	const files = unzipSync(bytes);
	const names = Object.keys(files);

	// Preferred path: container.xml points straight at the rootfile.
	const containerName = names.find((n) => n.toLowerCase() === 'meta-inf/container.xml');
	if (containerName) {
		const container = strFromU8(files[containerName]);
		const rootPath = /<rootfile[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(container)?.[1];
		if (rootPath && files[rootPath]) {
			return stripBom(strFromU8(files[rootPath]));
		}
	}

	// Fallback: the first score-looking entry outside META-INF/ (matches the
	// Backend's heuristic).
	const inner = names.find(
		(n) => !/^meta-inf\//i.test(n) && /\.(musicxml|xml)$/i.test(n)
	);
	if (inner) {
		return stripBom(strFromU8(files[inner]));
	}

	throw new Error('Compressed MusicXML (.mxl) had no root score document');
}
