# Demo mode setup

**Status: done.** Steps 1-3 below (seed, join code, `DEMO_JOIN_CODE` on
Render) were already complete in production before 2026-09-13; Step 4
(frontend deploy) landed that day. Verified live: `/join/DEMOSATB` serves
all four movements, homework, the weekly note, and responsibilities;
`/welcome` shows "Try the demo". The `demo-admin` account already exists
in prod under a password set whenever this was first run, not the one
`DEMO_ADMIN_PASSWORD` names in Step 2 below, that's only for a from-scratch
setup. Re-running Step 2 against an already-seeded demo is safe and
idempotent (it skips existing pieces), but it can't log in as `demo-admin`
without that original password, only whoever set it can re-run it for
real; everyone else gets a dry run.

One-time steps to stand up the public "Divisi Demo Choir": a fake group,
pre-populated with four movements of Mozart's Requiem plus homework, a
weekly note, and a responsibilities schedule, reachable with no login at
<https://divisi.maripi.net/join/DEMOSATB>.

The code is already in place:

- `Backend/scripts/seed_demo.py` seeds the group and its content by driving
  the live HTTP API as a dedicated `demo-admin` account.
- The `/welcome` page has a "Try the demo" button pointing at
  `/join/DEMOSATB` (needs a frontend deploy to go live).

What is left is human-only: running the seed against production, one SQL
statement, and the frontend deploy.

---

## The pieces (already in place)

Four movements of **Mozart's Requiem, K. 626**, sit under
`Backend/fixtures/demo/`, one folder each, as a `.mxl` (compressed
MusicXML: SATB parts plus a piano reduction) and a PDF:

```
Backend/fixtures/demo/
├── kyrie/        score.mxl  score.pdf
├── domine-jesu/  score.mxl  score.pdf
├── lacrimosa/    score.mxl  score.pdf
└── agnus-dei/    score.mxl  score.pdf
```

There is no MIDI; the player parses the `.mxl` in the browser (unzips it
client-side), the same path the existing bundled demo pieces use. These
folders are gitignored (`Backend/.gitignore`), so the score files are not
committed; the seeded data lives in the production database and object
storage after Step 2.

Each movement also gets a **reference recording**: the matching track from
a full "Mozart - Requiem (all parts)" YouTube playlist, set as the piece's
`youtube_url` in the seed script so the player offers it as an audio
source. Editing a link in `PIECES` and re-running Step 2 updates the live
piece (the script reconciles composer / tempo / recording on every run).

**Licensing.** The composition is public domain worldwide: Mozart died in
1791, and Sussmayr, who completed the score, died in 1803, so both are far
past any copyright term. No permission or attribution is required. No
recording is involved (the player synthesizes audio from the notation), so
no performance or phonogram rights apply. The only thing that could carry
its own copyright is a modern engraving or edition; keep the `.mxl` /
PDF files sourced from a public-domain or freely-licensed edition (CPDL,
IMSLP, or a MuseScore export released under CC0 / public domain).

To change the movement list, edit the `PIECES` list at the top of
`Backend/scripts/seed_demo.py` (`slug`, `title`, `composer`,
`default_tempo_bpm`) to match the folders.

---

## Step 1: Dry run

From the repo root, with the Backend venv active:

```sh
python Backend/scripts/seed_demo.py --dry-run
```

Zero network calls, no password needed. It prints the full plan: every API
call it would make, and the join-code SQL reminder. Confirm each of the
four movements shows a `music: score.mxl` line and `pieces skipped:
(none)`.

---

## Step 2: Seed production

Still from the repo root, with the Backend venv active. This writes to the
production database and object storage: it creates the `demo-admin`
account, the "Divisi Demo Choir" group, uploads and distributes the four
movements, and adds the homework / weekly note / responsibilities content.

```sh
DEMO_ADMIN_PASSWORD='<pick-and-keep-a-strong-password>' \
  python Backend/scripts/seed_demo.py
```

Notes:

- Pick the `demo-admin` password now and store it (password manager). You
  need it again for any re-run.
- The script is idempotent. If it fails partway (Render cold start,
  network), just run it again; it re-uses whatever already exists.
- Save the **group id** it prints in the `== join code ==` and
  `== summary ==` sections. Step 3 needs it.

---

## Step 3: Set the join code

Group creation always mints a random join code and there is no API to
change it. Set the memorable one with a single statement against the
production Neon database, via the Neon SQL editor or `psql`:

```sql
UPDATE groups SET join_code = 'DEMOSATB' WHERE id = '<group id from Step 2>';
```

`groups.join_code` is unique; `DEMOSATB` is 8 chars from the allowed
alphabet (`Backend/app/core/join_codes.py`), so this will not collide with
a real group's generated code.

Re-run `python Backend/scripts/seed_demo.py --dry-run` afterward: the
`== join code ==` section should now say `already 'DEMOSATB', nothing to
do`.

**Optional, unlocks "Preview Admin" (B20):** set `DEMO_JOIN_CODE=DEMOSATB`
on Render and restart the service. This is the only group the read-only
Admin preview ever offers itself on (`Backend/plan.md`'s B20); leaving it
unset (the default) keeps that feature off entirely, everywhere, with no
other consequence for the demo.

---

## Step 4: Deploy the frontend

The "Try the demo" button on `/welcome` ships with a normal frontend
deploy (see `Frontend/plan.md` / the deploy memory):

```sh
cd Frontend
npm run build
npx wrangler deploy
```

---

## Step 5: Verify

1. Open <https://divisi.maripi.net/join/DEMOSATB> in a private window (no
   session). You should land on the demo group's guest page with the four
   movements listed under Tracks.
2. Open a movement and confirm the score renders and audio plays in sync,
   and the per-part controls work.
3. Check the Homework and Responsibilities tabs are populated.
4. Load <https://divisi.maripi.net/welcome> and confirm the "Try the demo"
   button appears and lands on the same page.

---

## Re-running and teardown

- **Add or replace a movement later:** drop files in the folder (and update
  `PIECES` if needed), then re-run Step 2. Already-seeded pieces are
  skipped.
- **Reset the demo entirely:** delete the "Divisi Demo Choir" group from
  its group settings page while logged in as `demo-admin`, then re-run
  from Step 2 (you will get a new random join code, so redo Step 3).
- The `demo-admin` account is a normal user account. Keep its password
  private; anyone with it can edit the demo group.
