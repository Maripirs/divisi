import { writeMidi } from 'midi-file';
import type { MidiData, MidiEvent } from 'midi-file';
import {
	MIX_PARTS,
	VOICE_PARTS,
	type BackingNote,
	type MIDINote,
	type MixPart,
	type ParsedMIDI
} from './types.ts';

const TICKS_PER_BEAT = 480;

export interface PlaybackMidi {
	bytes: Uint8Array;
	/** Mixer bucket -> the MIDI channel it was placed on in `bytes`
	 * (S/A/T/B/accompaniment => 0/1/2/3/4, assigned by this builder) — use this with the
	 * synth's live `midiControl(channel, 7, volume)` for the balance
	 * slider. */
	channelForPart: Record<MixPart, number>;
}

/**
 * Builds a fresh, minimal Standard MIDI File from already-parsed notes,
 * with one channel per mixer bucket (0=soprano, 1=alto, 2=tenor, 3=bass,
 * 4=accompaniment) — regardless of what channels the *original* file
 * happened to use.
 *
 * This sidesteps a real inconsistency found while wiring this up: some
 * exports (including this project's own synthetic dev fixtures, generated
 * by `Fixtures/generate.py`) put every track on MIDI channel 0, which would
 * make live per-part volume control (a CC7 message sent to a specific
 * channel) impossible to target correctly. Rebuilding the playback file
 * from `ParsedMIDI.notes` — which are already correctly resolved to a voice
 * part regardless of the source channel layout — makes the live-balance
 * feature work for any input file, not just well-behaved ones.
 *
 * SATB parts stay separately controllable, while unassigned/accompaniment
 * material is collapsed into one backing channel.
 */
export function buildPlaybackMidi(parsed: ParsedMIDI): PlaybackMidi {
	const msPerTick = 60_000 / parsed.tempoBPM / TICKS_PER_BEAT;
	const msToTick = (ms: number) => Math.round(ms / msPerTick);

	const channelForPart = Object.fromEntries(MIX_PARTS.map((part, i) => [part, i])) as Record<MixPart, number>;

	const tempoTrack: MidiEvent[] = [
		{
			deltaTime: 0,
			type: 'setTempo',
			meta: true,
			microsecondsPerBeat: Math.round(60_000_000 / parsed.tempoBPM)
		},
		{
			deltaTime: 0,
			type: 'timeSignature',
			meta: true,
			numerator: parsed.timeSignature.numerator,
			denominator: parsed.timeSignature.denominator,
			metronome: 24,
			thirtyseconds: 8
		},
		{ deltaTime: 0, type: 'endOfTrack', meta: true }
	];

	const partTracks = VOICE_PARTS.map((voicePart) =>
		buildTrack(
			parsed.notes.filter((note) => note.voicePart === voicePart),
			channelForPart[voicePart],
			msToTick
		)
	);
	const backingTrack = buildTrack(parsed.backingNotes, channelForPart.accompaniment, msToTick);

	const midiData: MidiData = {
		header: { format: 1, numTracks: 1 + partTracks.length + 1, ticksPerBeat: TICKS_PER_BEAT },
		tracks: [tempoTrack, ...partTracks, backingTrack]
	};

	return { bytes: Uint8Array.from(writeMidi(midiData)), channelForPart };
}

function buildTrack(
	notes: Array<MIDINote | BackingNote>,
	channel: number,
	msToTick: (ms: number) => number
): MidiEvent[] {
	interface Boundary {
		tick: number;
		isOn: boolean;
		pitch: number;
	}
	const boundaries: Boundary[] = [];
	for (const note of notes) {
		const onTick = msToTick(note.startMs);
		const offTick = Math.max(onTick + 1, msToTick(note.startMs + note.durationMs));
		boundaries.push({ tick: onTick, isOn: true, pitch: note.pitch });
		boundaries.push({ tick: offTick, isOn: false, pitch: note.pitch });
	}
	// Offs sort before ons at the same tick, so a note ending exactly where
	// the next one starts doesn't read as a one-tick overlap.
	boundaries.sort((a, b) => a.tick - b.tick || (a.isOn === b.isOn ? 0 : a.isOn ? 1 : -1));

	const events: MidiEvent[] = [];
	let lastTick = 0;
	for (const b of boundaries) {
		events.push({
			deltaTime: b.tick - lastTick,
			type: b.isOn ? 'noteOn' : 'noteOff',
			channel,
			noteNumber: b.pitch,
			velocity: b.isOn ? 100 : 0
		} as MidiEvent);
		lastTick = b.tick;
	}
	events.push({ deltaTime: 0, type: 'endOfTrack', meta: true });
	return events;
}
