#!/bin/bash
# Canary: the push/deploy paths must promote a PINNED snapshot SHA, never the live
# branch `main`.
#
# Why this exists — the defect it locks down (2026-09-04):
#   cmd_push_docs resolved "what is main right now" at five separate points spread
#   across a 15-20 minute run: the ahead-count, the staging branch NAME, the staging
#   PUSH (`main:refs/heads/...`), and the promote (`push origin main`). On the shared
#   main checkout the measured median gap between watched-path commits is ~16 min
#   (230 such commits in the 270-commit backlog, 95% within 15 min of the previous),
#   so those reads routinely disagreed. Observable failure: the CI poll waits on
#   head_sha == local_sha, the staging branch was pushed at a DIFFERENT sha, the poll
#   can never match, MAX_WAIT burns and the run dies leaking a staging branch.
#   pp/docs/decisions.md 2026-08-28 recorded the fix ("Push the SHA that CI actually
#   scanned, never local HEAD") and it was never implemented here.
#
# COVERAGE — read this before trusting a green run (epistemic.md 7b):
#   Test 1 and Test 2 are hermetic and empirical (throwaway bare repo, no network).
#   Test 3 is a static regression guard over git-ops.sh.
#   NOT COVERED HERE, and deliberately not faked:
#     - the Step-0 retreat-to-stamp branch (needs a real run)
#     - --resume (defined by GitHub push-event semantics: privacy-scan.yml turns
#       BEFORE=0000 into a full origin/main..AFTER scan; a local fixture cannot
#       emit a push event or register a check-run)
#     - the audit-privacy CI poll (git-ops.sh hard-fails without real `gh auth`)
#   Those three are verified MANUALLY, on origin, by running a real /push. Anyone
#   claiming this canary covers them is wrong.
#
# Run standalone:  bash scripts/test-push-snapshot-pinning.sh
# Runs automatically from pre-commit-checks.sh whenever scripts/git-ops.sh or this
# file is staged. Exits non-zero on any failure — proven red against the pre-fix code
# and against mutants of each individual guard (2026-09-04).
set -uo pipefail

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

# ── Fixture: a bare "origin" plus a working clone, instrumented pre-push hook ──
git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
cd "$T/work"
git config user.email canary@test; git config user.name canary
echo one > f; git add f; git commit -qm c1
git branch -M main
git -c core.hooksPath=/dev/null push -q origin main

cat > "$T/work/.git/hooks/pre-push" <<'HOOK'
#!/bin/bash
while read -r local_ref local_sha remote_ref remote_sha; do
  echo "$local_ref|$local_sha|$remote_ref|$remote_sha" >> "$HOOKLOG"
done
exit 0
HOOK
chmod +x "$T/work/.git/hooks/pre-push"

echo "── Test 1: the pre-push gate still fires on a SHA refspec ──"
# pre-push-checks.sh gates every layer on remote_ref == refs/heads/main (:88, :213)
# and never uses local_ref (read at :57/:87/:212, unused). If a SHA source ref
# changed remote_ref, the privacy gate would silently stop firing — that would trade
# a broken push for a bypassed gate, which is strictly worse than the bug we fixed.
echo two > f2; git add f2; git commit -qm c2
SNAP="$(git rev-parse HEAD)"

export HOOKLOG="$T/log-branch"; : > "$HOOKLOG"
git push -q origin main 2>/dev/null
BRANCH_FORM="$(cat "$HOOKLOG")"

git -c core.hooksPath=/dev/null push -q origin ":refs/heads/main" 2>/dev/null || true
git -c core.hooksPath=/dev/null push -q origin "$(git rev-parse HEAD~1):refs/heads/main" --force 2>/dev/null

export HOOKLOG="$T/log-sha"; : > "$HOOKLOG"
git push -q origin "${SNAP}:refs/heads/main" 2>/dev/null
SHA_FORM="$(cat "$HOOKLOG")"

BRANCH_REMOTE_REF="$(cut -d'|' -f3 <<< "$BRANCH_FORM")"
SHA_REMOTE_REF="$(cut -d'|' -f3 <<< "$SHA_FORM")"
SHA_LOCAL_SHA="$(cut -d'|' -f2 <<< "$SHA_FORM")"

[[ "$BRANCH_REMOTE_REF" == "refs/heads/main" ]] \
  && ok "branch form yields remote_ref=refs/heads/main (control)" \
  || bad "branch form yielded remote_ref='$BRANCH_REMOTE_REF' — fixture is broken, not the code"

[[ "$SHA_REMOTE_REF" == "refs/heads/main" ]] \
  && ok "SHA form ALSO yields remote_ref=refs/heads/main — all 3 gate layers still fire" \
  || bad "SHA form yielded remote_ref='$SHA_REMOTE_REF' — THE PRIVACY GATE WOULD BE SKIPPED"

[[ "$SHA_LOCAL_SHA" == "$SNAP" ]] \
  && ok "SHA form reports the pinned snapshot as local_sha (range is computed from it)" \
  || bad "SHA form local_sha='$SHA_LOCAL_SHA' != snapshot '$SNAP'"

echo "── Test 2: a commit landing mid-run does not ride the push (RED/GREEN pair) ──"
# The whole point of the change. Snapshot is taken, THEN a co-tenant commits, THEN
# we promote. The pinned form must ship the snapshot; the old form must ship HEAD.
git -c core.hooksPath=/dev/null push -q origin "${SNAP}:refs/heads/main" --force 2>/dev/null
SNAP2="$(git rev-parse HEAD)"          # snapshot taken here
echo cotenant > f3; git add f3; git commit -qm "co-tenant commit during the run"
HEAD_AFTER="$(git rev-parse HEAD)"

[[ "$SNAP2" != "$HEAD_AFTER" ]] || { bad "fixture: HEAD did not move"; }

# RED control — the OLD behaviour. Must ship the co-tenant commit.
git -c core.hooksPath=/dev/null push -q origin main --force 2>/dev/null
OLD_TIP="$(git -C "$T/origin.git" rev-parse refs/heads/main)"
[[ "$OLD_TIP" == "$HEAD_AFTER" ]] \
  && ok "RED control: unpinned push origin main DOES ship the co-tenant commit (bug reproduced)" \
  || bad "RED control did not reproduce the bug — the canary proves nothing"

# GREEN — the new behaviour. Must ship only the snapshot.
git -c core.hooksPath=/dev/null push -q origin "${SNAP2}:refs/heads/main" --force 2>/dev/null
NEW_TIP="$(git -C "$T/origin.git" rev-parse refs/heads/main)"
[[ "$NEW_TIP" == "$SNAP2" ]] \
  && ok "GREEN: pinned promote ships exactly the snapshot, co-tenant commit stays local" \
  || bad "pinned promote shipped '$NEW_TIP', expected snapshot '$SNAP2'"

echo "── Test 3: no unpinned promote or staging push survives in git-ops.sh ──"
G="$REPO_ROOT/scripts/git-ops.sh"
if [[ ! -f "$G" ]]; then
  bad "git-ops.sh not found at $G"
else
  # Enumerate EXECUTABLE `git … push origin …` lines and require every one that can
  # write a remote branch to name the pinned snapshot. An earlier version of this
  # check pattern-matched three literal spellings (`push origin main$`, `…main;`,
  # `…main "`) and would have waved through `push origin main --force`,
  # `push origin HEAD:refs/heads/main`, and `push origin main:refs/heads/main` — all
  # real unpinned promotes. Enumerate-and-require, never blacklist-known-spellings.
  #
  # Allowed remote-writing forms: a pinned refspec `${local_sha}:refs/heads/…`,
  # a `--delete` cleanup, or a push to a staging branch pinned the same way.
  UNPINNED="$(
    awk '
      { line = $0
        sub(/^[[:space:]]+/, "", line)
        if (line ~ /^#/) next                      # whole-line comment
        # Guidance text: only when the line STARTS with echo/printf/cat. Matching the
        # substring anywhere was a false pass — `push origin main && echo "done"` was
        # skipped, and that is one refactor away from the real code, which today is a
        # pinned push on one line and an `echo "✅ Pushed to main."` on the next.
        if (line ~ /^(echo|printf|cat)[[:space:]]/) next
        if (line !~ /(^|[^A-Za-z_-])push[[:space:]]/) next   # not a push at all
        if ($0 ~ /--delete/) next                  # branch cleanup, writes no content
        # A push whose REMOTE is a variable hides the target from this check entirely,
        # so it is a finding, not a skip.
        if ($0 ~ /push[[:space:]]+"?\$/) { printf "%d: [non-literal remote] %s\n", NR, line; next }
        if ($0 !~ /push[[:space:]]+origin/) next   # some other remote-less push form
        if ($0 ~ /\$\{local_sha\}:refs\/heads\//) next # pinned: OK
        if ($0 ~ /\$\{snap\}:refs\/heads\//) next  # pinned (print_staging_hop heredoc): OK
        printf "%d: %s\n", NR, line
      }' "$G" || true
  )"
  [[ -z "$UNPINNED" ]] \
    && ok "every executable remote-writing push names the pinned snapshot" \
    || bad "unpinned push(es) still present:"$'\n'"$UNPINNED"

  # The heredoc guidance humans copy/paste must be pinned too — a session followed
  # that text literally on 2026-09-04 and ran an unpinned, unlocked promote.
  HOP_UNPINNED="$(awk '/^print_staging_hop\(\)/,/^}/' "$G" | grep -n 'push origin main\b' || true)"
  [[ -z "$HOP_UNPINNED" ]] \
    && ok "print_staging_hop guidance is pinned (humans copy this text verbatim)" \
    || bad "print_staging_hop still tells a human to push the bare branch:"$'\n'"$HOP_UNPINNED"

  # The snapshot arg must be REQUIRED and every caller must pass it. A `${2:-…HEAD}`
  # default is the trap: two of the three callers run immediately after
  # release_main_lock, so the fallback resolves HEAD unlocked and prints a SHA the
  # caller never verified — silently undoing the pinning for exactly those paths.
  # `${2:-}` (the emptiness guard) is correct; `${2:-<anything>}` is the trap. Match
  # only a NON-EMPTY default — an earlier version of this check flagged the guard.
  # Comment lines are excluded: the function's own comment quotes the forbidden
  # `${2:-$(git rev-parse HEAD)}` shape to explain why it is banned, and an earlier
  # version of this check flagged that explanation as the violation.
  if awk '/^print_staging_hop\(\)/,/^}/' "$G" \
     | sed 's/^[[:space:]]*#.*//' | grep -q '\${2:-[^}]'; then
    bad "print_staging_hop has a \${2:-…} default — it must require the snapshot arg"
  else
    ok "print_staging_hop requires its snapshot arg (no HEAD fallback)"
  fi
  HOP_CALLS_1ARG="$(grep -n 'print_staging_hop[[:space:]]' "$G" \
    | grep -v '^\s*[0-9]*:\s*#' \
    | awk -F'print_staging_hop' '{ n=split($2, a, "\""); if (n < 5) print }' || true)"
  [[ -z "$HOP_CALLS_1ARG" ]] \
    && ok "every print_staging_hop caller passes a snapshot SHA" \
    || bad "print_staging_hop caller(s) missing the snapshot arg:"$'\n'"$HOP_CALLS_1ARG"

  # The branch NAME must derive from the snapshot, not a fresh HEAD read — otherwise
  # --resume cannot find the branch a prior aborted run left behind.
  if grep -q 'short_sha="$(git -C "$REPO_ROOT" rev-parse --short "$local_sha")"' "$G"; then
    ok "staging branch name derives from the pinned snapshot"
  else
    bad "staging branch name is not derived from \$local_sha — --resume will miss the leftover branch"
  fi
fi

echo "── Test 6: the CI freshness baseline is stamped BEFORE the staging push ──"
# The guard rejects a check-run whose started_at pre-dates PUSH_EPOCH. GitHub starts
# the workflow when the ref lands — DURING the push — so a baseline stamped after the
# push returns is later than our own run's started_at, and the poll rejects its own
# scan, waits for a run that will never be created, and dies at MAX_WAIT with CI
# green. Observed 2026-09-04: audit-privacy SUCCESS at 09:47:53 on the pinned
# snapshot, run failed anyway, origin/main unmoved. Ordering is the whole fix, and
# ordering is invisible to every other check here.
for fn in cmd_push_docs cmd_ship_to_prod; do
  BODY="$(awk -v f="^${fn}\\\\(\\\\)" '$0 ~ f {n=NR} n && NR>=n {print NR": "$0}' "$G" \
          | awk '/^[0-9]+: }$/{print; exit} {print}')"
  EPOCH_LN="$(echo "$BODY" | grep -n 'PUSH_EPOCH="\$(date' | head -1 | cut -d: -f1)"
  PUSH_LN="$(echo "$BODY" | grep -n 'push origin "\${local_sha}:refs/heads/\${staging_branch}"' | head -1 | cut -d: -f1)"
  if [[ -z "$EPOCH_LN" || -z "$PUSH_LN" ]]; then
    bad "$fn: could not locate PUSH_EPOCH (${EPOCH_LN:-missing}) or the staging push (${PUSH_LN:-missing})"
  elif (( EPOCH_LN < PUSH_LN )); then
    ok "$fn: PUSH_EPOCH is stamped before the staging push"
  else
    bad "$fn: PUSH_EPOCH is stamped AFTER the staging push — the poll will reject its own green scan"
  fi
done

echo "── Test 4: the Step-0 retreat block, extracted verbatim and run under set -euo pipefail ──"
# Runs the REAL block from git-ops.sh (between the STEP0-RETREAT markers), not a copy.
# This is the only automated coverage of the retreat; the first hostile review called
# it untestable, which was true only for the CI/--resume legs, not for this logic.
BLOCK="$T/step0.sh"
if ! awk '/--8<-- STEP0-RETREAT-BEGIN/{f=1;next} /--8<-- STEP0-RETREAT-END/{f=0} f' \
     "$REPO_ROOT/scripts/git-ops.sh" > "$BLOCK" || [[ ! -s "$BLOCK" ]]; then
  bad "could not extract the STEP0-RETREAT block from git-ops.sh (markers missing?)"
else
  # `local` is illegal outside a function. Two shapes to handle, and getting this
  # wrong is silent: a BARE declaration (`local git_common`) must be DELETED, because
  # stripping the keyword leaves `git_common` — a command, exit 127, and with the
  # source's stderr discarded the block simply does nothing while the test reads it
  # as "no retreat". An assignment (`local x=…`) just loses the keyword.
  # NOTE the multi-name form (`local a b`): stripping the keyword leaves `a b`, a
  # command, exit 127 — and since four of the six cases below EXPECT no retreat, a
  # block that never ran reads as green. Delete any bare declaration of one OR MORE
  # names; strip the keyword only from assignments.
  sed -e '/^[[:space:]]*local[[:space:]]\{1,\}[A-Za-z_][A-Za-z0-9_]*\([[:space:]]\{1,\}[A-Za-z_][A-Za-z0-9_]*\)*[[:space:]]*$/d' \
      -e 's/^\([[:space:]]*\)local /\1/' "$BLOCK" > "$BLOCK.tmp" && mv "$BLOCK.tmp" "$BLOCK"

  export REPO_ROOT_REAL="$REPO_ROOT"   # REPO_ROOT is reassigned to the fixture below
  run_step0() {   # $1 = fixture repo, $2 = stamp content ("" = no stamp file)
    local repo="$1" stamp="$2"
    ( set -euo pipefail
      REPO_ROOT="$repo"
      # Sourced from git-ops.sh, NOT restated. The retreat's whole decision turns on
      # WATCHED_PATHS, so a hardcoded copy here means editing the real list (8 entries
      # at git-ops.sh:61) could never fail this canary — the duplication would make
      # the test blind to the one variable it exists to exercise.
      eval "$(grep -m1 '^WATCHED_PATHS=' "$REPO_ROOT_REAL/scripts/git-ops.sh")"
      [[ -n "${WATCHED_PATHS:-}" ]] || { echo "WATCHED_PATHS not sourced" >&2; exit 3; }
      cd "$repo"
      if [[ -n "$stamp" ]]; then printf '%s\n' "$stamp" > "$repo/.git/.privacy-reviewed"
      else rm -f "$repo/.git/.privacy-reviewed"; fi
      local_sha="$(git rev-parse HEAD)"
      origin_main_sha="$(git rev-parse refs/remotes/origin/main 2>/dev/null || echo '')"
      # stderr goes to a log, NOT /dev/null: discarding it is what let the extraction
      # bug above masquerade as "no retreat" instead of "the block never ran".
      # shellcheck disable=SC1090
      source "$BLOCK" >/dev/null 2>>"$T/step0.err"
      printf '%s' "$local_sha"
    )
  }

  # Fixture: origin/main = BASE, then TWO watched commits, then an unwatched one.
  # Two watched commits are required, not one: with a single one the only stamp that
  # is "behind HEAD with a watched commit after it" is BASE itself, which the
  # equal-to-origin/main guard correctly refuses — so a one-commit fixture cannot
  # reach the retreat path at all and silently tests nothing.
  F="$T/fx"; git init -q "$F"; cd "$F"
  git config user.email c@t; git config user.name c
  mkdir -p docs; echo base > base.txt; git add base.txt; git commit -qm base
  BASE="$(git rev-parse HEAD)"
  git update-ref refs/remotes/origin/main "$BASE"
  echo d1 > docs/d1.md; git add docs/d1.md; git commit -qm "watched commit 1"
  WATCHED1="$(git rev-parse HEAD)"
  echo d2 > docs/d2.md; git add docs/d2.md; git commit -qm "watched commit 2"
  WATCHED2="$(git rev-parse HEAD)"
  echo s1 > src.txt; git add src.txt; git commit -qm "unwatched commit"
  TIP="$(git rev-parse HEAD)"

  r="$(run_step0 "$F" "" ; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "no stamp file: no retreat, exit 0 (fresh clone / worktree / src-only push)" \
    || bad "no stamp file: got '$r', expected '${TIP}rc=0'"

  r="$(run_step0 "$F" "$TIP"; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "stamp == HEAD: no retreat (the normal clean run is unchanged)" \
    || bad "stamp == HEAD: got '$r', expected '${TIP}rc=0'"

  r="$(run_step0 "$F" "$WATCHED2"; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "stamp behind HEAD but only UNWATCHED commits after it: no retreat (nothing to defer)" \
    || bad "stamp behind HEAD, unwatched-only: got '$r', expected '${TIP}rc=0' (no retreat)"

  r="$(run_step0 "$F" "$WATCHED1"; echo "rc=$?")"
  [[ "$r" == "${WATCHED1}rc=0" ]] \
    && ok "stamp behind HEAD with a WATCHED commit after it: retreats to the stamp (THE FIX)" \
    || bad "stamp behind HEAD, watched: got '$r', expected '${WATCHED1}rc=0'"

  r="$(run_step0 "$F" "$BASE"; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "stamp == origin/main: no retreat (retreating there would push nothing)" \
    || bad "stamp == origin/main: got '$r', expected '${TIP}rc=0'"

  r="$(run_step0 "$F" "not-a-sha"; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "garbage stamp: no retreat, no crash (fails closed to HEAD)" \
    || bad "garbage stamp: got '$r', expected '${TIP}rc=0'"

  r="$(run_step0 "$F" "$(printf '%040d' 0)"; echo "rc=$?")"
  [[ "$r" == "${TIP}rc=0" ]] \
    && ok "well-formed but nonexistent stamp SHA: no retreat, no crash" \
    || bad "nonexistent stamp SHA: got '$r', expected '${TIP}rc=0'"

  # The stderr log must be READ, not merely written. Four of the six cases above
  # expect "no retreat", so a block that failed to execute at all (a bad `local`
  # strip -> `command not found`) produces exactly the expected value and passes.
  # Without this assertion the extraction can silently stop testing anything.
  STEP0_ERRS="$(grep -Ei 'command not found|unbound variable|syntax error|No such file or directory' "$T/step0.err" 2>/dev/null || true)"
  [[ -z "$STEP0_ERRS" ]] \
    && ok "extracted block executed cleanly (no shell errors on stderr across all 6 cases)" \
    || bad "the extracted block errored — the 'no retreat' passes above are meaningless:"$'\n'"$STEP0_ERRS"

  cd "$T/work"
fi

echo "── Test 5: --resume REPLAYS the recorded snapshot instead of re-deriving it ──"
# The defect this guards: the Step-0 retreat depends on the privacy stamp, and the
# stamp moves whenever /maintain:privacy runs. A resume that recomputed the snapshot
# produced a different staging branch name, ls-remote missed the branch the aborted
# run had actually left on origin, and the run died "no staging branch — drop
# --resume" while orphaning that branch permanently. Only the file/variable contract
# is testable locally; the CI leg still is not (see the header).
RBLOCK="$T/resume.sh"
if ! awk '/--8<-- RESUME-REPLAY-BEGIN/{f=1;next} /--8<-- RESUME-REPLAY-END/{f=0} f' \
     "$REPO_ROOT/scripts/git-ops.sh" > "$RBLOCK" || [[ ! -s "$RBLOCK" ]]; then
  bad "could not extract the RESUME-REPLAY block from git-ops.sh (markers missing?)"
else
  sed -e '/^[[:space:]]*local[[:space:]]\{1,\}[A-Za-z_][A-Za-z0-9_]*\([[:space:]]\{1,\}[A-Za-z_][A-Za-z0-9_]*\)*[[:space:]]*$/d' \
      -e 's/^\([[:space:]]*\)local /\1/' "$RBLOCK" > "$RBLOCK.tmp" && mv "$RBLOCK.tmp" "$RBLOCK"

  run_resume() {  # $1 = state file content ("" = no file); echoes "<sha> <branch>"
    ( set -uo pipefail
      die() { echo "DIED: $*" >&2; exit 9; }
      REPO_ROOT="$F"; cd "$F"
      resume=1
      resume_state="$T/state"
      if [[ -n "$1" ]]; then printf '%s\n' "$1" > "$resume_state"; else rm -f "$resume_state"; fi
      local_sha="$(git rev-parse HEAD)"     # the value a re-derive would produce
      resumed_branch=""
      # shellcheck disable=SC1090
      source "$RBLOCK" 2>>"$T/resume.err"
      printf '%s %s' "$local_sha" "$resumed_branch"
    )
  }

  OLDSNAP="$WATCHED1"; OLDBRANCH="staging/doc-deadbeef"
  r="$(run_resume "$OLDSNAP $OLDBRANCH"; echo " rc=$?")"
  [[ "$r" == "$OLDSNAP $OLDBRANCH rc=0" ]] \
    && ok "replays the RECORDED snapshot + branch, not the current HEAD (THE FIX)" \
    || bad "resume replay: got '$r', expected '$OLDSNAP $OLDBRANCH rc=0'"

  r="$(run_resume ""; echo "rc=$?")"
  [[ "$r" == *"rc=9" ]] \
    && ok "no run state: dies with a clear message rather than inventing a snapshot" \
    || bad "resume with no state: got '$r', expected a die (rc=9)"

  r="$(run_resume "not-a-sha somebranch"; echo "rc=$?")"
  [[ "$r" == *"rc=9" ]] \
    && ok "malformed run state: dies (fails closed)" \
    || bad "resume with malformed state: got '$r', expected a die (rc=9)"

  r="$(run_resume "$(printf '%040d' 0) somebranch"; echo "rc=$?")"
  [[ "$r" == *"rc=9" ]] \
    && ok "run state naming a SHA this repo does not have: dies (fails closed)" \
    || bad "resume with unknown SHA: got '$r', expected a die (rc=9)"
fi

echo
echo "── ${PASS} passed, ${FAIL} failed ──"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
