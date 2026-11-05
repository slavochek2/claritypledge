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
# Setup note (fix commit): the baseline stamp now passes --assume-all-deployed, because a bare
# stamp is refused by design; the helper is copied beside the scripts. No assertion was changed.
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
case ",${STUB_FAIL:-}," in *",$3,"*) echo "boom"; exit 1 ;; esac
echo "Deployed Function $3"
exit 0
STUB
printf '#!/bin/bash\nexit 1\n' > "$STUBS/security"
chmod +x "$STUBS"/*

# --- Seed repo: real scripts + a small tree shaped like supabase/functions ---------------------
SEED="$T/seed"
mkdir -p "$SEED/scripts/lib" "$SEED/supabase/functions"/{_shared,fn-a,fn-b,fn-c,fn-d,fn-e,fn-f,fn-g,fn-h,fn-i,fn-j,fn-k} "$SEED/supabase/migrations"
for f in stamp-deploy-manifest.sh check-deploy-manifest.sh deploy-functions.sh keyring.sh; do
  cp "$REPO_ROOT/scripts/$f" "$SEED/scripts/$f"; chmod +x "$SEED/scripts/$f"
done
cp "$REPO_ROOT/scripts/lib/function-input-hash.py" "$SEED/scripts/lib/function-input-hash.py"
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
# fn-d reaches chain-c.ts only TRANSITIVELY (index -> chain-b -> chain-c); orphan.ts is in _shared
# but nobody imports it; handler.test.ts is a test file; deno.json/deno.lock are the version pins.
echo 'export const CHAIN_C = 1;'                     > "$SEED/supabase/functions/_shared/chain-c.ts"
printf 'import { CHAIN_C } from "./chain-c.ts";\nexport const CHAIN_B = CHAIN_C;\n' > "$SEED/supabase/functions/_shared/chain-b.ts"
printf 'import { CHAIN_B } from "../_shared/chain-b.ts";\nexport default () => new Response("d" + CHAIN_B);\n' > "$SEED/supabase/functions/fn-d/index.ts"
echo 'export const ORPHAN = 1;'                      > "$SEED/supabase/functions/_shared/orphan.ts"
echo 'Deno.test("x", () => {});'                     > "$SEED/supabase/functions/fn-a/handler.test.ts"
echo '{"imports":{}}'                                > "$SEED/supabase/functions/deno.json"
echo '{"version":"4"}'                               > "$SEED/supabase/functions/deno.lock"
# Review round: shapes the first tracer missed or could get wrong. One shared file per function so a
# change reports exactly that function.
for n in e1 e2 e3 e4 side dyn1 dyn2 dyn3; do echo "export const X_$(echo $n | tr a-z A-Z) = 1;" | sed 's/X_E/X_E/' > "$SEED/supabase/functions/_shared/$n.ts"; done
printf 'import"../_shared/e1.ts";\nexport default () => new Response("e");\n' > "$SEED/supabase/functions/fn-e/index.ts"
printf 'export*from "../_shared/e2.ts";\nexport default () => new Response("f");\n' > "$SEED/supabase/functions/fn-f/index.ts"
printf 'const o = "/*";\nimport { X_E3 } from "../_shared/e3.ts";\nconst c = "*/";\nexport default () => new Response("g" + X_E3 + o + c);\n' > "$SEED/supabase/functions/fn-g/index.ts"
printf 'import {\n  X_E4, // do not touch; legacy\n  X_E4 as Y, // it'"'"'s fine\n} from "../_shared/e4.ts";\nexport default () => new Response("h" + X_E4 + Y);\n' > "$SEED/supabase/functions/fn-h/index.ts"
printf 'const p = "../_shared/side.ts"; // only mentioned as a string, never imported\nexport default () => new Response("i" + p);\n' > "$SEED/supabase/functions/fn-i/index.ts"
printf 'export default async () => { const a = await import(`../_shared/dyn1.ts`); const b = await import("../_shared/dyn2.ts", { with: { type: "javascript" } }); return new Response("j" + a + b); };\n' > "$SEED/supabase/functions/fn-j/index.ts"
# documentation examples must never create a false FUNCTION_UNTRACEABLE
printf '// e.g. await import("./x" + y) or new URL("./f", import.meta.url) are NOT used here\n/* import.meta.url, import(name) */\nconst doc = "import(name) and import.meta.url and import \\"./missing.ts\\"";\nexport default () => new Response("k" + doc);\n' > "$SEED/supabase/functions/fn-k/index.ts"
echo '{"imports":{}}' > "$SEED/supabase/functions/deno.jsonc"
echo '{"imports":{}}' > "$SEED/supabase/functions/fn-c/deno.jsonc"
echo '{}' > "$SEED/supabase/deploy-manifest.json"

( cd "$SEED" && git init -q -b main && G add -A >/dev/null 2>&1 && G commit -qm "baseline" ) || die "seed commit"
# Baseline: everything stamped as deployed to prod, using the real stamper.
( cd "$SEED" && ./scripts/stamp-deploy-manifest.sh --env prod --functions-only --assume-all-deployed >/dev/null 2>&1 ) || die "baseline stamp failed"
( cd "$SEED" && G add supabase/deploy-manifest.json && G commit -qm "stamp: all deployed" ) || die "baseline stamp commit"
git clone -q --bare "$SEED" "$T/origin.git" || die "bare origin"
BASE_SHA=$(git -C "$SEED" rev-parse HEAD)

# fresh_work <name> — a new clone of origin; sets $W.
fresh_work() {
  W="$T/$1"; rm -rf "$W"
  # Scenarios land simulated stamps on origin; every scenario starts from the baseline again.
  git -C "$T/origin.git" update-ref refs/heads/main "$BASE_SHA" || die "reset origin"
  git clone -q "$T/origin.git" "$W" || die "clone"
  cp "$SEED/.env.prod" "$SEED/.env.local" "$W/"
  # Prove the fixture is what the check will hash: origin/main's manifest lists fn-a with the
  # hash of THIS clone's fn-a/index.ts (the key-transform guard — a fixture that touches nothing
  # the check reads would report "not reproduced" for a real defect).
  local want got
  want=$(python3 "$W/scripts/lib/function-input-hash.py" "$W/supabase/functions" --only fn-a | python3 -c 'import json,sys;print(json.load(sys.stdin)["hashes"]["fn-a"])')
  got=$(git -C "$W" show origin/main:supabase/deploy-manifest.json | python3 -c 'import json,sys;print(json.load(sys.stdin)["prod"]["functions"]["fn-a"])')
  [ "$want" = "$got" ] || die "fixture: origin manifest hash for fn-a ($got) != helper hash of fn-a ($want)"
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


# --- C. transitive / pins / unreachable / tests ----------------------------------------------
fresh_work w5; echo '// edit' >> "$W/supabase/functions/_shared/chain-c.ts"; OUT=$(check)
expect_reports "C1: transitive change (fn-d -> chain-b -> chain-c, edit chain-c) reports fn-d" "$OUT" "fn-d"
expect_not_reports "C1: ...and fn-c, which reaches none of it, stays clean" "$OUT" "FUNCTION_STALE" "fn-c"

fresh_work w6; echo '{"version":"5"}' > "$W/supabase/functions/deno.lock"; OUT=$(check)
for f in fn-a fn-b fn-c fn-d; do expect_reports "C2: deno.lock change reports $f" "$OUT" "$f"; done

fresh_work w7; echo '// edit' >> "$W/supabase/functions/_shared/orphan.ts"; OUT=$(check); RC=$?
if [ "$RC" -eq 0 ] && ! has "$OUT" "FUNCTION_STALE"; then ok "C3: a _shared file nobody imports reports nothing (exit 0)"; else bad "C3: a _shared file nobody imports reports nothing (exit 0)" "exit=$RC $OUT"; fi

fresh_work w8; echo '// edit' >> "$W/supabase/functions/fn-a/handler.test.ts"; OUT=$(check); RC=$?
if [ "$RC" -eq 0 ] && ! has "$OUT" "FUNCTION_STALE"; then ok "C4: a *.test.ts change reports nothing (exit 0)"; else bad "C4: a *.test.ts change reports nothing (exit 0)" "exit=$RC $OUT"; fi

# --- D. fail closed ---------------------------------------------------------------------------
fresh_work w9; printf 'import "./missing.ts";\n' >> "$W/supabase/functions/fn-c/index.ts"; OUT=$(check); RC=$?
if [ "$RC" -ne 0 ] && has "$OUT" "FUNCTION_UNTRACEABLE: fn-c"; then ok "D1: an unresolved relative import is reported by the check (not a pass)"; else bad "D1: an unresolved relative import is reported by the check (not a pass)" "exit=$RC $OUT"; fi
BEFORE=$(shasum -a 256 "$W/supabase/deploy-manifest.json")
SOUT=$( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --function fn-c 2>&1 ); SRC=$?
if [ "$SRC" -ne 0 ] && [ "$BEFORE" = "$(shasum -a 256 "$W/supabase/deploy-manifest.json")" ]; then ok "D2: the stamper refuses the untraceable function and leaves the manifest untouched"; else bad "D2: the stamper refuses the untraceable function and leaves the manifest untouched" "exit=$SRC $SOUT"; fi

fresh_work w10; printf 'const m = await import(name);\n' >> "$W/supabase/functions/fn-b/index.ts"; OUT=$(check)
if has "$OUT" "FUNCTION_UNTRACEABLE: fn-b"; then ok "D3: a non-literal dynamic import() is reported"; else bad "D3: a non-literal dynamic import() is reported" "$OUT"; fi

fresh_work w11; printf 'const u = new URL("./x", import.meta.url);\n' >> "$W/supabase/functions/fn-b/index.ts"; OUT=$(check)
if has "$OUT" "FUNCTION_UNTRACEABLE: fn-b"; then ok "D4: an import.meta.url file read in a traced file is reported"; else bad "D4: an import.meta.url file read in a traced file is reported" "$OUT"; fi

# A crashing helper must never read as a clean check.
fresh_work w12; printf 'import sys\nsys.exit(7)\n' > "$W/scripts/lib/function-input-hash.py"; OUT=$(check); RC=$?
if [ "$RC" -ne 0 ] && ! has "$OUT" "check passed"; then ok "D5: a crashing hash helper fails the check (exit $RC), never a pass"; else bad "D5: a crashing hash helper fails the check, never a pass" "exit=$RC $OUT"; fi

# --- E. the stamper's own contract ------------------------------------------------------------
fresh_work w13
BEFORE=$(shasum -a 256 "$W/supabase/deploy-manifest.json")
for variant in "--env prod" "--env prod --functions-only"; do
  SOUT=$( cd "$W" && ./scripts/stamp-deploy-manifest.sh $variant 2>&1 ); SRC=$?
  if [ "$SRC" -ne 0 ] && [ "$BEFORE" = "$(shasum -a 256 "$W/supabase/deploy-manifest.json")" ]; then ok "E1: bare stamp refused and manifest untouched ($variant)"; else bad "E1: bare stamp refused ($variant)" "exit=$SRC $SOUT"; fi
done
SOUT=$( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --migrations-only 2>&1 ); SRC=$?
if [ "$SRC" -eq 0 ]; then ok "E2: --migrations-only is unaffected"; else bad "E2: --migrations-only is unaffected" "exit=$SRC $SOUT"; fi
G -C "$W" checkout -q -- supabase/deploy-manifest.json 2>/dev/null

fresh_work w14
echo '// edit' >> "$W/supabase/functions/fn-a/index.ts"
echo '// edit' >> "$W/supabase/functions/fn-b/index.ts"
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --assume-all-deployed >/dev/null 2>&1 ); SRC=$?
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm stamp ) || die "commit"
git -C "$T/origin.git" fetch -q "$W" '+main:main' || die "land"
OUT=$(check); RC=$?
if [ "$SRC" -eq 0 ] && [ "$RC" -eq 0 ]; then ok "E3: --assume-all-deployed stamps everything current (explicit opt-in works)"; else bad "E3: --assume-all-deployed works" "stamp=$SRC check=$RC $OUT"; fi

fresh_work w15
echo '// edit' >> "$W/supabase/functions/fn-a/index.ts"
echo '// edit' >> "$W/supabase/functions/fn-b/index.ts"
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --function fn-a >/dev/null 2>&1 ) || die "named stamp"
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm stamp ) || die "commit"
git -C "$T/origin.git" fetch -q "$W" '+main:main' || die "land"
OUT=$(check)
if has "$OUT" "FUNCTION_STALE: fn-a" || has "$OUT" "FUNCTION_UNPUSHED_STAMP: fn-a"; then bad "E4: --function fn-a stamps fn-a" "$OUT"; else ok "E4: --function fn-a stamps fn-a current"; fi
expect_reports "E4: ...and leaves changed fn-b reported" "$OUT" "fn-b"
if python3 -c 'import json,sys;f=json.load(open(sys.argv[1]))["prod"]["functions"];sys.exit(0 if all(k in f for k in ("fn-a","fn-b","fn-c","fn-d","_shared")) else 1)' "$W/supabase/deploy-manifest.json"; then
  ok "E4: entries merged, none dropped (_shared entry kept)"; else bad "E4: entries merged, none dropped"; fi

# Orphans: merged entries survive, --forget-function removes only a function whose source is gone.
fresh_work w16
python3 - "$W/supabase/deploy-manifest.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); m["prod"]["functions"]["fn-gone"]="abc"; json.dump(m,open(sys.argv[1],"w"),indent=2)
PY
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm orphan ) || die "commit"
git -C "$T/origin.git" fetch -q "$W" '+main:main' || die "land"
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --function fn-a >/dev/null 2>&1 ) || die "named stamp 2"
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm s2 ) && git -C "$T/origin.git" fetch -q "$W" '+main:main'
OUT=$(check)
if has "$OUT" "FUNCTION_ORPHANED: fn-gone"; then ok "E5: a named stamp keeps the orphan reported (FUNCTION_ORPHANED)"; else bad "E5: orphan survives a named stamp" "$OUT"; fi
SOUT=$( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --forget-function fn-a 2>&1 ); SRC=$?
if [ "$SRC" -ne 0 ]; then ok "E5: --forget-function refuses a function whose source exists"; else bad "E5: --forget-function refuses live source" "$SOUT"; fi
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --forget-function fn-gone >/dev/null 2>&1 ); SRC=$?
if [ "$SRC" -eq 0 ] && ! grep -q fn-gone "$W/supabase/deploy-manifest.json"; then ok "E5: --forget-function drops the orphan once its source is gone"; else bad "E5: --forget-function drops the orphan"; fi

# --- F. partial deploy failure stamps only the success ----------------------------------------
fresh_work w17
echo '// edit' >> "$W/supabase/functions/fn-a/index.ts"
echo '// edit' >> "$W/supabase/functions/fn-b/index.ts"
: > "$DEPLOYS"
DOUT=$( cd "$W" && env PATH="$STUBS:$PATH" STUB_DEPLOYS="$DEPLOYS" STUB_FAIL=fn-b EDGE_SMOKE=0 \
          bash ./scripts/deploy-functions.sh --env prod 2>&1 ); DRC=$?
( cd "$W" && G add supabase/deploy-manifest.json && G commit -qm "stamp partial" ) || die "commit partial stamp"
git -C "$T/origin.git" fetch -q "$W" '+main:main' || die "land"
OUT=$(check)
if [ "$DRC" -ne 0 ]; then ok "F: a partial deploy exits non-zero"; else bad "F: a partial deploy exits non-zero" "$DOUT"; fi
if has "$OUT" "FUNCTION_STALE: fn-a" || has "$OUT" "FUNCTION_UNPUSHED_STAMP: fn-a"; then bad "F: the function that deployed (fn-a) is stamped current" "$OUT"; else ok "F: the function that deployed (fn-a) is stamped current"; fi
expect_reports "F: the function that failed (fn-b) stays reported" "$OUT" "fn-b"


# --- G. review round: tracer misses -----------------------------------------------------------
for pair in "e1 fn-e import\"x\"(no space)" "e2 fn-f export*from(no space)" "e3 fn-g import between \"/*\" and \"*/\" string literals" "e4 fn-h multi-line import with eol comments holding ; and '" "side fn-i relative path only mentioned as a string literal" "dyn1 fn-j import(template literal)" "dyn2 fn-j import() with an options argument"; do
  set -- $pair; f="$1"; fn="$2"; shift 2
  fresh_work "g-$f"; echo '// edit' >> "$W/supabase/functions/_shared/$f.ts"; OUT=$(check)
  expect_reports "G: $* reaches _shared/$f.ts and reports $fn" "$OUT" "$fn"
done
fresh_work g-doc; OUT=$(check); RC=$?
if [ "$RC" -eq 0 ] && ! has "$OUT" "FUNCTION_UNTRACEABLE"; then ok "G: comments, doc examples and string literals mentioning import()/import.meta never create FUNCTION_UNTRACEABLE"; else bad "G: doc examples create a false FUNCTION_UNTRACEABLE" "exit=$RC $OUT"; fi
fresh_work g-regex; printf 'export function g(s) { return /"/.test(s); }\nimport "./missing.ts";\nexport const z = "x";\n' > "$W/supabase/functions/fn-c/index.ts"; OUT=$(check); RC=$?
if [ "$RC" -ne 0 ] && has "$OUT" "FUNCTION_UNTRACEABLE: fn-c"; then ok "G: a regex literal holding a quote after return cannot swallow a failing import"; else bad "G: regex literal after return swallowed a failing import" "exit=$RC $OUT"; fi
fresh_work g-jsonc1; echo '{"imports":{"x":"npm:y"}}' > "$W/supabase/functions/deno.jsonc"; OUT=$(check)
for f in fn-a fn-c fn-e; do expect_reports "G: top-level deno.jsonc change reports $f" "$OUT" "$f"; done
fresh_work g-jsonc2; echo '{"imports":{"x":"npm:y"}}' > "$W/supabase/functions/fn-c/deno.jsonc"; OUT=$(check)
expect_reports "G: fn-c/deno.jsonc change reports fn-c" "$OUT" "fn-c"
expect_not_reports "G: ...and not fn-a" "$OUT" "FUNCTION_STALE" "fn-a"

# --- H. function flags imply function-only; never touch migrations ----------------------------
fresh_work h1
mkdir -p "$W/supabase/migrations"; printf 'select 1;\n' > "$W/supabase/migrations/20260102000000_unapplied.sql"
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --function fn-a >/dev/null 2>&1 ); SRC=$?
MIG=$(python3 -c 'import json,sys;print(",".join(json.load(open(sys.argv[1])).get("prod",{}).get("migrations",[])))' "$W/supabase/deploy-manifest.json")
if [ "$SRC" -eq 0 ] && ! printf '%s' "$MIG" | grep -q 20260102000000; then ok "H1: --function never stamps an unapplied migration file (migrations: '$MIG')"; else bad "H1: --function stamped an unapplied migration" "exit=$SRC migrations=$MIG"; fi
fresh_work h2
mkdir -p "$W/supabase/migrations"; printf 'select 1;\n' > "$W/supabase/migrations/20260102000000_unapplied.sql"
python3 - "$W/supabase/deploy-manifest.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); m["prod"]["functions"]["fn-gone"]="abc"; json.dump(m,open(sys.argv[1],"w"),indent=2)
PY
( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod --allow-dirty --forget-function fn-gone >/dev/null 2>&1 ); SRC=$?
MIG=$(python3 -c 'import json,sys;print(",".join(json.load(open(sys.argv[1])).get("prod",{}).get("migrations",[])))' "$W/supabase/deploy-manifest.json")
if [ "$SRC" -eq 0 ] && ! printf '%s' "$MIG" | grep -q 20260102000000; then ok "H2: --forget-function never stamps an unapplied migration file"; else bad "H2: --forget-function stamped a migration" "exit=$SRC migrations=$MIG"; fi
fresh_work h3
BEFORE=$(shasum -a 256 "$W/supabase/deploy-manifest.json")
for combo in "--migrations-only --function fn-a" "--migrations-only --forget-function fn-a" "--function fn-a --migrations-only"; do
  SOUT=$( cd "$W" && ./scripts/stamp-deploy-manifest.sh --env prod $combo 2>&1 ); SRC=$?
  if [ "$SRC" -ne 0 ] && [ "$BEFORE" = "$(shasum -a 256 "$W/supabase/deploy-manifest.json")" ]; then ok "H3: '$combo' exits non-zero and writes nothing"; else bad "H3: '$combo' must exit non-zero" "exit=$SRC $SOUT"; fi
done

echo
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
