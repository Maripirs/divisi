<script lang="ts">
	import { onMount } from 'svelte';
	import type { OpenSheetMusicDisplay as OSMDType, PointF2D as PointF2DType } from 'opensheetmusicdisplay';
	import { EditableScore, type EditableNote } from '$lib/spike/musicXmlEdit';

	// A real multi-measure, multi-staff fixture already bundled in static/.
	// (Not an OMR-rough one — the spike is about the edit-loop mechanics, not
	// the notation's quality.)
	const FIXTURE = '/fixtures/SFCC/The_Challenge_of_Thor_Elgar.musicxml';

	let container: HTMLDivElement;
	let osmd: OSMDType | undefined;
	let PointF2D: (new (x: number, y: number) => PointF2DType) | undefined;
	let score: EditableScore | undefined;

	let ready = $state(false);
	let busy = $state(false);
	let status = $state('loading fixture…');
	let selected = $state<EditableNote | undefined>(undefined);
	let lastRenderMs = $state(0);
	let editCount = $state(0);

	onMount(async () => {
		const mod = await import('opensheetmusicdisplay');
		PointF2D = mod.PointF2D;
		osmd = new mod.OpenSheetMusicDisplay(container, {
			autoResize: true,
			drawTitle: true,
			followCursor: false,
			backend: 'svg'
		});
		const xml = await (await fetch(FIXTURE)).text();
		score = new EditableScore(xml);
		await renderXml(xml);
		container.addEventListener('click', handleClick);
		ready = true;
		status = `${score.list().length} notes — click one`;
	});

	async function renderXml(xml: string): Promise<void> {
		if (!osmd) return;
		const started = performance.now();
		await osmd.load(xml);
		osmd.render();
		lastRenderMs = Math.round(performance.now() - started);
	}

	function handleClick(event: MouseEvent): void {
		if (!osmd || !PointF2D || !score) return;
		const rect = container.getBoundingClientRect();
		const perPixel = 1 / (10 * osmd.Zoom);
		const nearest = osmd.GraphicSheet.GetNearestNote(
			new PointF2D((event.clientX - rect.left) * perPixel, (event.clientY - rect.top) * perPixel),
			new PointF2D(1, 1)
		);
		// Reach into OSMD's source model for the click target's timestamp,
		// staff and pitch, then resolve that back to a `<note>` in our DOM
		// model. OSMD's deep types aren't all surfaced, hence the cast.
		const src = nearest?.sourceNote as
			| {
					getAbsoluteTimestamp(): { RealValue: number };
					ParentStaffEntry?: {
						ParentStaff?: { Id?: number; ParentInstrument?: { IdString?: string } };
					};
					Pitch?: { Octave?: number };
			  }
			| undefined;
		if (!src) return;
		const onset = src.getAbsoluteTimestamp().RealValue;
		const staffInInstrument = src.ParentStaffEntry?.ParentStaff?.Id ?? 1;
		const partId = src.ParentStaffEntry?.ParentStaff?.ParentInstrument?.IdString ?? '';
		// OSMD's `Pitch.Octave` is scientific-octave minus 3.
		const octave = src.Pitch?.Octave != null ? src.Pitch.Octave + 3 : undefined;
		selected = score.findByOnset(onset, { partId, staff: staffInInstrument, octave });
		status = selected
			? describe(selected)
			: `no note near onset ${onset.toFixed(3)} · part ${partId} · staff ${staffInInstrument}`;
	}

	function describe(note: EditableNote): string {
		const p = note.pitch;
		const name = p ? `${p.step}${p.alter > 0 ? '#'.repeat(p.alter) : p.alter < 0 ? 'b'.repeat(-p.alter) : ''}${p.octave}` : 'rest';
		return `#${note.index} · ${name} · part ${note.partId} · m${note.measureIndex + 1} · staff ${note.staff} · onset ${note.onsetWholeNotes.toFixed(3)}`;
	}

	async function applyEdit(fn: (s: EditableScore, index: number) => void): Promise<void> {
		if (!score || !osmd || selected === undefined || busy) return;
		busy = true;
		const index = selected.index;
		fn(score, index);
		await renderXml(score.serialize());
		selected = score.get(index);
		editCount += 1;
		status = selected ? `edited → ${describe(selected)}` : 'edited';
		showSelectionCursor();
		busy = false;
	}

	const up = () => applyEdit((s, i) => s.transpose(i, 1));
	const down = () => applyEdit((s, i) => s.transpose(i, -1));
	const del = () => applyEdit((s, i) => s.deleteToRest(i));

	function showSelectionCursor(): void {
		if (!osmd?.cursor || !selected) return;
		const cursor = osmd.cursor;
		cursor.show();
		cursor.reset();
		const target = selected.onsetWholeNotes;
		let guard = 0;
		while (cursor.iterator.currentTimeStamp.RealValue < target && !cursor.iterator.EndReached && guard++ < 10000) {
			cursor.next();
			if (cursor.iterator.currentTimeStamp.RealValue > target) {
				cursor.previous();
				break;
			}
		}
	}

	async function reload(): Promise<void> {
		if (!osmd) return;
		busy = true;
		const xml = await (await fetch(FIXTURE)).text();
		score = new EditableScore(xml);
		await renderXml(xml);
		selected = undefined;
		editCount = 0;
		status = `${score.list().length} notes — click one`;
		busy = false;
	}

	function dumpXml(): void {
		if (!score) return;
		console.log(score.serialize());
		status = 'serialized MusicXML logged to console';
	}
</script>

<div class="spike">
	<header>
		<h1>F14 spike — OSMD edit loop</h1>
		<p class="note">
			Throwaway. Proves click → transpose / delete → re-render on
			OpenSheetMusicDisplay, no Verovio/MEI. Route: <code>/spike/f14-editor</code>.
		</p>
	</header>

	<div class="toolbar">
		<button onclick={up} disabled={!ready || busy || !selected}>Pitch +1</button>
		<button onclick={down} disabled={!ready || busy || !selected}>Pitch −1</button>
		<button onclick={del} disabled={!ready || busy || !selected}>Delete → rest</button>
		<button onclick={reload} disabled={!ready || busy}>Reload fixture</button>
		<button onclick={dumpXml} disabled={!ready}>Log MusicXML</button>
		<span class="metrics">
			edits: {editCount} · last render: {lastRenderMs}ms
		</span>
	</div>

	<p class="status" class:busy>{status}</p>

	<div class="score" bind:this={container}></div>
</div>

<style>
	.spike {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}
	header h1 {
		margin: 0;
		font-size: 1.1rem;
	}
	.note {
		margin: 0.25rem 0 0;
		color: #666;
		font-size: 0.85rem;
		max-width: 60ch;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.toolbar button {
		padding: 0.4rem 0.7rem;
		border: 1px solid #bbb;
		border-radius: 6px;
		background: #f7f7f7;
		cursor: pointer;
		font: inherit;
	}
	.toolbar button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.metrics {
		color: #888;
		font-size: 0.8rem;
	}
	.status {
		margin: 0;
		font-size: 0.85rem;
		font-family: ui-monospace, monospace;
		color: #235;
	}
	.status.busy {
		color: #a60;
	}
	.score {
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
		overflow: auto;
		max-height: 75vh;
	}
</style>
