import type { OnsetEvent } from './timeline.js';
export interface SynthesisOptions {
    /** Real Web Audio context (or a test stub shaped like one, see
     *  `synthesis.test.ts`). Only its `createOscillator`, `createGain` and
     *  `destination` are used, the same "take the real DOM type, hand tests a
     *  minimal stub cast via `as unknown as AudioContext`" precedent
     *  `CanvasRenderer` sets with `CanvasRenderingContext2D` (see
     *  `../render/renderer.ts` and `renderer.test.ts`'s `recordingContext()`). */
    readonly audioContext: AudioContext;
    /** Attack ramp, seconds: how long `gain` takes to rise from 0 to `gain` at
     *  the start of the note. Defaults to 0.01 (10ms), short enough to be
     *  inaudible as a fade rather than an instant onset, but long enough to
     *  avoid the audible "click" a discontinuous jump from silence to full
     *  volume produces (a step in a waveform is a burst of high-frequency
     *  energy the ear hears as a tick). */
    readonly attackSeconds?: number;
    /** Release ramp, seconds: how long `gain` takes to fall from `gain` back
     *  to 0, ending exactly at the note's own end. Defaults to 0.05 (50ms),
     *  longer than the attack default: a fast attack reads as a clean onset,
     *  but an equally fast release still clicks (the same discontinuity
     *  problem at the other end), and a slightly longer fade there is easy to
     *  spare since it eats into the tail of the note rather than delaying its
     *  perceived start. */
    readonly releaseSeconds?: number;
    /** Peak gain per voice, 0..1. Defaults to 0.2. Kept well under 1 because
     *  this milestone's own SATB use case sounds up to 4 simultaneous voices
     *  through one shared `AudioContext` with no separate mixing/limiting
     *  stage; 4 voices at 0.2 sum to 0.8 peak in the worst case (all four
     *  attacking in phase), leaving headroom before clipping at 1.0. */
    readonly gain?: number;
}
/**
 * Play one `OnsetEvent` through a real (or stubbed) `AudioContext`: a single
 * `'triangle'`-wave oscillator, an attack/release gain envelope so the note
 * does not click on start or stop, connected oscillator -> gain ->
 * `audioContext.destination`, started and stopped at the event's own
 * `startSeconds`/`startSeconds + durationSeconds`.
 *
 * This function's signature is deliberately a direct fit for
 * `LookaheadScheduler`'s `onSchedule` option (see `./scheduler.js`): a
 * caller assembling actual playback (Slice 5's transport controls) wires
 * them together as
 *
 *   new LookaheadScheduler({
 *     events,
 *     getCurrentTime: () => audioContext.currentTime,
 *     onSchedule: (event) => playOnsetEvent(event, { audioContext })
 *   });
 *
 * `'triangle'` is the one timbre this milestone uses for every voice and
 * staff (per-part timbre is out of scope): it is a simple, concretely
 * buildable native `OscillatorType`, chosen over sampled or soundfont
 * playback per this milestone's client-side-only, no-server,
 * no-soundfont-library constraint.
 *
 * Frequency is set via `setValueAtTime` at `startSeconds` rather than a
 * plain `frequency.value =` assignment, for the same reason the gain
 * envelope below uses scheduled automation rather than immediate property
 * writes: it keeps every parameter of this note's sound expressed on the
 * same audio-clock timeline as its own start/stop, even though in practice
 * the oscillator has not started producing samples yet at this point, so a
 * plain assignment would have been equally correct here.
 *
 * Returns the `oscillator`/`gain` nodes it created. Nothing in this
 * milestone up through Slice 4 needs them back (a note is simply left to run
 * its own scheduled envelope to completion), but Slice 5's `PlaybackEngine`
 * does: its `stop()` has to silence notes that are already sounding, which
 * means holding onto a reference to their oscillators so it can call
 * `oscillator.stop()` on them early, ahead of the stop time this function
 * already scheduled.
 */
export declare function playOnsetEvent(event: OnsetEvent, options: SynthesisOptions): {
    oscillator: OscillatorNode;
    gain: GainNode;
};
