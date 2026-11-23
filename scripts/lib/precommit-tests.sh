#!/bin/bash
# The pre-commit "Tests" step (P1635, P1719): related tests, not the full suite, unless a staged
# file's test reach cannot be placed. Sourced by scripts/pre-commit-checks.sh; sourced (never
# executed) by scripts/test-p1635-precommit-tests.sh, which drives the REAL functions.
#
# WHY: measured 2026-11-05, one source commit's hook costs about 1,390 CPU-seconds in `npm test`
# against about 90 for typecheck, build and eslint together (scripts/bench-p1635-precommit-load.sh).
# Six commits at once is a load average past 120 and a longest commit near 15 minutes. The full
# suite is still run, on the staging hop (test.yml, staging/**), on the exact SHAs that land.
#
# WHAT RUNS, in one `vitest related --run` invocation:
#   seeds = every staged file under src/   (a test selected if it imports one, or IS one)
#         + every staged module (JS/TS or JSON) in a narrowable class outside src/ (P1719)
#         + every tracked JS/TS module (src/ or not) that names a staged narrowable file's directory
#           or file name beside an import query (?raw, ?url, ?init ...), and every import.meta.glob
#           user, whatever it globs (P1719)
#         + every tracked JS/TS file whose text reads files or runs commands, derived by grep at
#           run time, never a hand list (epistemic gate 7e).
# The second set is what the module graph cannot see: a test such as
# p1533-auth-callback-no-public-nav.test.ts reads src/App.tsx with readFileSync and never imports
# it, so editing App.tsx selects nothing by graph. Seeding the disk-reading files themselves makes
# vitest select them regardless (a test is related to itself). Seeding the disk-reading HELPERS
# too (a file under src/tests/ that does the reading) selects every test that imports one, which
# is how a test reaches the disk without containing the word `fs`.
#
# WHEN THE WHOLE SUITE RUNS INSTEAD (any one is enough, and the reason is printed). The rule FAILS
# CLOSED: only files this step can place are narrowed, everything else runs the full suite.
#   - a staged deletion or rename: the file is gone, so no graph can name its importers;
#   - ANY staged path outside src/ that is on neither allowlist in pre-commit-checks.sh, the
#     docs-only one (DOCS_ONLY_RE) or the narrowable one (NARROWABLE_RE: e2e/, scripts/, public/,
#     supabase/functions/, supabase/migrations/, supabase/deploy-manifest.json). So vercel.json,
#     root lockfiles, package.json, tsconfig*, *.config.*, index.html, .env.*, api/, tools/,
#     services/, supabase/config.toml ... all run everything;
#   - inside a narrowable class: a config-shaped file (NARROWABLE_FULL_RE: *.config.*, tsconfig*,
#     package.json, lockfiles, deno.json(c), import_map.json, .env*) or a typechange. A narrowable
#     module that is NOT seeded would be the old P1635 defect again: a first version ignored files
#     outside src/, so `src/x.ts` + `scripts/lib/video-summary-core.mjs` ran related tests that left
#     out the two tests importing that .mjs (reproduced on 1cc9facd9). The module is now a seed;
#   - a vitest setup file (setupFiles / globalSetup in vite.config.*): imported by vitest, not by
#     any test, so the graph never reaches it;
#   - a src/ or narrowable file the vitest config loads, through a relative import or a quoted path
#     (pct_config_closure, derived at run time): it runs in every test, and a seed of it selects
#     only its own importers. vite.config.ts imports scripts/lib/test-lane-apply.mjs, which
#     rewrites process.env, and spreads src/tests/unit-test-env.ts into every test's env;
#   - anything under a __mocks__ directory: loaded by name convention, not by import;
#   - a staged path containing a newline: every check here is line-based;
#   - the disk-reading seed group cannot be derived, or is missing its known member: narrowing on a
#     group nobody can vouch for is the silent failure this step exists to avoid.
# A docs-only commit never reaches this step (the hook's BUILD_AFFECTING gate skips it), and a
# docs file beside a src edit stays related: its only possible test edge is a disk read, which the
# seed group already covers. A non-module narrowable file (a slide page, a .sql migration, a shell
# script) rests on the same reasoning, plus the query-import/glob seeding above.
#
# GUARANTEES (the canary holds each of them):
#   - every run is capped at min(its share of the machine, PRECOMMIT_TEST_WORKERS) workers (the
#     ceiling, default 3), full runs included; the share is computed by test-worker-share.mjs
#     (P1676), and any failure there yields 1, never "unset";
#   - the count of test files that ACTUALLY ran is printed OUTSIDE run_quiet, which hides output
#     on success, and a run that ran zero says so in words;
#   - nothing here adds a way to skip tests. PRECOMMIT_TEST_WORKERS only tunes the cap, and a
#     non-numeric or zero value (0, 000, 0000 ...) falls back to the default.
#
# bash 3.2 compatible (macOS /bin/bash): no mapfile, no associative arrays, no ${x,,}.
# pipefail and SIGPIPE (epistemic gate 7): no `producer | grep -q`; readers use process
# substitution or here-strings.

PCT_WORKERS_DEFAULT=3

# Text that means a file reads files or runs a command. Over-inclusion is cheap (one more test
# runs); under-inclusion is the failure this exists to prevent. `fs` is matched as a whole token so
# `node:fs`, `fs/promises` and `import fs from 'fs'` all hit and `offsets` does not.
PCT_DISK_PATTERN='(^|[^A-Za-z0-9_])fs([^A-Za-z0-9_]|$)|readFile|readdir|child_process|execSync|execFileSync|spawnSync'
# Two more reach the disk without the module graph seeing it, but only matter in a TEST file: a test
# that imports `x.md?raw` or globs a folder has no import edge to what it reads. In APPLICATION code
# the same text means something else (three pages import their markdown with ?raw), and seeding
# those pages selected every test that renders App, 370 of 973 files in the first measurement.
# Staged markdown for such a page is handled in pct_classify instead.
PCT_DISK_PATTERN_TEST='\?raw|import\.meta\.glob'
# P1719: the import shapes that reach a file with no graph edge vitest follows (it drops the query,
# and a glob names no single file). Searched in every tracked JS/TS module, test or not, but only to seed the files
# that ALSO name a staged narrowable file's directory or its file name, so the three markdown pages
# that use ?raw stay out of every run that does not touch what they read.
# The query must end the import string (a quote, a backtick or another &query follows), so a share
# link's `?url=` is not mistaken for one: in the first run, 12 pages and tests matched that way. Any
# word counts, not only raw/url/inline/worker: Vite also has ?sharedworker and ?init, and an unknown
# one only over-includes (P1719 review).
PCT_QUERY_PATTERN='\?[A-Za-z][A-Za-z0-9_-]*([&'"'"'"`]|$)|import\.meta\.glob'
# A glob's directory part can itself be a wildcard ('../../supabase/*/*.sql', '/**/*.sql', a {a,b}
# brace), so no text match on the staged file's directory can be complete. Every glob user is seeded
# whenever a narrowable file is staged: three tracked files use one today (P1719 review).
PCT_GLOB_PATTERN='import\.meta\.glob'
# P1719: a staged narrowable file vitest can import, so passing it as a seed lets the graph select its
# importers. JSON is a module to vitest (a test can `import m from '../x.json'` with no fs text).
PCT_MODULE_PATTERN='\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json)$'

# pct_query_candidates <root>: sets PCT_QUERY_CANDS to the tracked JS/TS modules ANYWHERE in the repo
# (not only src/: a scripts/lib/*.mjs that globs public/ is reached by the test that imports it, P1719
# review) that use a query import or a glob, one per line. Returns 2 when git grep itself failed (exit
# 128: a bad pattern or a broken repo), which the caller turns into a full run: an error is not "no
# referencers".
pct_query_candidates() {
    local root="$1" out rc=0
    PCT_QUERY_CANDS=""
    out="$(git -C "$root" grep -lE "$PCT_QUERY_PATTERN" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts' 2>/dev/null)" || rc=$?
    [ "$rc" -gt 1 ] && return 2
    PCT_QUERY_CANDS="$out"
    return 0
}

# pct_query_referencers <root> <path> <narrow_re>: the PCT_QUERY_CANDS files, one per line, that name
# either the staged file's narrowable class root (the shortest leading directory that matches
# narrow_re: e2e/, scripts/, supabase/migrations/ ...; derived, so the class list stays in one place)
# or its file name. Over-inclusion costs one more seed; under-inclusion is a skipped test. Files under
# public/ are also reachable by a root-absolute path ('/presi5/index.html?url'), which the file-name
# match covers, as it covers a `x.sql?raw` import. Returns 2 when git grep failed.
pct_query_referencers() {
    local root="$1" path="$2" narrow_re="$3" base root_dir="" prefix="" rest f out rc=0
    base="${path##*/}"
    rest="$path"
    while [ "${rest#*/}" != "$rest" ]; do
        prefix="${prefix}${rest%%/*}/"
        rest="${rest#*/}"
        if grep -qE "$narrow_re" <<< "$prefix"; then
            root_dir="$prefix"
            break
        fi
    done
    [ -n "${PCT_QUERY_CANDS:-}" ] || return 0
    local -a files=() pats=(-e "$base")
    while IFS= read -r f; do [ -n "$f" ] && files+=("$f"); done <<< "$PCT_QUERY_CANDS"
    # An empty pathspec list after -- would search the whole repo; and "${files[@]}" on an empty
    # array is an unbound-variable error under bash 3.2's set -u.
    [ "${#files[@]}" -gt 0 ] || return 0
    [ -n "$root_dir" ] && pats+=(-e "$root_dir")
    # --literal-pathspecs: a tracked name holding * ? [ or : is a file, not a pattern.
    out="$(git -C "$root" --literal-pathspecs grep -lF "${pats[@]}" -- "${files[@]}" 2>/dev/null)" || rc=$?
    [ "$rc" -gt 1 ] && return 2
    [ -n "$out" ] && printf '%s\n' "$out"
    # Every glob user, whatever its glob names (see PCT_GLOB_PATTERN).
    rc=0
    out="$(git -C "$root" --literal-pathspecs grep -lE "$PCT_GLOB_PATTERN" -- "${files[@]}" 2>/dev/null)" || rc=$?
    [ "$rc" -gt 1 ] && return 2
    [ -n "$out" ] && printf '%s\n' "$out"
    return 0
}

pct_workers() {
    local w="${PRECOMMIT_TEST_WORKERS:-$PCT_WORKERS_DEFAULT}"
    case "$w" in
        ''|*[!0-9]*) w="$PCT_WORKERS_DEFAULT" ;;
    esac
    # More than 4 digits would overflow bash 3.2 arithmetic into a negative count (P1676 review).
    [ "${#w}" -gt 4 ] && w="$PCT_WORKERS_DEFAULT"
    # 10# so "0000" and "007" are read as decimal numbers: a zero spelled with extra digits is still zero
    # and falls back; vitest is only ever given a clean positive integer.
    if [ "$((10#$w))" -eq 0 ]; then
        w="$PCT_WORKERS_DEFAULT"
    else
        w="$((10#$w))"
    fi
    printf '%s' "$w"
}

# P1676: the worker count the hook passes to vitest. PRECOMMIT_TEST_WORKERS (validated by pct_workers)
# is now the CEILING; the count is min(share of the machine, ceiling), from the shared module that
# also sizes flagless runs. The module prints its one stderr line (workers, other runs, budget,
# ceiling) straight to the terminal. Any failure or non-integer answer is 1, never the ceiling and
# never unset: vitest reads an unset/0 maxWorkers as cores - 1.
pct_worker_share() {
    local ceiling share
    ceiling="$(pct_workers)"
    share="$(node "$(dirname "${BASH_SOURCE[0]}")/test-worker-share.mjs" --ceiling "$ceiling")" || share=""
    # The module prints the bare integer as its LAST stdout line; anything a loader prints first
    # is ignored rather than turning a good answer into a fallback.
    share="$(printf '%s\n' "$share" | tail -n 1)"
    case "$share" in
        ''|*[!0-9]*)
            echo "test workers: 1 (the sizing module gave no usable answer, so 1, never the ceiling)" >&2
            share=1 ;;
    esac
    # Same bash 3.2 overflow guard as pct_workers: a long digit string is not a usable answer.
    if [ "${#share}" -gt 4 ]; then
        echo "test workers: 1 (the sizing module gave no usable answer, so 1, never the ceiling)" >&2
        share=1
    fi
    if [ "$((10#$share))" -lt 1 ]; then
        share=1
    else
        share="$((10#$share))"
    fi
    if [ "$share" -gt "$ceiling" ]; then
        share="$ceiling"
    fi
    printf '%s' "$share"
}

# Paths the vitest config names as setup files. Derived from the config so a rename there is
# followed here. Quoted strings on any line mentioning the key; extras only cause a full run.
pct_setup_files() {
    local root="$1" f
    for f in "$root"/vite.config.* "$root"/vitest.config.*; do
        [ -f "$f" ] || continue
        grep -hE 'setupFiles|globalSetup' "$f" | grep -oE "['\"][^'\"]+['\"]" | tr -d "'\"" | sed 's#^\./##'
    done
}

# pct_config_closure <root> <setup files, one per line>: every file the vitest config loads, repo-
# relative, one per line: the root vite/vitest config and workspace files, the setup files, and every
# file they reach through a RELATIVE import, export-from, dynamic import or require, followed
# recursively. Such a file runs inside every test run (vite.config.ts imports
# scripts/lib/test-lane-apply.mjs, which rewrites process.env for every test), so a seed of it selects
# nothing while a change to it can break every test (P1719 review: found on the real tree). Derived,
# not hand-listed (gate 7e). A text match, so a commented-out import over-includes, which is cheap.
# Any other quoted relative or 'scripts/...' string naming an existing file is followed too (a file
# the config runs or names by string), and so is an aliased import ('@/lib/x') whose alias the config
# defines with path.resolve(__dirname, ...). Exits non-zero if python3 fails, which the caller turns
# into a full run.
pct_config_closure() {
    python3 -I - "$1" "$2" <<'PY'
import os, re, sys
root = os.path.realpath(sys.argv[1])
SPEC = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew\s+URL\s*\(\s*)['"`](\.{1,2}/[^'"`?$]+)""")
EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json']
CONFIG = re.compile(r'^(vite|vitest)\.(config|workspace)\.[cm]?[jt]s$')
# Any other quoted path in a loaded file: a file the config names by string (setupFiles split across
# lines, reporters, environment) or runs (test-lane.mjs spawns scripts/selfhosted/lane.py). A
# repo-root 'scripts/...' string counts too. Over-inclusion is cheap; index files are not tried, so a
# directory string ('./src/lib') pulls in nothing (P1719 re-review).
LIT = re.compile(r"""['"`]((?:\.{1,2}/|scripts/)[^'"`?$\s]+)['"`]""")

# Path aliases, read from the config files ('@': path.resolve(__dirname, './src')), so a module a
# setup file imports as '@/lib/x' joins the closure (P1719 spec re-review: src/tests/setup.tsx runs
# in every test and imports three '@/lib' modules).
ALIAS_DEF = re.compile(r"""['"](@[\w-]*)['"]\s*:\s*path\.resolve\(\s*__dirname\s*,\s*['"](\.{0,2}/?[^'"]+)['"]\s*\)""")
ALIASED = re.compile(r"""(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`](@[\w-]*)/([^'"`?$]+)""")
aliases = {}

def resolve(rel_dir, spec, index=True):
    p = os.path.normpath(os.path.join(rel_dir, spec))
    if p == '..' or p.startswith('../'):
        return None
    stem, ext = os.path.splitext(p)
    cands = [p] + [p + e for e in EXTS] + ([os.path.join(p, 'index' + e) for e in EXTS] if index else [])
    if ext in ('.js', '.jsx', '.mjs', '.cjs'):
        cands += [stem + e for e in ('.ts', '.tsx', '.mts', '.cts')]
    for c in cands:
        if os.path.isfile(os.path.join(root, c)):
            return c
    return None

todo = sorted(f for f in os.listdir(root) if CONFIG.match(f) and os.path.isfile(os.path.join(root, f)))
for f in todo:
    try:
        for name, target in ALIAS_DEF.findall(open(os.path.join(root, f), encoding='utf-8', errors='replace').read()):
            aliases.setdefault(name, target)
    except OSError:
        pass
# A setup entry may omit its extension ('./src/tests/setup'): resolve it like an import.
todo += [r for r in (resolve('', e if e.startswith('.') else './' + e) for e in (s.strip() for s in sys.argv[2].splitlines()) if e) if r]
seen = set()
while todo:
    f = os.path.normpath(todo.pop())
    if f in seen:
        continue
    seen.add(f)
    try:
        text = open(os.path.join(root, f), encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    for spec in SPEC.findall(text):
        r = resolve(os.path.dirname(f), spec)
        if r and r not in seen:
            todo.append(r)
    for name, rest in ALIASED.findall(text):
        if name in aliases:
            r = resolve('', os.path.join(aliases[name], rest))
            if r and r not in seen:
                todo.append(r)
    for lit in LIT.findall(text):
        r = resolve('', './' + lit, False) if lit.startswith('scripts/') else resolve(os.path.dirname(f), lit, False)
        if r and r not in seen:
            todo.append(r)
for f in sorted(seen):
    print(f.replace(os.sep, '/'))
PY
}

# Tracked JS/TS files that read files or run commands, repo-relative, one per line: the fs / exec
# family in any file, plus ?raw and import.meta.glob in test files only.
# vite.config.ts is among them (it calls existsSync). That is correct: a test that imports the
# config is related to it. (Checked, not assumed: in a scratch project on vitest 4.0.14 a related
# seed of vite.config.ts alone selected zero files, so vitest's forceRerunTriggers do not turn a
# config seed into a whole-suite run. A STAGED config file runs the full suite in pct_classify.)
#
# Returns 0 with the list on stdout, or 2 when git grep itself failed (an error is not "no match":
# git grep exits 1 for no match and 128 for a bad pattern or a broken repo). The caller turns a
# non-zero return, an empty list, or a list without the known member into a FULL run.
pct_disk_sources() {
    local root="$1" out1 out2 rc1 rc2
    rc1=0; rc2=0
    out1="$(git -C "$root" grep -lE "$PCT_DISK_PATTERN" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts' 2>/dev/null)" || rc1=$?
    out2="$(git -C "$root" grep -lE "$PCT_DISK_PATTERN_TEST" -- '*.test.*' '*.spec.*' 2>/dev/null)" || rc2=$?
    if [ "$rc1" -gt 1 ] || [ "$rc2" -gt 1 ]; then
        return 2
    fi
    printf '%s\n%s\n' "$out1" "$out2" | sed '/^$/d' | sort -u
}

# One test that is known to read the disk with no import edge to what it reads (it reads src/App.tsx
# with readFileSync). The derivation above is by grep; this is the divergence check that gate 7e asks
# for beside any derived set: if a derivation that should contain it does not, the derivation is
# broken, and the step runs the full suite. A hand-kept name, so it can rot: if the file is renamed
# the step fails closed (full suite, with this message) until the name here is changed.
PCT_DISK_SENTINEL='src/tests/p1533-auth-callback-no-public-nav.test.ts'

# pct_disk_check <root> <list>: prints a reason and returns 1 when the derived list cannot be trusted.
pct_disk_check() {
    local root="$1" list="$2"
    if [ -z "$list" ]; then
        echo "the disk-reading seed group is empty or could not be derived"
        return 1
    fi
    if ! git -C "$root" ls-files --error-unmatch -- "$PCT_DISK_SENTINEL" >/dev/null 2>&1; then
        echo "the known disk-reading test $PCT_DISK_SENTINEL is not tracked (renamed? update PCT_DISK_SENTINEL)"
        return 1
    fi
    if ! grep -qxF -- "$PCT_DISK_SENTINEL" <<< "$list"; then
        echo "the disk-reading seed group lacks its known member $PCT_DISK_SENTINEL"
        return 1
    fi
    return 0
}

# Sets PCT_FULL_REASON (empty means related mode is safe) and PCT_SRC (the seeds: staged non-deleted
# paths under src/, staged narrowable modules, the JS/TS modules that reach a staged narrowable file by
# query import or glob, plus the modules that import a staged non-code file with ?raw). Reads the
# INDEX, with rename detection off so a rename arrives as delete + add.
# $1 = repo root, $2 = the build-affecting regex, $3 = the docs-only regex, $4 = the narrowable-class
# regex, $5 = the in-class full-suite regex (all from pre-commit-checks.sh, which defines each once).
# Any one missing fails closed.
pct_classify() {
    local root="$1" build_re="$2" docs_re="${3:-}" narrow_re="${4:-}" narrow_full_re="${5:-}" st path imp setup="" refs refs_rc qc_done=0 closure="" cc_done=0 cc_ok=1 cc_scope=0
    PCT_FULL_REASON=""
    PCT_SRC=()
    PCT_QUERY_CANDS=""
    if [ -z "$build_re" ] || [ -z "$docs_re" ] || [ -z "$narrow_re" ] || [ -z "$narrow_full_re" ]; then
        PCT_FULL_REASON="the build-affecting, docs-only, narrowable or narrowable-full pattern was not provided (fail closed)"
        return 0
    fi
    setup="$(pct_setup_files "$root")"
    # The staged list goes through a file so git's exit status can be checked: a process
    # substitution's status is lost, and a failing `git diff --cached` (a corrupt or unreadable
    # index) would read as "nothing staged" and narrow to zero seeds (P1719 review, reproduced).
    local staged_list diff_rc=0
    staged_list="$(mktemp)"
    git -C "$root" diff --cached --name-status --no-renames -z > "$staged_list" 2>/dev/null || diff_rc=$?
    if [ "$diff_rc" -ne 0 ]; then
        rm -f "$staged_list"
        PCT_FULL_REASON="git diff --cached failed (exit $diff_rc), so the staged files cannot be listed"
        return 0
    fi
    while IFS= read -r -d '' st && IFS= read -r -d '' path; do
        # Every regex check below is line-based, so one line of a multi-line name could pass for an
        # allowlisted path (P1719 review). No real file is named that way: refuse it.
        case "$path" in
            *$'\n'*)
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged path contains a newline, which the line-based checks cannot classify: $(printf '%q' "$path")"
                continue
                ;;
        esac
        case "$st" in
            D*)
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged deletion or rename: $path"
                continue
                ;;
        esac
        case "$path" in
            */__mocks__/*|__mocks__/*)
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged mock loaded by convention, not by import: $path"
                continue
                ;;
        esac
        if [ -n "$setup" ] && grep -qxF -- "$path" <<< "$setup"; then
            [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="vitest setup file, outside every test's import graph: $path"
            continue
        fi
        # A file the vitest config loads runs in every test, and a seed of it selects only its own
        # importers (vite.config.ts spreads src/tests/unit-test-env.ts into every test's env, and
        # one test imports it). Checked for src/ and narrowable paths alike (P1719 re-review).
        case "$path" in
            src/*) cc_scope=1 ;;
            *) cc_scope=0; grep -qE "$narrow_re" <<< "$path" && cc_scope=1 ;;
        esac
        if [ "$cc_scope" -eq 1 ]; then
            # A typechange, or a symlink staged as an add or a retarget (A or M, never T), can point
            # anywhere (P1719 reviews). None exist under src/ or the narrowable classes: refuse one.
            # An unreadable mode is refused too.
            case "$st" in
                T*)
                    [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged typechange: $path"
                    continue
                    ;;
            esac
            case "$(git -C "$root" --literal-pathspecs ls-files -s -- "$path" 2>/dev/null || echo unreadable)" in
                120000\ *|unreadable*|"")
                    [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged symlink (or unreadable mode): $path"
                    continue
                    ;;
            esac
            if [ "$cc_done" -eq 0 ]; then
                cc_done=1
                closure="$(pct_config_closure "$root" "$setup")" || cc_ok=0
            fi
            if [ "$cc_ok" -eq 0 ]; then
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="could not derive the files the vitest config loads, so $path may be one of them"
                continue
            fi
            if grep -qxF -- "$path" <<< "$closure"; then
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="the vitest config loads this file (directly or through another import), so it runs in every test: $path"
                continue
            fi
        fi
        case "$path" in
            src/*)
                # Config-shaped files under src/ have no edge a graph follows; plain code does.
                if grep -qE "$build_re" <<< "$path" \
                    && ! { grep -qE '^src/.*\.(ts|tsx|js|jsx)$' <<< "$path" && ! grep -qE '\.config\.|tsconfig' <<< "$path"; }; then
                    [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="build-affecting file with no import edge to a unit test: $path"
                    continue
                fi
                PCT_SRC+=("$path")
                ;;
            *)
                # Outside src/: narrowing is allowed ONLY for the docs-only and narrowable allowlists.
                # Anything else may have an edge this step cannot see (vercel.json read by the CSP
                # canaries, a root config); it cannot tell, so it runs everything.
                if grep -qE "$docs_re" <<< "$path"; then
                    :
                elif grep -qE "$narrow_re" <<< "$path"; then
                    if grep -qE "$narrow_full_re" <<< "$path"; then
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="config-shaped file inside a narrowable class, with no edge a graph follows: $path"
                        continue
                    fi
                    if grep -qE "$PCT_MODULE_PATTERN" <<< "$path"; then
                        PCT_SRC+=("$path")
                    fi
                    # The candidate list is the same for every staged file: derive it once per run.
                    if [ "$qc_done" -eq 0 ]; then
                        qc_done=1
                        if ! pct_query_candidates "$root"; then
                            [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="git grep failed while finding the query-import and glob referencers of $path"
                            continue
                        fi
                    fi
                    refs_rc=0
                    refs="$(pct_query_referencers "$root" "$path" "$narrow_re")" || refs_rc=$?
                    if [ "$refs_rc" -ne 0 ]; then
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="git grep failed while finding the query-import and glob referencers of $path"
                        continue
                    fi
                    while IFS= read -r imp; do
                        [ -n "$imp" ] && PCT_SRC+=("$imp")
                    done <<< "$refs"
                    # The file-name match above already covers a `name?raw` import, so the ?raw search
                    # below would only add the same files again.
                    continue
                else
                    if grep -qE "$build_re" <<< "$path"; then
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="build-affecting file with no import edge to a unit test: $path"
                    else
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged file outside src/ and on neither the docs-only nor the narrowable list, so its test edges are unknown: $path"
                    fi
                    continue
                fi
                ;;
        esac
        # A module that imports this non-code file with ?raw has no graph edge to it (vitest drops the
        # query, then the path does not exist), so seed the IMPORTING modules too.
        if ! grep -qE '\.(ts|tsx|js|jsx)$' <<< "$path"; then
            while IFS= read -r imp; do
                [ -n "$imp" ] && PCT_SRC+=("$imp")
            done < <(git -C "$root" grep -lF -e "${path##*/}?raw" -- src 2>/dev/null || true)
        fi
    done < "$staged_list"
    rm -f "$staged_list"
    # One seed per file, first occurrence kept: a staged src/ file can also be a referencer, and two
    # staged files in one directory reach the same referencer. A repeat would inflate the counts the
    # step prints, which are its audit surface (P1719 review).
    local -a uniq=()
    local seen=$'\n'
    for imp in ${PCT_SRC[@]+"${PCT_SRC[@]}"}; do
        case "$seen" in
            *$'\n'"$imp"$'\n'*) ;;
            *) uniq+=("$imp"); seen="$seen$imp"$'\n' ;;
        esac
    done
    PCT_SRC=(${uniq[@]+"${uniq[@]}"})
    return 0
}

# Read the number of test FILES that ran from a vitest JSON report. Prints the number, or nothing.
pct_ran_count() {
    [ -s "$1" ] || return 0
    python3 -I -c 'import json,sys
try:
    print(len(json.load(open(sys.argv[1]))["testResults"]))
except Exception:
    pass' "$1" 2>/dev/null
}

# Names of the test files that FAILED, from the JSON report, one per line. run_quiet shows only the
# last 30 lines of a failure, which in a run of hundreds of files rarely names the failing file.
pct_failed_files() {
    [ -s "$1" ] || return 0
    python3 -I -c 'import json,sys,os
try:
    root = os.getcwd() + os.sep
    for r in json.load(open(sys.argv[1]))["testResults"]:
        if r.get("status") == "failed":
            print(r["name"][len(root):] if r["name"].startswith(root) else r["name"])
except Exception:
    pass' "$1" 2>/dev/null
}

# The step. Needs run_quiet (scripts/lib/run-quiet.sh) already sourced.
# $1 = repo root, $2..$5 = the four patterns pct_classify takes, in its order. Returns 0 on pass, 1 on
# failure of any kind.
pct_run_tests() {
    local root="$1" build_re="$2" docs_re="${3:-}" narrow_re="${4:-}" narrow_full_re="${5:-}"
    local workers json rc ran failed f n_seed n_out n_disk disk_out disk_why
    local -a cmd=() seeds=() disk=()
    workers="$(pct_worker_share)"
    json="$(mktemp)"
    pct_classify "$root" "$build_re" "$docs_re" "$narrow_re" "$narrow_full_re"

    # Derive the disk-reading group BEFORE choosing a mode: a group that cannot be trusted turns a
    # related run into a full one (and costs nothing when the mode is full anyway).
    if [ -z "$PCT_FULL_REASON" ]; then
        if disk_out="$(pct_disk_sources "$root")"; then
            if ! disk_why="$(pct_disk_check "$root" "$disk_out")"; then
                PCT_FULL_REASON="$disk_why"
            fi
        else
            PCT_FULL_REASON="git grep failed while deriving the disk-reading seed group"
        fi
    fi

    if [ -n "$PCT_FULL_REASON" ]; then
        echo -e ">>> Tests plan... ${YELLOW:-}FULL suite${NC:-} (${PCT_FULL_REASON}); capped at ${workers} workers"
        # env -u: vitest applies an inherited VITEST_MAX_WORKERS AFTER the CLI flag, so it would beat
        # the computed count and the plan line above would lie (P1676 review). PRECOMMIT_TEST_WORKERS
        # is the hook's knob.
        cmd=(env -u VITEST_MAX_WORKERS npx vitest run "--maxWorkers=$workers" --reporter=default --reporter=json "--outputFile.json=$json")
    else
        while IFS= read -r f; do
            [ -n "$f" ] && disk+=("$root/$f")
        done <<< "$disk_out"
        n_out=0
        for f in ${PCT_SRC[@]+"${PCT_SRC[@]}"}; do
            seeds+=("$root/$f")
            case "$f" in src/*) ;; *) n_out=$((n_out+1)) ;; esac
        done
        n_seed=${#seeds[@]}
        n_disk=${#disk[@]}
        echo -e ">>> Tests plan... RELATED: ${n_seed} staged or importing file(s) (${n_out} outside src/) + ${n_disk} disk-reading file(s) as import-graph seeds; capped at ${workers} workers"
        cmd=(env -u VITEST_MAX_WORKERS npx vitest related --run "--maxWorkers=$workers" --passWithNoTests --reporter=default --reporter=json "--outputFile.json=$json")
        cmd+=(${seeds[@]+"${seeds[@]}"} ${disk[@]+"${disk[@]}"})
    fi

    rc=0
    run_quiet "Tests" "${cmd[@]}" || rc=1

    # Outside run_quiet on purpose: it prints nothing on success, and a count nobody can see is
    # the silent narrowing this step must not do.
    ran="$(pct_ran_count "$json")"
    failed="$(pct_failed_files "$json")"
    rm -f "$json"
    if [ -n "$failed" ]; then
        echo -e ">>> Tests failed in:"
        while IFS= read -r f; do echo "      $f"; done <<< "$failed"
    fi
    if [ -z "$ran" ]; then
        echo -e ">>> Tests ran... ${RED:-}count unavailable: vitest wrote no report${NC:-}"
        rc=1
    elif [ "$ran" = "0" ]; then
        echo -e ">>> Tests ran... ${YELLOW:-}ZERO test files ran${NC:-} (the selection was empty)"
    else
        echo -e ">>> Tests ran... ${ran} test file(s)"
    fi
    return $rc
}
