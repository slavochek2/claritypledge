#!/bin/bash
# scripts/test-p1620-reproduce.sh — canary for P1620: the deploy manifest cannot see a
# function's real inputs, so prod can run stale code with a clean drift report.
#
# Two defects, both asserted here as EXPECTED CORRECT behaviour (so the script fails today):
#   A. check/stamp hash only <fn>/index.ts. A change in _shared/ or in a sibling file the
#      function imports never reports FUNCTION_STALE.
#   B. deploy-functions.sh stamps the manifest with `--functions-only` after deploying, and
#      build_functions_json() walks EVERY function directory. Deploying ONE function stamps
#      ALL of them as current, erasing the staleness of the ones that were not deployed.
#
# Hermetic: a throwaway git repo (seed -> bare origin -> clone) under mktemp, holding copies of
# the REAL stamp-deploy-manifest.sh, check-deploy-manifest.sh and deploy-functions.sh. `supabase`,
# `security` and the keychain helper are stubbed; there is no network, no keychain, no real
# project and no real .env. `--env prod` reads the manifest from origin/main, so the fixture has a
# real `origin` whose main carries the baseline stamp, and "the stamp reached origin" is simulated
# by fetching the work clone's main into the bare origin (never a `git push`).
#
# Known-good controls (must PASS today, so a red run proves the harness works):
#   an index.ts change reports; an unchanged tree is clean; an unchanged function stays clean.
#
# Run: ./scripts/test-p1620-reproduce.sh      (override the repo under test: P1620_REPO_ROOT=...)
set -u

REPO_ROOT="${P1620_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
for f in stamp-deploy-manifest.sh check-deploy-manifest.sh deploy-functions.sh keyring.sh; do
  [ -f "$REPO_ROOT/scripts/$f" ] || { echo "SETUP ERROR: $REPO_ROOT/scripts/$f missing"; exit 99; }
done

PASS=0; FAIL=0
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -12; FAIL=$((FAIL+1)); }
die() { echo "SETUP ERROR: $*"; exit 99; }

G() { git -c user.email=t@t.t -c user.name=t -c commit.gpgsign=false "$@"; }

# --- PATH stubs: never the real supabase CLI, never the keychain -------------------------------
STUBS="$T/stubs"; mkdir -p "$STUBS"
cat > "$STUBS/supabase" <<'STUB'
#!/bin/bash
# args: functions deploy <name> --project-ref <ref> ...
echo "$3" >> "$STUB_DEPLOYS"
echo "Deployed Function $3"
exit 0
STUB
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"
chmod +x "$STUBS"/*

# --- Seed repo: real scripts + a small tree shaped like supabase/functions ---------------------
SEED="$T/seed"
mkdir -p "$SEED/scripts/lib" "$SEED/supabase/functions"/{_shared,fn-a,fn-b,fn-c} "$SEED/supabase/migrations"
for f in stamp-deploy-manifest.sh check-deploy-manifest.sh deploy-functions.sh keyring.sh; do
  cp "$REPO_ROOT/scripts/$f" "$SEED/scripts/$f"; chmod +x "$SEED/scripts/$f"
done
cat > "$SEED/scripts/lib/keychain.py" <<'STUB'
import sys
if len(sys.argv) >= 3 and sys.argv[1] == "get":
    sys.stdout.write("sbp_stub"); sys.exit(0)
sys.exit(1)
STUB
printf '#!/bin/bash\nexit 0\n' > "$SEED/scripts/check-edge-function-secrets.sh"; chmod +x "$SEED/scripts/check-edge-function-secrets.sh"
[ -f "$REPO_ROOT/supabase/no-verify-jwt-functions.txt" ] \
  && cp "$REPO_ROOT/supabase/no-verify-jwt-functions.txt" "$SEED/supabase/no-verify-jwt-functions.txt"
printf 'VITE_SUPABASE_URL=https://stub.supabase.co\nSUPABASE_ACCESS_TOKEN=sbp_stub\n' > "$SEED/.env.prod"
cp "$SEED/.env.prod" "$SEED/.env.local"
printf '.env.prod\n.env.local\n' > "$SEED/.gitignore"

# fn-a imports _shared/lib.ts AND a sibling ./handler.ts; fn-b imports a different shared file;
# fn-c imports nothing. Shapes mirror mirror-reply (index + handler + _shared).
echo 'export const LIB = 1;'                         > "$SEED/supabase/functions/_shared/lib.ts"
echo 'export const OTHER = 1;'                       > "$SEED/supabase/functions/_shared/other.ts"
echo 'export const handle = () => "a";'              > "$SEED/supabase/functions/fn-a/handler.ts"
printf 'import { LIB } from "../_shared/lib.ts";\nimport { handle } from "./handler.ts";\nexport default () => new Response(handle() + LIB);\n' \
  > "$SEED/supabase/functions/fn-a/index.ts"
printf 'import { OTHER } from "../_shared/other.ts";\nexport default () => new Response("b" + OTHER);\n' \
  > "$SEED/supabase/functions/fn-b/index.ts"
echo 'export default () => new Response("c");'      > "$SEED/supabase/functions/fn-c/index.ts"
echo '{}' > "$SEED/supabase/deploy-manifest.json"

( cd "$SEED" && git init -q -b main && G add -A >/dev/null 2>&1 && G commit -qm "baseline" ) || die "seed commit"
# Baseline: everything stamped as deployed to prod, using the real stamper.
( cd "$SEED" && ./scripts/stamp-deploy-manifest.sh --env prod --functions-only >/dev/null 2>&1 ) || die "baseline stamp failed"
( cd "$SEED" && G add supabase/deploy-manifest.json && G commit -qm "stamp: all deployed" ) || die "baseline stamp commit"
git clone -q --bare "$SEED" "$T/origin.git" || die "bare origin"

# fresh_work <name> — a new clone of origin; sets $W.
fresh_work() {
  W="$T/$1"; rm -rf "$W"
  git clone -q "$T/origin.git" "$W" || die "clone"
  cp "$SEED/.env.prod" "$SEED/.env.local" "$W/"
  # Prove the fixture is what the check will hash: origin/main's manifest lists fn-a with the
  # hash of THIS clone's fn-a/index.ts (the key-transform guard — a fixture that touches nothing
  # the check reads would report "not reproduced" for a real defect).
  local want got
  want=$(shasum -a 256 "$W/supabase/functions/fn-a/index.ts" | cut -d' ' -f1)
  got=$(git -C "$W" show origin/main:supabase/deploy-manifest.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["prod"]["functions"]["fn-a"])')
  [ "$want" = "$got" ] || die "fixture: origin manifest hash for fn-a ($got) != sha256(fn-a/index.ts) ($want)"
}
check() { ( cd "$W" && ./scripts/check-deploy-manifest.sh --env prod 2>&1 ); }

has()    { printf '%s\n' "$1" | grep -Fq -- "$2"; }
expect_reports()     { if has "$2" "FUNCTION_STALE: $3"; then ok "$1"; else bad "$1" "$2"; fi; }
expect_not_reports() { if has "$2" "$3: $4"; then bad "$1" "$2"; else ok "$1"; fi; }

echo "=== P1620 canary: the drift check must see a function's real inputs ==="

# --- 0. controls: harness works ---------------------------------------------------------------
fresh_work w0; OUT=$(check); RC=$?
if [ "$RC" -eq 0 ] && has "$OUT" "check passed"; then ok "control: unchanged tree is clean (exit 0)"; else bad "control: unchanged tree is clean (exit 0)" "exit=$RC $OUT"; fi

fresh_work w1; echo '// edit' >> "$W/supabase/functions/fn-a/index.ts"; OUT=$(check)
expect_reports "known-good: index.ts change reports FUNCTION_STALE for fn-a" "$OUT" "fn-a"
expect_not_reports "control: an unchanged function (fn-c) stays clean" "$OUT" "FUNCTION_STALE" "fn-c"

# --- A1. _shared-only change ------------------------------------------------------------------
fresh_work w2; echo '// edit' >> "$W/supabase/functions/_shared/lib.ts"; OUT=$(check)
expect_reports "A1: _shared-only change reports FUNCTION_STALE for fn-a (imports _shared/lib.ts)" "$OUT" "fn-a"
expect_not_reports "A1: ...and an unchanged function with no such import (fn-c) stays clean" "$OUT" "FUNCTION_STALE" "fn-c"

# --- A2. sibling-file change ------------------------------------------------------------------
fresh_work w3; echo '// edit' >> "$W/supabase/functions/fn-a/handler.ts"; OUT=$(check)
expect_reports "A2: sibling handler.ts change reports FUNCTION_STALE for fn-a" "$OUT" "fn-a"

# --- B. single-function deploy must not mark another changed function current -----------------
fresh_work w4
echo '// edit' >> "$W/supabase/functions/fn-a/index.ts"
echo '// edit' >> "$W/supabase/functions/fn-b/index.ts"
DEPLOYS="$T/deploys.txt"; : > "$DEPLOYS"
DOUT=$( cd "$W" && env PATH="$STUBS:$PATH" STUB_DEPLOYS="$DEPLOYS" EDGE_SMOKE=0 \
          bash ./scripts/deploy-functions.sh fn-a --env prod 2>&1 ); DRC=$?
[ "$DRC" -eq 0 ] || die "deploy-functions.sh fn-a exited $DRC (fixture problem, not the defect): $DOUT"
[ "$(tr '\n' ' ' < "$DEPLOYS")" = "fn-a " ] || die "stub saw deploys: $(tr '\n' ' ' < "$DEPLOYS") (want only fn-a)"
# Make the stamp visible to --env prod the way /push would: commit it, land it on origin/main.
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm "stamp after fn-a deploy" ) || die "commit stamp"
git -C "$T/origin.git" fetch -q "$W" '+main:main' || die "land stamp on origin"
OUT=$(check)
if has "$OUT" "FUNCTION_STALE: fn-a" || has "$OUT" "FUNCTION_UNPUSHED_STAMP: fn-a"; then
  bad "B control: the function that WAS deployed (fn-a) is clean after its own deploy" "$OUT"
else ok "B control: the function that WAS deployed (fn-a) is clean after its own deploy"; fi
expect_reports "B: fn-b (changed, NOT deployed) is still reported after a fn-a-only deploy" "$OUT" "fn-b"

echo
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
