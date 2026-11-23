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
#   Part 1  classification (P1635, P1719). The rule FAILS CLOSED: a staged file runs the full suite
#           unless the step can place its test reach. Full-suite shapes: vercel.json, root lockfiles,
#           package.json, tsconfig*, *.config.*, index.html, .env*, api/, tools/, services/,
#           supabase/config.toml and schema.sql, deletions, renames, typechanges, the vitest setup file,
#           __mocks__, a path with a newline in it, a config-shaped file INSIDE a narrowable class
#           (e2e/x.config.ts, scripts/package.json, supabase/functions/deno.jsonc, a lockfile, .env ...)
#           and a narrowable file the vitest config loads, directly or through another import
#           (scripts/lib/test-lane.mjs). The narrowable classes (e2e/, scripts/, public/,
#           supabase/functions/, supabase/migrations/ and supabase/deploy-manifest.json) run RELATED:
#           a module (ts tsx js jsx mjs cjs mts cts json) is an exact seed, a non-module (.html .sql
#           .sh .png) adds no seed of its own, every JS/TS module that names the staged file's
#           directory or file name beside an import query (?raw ?url ?init ...) is seeded, and so is
#           every import.meta.glob user. The false-positive side matters as much: a classifier
#           that sent everything to the full suite would pass every refusal test and fix nothing, so
#           every RED case has a GREEN twin asserting the EXACT seed list, and the four 2026-11-23
#           commits that started P1719 are rebuilt from their real paths.
#   Part 2  derivation (gate 7e). The disk-reading group is derived by grep at run time. A known
#           member per derivation path is asserted against the REAL tree (a control outside the
#           scratch scope), and a scratch repo holds a known non-member the matcher must skip.
#   Part 3  command shape and printed counts, with a stub `npx`: the worker cap is on EVERY run
#           (related and full), the count is printed outside run_quiet on a PASS, a zero is said in
#           words, and a missing report fails closed.
#   Part 4  wiring. The hook uses the library, not `npm test`, and passes all four patterns.
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
NARROW_RE="$(grep -m1 "^NARROWABLE_RE='" "$HOOK" | sed "s/^NARROWABLE_RE='//; s/'\$//")"
[ -n "$NARROW_RE" ] && ok "derived NARROWABLE_RE from the hook" || bad "could not derive NARROWABLE_RE from the hook"
NARROW_FULL_RE="$(grep -m1 "^NARROWABLE_FULL_RE='" "$HOOK" | sed "s/^NARROWABLE_FULL_RE='//; s/'\$//")"
[ -n "$NARROW_FULL_RE" ] && ok "derived NARROWABLE_FULL_RE from the hook" || bad "could not derive NARROWABLE_FULL_RE from the hook"

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
    printf 'x\n' > "$R/e2e/x.ts"   # a tracked e2e file, for the deletion twin (P1719)
    # the known disk reader the Tests step derives and checks for (PCT_DISK_SENTINEL)
    printf 'import { readFileSync } from "node:fs"\n' > "$R/src/tests/p1533-auth-callback-no-public-nav.test.ts"
    git -C "$R" add -A >/dev/null 2>&1
    git -C "$R" commit -q -m base
}
touch_file() { printf '\n// edit\n' >> "$R/$1"; git -C "$R" add -- "$1"; }
# stage_paths <path...>: append to a tracked path, or create a new one (status M or A), then stage it.
stage_paths() {
    local p
    for p in "$@"; do
        if [ -e "$R/$p" ]; then
            printf '\n// edit\n' >> "$R/$p"
        else
            mkdir -p "$R/$(dirname "$p")"
            case "$p" in *.json) printf '{}\n' > "$R/$p" ;; *) printf 'x\n' > "$R/$p" ;; esac
        fi
        git -C "$R" add -- "$p"
    done
}

# classify <label> <expect: related|full> <stage-fn args...>   (expectation then the staging action)
classify() {
    local label="$1" expect="$2"; shift 2
    mk_repo c
    "$@"
    pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
    local got=related
    [ -n "$PCT_FULL_REASON" ] && got=full
    check "$label → $expect" "$expect" "$got"
}
# case_seeds <label> <expected seed list, space-joined, git's path order> <path...>: RELATED with EXACTLY
# these seeds (a full run is a failure here, and its reason is printed).
case_seeds() {
    local label="$1" want="$2"; shift 2
    mk_repo c
    stage_paths "$@"
    pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
    if [ -n "$PCT_FULL_REASON" ]; then bad "$label → expected RELATED, got FULL: $PCT_FULL_REASON"
    else check "$label → RELATED, seeds exactly [$want]" "$want" "${PCT_SRC[*]:-}"; fi
}
# case_full <label> <path the reason must name> <path...>: FULL, and the reason NAMES the file.
case_full() {
    local label="$1" named="$2"; shift 2
    mk_repo c
    stage_paths "$@"
    pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
    full_named "$label" "$named"
}
full_named() {
    if [ -z "$PCT_FULL_REASON" ]; then bad "$1 → expected FULL, got RELATED (seeds: ${PCT_SRC[*]:-none})"
    else case "$PCT_FULL_REASON" in *"$2"*) ok "$1 → FULL, reason names $2" ;; *) bad "$1 → FULL but the reason does not name $2: $PCT_FULL_REASON" ;; esac; fi
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

for f in vercel.json package.json package-lock.json tsconfig.app.json api/x.ts vite.config.ts src/lib/x.config.ts src/tests/setup.tsx src/__mocks__/m.ts; do
    st_one() { touch_file "$f"; }
    classify "$f alone" full st_one
done
# REPLACED (P1719): public/logo.png, scripts/a.js and e2e/a.ts alone used to be FULL. They are now
# narrowable: the module (a.js, a.ts) is the seed, the png adds none.
case_seeds "public/logo.png alone (a png: no seed of its own)" "" public/logo.png
case_seeds "scripts/a.js alone (a module: its own seed)" "scripts/a.js" scripts/a.js
case_seeds "e2e/a.ts alone (a module: its own seed)" "e2e/a.ts" e2e/a.ts
st_delete()  { git -C "$R" rm -q -- src/lib/z.ts; }
st_rename()  { git -C "$R" mv src/lib/z.ts src/lib/zz.ts; }
st_doc_delete_with_src() { touch_file src/lib/a.ts; git -C "$R" rm -q -- docs/e.md; }
classify "a staged deletion"                            full st_delete
classify "a staged rename (rename detection is OFF, so it is a delete)" full st_rename
classify "a docs deletion beside a src edit (conservative: any deletion)" full st_doc_delete_with_src

# FAIL CLOSED: a src edit with a path outside src/ that is on NEITHER allowlist beside it runs the full
# suite. The first version only knew the regex shapes and let these through silently
# (scripts/lib/*.mjs has real test edges: p1357 and p1542 import one each; since P1719 that .mjs is a
# seed instead, see the REPLACED cases below).
for f in .env.test index.html vite.config.mts supabase/functions/deno.json vercel.json; do
    st_mixed() { touch_file src/lib/a.ts; touch_file "$f"; }
    classify "a src edit beside $f" full st_mixed
done
# REPLACED (P1719): a src edit beside scripts/lib/x.mjs, scripts/x.sh, scripts/a.js or e2e/a.ts used to
# be FULL. Now RELATED, and the seed list is exact (git lists staged paths in path order).
case_seeds "a src edit beside scripts/lib/x.mjs (the P1635 defect: the .mjs must be a seed)" "scripts/lib/x.mjs src/lib/a.ts" src/lib/a.ts scripts/lib/x.mjs
case_seeds "a src edit beside scripts/x.sh (a shell script: no seed of its own)" "src/lib/a.ts" src/lib/a.ts scripts/x.sh
case_seeds "a src edit beside scripts/a.js" "scripts/a.js src/lib/a.ts" src/lib/a.ts scripts/a.js
case_seeds "a src edit beside e2e/a.ts" "e2e/a.ts src/lib/a.ts" src/lib/a.ts e2e/a.ts
# GREEN twins (gate 7c): the docs-only allowlist beside a src edit must stay related.
for f in docs/d.md features/f.md .claude/c.md .agents/a.md content/c.md README.md; do
    st_mixed_doc() { touch_file src/lib/a.ts; touch_file "$f"; }
    classify "a src edit beside docs-only $f" related st_mixed_doc
done
st_all_docs() { touch_file src/lib/a.ts; touch_file docs/d.md; touch_file features/f.md; touch_file .claude/c.md; touch_file README.md; }
classify "a src edit beside docs, features, .claude and README together" related st_all_docs
case_full "a src edit beside vercel.json" vercel.json src/lib/a.ts vercel.json
case_full "a src edit beside a config inside a narrowable class" scripts/package.json src/lib/a.ts scripts/lib/x.mjs scripts/package.json
mk_repo c; stage_paths src/lib/a.ts docs/d.md
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
[ -z "$PCT_FULL_REASON" ] && ok "control: src + docs/d.md with all five patterns is RELATED" || bad "control: not related with all five patterns: $PCT_FULL_REASON"
pct_classify "$R" "$BUILD_RE" "" "$NARROW_RE" "$NARROW_FULL_RE"
[ -n "$PCT_FULL_REASON" ] && ok "an empty docs-only pattern fails closed to the full suite" || bad "empty docs pattern did not fail closed"

# ── P1719: the four 2026-11-23 commits that forced a full run, from their real paths ──
case_seeds "2026-11-23 w11: public/presi5/index.html beside a src file (the slide page is not a seed)" "src/lib/a.ts" src/lib/a.ts public/presi5/index.html
case_seeds "2026-11-23 w20: e2e/integration/p1700-removal-email-db.spec.ts" "e2e/integration/p1700-removal-email-db.spec.ts" e2e/integration/p1700-removal-email-db.spec.ts
case_seeds "2026-11-23 w22: e2e/p1688-android.spec.ts" "e2e/p1688-android.spec.ts" e2e/p1688-android.spec.ts
case_seeds "2026-11-23 w24: two e2e specs beside a src file" "e2e/p1114-event-room.spec.ts e2e/p1718-mastermind-ready.spec.ts src/lib/a.ts" src/lib/a.ts e2e/p1114-event-room.spec.ts e2e/p1718-mastermind-ready.spec.ts

# ── P1719: one GREEN case per class and per extension, exact seeds ──
case_seeds "class e2e/: a module is its own seed" "e2e/m.ts" e2e/m.ts
case_seeds "class scripts/: a module is its own seed" "scripts/lib/m.ts" scripts/lib/m.ts
case_seeds "class public/: a module is its own seed" "public/m.js" public/m.js
case_seeds "class supabase/functions/: a module is its own seed" "supabase/functions/m/index.ts" supabase/functions/m/index.ts
for ext in mjs cjs mts cts json tsx jsx; do
    case_seeds "extension .$ext under scripts/ is seeded" "scripts/lib/y.$ext" "scripts/lib/y.$ext"
done
case_seeds "supabase/migrations/x.sql: RELATED, no seed of its own" "" supabase/migrations/x.sql
case_seeds "public/x.html: RELATED, no seed of its own" "" public/x.html
case_seeds "supabase/deploy-manifest.json: RELATED, and it IS seeded (.json is a module vitest can import)" "supabase/deploy-manifest.json" supabase/deploy-manifest.json
case_seeds "scripts/x.sh beside a png and a sql: none of the three is a seed" "" scripts/x.sh public/logo.png supabase/migrations/x.sql

# ── P1719: directory-reference seeding (a route the module graph cannot see) ──
mk_dirref_repo() {
    mk_repo c
    printf "export const slides = import.meta.glob('../../public/*.html')\n" > "$R/src/lib/slides.ts"
    printf "export const icons = import.meta.glob('./icons/*.svg')\n" > "$R/src/lib/icons.ts"
    printf "export const link = 'https://x.test/share?url=abc' // public/ is mentioned here, not read\n" > "$R/src/lib/share.ts"
    printf "import s from '../../supabase/migrations/x.sql?raw'\nit('x', () => { expect(s).toBeTruthy() })\n" > "$R/src/tests/mig.test.ts"
    mkdir -p "$R/supabase/migrations"
    printf '<html></html>\n' > "$R/public/x.html"; printf 'select 1;\n' > "$R/supabase/migrations/x.sql"
    git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m dirref
}
mk_dirref_repo
stage_paths public/x.html
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
# Every glob user is seeded, the one whose glob names an unrelated directory too (icons.ts): a glob's
# directory part can be a wildcard ('../../supabase/*/*.sql'), so no text match on the staged file's
# directory is complete (P1719 review). The share link (?url= is not an import query) and the test
# that ?raw-imports a file in ANOTHER class are not seeded.
check "public/x.html: the helper globbing public/ first, then every other glob user; not the share link, not mig.test.ts" "src/lib/slides.ts src/lib/icons.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"
mk_dirref_repo
stage_paths supabase/migrations/x.sql
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
# x.sql is both a directory reference and a ?raw import by name: the test must appear ONCE (seeds are
# deduplicated, P1719 review), so the exact list is asserted, not the set.
check "supabase/migrations/x.sql: the TEST importing x.sql?raw once, then the glob users; not the share link" "src/tests/mig.test.ts src/lib/icons.ts src/lib/slides.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"
# Dedup: a staged src/ file that is ALSO the referencer of a staged public/ file is one seed, not two.
mk_dirref_repo
stage_paths src/lib/slides.ts public/x.html
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "staged src/lib/slides.ts beside the public/x.html it globs: one seed, not two" "src/lib/slides.ts src/lib/icons.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"
# Any import query word counts, not only raw/url/inline/worker (P1719 review): a .wasm?init import.
mk_repo c
printf "import init from '../../public/x.wasm?init'\nexport default init\n" > "$R/src/lib/wasm.ts"
printf 'wasm\n' > "$R/public/x.wasm"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m wasm
stage_paths public/x.wasm
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "public/x.wasm: the module importing it with ?init is the seed" "src/lib/wasm.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 review: a module the VITEST CONFIG loads runs inside every test, and a seed of it selects nothing
# (vitest related does not treat it as rerun-all). RED: a transitive import of the config. GREEN twin: a
# sibling module the config does not reach stays RELATED.
mk_repo c
printf "import './scripts/lib/lane-apply.mjs'\nexport default {}\n" > "$R/vite.config.ts"
printf "import { apply } from './lane.mjs'\napply()\n" > "$R/scripts/lib/lane-apply.mjs"
printf "export function apply() { process.env.LANE = 'x' }\n" > "$R/scripts/lib/lane.mjs"
printf "export const other = 1\n" > "$R/scripts/lib/other.mjs"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m lane
stage_paths scripts/lib/lane.mjs
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
full_named "a module the vitest config reaches through another import (scripts/lib/lane.mjs)" scripts/lib/lane.mjs
case "${PCT_FULL_REASON:-}" in *"vitest config loads"*) ok "  and the reason says the config loads it" ;; *) bad "  reason does not say the config loads it: ${PCT_FULL_REASON:-}" ;; esac
mk_repo c
printf "import './scripts/lib/lane-apply.mjs'\nexport default {}\n" > "$R/vite.config.ts"
printf "import { apply } from './lane.mjs'\napply()\n" > "$R/scripts/lib/lane-apply.mjs"
printf "export function apply() { process.env.LANE = 'x' }\n" > "$R/scripts/lib/lane.mjs"
printf "export const other = 1\n" > "$R/scripts/lib/other.mjs"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m lane
stage_paths scripts/lib/other.mjs
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "GREEN twin: scripts/lib/other.mjs, which the config does not reach, stays RELATED" "scripts/lib/other.mjs" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 re-review: the closure applies to src/ too. vite.config.ts spreads src/tests/unit-test-env.ts
# into every test's env, and only one test imports it, so a seed of it selects almost nothing. GREEN
# twin: a src/ file the config does not reach stays RELATED (src/lib/a.ts).
mk_repo c
printf "import { ENV } from './src/tests/env'\nexport default { test: { env: { ...ENV } } }\n" > "$R/vite.config.ts"
printf "export const ENV = { X: 'ok' }\n" > "$R/src/tests/env.ts"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m env
stage_paths src/tests/env.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"vitest config loads"*"src/tests/env.ts"*) ok "a src/ file the vitest config imports → FULL, reason names it" ;; *) bad "a config-loaded src/ file was narrowed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac
mk_repo c
printf "import { ENV } from './src/tests/env'\nexport default { test: { env: { ...ENV } } }\n" > "$R/vite.config.ts"
printf "export const ENV = { X: 'ok' }\n" > "$R/src/tests/env.ts"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m env
stage_paths src/lib/a.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "GREEN twin: src/lib/a.ts beside a config-loaded src/ file stays RELATED" "src/lib/a.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 re-review: an extensionless setup entry under src/ ('./src/tests/setup') — the exact-path setup
# check misses it; the closure resolves it.
mk_repo c
printf "export default { test: { setupFiles: ['./src/tests/setup'] } }\n" > "$R/vite.config.ts"
printf "export {}\n" > "$R/src/tests/setup.ts"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m setup
stage_paths src/tests/setup.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"src/tests/setup.ts"*) ok "an extensionless src/ setup entry → FULL" ;; *) bad "an extensionless src/ setup entry was narrowed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac

# P1719 re-review: a file a loaded module RUNS by a quoted repo-root path (test-lane.mjs spawns
# scripts/selfhosted/lane.py). GREEN twins: a sibling .py nobody names stays RELATED, and a directory
# string ('./src/lib') does not pull src/lib/index.ts (and so the whole app graph) into the closure.
mk_closure_lit_repo() {
    mk_repo c
    mkdir -p "$R/scripts/selfhosted"
    printf "import './scripts/lib/runner.mjs'\nconst dirs = ['./src/lib']\nexport default {}\n" > "$R/vite.config.ts"
    printf "import { spawnSync } from 'node:child_process'\nspawnSync('python3', ['scripts/selfhosted/run.py'])\n" > "$R/scripts/lib/runner.mjs"
    printf "print('x')\n" > "$R/scripts/selfhosted/run.py"
    printf "print('y')\n" > "$R/scripts/selfhosted/other.py"
    printf "export * from './a'\n" > "$R/src/lib/index.ts"
    git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m lit
}
mk_closure_lit_repo
stage_paths scripts/selfhosted/run.py
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"vitest config loads"*"scripts/selfhosted/run.py"*) ok "a script a config-loaded module runs by quoted path → FULL" ;; *) bad "a config-run script was narrowed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac
mk_closure_lit_repo
stage_paths scripts/selfhosted/other.py
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "GREEN twin: scripts/selfhosted/other.py, which nothing names, is not refused" "" "${PCT_FULL_REASON:-}"
mk_closure_lit_repo
stage_paths src/lib/index.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "GREEN twin: a directory string ('./src/lib') leaves src/lib/index.ts RELATED" "src/lib/index.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 spec re-review: a module a setup file imports through a config-defined alias ('@/lib/x') runs in
# every test. GREEN twin: a module only app code imports through the same alias stays RELATED.
mk_alias_repo() {
    mk_repo c
    printf "import path from 'node:path'\nexport default { resolve: { alias: { '@': path.resolve(__dirname, './src') } }, test: { setupFiles: ['./src/tests/setup.ts'] } }\n" > "$R/vite.config.ts"
    printf "import { reset } from '@/lib/state'\nreset()\n" > "$R/src/tests/setup.ts"
    printf "export function reset() {}\n" > "$R/src/lib/state.ts"
    printf "import { z } from '@/lib/z'\nexport const app = z\n" > "$R/src/lib/app.ts"
    git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m alias
}
mk_alias_repo
stage_paths src/lib/state.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"vitest config loads"*"src/lib/state.ts"*) ok "a module the setup file imports through the @ alias → FULL" ;; *) bad "an aliased setup import was narrowed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac
mk_alias_repo
stage_paths src/lib/z.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "GREEN twin: src/lib/z.ts, which only app code imports through the alias, stays RELATED" "src/lib/z.ts" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 review: a staged name with a newline in it cannot be classified by line-based checks: FULL.
mk_repo c
p_nl="tools/a
scripts/b.ts"
mkdir -p "$R/$(dirname "$p_nl")"; printf 'x\n' > "$R/$p_nl"; git -C "$R" add -- "$p_nl"
[ -n "$(git -C "$R" diff --cached --name-only -z)" ] && ok "  control: the newline path is staged" || bad "  control: the newline path did not stage"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"newline"*"tools/a"*) ok "a staged path with a newline in it → FULL, reason names it" ;; *) bad "a newline path was not refused: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac

# P1719 re-review: an unreadable index is not "nothing staged". A corrupt GIT_INDEX_FILE makes
# git diff --cached exit 128; the step must run FULL, not related tests on zero seeds.
mk_repo c
printf 'garbage' > "$TMP/corrupt.idx"
ci_rc=0; GIT_INDEX_FILE="$TMP/corrupt.idx" git -C "$R" diff --cached --name-only >/dev/null 2>&1 || ci_rc=$?
check "  control: git diff --cached exits 128 on the corrupt index" "128" "$ci_rc"
GIT_INDEX_FILE="$TMP/corrupt.idx" pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"git diff --cached failed"*) ok "an unreadable index → FULL, reason names the failed git diff" ;; *) bad "an unreadable index did not fail closed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac

# P1719 re-review: a symlink ADDED under a narrowable class stages as A (not T) and can point
# anywhere: FULL. GREEN twin: a regular file at the same kind of path stays RELATED (above).
mk_repo c
mkdir -p "$R/tools"; printf 'export const t = 1\n' > "$R/tools/t.ts"; git -C "$R" add tools/t.ts; git -C "$R" commit -q -m tools
ln -s ../tools/t.ts "$R/scripts/link.ts"; git -C "$R" add scripts/link.ts
check "  control: the symlink stages as an add" "A" "$(git -C "$R" diff --cached --name-status | cut -c1)"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
full_named "a symlink added under scripts/ pointing at tools/" scripts/link.ts
# P1719 spec re-review: the same refusals under src/. A symlink added there, and a src/ file replaced
# by a symlink (status T), both go FULL. GREEN twin: an ordinary src/ edit stays RELATED (above).
mk_repo c
mkdir -p "$R/tools"; printf 'export const t = 1\n' > "$R/tools/t.ts"; git -C "$R" add tools/t.ts; git -C "$R" commit -q -m tools
ln -s ../../tools/t.ts "$R/src/lib/link.ts"; git -C "$R" add src/lib/link.ts
check "  control: the src/ symlink stages as an add" "A" "$(git -C "$R" diff --cached --name-status | cut -c1)"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
full_named "a symlink added under src/ pointing at tools/" src/lib/link.ts
mk_repo c; rm -f "$R/src/lib/a.ts"; ln -s ../../README.md "$R/src/lib/a.ts"; git -C "$R" add -- src/lib/a.ts
check "  control: replacing src/lib/a.ts with a symlink stages as status T" "T" "$(git -C "$R" diff --cached --name-status --no-renames | cut -c1)"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
full_named "a typechange under src/" src/lib/a.ts

# P1719 spec re-review: the hook's BUILD_AFFECTING gate must open for a non-ASCII and a newline .ts
# name. Its own lines are extracted and run in a scratch repo; control: the old C-quoted form
# (--name-only without -z) stays closed for the non-ASCII name, so the case can tell them apart.
gate_lines="$(sed -n '/^BUILD_AFFECTING_RE=/p; /^BUILD_AFFECTING=\$(/,/|| true)/p' "$HOOK")"
grep -qF -- '--name-only -z' <<< "$gate_lines" && ok "  control: the gate lines were extracted from the hook" || bad "  control: could not extract the hook's gate lines: $gate_lines"
for gname in "e2e/$(printf 'caf\303\251').ts" "e2e/a
b.ts"; do
    mk_repo c
    printf 'export const g = 1\n' > "$R/$gname"; git -C "$R" add -- "$gname"
    g_open="$(cd "$R" && eval "$gate_lines" && printf '%s' "$BUILD_AFFECTING")"
    [ -n "$g_open" ] && ok "the hook gate opens for $(printf '%q' "$gname")" || bad "the hook gate stayed closed for $(printf '%q' "$gname") (C-quoted past the regex)"
done
mk_repo c
gname="e2e/$(printf 'caf\303\251').ts"; printf 'export const g = 1\n' > "$R/$gname"; git -C "$R" add -- "$gname"
g_old="$(cd "$R" && git diff --cached --name-only | grep -E "$BUILD_RE" || true)"
check "  control: the old C-quoted gate stays closed for the non-ASCII name" "" "$g_old"

# P1719 re-review: python3 failing while deriving the config closure → FULL, reason says so. The
# GREEN twin is the scripts/lib/other.mjs case above (real python3: RELATED).
mkdir -p "$TMP/nopy-bin"
printf '#!/bin/bash\necho "simulated python3 failure" 1>&2\nexit 1\n' > "$TMP/nopy-bin/python3"
chmod +x "$TMP/nopy-bin/python3"
mk_repo c
stage_paths scripts/lib/other.mjs
PATH="$TMP/nopy-bin:$PATH" pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in *"could not derive the files the vitest config loads"*"scripts/lib/other.mjs"*) ok "python3 failing during the config closure → FULL, reason names the file" ;; *) bad "a failed config closure did not fail closed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;; esac

# P1719 re-review: a setup entry written without its extension still anchors the closure, and a
# backtick dynamic import in a setup file is followed.
mk_repo c
printf "export default { test: { setupFiles: ['./src/tests/setup'] } }\n" > "$R/vite.config.ts"
printf "await import(\`../../scripts/lib/env.mjs\`)\n" > "$R/src/tests/setup.ts"
printf "process.env.X = '1'\n" > "$R/scripts/lib/env.mjs"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m setup
stage_paths scripts/lib/env.mjs
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
full_named "a module an extensionless setup entry reaches through a backtick import" scripts/lib/env.mjs

# P1719 review: a referencer OUTSIDE src/. A scripts/lib module that ?raw-imports a migration is reached by
# the src test that imports the module, so the module must be a seed (vitest related then follows it to
# the test). A shell script quoting the same text is not a module and must not be.
mk_repo c
mkdir -p "$R/supabase/migrations"
printf 'select 1;\n' > "$R/supabase/migrations/y.sql"
printf "import m from '../../supabase/migrations/y.sql?raw'\nexport default m\n" > "$R/scripts/lib/loader.mjs"
printf "import m from '../../scripts/lib/loader.mjs'\nit('y', () => { expect(m).toBeTruthy() })\n" > "$R/src/tests/loader.test.ts"
printf "grep -l '?raw' supabase/migrations/y.sql\n" > "$R/scripts/check.sh"
git -C "$R" add -A >/dev/null 2>&1; git -C "$R" commit -q -m loader
stage_paths supabase/migrations/y.sql
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "supabase/migrations/y.sql: the scripts/lib module that ?raw-imports it is the seed, the .sh quoting it is not" "scripts/lib/loader.mjs" "${PCT_FULL_REASON:-}${PCT_SRC[*]:-}"

# P1719 review: a git grep that ERRORS while finding referencers is not "no referencers": FULL, and the
# reason says why. The GREEN twin is the public/x.html case above (same repo, real git: RELATED).
mkdir -p "$TMP/gitfail-bin"
printf '#!/bin/bash\nfor a in "$@"; do [ "$a" = grep ] && { echo "fatal: simulated grep failure" 1>&2; exit 128; }; done\nexec %s "$@"\n' "$(command -v git)" > "$TMP/gitfail-bin/git"
chmod +x "$TMP/gitfail-bin/git"
mk_dirref_repo
stage_paths public/x.html
gf_rc=0; PATH="$TMP/gitfail-bin:$PATH" git -C "$R" grep -l x >/dev/null 2>&1 || gf_rc=$?
check "  control: the shim makes git grep exit 128" "128" "$gf_rc"
PATH="$TMP/gitfail-bin:$PATH" pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in
    *"git grep failed"*"public/x.html"*) ok "a failing referencer grep → FULL, reason names the grep failure and the file" ;;
    *) bad "a failing referencer grep did not fail closed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;;
esac

# The same, one step later: the candidate search (-lE) SUCCEEDS and only the referencer search
# (-lF) fails. The shim above fails both, so it never reaches the referencer's own error path: a
# referencer made fail-open passed it (mutation proof, P1719 re-review).
mkdir -p "$TMP/gitfailF-bin"
printf '#!/bin/bash\ng=0; f=0\nfor a in "$@"; do [ "$a" = grep ] && g=1; [ "$a" = -lF ] && f=1; done\n[ $g = 1 ] && [ $f = 1 ] && { echo "fatal: simulated referencer grep failure" 1>&2; exit 128; }\nexec %s "$@"\n' "$(command -v git)" > "$TMP/gitfailF-bin/git"
chmod +x "$TMP/gitfailF-bin/git"
mk_dirref_repo
stage_paths public/x.html
gfF_rc=0; PATH="$TMP/gitfailF-bin:$PATH" git -C "$R" grep -lE x >/dev/null 2>&1 || gfF_rc=$?
check "  control: the -lF shim leaves a -lE grep working" "0" "$gfF_rc"
PATH="$TMP/gitfailF-bin:$PATH" pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case "${PCT_FULL_REASON:-}" in
    *"git grep failed"*"public/x.html"*) ok "candidates found, then the referencer grep fails → FULL, reason names the file" ;;
    *) bad "a failing referencer grep (after a good candidate search) did not fail closed: reason '${PCT_FULL_REASON:-}', seeds [${PCT_SRC[*]:-}]" ;;
esac

# P1719 review: a spaced narrowable module is ONE seed, compared newline-joined so a split into
# 'scripts/my' + 'tool.mjs' cannot read the same as the single element.
mk_repo c
stage_paths "scripts/my tool.mjs"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "a spaced narrowable module stays ONE seed" "1" "${#PCT_SRC[@]}"
check "  spelled exactly, element by element" "<scripts/my tool.mjs>" "${PCT_FULL_REASON:-}$(printf '<%s>' ${PCT_SRC[@]+"${PCT_SRC[@]}"})"

# ── P1719: RED twins, every one FULL and the reason NAMES the file ──
for f in vercel.json package.json package-lock.json tsconfig.app.json vite.config.ts vite.config.mts playwright.config.ts index.html .env.test api/x.ts tools/kanban/x.ts services/x/y.py supabase/config.toml supabase/schema.sql; do
    case_full "root and other path $f" "$f" "$f"
done
for f in e2e/x.config.ts scripts/x.config.mjs scripts/package.json e2e/tsconfig.json scripts/yarn.lock scripts/pnpm-lock.yaml supabase/functions/deno.json supabase/functions/x/deno.jsonc supabase/functions/import_map.json supabase/functions/x/deno.lock supabase/functions/.env public/x.config.js; do
    case_full "config inside a narrowable class $f" "$f" "$f"
done
mk_repo c; git -C "$R" rm -q -- e2e/x.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; full_named "a deletion of e2e/x.ts" e2e/x.ts
mk_repo c; git -C "$R" rm -q -- public/logo.png
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; full_named "a deletion of public/logo.png" public/logo.png
mk_repo c; git -C "$R" mv scripts/a.js scripts/b.js
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; full_named "a rename under scripts/ (delete plus add)" scripts/a.js
mk_repo c; rm -f "$R/public/logo.png"; ln -s ../README.md "$R/public/logo.png"; git -C "$R" add -- public/logo.png
[ "$(git -C "$R" diff --cached --name-status --no-renames | cut -c1)" = "T" ] && ok "  control: replacing public/logo.png with a symlink stages as status T" || bad "  control: the symlink replacement is not a T: $(git -C "$R" diff --cached --name-status --no-renames)"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; full_named "a typechange under public/" public/logo.png
case_full "a path under scripts/__mocks__/" scripts/__mocks__/m.ts scripts/__mocks__/m.ts
# A vitest setup file placed under scripts/: GREEN twin first (the config does not name it), then RED.
case_seeds "GREEN twin: scripts/setup.ts when the config does NOT name it" "scripts/setup.ts" scripts/setup.ts
mk_repo c
printf 'export default { test: { setupFiles: "./scripts/setup.ts" } }\n' > "$R/vite.config.ts"
stage_paths scripts/setup.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; full_named "a vitest setup file placed under scripts/ (named by vite.config.ts)" scripts/setup.ts

# A missing or empty narrowable-class pattern fails closed, with a narrowable file staged (GREEN control first).
mk_repo c; stage_paths src/lib/a.ts e2e/a.ts
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
[ -z "$PCT_FULL_REASON" ] && ok "control: src + e2e/a.ts with all five patterns is RELATED" || bad "control: not related with all five patterns: $PCT_FULL_REASON"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE"
[ -n "$PCT_FULL_REASON" ] && ok "a MISSING narrowable pattern (and narrowable-full) fails closed to the full suite" || bad "missing narrowable pattern did not fail closed"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "" "$NARROW_FULL_RE"
[ -n "$PCT_FULL_REASON" ] && ok "an EMPTY narrowable pattern fails closed to the full suite" || bad "empty narrowable pattern did not fail closed"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE"
[ -n "$PCT_FULL_REASON" ] && ok "a MISSING narrowable-full pattern fails closed to the full suite" || bad "missing narrowable-full pattern did not fail closed"
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" ""
[ -n "$PCT_FULL_REASON" ] && ok "an EMPTY narrowable-full pattern fails closed to the full suite" || bad "empty narrowable-full pattern did not fail closed"

# The vitest-config closure on the REAL tree, one known member per derivation path (gate 7e): a file
# vite.config.ts imports directly, and one it reaches only through another import.
REAL_TREE="${P1635_TREE:-$REPO_ROOT}"
real_closure="$(pct_config_closure "$REAL_TREE" "$(pct_setup_files "$REAL_TREE")" 2>/dev/null)"
grep -qxF scripts/lib/test-lane-apply.mjs <<< "$real_closure" && ok "real tree: the config closure holds scripts/lib/test-lane-apply.mjs (a direct import of vite.config.ts)" || bad "real tree: config closure lacks the direct import scripts/lib/test-lane-apply.mjs: $(tr '\n' ' ' <<< "$real_closure")"
grep -qxF scripts/lib/test-lane.mjs <<< "$real_closure" && ok "real tree: and scripts/lib/test-lane.mjs (reached only through test-lane-apply.mjs)" || bad "real tree: config closure lacks the transitive scripts/lib/test-lane.mjs: $(tr '\n' ' ' <<< "$real_closure")"
grep -qxF src/tests/unit-test-env.ts <<< "$real_closure" && ok "real tree: and src/tests/unit-test-env.ts (a src/ import of vite.config.ts)" || bad "real tree: config closure lacks src/tests/unit-test-env.ts: $(tr '\n' ' ' <<< "$real_closure")"
grep -qxF scripts/selfhosted/lane.py <<< "$real_closure" && ok "real tree: and scripts/selfhosted/lane.py (a quoted path test-lane.mjs runs)" || bad "real tree: config closure lacks scripts/selfhosted/lane.py: $(tr '\n' ' ' <<< "$real_closure")"
grep -qxF src/lib/return-state.ts <<< "$real_closure" && ok "real tree: and src/lib/return-state.ts (an @/ import of src/tests/setup.tsx)" || bad "real tree: config closure lacks the aliased setup import src/lib/return-state.ts: $(tr '\n' ' ' <<< "$real_closure")"
grep -qxF src/lib/scroll-positions.ts <<< "$real_closure" && ok "real tree: and src/lib/scroll-positions.ts (an @/ import of return-state.ts)" || bad "real tree: config closure lacks the transitive aliased import src/lib/scroll-positions.ts: $(tr '\n' ' ' <<< "$real_closure")"

# The same shape against the REAL tree, with a TEMPORARY index (mode-only edits: no object is written,
# nothing real is staged): src/lib/format-seen-age.ts + scripts/lib/video-summary-core.mjs, whose test
# (p1357) imports the .mjs.
grep -q "scripts/lib/video-summary-core.mjs" "$REAL_TREE/src/tests/p1357-video-summary-core.test.ts" 2>/dev/null \
    && ok "real tree: p1357 imports scripts/lib/video-summary-core.mjs (a real test edge)" || bad "real tree: p1357 no longer imports video-summary-core.mjs, pick another edge"
TIDX="$TMP/real-index"
if GIT_INDEX_FILE="$TIDX" git -C "$REAL_TREE" read-tree HEAD 2>/dev/null \
   && GIT_INDEX_FILE="$TIDX" git -C "$REAL_TREE" update-index --chmod=+x src/lib/format-seen-age.ts scripts/lib/video-summary-core.mjs 2>/dev/null; then
    # REPLACED (P1719): this used to assert FULL (reason naming the .mjs). The .mjs is now a seed beside
    # the src edit, so the real p1357 test that imports it is selected by the graph. Both are seeded.
    # Membership, not the exact list: on the real tree the text-level referencer search may add a module
    # that merely MENTIONS scripts/ beside a glob (over-inclusion, one more seed, by design). The exact
    # lists are asserted in the scratch repo above, where every file is known.
    ( export GIT_INDEX_FILE="$TIDX"; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; echo "REASON=${PCT_FULL_REASON}"; printf '%s\n' ${PCT_SRC[@]+"${PCT_SRC[@]}"} ) > "$TMP/real-reason" 2>/dev/null
    if grep -qxF "REASON=" "$TMP/real-reason" && grep -qxF scripts/lib/video-summary-core.mjs "$TMP/real-reason" && grep -qxF src/lib/format-seen-age.ts "$TMP/real-reason"; then
        ok "real tree: src edit + video-summary-core.mjs → RELATED with BOTH seeded (was: FULL)"
    else
        bad "real tree: expected RELATED with scripts/lib/video-summary-core.mjs and src/lib/format-seen-age.ts among the seeds, got: $(tr '\n' ' ' < "$TMP/real-reason")"
    fi
    ( export GIT_INDEX_FILE="$TIDX"; git -C "$REAL_TREE" update-index --chmod=-x scripts/lib/video-summary-core.mjs; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; echo "[${PCT_SRC[*]:-}]${PCT_FULL_REASON}" ) > "$TMP/real-reason2" 2>/dev/null
    [ "$(cat "$TMP/real-reason2")" = "[src/lib/format-seen-age.ts]" ] && ok "real tree control: the src edit alone stays RELATED" || bad "real tree control: src alone is not related: $(cat "$TMP/real-reason2")"
    # Still-FULL control on the real tree: vercel.json beside the same src edit (the CSP canaries read it).
    ( export GIT_INDEX_FILE="$TIDX"; git -C "$REAL_TREE" update-index --chmod=+x vercel.json; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; echo "$PCT_FULL_REASON" ) > "$TMP/real-reason3" 2>/dev/null
    case "$(cat "$TMP/real-reason3")" in *"vercel.json"*) ok "real tree control: src edit + vercel.json → still FULL, reason names vercel.json" ;; *) bad "real tree control: vercel.json did not force the full suite: '$(cat "$TMP/real-reason3")'" ;; esac
    # P1719 review, on the real tree: the lane module vite.config.ts loads through test-lane-apply.mjs.
    ( export GIT_INDEX_FILE="$TIDX"; git -C "$REAL_TREE" update-index --chmod=-x vercel.json; git -C "$REAL_TREE" update-index --chmod=+x scripts/lib/test-lane.mjs; pct_classify "$REAL_TREE" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"; echo "$PCT_FULL_REASON" ) > "$TMP/real-reason4" 2>/dev/null
    case "$(cat "$TMP/real-reason4")" in *"vitest config loads"*"scripts/lib/test-lane.mjs"*) ok "real tree: src edit + scripts/lib/test-lane.mjs → FULL (the config loads it)" ;; *) bad "real tree: scripts/lib/test-lane.mjs did not force the full suite: '$(cat "$TMP/real-reason4")'" ;; esac
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
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
case " ${PCT_SRC[*]:-} " in *" src/app/pages/terms-page.tsx "*) ok "staged markdown imported with ?raw seeds its IMPORTING page (no graph edge otherwise)" ;; *) bad "?raw importer not seeded: ${PCT_SRC[*]:-}" ;; esac
mk_repo c; st_src
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "  the src edit is the seed, spelled exactly" "src/lib/a.ts" "${PCT_SRC[*]:-}"
mk_repo c; st_space
pct_classify "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
check "  a spaced name stays ONE seed" "1" "${#PCT_SRC[@]}"
pct_classify "$R" "" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE"
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
# P1676: what vitest would see for the env override, which beats --maxWorkers inside vitest.
printf 'ENV_VITEST_MAX_WORKERS=%s\n' "${VITEST_MAX_WORKERS-UNSET}" >> "$STUB_ARGV"
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
# P1676: the worker count is now min(share of the machine, ceiling). Pin the two inputs the machine
# would otherwise decide: the budget, and a `ps` listing with NO other runs, so the assertions below
# stay deterministic on a busy laptop. The seam can only change the count, never skip anything.
export TEST_WORKER_BUDGET=8
: > "$TMP/ps-empty"
export TEST_WORKER_SHARE_PS_FILE="$TMP/ps-empty"

run_step() { # run_step <stage-fn> ; output in STEP_OUT, rc in STEP_RC (hook cwd = the repo root)
    mk_repo s; "$1"
    STEP_OUT="$( cd "$R" && PATH="$TMP/bin:$PATH" pct_run_tests "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE" 2>&1 )"; STEP_RC=$?
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
case "$STEP_OUT" in *"RELATED: 1 staged or importing file(s) (0 outside src/) + "*"disk-reading file(s) as import-graph seeds; capped at 3 workers"*) ok "  plan line (P1719 wording): 1 staged or importing file(s), 0 outside src/" ;; *) bad "  plan line wording: $STEP_OUT" ;; esac

# P1719: a narrowable module beside a src edit: both are seeds, the plan line counts the one outside src/.
st_narrow() { stage_paths src/lib/a.ts scripts/lib/x.mjs; }
run_step st_narrow
check "src edit + scripts/lib/x.mjs passes → rc 0" "0" "$STEP_RC"
grep -qx -- 'related' "$STUB_ARGV" && ok "  it is a RELATED run (vitest related)" || bad "  not a related run: $(tr '\n' ' ' < "$STUB_ARGV")"
grep -qx -- "$R/scripts/lib/x.mjs" "$STUB_ARGV" && ok "  the narrowable module is in the recorded argv, as an absolute path" || bad "  scripts/lib/x.mjs not in the argv: $(tr '\n' ' ' < "$STUB_ARGV")"
grep -qx -- "$R/src/lib/a.ts" "$STUB_ARGV" && ok "  and so is the src edit" || bad "  src edit missing from the argv"
case "$STEP_OUT" in *"RELATED: 2 staged or importing file(s) (1 outside src/)"*) ok "  plan line says: 2 staged or importing file(s) (1 outside src/)" ;; *) bad "  plan line does not count the outside-src seed: $STEP_OUT" ;; esac
case "$STEP_OUT" in *"FULL suite"*) bad "  a narrowable module forced a full run: $STEP_OUT" ;; *) ok "  and no full run was announced" ;; esac

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

# P1676: the count is min(share, ceiling); PRECOMMIT_TEST_WORKERS is the ceiling.
# Three other run-mode coordinators (real `ps -axo pid=,ppid=,tty=,args=` shape) at budget 8 → 8/4 = 2.
cat > "$TMP/ps-three" <<'PSF'
  101     1 ??       node /x/w1/node_modules/.bin/vitest run --maxWorkers=3
  102     1 ??       node /x/w2/node_modules/.bin/vitest run --maxWorkers=3
  103     1 ??       node /x/w3/node_modules/.bin/vitest run
  104   101 ??       /usr/local/bin/node --require /x/node_modules/vitest/suppress-warnings.cjs /x/node_modules/vitest/dist/workers/forks.js
  105   101 ??       npm exec vitest run --maxWorkers=3
PSF
TEST_WORKER_SHARE_PS_FILE="$TMP/ps-three" PRECOMMIT_TEST_WORKERS=3 run_step st_vercel
grep -qx -- '--maxWorkers=2' "$STUB_ARGV" && ok "3 other runs, budget 8, ceiling 3 → 2 workers (computed, not the fixed cap)" || bad "share not applied: $(tr '\n' ' ' < "$STUB_ARGV")"
case "$STEP_OUT" in *"capped at 2 workers"*) ok "  the plan line shows the computed count (2)" ;; *) bad "  plan line does not show the computed count: $STEP_OUT" ;; esac
case "$STEP_OUT" in *"test workers: 2 (3 other runs, budget 8, ceiling 3)"*) ok "  the sizing line is printed outside run_quiet" ;; *) bad "  no sizing line: $STEP_OUT" ;; esac
# Scan failure (the ps listing cannot be read) → 1 worker: never the ceiling, never unset.
TEST_WORKER_SHARE_PS_FILE="$TMP/does-not-exist" PRECOMMIT_TEST_WORKERS=3 run_step st_vercel
grep -qx -- '--maxWorkers=1' "$STUB_ARGV" && ok "a failed process scan → 1 worker, never the ceiling and never unset" || bad "scan failure not 1: $(tr '\n' ' ' < "$STUB_ARGV")"
# The module itself unrunnable (node cannot load it) → still 1.
mkdir -p "$TMP/nonode-bin"; printf '#!/bin/bash\nexit 7\n' > "$TMP/nonode-bin/node"; chmod +x "$TMP/nonode-bin/node"
mk_repo s; st_vercel
STEP_OUT="$( cd "$R" && PATH="$TMP/nonode-bin:$TMP/bin:$PATH" pct_run_tests "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE" 2>&1 )"
grep -qx -- '--maxWorkers=1' "$STUB_ARGV" && ok "a failing node call → 1 worker" || bad "node failure not 1: $(tr '\n' ' ' < "$STUB_ARGV")"
case "$STEP_OUT" in *"no usable answer"*) ok "  and the hook says so (never a silent fallback)" ;; *) bad "  silent fallback on node failure: $STEP_OUT" ;; esac
# A loader line before the answer: the answer is the LAST stdout line, so it is still used.
mkdir -p "$TMP/noisy-bin"; printf '#!/bin/bash\necho "loader noise"\necho 2\n' > "$TMP/noisy-bin/node"; chmod +x "$TMP/noisy-bin/node"
mk_repo s; st_vercel
STEP_OUT="$( cd "$R" && PATH="$TMP/noisy-bin:$TMP/bin:$PATH" pct_run_tests "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE" 2>&1 )"
grep -qx -- '--maxWorkers=2' "$STUB_ARGV" && ok "noise before the answer is ignored: the last line (2) is used" || bad "noisy stdout not handled: $(tr '\n' ' ' < "$STUB_ARGV")"
# A digit string too long for bash 3.2 arithmetic → 1 with the warning, never a negative count.
mkdir -p "$TMP/huge-bin"; printf '#!/bin/bash\necho 99999999999999999999\n' > "$TMP/huge-bin/node"; chmod +x "$TMP/huge-bin/node"
mk_repo s; st_vercel
STEP_OUT="$( cd "$R" && PATH="$TMP/huge-bin:$TMP/bin:$PATH" pct_run_tests "$R" "$BUILD_RE" "$DOCS_RE" "$NARROW_RE" "$NARROW_FULL_RE" 2>&1 )"
grep -qx -- '--maxWorkers=1' "$STUB_ARGV" && ok "an overflowing answer → 1 worker" || bad "overflowing answer not 1: $(tr '\n' ' ' < "$STUB_ARGV")"
case "$STEP_OUT" in *"no usable answer"*) ok "  and the hook says so" ;; *) bad "  silent fallback on an overflowing answer: $STEP_OUT" ;; esac
# A huge PRECOMMIT_TEST_WORKERS (the ceiling) falls back to 3, never a negative count.
PRECOMMIT_TEST_WORKERS=99999999999999999999 run_step st_vercel
grep -qx -- '--maxWorkers=3' "$STUB_ARGV" && ok "an overflowing PRECOMMIT_TEST_WORKERS falls back to 3" || bad "huge ceiling not 3: $(tr '\n' ' ' < "$STUB_ARGV")"

# An inherited VITEST_MAX_WORKERS beats the CLI flag inside vitest, so the plan line would lie. The
# hook strips it from the vitest process; control first: the stub does see a variable that is set.
VITEST_MAX_WORKERS=12 "$TMP/bin/npx" probe
grep -qx -- 'ENV_VITEST_MAX_WORKERS=12' "$STUB_ARGV" && ok "control: the stub records an inherited VITEST_MAX_WORKERS" || bad "control: stub cannot see VITEST_MAX_WORKERS, so the next check proves nothing"
VITEST_MAX_WORKERS=12 PRECOMMIT_TEST_WORKERS=3 run_step st_vercel
grep -qx -- 'ENV_VITEST_MAX_WORKERS=UNSET' "$STUB_ARGV" && grep -qx -- '--maxWorkers=3' "$STUB_ARGV" \
    && ok "an inherited VITEST_MAX_WORKERS=12 never reaches the hook's vitest; --maxWorkers=3 stands" \
    || bad "inherited VITEST_MAX_WORKERS leaked into the hook's vitest: $(tr '\n' ' ' < "$STUB_ARGV")"
# Same on the RELATED branch (the other of the two invocation sites).
VITEST_MAX_WORKERS=12 PRECOMMIT_TEST_WORKERS=3 run_step st_src
grep -qx -- 'related' "$STUB_ARGV" && grep -qx -- 'ENV_VITEST_MAX_WORKERS=UNSET' "$STUB_ARGV" \
    && ok "  and on the related run too" \
    || bad "inherited VITEST_MAX_WORKERS leaked into the related run: $(tr '\n' ' ' < "$STUB_ARGV")"

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
grep -qF 'pct_run_tests "$(git rev-parse --show-toplevel)" "$BUILD_AFFECTING_RE" "$DOCS_ONLY_RE" "$NARROWABLE_RE" "$NARROWABLE_FULL_RE"' "$HOOK" && ok "the hook passes the build, docs, narrowable and narrowable-full patterns to pct_run_tests" || bad "the hook does not pass all four patterns to pct_run_tests"
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
