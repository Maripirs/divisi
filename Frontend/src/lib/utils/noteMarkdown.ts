// A small, deliberately-restricted "Markdown" renderer for free-text note
// fields (currently Weekly Notes' `body`) that are admin-written but shown
// to guests (`GroupPageSettings.audience === 'everyone'`). It supports just
// enough syntax to keep a piece-by-piece rehearsal recap readable —
// **bold** section headers, "- " bullet lists, blank-line paragraphs,
// [text](url) links, and single newlines as line breaks — without pulling
// in a full Markdown library + HTML sanitizer.
//
// Safe by construction rather than by sanitizing afterwards: the raw text
// is HTML-escaped first, so the only tags that can ever end up in the
// output are the ones this function itself emits (`<p>`, `<br>`, `<ul>`,
// `<li>`, `<strong>`, `<a>`) — nothing in the input can inject markup.

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const LINK_SCHEME_RE = /^(?:https?:\/\/|mailto:)/i;

// **bold** and [text](url) — the only inline styling supported. Both run
// after escaping, so their marker characters (`**`, `[`, `]`, `(`, `)`) are
// always literal, never part of an entity.
//
// Link scheme is allowlisted to http:/https:/mailto: — anything else
// (`javascript:`, `data:`, ...) is left as the original escaped
// `[text](url)` text rather than becoming a clickable/executable link, so
// there's no dedicated "malicious link" case to sanitize, just one to
// not-render. The href itself doesn't need a second escaping pass: `escaped`
// already ran through `escapeHtml` before `renderInline` sees it, so a
// literal `"` in the url is already the inert `&quot;` entity and can't
// break out of the `href="..."` attribute. `target`/`rel` are still added
// as defense in depth, since this content can render to guests reading
// admin-authored notes.
function renderInline(escaped: string): string {
	const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	return withBold.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
		if (!LINK_SCHEME_RE.test(url)) return match;
		return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
	});
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
