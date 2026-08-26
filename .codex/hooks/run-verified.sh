#!/bin/bash
# Run one verification command without shell re-parsing. Codex PostToolUse omits
# Bash exit status, so the lifecycle hook trusts this sentinel only when this
# runner emits it after a real zero exit.
set -u

if [[ "$#" -eq 0 ]]; then
  echo "usage: .codex/hooks/run-verified.sh <command> [args...]" >&2
  exit 64
fi

"$@"
status=$?
if [[ "$status" -eq 0 ]]; then
  printf '\n__CODEX_VERIFICATION_EXIT_0__\n'
fi
exit "$status"
