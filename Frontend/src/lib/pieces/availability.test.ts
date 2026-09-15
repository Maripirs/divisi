import { describe, expect, it } from 'vitest';
import { pieceAvailability, resourceCount } from './availability';
import type { Piece } from './types';

const bundledWithEverything: Piece = {
	id: 'bundled-full',
	title: 'Bundled Full',
	composer: 'Someone',
	collection: 'demo',
	pdfUrl: '/fixtures/bundled-full.pdf',
	load: async () => {
		throw new Error('not used in this test');
	}
};

describe('pieceAvailability', () => {
	it('reads player/reference/pdf off the Backend flags when there is no bundled fallback', () => {
		expect(pieceAvailability(true, true, 'https://youtu.be/x', undefined)).toEqual({
			hasPlayer: true,
			hasReference: true,
			hasPdf: true
		});
		expect(pieceAvailability(false, false, null, undefined)).toEqual({
			hasPlayer: false,
			hasReference: false,
			hasPdf: false
		});
	});

	it('counts a bundled fixture\'s own player/pdf/youtubeUrl even with every Backend flag false', () => {
		expect(pieceAvailability(false, false, null, bundledWithEverything)).toEqual({
			hasPlayer: true,
			hasReference: false,
			hasPdf: true
		});
	});

	it('treats a Backend flag and a bundled fallback as equivalent (either is enough)', () => {
		const bundledPdfOnly: Piece = { ...bundledWithEverything, load: undefined };
		expect(pieceAvailability(true, false, null, bundledPdfOnly).hasPlayer).toBe(true);
		expect(pieceAvailability(false, false, 'https://youtu.be/x', undefined).hasReference).toBe(true);
	});
});

describe('resourceCount', () => {
	it('counts all three flags', () => {
		expect(resourceCount({ hasPlayer: true, hasReference: true, hasPdf: true })).toBe(3);
		expect(resourceCount({ hasPlayer: false, hasReference: false, hasPdf: false })).toBe(0);
	});

	it('ranks a piece with all three resources above one with two', () => {
		const full = resourceCount(pieceAvailability(true, true, 'https://youtu.be/x', undefined));
		const partial = resourceCount(pieceAvailability(true, true, null, undefined));
		expect(full).toBeGreaterThan(partial);
	});

	it('is usable as a stable descending sort key that preserves input order among ties', () => {
		const pieces = [
			{ id: 'a', count: 2 },
			{ id: 'b', count: 2 },
			{ id: 'c', count: 3 },
			{ id: 'd', count: 0 },
			{ id: 'e', count: 2 }
		];
		const sorted = [...pieces].sort((x, y) => y.count - x.count);
		expect(sorted.map((p) => p.id)).toEqual(['c', 'a', 'b', 'e', 'd']);
	});
});
