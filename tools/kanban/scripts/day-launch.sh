#!/bin/bash
# P1399 Phase C: the command a Start-fixing terminal tab runs. Fixed; the board passes only two
# paths: the prompt file it wrote (0600, in a private 0700 temp dir) and an acknowledgement file.
#
# The prompt TEXT never becomes an argument of anything (Phase C review: `claude "<prompt>"` put
# private findings in `ps`). Claude starts with a one-line instruction naming the file; it reads the
# file and deletes it. The ack file is touched only once `claude` is known to exist in the founder's
# login shell, right before it starts — the board records the launch as sent only when it appears.
# The model is pinned: settings default to Sonnet, and the founder works on Opus.
set -u
f="${1:-}"; ack="${2:-}"
if [ -z "$f" ] || [ ! -f "$f" ] || [ -z "$ack" ]; then
  echo "Day: the prompt file is missing. Copy the prompt from the Day page instead."
  exit 1
fi
exec "${SHELL:-/bin/zsh}" -lc '
  command -v claude >/dev/null 2>&1 || { echo "Day: claude is not on PATH in your login shell. Copy the prompt from the Day page instead."; exit 1; }
  : > "$2" || exit 1
  exec claude --model opus "Your task from the Day page is in the file $1 — read it, delete it, then do what it says."
' day-launch "$f" "$ack"
