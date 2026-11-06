#!/bin/bash
# scripts/day-ops-reverify.sh — re-verify open alert issues by running their own check (P1647).
#
# Usage: gh issue list --state open --limit 50 --json number,title,labels,createdAt | scripts/day-ops-reverify.sh
#
# Reads the issue list on stdin only. Never calls gh, never closes, edits or comments on an issue.
# For each issue, matched by its ORIGINAL exact title (sanitizing happens only for output), it runs the
# local equivalent of the gate that raised it:
#   "Supply-chain audit: FINDING or INCOMPLETE on main" -> dep-audit.sh on a clean `git archive origin/main`
#       export, after `git fetch origin main` (the alert is about GitHub's main, not the local one;
#       a failed fetch is an error, never clean)
#   "Deploy drift detected on prod"                     -> check-deploy-manifest.sh --env prod
# Any other title has no local equivalent: it is reported FILE unmatched (nothing is assumed clean).
# Issues labelled p1155* belong to the cp.signups routing: PASSTHROUGH, not touched.
#
# Output (one line per issue, no pipe or angle-bracket characters; the day report strips them):
#   CLEAN <number> <createdAt|unknown> <title>
#   FILE <number> <createdAt|unknown> <dirty|error|timeout|unmatched> <title>
#   PASSTHROUGH <number>
#   ISSUE <number> <title>           one per issue received (the plain list, so one gh call serves the run)
#   OPS-STATUS ok|problem            (problem when any FILE line was printed; PASSTHROUGH ignored)
#   TRUNCATION-POSSIBLE 50           (only when exactly 50 issues arrived)
# Exit 0 when it ran (even with FILE lines); 2 on unparseable input.
#
# Test seams: P1647_SUPPLY_CMD / P1647_DRIFT_CMD replace the equivalent (run via sh -c);
# P1647_TIMEOUT is the per-equivalent limit in seconds (default 900); P1647_ROOT points at another repo;
# P1647_ARCHIVE_REF replaces origin/main (tests only).
# A failed or timed-out equivalent is never "clean" (spec invariant 1).

set -o pipefail

ROOT="${P1647_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TIMEOUT_S="${P1647_TIMEOUT:-900}"
ARCHIVE_REF="${P1647_ARCHIVE_REF:-origin/main}"

TMPD=""
BGPID=""
cleanup() { [ -n "$TMPD" ] && rm -rf "$TMPD"; TMPD=""; }
on_signal() {
  [ -n "$BGPID" ] && kill -TERM "$BGPID" 2>/dev/null
  cleanup
  exit "$1"
}
trap cleanup EXIT
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

INPUT="$(cat)"

# python3 validates and flattens the JSON to TSV: number, createdAt, passthrough(0/1), kind, title.
# kind is decided from the ORIGINAL title; only the printed title is sanitized.
ROWS="$(printf '%s' "$INPUT" | python3 -I -c '
import json, sys
SUPPLY = "Supply-chain audit: FINDING or INCOMPLETE on main"
DRIFT = "Deploy drift detected on prod"
def clean(s):
    return "".join(c for c in str(s) if c not in "|<>\t\r\n")
try:
    data = json.load(sys.stdin)
    assert isinstance(data, list)
    rows = []
    for i in data:
        num = int(i["number"])
        raw = i.get("title")
        title = "" if raw is None else str(raw)
        created = clean(i.get("createdAt") or "").strip().replace(" ", "") or "unknown"
        labels = [str(l.get("name", "")) if isinstance(l, dict) else str(l) for l in (i.get("labels") or [])]
        pt = 1 if any(l.lower().startswith("p1155") for l in labels) else 0
        kind = "supply" if title == SUPPLY else "drift" if title == DRIFT else "other"
        rows.append((num, created, pt, kind, clean(title) or "(no title)"))
except Exception as e:
    sys.stderr.write("day-ops-reverify: unparseable issue list: %s\n" % e)
    sys.exit(2)
for r in rows:
    print("%d\t%s\t%d\t%s\t%s" % r)
print("COUNT\t%d\t0\tx\tx" % len(rows))
')" || exit 2

# Run a command with a time limit, portably (macOS has no `timeout`). Exit 124 = timed out.
# The child gets its own process group so a hung grandchild is killed too. It runs in the background
# and is waited on, so a TERM or INT to this script is handled at once instead of after the child.
run_limited() {
  perl -e '
    my ($limit, @cmd) = @ARGV;
    my $pid = fork();
    die "fork failed" unless defined $pid;
    if ($pid == 0) { setpgrp(0, 0); exec @cmd or exit 127; }
    my $stop = sub { my $c = shift; kill("TERM", -$pid); sleep 1; kill("KILL", -$pid); waitpid($pid, 0); exit $c; };
    $SIG{ALRM} = sub { $stop->(124) };
    $SIG{TERM} = sub { $stop->(143) };
    $SIG{INT}  = sub { $stop->(130) };
    alarm $limit;
    waitpid($pid, 0);
    exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
  ' "$TIMEOUT_S" "$@" </dev/null &
  BGPID=$!
  wait "$BGPID"
  local rc=$?
  BGPID=""
  return $rc
}

# Built-in equivalents. Each returns the equivalent's own exit code.
supply_equivalent() {
  local rc
  # The alert is about GitHub's main. A failed fetch means we cannot say, so it is an error.
  # The fetch runs under the same time limit, so a stalled network cannot hang /day.
  run_limited git -C "$ROOT" fetch origin main --quiet; rc=$?
  [ "$rc" -eq 124 ] && return 124
  [ "$rc" -eq 0 ] || return 99
  TMPD="$(mktemp -d "${TMPDIR:-/tmp}/p1647-export.XXXXXX")" || return 99
  if ! git -C "$ROOT" archive "$ARCHIVE_REF" </dev/null | tar -x -C "$TMPD"; then cleanup; return 99; fi
  run_limited bash -c 'cd "$1" && exec bash scripts/dep-audit.sh >/dev/null 2>&1' _ "$TMPD"; rc=$?
  cleanup
  return $rc
}
drift_equivalent() {
  # The checker ignores a failed fetch and falls back to a cached origin/main (P820); a re-check that
  # could not refresh has not established current state, so a failed fetch is an error here (P1647).
  local rc
  run_limited git -C "$ROOT" fetch origin main --quiet; rc=$?
  [ "$rc" -eq 124 ] && return 124
  [ "$rc" -eq 0 ] || return 2
  run_limited bash -c 'cd "$1" && exec ./scripts/check-deploy-manifest.sh --env prod >/dev/null 2>&1' _ "$ROOT"
}

# Run an equivalent (override command or built-in); sets VERDICT to clean|dirty|error|timeout.
# Not a command substitution: a subshell would defer a TERM until the (minutes-long) audit finished.
VERDICT=""
verdict() {
  local kind="$1" override="$2" rc
  if [ -n "$override" ]; then
    run_limited sh -c "$override"; rc=$?
  else
    "${kind}_equivalent"; rc=$?
  fi
  case "$rc" in
    0) VERDICT=clean ;;
    1) VERDICT=dirty ;;
    124) VERDICT=timeout ;;
    *) VERDICT=error ;;
  esac
}

problem=0
count=0
declare -a issue_lines
while IFS="$(printf '\t')" read -r num created pt kind title; do
  [ -n "$num" ] || continue
  if [ "$num" = "COUNT" ]; then count="$created"; continue; fi
  issue_lines+=("ISSUE $num $title")
  if [ "$pt" = "1" ]; then echo "PASSTHROUGH $num"; continue; fi
  case "$kind" in
    supply) verdict supply "${P1647_SUPPLY_CMD:-}" </dev/null ;;
    drift)  verdict drift "${P1647_DRIFT_CMD:-}" </dev/null ;;
    *)      VERDICT=unmatched ;;
  esac
  if [ "$VERDICT" = "clean" ]; then
    echo "CLEAN $num $created $title"
  else
    echo "FILE $num $created $VERDICT $title"
    problem=1
  fi
done <<EOF
$ROWS
EOF

for l in "${issue_lines[@]}"; do echo "$l"; done
if [ "$problem" -eq 0 ]; then echo "OPS-STATUS ok"; else echo "OPS-STATUS problem"; fi
if [ "$count" -eq 50 ]; then echo "TRUNCATION-POSSIBLE 50"; fi
exit 0
