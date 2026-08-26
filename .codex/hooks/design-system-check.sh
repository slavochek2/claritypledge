#!/bin/bash
# Design System Compliance Check
# Runs automatically after Codex apply_patch operations on UI-related files.
# See CLAUDE.md "Design System" section for the spec

set -e

# Read the hook input from stdin
INPUT=$(cat)

# Codex apply_patch carries one or more paths inside tool_input.command. Keep
# direct-path support for documented/forward-compatible tool events.
DIRECT_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)
PATCH_COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
PATHS=$(
  { printf '%s\n' "$DIRECT_PATH"; printf '%s\n' "$PATCH_COMMAND" |
      sed -En 's/^\*\*\* (Update|Add|Delete) File: //p'; } |
    sed '/^$/d' | awk '!seen[$0]++'
)

[ -n "$PATHS" ] || exit 0

while IFS= read -r FILE_PATH; do
[ -n "$FILE_PATH" ] || continue

# Only check files in design-relevant paths
SHOULD_CHECK=false

if [[ "$FILE_PATH" =~ \.excalidraw$ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="excalidraw"
elif [[ "$FILE_PATH" =~ src/app/prototypes/ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="prototype"
elif [[ "$FILE_PATH" =~ src/components/ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="component"
elif [[ "$FILE_PATH" =~ src/app/components/ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="app-component"
elif [[ "$FILE_PATH" =~ src/app/pages/.*\.(tsx|jsx)$ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="page"
elif [[ "$FILE_PATH" =~ src/app/layouts/.*\.(tsx|jsx)$ ]]; then
  SHOULD_CHECK=true
  FILE_TYPE="layout"
fi

if [ "$SHOULD_CHECK" = false ]; then
  exit 0
fi

# Output header
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 Design System Check: $(basename "$FILE_PATH")"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

WARNINGS=0

# Check Excalidraw files for forbidden colors
if [ "$FILE_TYPE" = "excalidraw" ]; then
  # Forbidden: amber (#f59e0b, #fbbf24), orange (#ff9800, #f97316), yellow (#eab308)
  if grep -qE '"#f59e0b|#fbbf24|#ff9800|#f97316|#eab308|#fcd34d|#fef3c7"' "$FILE_PATH" 2>/dev/null; then
    echo "⚠️  Found forbidden amber/yellow/orange colors"
    echo "   Use blue (#3b82f6) or gray (#e0e0e0) per CLAUDE.md"
    WARNINGS=$((WARNINGS + 1))
  fi

  # Forbidden: iOS blue (#007AFF) - should use #3b82f6
  if grep -q '"#007AFF\|#007aff"' "$FILE_PATH" 2>/dev/null; then
    echo "⚠️  Found iOS blue (#007AFF) - use #3b82f6 instead"
    WARNINGS=$((WARNINGS + 1))
  fi

  # Forbidden: purple (#a855f7, #9333ea)
  if grep -qE '"#a855f7|#9333ea|#7c3aed"' "$FILE_PATH" 2>/dev/null; then
    echo "⚠️  Found purple colors - not in design system"
    WARNINGS=$((WARNINGS + 1))
  fi

  # Check for correct primary blue
  if grep -q '"#3b82f6"' "$FILE_PATH" 2>/dev/null; then
    echo "✓ Using correct primary blue (#3b82f6)"
  fi
fi

# Check React/TSX files for forbidden patterns
if [[ "$FILE_TYPE" = "prototype" || "$FILE_TYPE" = "component" || "$FILE_TYPE" = "app-component" ]]; then
  if [[ "$FILE_PATH" =~ \.(tsx|jsx|ts|js)$ ]]; then
    # Check for iOS blue
    if grep -q '#007AFF\|#007aff' "$FILE_PATH" 2>/dev/null; then
      echo "⚠️  Found iOS blue (#007AFF) - use blue-500 instead"
      WARNINGS=$((WARNINGS + 1))
    fi

    # Check for amber/orange Tailwind classes
    if grep -qE 'bg-amber-|text-amber-|border-amber-|bg-orange-|text-orange-|border-orange-|bg-yellow-|text-yellow-' "$FILE_PATH" 2>/dev/null; then
      echo "⚠️  Found amber/orange/yellow Tailwind classes - use blue-* instead"
      WARNINGS=$((WARNINGS + 1))
    fi

    # Check for pixel-specific font sizes (prototype anti-pattern)
    if grep -qE 'text-\[[0-9]+px\]' "$FILE_PATH" 2>/dev/null; then
      echo "⚠️  Found pixel-specific font sizes (text-[Npx])"
      echo "   Use semantic sizes: text-xs, text-sm, text-base, text-lg, etc."
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $WARNINGS -gt 0 ]; then
  echo "⚠️  Found $WARNINGS design system warning(s)"
  echo "   See docs/design-system.md for the spec"
else
  echo "✓ Design system compliance check passed"
fi
echo ""

done <<EOF
$PATHS
EOF

# Exit 0 - don't block edits, just warn
exit 0
