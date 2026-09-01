import { expect, type Page } from '@playwright/test';

/** Shape of `window.__divisiEditorProbe()` — installed by
 * `src/routes/piece/[id]/edit/+page.svelte` under `vite dev` or `?e2e`. */
export interface EditorProbe {
	phase: 'loading' | 'ready' | 'error';
	positionMs: number;
	durationMs: number;
	isPlaying: boolean;
	audioStale: boolean;
	baseTempoBpm: number;
	/** ms of original-tempo musical time per whole note. */
	msPerWholeNote: number;
	/** Transport position converted to whole notes, or null before audio load. */
	playheadWholeNotes: number | null;
	/** The rendered playhead cursor's musical position (whole notes), or null. */
	playheadOnset: number | null;
}

export interface Sample extends EditorProbe {
	/** ms since sampling started. */
	t: number;
	/** Playhead cursor element's viewport box, or null if not shown. */
	cursorBox: { x: number; y: number; width: number; height: number } | null;
}

export async function readProbe(page: Page): Promise<EditorProbe> {
	const probe = await page.evaluate(() => {
		const fn = (window as unknown as { __divisiEditorProbe?: () => EditorProbe }).__divisiEditorProbe;
		return fn ? fn() : null;
	});
	expect(
		probe,
		'window.__divisiEditorProbe is not installed — open the editor with ?e2e or run under `vite dev`'
	).not.toBeNull();
	return probe as EditorProbe;
}

/** Poll the probe + the rendered playhead box every `intervalMs` for
 * `durationMs`. Does no assertions — hands the raw series back for the spec
 * to reason about.
 *
 * The whole loop runs inside a single `page.evaluate` (one round-trip, not
 * one per sample): a per-sample `locator.boundingBox()` from the Node side
 * auto-waits and made each iteration take seconds. */
export async function samplePlayback(
	page: Page,
	{ durationMs = 4000, intervalMs = 120 }: { durationMs?: number; intervalMs?: number } = {}
): Promise<Sample[]> {
	const samples = await page.evaluate<Sample[], { durationMs: number; intervalMs: number }>(
		({ durationMs: dur, intervalMs: step }) =>
			new Promise((resolve) => {
				const probeFn = (window as unknown as { __divisiEditorProbe?: () => EditorProbe })
					.__divisiEditorProbe;
				if (!probeFn) {
					resolve([]);
					return;
				}
				const out: Sample[] = [];
				const start = performance.now();
				const id = setInterval(() => {
					const el = document.querySelector('[data-role="playhead"]');
					const r = el ? el.getBoundingClientRect() : null;
					out.push({
						...probeFn(),
						t: performance.now() - start,
						cursorBox: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null
					});
					if (performance.now() - start >= dur) {
						clearInterval(id);
						resolve(out);
					}
				}, step);
			}),
		{ durationMs, intervalMs }
	);
	expect(samples.length, 'no samples collected — is the probe installed?').toBeGreaterThan(0);
	if (process.env.E2E_DEBUG) {
		console.log(
			'[samplePlayback]',
			JSON.stringify(
				samples.map((s) => ({
					t: s.t,
					pos: Math.round(s.positionMs),
					playing: s.isPlaying,
					head: s.playheadOnset,
					expected: s.msPerWholeNote ? +(s.positionMs / s.msPerWholeNote).toFixed(3) : null,
					x: s.cursorBox ? Math.round(s.cursorBox.x) : null,
					y: s.cursorBox ? Math.round(s.cursorBox.y) : null
				})),
				null,
				1
			)
		);
	}
	return samples;
}

/** Samples where the transport was actually running and past the very start. */
export function playingSamples(samples: Sample[]): Sample[] {
	return samples.filter((s) => s.isPlaying && s.positionMs > 0 && s.playheadOnset !== null);
}

/** The transport advanced during the window (guards against a test that
 * "passed" only because playback never started). */
export function assertTransportAdvanced(samples: Sample[]): void {
	const positions = samples.map((s) => s.positionMs);
	expect(Math.max(...positions), 'transport never advanced — did playback start?').toBeGreaterThan(
		Math.min(...positions) + 200
	);
	expect(samples.some((s) => s.isPlaying), 'isPlaying was never true').toBeTruthy();
}

/** The playhead's musical position never jumps backward. This is the direct
 * assertion for the repeat-barline fix (`CursorIgnoreRepetitions`): without
 * it the cursor back-jumps at an end-repeat while the audio plays straight
 * through, so this series would sawtooth. `eps` absorbs float noise only. */
export function assertPlayheadMonotonic(samples: Sample[], eps = 1e-6): void {
	const onsets = playingSamples(samples).map((s) => s.playheadOnset as number);
	for (let i = 1; i < onsets.length; i++) {
		expect(
			onsets[i],
			`playhead onset jumped backward: ${onsets[i - 1]} -> ${onsets[i]} (sample ${i})`
		).toBeGreaterThanOrEqual(onsets[i - 1] - eps);
	}
}

/** The rendered playhead stays close to the transport position. The cursor
 * snaps to the last note onset at-or-before the transport, so it should sit
 * *at or slightly behind* `positionMs / msPerWholeNote`, never ahead and
 * never more than one long note behind. */
export function assertPlayheadTracksTransport(samples: Sample[], maxLagWholeNotes = 1.0): void {
	for (const s of playingSamples(samples)) {
		const expected = s.positionMs / s.msPerWholeNote;
		const lag = expected - (s.playheadOnset as number);
		expect(
			lag,
			`playhead ran ahead of the transport at t=${s.t}ms (onset ${s.playheadOnset}, expected ~${expected.toFixed(3)})`
		).toBeGreaterThanOrEqual(-0.02);
		expect(
			lag,
			`playhead lagged the transport by ${lag.toFixed(3)} whole notes at t=${s.t}ms — expected <= ${maxLagWholeNotes}`
		).toBeLessThanOrEqual(maxLagWholeNotes);
	}
}

/** The main thread stays responsive during playback. `samplePlayback` runs a
 * `setInterval(intervalMs)` inside the page; when the main thread is starved
 * (OSMD re-engraving the whole sheet every animation frame, say) those
 * callbacks pile up and far fewer samples land than the window allows. This
 * is the assertion for the "editor playback stalls for ~1-2s at a time" bug
 * that a position-only check sails straight past. */
export function assertResponsiveDuringPlayback(
	samples: Sample[],
	{
		windowMs,
		intervalMs,
		minFraction = 0.5
	}: { windowMs: number; intervalMs: number; minFraction?: number }
): void {
	const expected = Math.floor(windowMs / intervalMs);
	const gaps = samples.slice(1).map((s, i) => s.t - samples[i].t);
	const maxGap = Math.round(gaps.length ? Math.max(...gaps) : 0);
	expect(
		samples.length,
		`only ${samples.length} of ~${expected} expected samples landed in ${windowMs}ms ` +
			`(largest gap ${maxGap}ms) — the page's main thread is being starved during playback`
	).toBeGreaterThanOrEqual(Math.floor(expected * minFraction));
	expect(
		maxGap,
		`main thread blocked for ${maxGap}ms during playback (sampling every ${intervalMs}ms)`
	).toBeLessThan(intervalMs * 6);
}

/** The playhead moves note-by-note, not measure-by-measure — the
 * `SkipInvisibleNotes = false` fix. Over a multi-second window at a normal
 * tempo a per-note cursor visits many distinct onsets; a per-measure one
 * visits a handful. Inconclusive if too few samples landed — run
 * `assertResponsiveDuringPlayback` first so a starved main thread reports as
 * that, not as a granularity failure. */
export function assertNoteLevelGranularity(samples: Sample[], minDistinctOnsets = 6): void {
	const distinct = new Set(playingSamples(samples).map((s) => s.playheadOnset));
	expect(
		distinct.size,
		`playhead only visited ${distinct.size} distinct onsets during playback — looks measure-level, not note-level`
	).toBeGreaterThanOrEqual(minDistinctOnsets);
}

/** Visual counterpart to `assertPlayheadMonotonic`: on a given system the
 * cursor's x never slides backward. Samples where y moved (a new system, or
 * a follow-scroll) are skipped rather than compared. */
export function assertNoBackwardVisualJump(samples: Sample[], sameSystemDyPx = 4, epsPx = 2): void {
	const boxed = playingSamples(samples).filter((s) => s.cursorBox);
	for (let i = 1; i < boxed.length; i++) {
		const prev = boxed[i - 1].cursorBox!;
		const cur = boxed[i].cursorBox!;
		if (Math.abs(cur.y - prev.y) > sameSystemDyPx) continue;
		expect(
			cur.x,
			`playhead slid backward on-screen: x ${prev.x} -> ${cur.x} (sample ${i})`
		).toBeGreaterThanOrEqual(prev.x - epsPx);
	}
}
