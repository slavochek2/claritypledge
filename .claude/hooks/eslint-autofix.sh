#!/bin/bash
# ESLint auto-fix — runs after every Edit/Write on JS/TS files.
# Fixes what's auto-fixable; stays silent if nothing to fix.

set -e

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only act on JS/TS/TSX/JSX files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  exit 0
fi

# Skip test files
if [[ "$FILE_PATH" =~ \.(test|spec)\. ]]; then
  exit 0
fi

PROJECT_ROOT="$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || echo "$CLAUDE_PROJECT_DIR")"
cd "$PROJECT_ROOT"

npx eslint --fix --quiet "$FILE_PATH" 2>/dev/null || true

exit 0
