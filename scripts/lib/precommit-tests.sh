#!/bin/bash
# The pre-commit "Tests" step (P1635): related tests, not the full suite, unless a staged file
# has no import edge to any test. Sourced by scripts/pre-commit-checks.sh; sourced (never
# executed) by scripts/test-p1635-precommit-tests.sh, which drives the REAL functions.
#
# WHY: measured 2026-11-05, one source commit's hook costs about 1,390 CPU-seconds in `npm test`
# against about 90 for typecheck, build and eslint together (scripts/bench-p1635-precommit-load.sh).
# Six commits at once is a load average past 120 and a longest commit near 15 minutes. The full
# suite is still run, on the staging hop (test.yml, staging/**), on the exact SHAs that land.
#
# WHAT RUNS, in one `vitest related --run` invocation:
#   seeds = every staged file under src/   (a test selected if it imports one, or IS one)
#         + every tracked JS/TS file whose text reads files or runs commands, derived by grep at
#           run time, never a hand list (epistemic gate 7e).
# The second set is what the module graph cannot see: a test such as
# p1533-auth-callback-no-public-nav.test.ts reads src/App.tsx with readFileSync and never imports
# it, so editing App.tsx selects nothing by graph. Seeding the disk-reading files themselves makes
# vitest select them regardless (a test is related to itself). Seeding the disk-reading HELPERS
# too (a file under src/tests/ that does the reading) selects every test that imports one, which
# is how a test reaches the disk without containing the word `fs`.
#
# WHEN THE WHOLE SUITE RUNS INSTEAD (any one is enough, and the reason is printed):
#   - a staged deletion or rename: the file is gone, so no graph can name its importers;
#   - a staged build-affecting file that is not an imported src file: vercel.json, lockfiles,
#     package.json, tsconfig*, *.config.*, public/, scripts/, e2e/, api/, tools/ ... It has no
#     module-graph edge to a unit test, and pre-commit-checks.sh relied on it running the suite
#     (a vercel.json-only edit, so the CSP canaries catch it);
#   - a vitest setup file (setupFiles / globalSetup in vite.config.*): imported by vitest, not by
#     any test, so the graph never reaches it;
#   - anything under a __mocks__ directory: loaded by name convention, not by import.
#
# GUARANTEES (the canary holds each of them):
#   - every run is capped at PRECOMMIT_TEST_WORKERS workers (default 3), full runs included;
#   - the count of test files that ACTUALLY ran is printed OUTSIDE run_quiet, which hides output
#     on success, and a run that ran zero says so in words;
#   - nothing here adds a way to skip tests. PRECOMMIT_TEST_WORKERS only tunes the cap, and a
#     non-numeric or zero value falls back to the default.
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

pct_workers() {
    local w="${PRECOMMIT_TEST_WORKERS:-$PCT_WORKERS_DEFAULT}"
    case "$w" in
        ''|*[!0-9]*|0) w="$PCT_WORKERS_DEFAULT" ;;
    esac
    printf '%s' "$w"
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

# Tracked JS/TS files that read files or run commands, repo-relative, one per line: the fs / exec
# family in any file, plus ?raw and import.meta.glob in test files only.
# vite.config.ts is among them (it calls existsSync). That is correct: a test that imports the
# config is related to it. (Checked, not assumed: in a scratch project on vitest 4.0.14 a related
# seed of vite.config.ts alone selected zero files, so vitest's forceRerunTriggers do not turn a
# config seed into a whole-suite run. A STAGED config file runs the full suite in pct_classify.)
pct_disk_sources() {
    local root="$1"
    {
        git -C "$root" grep -lE "$PCT_DISK_PATTERN" -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts' 2>/dev/null || true
        git -C "$root" grep -lE "$PCT_DISK_PATTERN_TEST" -- '*.test.*' '*.spec.*' 2>/dev/null || true
    } | sort -u
}

# Sets PCT_FULL_REASON (empty means related mode is safe) and PCT_SRC (staged, non-deleted paths
# under src/). Reads the INDEX, with rename detection off so a rename arrives as delete + add.
# $1 = repo root, $2 = the build-affecting regex shared with pre-commit-checks.sh.
pct_classify() {
    local root="$1" build_re="$2" st path imp setup=""
    PCT_FULL_REASON=""
    PCT_SRC=()
    if [ -z "$build_re" ]; then
        PCT_FULL_REASON="the build-affecting pattern was not provided (fail closed)"
        return 0
    fi
    setup="$(pct_setup_files "$root")"
    while IFS= read -r -d '' st && IFS= read -r -d '' path; do
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
        if grep -qE "$build_re" <<< "$path"; then
            # build-affecting: only a plain src/ code file has an import edge a graph can follow.
            if grep -qE '^src/.*\.(ts|tsx|js|jsx)$' <<< "$path" && ! grep -qE '\.config\.|tsconfig' <<< "$path"; then
                PCT_SRC+=("$path")
            else
                [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="build-affecting file with no import edge to a unit test: $path"
            fi
            continue
        fi
        # not build-affecting: still a seed when it lives in src/ (css, json, svg a module imports)
        case "$path" in
            src/*)
                PCT_SRC+=("$path")
                # A module that imports it with ?raw has no graph edge to it (vitest drops the
                # query, then the path does not exist), so seed the IMPORTING modules too.
                while IFS= read -r imp; do
                    [ -n "$imp" ] && PCT_SRC+=("$imp")
                done < <(git -C "$root" grep -lF -e "${path##*/}?raw" -- src 2>/dev/null || true)
                ;;
        esac
    done < <(git -C "$root" diff --cached --name-status --no-renames -z 2>/dev/null)
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
# $1 = repo root, $2 = build-affecting regex. Returns 0 on pass, 1 on failure of any kind.
pct_run_tests() {
    local root="$1" build_re="$2" workers json rc ran failed f n_seed n_disk
    local -a cmd=() seeds=() disk=()
    workers="$(pct_workers)"
    json="$(mktemp)"
    pct_classify "$root" "$build_re"

    if [ -n "$PCT_FULL_REASON" ]; then
        echo -e ">>> Tests plan... ${YELLOW:-}FULL suite${NC:-} (${PCT_FULL_REASON}); capped at ${workers} workers"
        cmd=(npx vitest run "--maxWorkers=$workers" --reporter=default --reporter=json "--outputFile.json=$json")
    else
        while IFS= read -r f; do
            [ -n "$f" ] && disk+=("$root/$f")
        done < <(pct_disk_sources "$root")
        for f in ${PCT_SRC[@]+"${PCT_SRC[@]}"}; do
            seeds+=("$root/$f")
        done
        n_seed=${#seeds[@]}
        n_disk=${#disk[@]}
        echo -e ">>> Tests plan... RELATED: ${n_seed} staged src file(s) + ${n_disk} disk-reading file(s) as import-graph seeds; capped at ${workers} workers"
        cmd=(npx vitest related --run "--maxWorkers=$workers" --passWithNoTests --reporter=default --reporter=json "--outputFile.json=$json")
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
