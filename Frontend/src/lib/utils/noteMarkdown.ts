// A small, deliberately-restricted "Markdown" renderer for free-text note
// fields (currently Weekly Notes' `body`) that are admin-written but shown
// to guests (`GroupPageSettings.audience === 'everyone'`). It supports just
// enough syntax to keep a piece-by-piece rehearsal recap readable —
// **bold** section headers, "- " bullet lists, blank-line paragraphs, and
// single newlines as line breaks — without pulling in a full Markdown
// library + HTML sanitizer.
//
// Safe by construction rather than by sanitizing afterwards: the raw text
// is HTML-escaped first, so the only tags that can ever end up in the
// output are the ones this function itself emits (`<p>`, `<br>`, `<ul>`,
// `<li>`, `<strong>`) — nothing in the input can inject markup.

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// **bold** — the only inline styling supported. Runs after escaping, so the
// `**` markers are always literal characters, never part of an entity.
function renderInline(escaped: string): string {
	return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isBulletLine(line: string): boolean {
	return /^[-*]\s+/.test(line.trim());
}

export function renderNoteMarkdown(source: string): string {
	const blocks = source.trim().split(/\n\s*\n/);
	return blocks
		.map((block) => {
			const lines = block.split('\n').filter((l) => l.trim().length > 0);
			if (lines.length === 0) return '';

			if (lines.every(isBulletLine)) {
				const items = lines
					.map((l) => `<li>${renderInline(escapeHtml(l.trim().replace(/^[-*]\s+/, '')))}</li>`)
					.join('');
				return `<ul>${items}</ul>`;
			}

			const html = lines.map((l) => renderInline(escapeHtml(l))).join('<br>');
			return `<p>${html}</p>`;
		})
		.filter((block) => block.length > 0)
		.join('');
}
