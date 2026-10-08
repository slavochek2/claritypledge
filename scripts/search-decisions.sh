#!/bin/bash
# scripts/search-decisions.sh — search the public AND private decision logs in one call (P1438).
#
# Usage: scripts/search-decisions.sh REGEX [MAX]   (REGEX is ERE, case-insensitive: escape parens, a|b for alternatives)
#
# Why one helper: a privately recorded ruling (a rejected idea whose reasons name people) is
# invisible to a grep of docs/decisions.md alone, and nothing reports the miss. Every consumer that
# looks for prior rulings (/create-spec duplicate gate, /spec-review, /challenge-prd) calls this.
#
# The private log lives in the MAIN checkout's .private/ (its own gitignored repo), resolved through
# git-common-dir so the search works from any worktree. When it cannot be reached (a clone, CI), the
# first output line says so — the caller must repeat that line in its report, never drop it.
#
# Output: each hit prefixed "public:" or "private:". Private hits are for the agent's reasoning only:
# never quote them into a public file — cite as "private ruling <date>".
# Status lines use ':' separators only (shell-safety.md). Exit 0 on a completed search (with or
# without hits); 2 on bad usage, an unreadable public log, or any grep error (e.g. invalid regex).

PATTERN="${1:-}"
MAX="${2:-20}"
[ -n "$PATTERN" ] || { echo "usage: search-decisions.sh REGEX [MAX]" >&2; exit 2; }
case "$MAX" in ''|*[!0-9]*|0*|?????*) echo "search-decisions: max-hits must be an integer 1-9999: $MAX" >&2; exit 2 ;; esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "search-decisions: not a git repo" >&2; exit 2; }
COMMON="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)"
PUBLIC_LOG="$ROOT/docs/decisions.md"
PRIVATE_LOG="$(dirname "$COMMON")/.private/docs/decisions.md"

[ -r "$PUBLIC_LOG" ] || { echo "search-decisions: public log unreadable: $PUBLIC_LOG" >&2; exit 2; }

# grep exit: 0 hits, 1 no hits, 2+ error. Anything >1 is a failed search, never "no rulings".
search() {
  local log="$1" label="$2" out rc
  out="$(grep -niE -- "$PATTERN" "$log")"; rc=$?
  [ "$rc" -gt 1 ] && { echo "search-decisions: $label search FAILED (grep exit $rc)" >&2; exit 2; }
  [ -n "$out" ] && printf '%s\n' "$out" | head -n "$MAX" | sed "s/^/$label:/"
  return 0
}

PUB_OUT="$(search "$PUBLIC_LOG" public)" || exit 2
if [ -r "$PRIVATE_LOG" ]; then
  PRIV_OUT="$(search "$PRIVATE_LOG" private)" || exit 2
  echo "PRIVATE LOG: searched"
else
  echo "PRIVATE LOG: NOT AVAILABLE — private rulings were NOT searched (no readable .private/docs/decisions.md in the main checkout)"
fi
[ -n "$PUB_OUT" ] && printf '%s\n' "$PUB_OUT"
[ -n "${PRIV_OUT:-}" ] && printf '%s\n' "$PRIV_OUT"
exit 0
