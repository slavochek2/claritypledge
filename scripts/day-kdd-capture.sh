#!/bin/bash
# scripts/day-kdd-capture.sh — which infra commits since a time have no decision entry (P1647).
#
# Usage: scripts/day-kdd-capture.sh --since <git date> [--repo <dir>] [--decisions-cmd <cmd>]
#
# Lists commits since the given time that touch infra paths (supabase/migrations/, .env*,
# .mcp.json, mcp-*.json, .claude/rules/, CLAUDE.md, scripts/, docs/technical/). For each commit the
# P-numbers in the subject (p[0-9]+, any case) are looked up in the decision logs. A P-number is
# captured when the decisions command finds it. A commit naming no P-number is uncaptured, by short sha.
#
# The decisions command is run as: <cmd> "<Pnnnn>" 1  (default: scripts/search-decisions.sh in the repo).
# Its contract: exit 0 = search completed (output with a hit line means found, status-only output means
# none); any other exit = the search failed, and this script exits 2. A failed search is never "captured".
# Hit detection: any output line that is not a status line (the "PRIVATE LOG:" line) counts as a hit.
#
# Output (no pipe or angle-bracket characters):
#   CAPTURED <pN>
#   UNCAPTURED <pN or sha> <subject>
#   KDD-STATUS ok | KDD-STATUS uncaptured <count>
# Exit 0 when it ran, 2 on error.

SINCE=""; REPO=""; DCMD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --decisions-cmd) DCMD="${2:-}"; shift 2 ;;
    *) echo "day-kdd-capture: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SINCE" ] || { echo "usage: day-kdd-capture.sh --since DATE [--repo DIR] [--decisions-cmd CMD]" >&2; exit 2; }
[ -n "$REPO" ] || REPO="$(cd "$(dirname "$0")/.." && pwd)"
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "day-kdd-capture: not a git repo: $REPO" >&2; exit 2; }
[ -n "$DCMD" ] || DCMD="$REPO/scripts/search-decisions.sh"

# One record per commit: short sha, tab, subject. Commits on HEAD, since the given time.
COMMITS="$(cd "$REPO" && git log --since="$SINCE" --format='%h%x09%s' -- \
  supabase/migrations/ ':(glob).env*' ':(glob)**/.env*' .mcp.json ':(glob)mcp-*.json' \
  .claude/rules/ CLAUDE.md scripts/ docs/technical/)" || { echo "day-kdd-capture: git log failed" >&2; exit 2; }

declare -a seen_p
captured_p() { local p; for p in "${seen_p[@]}"; do [ "$p" = "$1" ] && return 0; done; return 1; }

# decision_hit <Pnnnn>: 0 hit, 1 none, 2 search failed
decision_hit() {
  local out rc
  out="$(cd "$REPO" && sh -c "$DCMD \"\$0\" 1" "$1" 2>/dev/null)"; rc=$?
  [ "$rc" -eq 0 ] || return 2
  printf '%s\n' "$out" | grep -v '^PRIVATE LOG:' | grep -q . && return 0
  return 1
}

uncaptured=0
declare -a out_lines
declare -a checked_p checked_r
cached() { local i; for i in "${!checked_p[@]}"; do [ "${checked_p[$i]}" = "$1" ] && { echo "${checked_r[$i]}"; return 0; }; done; return 1; }

while IFS="$(printf '\t')" read -r sha subject; do
  [ -n "$sha" ] || continue
  # P-numbers in the subject, lower-cased and de-duplicated
  pnums="$(printf '%s\n' "$subject" | grep -oiE 'p[0-9]+' | tr 'A-Z' 'a-z' | sort -u)"
  clean_subject="$(printf '%s' "$subject" | tr -d '|<>')"
  if [ -z "$pnums" ]; then
    out_lines+=("UNCAPTURED $sha $clean_subject"); uncaptured=$((uncaptured+1)); continue
  fi
  for p in $pnums; do
    r="$(cached "$p")" || {
      # decisions use the upper-case form, e.g. P1634
      upper="$(printf '%s' "$p" | tr 'p' 'P')"
      decision_hit "$upper"; r=$?
      checked_p+=("$p"); checked_r+=("$r")
    }
    case "$r" in
      0) captured_p "$p" || { seen_p+=("$p"); out_lines+=("CAPTURED $p"); } ;;
      1) out_lines+=("UNCAPTURED $p $clean_subject"); uncaptured=$((uncaptured+1)) ;;
      *) echo "day-kdd-capture: decisions search failed for $p; refusing to guess" >&2; exit 2 ;;
    esac
  done
done <<EOF
$COMMITS
EOF

for l in "${out_lines[@]}"; do echo "$l"; done
if [ "$uncaptured" -eq 0 ]; then echo "KDD-STATUS ok"; else echo "KDD-STATUS uncaptured $uncaptured"; fi
exit 0
