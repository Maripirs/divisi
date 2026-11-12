/** Location of the bundled `Bravura.woff2`: an http(s) URL in a browser, a file URL in Node. */
export declare const bravuraFontUrl: URL;
/**
 * Register a SMuFL font with the document and resolve once it is usable.
 *
 * With no `url` it loads the Bravura copy shipped with the package
 * (`bravuraFontUrl`), falling back to an inlined copy if the host's bundler
 * broke that URL. Pass a URL to serve the font from elsewhere, or to load a
 * different SMuFL font under `family`; a URL you pass that fails rejects.
 * Resolves to the family name to pass to `CanvasRenderer`'s `fontFamily`
 * option.
 */
export declare function loadSmuflFont(url?: string | URL, family?: string): Promise<string>;
