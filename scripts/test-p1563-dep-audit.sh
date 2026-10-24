#!/usr/bin/env bash
# test-p1563-dep-audit.sh — scripts/dep-audit.sh must report clean / finding / incomplete with three
# distinct exit codes, and must never report INCOMPLETE as clean (P1563 item 10).
#
# Every case drives the REAL entry point (scripts/dep-audit.sh --root <fixture>) against nested
# fixtures under scripts/fixtures/p1563-dep-audit/ (manifests one level down, like a real repo) and
# asserts the exit code AND a line of output. This suite needs the network: it makes live OSV
# lookups and runs `npm audit` — the malicious case IS the live proof that OSV's batch interface
# covers a known-malicious version (keyv@6.0.0 is MAL-2026-11524; it was unpublished from npm, so
# the fixture lock is hand-built and cannot be resolved by `npm install`).
#
# Fixtures are stored as `<manifest name>.fixture` and staged into a temp dir under their real names
# before each run, so no committed file in scripts/fixtures/p1563-dep-audit looks like a manifest.
#
# Sections:
#   0. fixture hygiene — the committed fixture dir contains zero manifest-named files
#   1. spec cases    — clean, malicious, critical, lookup failure, no lock, exceptions suppress
#   2. negative controls — a wrong exception does NOT suppress; a MAL- hit cannot be excepted;
#                      FINDING wins over INCOMPLETE but still lists it; empty root and a malformed
#                      exceptions file are INCOMPLETE
#   3. other formats — deno.lock and Python requirements (exact pins clean, ranges incomplete,
#                      deno.land without an `unchecked` exception incomplete, with one clean)
#   4. exclusions    — a manifest placed inside the excluded fixture path, under .claude or under
#                      node_modules is skipped (positive control: the same file elsewhere is
#                      inventoried); the real-repo run prints the exclusion list
#   5. gate 7d       — the malicious case rebuilt by mutating a COPY of the real root
#                      package-lock.json (one existing entry's version -> keyv@6.0.0)
#   6. output safety — no output line carries a shell redirect token (rules/shell-safety.md)
#
# Exit 0: all assertions held. Exit 1: at least one did not.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUDIT="$ROOT/scripts/dep-audit.sh"
FX_SRC="$ROOT/scripts/fixtures/p1563-dep-audit"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# The committed fixtures carry NO real manifest names (GitHub's dependency graph would parse a
# committed package-lock.json / requirements.lock / deno.lock and raise standing alerts on the known-bad
# versions). Each case is copied into a fresh temp dir and the `.fixture` suffix is stripped there.
FX="$TMP/fx"
mkdir -p "$FX"; cp -R "$FX_SRC"/. "$FX"/
find "$FX" -type f -name '*.fixture' | while IFS= read -r f; do mv "$f" "${f%.fixture}"; done
pass=0; fail=0

ok()   { echo "  ok   $1"; pass=$((pass+1)); }
bad()  { echo "  FAIL $1"; fail=$((fail+1)); }
# run <args...>: sets OUT and RC. --exceptions defaults to an empty file so the committed real
# exceptions file never influences a fixture run.
: > "$TMP/none.txt"
run()  { OUT="$("$AUDIT" "$@" 2>&1)"; RC=$?; }
rc()   { if [ "$RC" = "$2" ]; then ok "$1: exit $RC"; else bad "$1: expected exit $2, got $RC"; echo "$OUT" | sed 's/^/       | /'; fi; }
has()  { if printf '%s\n' "$OUT" | grep -qF -- "$2"; then ok "$1: output has '$2'"; else bad "$1: output lacks '$2'"; echo "$OUT" | sed 's/^/       | /'; fi; }
lacks(){ if printf '%s\n' "$OUT" | grep -qF -- "$2"; then bad "$1: output must not have '$2'"; else ok "$1: output lacks '$2'"; fi; }

echo "0. fixture hygiene"
NAMED="$(find "$FX_SRC" -type f \( -name package.json -o -name package-lock.json -o -name deno.lock -o -name 'requirements*.txt' -o -name 'requirements*.lock' \))"
if [ -z "$NAMED" ]; then ok "committed fixture dir has no manifest-named files"; else bad "manifest-named fixture files committed:"; echo "$NAMED" | sed 's/^/       | /'; fi
if [ -n "$(find "$FX" -type f -name package-lock.json)" ]; then ok "staging produced real-named manifests in the temp copy"; else bad "staging produced no package-lock.json"; fi

echo "1. spec cases"
run --root "$FX/clean" --exceptions "$TMP/none.txt"
rc "(a) clean control" 0; has "(a) clean control" "RESULT: CLEAN"

run --root "$FX/malicious" --exceptions "$FX/malicious/exceptions.txt"
rc "(b) malicious (OSV only; npm-audit critical excepted)" 1
has "(b) malicious" "MALICIOUS keyv@6.0.0 (MAL-"
lacks "(b) malicious" "npm audit CRITICAL"
run --root "$FX/malicious" --exceptions "$TMP/none.txt"
rc "(b) malicious (no exceptions)" 1; has "(b) malicious" "MALICIOUS keyv@6.0.0 (MAL-"

run --root "$FX/critical" --exceptions "$TMP/none.txt"
rc "(c) critical" 1; has "(c) critical" "npm audit CRITICAL minimist GHSA-xvch-5gv4-984h"
has "(c) critical" "RESULT: FINDING"

run_d() { OUT="$(DEP_AUDIT_OSV_URL=http://127.0.0.1:9/ "$AUDIT" --root "$FX/clean" --exceptions "$TMP/none.txt" 2>&1)"; RC=$?; }
run_d
rc "(d) lookup failure" 2; has "(d) lookup failure" "OSV lookup failed"
has "(d) lookup failure" "RESULT: INCOMPLETE"; lacks "(d) lookup failure" "RESULT: CLEAN"
D_OUT="$OUT"

run --root "$FX/nolock" --exceptions "$TMP/none.txt"
rc "(e) package.json without lock" 2; has "(e) no lock" "has no lock file"

run --root "$FX/critical" --exceptions "$FX/critical/exceptions.txt"
rc "(f) exceptions file suppresses the critical" 0; has "(f) exceptions" "RESULT: CLEAN"

echo "2. negative controls"
printf 'app/package-lock.json minimist GHSA-0000-0000-0000 # wrong advisory id\n' > "$TMP/wrong.txt"
run --root "$FX/critical" --exceptions "$TMP/wrong.txt"
rc "wrong exception does not suppress" 1; has "wrong exception" "npm audit CRITICAL minimist"
has "wrong exception" "unused exception"

printf 'app/package-lock.json keyv MAL-2026-11524 # attempt to except a malicious hit\n' > "$TMP/mal.txt"
run --root "$FX/malicious" --exceptions "$TMP/mal.txt"
rc "MAL- hit cannot be excepted" 1; has "MAL- exception" "MALICIOUS keyv@6.0.0"

mkdir -p "$TMP/mixed"; cp -R "$FX/malicious/app" "$TMP/mixed/mal"; cp -R "$FX/nolock/app" "$TMP/mixed/nolock"
run --root "$TMP/mixed" --exceptions "$FX/malicious/exceptions.txt"
# the fixture exceptions entry names app/..., so the npm-audit critical under mal/ is not excepted;
# FINDING must win and the incomplete part must still be listed
rc "FINDING wins over INCOMPLETE" 1; has "mixed" "FINDING: MALICIOUS keyv@6.0.0"; has "mixed" "INCOMPLETE: package.json has no lock file"
has "mixed" "RESULT: FINDING"

mkdir -p "$TMP/empty"
run --root "$TMP/empty" --exceptions "$TMP/none.txt"
rc "empty root is not clean" 2; has "empty root" "no manifests found"

printf 'app/package-lock.json minimist GHSA-xvch-5gv4-984h\n' > "$TMP/noreason.txt"
run --root "$FX/critical" --exceptions "$TMP/noreason.txt"
rc "exception without a reason is rejected" 1; has "no-reason exception" "exceptions file: line 1"
# (exit 1, not 2: the critical is still unexcepted, so FINDING wins; the bad line is listed as INCOMPLETE)

run --root "$TMP/does-not-exist" --exceptions "$TMP/none.txt"
rc "nonexistent root" 2

echo "3. other formats"
run --root "$FX/pypin" --exceptions "$TMP/none.txt"
rc "python exact pins" 0; has "python pins" "versions-checked=2"
run --root "$FX/pyranges" --exceptions "$TMP/none.txt"
rc "python ranges" 2; has "python ranges" "without an exact =="
run --root "$FX/deno" --exceptions "$TMP/none.txt"
rc "deno.lock with deno.land entry" 2; has "deno.lock" "deno.land/std@0.224.0"
printf 'fn/deno.lock deno.land/std@0.224.0 unchecked # fixture: Deno stdlib has no OSV ecosystem\n' > "$TMP/unchecked.txt"
run --root "$FX/deno" --exceptions "$TMP/unchecked.txt"
rc "deno.lock with unchecked exception" 0; has "deno.lock" "accepted unchecked: deno.land/std@0.224.0"
run --root "$FX/deno-ranges" --exceptions "$TMP/none.txt"
rc "deno.lock esm.sh version range" 2; has "deno ranges" "version is a range"

echo "4. exclusions"
# defence in depth: even a real-named manifest placed INSIDE the excluded fixture path is skipped.
# Positive control: the same manifest in a sibling directory IS inventoried.
EX="$TMP/exroot"
mkdir -p "$EX/scripts/fixtures/p1563-dep-audit/c/app" "$EX/scripts/fixtures/other/app" "$EX/.claude/commands/t" "$EX/node_modules/x"
cp "$FX/clean/app/"* "$EX/scripts/fixtures/p1563-dep-audit/c/app/"
cp "$FX/clean/app/"* "$EX/scripts/fixtures/other/app/"
cp "$FX/clean/app/package.json" "$EX/.claude/commands/t/"
cp "$FX/clean/app/package.json" "$EX/node_modules/x/"
run --root "$EX" --exceptions "$TMP/none.txt"
has "exclusion control" "scripts/fixtures/other/app/package-lock.json"
lacks "exclusion control" "p1563-dep-audit/c/app"
lacks "exclusion control" ".claude/commands/t"
lacks "exclusion control" "node_modules/x"
has "exclusion control" "RESULT: CLEAN"

echo "4b. real repo"
run --exceptions "$TMP/none.txt"
has "real repo" "exclusions: node_modules, .git (any depth); .claude, .claude/worktrees"
has "real repo" "exclusions: node_modules"
has "real repo" "scripts/fixtures/p1563-dep-audit"
INV="$(printf '%s\n' "$OUT" | sed -n '/^COVERAGE INVENTORY/,/^SUMMARY/p')"
if printf '%s\n' "$INV" | grep -qF "p1563-dep-audit"; then bad "real repo: fixture dir appears in the inventory"; else ok "real repo: fixture dir absent from the inventory"; fi
if printf '%s\n' "$INV" | grep -qF ".claude/worktrees"; then bad "real repo: worktrees appear in the inventory"; else ok "real repo: .claude/worktrees absent from the inventory"; fi
if [ "$RC" = 0 ] || [ "$RC" = 1 ] || [ "$RC" = 2 ]; then ok "real repo: exit code is one of 0/1/2 ($RC)"; else bad "real repo: unexpected exit $RC"; fi

echo "5. gate 7d: mutate a copy of the real lock"
if [ -f "$ROOT/package-lock.json" ] && [ -f "$ROOT/package.json" ]; then
  mkdir -p "$TMP/real-copy/app"; cp "$ROOT/package.json" "$ROOT/package-lock.json" "$TMP/real-copy/app/"
  # control first: the unmutated copy has no MAL- hit (otherwise the mutation proves nothing)
  run --root "$TMP/real-copy" --exceptions "$TMP/none.txt"
  lacks "real-copy control (unmutated)" "MALICIOUS"
  python3 -I - "$TMP/real-copy/app/package-lock.json" <<'EOF'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d["packages"]["node_modules/keyv"]["version"] = "6.0.0"
json.dump(d, open(p, "w"), indent=2)
EOF
  run --root "$TMP/real-copy" --exceptions "$TMP/none.txt"
  rc "real-copy mutated to keyv@6.0.0" 1; has "real-copy mutated" "MALICIOUS keyv@6.0.0 (MAL-"
else
  bad "root package-lock.json/package.json missing: cannot build the mutation control"
fi

echo "6. output safety"
if printf '%s\n' "$D_OUT" | grep -qE '[<>|]'; then bad "lookup-failure output contains a redirect token"; else ok "lookup-failure output has no <, > or |"; fi
if printf '%s\n' "$OUT" | grep -qE '[<>|]'; then bad "real-copy output contains a redirect token"; else ok "real-copy output has no <, > or |"; fi

echo
echo "passed: $pass  failed: $fail"
[ "$fail" = 0 ]
