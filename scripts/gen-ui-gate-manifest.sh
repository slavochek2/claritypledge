#!/usr/bin/env bash
# scripts/gen-ui-gate-manifest.sh
#
# P955 — (re)generate scripts/ui-gate-manifest.json: the set of source files
# transitively imported by src/App.tsx (the root of every route). The UI gate's
# render-path detection (scripts/check-ui-render-path.py) reads this to decide
# whether a staged .ts change touches a routed component's render path.
#
# Run whenever routes or their import graph change. Commit the updated manifest.
#
# Reference: features/p955_ui_build_loop.md § AD-3, § Phase 2(c)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 "$SCRIPT_DIR/check-ui-render-path.py" --generate
