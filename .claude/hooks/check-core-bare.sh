#!/usr/bin/env bash
# SessionStart hook: catch a bare-configured main checkout at session start rather
# than mid-session, when it presents as an unrelated argument error from whatever
# tool you happen to be running. See scripts/check-core-bare.sh for the mechanism
# and docs/decisions.md 2026-09-07 / 2026-09-08 for the two incidents.
#
# Reports on stdout so the agent sees it as context, and NEVER fails a session
# start: a report is not a gate, and a broken reporter must not be able to stop
# work (same contract as report-strandings.sh). All paths exit 0.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -x scripts/check-core-bare.sh ]] || exit 0
out="$(./scripts/check-core-bare.sh 2>&1)"; rc=$?
(( rc == 1 )) || exit 0          # 0 = healthy, 2 = undeterminable; say nothing
printf '%s\n' "$out"
exit 0
