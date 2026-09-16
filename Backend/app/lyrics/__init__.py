"""Admin-triggered lyric generation: pull sung lyrics off a piece's PDF
text layer and inject them into its MusicXML as <lyric> elements.

MusicXML/`.mxl`-sourced pieces only (a MIDI file carries no notated
text); PDFs with no real text layer (scans) are refused rather than run
through any image OCR. See `app/api/routes/library/lyrics.py` for the
route that wires these three modules together:

- `extract.py`: PyMuPDF word-token extraction from the PDF, plus the
  "no text layer" scan detection.
- `groq_client.py`: sends those tokens to Groq to classify them into
  per-voice sung syllables.
- `inject.py`: deterministic sequential alignment of those syllables
  onto a music21 Score's note onsets, per voice part.
"""
