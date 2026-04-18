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
MSGS=""  # commit messages for range mode (scanned separately, no allowlist)
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
    # Commit messages are not prefixed with + in git log -p output — scan them separately
    MSGS=$(git log --format='%B' "$MODE" 2>/dev/null | tr -d '\r')
    ;;
esac

# Strip CR (defends against CRLF files bypassing ^[+] match)
DIFF=$(printf '%s' "$DIFF" | tr -d '\r')

# For --msg mode: the whole file is the target, no ^[+] filter
if [ "$MODE" = "--msg" ]; then
  ADDED="$DIFF"
else
  ADDED=$(printf '%s\n' "$DIFF" | grep -E '^[+]' | grep -v '^+++' || true)
fi

# Apply allowlist: drop lines whose source file matches any allowlisted path.
# Security: a real `+++ b/<path>` header is ALWAYS preceded by a `--- ` line in unified diff.
# We track the previous line type to reject content lines that start with `+++ b/`
# (which would otherwise be parsed as a fake header, granting allowlist to lines below).
if [ -f "$ALLOWLIST" ] && [ -s "$ALLOWLIST" ] && [ "$MODE" != "--msg" ]; then
  FILTERED=""
  CURRENT_FILE=""
  SKIP=0
  PREV_KIND=""  # "dash" after seeing "--- " line; anything else resets
  while IFS= read -r line; do
    case "$line" in
      '--- '*)
        PREV_KIND="dash"
        ;;
      '+++ b/'*)
        if [ "$PREV_KIND" = "dash" ]; then
          # Real file header — update current file and allowlist check
          CURRENT_FILE="${line#+++ b/}"
          SKIP=0
          while IFS= read -r allowed_path; do
            [ -z "$allowed_path" ] && continue
            case "$allowed_path" in '#'*) continue ;; esac
            # Exact file match OR directory prefix (not substring — prevents .sh.bak bypass)
            case "$CURRENT_FILE" in
              "$allowed_path"|"$allowed_path"/*) SKIP=1; break ;;
            esac
          done < "$ALLOWLIST"
          PREV_KIND=""
        else
          # Content line that starts with `+++ b/` — treat as added content, not a header
          [ "$SKIP" != "1" ] && FILTERED="${FILTERED}${line}"$'\n'
          PREV_KIND=""
        fi
        ;;
      '+'*)
        [ "$SKIP" != "1" ] && FILTERED="${FILTERED}${line}"$'\n'
        PREV_KIND=""
        ;;
      *)
        PREV_KIND=""
        ;;
    esac
  done < <(printf '%s\n' "$DIFF")
  ADDED="$FILTERED"
fi

# Scan helper: run all hard patterns against a string, collect hits
scan_content() {
  local content="$1"
  local local_hits=""
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    MATCH=$(printf '%s\n' "$content" | grep -iE "$pat" || true)
    [ -n "$MATCH" ] && local_hits="${local_hits}${MATCH}"$'\n'
  done <<< "$HARD_PATTERNS"
  KAKA=$(printf '%s\n' "$content" | grep -iF 'Kaka Mukaka' || true)
  [ -n "$KAKA" ] && local_hits="${local_hits}${KAKA}"$'\n'
  INGURO_ALL=$(printf '%s\n' "$content" | grep -iE "$INGURO_EXTRA" || true)
  INGURO_HITS=$(printf '%s\n' "$INGURO_ALL" | grep -ivE "$INGURO_ALLOW" || true)
  [ -n "$INGURO_HITS" ] && local_hits="${local_hits}${INGURO_HITS}"$'\n'
  printf '%s' "$local_hits"
}

HITS=$(scan_content "$ADDED")

# Also scan commit messages for range mode (no allowlist — messages have no file path)
if [ -n "$MSGS" ]; then
  MSG_HITS=$(scan_content "$MSGS")
  [ -n "$MSG_HITS" ] && HITS="${HITS}${MSG_HITS}"
fi

if [ -n "$HITS" ]; then
  printf '%s\n' "$HITS" | head -20
  exit 1
fi

exit 0
