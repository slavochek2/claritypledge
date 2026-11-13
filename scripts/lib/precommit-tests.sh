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
# WHEN THE WHOLE SUITE RUNS INSTEAD (any one is enough, and the reason is printed). The rule FAILS
# CLOSED: only files this step can place are narrowed, everything else runs the full suite.
#   - a staged deletion or rename: the file is gone, so no graph can name its importers;
#   - ANY staged path outside src/ that is not on the docs-only allowlist (DOCS_ONLY_RE in
#     pre-commit-checks.sh): vercel.json, lockfiles, package.json, tsconfig*, *.config.*, public/,
#     scripts/ (.mjs, .sh, .js), e2e/, api/, supabase/, index.html, .env.*, deno.json ... A first
#     version listed the shapes it knew (the build-affecting regex) and ignored every other file, so
#     `src/x.ts` + `scripts/lib/video-summary-core.mjs` ran related tests only while two tests
#     import that .mjs (reproduced on 1cc9facd9: full_reason empty, seeds = the .ts alone);
#   - a vitest setup file (setupFiles / globalSetup in vite.config.*): imported by vitest, not by
#     any test, so the graph never reaches it;
#   - anything under a __mocks__ directory: loaded by name convention, not by import;
#   - the disk-reading seed group cannot be derived, or is missing its known member: narrowing on a
#     group nobody can vouch for is the silent failure this step exists to avoid.
# A docs-only commit never reaches this step (the hook's BUILD_AFFECTING gate skips it), and a
# docs file beside a src edit stays related: its only possible test edge is a disk read, which the
# seed group already covers.
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
# paths under src/, plus the modules that import a staged non-code file with ?raw). Reads the INDEX,
# with rename detection off so a rename arrives as delete + add.
# $1 = repo root, $2 = the build-affecting regex, $3 = the docs-only regex (both from
# pre-commit-checks.sh, which defines each once). Either missing fails closed.
pct_classify() {
    local root="$1" build_re="$2" docs_re="${3:-}" st path imp setup=""
    PCT_FULL_REASON=""
    PCT_SRC=()
    if [ -z "$build_re" ] || [ -z "$docs_re" ]; then
        PCT_FULL_REASON="the build-affecting or docs-only pattern was not provided (fail closed)"
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
                # Outside src/: narrowing is allowed ONLY for the docs-only allowlist. Anything else
                # may have an import edge (scripts/lib/*.mjs) or none at all (vercel.json); this step
                # cannot tell, so it runs everything.
                if ! grep -qE "$docs_re" <<< "$path"; then
                    if grep -qE "$build_re" <<< "$path"; then
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="build-affecting file with no import edge to a unit test: $path"
                    else
                        [ -n "$PCT_FULL_REASON" ] || PCT_FULL_REASON="staged file outside src/ and not on the docs-only list, so its test edges are unknown: $path"
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
    local root="$1" build_re="$2" docs_re="${3:-}" workers json rc ran failed f n_seed n_disk disk_out disk_why
    local -a cmd=() seeds=() disk=()
    workers="$(pct_worker_share)"
    json="$(mktemp)"
    pct_classify "$root" "$build_re" "$docs_re"

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
        for f in ${PCT_SRC[@]+"${PCT_SRC[@]}"}; do
            seeds+=("$root/$f")
        done
        n_seed=${#seeds[@]}
        n_disk=${#disk[@]}
        echo -e ">>> Tests plan... RELATED: ${n_seed} staged src file(s) + ${n_disk} disk-reading file(s) as import-graph seeds; capped at ${workers} workers"
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
