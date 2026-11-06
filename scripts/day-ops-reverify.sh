#!/bin/bash
# scripts/day-ops-reverify.sh — re-verify open alert issues by running their own check (P1647).
#
# Usage: gh issue list --state open --limit 50 --json number,title,labels,createdAt | scripts/day-ops-reverify.sh
#
# Reads the issue list on stdin only. Never calls gh, never closes, edits or comments on an issue.
# For each issue (by exact title) it runs the local equivalent of the gate that raised it:
#   "Supply-chain audit: FINDING or INCOMPLETE on main" -> dep-audit.sh on a clean `git archive main` export
#   "Deploy drift detected on prod"                     -> check-deploy-manifest.sh --env prod
# Any other title has no local equivalent: it is reported FILE unmatched (nothing is assumed clean).
# Issues labelled p1155* belong to the cp.signups routing: PASSTHROUGH, not touched.
#
# Output (one line per issue, no pipe or angle-bracket characters; the day report strips them):
#   CLEAN <number> <createdAt> <title>
#   FILE <number> <createdAt> <dirty|error|timeout|unmatched> <title>
#   PASSTHROUGH <number>
#   OPS-STATUS ok|problem            (problem when any FILE line was printed; PASSTHROUGH ignored)
#   TRUNCATION-POSSIBLE 50           (only when exactly 50 issues arrived)
# Exit 0 when it ran (even with FILE lines); 2 on unparseable input.
#
# Test seams: P1647_SUPPLY_CMD / P1647_DRIFT_CMD replace the equivalent (run via sh -c);
# P1647_TIMEOUT is the per-equivalent limit in seconds (default 900).
# A failed or timed-out equivalent is never "clean" (spec invariant 1).

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMEOUT_S="${P1647_TIMEOUT:-900}"

SUPPLY_TITLE="Supply-chain audit: FINDING or INCOMPLETE on main"
DRIFT_TITLE="Deploy drift detected on prod"

INPUT="$(cat)"

# python3 validates and flattens the JSON to TSV: number, createdAt, passthrough(0/1), title.
ROWS="$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    assert isinstance(data, list)
    rows = []
    for i in data:
        num = int(i["number"])
        title = str(i["title"])
        created = str(i.get("createdAt", ""))
        labels = [str(l.get("name", "")) if isinstance(l, dict) else str(l) for l in (i.get("labels") or [])]
        pt = 1 if any(l.lower().startswith("p1155") for l in labels) else 0
        rows.append((num, created, pt, title))
except Exception as e:
    sys.stderr.write("day-ops-reverify: unparseable issue list: %s\n" % e)
    sys.exit(2)
for num, created, pt, title in rows:
    clean = "".join(c for c in title if c not in "|<>\t\r\n")
    print("%d\t%s\t%d\t%s" % (num, created, pt, clean))
print("COUNT\t%d" % len(rows))
')" || exit 2

# Run a command with a time limit, portably (macOS has no `timeout`). Exit 124 = timed out.
# The child gets its own process group so a hung grandchild is killed too.
run_limited() {
  perl -e '
    my ($limit, @cmd) = @ARGV;
    my $pid = fork();
    die "fork failed" unless defined $pid;
    if ($pid == 0) { setpgrp(0, 0); exec @cmd or exit 127; }
    $SIG{ALRM} = sub { kill("TERM", -$pid); sleep 1; kill("KILL", -$pid); waitpid($pid, 0); exit 124; };
    alarm $limit;
    waitpid($pid, 0);
    exit($? & 127 ? 128 + ($? & 127) : $? >> 8);
  ' "$TIMEOUT_S" "$@"
}

# Built-in equivalents. Each returns the equivalent's own exit code.
supply_equivalent() {
  local tmp rc
  tmp="$(mktemp -d)" || return 99
  if ! git -C "$ROOT" archive main | tar -x -C "$tmp"; then rm -rf "$tmp"; return 99; fi
  ( cd "$tmp" && run_limited bash scripts/dep-audit.sh >/dev/null 2>&1 ); rc=$?
  rm -rf "$tmp"
  return $rc
}
drift_equivalent() {
  ( cd "$ROOT" && run_limited ./scripts/check-deploy-manifest.sh --env prod >/dev/null 2>&1 )
}

# Run an equivalent (override command or built-in) and print clean|dirty|error|timeout.
verdict() {
  local kind="$1" override="$2" rc
  if [ -n "$override" ]; then
    run_limited sh -c "$override" >/dev/null 2>&1; rc=$?
  else
    "${kind}_equivalent"; rc=$?
  fi
  case "$rc" in
    0) echo clean ;;
    1) echo dirty ;;
    124) echo timeout ;;
    *) echo error ;;
  esac
}

problem=0
count=0
while IFS="$(printf '\t')" read -r num created pt title; do
  [ -n "$num" ] || continue
  if [ "$num" = "COUNT" ]; then count="$created"; continue; fi
  if [ "$pt" = "1" ]; then echo "PASSTHROUGH $num"; continue; fi
  case "$title" in
    "$SUPPLY_TITLE") v="$(verdict supply "${P1647_SUPPLY_CMD:-}")" ;;
    "$DRIFT_TITLE")  v="$(verdict drift "${P1647_DRIFT_CMD:-}")" ;;
    *)               v=unmatched ;;
  esac
  if [ "$v" = "clean" ]; then
    echo "CLEAN $num $created $title"
  else
    echo "FILE $num $created $v $title"
    problem=1
  fi
done <<EOF
$ROWS
EOF

if [ "$problem" -eq 0 ]; then echo "OPS-STATUS ok"; else echo "OPS-STATUS problem"; fi
if [ "$count" -eq 50 ]; then echo "TRUNCATION-POSSIBLE 50"; fi
exit 0
