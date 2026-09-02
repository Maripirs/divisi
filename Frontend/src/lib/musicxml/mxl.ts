/**
 * `.mxl` is compressed MusicXML: a ZIP archive holding one score document
 * plus a `META-INF/container.xml` that names it. The music-file entry
 * point in this app (the player's `loadRemoteMusicFile`) works on plain
 * MusicXML *text*, so this unpacks an `.mxl` payload to that text before it
 * reaches `DOMParser` / the parser.
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

/** Post-decode BOM strip: removes a leading U+FEFF the decode left in the
 * string (some exporters, Sibelius among them, prepend one), which otherwise
 * makes `DOMParser` reject the document as junk before the prolog. This runs
 * *after* decoding, so it can only clean up a UTF-8 BOM's code point, not
 * undo a wrong-encoding decode: `decodeXmlText` handles the UTF-16 case
 * before it gets here. */
function stripBom(text: string): string {
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Decode a score entry's bytes to text. A UTF-16 document (historically
 * common out of Finale / Sibelius) opens with a byte-order mark, `FF FE`
 * little-endian or `FE FF` big-endian; decode it with the matching
 * `TextDecoder` instead of assuming UTF-8, which would turn the whole
 * document into replacement characters and fail `DOMParser`. Anything else
 * is decoded as UTF-8. */
function decodeXmlText(bytes: Uint8Array): string {
	if (bytes.length >= 2) {
		if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
		if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
	}
	return strFromU8(bytes);
}

/** Resolve `container.xml`'s raw `full-path` against the archive's real entry
 * names. Real exports write `./score.xml`, backslash separators, or
 * percent-encoded characters, none of which match a raw-key lookup. Normalize
 * (drop a leading `./`, `\` -> `/`, percent-decode), then match an entry
 * case-insensitively by full path, then by trailing path, then by a unique
 * basename. Returns the entry name, or null so the caller can fall through to
 * the first-score-entry heuristic. */
function resolveRootEntry(names: string[], rawPath: string): string | null {
	let want = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
	try {
		want = decodeURIComponent(want);
	} catch {
		// Not valid percent-encoding: match against the raw string instead.
	}
	const wantLower = want.toLowerCase();
	const wantBase = wantLower.split('/').pop() ?? wantLower;
	const norm = (n: string) => n.replace(/\\/g, '/').toLowerCase();

	let hit = names.find((n) => norm(n) === wantLower);
	if (!hit) hit = names.find((n) => norm(n).endsWith(`/${wantLower}`));
	if (!hit) {
		const byBase = names.filter((n) => (norm(n).split('/').pop() ?? '') === wantBase);
		if (byBase.length === 1) hit = byBase[0];
	}
	return hit ?? null;
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
		if (rootPath) {
			const entry = files[rootPath] ? rootPath : resolveRootEntry(names, rootPath);
			if (entry && files[entry]) {
				return stripBom(decodeXmlText(files[entry]));
			}
		}
	}

	// Fallback: the first score-looking entry outside META-INF/ (matches the
	// Backend's heuristic).
	const inner = names.find(
		(n) => !/^meta-inf\//i.test(n) && /\.(musicxml|xml)$/i.test(n)
	);
	if (inner) {
		return stripBom(decodeXmlText(files[inner]));
	}

	throw new Error('Compressed MusicXML (.mxl) had no root score document');
}
