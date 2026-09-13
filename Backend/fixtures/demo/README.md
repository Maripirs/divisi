# Demo choir source files

Source scores for the "Divisi Demo Choir" showcase group that
`Backend/scripts/seed_demo.py` uploads to the live backend. The seed script
reads this folder; nothing else does.

## Layout

One folder per piece, named exactly by the piece's `slug` in the seed
script's `PIECES` manifest. Current contents: four movements of Mozart's
Requiem, K. 626, each as a compressed-MusicXML `.mxl` plus a PDF.

```
fixtures/demo/
  kyrie/
    score.mxl          # the music file (see below)
    score.pdf          # optional but wanted for every piece
  domine-jesu/
    score.mxl
    score.pdf
  lacrimosa/
    score.mxl
    score.pdf
  agnus-dei/
    score.mxl
    score.pdf
```

The script does **not** care about the exact filenames, only the
extensions. Per folder it takes:

- **One music file**, picking the first it finds in this preference order:
  `.mid`, `.midi`, `.mxl`, `.musicxml`, `.xml`. A `.mid`/`.midi` is
  preferred because it can also drive the server-side per-part stem mixer;
  a `.mxl`/`.musicxml` still plays, parsed in the browser. If no music
  file is present the whole piece is skipped (with a warning); the rest of
  the demo still seeds.
- **One PDF** (`.pdf`), optional. When present it becomes the piece's
  score-reference view.

So `score.mxl` + `score.pdf` and `audio.mid` + `score.pdf` are both fine;
so is `MozartKyrie.xml` + `MozartKyrie.pdf`.

## Licensing

These get uploaded to a publicly-reachable demo, so every file must come
from a public-domain or freely-licensed source. Mozart's Requiem itself is
public domain (Mozart d. 1791, Sussmayr d. 1803); use notation files from
a public-domain / Creative Commons / CPDL edition or a CC0 MuseScore
export, not a scan of a modern copyrighted engraving.

## Not committed

These are third-party score files pulled in by hand for the demo, not repo
fixtures. Keep them out of version control (add `fixtures/demo/*/` to
`.gitignore` if it is not already) so the repo does not carry redistributed
editions. This README is the only file here that is tracked.
