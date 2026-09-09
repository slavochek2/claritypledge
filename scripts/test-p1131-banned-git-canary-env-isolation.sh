#!/bin/bash
# scripts/test-p1131-banned-git-canary-env-isolation.sh — canary for P1131.
#
# P1131 is a bug in a canary, so this is a canary for a canary. It pins the one
# property of scripts/test-block-banned-git.py that its own 77 cases cannot
# check: that the fixture is isolated from the invoking shell's git repo-scoping
# environment.
#
# The defect: test-block-banned-git.py builds a scratch repo with `git init` and
# asks `git rev-parse --git-path sequencer` where it lives. git exports GIT_DIR
# (and GIT_INDEX_FILE) to its hooks, and an ABSOLUTE GIT_DIR beats cwd-based repo
# discovery — so when pre-commit-checks.sh ran the canary as a real hook from a
# worktree, rev-parse answered for the OUTER repo, the fixture's integrity guard
# reported "FIXTURE BROKEN: sequencer dir not resolvable", and the commit was
# blocked. It passed from the main checkout only by coincidence: there git sets
# GIT_DIR to the relative string ".git", which resolves against the subprocess's
# cwd and so happens to land on the fixture's own repo.
#
# Two things make this worth its own file. The environment that breaks the canary
# is exactly the one it runs in for real, and it is never present when a human
# runs the canary by hand — so a regression here is invisible until it blocks
# somebody's commit. And nothing in the 77 cases fails when the scrub is removed
# unless those variables happen to be set.
#
# ---------------------------------------------------------------------------
# WHY THE INJECTED GIT_DIR POINTS AT A DECOY REPO, NOT THIS ONE
# ---------------------------------------------------------------------------
# The first version of this file injected the REAL repository's absolute git-dir,
# on the reasoning that this is literally the environment git hands a hook. That
# made the file destructive by construction, and it destroyed the shared
# repository four times on 2026-09-09 before it was caught. `git init <dir>` does
# not create <dir>/.git when GIT_DIR is set — it (re)initialises GIT_DIR instead.
# Measured in a throwaway sandbox, with GIT_DIR pointed at a linked worktree's
# git-dir:
#
#   env GIT_DIR=<repo>/.git/worktrees/wN git init -q <tmp>
#       -> writes core.bare = true into the SHARED <repo>/.git/config
#   env GIT_DIR=<...> GIT_WORK_TREE=<wN> git init -q <tmp>
#       -> writes core.worktree = <wN> into the same shared config
#
# Both observed values on the real repository were exactly that: `core.bare=true`
# and `core.worktree=<...>/.claude/worktrees/w22`. Every git command in the repo
# then fails with "this operation must be run in a work tree", for every
# concurrent session.
#
# The defect under test is "an ABSOLUTE git-dir belonging to some OTHER repo wins
# over cwd-based discovery". A decoy repo built under mktemp reproduces that
# exactly — same shape (absolute path, under a `.git/worktrees/` prefix), same
# mechanism, same failure — and cannot damage anything the founder cares about.
# Scenario 4 deliberately runs an UNSCRUBBED copy under that environment, i.e. it
# deliberately triggers the corruption; pointing it at the live repo was never
# survivable. Scenarios 2, 3 and 5 are safe against the scrubbed canary only for
# as long as the scrub works, which is the very thing they exist to doubt.
#
# Scenario 6 is the backstop: it asserts the real repository's `core.bare` and
# `core.worktree` are untouched, and it runs after every scenario, aborting on
# the first breach rather than letting later scenarios pile on damage.
#
# Scenario 4 is the gate-7 proof: it deletes the scrub from a COPY of the script
# and requires that copy to fail. Mutating the current file rather than pinning
# the pre-fix revision keeps the proof valid as the script evolves.
#
# Hermetic: reads the repo, writes only under mktemp, runs no git command that
# mutates this repository.
set -u

# Derived from this file's own location, not from `git rev-parse`: when this runs
# as a real pre-commit hook the caller's GIT_DIR is set, and rev-parse would
# answer for whatever that points at.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARY="$REPO_ROOT/scripts/test-block-banned-git.py"
PASS=0
FAIL=0

TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# Two empty directories that neutralise the one way a `git init` here could run
# somebody else's code. `git init` copies a TEMPLATE into the new repo, and
# `git worktree add` then runs the post-checkout hook it finds there; the template
# is chosen by GIT_TEMPLATE_DIR (scrubbed below) or by `init.templateDir`, which
# is CONFIG and so survives any amount of env scrubbing. Pointing both the
# template and the hook path at empty directories means the decoy can only ever
# be inert. Neither is set on this machine today — measured 2026-09-09, all of
# GIT_TEMPLATE_DIR, `init.templateDir` (global and system) and the global hook
# path are unset — so this is defence in depth, not a live fix. Found by
# adversarial review, which was right that the file's "hermetic" claim did not
# hold as stated.
EMPTY_TEMPLATE="$TMPROOT/empty-template"
EMPTY_HOOKS="$TMPROOT/empty-hooks"
mkdir -p "$EMPTY_TEMPLATE" "$EMPTY_HOOKS"

ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

# The variables under test. Listed once: the sanitizer below, the injection
# scenarios, and scenario 0's drift check all derive from this.
GIT_SCOPING_VARS=(
  GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
  GIT_PREFIX GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_CEILING_DIRECTORIES
  GIT_TEMPLATE_DIR
)

# git_clean — a git invocation this script's own plumbing can trust. Every git
# command here builds or inspects a repo, so none of them may inherit the git env
# of the hook that invoked us, and none may pick up a template or hook directory
# from config (see EMPTY_TEMPLATE above).
git_clean() {
  local unset_args=() v
  for v in "${GIT_SCOPING_VARS[@]}"; do unset_args+=(-u "$v"); done
  env "${unset_args[@]}" git \
    -c "init.templateDir=$EMPTY_TEMPLATE" \
    -c "core.hooksPath=$EMPTY_HOOKS" \
    "$@"
}

# run_canary <script> <cwd> <logfile> [VAR=VALUE ...] -> exit code in $RC
#
# Every run starts from an environment with the whole git scoping family UNSET,
# then applies only the overrides this scenario names. Without that the file is
# self-defeating: it is wired into pre-commit-checks.sh, so when it runs for real
# it runs as a git hook and inherits git's own GIT_DIR — the "clean baseline" and
# the mutation control would both execute under the hostile environment they
# exist to contrast against, and scenario 4 would report the mutation as broken
# and block the commit. Found by adversarial review, which measured exactly that:
# with GIT_DIR pre-set in the parent shell this script exited 1.
RC=0
run_canary() {
  local script="$1" runcwd="$2" log="$3"; shift 3
  local unset_args=() v
  for v in "${GIT_SCOPING_VARS[@]}"; do unset_args+=(-u "$v"); done
  ( cd "$runcwd" && env "${unset_args[@]}" "$@" python3 "$script" ) > "$log" 2>&1
  RC=$?
}

# --- the real repository's invariants, snapshotted before anything runs -------
# core.bare and core.worktree in the SHARED config are the two values the 2026-09-09
# incident wrote. Nothing in this script, and nothing in normal use of this
# repository, changes either.
REAL_COMMON_DIR="$(git_clean -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo "")"
real_cfg() { git_clean -C "$REPO_ROOT" config --get "$1" 2>/dev/null || true; }
BARE_BEFORE="$(real_cfg core.bare)"
WORKTREE_BEFORE="$(real_cfg core.worktree)"

# assert_repo_intact <label> — hard abort, not a counted failure. Once the shared
# config is wrong every other session is already broken; running the remaining
# scenarios would only add to it.
assert_repo_intact() {
  local label="$1" b w
  b="$(real_cfg core.bare)"
  w="$(real_cfg core.worktree)"
  if [ "$b" != "$BARE_BEFORE" ] || [ "$w" != "$WORKTREE_BEFORE" ]; then
    echo ""
    echo "  ABORT  the real repository's git config changed during: $label"
    echo "         core.bare      '$BARE_BEFORE' -> '$b'"
    echo "         core.worktree  '$WORKTREE_BEFORE' -> '$w'"
    echo "         shared config: $REAL_COMMON_DIR/config"
    echo "         Repair by restoring those two values by hand, then re-run."
    exit 1
  fi
}

# The repository must also be in a SANE state to begin with — an already-corrupt
# config would make every "unchanged" check above pass while every git command in
# the repo fails.
echo "=== P1131 canary: the banned-git canary must ignore the caller's git env ==="
echo "    canary under test : $CANARY"
if [ "$BARE_BEFORE" = "true" ] || [ -n "$WORKTREE_BEFORE" ]; then
  echo ""
  echo "  ABORT  this repository's shared git config is already corrupt:"
  echo "         core.bare='$BARE_BEFORE'  core.worktree='$WORKTREE_BEFORE'"
  echo "         (expected core.bare=false and core.worktree unset)"
  echo "         config: $REAL_COMMON_DIR/config"
  exit 1
fi

# --- the decoy repo: a stand-in for "some other repository" -------------------
# Built with a linked worktree so the injected git-dir has the same shape as the
# one git exports to a hook running from .claude/worktrees/wN.
DECOY="$TMPROOT/decoy"
DECOY_WT="$TMPROOT/decoy-worktree"
git_clean init -q "$DECOY" >/dev/null 2>&1
git_clean -C "$DECOY" -c user.email=c@example.invalid -c user.name=canary \
  commit -q --allow-empty -m decoy >/dev/null 2>&1
git_clean -C "$DECOY" worktree add -q "$DECOY_WT" -b decoy-wt >/dev/null 2>&1
DECOY_GIT_DIR="$DECOY/.git/worktrees/decoy-worktree"
if [ ! -d "$DECOY_GIT_DIR" ]; then
  echo "  ABORT  could not build the decoy worktree at $DECOY_GIT_DIR — no scenario below is valid"
  exit 1
fi
DECOY_COMMON_DIR="$DECOY/.git"
decoy_cfg() { git_clean -C "$DECOY" config --get "$1" 2>/dev/null || true; }

echo "    injected GIT_DIR  : $DECOY_GIT_DIR (decoy — never this repository)"
echo ""

# --- 0. the scrub list and the injection list must not drift apart ------------
# If a new repo-scoping variable is added here but not to the canary's scrub, the
# scenarios below catch it. If one is removed from the canary's scrub, only this
# check does.
echo "0. the canary scrubs every variable this file injects"
MISSING=""
for v in "${GIT_SCOPING_VARS[@]}"; do
  grep -q "\"$v\"" "$CANARY" || MISSING="$MISSING $v"
done
if [ -z "$MISSING" ]; then
  ok "all ${#GIT_SCOPING_VARS[@]} scoping vars named in $(basename "$CANARY")"
else
  bad "not scrubbed by the canary:$MISSING — add them to its env-scrub list"
fi

# --- 1. clean environment (how a human runs it) ------------------------------
echo "1. baseline: no git vars set"
run_canary "$CANARY" "$REPO_ROOT" "$TMPROOT/clean.log"
BASE_RC=$RC
BASE_N="$(grep -oE '^[0-9]+ cases checked' "$TMPROOT/clean.log" | grep -oE '^[0-9]+' || echo 0)"
if [ "$BASE_RC" -eq 0 ] && [ "${BASE_N:-0}" -gt 0 ]; then
  ok "clean run passes ($BASE_N cases, exit 0)"
else
  bad "clean run failed (exit $BASE_RC): $(tail -3 "$TMPROOT/clean.log")"
fi
assert_repo_intact "1. baseline"

# --- 2. THE DEFECT: the environment git gives a real pre-commit hook ---------
# GIT_INDEX_FILE is included because git exports it too, and the pre-fix
# measurement in test-block-banned-git.py's own header recorded 75 cases / exit 1
# with both set.
echo "2. the hook environment: absolute GIT_DIR + GIT_INDEX_FILE"
run_canary "$CANARY" "$REPO_ROOT" "$TMPROOT/hookenv.log" \
  "GIT_DIR=$DECOY_GIT_DIR" "GIT_INDEX_FILE=$DECOY_GIT_DIR/index"
HOOK_RC=$RC
HOOK_N="$(grep -oE '^[0-9]+ cases checked' "$TMPROOT/hookenv.log" | grep -oE '^[0-9]+' || echo 0)"
if [ "$HOOK_RC" -ne 0 ]; then
  bad "canary failed under the hook environment (exit $HOOK_RC): $(tail -3 "$TMPROOT/hookenv.log")"
elif grep -q 'FIXTURE BROKEN' "$TMPROOT/hookenv.log"; then
  bad "canary reported FIXTURE BROKEN under the hook environment"
elif [ "${HOOK_N:-0}" != "${BASE_N:-1}" ]; then
  bad "case count changed under the hook environment: $BASE_N clean vs $HOOK_N with git vars — coverage was silently dropped"
else
  ok "same $HOOK_N cases, exit 0 — the injected git env changed nothing"
fi
assert_repo_intact "2. hook environment"

# --- 3. the whole scoping family, not just the two git exports to hooks ------
# GIT_WORK_TREE, GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY and the rest can each
# redirect a child git command at another repo. A scrub covering only GIT_DIR
# would pass scenario 2 and still be incomplete.
echo "3. the full repo-scoping family set at once"
run_canary "$CANARY" "$REPO_ROOT" "$TMPROOT/family.log" \
  "GIT_DIR=$DECOY_GIT_DIR" \
  "GIT_INDEX_FILE=$DECOY_GIT_DIR/index" \
  "GIT_WORK_TREE=$DECOY_WT" \
  "GIT_COMMON_DIR=$DECOY_COMMON_DIR" \
  "GIT_OBJECT_DIRECTORY=$DECOY_COMMON_DIR/objects" \
  "GIT_ALTERNATE_OBJECT_DIRECTORIES=$DECOY_COMMON_DIR/objects" \
  "GIT_NAMESPACE=canary" \
  "GIT_CEILING_DIRECTORIES=$TMPROOT" \
  "GIT_TEMPLATE_DIR=$EMPTY_TEMPLATE" \
  "GIT_PREFIX=scripts/"
FAM_RC=$RC
FAM_N="$(grep -oE '^[0-9]+ cases checked' "$TMPROOT/family.log" | grep -oE '^[0-9]+' || echo 0)"
if [ "$FAM_RC" -eq 0 ] && [ "${FAM_N:-0}" = "${BASE_N:-1}" ]; then
  ok "same $FAM_N cases, exit 0 — the full family is scrubbed"
else
  bad "canary broke under the full family (exit $FAM_RC, $FAM_N cases vs $BASE_N clean): $(tail -3 "$TMPROOT/family.log")"
fi
assert_repo_intact "3. full family"

# --- 4. GATE 7: remove the scrub and require the canary to break --------------
# Without this the green scenarios above prove nothing: they would look identical
# if the scrub were deleted and the variables simply had no effect.
echo "4. gate 7: with the env scrub deleted, the canary must FAIL"
# The copy lives in a scratch tree that mirrors the repo layout, because the
# canary derives ROOT (and from it CLAUDE_PROJECT_DIR for every hook invocation)
# from its own __file__. A copy dropped in a bare temp dir fails for that reason
# alone, which would make scenario 4 pass for the wrong reason.
MIRROR="$TMPROOT/mirror"
mkdir -p "$MIRROR/scripts"
ln -s "$REPO_ROOT/.claude" "$MIRROR/.claude"
UNSCRUBBED="$MIRROR/scripts/unscrubbed.py"
python3 - "$CANARY" "$UNSCRUBBED" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
# The scrub is the for-loop over the git var names followed by os.environ.pop.
pat = re.compile(r'^for _v in \("GIT_DIR".*?os\.environ\.pop\(_v, None\)\n',
                 re.S | re.M)
out, n = pat.subn('', src)
if n != 1:
    sys.stderr.write('MUTATION FAILED: expected exactly 1 scrub block, found %d\n' % n)
    sys.exit(2)
open(sys.argv[2], 'w').write(out)
PY
MUT_RC=$?
if [ "$MUT_RC" -ne 0 ]; then
  bad "could not remove the env scrub from the canary — the mutation anchor no longer matches, so this proof did not run"
else
  # Sanity: the mutated copy must still be green with a CLEAN environment,
  # otherwise scenario 4 would 'pass' for the wrong reason (a broken mutation).
  run_canary "$UNSCRUBBED" "$REPO_ROOT" "$TMPROOT/unscrubbed-clean.log"
  if [ "$RC" -ne 0 ]; then
    bad "the unscrubbed copy fails even with a clean env — the mutation broke it, so the proof below is meaningless"
  else
    ok "unscrubbed copy is still green with a clean env (control)"
    DECOY_BARE_BEFORE="$(decoy_cfg core.bare)"
    run_canary "$UNSCRUBBED" "$REPO_ROOT" "$TMPROOT/unscrubbed-hookenv.log" \
      "GIT_DIR=$DECOY_GIT_DIR" "GIT_INDEX_FILE=$DECOY_GIT_DIR/index"
    # Any nonzero exit here is the leak, but the SIGNATURE varies with where the
    # inherited GIT_DIR lands first: the sequencer probe reports FIXTURE BROKEN,
    # while an earlier `git init` against the outer repo can fail outright. An
    # assertion pinned to one string would call the other a broken mutation.
    if [ "$RC" -eq 0 ]; then
      bad "unscrubbed copy did NOT fail under the hook env (exit 0) — this test cannot detect the regression it exists for; log: $(tail -3 "$TMPROOT/unscrubbed-hookenv.log")"
    elif grep -q 'FIXTURE BROKEN' "$TMPROOT/unscrubbed-hookenv.log"; then
      ok "unscrubbed copy fails with FIXTURE BROKEN under the hook env (exit $RC) — the scrub is load-bearing"
    else
      ok "unscrubbed copy fails under the hook env (exit $RC, no FIXTURE BROKEN line) — the scrub is load-bearing; first error: $(grep -m1 -iE 'error|fatal|fail' "$TMPROOT/unscrubbed-hookenv.log" | head -c 160)"
    fi
    # The leak is only proven to REACH a repository if the decoy's own config
    # moved. This is the 2026-09-09 corruption, reproduced somewhere harmless.
    DECOY_BARE_AFTER="$(decoy_cfg core.bare)"
    if [ "$DECOY_BARE_AFTER" != "$DECOY_BARE_BEFORE" ]; then
      ok "the leak reached the decoy repo: its core.bare went '$DECOY_BARE_BEFORE' -> '$DECOY_BARE_AFTER' (this is the incident, contained)"
    else
      echo "  note the decoy's core.bare did not move ('$DECOY_BARE_BEFORE') — the run failed before \`git init\` wrote config"
    fi
  fi
fi
assert_repo_intact "4. gate-7 mutation (the destructive one)"

# --- 5. the relative GIT_DIR that made main pass by coincidence --------------
# Not a regression risk, pinned so the accident is not mistaken for the fix. Run
# from a scratch cwd: a relative GIT_DIR resolves against the subprocess's cwd,
# so running this from REPO_ROOT would aim it at this repository if the scrub
# ever regressed.
echo "5. relative GIT_DIR (the main-checkout case) also passes"
RELCWD="$TMPROOT/relcwd"
mkdir -p "$RELCWD"
run_canary "$CANARY" "$RELCWD" "$TMPROOT/relative.log" "GIT_DIR=.git"
REL_N="$(grep -oE '^[0-9]+ cases checked' "$TMPROOT/relative.log" | grep -oE '^[0-9]+' || echo 0)"
if [ "$RC" -eq 0 ] && [ "${REL_N:-0}" = "${BASE_N:-1}" ]; then
  ok "relative GIT_DIR passes with the same $REL_N cases"
else
  bad "relative GIT_DIR run differs (exit $RC, $REL_N cases vs $BASE_N)"
fi
assert_repo_intact "5. relative GIT_DIR"

# --- 6. the invariant this whole file exists to protect ----------------------
# Stated as its own scenario so the summary line says it was checked, not merely
# that nothing aborted. assert_repo_intact ran after every scenario above.
echo "6. this repository's shared git config is untouched"
BARE_AFTER="$(real_cfg core.bare)"
WORKTREE_AFTER="$(real_cfg core.worktree)"
if [ "$BARE_AFTER" = "$BARE_BEFORE" ] && [ "$WORKTREE_AFTER" = "$WORKTREE_BEFORE" ]; then
  ok "core.bare='$BARE_AFTER' and core.worktree='$WORKTREE_AFTER' unchanged across all 5 scenarios"
else
  bad "the real repository was modified: core.bare '$BARE_BEFORE'->'$BARE_AFTER', core.worktree '$WORKTREE_BEFORE'->'$WORKTREE_AFTER'"
fi

echo ""
echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
