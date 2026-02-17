#!/usr/bin/env bash
# Auto-fix frontmatter in features/p*.md files.
# Usage: ./scripts/fix-frontmatter.sh [file ...]
# See scripts/fix-frontmatter.py for full documentation.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/fix-frontmatter.py" "$@"
