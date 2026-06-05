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

# All Route path patterns from App.tsx (literal + parameterized like /d/:docId)
ROUTE_PATTERNS=$(grep -oE 'path="[^"]+"' "$APP_TSX" | sed 's/path="//; s/"$//' | sort -u)

# Returns 0 if nav path matches a parameterized route pattern segment-by-segment
# (a :param segment matches any single nav segment; trailing /* matches any suffix).
matches_param_route() {
  local nav_path="$1"
  local pattern
  while IFS= read -r pattern; do
    case "$pattern" in *:*) ;; *) continue ;; esac  # literal patterns handled by the exact grep
    local p_rest="${pattern#/}" n_rest="${nav_path#/}" matched=1
    while [ -n "$p_rest" ] || [ -n "$n_rest" ]; do
      local p_seg="${p_rest%%/*}" n_seg="${n_rest%%/*}"
      [ "$p_seg" = "*" ] && break
      if [ -z "$p_seg" ] || [ -z "$n_seg" ]; then matched=0; break; fi
      case "$p_seg" in
        :*) ;;  # param segment matches any nav segment
        *) [ "$p_seg" = "$n_seg" ] || { matched=0; break; } ;;
      esac
      case "$p_rest" in */*) p_rest="${p_rest#*/}" ;; *) p_rest="" ;; esac
      case "$n_rest" in */*) n_rest="${n_rest#*/}" ;; *) n_rest="" ;; esac
    done
    [ "$matched" = "1" ] && return 0
  done <<< "$ROUTE_PATTERNS"
  return 1
}

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
    if ! grep -qE "path=\"${escaped}(/\\*)?\"" "$APP_TSX" && ! matches_param_route "$path"; then
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
