#!/bin/bash
# Check that every nav link in navigation components
# has a matching <Route path="/path" in App.tsx.
# Prevents broken nav links from shipping.

set -euo pipefail

APP_TSX="src/App.tsx"
NAV_FILES=(
  "src/app/components/layout/simple-navigation.tsx"
  "src/app/components/layout/bottom-nav.tsx"
)

ERRORS=0

for nav_file in "${NAV_FILES[@]}"; do
  [ -f "$nav_file" ] || continue

  # Extract static paths from both JSX to="/path" and object to: "/path" formats
  # Skip dynamic paths with : (e.g., /p/:slug)
  nav_paths=$(grep -oE '(to=|to: )"(/[a-zA-Z0-9/-]*)"' "$nav_file" \
    | sed 's/.*"\/\(.*\)"/\/\1/' \
    | grep -v ':' \
    | sort -u || true)

  [ -z "$nav_paths" ] && continue

  while IFS= read -r path; do
    # Skip root path
    [ "$path" = "/" ] && continue
    [ -z "$path" ] && continue

    # Check for matching Route path= in App.tsx
    # Match exact path or path with trailing wildcard (path="/events/*")
    escaped=$(echo "$path" | sed 's/\//\\\//g')
    if ! grep -qE "path=\"${escaped}(/\\*)?\"" "$APP_TSX"; then
      echo "ERROR: Nav link to=\"$path\" in $nav_file has no matching Route in $APP_TSX"
      ERRORS=$((ERRORS + 1))
    fi
  done <<< "$nav_paths"
done

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "Found $ERRORS nav link(s) pointing to non-existent routes."
  echo "Fix: add the missing Route to App.tsx, or remove the nav link."
  exit 1
fi

exit 0
