#!/bin/bash
# Auto-fix frontmatter when a new file is written to features/p*.md
# Fires on every Write/Edit tool use; exits silently if file doesn't match.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Only trigger for features/p*.md files
if [[ "$FILE_PATH" =~ /features/p[0-9].*\.md$ ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 Kanban frontmatter fix: $(basename "$FILE_PATH")"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
  python3 "$SCRIPT_DIR/scripts/fix-frontmatter.py" "$FILE_PATH" 2>&1
  # Bust kanban cache so new/edited cards appear immediately
  curl -s "http://localhost:9050/api/features?refresh=true" > /dev/null 2>&1 || true
fi

exit 0
