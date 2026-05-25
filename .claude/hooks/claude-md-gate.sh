#!/bin/bash
# Remind agents to run /slava:maintain:claude-md before editing CLAUDE.md or .claude/rules/*.md directly.
# This is advisory — not a blocker. The reminder is injected into Claude's context.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Trigger for CLAUDE.md and .claude/rules/*.md
if [[ "$FILE_PATH" =~ /CLAUDE\.md$ ]] || [[ "$FILE_PATH" =~ /\.claude/rules/.*\.md$ ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  CLAUDE.md / rules gate"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "You just edited: $FILE_PATH"
  echo ""
  echo "Was /slava:maintain:claude-md run first to validate this change?"
  echo "If YES and this is the approved change — continue."
  echo "If NO — revert this edit, run /slava:maintain:claude-md first, then re-apply the validated change."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

exit 0
