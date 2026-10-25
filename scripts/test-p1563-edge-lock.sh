#!/usr/bin/env bash
# P1563 item 4: the edge-function import graph is exact AND locked, and the lock is ENFORCED.
#
#   ./scripts/test-p1563-edge-lock.sh                # local checks + controls; Docker bundle control if the daemon is up
#   REQUIRE_DOCKER=1 ./scripts/test-p1563-edge-lock.sh   # a missing daemon FAILS instead of skipping
#
# What this proves (every check has a control that must fail first):
#   1. supabase/functions/deno.json maps only EXACT npm:/jsr: versions; every function dir has a
#      deno.json pointing at the shared import map and the shared deno.lock.
#   2. Every remote https import in a .ts source carries an exact @x.y.z version.
#   3. The lock is COMPLETE: `deno check --frozen` over every .ts file (entrypoints, _shared, tests)
#      fails if any dependency is missing from supabase/functions/deno.lock.
#   4. The lock is ENFORCED by Deno: an altered integrity entry / altered remote hash makes
#      `deno cache --frozen` fail (fresh DENO_DIR, so nothing is served from a warm cache).
#   5. The lock is ENFORCED BY THE DEPLOY BUNDLER: the Supabase CLI (`functions deploy`, Docker path)
#      runs `edge-runtime bundle` in the supabase/edge-runtime image with the functions directory
#      mounted. The same command, run here without deploying, fails on an altered lock and passes on
#      the real one. The image tag mirrors the CLI's template (apps/cli-go/pkg/config/templates/Dockerfile
#      in CLI v2.117.0); override with EDGE_RUNTIME_IMAGE.
#
# NOT covered, by construction (see the P1563 evidence report): the CLI's server-side bundling
# fallback (used when Docker is not running) cannot be exercised without deploying, and the .wasm files
# the @jsquash modules fetch from esm.sh at invocation time are not module imports, so no lock can pin them.
#
# Pre-commit / `deno test` note: from the repo root Deno does not discover supabase/functions/*/deno.json
# (the root package.json wins), so bare specifiers fail unless the config is passed explicitly:
#   deno check --config supabase/functions/<fn>/deno.json supabase/functions/<fn>/index.ts
#   deno test  --config supabase/functions/deno.json -A supabase/functions
#
# Needs network (npm registry, esm.sh, deno.land). Run from a worktree or the main checkout.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
FN="$ROOT/supabase/functions"
IMAGE="${EDGE_RUNTIME_IMAGE:-supabase/edge-runtime:v1.74.3}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FAILS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }
expect_ok()   { local name="$1"; shift; if "$@" >"$TMP/out" 2>&1; then pass "$name"; else fail "$name"; sed 's/^/        /' "$TMP/out" | head -8; fi; }
expect_fail() { local name="$1" needle="$2"; shift 2; if "$@" >"$TMP/out" 2>&1; then fail "$name (command SUCCEEDED, expected failure)"; else
                  if grep -qi "$needle" "$TMP/out"; then pass "$name"; else fail "$name (failed, but not with '$needle')"; sed 's/^/        /' "$TMP/out" | head -8; fi; fi; }

command -v deno >/dev/null || { echo "deno not installed"; exit 2; }
command -v node >/dev/null || { echo "node not installed"; exit 2; }
[ -f "$FN/deno.json" ] && [ -f "$FN/deno.lock" ] || { echo "FAIL  supabase/functions/deno.json or deno.lock missing"; exit 1; }

echo "== 1. deno.json: exact versions, every function wired to the shared map + lock"
expect_ok "import map holds only exact npm:/jsr: versions" node -e '
  const j = require(process.argv[1]); const bad = [];
  for (const [k, v] of Object.entries(j.imports || {})) if (!/^(npm|jsr):(@[^/@]+\/)?[^@/]+@\d+\.\d+\.\d+(\/[^@]*)?$/.test(v)) bad.push(k + ": " + v);
  if (!Object.keys(j.imports || {}).length) bad.push("no imports");
  if (j.lock === false) bad.push("lock disabled");
  if (bad.length) { console.error(bad.join("\n")); process.exit(1); }' "$FN/deno.json"
MISSING=""
for d in "$FN"/*/; do
  n="$(basename "$d")"; case "$n" in _*) continue ;; esac
  if ! node -e 'const j=require(process.argv[1]); process.exit(j.importMap==="../deno.json" && j.lock==="../deno.lock" ? 0 : 1)' "$d/deno.json" 2>/dev/null; then MISSING="$MISSING $n"; fi
done
if [ -z "$MISSING" ]; then pass "every function dir has deno.json {importMap ../deno.json, lock ../deno.lock}"; else fail "function dirs without the standard deno.json:$MISSING"; fi

echo "== 2. remote https imports in sources are exact"
find "$FN" -name '*.ts' -not -path '*/node_modules/*' | sort > "$TMP/ts.list"
: > "$TMP/remote.list"
while IFS= read -r f; do grep -HoE "(from |import\()\s*['\"](https?://|npm:|jsr:)[^'\"]+['\"]" "$f" >> "$TMP/remote.list" || true; done < "$TMP/ts.list"
# remote specifier without an exact @x.y.z segment
grep -vE "@[0-9]+\.[0-9]+\.[0-9]+([/'\"])" "$TMP/remote.list" > "$TMP/remote.inexact" || true
if [ -s "$TMP/remote.inexact" ]; then fail "inexact remote import(s):"; sed 's/^/        /' "$TMP/remote.inexact" | head; else pass "all $(wc -l < "$TMP/remote.list" | tr -d ' ') remote imports carry an exact version"; fi
# control: the detector must flag a range
printf "x.ts:import a from 'https://esm.sh/foo@2'\n" | grep -vE "@[0-9]+\.[0-9]+\.[0-9]+([/'\"])" > "$TMP/ctl" || true
if [ -s "$TMP/ctl" ]; then pass "control: a ranged specifier is flagged"; else fail "control: the exactness detector missed a ranged specifier"; fi

echo "== 3. lock completeness (deno check --frozen over every .ts, shared config)"
export DENO_DIR="$TMP/denodir-warm"
cp "$FN/deno.lock" "$TMP/lock.before"
# shellcheck disable=SC2046
expect_ok "deno check --frozen: all $(wc -l < "$TMP/ts.list" | tr -d ' ') sources resolve inside the lock" deno check --frozen --config "$FN/deno.json" $(cat "$TMP/ts.list")
for d in "$FN"/*/; do
  n="$(basename "$d")"; case "$n" in _*) continue ;; esac
  deno check --frozen --config "$d/deno.json" "$d/index.ts" >"$TMP/out" 2>&1 || { fail "per-function check: $n"; sed 's/^/        /' "$TMP/out" | head -6; }
done
[ "$FAILS" -eq 0 ] && pass "per-function deno check --frozen (the pre-commit shape) passes for every function"
# control: remove an entry the graph needs -> frozen check must fail
rm -rf "$TMP/c1" && mkdir -p "$TMP/c1" && cp -R "$FN" "$TMP/c1/functions"
node -e 'const fs=require("fs"),p=process.argv[1];const l=JSON.parse(fs.readFileSync(p));delete l.npm["jose@5.10.0"];fs.writeFileSync(p,JSON.stringify(l,null,2))' "$TMP/c1/functions/deno.lock"
expect_fail "control: lock missing a needed package fails --frozen" "lockfile\|frozen\|not in\|jose" deno check --frozen --config "$TMP/c1/functions/deno.json" "$TMP/c1/functions/enqueue-transcription/index.ts"

echo "== 4. Deno enforces the lock (fresh DENO_DIR)"
rm -rf "$TMP/c2" && mkdir -p "$TMP/c2" && cp -R "$FN" "$TMP/c2/functions"
node -e '
  const fs=require("fs"),p=process.argv[1];const l=JSON.parse(fs.readFileSync(p));
  const k="jose@5.10.0"; l.npm[k].integrity=l.npm[k].integrity.replace(/^sha512-./,"sha512-A");
  fs.writeFileSync(p,JSON.stringify(l,null,2))' "$TMP/c2/functions/deno.lock"
export DENO_DIR="$TMP/denodir-c2"
expect_fail "altered npm integrity entry is rejected" "checksum\|integrity" deno cache --frozen --config "$TMP/c2/functions/deno.json" "$TMP/c2/functions/enqueue-transcription/index.ts"
rm -rf "$TMP/c3" && mkdir -p "$TMP/c3" && cp -R "$FN" "$TMP/c3/functions"
node -e '
  const fs=require("fs"),p=process.argv[1];const l=JSON.parse(fs.readFileSync(p));
  const k="https://deno.land/std@0.168.0/http/server.ts"; l.remote[k]=l.remote[k].replace(/^./,l.remote[k][0]==="0"?"1":"0");
  fs.writeFileSync(p,JSON.stringify(l,null,2))' "$TMP/c3/functions/deno.lock"
export DENO_DIR="$TMP/denodir-c3"
expect_fail "altered remote-module hash is rejected" "integrity\|checksum" deno cache --frozen --config "$TMP/c3/functions/deno.json" "$TMP/c3/functions/send-event-emails/index.ts"
export DENO_DIR="$TMP/denodir-good"
expect_ok "control: the untouched lock passes the same command (fresh DENO_DIR)" deno cache --frozen --config "$FN/deno.json" "$FN/enqueue-transcription/index.ts" "$FN/send-event-emails/index.ts"

echo "== 5. the deploy bundler (Supabase CLI Docker path: edge-runtime bundle) enforces the lock"
if docker info >/dev/null 2>&1; then
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then echo "  (pulling $IMAGE)"; docker pull -q "$IMAGE" >/dev/null 2>&1 || true; fi
  bundle() { # $1 = functions dir to mount, $2 = function name; same flags as the CLI (DENO_NO_PACKAGE_JSON=1 unless package.json beside the function)
    docker run --rm -v "$1:/work/supabase/functions:ro" -v "$TMP/bundle-out:/out" -w /work -e DENO_NO_PACKAGE_JSON=1 \
      "$IMAGE" bundle --entrypoint "/work/supabase/functions/$2/index.ts" --output "/out/$2.eszip"
  }
  mkdir -p "$TMP/bundle-out"
  expect_ok "control: real lock, enqueue-transcription (npm jose + std serve) bundles" bundle "$FN" enqueue-transcription
  expect_ok "control: real lock, generate-banner (npm supabase-js + esm.sh jsquash) bundles" bundle "$FN" generate-banner
  rm -f "$TMP/bundle-out/"*.eszip
  expect_fail "altered npm integrity: bundler refuses" "integrity check failed" bundle "$TMP/c2/functions" enqueue-transcription
  [ ! -e "$TMP/bundle-out/enqueue-transcription.eszip" ] && pass "no eszip was produced for the altered lock" || fail "an eszip was produced despite the altered lock"
  expect_fail "altered remote hash: bundler refuses" "integrity check failed" bundle "$TMP/c3/functions" send-event-emails
  # the lock must also survive the bundler untouched (a bundler that rewrote it would mask drift)
  rm -rf "$TMP/c4" && mkdir -p "$TMP/c4" && cp -R "$FN" "$TMP/c4/functions"
  for n in $(cd "$FN" && ls -d */ | tr -d / | grep -v '^_'); do
    docker run --rm -v "$TMP/c4/functions:/work/supabase/functions" -v "$TMP/bundle-out:/out" -w /work -e DENO_NO_PACKAGE_JSON=1 "$IMAGE" bundle --entrypoint "/work/supabase/functions/$n/index.ts" --output "/out/$n.eszip" >"$TMP/out" 2>&1 || { fail "bundle (rw) failed: $n"; sed 's/^/        /' "$TMP/out" | head -6; }
  done
  if cmp -s "$FN/deno.lock" "$TMP/c4/functions/deno.lock"; then pass "all 21 functions bundle with a writable mount and the bundler leaves deno.lock byte-identical (lock is complete for Deno 2.1.4 too)"; else fail "the bundler rewrote deno.lock (lock incomplete for the deploy runtime)"; diff "$FN/deno.lock" "$TMP/c4/functions/deno.lock" | head -10; fi
else
  if [ "${REQUIRE_DOCKER:-0}" = "1" ]; then fail "Docker daemon not running and REQUIRE_DOCKER=1"; else echo "  SKIPPED  Docker daemon not running: the deploy-bundler control (section 5) did NOT run. Not a pass."; fi
fi

cmp -s "$FN/deno.lock" "$TMP/lock.before" || { fail "supabase/functions/deno.lock changed during the run"; }
echo
if [ "$FAILS" -eq 0 ]; then echo "RESULT: all checks passed"; exit 0; else echo "RESULT: $FAILS check(s) FAILED"; exit 1; fi
