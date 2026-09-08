#!/usr/bin/env bash
# SessionStart hook: surface actionable pipeline state without being asked.
#
#   "I honestly don't even want to think about them. Why would I think about
#    them? They should be automatically happening within ship or finish or
#    whatever, and done."  -- founder, on worktrees
#
# git-ops.sh's ship_on_abort covers the session where a strand HAPPENS. This
# covers every session after it, which is where a strand actually costs
# something: nobody is looking, and finished-but-unclosed work is
# indistinguishable from work still in flight.
#
# Never blocks and never fails a session start: a report is not a gate, and a
# broken reporter must not be able to stop work. All error paths exit 0.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[[ -x scripts/pipeline-strandings.sh ]] || exit 0
out="$(./scripts/pipeline-strandings.sh 2>/dev/null)" || exit 0
[[ -n "$out" ]] || exit 0
printf '%s\n' "$out"
printf '%s\n' "(P1246: shown because something is finished-but-unclosed or stranded. \`./scripts/pipeline-strandings.sh --all\` for every live worktree.)"
exit 0
