#!/bin/bash
# scripts/day-kdd-capture.sh — which infra commits since a time have no decision entry (P1647).
#
# Usage: scripts/day-kdd-capture.sh --since <ISO-8601 date or datetime> [--repo <dir>] [--decisions-cmd <executable>]
#
# Lists commits since the given time that touch infra paths (supabase/migrations/, .env*,
# .mcp.json, mcp-*.json, .claude/rules/, CLAUDE.md, scripts/, docs/technical/).
# P-numbers are taken from the commit subject: a standalone token P plus 3 to 5 digits (so "http2" and
# "step1" never count). A commit is captured when ANY of its P-numbers has a decision entry (spec
# Solution 4). A commit naming no P-number is uncaptured, listed by short sha.
#
# The decisions command is an executable path (never shell-split, so a path with spaces works), run as:
#   <cmd> '<bounded ERE for Pnnnn>' 1      default: scripts/search-decisions.sh in the repo
# Its contract: exit 0 = the search completed; a line other than the "PRIVATE LOG:" status line means a
# hit. Any other exit = the search failed and this script exits 2: a failed search is never "captured".
#
# Output (no pipe or angle-bracket characters), one line per distinct item:
#   CAPTURED <pN>
#   UNCAPTURED <pN or sha> <subject>
#   KDD-STATUS ok | KDD-STATUS uncaptured <count of distinct uncaptured items>
# Exit 0 when it ran, 2 on error (including an invalid --since: it fails closed).

SINCE=""; REPO=""; DCMD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --since|--repo|--decisions-cmd)
      [ $# -ge 2 ] || { echo "day-kdd-capture: $1 needs a value" >&2; exit 2; }
      case "$1" in --since) SINCE="$2" ;; --repo) REPO="$2" ;; --decisions-cmd) DCMD="$2" ;; esac
      shift 2 ;;
    *) echo "day-kdd-capture: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SINCE" ] || { echo "usage: day-kdd-capture.sh --since DATE [--repo DIR] [--decisions-cmd EXE]" >&2; exit 2; }

# --since must be a real ISO-8601 date or datetime. git's own parser accepts nonsense ("banana") and
# overflows on far-future years, either of which would silently change what is checked.
printf '%s' "$SINCE" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}:?[0-9]{2})?)?$' \
  || { echo "day-kdd-capture: --since is not an ISO-8601 date or datetime: $SINCE" >&2; exit 2; }
python3 -I -c 'import sys,datetime; s=sys.argv[1].replace(" ","T").replace("Z","+00:00"); datetime.datetime.fromisoformat(s if "T" in s else s[:10])' "$SINCE" </dev/null 2>/dev/null \
  || { echo "day-kdd-capture: --since is not a real calendar date: $SINCE" >&2; exit 2; }

[ -n "$REPO" ] || REPO="$(cd "$(dirname "$0")/.." && pwd)"
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 </dev/null || { echo "day-kdd-capture: not a git repo: $REPO" >&2; exit 2; }
[ -n "$DCMD" ] || DCMD="$REPO/scripts/search-decisions.sh"
[ -x "$DCMD" ] || { echo "day-kdd-capture: decisions command is not executable: $DCMD" >&2; exit 2; }

# One record per commit: short sha, tab, subject.
COMMITS="$(cd "$REPO" && git log --since="$SINCE" --format='%h%x09%s' -- \
  supabase/migrations/ ':(glob).env*' ':(glob)**/.env*' .mcp.json ':(glob)mcp-*.json' \
  .claude/rules/ CLAUDE.md scripts/ docs/technical/ </dev/null)" || { echo "day-kdd-capture: git log failed" >&2; exit 2; }

# decision_hit <pN>: 0 hit, 1 none, 2 search failed. The pattern is bounded on both sides, so
# P163 never matches P1635 and P1001 never matches P10010. Results are cached per P-number.
declare -a cache_p cache_r
decision_hit() {
  local p="$1" i out rc upper pattern
  for i in "${!cache_p[@]}"; do [ "${cache_p[$i]}" = "$p" ] && return "${cache_r[$i]}"; done
  upper="P${p#p}"
  pattern="(^|[^0-9A-Za-z])${upper}([^0-9]|\$)"
  out="$(cd "$REPO" && "$DCMD" "$pattern" 1 </dev/null 2>/dev/null)"; rc=$?
  if [ "$rc" -ne 0 ]; then rc=2
  elif printf '%s\n' "$out" | grep -v '^PRIVATE LOG:' | grep -q .; then rc=0
  else rc=1; fi
  cache_p+=("$p"); cache_r+=("$rc")
  return "$rc"
}

declare -a out_lines seen_items
uncaptured=0
seen() { local x; for x in "${seen_items[@]}"; do [ "$x" = "$1" ] && return 0; done; return 1; }

while IFS="$(printf '\t')" read -r sha subject; do
  [ -n "$sha" ] || continue
  clean_subject="$(printf '%s' "$subject" | tr -d '|<>')"
  pnums="$(perl -e 'while ($ARGV[0] =~ /(?<![A-Za-z0-9])[Pp]([0-9]{3,5})(?![0-9A-Za-z])/g) { print "p$1\n" }' "$subject" </dev/null 2>/dev/null | sort -u)"
  if [ -z "$pnums" ]; then
    seen "$sha" || { seen_items+=("$sha"); out_lines+=("UNCAPTURED $sha $clean_subject"); uncaptured=$((uncaptured+1)); }
    continue
  fi
  hits=""; misses=""
  for p in $pnums; do
    decision_hit "$p"; r=$?
    case "$r" in
      0) hits="$hits $p" ;;
      1) misses="$misses $p" ;;
      *) echo "day-kdd-capture: decisions search failed for $p; refusing to guess" >&2; exit 2 ;;
    esac
  done
  if [ -n "$hits" ]; then
    # captured when any P-number has an entry
    for p in $hits; do seen "C$p" || { seen_items+=("C$p"); out_lines+=("CAPTURED $p"); }; done
  else
    for p in $misses; do
      seen "U$p" || { seen_items+=("U$p"); out_lines+=("UNCAPTURED $p $clean_subject"); uncaptured=$((uncaptured+1)); }
    done
  fi
done <<EOF
$COMMITS
EOF

for l in "${out_lines[@]}"; do echo "$l"; done
if [ "$uncaptured" -eq 0 ]; then echo "KDD-STATUS ok"; else echo "KDD-STATUS uncaptured $uncaptured"; fi
exit 0
