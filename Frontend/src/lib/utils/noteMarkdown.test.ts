import { describe, expect, it } from 'vitest';
import { renderNoteMarkdown } from './noteMarkdown';

describe('renderNoteMarkdown', () => {
	it('renders a bold section header', () => {
		expect(renderNoteMarkdown('**Sopranos**')).toBe('<p><strong>Sopranos</strong></p>');
	});

	it('renders a bullet list', () => {
		expect(renderNoteMarkdown('- Measure 12\n- Measure 30')).toBe(
			'<ul><li>Measure 12</li><li>Measure 30</li></ul>'
		);
	});

	it('renders a plain link', () => {
		expect(renderNoteMarkdown('[the score](https://example.com/score.pdf)')).toBe(
			'<p><a href="https://example.com/score.pdf" target="_blank" rel="noopener noreferrer">the score</a></p>'
		);
	});

	it('renders an http and a mailto link', () => {
		expect(renderNoteMarkdown('[insecure](http://example.com)')).toBe(
			'<p><a href="http://example.com" target="_blank" rel="noopener noreferrer">insecure</a></p>'
		);
		expect(renderNoteMarkdown('[email us](mailto:choir@example.com)')).toBe(
			'<p><a href="mailto:choir@example.com" target="_blank" rel="noopener noreferrer">email us</a></p>'
		);
	});

	it('renders a link inside a bullet', () => {
		expect(renderNoteMarkdown('- See [the score](https://example.com/score.pdf) before Tuesday')).toBe(
			'<ul><li>See <a href="https://example.com/score.pdf" target="_blank" rel="noopener noreferrer">the score</a> before Tuesday</li></ul>'
		);
	});

	it('does not render a javascript: link as a clickable/executable anchor', () => {
		const html = renderNoteMarkdown('[click me](javascript:alert(1))');
		expect(html).not.toContain('<a ');
		expect(html).toContain('[click me](javascript:alert(1))');
	});

	it('does not render a data: link as a clickable anchor', () => {
		const html = renderNoteMarkdown('[click me](data:text/html,<script>alert(1)</script>)');
		expect(html).not.toContain('<a ');
	});

	it('renders a link adjacent to bold text, both intact', () => {
		expect(
			renderNoteMarkdown('**Reminder:** bring [the score](https://example.com/score.pdf)')
		).toBe(
			'<p><strong>Reminder:</strong> bring <a href="https://example.com/score.pdf" target="_blank" rel="noopener noreferrer">the score</a></p>'
		);
	});

	it('escapes a quote in the url so it cannot break out of the href attribute', () => {
		const html = renderNoteMarkdown('[weird](https://example.com/"quote)');
		// The quote survives only as the inert &quot; entity inside href="...",
		// never as a literal " that could close the attribute early.
		expect(html).toContain('href="https://example.com/&quot;quote"');
	});
});
