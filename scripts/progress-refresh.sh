#!/usr/bin/env bash
# Regenerates the AUTO block in docs/progress.md (prod counts + repo counts).
# Read-only against prod (anon key; RLS is the security boundary — .claude/rules/db-access.md).
# Usage:
#   ./scripts/progress-refresh.sh          # print the block to stdout
#   ./scripts/progress-refresh.sh --write  # replace the AUTO block in docs/progress.md + stamp Last verified
# Env file override (mainly for failure-path testing): ENV_FILE=path ./scripts/progress-refresh.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.prod}"
DOC="docs/progress.md"

[ -f "$ENV_FILE" ] || { echo "ERROR: env file not found: $ENV_FILE" >&2; exit 1; }
URL=$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2)
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' "$ENV_FILE" | cut -d= -f2)
[ -n "$URL" ] && [ -n "$KEY" ] || { echo "ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in $ENV_FILE" >&2; exit 1; }

count() { # count <table> -> exact row count via REST content-range
  local cr
  cr=$(curl -sf -I "$URL/rest/v1/$1?select=id" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Prefer: count=exact" -H "Range: 0-0" | tr -d '\r' | grep -i '^content-range:' | sed 's|.*/||')
  [[ "$cr" =~ ^[0-9]+$ ]] || { echo "ERROR: count failed for table $1" >&2; exit 1; }
  echo "$cr"
}

USERS=$(count profiles)
SESSIONS=$(count clarity_sessions)
VERIFICATIONS=$(count story_verifications)
DECISIONS=$(grep -c '^## 20' docs/decisions.md)
HYPS=$(grep -c '^| H-' docs/hypotheses.md)
P0=$(grep '^| H-' docs/hypotheses.md | grep -c 'P0')
TODAY=$(date +%Y-%m-%d)

BLOCK="<!-- AUTO:BEGIN -->
- Registered users (prod \`profiles\`): **$USERS**
- /live sessions (prod \`clarity_sessions\`): **$SESSIONS**
- Story verifications (prod \`story_verifications\`): **$VERIFICATIONS**
- Clarity letters: RLS-protected from anonymous reads — last published figure: 18 (2026-06-02, decisions.md)
- Dated decision entries ([decisions.md](decisions.md)): **$DECISIONS**
- Hypotheses registered ([hypotheses.md](hypotheses.md)): **$HYPS** (**$P0** active P0)
<!-- AUTO:END -->"

if [ "${1:-}" = "--write" ]; then
  [ -f "$DOC" ] || { echo "ERROR: $DOC not found" >&2; exit 1; }
  TMP=$(mktemp); BLOCK_FILE=$(mktemp)
  printf '%s\n' "$BLOCK" > "$BLOCK_FILE"
  awk -v bf="$BLOCK_FILE" '
    /<!-- AUTO:BEGIN -->/ { while ((getline line < bf) > 0) print line; skip=1; next }
    /<!-- AUTO:END -->/   { skip=0; next }
    skip { next }
    { print }
  ' "$DOC" | sed "s/^\*\*Last verified:\*\* [0-9-]*/**Last verified:** $TODAY/" > "$TMP"
  rm -f "$BLOCK_FILE"
  grep -q 'AUTO:BEGIN' "$TMP" || { echo "ERROR: AUTO block lost during rewrite — aborting" >&2; rm -f "$TMP"; exit 1; }
  mv "$TMP" "$DOC"
  echo "Updated $DOC (Last verified: $TODAY)"
else
  echo "$BLOCK"
fi
