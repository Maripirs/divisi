// F13: drives the player's bottom bar (play/pause/scrubber) off a reference
// recording's real YouTube audio instead of the in-browser synth — see
// `piece/[id]/+page.svelte`'s `audioSource` for when this is picked over the
// normal `MidiPlayer`. The iframe itself is never actually shown: kept alive
// off-screen (not `display: none`, which some browsers use as a cue to pause
// background video decode) so only its audio track is ever heard, giving an
// "audio-only" reference player built entirely from the same YouTube link
// already used for the video disclosure.
//
// The YouTube IFrame Player API loads as a plain `<script>` (calls the global
// `onYouTubeIframeAPIReady` once ready), the same vendor-script pattern
// `audio/player.ts` uses for js-synthesizer — not an npm package, since this
// is a thin wrapper around a script Google serves itself.
declare global {
	interface Window {
		YT: {
			Player: new (el: HTMLElement, options: YTPlayerOptions) => YTPlayer;
			PlayerState: { PLAYING: number };
		};
		onYouTubeIframeAPIReady?: () => void;
	}
}

interface YTPlayerOptions {
	videoId: string;
	host?: string;
	playerVars?: Record<string, number>;
	events?: {
		onReady?: () => void;
		onError?: (event: { data: number }) => void;
	};
}

interface YTPlayer {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getCurrentTime(): number;
	getDuration(): number;
	getPlayerState(): number;
	destroy(): void;
}

let apiLoaded: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
	if (apiLoaded) return apiLoaded;
	apiLoaded = new Promise<void>((resolve) => {
		if (window.YT?.Player) {
			resolve();
			return;
		}
		const previous = window.onYouTubeIframeAPIReady;
		window.onYouTubeIframeAPIReady = () => {
			previous?.();
			resolve();
		};
		if (document.querySelector('script[data-divisi-youtube-api]')) return;
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.dataset.divisiYoutubeApi = 'true';
		document.head.appendChild(script);
	});
	return apiLoaded;
}

/** Extracts an `/embed/`-able video id from whatever YouTube URL shape an
 * admin pasted into the upload form — the same three shapes
 * `piece/[id]/+page.svelte`'s `toYoutubeEmbedUrl` already handles for the
 * video disclosure, kept as a sibling rather than a shared import since that
 * one returns a full embed URL and this needs the bare id the IFrame API's
 * constructor takes. Returns `null` (rather than guessing) for anything
 * unrecognizable, since a wrong id would silently play the wrong video. */
export function extractYoutubeVideoId(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.slice('/embed/'.length) || null;
		if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1) || null;
		return parsed.searchParams.get('v');
	} catch {
		return null;
	}
}

/** Audio-only playback of a YouTube reference recording, driven through the
 * same position/duration/isPlaying/play/pause/seek shape `MidiPlayer`
 * exposes, so `piece/[id]/+page.svelte`'s bottom bar can treat either as
 * interchangeable "whatever the current audio source is." */
export class YoutubeAudioPlayer {
	private readonly player: YTPlayer;
	private readonly host: HTMLElement;
	private destroyed = false;

	private constructor(player: YTPlayer, host: HTMLElement) {
		this.player = player;
		this.host = host;
	}

	static create(videoId: string): Promise<YoutubeAudioPlayer> {
		return loadYoutubeApi().then(
			() =>
				new Promise<YoutubeAudioPlayer>((resolve, reject) => {
					// Off-screen, not `display: none` — see this file's top comment
					// for why. A YouTube player replaces this element in place with
					// its own iframe once constructed.
					const host = document.createElement('div');
					host.setAttribute('aria-hidden', 'true');
					host.style.position = 'fixed';
					host.style.width = '2px';
					host.style.height = '2px';
					host.style.left = '-9999px';
					host.style.top = '-9999px';
					host.style.overflow = 'hidden';
					document.body.appendChild(host);
					const player = new window.YT.Player(host, {
						videoId,
						playerVars: { controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1, rel: 0 },
						events: {
							onReady: () => resolve(new YoutubeAudioPlayer(player, host)),
							onError: (event) => reject(new Error(`YouTube player error (code ${event.data})`))
						}
					});
				})
		);
	}

	play(): void {
		if (this.destroyed) return;
		this.player.playVideo();
	}

	pause(): void {
		if (this.destroyed) return;
		this.player.pauseVideo();
	}

	seek(ms: number): void {
		if (this.destroyed) return;
		this.player.seekTo(ms / 1000, true);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.player.destroy();
		this.host.remove();
	}

	/** Read live off the player rather than cached — the IFrame API has no
	 * push-based "time updated" event, only polling, which the caller's own
	 * `requestAnimationFrame` tick loop already does for `MidiPlayer`'s
	 * equivalent getter. */
	get positionMs(): number {
		if (this.destroyed) return 0;
		return this.player.getCurrentTime() * 1000;
	}

	/** `0` until the video's metadata has actually loaded — same "not known
	 * yet" convention `durationMs` elsewhere in this app starts from. */
	get duration(): number {
		if (this.destroyed) return 0;
		return this.player.getDuration() * 1000;
	}

	get isPlaying(): boolean {
		if (this.destroyed) return false;
		return this.player.getPlayerState() === window.YT.PlayerState.PLAYING;
	}
}
