import type { Score } from '../model/score.js';
import { type ImportOptions } from './musicxml-import.js';
/** The raw bytes of a MusicXML or `.mxl` file. */
export type MusicXmlBytes = ArrayBuffer | Uint8Array;
/**
 * Import a MusicXML file given as bytes: a compressed `.mxl` archive or plain
 * (uncompressed) MusicXML text. Resolves to the same `Score` that
 * `importMusicXml` returns for the score's text, and takes the same options.
 *
 * Rejects when the bytes are neither a zip archive nor XML text, when the
 * archive holds no score file, or when it uses a feature the reader does not
 * support (encryption, zip64, a compression method other than stored or
 * deflate). Errors `importMusicXml` raises for the XML itself pass through.
 */
export declare function importMxl(bytes: MusicXmlBytes, options?: ImportOptions): Promise<Score>;
/**
 * The score's MusicXML text from the bytes of a `.mxl` archive or of a plain
 * MusicXML file, without importing it. The root file is the one
 * `META-INF/container.xml` names, else the first `.musicxml`/`.xml` entry
 * outside `META-INF/`. Rejects as `importMxl` does.
 */
export declare function readMxl(bytes: MusicXmlBytes): Promise<string>;
