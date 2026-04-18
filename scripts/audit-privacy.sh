#!/bin/bash
# scripts/audit-privacy.sh — privacy audit for any git range / staged changes / message file.
# Exit 0 = clean, 1 = hits found, 2 = bad input.
# Modes:
#   --staged                    # scan staged diff (for pre-commit)
#   --msg <file>                # scan a commit-message file (for commit-msg hook)
#   <range>                     # scan git log -p <range> (for pre-push and manual audits)

# No `set -euo pipefail` — we catch errors explicitly. `|| true` on grep is intentional.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo"; exit 2; }
ALLOWLIST="$REPO_ROOT/.privacy-allowlist"

# Hard patterns. Using POSIX bracket-class boundaries [[:<:]]...[[:>:]] (BSD + GNU compatible).
# Single-line each — no literal spaces that could trip command-line parsing.
# NOTE: `Kaka Mukaka` has a literal space — handled as a separate grep call below.
read -r -d '' HARD_PATTERNS <<'EOF' || true
[[:<:]]slavochek@(googlemail|gmail)\.com[[:>:]]
slavochek[+][a-zA-Z0-9]+@(googlemail|gmail)\.com
[[:<:]]slavochek246[[:>:]]
/Users/slavochek/
EOF

# @inguro.com: allow slava@inguro.com only
INGURO_EXTRA='[a-zA-Z0-9._-]+@inguro\.com'
INGURO_ALLOW='slava@inguro\.com'

MODE="${1:-}"
case "$MODE" in
  --staged)
    DIFF=$(git diff --cached -- . ':(exclude)package-lock.json' ':(exclude)*.lock' 2>/dev/null)
    ;;
  --msg)
    shift
    MSG_FILE="${1:-}"
    [ -f "$MSG_FILE" ] || { echo "audit-privacy: message file not found: $MSG_FILE" >&2; exit 2; }
    DIFF=$(cat "$MSG_FILE")
    ;;
  '' | --help | -h)
    echo "Usage: $0 <range> | --staged | --msg <file>"
    exit 2
    ;;
  *)
    # Validate the range
    git rev-parse --verify "$MODE" >/dev/null 2>&1 || {
      # It could be a range like A..B — extract endpoints and verify each
      BASE="${MODE%..*}"
      TIP="${MODE#*..}"
      [ -n "$BASE" ] && [ -n "$TIP" ] && \
        git rev-parse --verify "$BASE" >/dev/null 2>&1 && \
        git rev-parse --verify "$TIP" >/dev/null 2>&1 || {
          echo "audit-privacy: invalid range '$MODE'" >&2
          exit 2
        }
    }
    DIFF=$(git log -p "$MODE" -- . ':(exclude)package-lock.json' ':(exclude)*.lock' 2>/dev/null)
    ;;
esac

# Strip CR (defends against CRLF files bypassing ^\+ match)
DIFF=$(printf '%s' "$DIFF" | tr -d '\r')

# For --msg mode: the whole file is the target, no `^\+` filter
if [ "$MODE" = "--msg" ]; then
  ADDED="$DIFF"
else
  ADDED=$(printf '%s\n' "$DIFF" | grep -E '^[+]' | grep -v '^+++' || true)
fi

# Apply allowlist: drop lines whose source file matches any allowlisted substring
if [ -f "$ALLOWLIST" ] && [ -s "$ALLOWLIST" ] && [ "$MODE" != "--msg" ]; then
  FILTERED=""
  CURRENT_FILE=""
  SKIP=0
  while IFS= read -r line; do
    case "$line" in
      '+++ b/'*)
        CURRENT_FILE="${line#+++ b/}"
        SKIP=0
        while IFS= read -r allowed_path; do
          [ -z "$allowed_path" ] && continue
          case "$allowed_path" in '#'*) continue ;; esac
          case "$CURRENT_FILE" in
            *"$allowed_path"*) SKIP=1; break ;;
          esac
        done < "$ALLOWLIST"
        ;;
      '+'*)
        if [ "$SKIP" != "1" ]; then
          FILTERED="${FILTERED}${line}
"
        fi
        ;;
    esac
  done < <(printf '%s\n' "$DIFF")
  ADDED="$FILTERED"
fi

# Run all hard patterns. Collect hits.
HITS=""
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  MATCH=$(printf '%s\n' "$ADDED" | grep -iE "$pat" || true)
  [ -n "$MATCH" ] && HITS="${HITS}${MATCH}
"
done <<< "$HARD_PATTERNS"

# Literal-phrase patterns (separated because they contain spaces)
KAKA=$(printf '%s\n' "$ADDED" | grep -iF 'Kaka Mukaka' || true)
[ -n "$KAKA" ] && HITS="${HITS}${KAKA}
"

# @inguro.com: find all, filter out allowed
INGURO_ALL=$(printf '%s\n' "$ADDED" | grep -iE "$INGURO_EXTRA" || true)
INGURO_HITS=$(printf '%s\n' "$INGURO_ALL" | grep -ivE "$INGURO_ALLOW" || true)
[ -n "$INGURO_HITS" ] && HITS="${HITS}${INGURO_HITS}
"

if [ -n "$HITS" ]; then
  echo "$HITS" | head -20
  exit 1
fi

exit 0
