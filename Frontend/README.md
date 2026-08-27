# Divisi — Frontend (web player)

SvelteKit web player: MIDI parsed and synthesized entirely client-side, real
engraved notation (OpenSheetMusicDisplay) with a cursor synced to playback,
per-part balance control, and flat/highlighted/solo display modes. See
`plan.md` for milestone status — this is currently milestone **F1**, a
standalone prototype with no backend or accounts, playing back a bundled
fixture MIDI file.

## Requirements

- Node.js 20+ (developed against Node 26)
- A Chromium-, Firefox-, or WebKit-based browser with Web Audio API support
  (i.e. any modern desktop or mobile browser)

## Developing

```sh
npm install
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

This serves the app at `http://localhost:5173`. On load it fetches the
bundled fixture at `static/fixtures/Mozart_Lacrymosa_from_Requiem_SATB_with_piano.mid`,
parses it, and loads the WASM FluidSynth engine (`static/vendor/`) with the
`TimGM6mb.sf2` soundfont (`static/soundfonts/`) — the same soundfont concept
the iOS app used. No backend, network calls, or login are involved.

Click **Play** to start; the score, cursor, part picker (Soprano/Alto/Tenor/
Bass), display mode (Flat/Highlighted/Solo), and per-part balance sliders are
all live during playback. The score view has its own zoom controls
(−/percentage/+) independent of the browser's own zoom.

## Type-checking

```sh
npm run check          # one-off
npm run check:watch    # watch mode
```

## Building

```sh
npm run build
```

Preview the production build with `npm run preview`. Builds target
Cloudflare Workers via `@sveltejs/adapter-cloudflare` (see `vite.config.ts`,
`wrangler.jsonc`); output lands in `.svelte-kit/cloudflare`.

## Deployment

Live at **https://divisi.maripi.net**, running as the `divisi-frontend`
Worker on Cloudflare (account: mariapazmaluenda@gmail.com).

To redeploy:

```sh
npm run build
npx wrangler deploy
```

`wrangler deploy` does not build for you — it just uploads whatever is
already in `.svelte-kit/cloudflare`, so always run `npm run build`
immediately before it to avoid shipping a stale build. First-time setup on
a new machine needs `npx wrangler login` (opens a
browser OAuth flow) — `wrangler whoami` confirms you're authenticated.

The custom domain (`divisi.maripi.net`) and routing live in `wrangler.jsonc`,
not the Cloudflare dashboard — changes to the route/domain belong there so
they redeploy with the app. Registering the account's `workers.dev`
subdomain (a one-time, account-wide setting, done once already) is the one
piece not scriptable through `wrangler deploy` itself if it's ever needed
again on a fresh account.

## Project layout

- `src/lib/midi/` — MIDI parsing (`parser.ts`, ported from the iOS
  `MIDIParser`), MusicXML conversion (`musicXmlConverter.ts`, ported from
  `MusicXMLConverter`), and `playbackMidiBuilder.ts` (rebuilds a MIDI blob
  with deterministic per-part MIDI channels, needed for live per-part volume)
- `src/lib/audio/player.ts` — Web Audio playback via `js-synthesizer`
  (WASM FluidSynth), driven off `AudioContext.currentTime`, no polling
- `src/lib/components/ScoreView.svelte` — OSMD embed, cursor sync, zoom
- `src/routes/+page.svelte` — top-level page wiring parsing, playback, and
  score view together

## Known gaps (tracked in `plan.md`)

- Background/lock-screen playback (Media Session API) is implemented but not
  yet re-verified on a real device
- No backend/account wiring yet — that's F2/F3
