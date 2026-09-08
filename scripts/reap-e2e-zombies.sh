#!/usr/bin/env bash
#
# reap-e2e-zombies.sh — find, and optionally kill, leaked vite dev servers and
# Playwright processes left behind by e2e runs. (P1277, item 5)
#
# WHY ---------------------------------------------------------------------
# Two identical p683 runs took 4.5 minutes and 57.5 minutes, and a test that had
# passed twice failed in the slow one. Alive at that moment: 8 vite servers, the
# oldest 11 days old, and 59 playwright processes, the oldest 2 days.
# pre-commit-checks.sh has a "zombie Vite dev servers" check and it reported
# CLEAN throughout, because it only ever looked for one narrow shape.
# (docs/process-learnings.md, 2026-08-14.)
#
# THE KILL CRITERION — deliberately narrow, and this is the whole safety story.
# This machine runs many concurrent Claude sessions. Each owns dev servers and
# Playwright MCP processes that look exactly like leaked ones to any
# pattern-matcher. So a process is reapable only when it satisfies BOTH of:
#
#   1. It is one of the two known kinds:
#        vite       — a node process running a vite binary
#        playwright — a playwright TEST or browser-server process
#      and NOT playwright-mcp / @playwright/mcp, which belongs to a live Claude
#      session and is never touched, at any age, orphaned or not.
#
#   2. It is provably unowned:
#        orphan     — its parent is gone (PPID 1). Nothing is waiting on it, no
#                     shell can see it, no session will ever clean it up.
#      or, for a vite server only:
#        dead-cwd   — its working directory no longer exists, i.e. the worktree
#                     it was serving has been removed.
#
# An orphan must ALSO be older than --min-age-hours (default 2). A just-spawned
# process can be momentarily reparented to init during a legitimate handoff, and
# nothing here is urgent enough to race that.
#
# Everything else is left alone: a process with a live parent belongs to
# somebody, and this script has no way to know whether that somebody is mid-run.
# It under-reaps on purpose. Nothing here uses `pkill -f`, which cannot tell a
# port number in a path from a port number in a flag (CLAUDE.md).
#
# USAGE -------------------------------------------------------------------
#   ./scripts/reap-e2e-zombies.sh                 report what WOULD be reaped (default)
#   ./scripts/reap-e2e-zombies.sh --list          same, machine-readable, exit 1 if any
#   ./scripts/reap-e2e-zombies.sh --kill          actually signal them (TERM, then KILL)
#   ./scripts/reap-e2e-zombies.sh --min-age-hours 6
#   ./scripts/reap-e2e-zombies.sh --all           include non-reapable candidates in the report
#
# Exit: 0 nothing to reap · 1 candidates found (or, with --kill, some survived)
#
# TESTABILITY — REAP_PS_FIXTURE names a file holding `ps -eo pid=,ppid=,etime=,command=`
# output and REAP_CWD_FIXTURE a "<pid> <cwd>" table. When either is set the
# script CANNOT signal anything: --kill degrades to a report. That is what lets
# scripts/test-reap-e2e-zombies.sh exercise the classifier, including its kill
# branch, without a real process anywhere near it.
#
# Output contract (shell-safety.md, P783): no '>', '<' or '|' at word boundaries.

set -uo pipefail

MODE=report          # report | list | kill
MIN_AGE_HOURS=2
SHOW_ALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) MODE=list; shift ;;
    --kill) MODE=kill; shift ;;
    --all) SHOW_ALL=1; shift ;;
    --min-age-hours) MIN_AGE_HOURS="${2:-2}"; shift 2 ;;
    -h|--help) sed -n '2,60p' "$0"; exit 0 ;;
    *) echo "reap-e2e-zombies: unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$MIN_AGE_HOURS" in
  ''|*[!0-9]*) echo "reap-e2e-zombies: --min-age-hours must be a whole number" >&2; exit 2 ;;
esac
MIN_AGE_SECONDS=$((MIN_AGE_HOURS * 3600))

FIXTURE_MODE=0
if [[ -n "${REAP_PS_FIXTURE:-}" || -n "${REAP_CWD_FIXTURE:-}" ]]; then
  FIXTURE_MODE=1
  if [[ "$MODE" == kill ]]; then
    echo "reap-e2e-zombies: fixture mode — reporting only, no signal is sent" >&2
    MODE=report
  fi
fi

# ─── inputs ────────────────────────────────────────────────────────────────

ps_lines() {
  if [[ -n "${REAP_PS_FIXTURE:-}" ]]; then
    cat "$REAP_PS_FIXTURE"
  else
    ps -eo pid=,ppid=,etime=,command=
  fi
}

# cwd_of PID — empty when it cannot be determined. An empty answer never
# justifies a kill; only a directory that is known to be gone does.
cwd_of() {
  if [[ -n "${REAP_CWD_FIXTURE:-}" ]]; then
    awk -v p="$1" '$1 == p { $1 = ""; sub(/^ /, ""); print; exit }' "$REAP_CWD_FIXTURE"
  else
    # awk, not `sed -n | head -1`: under `pipefail` a consumer that stops at the
    # first match SIGPIPEs the producer and the pipeline reports 141 for a
    # successful lookup (epistemic.md gate 7). This drains lsof and keeps the
    # first n-line.
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null |
      awk '/^n/ { if (!found) { found = 1; line = substr($0, 2) } } END { if (found) print line }'
  fi
}

# etime_seconds ETIME — BSD ps prints [[dd-]hh:]mm:ss.
etime_seconds() {
  awk -v s="$1" '
    BEGIN {
      d = 0
      if (index(s, "-") > 0) { split(s, a, "-"); d = a[1]; s = a[2] }
      n = split(s, p, ":")
      if (n == 3)      t = p[1] * 3600 + p[2] * 60 + p[3]
      else if (n == 2) t = p[1] * 60 + p[2]
      else             t = p[1]
      print d * 86400 + t
    }'
}

# ─── classification ────────────────────────────────────────────────────────

# kind COMMAND — vite, playwright, or empty for "not ours".
kind_of() {
  local cmd="$1"
  # Never ours: the Playwright MCP server belongs to a live Claude session.
  case "$cmd" in
    *playwright-mcp*|*@playwright/mcp*|*"playwright/mcp"*) echo ""; return ;;
  esac
  case "$cmd" in
    *node_modules/.bin/vite*|*node_modules/vite/bin/vite.js*|*" vite"|*" vite "*)
      echo vite; return ;;
  esac
  case "$cmd" in
    *playwright*test*|*playwright*run-server*|*headless_shell*|*playwright-core*)
      echo playwright; return ;;
  esac
  echo ""
}

CANDIDATES=0
REAPABLE=0
REAP_PIDS=""

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  pid=$(printf '%s\n' "$line" | awk '{print $1}')
  ppid=$(printf '%s\n' "$line" | awk '{print $2}')
  etime=$(printf '%s\n' "$line" | awk '{print $3}')
  cmd=$(printf '%s\n' "$line" | awk '{ $1=""; $2=""; $3=""; sub(/^ +/, ""); print }')
  [[ "$pid" =~ ^[0-9]+$ ]] || continue

  kind="$(kind_of "$cmd")"
  [[ -z "$kind" ]] && continue
  CANDIDATES=$((CANDIDATES + 1))

  age=$(etime_seconds "$etime")
  reason=""
  if [[ "$ppid" == "1" && "$age" -ge "$MIN_AGE_SECONDS" ]]; then
    reason="orphan (PPID 1), age ${age}s"
  elif [[ "$kind" == "vite" ]]; then
    cwd="$(cwd_of "$pid")"
    if [[ -n "$cwd" && ! -d "$cwd" ]]; then
      reason="working directory is gone: ${cwd}"
    fi
  fi

  if [[ -n "$reason" ]]; then
    REAPABLE=$((REAPABLE + 1))
    REAP_PIDS="${REAP_PIDS}${REAP_PIDS:+ }${pid}"
    if [[ "$MODE" == list ]]; then
      echo "REAPABLE:${pid}:${kind}:${reason}"
    else
      echo "  reapable  pid ${pid}  ${kind}  — ${reason}"
    fi
  elif [[ "$SHOW_ALL" -eq 1 ]]; then
    if [[ "$MODE" == list ]]; then
      echo "KEEP:${pid}:${kind}:has a live parent (ppid ${ppid})"
    else
      echo "  keep      pid ${pid}  ${kind}  — has a live parent (ppid ${ppid}), age ${age}s"
    fi
  fi
done < <(ps_lines)

if [[ "$MODE" != list ]]; then
  echo "reap-e2e-zombies: ${CANDIDATES} vite/playwright process(es) seen, ${REAPABLE} reapable"
  [[ "$FIXTURE_MODE" -eq 1 ]] && echo "reap-e2e-zombies: fixture mode — nothing was signalled"
fi

[[ "$REAPABLE" -eq 0 ]] && exit 0

if [[ "$MODE" != kill ]]; then
  if [[ "$MODE" != list ]]; then
    echo "reap-e2e-zombies: re-run with --kill to signal them"
  fi
  exit 1
fi

# ─── kill: TERM, give it a moment, then KILL what is left ──────────────────
for pid in $REAP_PIDS; do
  kill -TERM "$pid" 2>/dev/null && echo "  TERM sent to ${pid}"
done
sleep 3
survivors=0
for pid in $REAP_PIDS; do
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null && echo "  KILL sent to ${pid}"
  fi
done
sleep 1
for pid in $REAP_PIDS; do
  if kill -0 "$pid" 2>/dev/null; then
    echo "  still alive after KILL: ${pid}"
    survivors=$((survivors + 1))
  fi
done
echo "reap-e2e-zombies: reaped $((REAPABLE - survivors)) of ${REAPABLE}"
[[ "$survivors" -eq 0 ]] || exit 1
exit 0
