#!/usr/bin/env bash
# Manual verification helper: logs into the real Backend with the test
# credentials in ../.env.local, then downloads one piece's PDF so it can be
# inspected locally (pdffonts / pdfimages) — used to confirm the "PDF renders
# white" report is a scanned/JBIG2 PDF that pdfjs v6 can't decode without a
# wasmUrl (see src/lib/components/PdfView.svelte).
#
# Usage:  scripts/fetch-prod-pdf.sh <piece-id> [out.pdf]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
set -a; source "$here/.env.local"; set +a
source_env="$here/.env"; [ -f "$source_env" ] && { set -a; source "$source_env"; set +a; }

: "${PUBLIC_API_BASE_URL:?set in Frontend/.env}"
: "${TEST_USER_EMAIL:?set in Frontend/.env.local}"
: "${TEST_USER_PASSWORD:?set in Frontend/.env.local}"

piece_id="${1:?usage: fetch-prod-pdf.sh <piece-id> [out.pdf]}"
out="${2:-$here/../$piece_id.pdf}"

token="$(curl -sS -X POST "$PUBLIC_API_BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')"

version_id="$(curl -sS "$PUBLIC_API_BASE_URL/library/pieces" \
  -H "Authorization: Bearer $token" \
  | python3 -c "import sys,json; print(next(e['version_id'] for e in json.load(sys.stdin) if e['piece_id']=='$piece_id'))")"

curl -sS "$PUBLIC_API_BASE_URL/library/versions/$version_id/pdf" \
  -H "Authorization: Bearer $token" -o "$out"

echo "wrote $out"
file "$out"
if command -v pdffonts >/dev/null; then echo "--- pdffonts ---"; pdffonts "$out" || true; fi
if command -v pdfimages >/dev/null; then echo "--- pdfimages -list ---"; pdfimages -list "$out" || true; fi
echo "--- image filters (grep) ---"
strings "$out" | grep -oE "/(JBIG2Decode|DCTDecode|JPXDecode|CCITTFaxDecode)" | sort | uniq -c || true
