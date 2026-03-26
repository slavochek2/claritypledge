#!/bin/bash
# Auto-fix lint after Edit/Write
# Auto-fixes unused imports/vars via eslint --fix. Only blocks on unfixable errors.
# tsc is deferred to pre-commit-checks.sh (project-wide check is too slow per edit).

set -e

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check TypeScript/TSX source files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip non-source files (tests, e2e, config, scripts)
if [[ "$FILE_PATH" =~ (\.test\.|\.spec\.|e2e/|node_modules/|\.config\.) ]]; then
  exit 0
fi

# Must be in src/ or a source-adjacent path
if [[ ! "$FILE_PATH" =~ src/ ]]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# ESLint --fix: auto-corrects unused imports/vars, only blocks on unfixable errors
ESLINT_OUTPUT=$(cd "$PROJECT_DIR" && npx eslint --fix --quiet --no-warn-ignored "$FILE_PATH" 2>&1) || {
  if [ -n "$ESLINT_OUTPUT" ]; then
    echo ""
    echo "━━━━ lint-after-edit: unfixable errors ━━━━"
    echo "$ESLINT_OUTPUT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
  fi
}

exit 0
