#!/bin/bash
# Real-vitest proofs for P1635, sourced by scripts/test-p1635-precommit-tests.sh when given --real.
# Never runs from the hook: each scenario is minutes of CPU. Needs ok / bad / check and the library
# functions from the caller.
#
#   P1635_SCENARIOS="s1 s2 ..."   which to run (default: all)
#   P1635_SCRATCH=DIR             scratch root (default ~/.cache/p1635-scratch). NOT under the temp
#                                 directory: src/tests/p1607-e2e-slot-lock.test.ts asserts that the
#                                 current directory is OUTSIDE the temp directory, so a scratch
#                                 clone under /tmp fails that test for a reason unrelated to this.
#
#   s1  an unrelated-area broken test PASSES the Tests step (it is red when run alone: that is what
#       the staging run would catch)
#   s2  a related broken test is REFUSED
#   s3  a vercel.json-only change runs the FULL suite
#   s4  a zero-test selection prints that it ran zero (real vitest, scratch project)
#   s5  breaking src/App.tsx so the p1533 test fails is REFUSED, and graph selection alone would
#       NOT have caught it (the disk-reading group is what does)
#   w1  documented workflow: a docs-only commit through the hook copy
#   w2  documented workflow: a source commit through the hook copy
#   w3  documented workflow: commit-to-main through the hook copy
#   w4  documented workflow: a conflicted cherry-pick's --continue through the hook copy
#
# The scratch clones are throwaway repositories: commits made in them touch no real branch.

SCR="${P1635_SCRATCH:-$HOME/.cache/p1635-scratch}"
SCEN="${P1635_SCENARIOS:-s1 s2 s3 s4 s5 w1 w2 w3 w4}"
LOGS="$SCR/logs"
mkdir -p "$SCR/worktrees" "$LOGS"

real_pristine() {
    local P="$SCR/pristine"
    [ -d "$P/.git" ] && return 0
    rm -rf "$P"
    git clone -q --local "$REPO_ROOT" "$P" || return 1
    git -C "$P" checkout -q -B main
    ln -s "$(cd "$REPO_ROOT/node_modules" && pwd -P)" "$P/node_modules"
    local e
    for e in .env.local .env.test.local .env.development.local; do
        [ -e "$REPO_ROOT/$e" ] && ln -s "$(readlink "$REPO_ROOT/$e" || echo "$REPO_ROOT/$e")" "$P/$e"
    done
    # carry the working-tree change under test into the clone, as one base commit (no hook yet)
    local f
    { git -C "$REPO_ROOT" diff HEAD --name-only; git -C "$REPO_ROOT" ls-files --others --exclude-standard; } \
        | grep -vE '^(node_modules|\.lock$)' | while IFS= read -r f; do
            [ -f "$REPO_ROOT/$f" ] || continue
            mkdir -p "$P/$(dirname "$f")"; cp -p "$REPO_ROOT/$f" "$P/$f"
        done
    git -C "$P" add -- scripts .github features 2>/dev/null
    git -C "$P" -c user.email=t@example.invalid -c user.name=t commit -q --no-verify -m "scratch: working tree under test" 2>/dev/null
    git -C "$P" config user.email t@example.invalid; git -C "$P" config user.name t
    git -C "$P" config commit.gpgsign false
    return 0
}

# real_work <name>: a fresh copy-on-write copy of the pristine clone; sets W.
real_work() {
    W="$SCR/worktrees/p1635-$1"
    rm -rf "$W"
    cp -cR "$SCR/pristine" "$W" || return 1
    printf '#!/bin/bash\nexec bash scripts/pre-commit-checks.sh\n' > "$W/.git/hooks/pre-commit"
    chmod +x "$W/.git/hooks/pre-commit"
}

# real_step <dir>: run ONLY the Tests step of the hook copy against the staged state in <dir>.
real_step() {
    ( cd "$1" && unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE \
        && RED='' YELLOW='' GREEN='' NC='' \
        && . scripts/lib/run-quiet.sh && . scripts/lib/precommit-tests.sh \
        && BRE="$(grep -m1 "^BUILD_AFFECTING_RE='" scripts/pre-commit-checks.sh | sed "s/^BUILD_AFFECTING_RE='//; s/'\$//")" \
        && pct_run_tests "$PWD" "$BRE" )
}

result() { # result <label> <expected rc> <actual rc>
    if [ "$3" = "$2" ]; then ok "$1 (exit $3, expected $2)"; else bad "$1: exit $3, expected $2"; fi
}
want_in() { # want_in <label> <logfile> <fixed text>
    # strip color codes first: the hook's own lines carry them, and BSD sed has no \x1b escape
    sed $'s/\033\\[[0-9;]*m//g' "$2" | grep -qF -- "$3" && ok "$1" || bad "$1: '$3' not in $2"
}

want() { case " $SCEN " in *" $1 "*) return 0 ;; esac; return 1; }

real_pristine || { bad "could not build the pristine scratch clone"; return 0; }
echo "  scratch: $SCR (logs in $LOGS)"

touch_f() { printf '\n// p1635 scratch edit\n' >> "$W/$1"; git -C "$W" add -- "$1"; }

if want s1; then
    echo "-- s1: an unrelated-area broken test passes the Tests step"
    real_work s1
    broken=src/tests/p988-reproduce.test.ts
    grep -qxF "$broken" <<< "$(pct_disk_sources "$W")" && bad "s1 premise: $broken is in the disk group" || ok "s1 premise: $broken is NOT in the disk-reading group"
    printf '\nit("p1635 scratch: deliberately red", () => { expect(1).toBe(2) })\n' >> "$W/$broken"   # unstaged, working tree only
    touch_f src/lib/canvas-hrefs.ts                                                                  # the staged change, another area
    real_step "$W" > "$LOGS/s1.log" 2>&1; rc=$?
    result "s1 hook Tests step with an unrelated red test in the tree" 0 "$rc"
    ( cd "$W" && npx vitest run --maxWorkers=2 "$broken" > "$LOGS/s1-alone.log" 2>&1 ); rc2=$?
    result "s1 the same test run alone is RED (this is what the staging run would catch)" 1 "$rc2"
fi

if want s2; then
    echo "-- s2: a related broken test is refused"
    real_work s2
    python3 -I - "$W/src/lib/chunk-error.ts" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
assert "'Loading chunk'," in s
open(p, "w").write(s.replace("'Loading chunk',", "'p1635-broken-loading-chunk',", 1))
PY
    git -C "$W" add -- src/lib/chunk-error.ts
    real_step "$W" > "$LOGS/s2.log" 2>&1; rc=$?
    result "s2 hook Tests step with chunk-error.ts broken" 1 "$rc"
    want_in "s2 the related test is the one that failed" "$LOGS/s2.log" "p988-reproduce"
fi

if want s3; then
    echo "-- s3: a vercel.json-only change runs the full suite"
    real_work s3
    printf '\n' >> "$W/vercel.json"; git -C "$W" add -- vercel.json
    real_step "$W" > "$LOGS/s3.log" 2>&1; rc=$?
    want_in "s3 plan says FULL and names vercel.json" "$LOGS/s3.log" "FULL suite (build-affecting file with no import edge to a unit test: vercel.json)"
    want_in "s3 the worker cap is announced" "$LOGS/s3.log" "capped at 3 workers"
    echo "  s3 exit=$rc (a full run may be red for reasons already in the tree; the proof is the plan line and the count)"
    grep -E '>>> Tests ran' "$LOGS/s3.log"
fi

if want s4; then
    echo "-- s4: a zero-test selection prints that it ran zero (real vitest)"
    T="$SCR/tiny"; rm -rf "$T"; mkdir -p "$T/src"
    ( cd "$T" && git init -q . && ln -s "$(cd "$REPO_ROOT/node_modules" && pwd -P)" node_modules \
      && printf 'export default { test: { globals: true } }\n' > vite.config.ts \
      && printf 'export const a = 1\n' > src/a.ts && printf 'import {a} from "./a"\nit("a",()=>{expect(a).toBe(1)})\n' > src/a.test.ts \
      && printf 'export const o = 1\n' > src/orphan.ts \
      && git add -A && git -c user.email=t@x -c user.name=t commit -q -m base \
      && printf '// edit\n' >> src/orphan.ts && git add src/orphan.ts )
    ( cd "$T" && unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE && RED='' YELLOW='' GREEN='' NC='' \
        && . "$REPO_ROOT/scripts/lib/run-quiet.sh" && . "$REPO_ROOT/scripts/lib/precommit-tests.sh" \
        && pct_run_tests "$PWD" "$BUILD_RE" ) > "$LOGS/s4.log" 2>&1; rc=$?
    result "s4 zero-selection run" 0 "$rc"
    want_in "s4 says ZERO test files ran" "$LOGS/s4.log" "ZERO test files ran"
fi

if want s5; then
    echo "-- s5: breaking src/App.tsx so the p1533 test fails is refused"
    real_work s5
    python3 -I - "$W/src/App.tsx" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
old = '<ClarityLandingLayout surface="public" logoOnly>'
assert old in s
open(p, "w").write(s.replace(old, '<ClarityLandingLayout surface="public">', 1))
PY
    git -C "$W" add -- src/App.tsx
    # control: the module graph ALONE does not reach p1533 (it reads App.tsx, never imports it)
    ( cd "$W" && npx vitest related --run --maxWorkers=3 --passWithNoTests --reporter=json --outputFile.json="$LOGS/s5-graph.json" "$W/src/App.tsx" > "$LOGS/s5-graph.log" 2>&1 )
    if python3 -I -c 'import json,sys
names=[r["name"] for r in json.load(open(sys.argv[1]))["testResults"]]
sys.exit(0 if not any("p1533-auth-callback-no-public-nav" in n for n in names) else 1)' "$LOGS/s5-graph.json"; then
        ok "s5 control: graph-only selection from App.tsx does NOT include the p1533 test"
    else bad "s5 control: graph-only selection already includes p1533 (the premise is wrong)"; fi
    real_step "$W" > "$LOGS/s5.log" 2>&1; rc=$?
    result "s5 hook Tests step with App.tsx broken for p1533" 1 "$rc"
    want_in "s5 the p1533 test is the one that failed" "$LOGS/s5.log" "p1533-auth-callback-no-public-nav"
fi

# ── documented workflows through the hook COPY, in a scratch clone with it installed ──
hookcommit() { # hookcommit <dir> <log> <git args...>: a real `git commit`-family command; exit code returned
    local d="$1" log="$2"; shift 2
    ( cd "$d" && unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE && "$@" ) > "$log" 2>&1
}

if want w1; then
    echo "-- w1: docs-only commit through the hook copy"
    real_work w1
    printf '\nscratch docs edit\n' >> "$W/docs/decisions.md"; git -C "$W" add -- docs/decisions.md
    hookcommit "$W" "$LOGS/w1.log" git commit -q -m "docs: scratch"; rc=$?
    result "w1 docs-only commit" 0 "$rc"
    want_in "w1 Tests step is skipped, not run" "$LOGS/w1.log" "Tests... skipped (no build-affecting files staged)"
fi

if want w2; then
    echo "-- w2: source commit through the hook copy"
    real_work w2
    touch_f src/lib/canvas-hrefs.ts
    hookcommit "$W" "$LOGS/w2.log" git commit -q -m "fix: scratch source commit"; rc=$?
    result "w2 source commit" 0 "$rc"
    want_in "w2 plan line is RELATED" "$LOGS/w2.log" "Tests plan... RELATED"
fi

if want w3; then
    echo "-- w3: commit-to-main through the hook copy"
    real_work w3
    printf '\n// p1635 scratch edit\n' >> "$W/src/lib/canvas-hrefs.ts"
    hookcommit "$W" "$LOGS/w3.log" ./scripts/git-ops.sh commit-to-main --message "fix: scratch commit-to-main" --files src/lib/canvas-hrefs.ts; rc=$?
    result "w3 commit-to-main" 0 "$rc"
    want_in "w3 plan line is RELATED" "$LOGS/w3.log" "Tests plan... RELATED"
fi

if want w4; then
    echo "-- w4: a conflicted cherry-pick's --continue through the hook copy"
    real_work w4
    (   cd "$W" && unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE \
        && git checkout -q -b side \
        && printf '\n// side edit\n' >> src/lib/canvas-hrefs.ts && git add src/lib/canvas-hrefs.ts && git commit -q --no-verify -m "side" \
        && git checkout -q main \
        && printf '\n// main edit\n' >> src/lib/canvas-hrefs.ts && git add src/lib/canvas-hrefs.ts && git commit -q --no-verify -m "main" ) > "$LOGS/w4-setup.log" 2>&1
    ( cd "$W" && unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE && git cherry-pick side ) > "$LOGS/w4-pick.log" 2>&1; rcp=$?
    [ "$rcp" -ne 0 ] && ok "w4 the cherry-pick conflicts, as set up (exit $rcp)" || bad "w4 the cherry-pick did not conflict, so --continue is not exercised"
    ( cd "$W" && python3 -I - src/lib/canvas-hrefs.ts <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n", r"\1\2", s, flags=re.S)
open(p, "w").write(s)
PY
    ) > /dev/null 2>&1
    git -C "$W" add -- src/lib/canvas-hrefs.ts
    hookcommit "$W" "$LOGS/w4.log" env GIT_EDITOR=true git cherry-pick --continue; rc=$?
    result "w4 cherry-pick --continue" 0 "$rc"
    want_in "w4 the hook ran its Tests step on the continued commit" "$LOGS/w4.log" "Tests plan... RELATED"
fi
