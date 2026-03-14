#!/bin/bash
# Lint + Type-check after Edit/Write
# Catches broken/unused imports immediately instead of at commit time.
# Runs eslint on the edited file + tsc project-wide (~2.4s total).

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
ERRORS=""

# 1. TypeScript type-check (catches missing imports, type errors) ~0.6s
TSC_OUTPUT=$(cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1) || {
  # Filter to only errors in the edited file
  FILE_ERRORS=$(echo "$TSC_OUTPUT" | grep -F "$(basename "$FILE_PATH")" || true)
  if [ -n "$FILE_ERRORS" ]; then
    ERRORS="${ERRORS}TypeScript errors in $(basename "$FILE_PATH"):
${FILE_ERRORS}
"
  fi
}

# 2. ESLint (catches unused imports/vars) ~1.8s
ESLINT_OUTPUT=$(cd "$PROJECT_DIR" && npx eslint --quiet --no-warn-ignored "$FILE_PATH" 2>&1) || {
  if [ -n "$ESLINT_OUTPUT" ]; then
    ERRORS="${ERRORS}ESLint errors in $(basename "$FILE_PATH"):
${ESLINT_OUTPUT}
"
  fi
}

if [ -n "$ERRORS" ]; then
  echo ""
  echo "━━━━ lint-after-edit: errors found ━━━━"
  echo "$ERRORS"
  echo "Fix these before moving to the next file."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

exit 0
