#!/bin/bash
# Canary for P1635: the pre-commit "Tests" step runs related tests, not the full suite.
#
#   bash scripts/test-p1635-precommit-tests.sh           fast: classification, derivation, command
#                                                       shape, printed counts. Runs from the hook.
#   bash scripts/test-p1635-precommit-tests.sh --real    adds real-vitest proofs in scratch repos
#                                                       (minutes; never run from the hook).
#
# WHAT EARNS ITS PLACE (each RED case has a GREEN twin, epistemic gate 7c: a gate whose fixture holds
# only inputs it should refuse leaves its false-positive rate unmeasured):
#
#   Part 1  classification. Every staged-file shape the spec names must fall back to the full suite
#           (vercel.json, lockfiles, package.json, tsconfig, *.config.*, public/, scripts/, e2e/,
#           deletions, renames, the vitest setup file, __mocks__), and the ordinary ones must NOT:
#           a src edit, a src edit beside a docs edit, a name with a space, a new src test, a css
#           file under src/. The false-positive side matters as much: a classifier that sent
#           everything to the full suite would pass every refusal test and fix nothing.
#   Part 2  derivation (gate 7e). The disk-reading group is derived by grep at run time. A known
#           member per derivation path is asserted against the REAL tree (a control outside the
#           scratch scope), and a scratch repo holds a known non-member the matcher must skip.
#   Part 3  command shape and printed counts, with a stub `npx`: the worker cap is on EVERY run
#           (related and full), the count is printed outside run_quiet on a PASS, a zero is said in
#           words, and a missing report fails closed.
#   Part 4  wiring. The hook uses the library, not `npm test`.
#
# Run under /bin/bash 3.2 on purpose: that is what the hook runs under on macOS.

set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_CONFIG_PARAMETERS

REAL=0
[ "${1:-}" = "--real" ] && REAL=1

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
HOOK="$REPO_ROOT/scripts/pre-commit-checks.sh"
LIB="$REPO_ROOT/scripts/lib/precommit-tests.sh"

PASS=0
FAIL=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ok()  { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check() { if [ "$3" = "$2" ]; then ok "$1"; else bad "$1 — expected '$2', got '$3'"; fi; }

# Colors + run_quiet exactly as the hook gets them.
RED='' YELLOW='' GREEN='' NC=''
# shellcheck source=lib/run-quiet.sh
. "$REPO_ROOT/scripts/lib/run-quiet.sh"
RED='' YELLOW='' GREEN='' NC=''
# shellcheck source=lib/precommit-tests.sh
. "$LIB"

# The build-affecting pattern is DERIVED from the hook, never copied (gate 7e).
BUILD_RE="$(grep -m1 "^BUILD_AFFECTING_RE='" "$HOOK" | sed "s/^BUILD_AFFECTING_RE='//; s/'\$//")"
[ -n "$BUILD_RE" ] && ok "derived BUILD_AFFECTING_RE from the hook" || bad "could not derive BUILD_AFFECTING_RE from the hook"
DOCS_RE="$(grep -m1 "^DOCS_ONLY_RE='" "$HOOK" | sed "s/^DOCS_ONLY_RE='//; s/'\$//")"
[ -n "$DOCS_RE" ] && ok "derived DOCS_ONLY_RE from the hook" || bad "could not derive DOCS_ONLY_RE from the hook"

# ── scratch repo ──────────────────────────────────────────────────────────────
mk_repo() {
    R="$TMP/repo$1"
    rm -rf "$R"; mkdir -p "$R"
    git -C "$R" init -q
    git -C "$R" config user.email t@example.invalid; git -C "$R" config user.name t
    git -C "$R" config commit.gpgsign false
    mkdir -p "$R/src/lib" "$R/src/tests" "$R/src/__mocks__" "$R/docs" "$R/scripts" "$R/e2e" "$R/api" "$R/public"
    printf 'export const a = 1\n'            > "$R/src/lib/a.ts"
    printf 'export const z = 1\n'            > "$R/src/lib/z.ts"
    printf 'export {}\n'                     > "$R/src/tests/setup.tsx"
    printf 'body{}\n'                        > "$R/src/lib/x.css"
    printf 'export default { test: { setupFiles: "./src/tests/setup.tsx" } }\n' > "$R/vite.config.ts"
    printf '{}\n' > "$R/vercel.json"; printf '{"name":"x"}\n' > "$R/package.json"; printf '{}\n' > "$R/package-lock.json"
    printf '{}\n' > "$R/tsconfig.app.json"; printf 'x\n' > "$R/public/logo.png"
    printf 'x\n' > "$R/scripts/a.js"; printf 'x\n' > "$R/e2e/a.ts"; printf 'x\n' > "$R/api/x.ts"
    printf 'x\n' > "$R/src/lib/x.config.ts"; printf 'x\n' > "$R/src/__mocks__/m.ts"
    printf 'doc\n' > "$R/docs/d.md"; printf 'doc2\n' > "$R/docs/e.md"
    mkdir -p "$R/scripts/lib" "$R/supabase/functions" "$R/features" "$R/.claude" "$R/.agents" "$R/content"
    printf 'export const m = 1\n' > "$R/scripts/lib/x.mjs"; printf 'echo x\n' > "$R/scripts/x.sh"
    printf 'A=1\n' > "$R/.env.test"; printf '<html></html>\n' > "$R/index.html"
    printf 'export default {}\n' > "$R/vite.config.mts"; printf '{}\n' > "$R/supabase/functions/deno.json"
    printf 'f\n' > "$R/features/f.md"; printf 'c\n' > "$R/.claude/c.md"; printf 'a\n' > "$R/.agents/a.md"
    printf 'c\n' > "$R/content/c.md"; printf '# r\n' > "$R/README.md"
    # the known disk reader the Tests step derives and checks for (PCT_DISK_SENTINEL)
    printf 'import { readFileSync } from "node:fs"\n' > "$R/src/tests/p1533-auth-callback-no-public-nav.test.ts"
    git -C "$R" add -A >/dev/null 2>&1
    git -C "$R" commit -q -m base
}
touch_file() { printf '\n// edit\n' >> "$R/$1"; git -C "$R" add -- "$1"; }

# classify <label> <expect: related|full> <stage-fn args...>   (expectation then the staging action)
classify() {
    local label="$1" expect="$2"; shift 2
    mk_repo c
    "$@"
    pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
    local got=related
    [ -n "$PCT_FULL_REASON" ] && got=full
    check "$label → $expect" "$expect" "$got"
}

echo "P1635 canary — pre-commit Tests step"
echo
echo "── Part 1: classification (RED = full suite, GREEN = related) ──"
st_src()       { touch_file src/lib/a.ts; }
st_src_docs()  { touch_file src/lib/a.ts; touch_file docs/d.md; }
st_space()     { printf 'export const s = 1\n' > "$R/src/lib/with space.ts"; git -C "$R" add -- "src/lib/with space.ts"; }
st_newtest()   { printf 'it("x",()=>{})\n' > "$R/src/tests/new.test.ts"; git -C "$R" add -- src/tests/new.test.ts; }
st_css()       { touch_file src/lib/x.css; }
st_docs_only_src_new() { printf 'export const o = 1\n' > "$R/src/lib/orphan.ts"; git -C "$R" add -- src/lib/orphan.ts; }
classify "a src edit"                                   related st_src
classify "a src edit beside a docs edit"                related st_src_docs
classify "a src path with a space in its name"          related st_space
classify "a new src test file"                          related st_newtest
classify "a css file under src (a module imports it)"   related st_css
classify "a brand-new src file nothing imports yet"     related st_docs_only_src_new

for f in vercel.json package.json package-lock.json tsconfig.app.json public/logo.png scripts/a.js e2e/a.ts api/x.ts vite.config.ts src/lib/x.config.ts src/tests/setup.tsx src/__mocks__/m.ts; do
    st_one() { touch_file "$f"; }
    classify "$f alone" full st_one
done
st_delete()  { git -C "$R" rm -q -- src/lib/z.ts; }
st_rename()  { git -C "$R" mv src/lib/z.ts src/lib/zz.ts; }
st_doc_delete_with_src() { touch_file src/lib/a.ts; git -C "$R" rm -q -- docs/e.md; }
classify "a staged deletion"                            full st_delete
classify "a staged rename (rename detection is OFF, so it is a delete)" full st_rename
classify "a docs deletion beside a src edit (conservative: any deletion)" full st_doc_delete_with_src

# FAIL CLOSED: a src edit with ANY non-docs path outside src/ beside it runs the full suite. The first
# version only knew the regex shapes and let these through silently (scripts/lib/*.mjs has real test
# edges: p1357 and p1542 import one each).
for f in scripts/lib/x.mjs scripts/x.sh .env.test index.html vite.config.mts supabase/functions/deno.json scripts/a.js e2e/a.ts vercel.json; do
    st_mixed() { touch_file src/lib/a.ts; touch_file "$f"; }
    classify "a src edit beside $f" full st_mixed
done
# GREEN twins (gate 7c): the docs-only allowlist beside a src edit must stay related.
for f in docs/d.md features/f.md .claude/c.md .agents/a.md content/c.md README.md; do
    st_mixed_doc() { touch_file src/lib/a.ts; touch_file "$f"; }
    classify "a src edit beside docs-only $f" related st_mixed_doc
done
st_all_docs() { touch_file src/lib/a.ts; touch_file docs/d.md; touch_file features/f.md; touch_file .claude/c.md; touch_file README.md; }
classify "a src edit beside docs, features, .claude and README together" related st_all_docs
mk_repo c; st_mixed() { touch_file src/lib/a.ts; touch_file scripts/lib/x.mjs; }; st_mixed
pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
case "$PCT_FULL_REASON" in *"scripts/lib/x.mjs"*) ok "  and the reason NAMES the file that forced the full run" ;; *) bad "  reason does not name the file: $PCT_FULL_REASON" ;; esac
pct_classify "$R" "$BUILD_RE" ""
[ -n "$PCT_FULL_REASON" ] && ok "a missing docs-only pattern fails closed to the full suite" || bad "empty docs pattern did not fail closed"

# The same shape against the REAL tree, with a TEMPORARY index (mode-only edits: no object is written,
# nothing real is staged): src/lib/return-state.ts + scripts/lib/video-summary-core.mjs, whose test
# (p1357) imports the .mjs.
REAL_TREE="${P1635_TREE:-$REPO_ROOT}"
grep -q "scripts/lib/video-summary-core.mjs" "$REAL_TREE/src/tests/p1357-video-summary-core.test.ts" 2>/dev/null \
    && ok "real tree: p1357 imports scripts/lib/video-summary-core.mjs (a real test edge)" || bad "real tree: p1357 no longer imports video-summary-core.mjs, pick another edge"
TIDX="$TMP/real-index"
if GIT_INDEX_FILE="$TIDX" git -C "$REAL_TREE" read-tree HEAD 2>/dev/null \
   && GIT_INDEX_FILE="$TIDX" git -C "$REAL_TREE" update-index --chmod=+x src/lib/return-state.ts scripts/lib/video-summary-core.mjs 2>/dev/null; then
    ( export GIT_INDEX_FILE="$TIDX"; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE"; echo "$PCT_FULL_REASON" ) > "$TMP/real-reason" 2>/dev/null
    case "$(cat "$TMP/real-reason")" in *"video-summary-core.mjs"*) ok "real tree: src edit + video-summary-core.mjs → FULL (was: related, mjs ignored)" ;; *) bad "real tree: mixed src + .mjs not sent to the full suite: $(cat "$TMP/real-reason")" ;; esac
    ( export GIT_INDEX_FILE="$TIDX"; git -C "$REAL_TREE" update-index --chmod=-x scripts/lib/video-summary-core.mjs; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE"; echo "[${PCT_SRC[*]:-}]${PCT_FULL_REASON}" ) > "$TMP/real-reason2" 2>/dev/null
    [ "$(cat "$TMP/real-reason2")" = "[src/lib/return-state.ts]" ] && ok "real tree control: the src edit alone stays RELATED" || bad "real tree control: src alone is not related: $(cat "$TMP/real-reason2")"
else
    bad "real tree: could not build the temporary index"
fi

mk_repo c
mkdir -p "$R/src/app/pages" "$R/src/app/content"
printf 'import c from "../content/terms.md?raw"\nexport const T = c\n' > "$R/src/app/pages/terms-page.tsx"
printf '# terms\n' > "$R/src/app/content/terms.md"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m raw
printf 'more\n' >> "$R/src/app/content/terms.md"; git -C "$R" add -- src/app/content/terms.md
printf 'export const x = 1\n' >> "$R/src/lib/a.ts"; git -C "$R" add -- src/lib/a.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
case " ${PCT_SRC[*]:-} " in *" src/app/pages/terms-page.tsx "*) ok "staged markdown imported with ?raw seeds its IMPORTING page (no graph edge otherwise)" ;; *) bad "?raw importer not seeded: ${PCT_SRC[*]:-}" ;; esac
mk_repo c; st_src
pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
check "  the src edit is the seed, spelled exactly" "src/lib/a.ts" "${PCT_SRC[*]:-}"
mk_repo c; st_space
pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
check "  a spaced name stays ONE seed" "1" "${#PCT_SRC[@]}"
pct_classify "$R" "" "$DOCS_RE"
[ -n "$PCT_FULL_REASON" ] && ok "a missing build-affecting pattern fails closed to the full suite" || bad "empty pattern did not fail closed"

echo
echo "── Part 2: the disk-reading group is derived, not listed (gate 7e) ──"
# Control OUTSIDE the scratch scope: known members of the REAL tree, one per derivation path.
real="$(pct_disk_sources "${P1635_TREE:-$REPO_ROOT}")"
has() { grep -qxF -- "$1" <<< "$real"; }
has src/tests/p1533-auth-callback-no-public-nav.test.ts && ok "path: readFileSync (p1533, reads src/App.tsx without importing it)" || bad "p1533 test missing from the derived group"
has src/tests/p1039-reproduce.test.ts                   && ok "path: execSync" || bad "execSync member missing"
has src/tests/p955-gate-sweep.test.tsx                  && ok "path: import.meta.glob" || bad "import.meta.glob member missing"
has src/tests/p1219-legal-markdown-strict.test.ts       && ok "path: ?raw import in a TEST (it reads app markdown with no graph edge)" || bad "?raw test member missing"
has src/app/pages/privacy-policy-page.tsx               && bad "an APPLICATION page using ?raw is a seed (it selects every test that renders App)" || ok "an application page that imports markdown with ?raw is NOT a seed"
has src/tests/helpers/newest-migration.ts               && ok "path: a non-test HELPER that reads the disk (its importers get selected too)" || bad "helper member missing"
[ "$(wc -l <<< "$real" | tr -d ' ')" -gt 100 ] && ok "derived group is non-trivial (more than 100 files)" || bad "derived group is suspiciously small"

# Known-bad control INSIDE a scratch repo, through the same function: a reader is in, a pure file is out.
mk_repo d
printf 'import { readFileSync } from "node:fs"\n'   > "$R/src/tests/reader.test.ts"
printf 'import { execSync } from "child_process"\n' > "$R/src/tests/exec.test.ts"
printf 'const t = import.meta.glob("./*.ts")\n'     > "$R/src/tests/glob.test.ts"
printf 'import x from "./a.ts?raw"\n'               > "$R/src/tests/raw.test.ts"
mkdir -p "$R/src/app/pages" "$R/src/app/content"
printf 'import c from "../content/terms.md?raw"\n'  > "$R/src/app/pages/terms-page.tsx"
printf '# terms\n'                                  > "$R/src/app/content/terms.md"
printf 'const offsets = [1, 2]; expect(offsets)\n'  > "$R/src/tests/pure.test.ts"
git -C "$R" add -A >/dev/null 2>&1
scratch="$(pct_disk_sources "$R")"
for m in reader exec glob raw; do
    grep -qxF "src/tests/$m.test.ts" <<< "$scratch" && ok "scratch control: $m.test.ts is in the group" || bad "scratch control: $m.test.ts missing"
done
grep -qxF "src/app/pages/terms-page.tsx" <<< "$scratch" && bad "scratch control: an app page using ?raw was wrongly included" || ok "scratch control: an app page using ?raw is NOT in the group"
grep -qxF "src/tests/pure.test.ts" <<< "$scratch" && bad "scratch control: pure.test.ts was wrongly included ('offsets' is not fs)" || ok "scratch control: a pure test (word 'offsets') is NOT in the group"

echo
echo "── Part 3: command shape and printed counts (stub npx) ──"
mkdir -p "$TMP/bin"
cat > "$TMP/bin/npx" <<'STUB'
#!/bin/bash
# Records argv, writes a vitest-shaped JSON report with STUB_COUNT files, exits STUB_RC.
printf '%s\n' "$@" > "$STUB_ARGV"
out=""
for a in "$@"; do case "$a" in --outputFile.json=*) out="${a#--outputFile.json=}" ;; esac; done
if [ -z "${STUB_NO_REPORT:-}" ] && [ -n "$out" ]; then
    python3 -I -c 'import json,sys,os
n=int(sys.argv[1]); bad=int(os.environ.get("STUB_FAILED","0"))
print(json.dumps({"testResults":[{"name":os.getcwd()+"/src/tests/f%d.test.ts"%i,"status":"failed" if i<bad else "passed"} for i in range(n)]}))' "${STUB_COUNT:-0}" > "$out"
fi
echo "stub vitest output that run_quiet must hide on success"
exit "${STUB_RC:-0}"
STUB
chmod +x "$TMP/bin/npx"
export STUB_ARGV="$TMP/argv"

run_step() { # run_step <stage-fn> ; output in STEP_OUT, rc in STEP_RC (hook cwd = the repo root)
    mk_repo s; "$1"
    STEP_OUT="$( cd "$R" && PATH="$TMP/bin:$PATH" pct_run_tests "$R" "$BUILD_RE" "$DOCS_RE" 2>&1 )"; STEP_RC=$?
}
STUB_COUNT=7; STUB_RC=0; unset STUB_NO_REPORT; export STUB_COUNT STUB_RC

run_step st_src
check "related run passes → rc 0" "0" "$STEP_RC"
case "$STEP_OUT" in *"Tests plan... RELATED"*) ok "  plan line says RELATED, before the run" ;; *) bad "  no RELATED plan line: $STEP_OUT" ;; esac
case "$STEP_OUT" in *"Tests ran... 7 test file(s)"*) ok "  PASS still prints the count of files that ran (outside run_quiet)" ;; *) bad "  count not printed on a pass: $STEP_OUT" ;; esac
case "$STEP_OUT" in *"stub vitest output"*) bad "  run_quiet leaked output on success" ;; *) ok "  run_quiet still hides the runner's own output on success" ;; esac
grep -qx -- 'related' "$STUB_ARGV" && ok "  related mode invokes: vitest related" || bad "  related mode did not call vitest related: $(tr '\n' ' ' < "$STUB_ARGV")"
grep -qx -- '--maxWorkers=3' "$STUB_ARGV" && ok "  the worker cap (3) is on the related run" || bad "  related run has no worker cap"
grep -qx -- "$R/src/lib/a.ts" "$STUB_ARGV" && ok "  the staged file is passed EXPLICITLY, as an absolute path" || bad "  staged file not passed explicitly"

st_vercel() { touch_file vercel.json; }
run_step st_vercel
case "$STEP_OUT" in *"Tests plan... FULL suite"*"vercel.json"*) ok "vercel.json alone → plan says FULL and names the file" ;; *) bad "vercel.json did not announce a full run: $STEP_OUT" ;; esac
grep -qx -- 'run' "$STUB_ARGV" && ! grep -qx -- 'related' "$STUB_ARGV" && ok "  full mode invokes: vitest run (no related filter)" || bad "  full mode shape wrong: $(tr '\n' ' ' < "$STUB_ARGV")"
grep -qx -- '--maxWorkers=3' "$STUB_ARGV" && ok "  the worker cap is on the FULL run too" || bad "  full run has no worker cap"

PRECOMMIT_TEST_WORKERS=2 run_step st_vercel
grep -qx -- '--maxWorkers=2' "$STUB_ARGV" && ok "PRECOMMIT_TEST_WORKERS=2 tunes the cap" || bad "cap override ignored"
for v in 0 00 0000 abc -1 "" 3.5 " 2"; do
    PRECOMMIT_TEST_WORKERS="$v" run_step st_vercel
    grep -qx -- '--maxWorkers=3' "$STUB_ARGV" && ok "PRECOMMIT_TEST_WORKERS='$v' falls back to the default cap, never to uncapped" || bad "bad cap value '$v' escaped the cap"
done

# FAIL CLOSED on the disk-reading seed group: an error, an empty group, or a group without its known
# member must run the FULL suite, never narrow on a group nobody can vouch for.
PCT_DISK_PATTERN='(' run_step st_src
case "$STEP_OUT" in *"FULL suite (git grep failed"*) ok "a git grep ERROR while deriving the seed group → FULL suite" ;; *) bad "git grep error did not fall back: $STEP_OUT" ;; esac
grep -qx -- 'run' "$STUB_ARGV" && ok "  and the runner is invoked as a full run" || bad "  runner shape after a grep error: $(tr '\n' ' ' < "$STUB_ARGV")"
st_no_readers()   { git -C "$R" rm -q -f -- src/tests/p1533-auth-callback-no-public-nav.test.ts; git -C "$R" commit -q -m noreaders; touch_file src/lib/a.ts; }
st_no_sentinel()  { git -C "$R" mv src/tests/p1533-auth-callback-no-public-nav.test.ts src/tests/renamed.test.ts; git -C "$R" commit -q -m rename; touch_file src/lib/a.ts; }
st_blind()        { printf 'it("x",()=>{})\n' > "$R/src/tests/p1533-auth-callback-no-public-nav.test.ts"; printf 'import fs from "fs"\n' > "$R/src/tests/other-reader.test.ts"; git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m blind; touch_file src/lib/a.ts; }
run_step st_no_readers
case "$STEP_OUT" in *"FULL suite (the disk-reading seed group is empty"*) ok "an EMPTY seed group → FULL suite, reason printed" ;; *) bad "empty group did not fall back: $STEP_OUT" ;; esac
run_step st_no_sentinel
case "$STEP_OUT" in *"FULL suite"*"is not tracked"*) ok "the known member renamed away → FULL suite, and the message says how to repair" ;; *) bad "missing sentinel did not fall back: $STEP_OUT" ;; esac
run_step st_blind
case "$STEP_OUT" in *"FULL suite"*"lacks its known member"*) ok "a group that LACKS the known member (derivation blind) → FULL suite" ;; *) bad "blind derivation did not fall back: $STEP_OUT" ;; esac
run_step st_src
case "$STEP_OUT" in *"Tests plan... RELATED"*) ok "GREEN twin: a healthy group (known member present) still runs RELATED" ;; *) bad "healthy group no longer related: $STEP_OUT" ;; esac

STUB_COUNT=0 run_step st_docs_only_src_new
check "a zero-file run still passes (nothing failed)" "0" "$STEP_RC"
case "$STEP_OUT" in *"ZERO test files ran"*) ok "  and SAYS it ran zero, in words" ;; *) bad "  zero selection was silent: $STEP_OUT" ;; esac

STUB_RC=1 STUB_COUNT=4 run_step st_src
check "a failing run → rc 1 (refused)" "1" "$STEP_RC"
case "$STEP_OUT" in *"Tests ran... 4 test file(s)"*) ok "  and the count is still printed on a failure" ;; *) bad "  no count on failure: $STEP_OUT" ;; esac

STUB_RC=1 STUB_COUNT=4 STUB_FAILED=2 run_step st_src
case "$STEP_OUT" in *"Tests failed in:"*"src/tests/f0.test.ts"*"src/tests/f1.test.ts"*) ok "  and a failure NAMES the failing files outside run_quiet (its tail-30 rarely does)" ;; *) bad "  failing files not named: $STEP_OUT" ;; esac
run_step st_src
case "$STEP_OUT" in *"Tests failed in:"*) bad "  a passing run printed a failure list" ;; *) ok "  a passing run prints no failure list" ;; esac

STUB_NO_REPORT=1 run_step st_src
check "a pass with NO report fails closed" "1" "$STEP_RC"
case "$STEP_OUT" in *"count unavailable"*) ok "  and says the count is unavailable" ;; *) bad "  missing report was silent: $STEP_OUT" ;; esac
unset STUB_NO_REPORT STUB_RC STUB_COUNT

echo
echo "── Part 4: wiring ──"
grep -q 'pct_run_tests "\$(git rev-parse --show-toplevel)" "\$BUILD_AFFECTING_RE"' "$HOOK" && ok "the hook calls pct_run_tests" || bad "the hook does not call pct_run_tests"
grep -qE 'run_quiet "Tests" npm test' "$HOOK" && bad "the hook still runs the unqualified full suite" || ok "the hook no longer runs 'npm test' unqualified"
grep -q 'precommit-tests.sh' "$HOOK" && ok "the hook sources the library" || bad "the hook does not source the library"
# the hook's own grep and the classifier must read the SAME pattern
grep -q 'grep -E "\$BUILD_AFFECTING_RE"' "$HOOK" && ok "BUILD_AFFECTING uses the shared pattern variable" || bad "BUILD_AFFECTING no longer uses BUILD_AFFECTING_RE"

if [ "$REAL" = 1 ]; then
    echo
    echo "── Part 5 (--real): real vitest in scratch repos ──"
    # shellcheck source=test-p1635-real.sh
    . "$REPO_ROOT/scripts/test-p1635-real.sh"
fi

echo
echo "─────────────────────────────"
echo "  passed: $PASS   failed: $FAIL"
[ "$FAIL" -eq 0 ] || exit 1
