#!/bin/bash
# P1399 Phase C: the command a Start-fixing terminal tab runs. Fixed; the board passes only the
# path of a prompt file it wrote (0600, in a private temp dir). The prompt is read, the file and
# its dir are deleted at once, and Claude starts with it in the founder's login shell (so PATH
# matches his normal terminal). Nothing here prints the prompt.
set -u
f="${1:-}"
if [ -z "$f" ] || [ ! -f "$f" ]; then
  echo "Day: the prompt file is missing. Copy the prompt from the Day page instead."
  exit 1
fi
prompt="$(cat "$f")"
rm -f "$f"
rmdir "$(dirname "$f")" 2>/dev/null
exec "${SHELL:-/bin/zsh}" -lc 'exec claude "$1"' day-launch "$prompt"
