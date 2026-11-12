import { describe, expect, it } from 'vitest';
import { scoreRendererFromUrl, showRenderSources } from './scoreRenderer';

const at = (query: string) => new URL(`https://divisi.test/piece/abc${query}`);

describe('scoreRendererFromUrl', () => {
	it('picks the engine only for renderer=engine', () => {
		expect(scoreRendererFromUrl(at('?renderer=engine'))).toBe('engine');
		expect(scoreRendererFromUrl(at('?code=XYZ&renderer=engine'))).toBe('engine');
	});

	it('defaults to OSMD for anything else', () => {
		expect(scoreRendererFromUrl(at(''))).toBe('osmd');
		expect(scoreRendererFromUrl(at('?renderer='))).toBe('osmd');
		expect(scoreRendererFromUrl(at('?renderer=osmd'))).toBe('osmd');
		expect(scoreRendererFromUrl(at('?renderer=Engine'))).toBe('osmd');
		expect(scoreRendererFromUrl(at('?other=engine'))).toBe('osmd');
	});
});

describe('showRenderSources', () => {
	it('shows for any renderer param, OSMD included', () => {
		expect(showRenderSources(at('?renderer=engine'))).toBe(true);
		expect(showRenderSources(at('?renderer=osmd'))).toBe(true);
		expect(showRenderSources(at('?renderer='))).toBe(true);
	});

	it('stays hidden without one', () => {
		expect(showRenderSources(at(''))).toBe(false);
		expect(showRenderSources(at('?other=engine'))).toBe(false);
	});
});
