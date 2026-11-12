/**
 * One element node. The tree is fully immutable: every array and record is
 * frozen at build time so a consumer can walk it freely without defensive
 * copies. Text-only content lives in `text`; there are no separate text nodes,
 * because nothing in MusicXML needs to know *where* between two child elements
 * a whitespace run sat.
 */
export interface XmlElement {
    readonly name: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly children: readonly XmlElement[];
    /** Concatenated direct text content, entity-decoded, whitespace preserved.
     *  Text inside descendant elements is not included; only character data that
     *  is an immediate child of this element. */
    readonly text: string;
}
/**
 * Parse `source` and return its single root element.
 *
 * Throws on anything that is not well-formed: an unclosed tag, a close tag that
 * does not match the currently open element, a document with no element at all,
 * or a stray `<` that does not begin a valid construct.
 */
export declare function parseXml(source: string): XmlElement;
/**
 * Decode the five predefined XML entities plus numeric character references
 * (`&#NN;` decimal, `&#xNN;` hex). An unrecognized `&...;` run is left verbatim
 * rather than throwing: a stray ampersand in a real-world file should not sink
 * an import, and the export side already escapes everything it emits.
 */
export declare function decodeEntities(text: string): string;
/** The first direct child element named `name`, or `undefined`. */
export declare function child(el: XmlElement, name: string): XmlElement | undefined;
/** Every direct child element named `name`, in document order. */
export declare function children(el: XmlElement, name: string): XmlElement[];
/** The text of the first direct child named `name`, trimmed, or `undefined` if
 *  there is no such child. An empty/whitespace-only child yields `''`. */
export declare function childText(el: XmlElement, name: string): string | undefined;
/** Every descendant element named `name`, at any depth, in document order. */
export declare function descendants(el: XmlElement, name: string): XmlElement[];
