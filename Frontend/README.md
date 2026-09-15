# Divisi — Frontend (web app)

The Divisi web app, and the primary product in this repo. SvelteKit, Svelte 5
runes. Core is the practice player: MIDI parsed and synthesized entirely
client-side, real engraved notation (OpenSheetMusicDisplay) with a cursor
synced to playback, per-part balance control, and flat/highlighted/solo display
modes. Around it: login, groups (homework, rehearsal tracks, members,
responsibilities, weekly notes), per-page visibility settings, guest join
links, score annotations, freehand PDF markup, a YouTube reference-recording
audio source, Spanish localization (`/es`), and app-wide error handling.

The player still runs standalone against a bundled fixture MIDI file with no
login (see `static/fixtures/`); everything else talks to the `Backend/` service.
See the root `PLAN.md` for current status (through F43; most recent work
awaits a manual redeploy and a real in-browser sign-off — the recurring
blocker, not a code gap) and `PLAN_HISTORY.md` for per-milestone detail.

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

This serves the app at `http://localhost:5173`. The player route parses a
bundled fixture MIDI file, then loads the WASM FluidSynth engine
(`static/vendor/`) with the `TimGM6mb.sf2` soundfont (`static/soundfonts/`) —
the same soundfont concept the iOS app used; that path needs no backend or
login. The rest of the app (login, groups, homework, guest join, annotations,
markup) calls the `Backend/` service — set `PUBLIC_API_BASE_URL` in
`Frontend/.env` (see below).

In the player: click **Play** to start; the score, cursor, part picker
(Soprano/Alto/Tenor/Bass), display mode (Flat/Highlighted/Solo), and per-part
balance sliders are all live during playback. The score view has its own zoom
controls (−/percentage/+) independent of the browser's own zoom.

## Backend connection

Set `PUBLIC_API_BASE_URL` in `Frontend/.env` to the backend origin —
`https://localhost:8000` for a local `Backend/` (it is HTTPS-only in dev), or
`https://divisi.onrender.com` for production. Anything that talks to the
backend 500s if this is wrong or missing; the standalone player masks it since
it makes zero backend calls.

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
immediately before it to avoid shipping a stale build. Build with the real
backend URL baked in —
`PUBLIC_API_BASE_URL=https://divisi.onrender.com npm run build` — never a bare
`npm run build`, or the Worker ships pointed at whatever the local `.env`
holds (this has caused a live outage before). First-time setup on a new
machine needs `npx wrangler login` (opens a browser OAuth flow) —
`wrangler whoami` confirms you're authenticated.

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
- `src/lib/components/ScoreView.svelte` — OSMD embed, cursor sync, zoom;
  `PdfView.svelte` — pdf.js viewer + freehand markup overlay
- `src/lib/api/`, `src/lib/server/backend.ts` — typed clients + the
  authenticated server-side fetch helper for the `Backend/` service
- `src/routes/piece/[id]/` — the player page, wiring parsing, playback, score
  view, PDF view, annotations, and markup together
- `src/lib/i18n.ts`, `messages/{en,es}.json` — Paraglide localization

## Known gaps (tracked in the root `PLAN.md`)

- Most recent work is built and `check`/`build`-clean but still needs a
  manual redeploy and a real in-browser/touchscreen sign-off — see
  `PLAN.md`'s "Awaiting human verification" section
- `groups/[id]/+page.svelte` is 1,000+ lines covering every tab; a per-tab
  component split is in the backlog
- Independent overlapping rhythms on one staff render as chords, not multiple
  voices, in the player-generated MusicXML
