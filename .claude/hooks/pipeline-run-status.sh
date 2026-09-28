#!/usr/bin/env bash
# SessionStart hook (P1367 S3): print where each recent disagreement-pipeline run stands.
#
#   "what next what we did what now"  -- founder, 2026-09-28, opening a resume
#
# Runs on every session start, /compact included, for handoffs changed in the last 7 days
# only, so it is silent between runs. Each run prints its "## Now" block, cross-checked
# against the database it names; a stale or missing block says so.
#
# Never blocks and never fails a session start: a report is not a gate. All paths exit 0.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -f scripts/events/run-status.mjs ]] || exit 0
command -v node >/dev/null 2>&1 || exit 0
out="$(node scripts/events/run-status.mjs --recent 7 2>/dev/null)"
[[ -n "$out" ]] || exit 0
printf 'PIPELINE RUNS (P1367: the handoff state block, checked against the DB)\n%s\n' "$out"
exit 0
