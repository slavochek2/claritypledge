#!/bin/bash
# PreToolUse hook: Block CLAUDE.md and rules/*.md edits until /slava:maintain:claude-md gate is confirmed.
#
# Flow:
#   1. Agent tries to edit CLAUDE.md or .claude/rules/*.md
#   2. This hook fires → blocks the edit (exit 1) with instructions
#   3. Agent runs /slava:maintain:claude-md (validates the change)
#   4. /slava:maintain:claude-md skill runs: touch /tmp/.claude-md-gate-ok
#   5. Agent retries the edit → this hook sees the marker → allows (exit 0), removes marker

MARKER="/tmp/.claude-md-gate-ok"
MARKER_MAX_AGE=1800  # 30 minutes in seconds

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Only trigger for CLAUDE.md and .claude/rules/*.md
if [[ "$FILE_PATH" =~ /CLAUDE\.md$ ]] || [[ "$FILE_PATH" =~ /\.claude/rules/.*\.md$ ]]; then

  # Check for valid gate marker
  if [ -f "$MARKER" ]; then
    AGE=$(( $(date +%s) - $(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null) ))
    if [ "$AGE" -lt "$MARKER_MAX_AGE" ]; then
      # Gate confirmed recently — allow edit and consume the marker
      rm -f "$MARKER"
      exit 0
    fi
  fi

  # No valid marker — block
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🚫  CLAUDE.md / rules edit BLOCKED"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "File: $FILE_PATH"
  echo ""
  echo "Required: Run /slava:maintain:claude-md first to validate this change."
  echo ""
  echo "After /slava:maintain:claude-md completes and approves the change:"
  echo "  touch /tmp/.claude-md-gate-ok"
  echo ""
  echo "Then retry your edit. The marker expires in 30 minutes."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

exit 0
