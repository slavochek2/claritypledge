#!/bin/bash
# Auto-fix lint after Codex apply_patch.
# Auto-fixes unused imports/vars via eslint --fix. Only blocks on unfixable errors.
# tsc is deferred to pre-commit-checks.sh (project-wide check is too slow per edit).

set -e

INPUT=$(cat)

DIRECT_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)
PATCH_COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
PATHS=$(
  { printf '%s\n' "$DIRECT_PATH"; printf '%s\n' "$PATCH_COMMAND" |
      sed -En 's/^\*\*\* (Update|Add|Delete) File: //p'; } |
    sed '/^$/d' | awk '!seen[$0]++'
)

[ -n "$PATHS" ] || exit 0

PROJECT_DIR="${CODEX_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

while IFS= read -r FILE_PATH; do
[ -n "$FILE_PATH" ] || continue

# Only check TypeScript/TSX source files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  continue
fi

# Skip non-source files (tests, e2e, config, scripts)
if [[ "$FILE_PATH" =~ (\.test\.|\.spec\.|e2e/|node_modules/|\.config\.) ]]; then
  continue
fi

# Must be in src/ or a source-adjacent path
if [[ ! "$FILE_PATH" =~ src/ ]]; then
  continue
fi

# ESLint --fix: auto-corrects unused imports/vars, only blocks on unfixable errors
ESLINT_OUTPUT=$(cd "$PROJECT_DIR" && npx eslint --fix --quiet --no-warn-ignored "$FILE_PATH" 2>&1) || {
  if [ -n "$ESLINT_OUTPUT" ]; then
    echo ""
    echo "━━━━ lint-after-edit: unfixable errors ━━━━"
    echo "$ESLINT_OUTPUT"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 2
  fi
}

done <<EOF
$PATHS
EOF

exit 0
