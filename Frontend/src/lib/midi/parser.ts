import { parseMidi } from 'midi-file';
import type { MidiEvent } from 'midi-file';
import { assignVoiceParts } from '../notation/voicePartAssignment.ts';
import {
	DEFAULT_TIME_SIGNATURE,
	type BackingNote,
	type MIDILyricEvent,
	type MIDINote,
	type MIDITimeSignature,
	type MixPart,
	type ParsedMIDI,
	type VoicePartInfo
} from './types.ts';

/**
 * Parses a Standard MIDI File into notes + lyric events, resolved to a voice
 * part. Ported from the iOS app's `MIDIParser.swift` (AudioToolbox's
 * `MusicSequence`/`MusicEventIterator`) to the `midi-file` npm package, which
 * gives typed events directly rather than raw meta-event bytes — no C-API
 * byte-offset gymnastics needed here.
 */
export function parseMidiFile(bytes: ArrayLike<number>): ParsedMIDI {
	const midi = parseMidi(bytes);
	const ticksPerBeat = midi.header.ticksPerBeat ?? 480;

	// All tracks converted to absolute ticks — used for the global tempo/
	// time-signature/key-signature scan below, which has to look across
	// every track: real-world files interleave these into a voice track
	// rather than a dedicated conductor track (see the Swift parser's own
	// comment on this), so restricting the scan to "track 0" isn't safe.
	const globalAbsoluteTracks = midi.tracks.map(toAbsoluteTicks);

	// SMF format 0 packs every voice into one track, distinguished only by
	// MIDI channel — split it into one pseudo-track per channel so the rest
	// of this parser can treat format 0 and format 1 identically. Mirrors
	// the iOS parser's `.smf_ChannelsToTracks` load flag for the same case.
	// Global meta events (tempo/time-sig/track-name/lyrics) aren't
	// attributable to a single channel, so per-channel pseudo-tracks never
	// get a name — voice-part assignment falls back to mean-pitch ranking
	// for format-0 files, same as the Swift version's fallback path.
	const noteTrackEventLists =
		midi.header.format === 0 ? splitByChannel(globalAbsoluteTracks[0] ?? []) : globalAbsoluteTracks;

	const tempoChanges = collectTempoChanges(globalAbsoluteTracks);
	const tickToMs = makeTickToMsConverter(tempoChanges, ticksPerBeat);

	const rawTracks = noteTrackEventLists.map(readTrack);
	const { trackParts, parts } = assignVoiceParts(
		rawTracks.map((t) => ({ name: t.name, pitches: t.notes.map((n) => n.pitch) }))
	);
	// Accompaniment is always a single, unsplit bucket for everything
	// `assignVoiceParts` didn't confidently map to a voice — present even
	// when no track ends up backing, so the mixer always has an
	// accompaniment row.
	const accompanimentPart: VoicePartInfo = { id: 'accompaniment', base: 'accompaniment', label: 'Accompaniment' };
	const allParts = [...parts, accompanimentPart];

	const notes: MIDINote[] = [];
	const backingNotes: BackingNote[] = [];
	const lyrics: MIDILyricEvent[] = [];
	const voicePartChannels: Partial<Record<MixPart, number[]>> = {};
	for (const [index, raw] of rawTracks.entries()) {
		const partId = trackParts[index];
		for (const note of raw.notes) {
			const startMs = tickToMs(note.startTick);
			const endMs = tickToMs(note.endTick);
			const durationMs = Math.max(0, endMs - startMs);
			if (partId) {
				notes.push({ pitch: note.pitch, startMs, durationMs, partId });
			} else {
				backingNotes.push({ pitch: note.pitch, startMs, durationMs });
			}
		}
		if (partId) {
			for (const lyric of raw.lyrics) {
				lyrics.push({ text: lyric.text, timeMs: tickToMs(lyric.tick), partId });
			}
			const existing = voicePartChannels[partId] ?? [];
			voicePartChannels[partId] = [...new Set([...existing, ...raw.channels])];
		}
	}
	notes.sort((a, b) => a.startMs - b.startMs);
	backingNotes.sort((a, b) => a.startMs - b.startMs);
	lyrics.sort((a, b) => a.timeMs - b.timeMs);

	// Key signature: first occurrence wins, in track order — mid-file
	// changes aren't tracked, see `ParsedMIDI`'s doc comment.
	const keySignatureFifths = rawTracks.map((t) => t.keySignatureFifths).find((v) => v != null) ?? 0;
	const { bpm, timeSignature } = readInitialTempoAndTimeSignature(globalAbsoluteTracks);

	return {
		notes,
		backingNotes,
		lyrics,
		tempoBPM: bpm,
		timeSignature,
		keySignatureFifths,
		parts: allParts,
		trackParts,
		voicePartChannels
	};
}

// MARK: - Absolute-tick conversion

interface AbsoluteEvent {
	tick: number;
	event: MidiEvent;
}

function toAbsoluteTicks(events: MidiEvent[]): AbsoluteEvent[] {
	let tick = 0;
	return events.map((event) => {
		tick += event.deltaTime;
		return { tick, event };
	});
}

function splitByChannel(events: AbsoluteEvent[]): AbsoluteEvent[][] {
	const byChannel = new Map<number, AbsoluteEvent[]>();
	for (const item of events) {
		const channel = (item.event as { channel?: number }).channel;
		if (channel === undefined) continue;
		if (!byChannel.has(channel)) byChannel.set(channel, []);
		byChannel.get(channel)!.push(item);
	}
	return [...byChannel.entries()].sort(([a], [b]) => a - b).map(([, evts]) => evts);
}

// MARK: - Tempo map / tick→ms conversion

const DEFAULT_MICROSECONDS_PER_BEAT = 500_000; // 120 BPM

interface TempoChange {
	tick: number;
	microsecondsPerBeat: number;
}

function collectTempoChanges(tracks: AbsoluteEvent[][]): TempoChange[] {
	const changes: TempoChange[] = [];
	for (const track of tracks) {
		for (const { tick, event } of track) {
			if (event.type === 'setTempo') {
				changes.push({ tick, microsecondsPerBeat: event.microsecondsPerBeat });
			}
		}
	}
	changes.sort((a, b) => a.tick - b.tick);
	if (changes.length === 0 || changes[0].tick > 0) {
		changes.unshift({ tick: 0, microsecondsPerBeat: DEFAULT_MICROSECONDS_PER_BEAT });
	}
	return changes;
}

/** Builds a tick→ms converter that accounts for every tempo change in the
 * file (not just the initial one) — a note's *timing* should reflect the
 * real tempo map even though `ParsedMIDI.tempoBPM` only reports the initial
 * value. Mirrors the Swift parser's use of `MusicSequenceGetSecondsForBeats`,
 * which integrates through tempo changes the same way. */
function makeTickToMsConverter(tempoChanges: TempoChange[], ticksPerBeat: number): (tick: number) => number {
	const segmentStartMs: number[] = [0];
	for (let i = 1; i < tempoChanges.length; i++) {
		const prev = tempoChanges[i - 1];
		const deltaTicks = tempoChanges[i].tick - prev.tick;
		segmentStartMs.push(segmentStartMs[i - 1] + (deltaTicks / ticksPerBeat) * (prev.microsecondsPerBeat / 1000));
	}

	return (tick: number): number => {
		let segment = 0;
		for (let i = tempoChanges.length - 1; i >= 0; i--) {
			if (tempoChanges[i].tick <= tick) {
				segment = i;
				break;
			}
		}
		const deltaTicks = tick - tempoChanges[segment].tick;
		return segmentStartMs[segment] + (deltaTicks / ticksPerBeat) * (tempoChanges[segment].microsecondsPerBeat / 1000);
	};
}

function readInitialTempoAndTimeSignature(
	tracks: AbsoluteEvent[][]
): { bpm: number; timeSignature: MIDITimeSignature } {
	let bpm: number | null = null;
	let timeSignature: MIDITimeSignature | null = null;
	// Flatten and sort by tick so "first occurrence" means first in time,
	// not just first-track-first — equivalent to reading a dedicated tempo
	// track.
	const allEvents = tracks.flat().sort((a, b) => a.tick - b.tick);
	for (const { event } of allEvents) {
		if (bpm === null && event.type === 'setTempo') {
			bpm = 60_000_000 / event.microsecondsPerBeat;
		}
		if (timeSignature === null && event.type === 'timeSignature') {
			timeSignature = { numerator: event.numerator, denominator: event.denominator };
		}
		if (bpm !== null && timeSignature !== null) break;
	}
	return { bpm: bpm ?? 120, timeSignature: timeSignature ?? DEFAULT_TIME_SIGNATURE };
}

// MARK: - Track reading

interface RawTrack {
	name: string | null;
	notes: { startTick: number; endTick: number; pitch: number }[];
	lyrics: { tick: number; text: string }[];
	keySignatureFifths: number | null;
	/** Every MIDI channel this track's notes were sent on — almost always
	 * one, but tracked as a set since nothing stops a track from mixing
	 * channels. Feeds `ParsedMIDI.voicePartChannels` for live volume
	 * control. */
	channels: number[];
}

function readTrack(events: AbsoluteEvent[]): RawTrack {
	let name: string | null = null;
	const notes: RawTrack['notes'] = [];
	const lyrics: RawTrack['lyrics'] = [];
	let keySignatureFifths: number | null = null;
	const channels = new Set<number>();
	const openNotes = new Map<string, number>(); // `${channel}:${pitch}` -> startTick

	const closeNote = (key: string, endTick: number) => {
		const startTick = openNotes.get(key);
		if (startTick === undefined) return;
		openNotes.delete(key);
		const pitch = Number(key.split(':')[1]);
		notes.push({ startTick, endTick: Math.max(endTick, startTick + 1), pitch });
	};

	for (const { tick, event } of events) {
		switch (event.type) {
			case 'trackName':
				if (name === null) name = event.text;
				break;
			case 'lyrics':
				lyrics.push({ tick, text: event.text });
				break;
			case 'keySignature':
				if (keySignatureFifths === null) keySignatureFifths = event.key;
				break;
			case 'noteOn': {
				channels.add(event.channel);
				const key = `${event.channel}:${event.noteNumber}`;
				// A retrigger without an intervening off (or velocity-0
				// "off") both close whatever's currently sounding at this
				// pitch — the difference is only whether a new note starts.
				closeNote(key, tick);
				if (event.velocity > 0) openNotes.set(key, tick);
				break;
			}
			case 'noteOff':
				channels.add(event.channel);
				closeNote(`${event.channel}:${event.noteNumber}`, tick);
				break;
			default:
				break;
		}
	}

	return { name, notes, lyrics, keySignatureFifths, channels: [...channels] };
}
