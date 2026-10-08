#!/usr/bin/env bash
# test-p1444-closure-gate.sh — red/green canary for P1444: administrative closure
# (R1) and the one-click keychain override (R2).
#
# Every refusal is asserted with its exit code, and every refusal sits beside a
# legitimate case that must PASS (epistemic.md gates 7 and 7c): a gate with only
# reject cases has an unmeasured false-positive rate.
#
# Done-When mapping (features/p1444_*.md):
#   1. comment spec, no branch, closes with both SKIP lines, no founder input ... L1 (+ L1b withdrawn, L1c retracted)
#   2. same spec + a feature/pN-* branch with a code commit ahead refuses ........ L2 local, L2b remote-only, L2c fix/ at main's tip
#   3. relabel to type: comment within the closing range refuses ............... L3 committed, L3b uncommitted, L3c never pushed, L3d env knob
#   4. closing commit touching any other path refuses ........................... L4 local (staged stray), C3 CI (committed stray)
#   5. real spec on a red gate refuses without approval, and when declined ...... R1 no override, D2 declined, E2 declined end-to-end
#   6. defeated or indeterminate access list refuses ............................ D3-D7, E3, E4
#   7. refusal text names the one-click path, no "run this in your Terminal" .... R1
#   8. closure-gate.yml re-derives the administrative close from blobs ......... C1-C8 (the workflow's own run: blocks, executed)
# Plus: L5 a spec recording its own dev run is not administrative; L6 the
# under-lock re-check catches a branch that appears after the pre-lock check;
# D8/E5 no environment variable can inject an approver.
#
# HOW THE KEYCHAIN IS KEPT OUT. Nothing in this file can reach the real login
# keychain: the decision cases (D*) source gate-override.sh and REDEFINE its two
# reader functions inside the harness; the end-to-end cases (E*) run in scratch
# repos whose scripts/lib/keychain.py is a FAKE written below that never loads the
# Security framework; every other scratch repo has no keychain.py at all, so its
# approval fails closed before any dialog could exist. Production code carries no
# switch for any of this.
#
# Hermetic: scratch repos + bare "origin" remotes under mktemp; no network.

set -uo pipefail

unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

W="$(git rev-parse --show-toplevel)"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
WF="$W/.github/workflows/closure-gate.yml"
SPRINT=features/done/2026-10-08

FAILURES=0; SKIPS=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }
skip() { echo "SKIP: $*"; SKIPS=$((SKIPS + 1)); }
show() { sed 's/^/    /' "$1" >&2; }

# ── Fixtures ────────────────────────────────────────────────────────────────
# mk <name> [noadmin] — a main repo with a bare origin, the real closing scripts,
# and NO keychain.py. Prints its path.
mk() {
  local d="$SCRATCH/$1" o="$SCRATCH/$1.git"
  git init -q --bare "$o"
  mkdir -p "$d/scripts/lib" "$d/$SPRINT" "$d/features/uat"
  cp "$W/scripts/git-ops.sh" "$W/scripts/ship-gates.sh" "$d/scripts/"
  cp "$W/scripts/lib/gate-override.sh" "$W/scripts/lib/worktree-changes.sh" "$d/scripts/lib/"
  [[ "${2:-}" == noadmin ]] || cp "$W/scripts/lib/admin-close.sh" "$d/scripts/lib/"
  chmod +x "$d/scripts/git-ops.sh" "$d/scripts/ship-gates.sh"
  : > "$d/$SPRINT/.gitkeep"
  ( cd "$d" && git init -q && git config user.email c@t && git config user.name c \
    && git config commit.gpgsign false && echo seed > README.md && git add -A \
    && git commit -qm seed && git branch -M main && git remote add origin "$o" \
    && git push -q origin main ) >/dev/null 2>&1
  echo "$d"
}

# spec <repo> <pN> <frontmatter lines (\n-escaped)> [box: x or space]
spec() {
  local box="${4:- }"
  printf -- '---\nstatus: backlog\nrank: 1\n%b\n---\n# %s: Demo\n\nBody.\n\n## Done-When\n\n- [%s] the criterion\n' \
    "$3" "$2" "$box" > "$1/features/$2_demo.md"
}
# commit <repo> <msg> [push]  — commits everything under features/ (and any extra
# tracked edits), optionally pushes main to origin.
commit() {
  ( cd "$1" && git add -- features && git commit -qm "$2" ) >/dev/null 2>&1
  [[ "${3:-}" == push ]] && ( cd "$1" && git push -q origin main ) >/dev/null 2>&1
  return 0
}
head_of() { git -C "$1" rev-parse main; }
closed() { ls "$1"/features/done/*/"$2"_demo.md >/dev/null 2>&1; }
# Every ship transcript is also appended to all-ship.log for the shell-safety
# invariant at the end (shell-safety.md: no > < | in git-ops status lines).
keep() { cat "$1" >> "$SCRATCH/all-ship.log"; }
ship() {
  local d="$1" rc=0; shift
  ( cd "$d" && bash scripts/git-ops.sh ship "$@" </dev/null ) >"$SCRATCH/ship.log" 2>&1 || rc=$?
  keep "$SCRATCH/ship.log"; return $rc
}

# ════════════════════════════════════════════════════════════════════════════
# R1 — administrative closure, through git-ops.sh ship
# ════════════════════════════════════════════════════════════════════════════

# L1 — the P1274 shape: type: comment WITH the retracted tag, pushed, no branch.
# Qualifies through the tag (founder decision 2026-10-08: the comment label alone does not).
d="$(mk l1)"; spec "$d" p5001 'type: comment\ntags: [security, retracted]\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5001" push
ship "$d" p5001; rc=$?
ns="$(git -C "$d" show --name-status --no-renames --format= HEAD | sort | tr '\t\n' ' ')"
subj="$(git -C "$d" log -1 --format=%s)"
if [[ $rc -eq 0 ]] && closed "$d" p5001 \
   && grep -qx '\[GATE 2.5\] SKIP: administrative closure; no completion asserted' "$SCRATCH/ship.log" \
   && grep -qx '\[GATE 2.7\] SKIP: administrative closure; no implementation review required' "$SCRATCH/ship.log" \
   && [[ "$ns" == "A $SPRINT/p5001_demo.md D features/p5001_demo.md " ]] \
   && [[ "$subj" == "chore: close p5001 (administrative) — "* ]] \
   && ! git -C "$d" log -1 --format=%B | grep -q '^Gate-Override'; then
  pass "L1: a pushed retracted spec with no branch closes (exit 0): both SKIP lines, no stamp, no review, no override, stdin closed, commit = exactly the move"
else
  fail "L1: administrative close did not complete as specified (exit $rc; paths: $ns; subject: $subj)"; show "$SCRATCH/ship.log"
fi
L1_REPO="$d"

d="$(mk l1b)"; spec "$d" p5002 "type: task\nwithdrawn: '2026-10-01: superseded by p5003'\npipeline_ran: [create-spec]"
commit "$d" "docs: add p5002" push
ship "$d" p5002; rc=$?
if [[ $rc -eq 0 ]] && closed "$d" p5002 && grep -q 'ELIGIBLE: p5002' "$SCRATCH/ship.log"; then
  pass "L1b: a withdrawn spec (dated withdrawn: field, unticked box) closes administratively (exit 0)"
else
  fail "L1b: withdrawn spec did not close (exit $rc)"; show "$SCRATCH/ship.log"
fi

d="$(mk l1c)"; spec "$d" p5004 'type: task\ntags: [retracted]\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5004" push
ship "$d" p5004; rc=$?
if [[ $rc -eq 0 ]] && closed "$d" p5004; then
  pass "L1c: the legacy retracted tag closes administratively (exit 0)"
else
  fail "L1c: retracted-tag spec did not close (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L1d — founder decision 2026-10-08: `type: comment` ALONE no longer qualifies.
d="$(mk l1d)"; spec "$d" p5003 'type: comment\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5003" push
h0="$(head_of "$d")"; ship "$d" p5003; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5003 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'type: comment alone does not qualify' "$SCRATCH/ship.log"; then
  pass "L1d: a type: comment spec with no withdrawn/retracted marker is refused (exit $rc) and the gate says why"
else
  fail "L1d: a comment-only spec closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

# Negative control for the whole arm: a REAL spec in the same position (pushed,
# no branch, no stamp, no review) must still be refused — the arm must not have
# loosened the gates for specs it does not cover.
d="$(mk l1n)"; spec "$d" p5005 'type: task\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5005" push
h0="$(head_of "$d")"; ship "$d" p5005; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5005 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q '\[GATE 2.5\] FAIL' "$SCRATCH/ship.log" && ! grep -q 'GATE ADMIN' "$SCRATCH/ship.log"; then
  pass "L1n: a real task spec in the same position is still refused by gate 2.5 (exit $rc), and the arm stays silent"
else
  fail "L1n: a real spec was not refused, or the admin arm spoke for it (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L2 — a local feature branch carrying a code commit ahead of main.
d="$(mk l2)"; spec "$d" p5010 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5010" push
( cd "$d" && git checkout -q -b feature/p5010-sneak && echo code > src.ts && git add src.ts \
  && git commit -qm "p5010: code" && git checkout -q main ) >/dev/null 2>&1
h0="$(head_of "$d")"; ship "$d" p5010; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5010 && [[ "$(head_of "$d")" == "$h0" ]] \
   && ! ls "$d"/.claude/worktrees/.ship-journal/*.json >/dev/null 2>&1; then
  pass "L2: a comment spec with a local feature branch carrying code is refused (exit $rc); main unchanged, no journal left"
else
  fail "L2: comment spec with a code branch was not refused cleanly (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L2b — the branch exists only on the REMOTE, so git-ops takes the no-branch
# route and only the administrative check's ref scan can see it.
d="$(mk l2b)"; spec "$d" p5011 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5011" push
( cd "$d" && git checkout -q -b feature/p5011-sneak && echo code > src.ts && git add src.ts \
  && git commit -qm "p5011: code" && git push -q origin feature/p5011-sneak && git checkout -q main \
  && git branch -q -D feature/p5011-sneak && git fetch -q origin ) >/dev/null 2>&1
h0="$(head_of "$d")"; ship "$d" p5011; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5011 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'NOT ELIGIBLE: a branch for p5011 is ahead of main: remotes/origin/feature/p5011-sneak' "$SCRATCH/ship.log"; then
  pass "L2b: a REMOTE-only feature branch ahead of main is seen and refused (exit $rc), naming the ref"
else
  fail "L2b: remote-only branch was not refused (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L2c — defence in depth on the BRANCH route. ship-gates and git-ops resolve
# branches the same way today, so an administrative verdict cannot currently reach
# the branch route (an empty fix/ branch dies earlier: "nothing to ship"). The
# guard exists for the day they diverge; to watch it FIRE (gate 7) this scratch
# repo's ship-gates.sh is a stub that claims ELIGIBLE for a spec with a real fix/
# branch carrying code.
d="$(mk l2c)"; spec "$d" p5012 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5012" push
( cd "$d" && git checkout -q -b fix/p5012-x && echo code > src.ts && git add src.ts \
  && git commit -qm "p5012: code" && git checkout -q main ) >/dev/null 2>&1
printf '#!/usr/bin/env bash\necho "[GATE ADMIN] ELIGIBLE: p5012"\nexit 0\n' > "$d/scripts/ship-gates.sh"
h0="$(head_of "$d")"; ship "$d" p5012; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5012 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'refusing on the branch route' "$SCRATCH/ship.log" \
   && ! ls "$d"/.claude/worktrees/.ship-journal/*.json >/dev/null 2>&1; then
  pass "L2c: an administrative verdict reaching the branch route is refused (exit $rc), journal removed, nothing picked"
else
  fail "L2c: branch route accepted an administrative verdict (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L3 — relabel inside the closing range: a REAL spec (unticked box) on origin/main,
# relabelled type: comment in a local, unpushed commit, then closed.
d="$(mk l3)"; spec "$d" p5020 'type: task\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5020" push
spec "$d" p5020 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: p5020 is just a note now"
h0="$(head_of "$d")"; ship "$d" p5020; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5020 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'NOT ELIGIBLE: the spec at origin/main is not classified' "$SCRATCH/ship.log"; then
  pass "L3: a relabel committed inside the closing range is refused (exit $rc) — provenance is origin/main"
else
  fail "L3: an in-range relabel closed or failed for the wrong reason (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L3d — the same relabel with an environment knob pointing provenance at local
# main. The library assigns its base at source time; no variable can move it.
h0="$(head_of "$d")"
( cd "$d" && ADMIN_LOCAL_BASE_REF=refs/heads/main bash scripts/git-ops.sh ship p5020 </dev/null ) >"$SCRATCH/ship.log" 2>&1; rc=$?; keep "$SCRATCH/ship.log"
if [[ $rc -ne 0 ]] && ! closed "$d" p5020 && [[ "$(head_of "$d")" == "$h0" ]]; then
  pass "L3d: ADMIN_LOCAL_BASE_REF=refs/heads/main in the environment changes nothing (exit $rc)"
else
  fail "L3d: an environment variable moved the provenance base (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L3b — the relabel is only in the working tree (uncommitted).
d="$(mk l3b)"; spec "$d" p5021 'type: task\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5021" push
spec "$d" p5021 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
h0="$(head_of "$d")"; ship "$d" p5021; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5021 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'NOT ELIGIBLE: the spec as committed on main is not classified' "$SCRATCH/ship.log"; then
  pass "L3b: an uncommitted relabel is refused (exit $rc)"
else
  fail "L3b: an uncommitted relabel closed or failed for the wrong reason (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L3c — a comment spec born and closed inside the range (never pushed).
d="$(mk l3c)"; spec "$d" p5022 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5022"
h0="$(head_of "$d")"; ship "$d" p5022; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5022 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'NOT ELIGIBLE: the spec does not exist at origin/main' "$SCRATCH/ship.log"; then
  pass "L3c: a comment spec never pushed has no provenance and is refused (exit $rc)"
else
  fail "L3c: an unpushed comment spec closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L4 — the closing change may touch only the spec (and its UAT file). A stray
# staged file is caught by the under-lock re-check, before any commit exists.
d="$(mk l4)"; spec "$d" p5030 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5030" push
( cd "$d" && echo stray > stray.txt && git add stray.txt ) >/dev/null 2>&1
h0="$(head_of "$d")"; ship "$d" p5030; rc=$?
if [[ $rc -ne 0 ]] && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 're-check under main.lock FAILED: the closing change touches stray.txt' "$SCRATCH/ship.log"; then
  pass "L4: a closing change carrying a stray staged file is refused under the lock (exit $rc); no commit made"
else
  fail "L4: a stray staged path was not refused by the administrative path check (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L5 — a comment spec that records its own dev run is not "nothing to gate".
d="$(mk l5)"; spec "$d" p5040 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec, dev]'
commit "$d" "docs: add p5040" push
h0="$(head_of "$d")"; ship "$d" p5040; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5040 && grep -q 'records its own implementation' "$SCRATCH/ship.log"; then
  pass "L5: a comment spec recording a dev run goes through the normal gates and is refused (exit $rc)"
else
  fail "L5: a comment spec with its own dev run closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L6 — RACE: a branch ahead of main appears AFTER the pre-lock check. The
# under-lock re-check must see it. SHIP_DEBUG_NOBRANCH_SLEEP_SECS is the existing
# test knob that widens the post-lock window (it sleeps; it skips nothing).
d="$(mk l6)"; spec "$d" p5050 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5050" push
code_commit="$( cd "$d" && git checkout -q -b tmp-p5050 && echo code > src.ts && git add src.ts \
  && git commit -qm 'p5050: code' >/dev/null 2>&1 && git rev-parse HEAD && git checkout -q main \
  && git branch -q -D tmp-p5050 )"
h0="$(head_of "$d")"
( cd "$d" && SHIP_DEBUG_NOBRANCH_SLEEP_SECS=4 bash scripts/git-ops.sh ship p5050 </dev/null ) >"$SCRATCH/l6.log" 2>&1 &
l6_pid=$!
for _ in $(seq 1 100); do [[ -e "$d/.claude/worktrees/main.lock" ]] && break; sleep 0.1; done
lock_seen=0; [[ -e "$d/.claude/worktrees/main.lock" ]] && lock_seen=1
git -C "$d" update-ref refs/remotes/origin/feature/p5050-late "$code_commit"
wait "$l6_pid"; rc=$?; keep "$SCRATCH/l6.log"
if [[ $lock_seen -eq 1 && $rc -ne 0 ]] && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'ELIGIBLE: p5050' "$SCRATCH/l6.log" \
   && grep -q 're-check under main.lock FAILED: a branch for p5050 is ahead of main' "$SCRATCH/l6.log"; then
  pass "L6: a branch that appears after the pre-lock verdict is caught by the under-lock re-check (exit $rc)"
else
  fail "L6: under-lock re-check did not catch the late branch (exit $rc, lock seen $lock_seen)"; show "$SCRATCH/l6.log"
fi

# L7 — fail closed: the library missing means no administrative route.
d="$(mk l7 noadmin)"; spec "$d" p5060 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
commit "$d" "docs: add p5060" push
ship "$d" p5060; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5060 && grep -q 'admin-close.sh is missing' "$SCRATCH/ship.log"; then
  pass "L7: with scripts/lib/admin-close.sh missing, a comment spec is refused (exit $rc) and the reason is named"
else
  fail "L7: missing library did not fail closed (exit $rc)"; show "$SCRATCH/ship.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# R2 — the override
# ════════════════════════════════════════════════════════════════════════════

# R1 — red gate, no override: refused, and the text names the one-click path.
d="$(mk r1)"; spec "$d" p5100 'type: task\npipeline_ran: [dev]'
commit "$d" "docs: add p5100" push
h0="$(head_of "$d")"; ship "$d" p5100; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5100 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'ONE CLICK' "$SCRATCH/ship.log" && grep -q -- '--override --reason' "$SCRATCH/ship.log" \
   && grep -q 'keychain dialog' "$SCRATCH/ship.log" \
   && ! grep -qiE 'terminal|/dev/tty' "$SCRATCH/ship.log"; then
  pass "R1: a red gate without --override refuses (exit $rc); the text names the one-click keychain approval and no terminal"
else
  fail "R1: refusal or its text is wrong (exit $rc)"; show "$SCRATCH/ship.log"
fi

# R2 — usage: --override needs --reason; --reason needs --override; a junk reason
# is refused before anything runs. All exit 2, nothing prompted, nothing closed.
r2_ok=1; r2_codes=""
for args in "--override" "--reason this-is-long-enough" "--override --reason ok"; do
  # shellcheck disable=SC2086
  ( cd "$d" && bash scripts/git-ops.sh ship p5100 $args </dev/null ) >"$SCRATCH/r2.log" 2>&1; rc=$?; keep "$SCRATCH/r2.log"
  r2_codes="${r2_codes}${rc} "
  { [[ $rc -eq 2 ]] && ! closed "$d" p5100 && ! grep -q 'GATE 2.5' "$SCRATCH/r2.log"; } || r2_ok=0
done
if [[ $r2_ok -eq 1 ]]; then
  pass "R2: --override without --reason, --reason alone, and a 2-char reason are usage errors before any gate runs (exits: ${r2_codes% })"
else
  fail "R2: usage validation (exits: $r2_codes)"; show "$SCRATCH/r2.log"
fi

# ── D: the decision function, readers injected IN THIS HARNESS ONLY ─────────
# run_decide <acl rc before> <read rc> <acl rc after> <reason>
run_decide() {
  local log="$SCRATCH/calls.$RANDOM$RANDOM"; : > "$log"
  bash -c '
    set -u
    . "$1/scripts/lib/gate-override.sh"
    log="$2"; a1="$3"; rd="$4"; a2="$5"
    gate_override_acl_state() {
      echo acl >> "$log"
      if [ "$(grep -c acl "$log")" -eq 1 ]; then return "$a1"; fi
      return "$a2"
    }
    gate_override_read_approval() { echo "read:$1:$2" >> "$log"; return "$rd"; }
    out="$(gate_override_decide p4242 "$6" 2>/dev/null)"; rc=$?
    echo "RC=$rc OUT=[$out]"
  ' _ "$W" "$log" "$1" "$2" "$3" "$4"
  echo "CALLS=$(tr '\n' ' ' < "$log")"
}

out="$(run_decide 0 0 0 'gate is wrong: criteria retired in prose')"
if [[ "$out" == *"RC=0 OUT=[gate is wrong: criteria retired in prose]"* \
   && "$out" == *"CALLS=acl read:p4242:gate is wrong: criteria retired in prose acl "* ]]; then
  pass "D1: intact before, Allow, intact after: approved, reason returned, the read named the spec and the reason"
else
  fail "D1: approve path: $out"
fi

out="$(run_decide 0 2 0 'gate is wrong: criteria retired in prose')"
if [[ "$out" == *"RC=1 OUT=[]"* && "$out" == *"CALLS=acl read:"* && "$out" != *"read:"*" acl "* ]]; then
  pass "D2: Deny refuses (rc 1), returns no reason, and the after-check is never reached"
else
  fail "D2: declined approval was not refused: $out"
fi

out="$(run_decide 2 0 0 'gate is wrong: criteria retired in prose')"
if [[ "$out" == *"RC=1 OUT=[]"* && "$out" == *"CALLS=acl "* && "$out" != *"read:"* ]]; then
  pass "D3: a DEFEATED access list before the read refuses (rc 1) and no dialog is raised"
else
  fail "D3: defeated-before was not refused, or the read still ran: $out"
fi

out="$(run_decide 0 0 2 'gate is wrong: criteria retired in prose')"
if [[ "$out" == *"RC=1 OUT=[]"* && "$out" == *"read:"*" acl "* ]]; then
  pass "D4: \"Always Allow\" clicked DURING this request (defeated after the read) refuses (rc 1)"
else
  fail "D4: defeated-after was not refused: $out"
fi

out="$(run_decide 1 0 0 'gate is wrong: criteria retired in prose')"
if [[ "$out" == *"RC=1 OUT=[]"* && "$out" != *"read:"* ]]; then
  pass "D5: an approval item that is not enrolled refuses (rc 1), no read"
else
  fail "D5: missing item was not refused: $out"
fi

d5_ok=1
for code in 3 4 127 255; do
  out="$(run_decide "$code" 0 0 'gate is wrong: criteria retired in prose')"
  [[ "$out" == *"RC=1 OUT=[]"* && "$out" != *"read:"* ]] || d5_ok=0
  out="$(run_decide 0 0 "$code" 'gate is wrong: criteria retired in prose')"
  [[ "$out" == *"RC=1 OUT=[]"* ]] || d5_ok=0
done
if [[ $d5_ok -eq 1 ]]; then
  pass "D6: an INDETERMINATE access list (exit 3, 4, 127, 255), before or after, refuses (rc 1)"
else
  fail "D6: an indeterminate access list was treated as intact: $out"
fi

out="$(run_decide 0 0 0 'short')"
if [[ "$out" == *"RC=1 OUT=[]"* && "$out" != *"acl"* && "$out" != *"read:"* ]]; then
  pass "D7: a reason under 12 characters refuses before the access list is even read"
else
  fail "D7: a junk reason reached the keychain: $out"
fi

# D8 — the production readers cannot be pointed elsewhere from the environment,
# and fail closed off macOS / without the helper. Real keychain never reached:
# every arm here either fakes uname or points the helper path at nothing.
out="$( _GATE_OVERRIDE_KEYCHAIN_PY=/tmp/evil.py bash -c '
  . "$1/scripts/lib/gate-override.sh"
  [ "$_GATE_OVERRIDE_KEYCHAIN_PY" = "$1/scripts/lib/keychain.py" ] && echo PATH=sibling || echo PATH=injected
  _GATE_OVERRIDE_KEYCHAIN_PY=/nonexistent/keychain.py
  gate_override_acl_state 2>/dev/null; echo "MISSING=$?"
  gate_override_read_approval p1 "x" 2>/dev/null; echo "READ_MISSING=$?"
  uname() { echo Linux; }
  gate_override_acl_state 2>/dev/null; echo "LINUX=$?"
' _ "$W" )"
if [[ "$out" == *"PATH=sibling"* && "$out" == *"MISSING=3"* && "$out" == *"READ_MISSING=3"* && "$out" == *"LINUX=3"* ]]; then
  pass "D8: the helper path ignores the environment; a missing helper or a non-macOS host reads as indeterminate (3)"
else
  fail "D8: production readers: $out"
fi

# D9 — static: nothing in the override library or the admin library consults an
# environment variable to decide. Every UPPER-CASE variable either file reads must
# be ASSIGNED in that file (or be a bash builtin). The scanner is proven to fire
# by running it on a mutated copy of the real file (epistemic.md gate 7d).
d9_scan() {
  local f="$1" v bad=""
  while IFS= read -r v; do
    [[ -z "$v" ]] && continue
    case "$v" in BASH_SOURCE|IFS|RANDOM|HOME) continue ;; esac
    grep -qE "(^|[^A-Za-z0-9_])${v}=" "$f" || bad="${bad} ${v}"
  done < <(grep -oE '\$\{?[A-Z_][A-Z0-9_]*' "$f" | tr -d '${' | sort -u)
  printf '%s' "$bad"
}
d9_bad=""
for f in "$W/scripts/lib/gate-override.sh" "$W/scripts/lib/admin-close.sh"; do
  b="$(d9_scan "$f")"; [[ -n "$b" ]] && d9_bad="${d9_bad} ${f##*/}:${b}"
done
cp "$W/scripts/lib/gate-override.sh" "$SCRATCH/mutant.sh"
printf '\ngate_override_acl_state() { [ -n "$SKIP_APPROVAL_FOR_TESTS" ] && return 0; }\n' >> "$SCRATCH/mutant.sh"
d9_mut="$(d9_scan "$SCRATCH/mutant.sh")"
if [[ -z "$d9_bad" && "$d9_mut" == *SKIP_APPROVAL_FOR_TESTS* ]]; then
  pass "D9: every UPPER-CASE variable the two libraries read is assigned inside them — no environment knob (and the scan flags a planted one)"
else
  fail "D9: unassigned (environment-readable) variables:${d9_bad:- none}; mutant flagged:${d9_mut:- nothing}"
fi

# ── E: end-to-end through git-ops.sh with a FAKE helper in a scratch repo ───
# The fake records its calls and answers from a plan file. It never imports
# ctypes or the Security framework. Production reads its SIBLING keychain.py, so
# this is the scratch repo's own file — not a switch production code honours.
write_fake() {
  cat > "$1/scripts/lib/keychain.py" <<'PY'
#!/usr/bin/env python3
# FAKE keychain.py for a P1444 scratch repo. Never touches the real keychain.
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
plan = dict(x.split("=", 1) for x in open(os.path.join(here, "fake-plan")).read().split())
log = os.path.join(here, "fake-calls")
verb = sys.argv[1] if len(sys.argv) > 1 else ""
with open(log, "a") as fh:
    fh.write(verb + "\n")
if verb == "approval-acl":
    n = sum(1 for line in open(log) if line.strip() == "approval-acl")
    seq = plan["acl"].split(",")
    sys.exit(int(seq[min(n, len(seq)) - 1]))
if verb == "approval-get":
    if plan.get("leak") == "1":
        sys.stdout.write("SECRET-VALUE-FROM-HELPER\n")
    sys.exit(int(plan["get"]))
sys.exit(9)
PY
  printf '%s\n' "$2" > "$1/scripts/lib/fake-plan"
  : > "$1/scripts/lib/fake-calls"
}
e2e_repo() {  # e2e_repo <name> <pN> <plan>
  local d; d="$(mk "$1")"
  spec "$d" "$2" 'type: task\npipeline_ran: [dev]'
  commit "$d" "docs: add $2" push
  # The no-branch route still needs its code-presence stamp after an override
  # (an override answers the GATES, not "is the work on main").
  ( cd "$d" && echo impl > "$2.txt" && git add "$2.txt" && git commit -qm "chore: $2 ready for QA — demo" ) >/dev/null 2>&1
  write_fake "$d" "$3"
  echo "$d"
}
REASON='criteria 3-6 retired, recorded in prose'
if [[ "$(uname -s)" != "Darwin" ]]; then
  skip "E1-E4: the production approval reader refuses off macOS before calling any helper (D8), so the approve path cannot run here"
else
  d="$(e2e_repo e1 p5200 'acl=0,0 get=0')"
  ship "$d" p5200 --override --reason "$REASON"; rc=$?
  msg="$(git -C "$d" log -1 --format=%B)"
  if [[ $rc -eq 0 ]] && closed "$d" p5200 \
     && grep -qx 'Gate-Override: closure gate failed; closed by override (keychain dialog).' <<<"$msg" \
     && grep -qx "Gate-Override-Reason: $REASON" <<<"$msg" \
     && grep -qx 'Gate-Override-Approval: keychain dialog' <<<"$msg" \
     && [[ "$(tr '\n' ' ' < "$d/scripts/lib/fake-calls")" == "approval-acl approval-get approval-acl " ]]; then
    pass "E1: an approved override closes (exit 0) with all three trailers; access list checked before AND after the read"
  else
    fail "E1: approved override (exit $rc; calls: $(tr '\n' ' ' < "$d/scripts/lib/fake-calls"))"; show "$SCRATCH/ship.log"
  fi

  d="$(e2e_repo e2 p5201 'acl=0,0 get=2')"; h0="$(head_of "$d")"
  ship "$d" p5201 --override --reason "$REASON"; rc=$?
  if [[ $rc -ne 0 ]] && ! closed "$d" p5201 && [[ "$(head_of "$d")" == "$h0" ]] \
     && grep -q 'the keychain dialog was denied' "$SCRATCH/ship.log"; then
    pass "E2: Deny refuses end-to-end (exit $rc); spec open, main unchanged"
  else
    fail "E2: declined override (exit $rc)"; show "$SCRATCH/ship.log"
  fi

  d="$(e2e_repo e3 p5202 'acl=0,2 get=0')"; h0="$(head_of "$d")"
  ship "$d" p5202 --override --reason "$REASON"; rc=$?
  if [[ $rc -ne 0 ]] && ! closed "$d" p5202 && [[ "$(head_of "$d")" == "$h0" ]] \
     && grep -q 'approval refused (after the read)' "$SCRATCH/ship.log"; then
    pass "E3: Allow followed by a defeated access list (Always Allow) refuses end-to-end (exit $rc)"
  else
    fail "E3: defeated-after override (exit $rc)"; show "$SCRATCH/ship.log"
  fi

  d="$(e2e_repo e4 p5203 'acl=3 get=0')"; h0="$(head_of "$d")"
  ship "$d" p5203 --override --reason "$REASON"; rc=$?
  if [[ $rc -ne 0 ]] && ! closed "$d" p5203 && [[ "$(head_of "$d")" == "$h0" ]] \
     && ! grep -q approval-get "$d/scripts/lib/fake-calls"; then
    pass "E4: an indeterminate access list refuses end-to-end (exit $rc) and no dialog is requested"
  else
    fail "E4: indeterminate override (exit $rc)"; show "$SCRATCH/ship.log"
  fi
fi

# E5 — no sibling helper, but an approving fake offered through the environment.
d="$(mk e5)"; spec "$d" p5204 'type: task\npipeline_ran: [dev]'; commit "$d" "docs: add p5204" push
mkdir -p "$SCRATCH/evil/scripts/lib"; write_fake "$SCRATCH/evil" 'acl=0,0 get=0'
h0="$(head_of "$d")"
( cd "$d" && _GATE_OVERRIDE_KEYCHAIN_PY="$SCRATCH/evil/scripts/lib/keychain.py" \
    bash scripts/git-ops.sh ship p5204 --override --reason "$REASON" </dev/null ) >"$SCRATCH/ship.log" 2>&1; rc=$?; keep "$SCRATCH/ship.log"
if [[ $rc -ne 0 ]] && ! closed "$d" p5204 && [[ "$(head_of "$d")" == "$h0" ]] \
   && [[ ! -s "$SCRATCH/evil/scripts/lib/fake-calls" ]]; then
  pass "E5: an approver injected through the environment is never consulted (exit $rc)"
else
  fail "E5: environment-injected approver was used (exit $rc)"; show "$SCRATCH/ship.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# C — closure-gate.yml, its own run: blocks executed against fixture commits
# ════════════════════════════════════════════════════════════════════════════
if ! command -v ruby >/dev/null 2>&1; then
  fail "C0: ruby is unavailable, so the workflow's run: blocks cannot be extracted — the CI cases did NOT run"
else
  ci_extract() {
    ruby -ryaml -e '
      y = YAML.load_file(ARGV[0])
      st = y["jobs"]["closure-gate"]["steps"].find { |s| (s["name"] || "").start_with?(ARGV[1]) }
      abort("no step named " + ARGV[1]) unless st
      print st["run"]' "$WF" "$1"
  }
  ci_extract "Identify specs closed" > "$SCRATCH/ci-identify.sh" \
    && ci_extract "Gate each closure" > "$SCRATCH/ci-gate.sh" \
    && pass "C0: extracted the two gating run: blocks from closure-gate.yml" \
    || fail "C0: could not extract the workflow steps"

  # ci_run <repo> <event> [before] [after] — runs the two steps the way Actions
  # does (bash -e -o pipefail), the second only when the first found closes.
  # Leaves the combined log in $SCRATCH/ci.log and returns the job's verdict.
  # ci_run <repo> <event> [before] [after] [pushed ref, default refs/heads/main]
  # A push to main is modelled the way the runner sees it AFTER its "Fetch trusted
  # base" step: origin/main already points at the pushed tip. The scratch ref is
  # moved for the run and put back afterwards.
  ci_run() {
    local d="$1" ev="$2" out="$SCRATCH/ghout" rc=0 paths range base ref="${5:-refs/heads/main}" saved=""
    : > "$out"
    if [[ "$ev" == push && "$ref" == refs/heads/main && -n "${4:-}" ]] \
       && git -C "$d" cat-file -e "${4}^{commit}" 2>/dev/null; then
      saved="$(git -C "$d" rev-parse refs/remotes/origin/main)"
      git -C "$d" update-ref refs/remotes/origin/main "$4"
    fi
    ( cd "$d" && EVENT_NAME="$ev" PUSH_REF="$ref" PUSH_BEFORE="${3:-}" PUSH_AFTER="${4:-}" GITHUB_OUTPUT="$out" \
        bash --noprofile --norc -eo pipefail "$SCRATCH/ci-identify.sh" ) >"$SCRATCH/ci.log" 2>&1 || rc=$?
    if [[ $rc -eq 0 ]]; then
      range="$(sed -n 's/^range=//p' "$out")"; base="$(sed -n 's/^base=//p' "$out")"
      paths="$(awk '/^paths<<EOF$/{f=1;next} /^EOF$/{f=0} f' "$out")"
      if [[ -n "$paths" ]]; then
        ( cd "$d" && CLOSED="$paths" RANGE="$range" BASE="$base" GITHUB_WORKSPACE="$d" \
            bash --noprofile --norc -eo pipefail "$SCRATCH/ci-gate.sh" ) >>"$SCRATCH/ci.log" 2>&1 || rc=$?
      fi
    fi
    [[ -n "$saved" ]] && git -C "$d" update-ref refs/remotes/origin/main "$saved"
    return $rc
  }
  # hand_close <repo> <pN> [extra file] — a close made by hand (what CI must
  # judge without trusting the local path): move the spec into done/ and commit.
  hand_close() {
    ( cd "$1" && git mv "features/$2_demo.md" "$SPRINT/$2_demo.md" \
      && { [[ -z "${3:-}" ]] || { echo stray > "$3" && git add "$3"; }; } \
      && git commit -qm "${4:-chore: close $2}" ) >/dev/null 2>&1
  }

  # C1 — the local L1 close, judged by CI over the push range it would deliver.
  before="$(git -C "$L1_REPO" rev-parse origin/main)"; after="$(head_of "$L1_REPO")"
  ci_run "$L1_REPO" push "$before" "$after"; rc=$?
  if [[ $rc -eq 0 ]] && grep -q "ADMIN: p5001 closed administratively (tag: retracted)" "$SCRATCH/ci.log"; then
    pass "C1: CI re-derives git-ops' administrative close from blobs and passes it (job exit 0)"
    echo "    --- CI log (C1) ---"; grep -E 'Range:|Specs closed|GATE 2.5|ADMIN:' "$SCRATCH/ci.log" | sed 's/^/    /'
  else
    fail "C1: CI refused a legitimate administrative close (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C1b — same close judged as a pull_request (merge-base range).
  ci_run "$L1_REPO" pull_request; rc=$?
  if [[ $rc -eq 0 ]] && grep -q "ADMIN: p5001" "$SCRATCH/ci.log"; then
    pass "C1b: the pull_request range (merge-base with origin/main) reaches the same verdict (exit 0)"
  else
    fail "C1b: PR-range verdict differs (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C2 — relabel inside the pushed range, then a hand close.
  d="$(mk c2)"; spec "$d" p5300 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5300" push
  before="$(head_of "$d")"
  spec "$d" p5300 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: relabel"
  hand_close "$d" p5300
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'Not an administrative close: the spec at the range base is not classified' "$SCRATCH/ci.log" \
     && grep -q '::error::p5300' "$SCRATCH/ci.log"; then
    pass "C2: a relabel inside the pushed range fails CI (job exit $rc)"
  else
    fail "C2: CI accepted an in-range relabel (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C3 — a closing commit that also touches another path.
  d="$(mk c3)"; spec "$d" p5301 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5301" push
  before="$(head_of "$d")"; hand_close "$d" p5301 src-change.ts
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'the closing change touches src-change.ts' "$SCRATCH/ci.log"; then
    pass "C3: a closing commit touching another path fails CI (job exit $rc)"
  else
    fail "C3: CI accepted a closing commit with a stray path (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C3b — the UAT file may move with its spec (gate 7c: the allowed shape passes).
  d="$(mk c3b)"; spec "$d" p5302 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
  echo uat > "$d/features/uat/p5302.md"; commit "$d" "docs: add p5302" push
  before="$(head_of "$d")"
  ( cd "$d" && mkdir -p "$SPRINT/uat" && git mv features/uat/p5302.md "$SPRINT/uat/p5302.md" ) >/dev/null 2>&1
  hand_close "$d" p5302
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -eq 0 ]] && grep -q 'ADMIN: p5302' "$SCRATCH/ci.log" && ! grep -q 'closure-gate p5302 (.*uat' "$SCRATCH/ci.log"; then
    pass "C3b: spec + its exact UAT file moving together passes, and the UAT copy is not mistaken for a close (exit 0)"
  else
    fail "C3b: the allowed spec+UAT shape was refused (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C4 — a feature branch ahead of the closing commit, visible as a remote ref.
  d="$(mk c4)"; spec "$d" p5303 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5303" push
  before="$(head_of "$d")"
  ( cd "$d" && git checkout -q -b feature/p5303-x && echo c > c.ts && git add c.ts && git commit -qm "p5303: code" \
    && git push -q origin feature/p5303-x && git checkout -q main && git fetch -q origin ) >/dev/null 2>&1
  hand_close "$d" p5303
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'a branch for p5303 is ahead of main' "$SCRATCH/ci.log"; then
    pass "C4: a feature branch ahead of the close fails CI (job exit $rc)"
  else
    fail "C4: CI ignored a branch ahead (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C5 — trailers and message text cannot make a close administrative: a REAL
  # spec closed by hand with a message claiming an administrative close.
  d="$(mk c5)"; spec "$d" p5304 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5304" push
  before="$(head_of "$d")"
  hand_close "$d" p5304 "" "$(printf 'chore: close p5304 (administrative)\n\nAdministrative-Close: yes\nGate-Admin: eligible')"
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q '::error::p5304 was closed but does not pass' "$SCRATCH/ci.log"; then
    pass "C5: a real spec closed with administrative-sounding trailers fails CI (job exit $rc) — no trailer is read for the verdict"
  else
    fail "C5: CI trusted message text (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C6 — gate 7c: an ordinary, fully ticked close still passes on gate 2.5.
  d="$(mk c6)"; spec "$d" p5305 'type: task\npipeline_ran: [create-spec, dev]' x; commit "$d" "docs: add p5305" push
  before="$(head_of "$d")"; hand_close "$d" p5305
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -eq 0 ]] && grep -q 'PASS: p5305' "$SCRATCH/ci.log" && ! grep -q 'ADMIN:' "$SCRATCH/ci.log"; then
    pass "C6: an ordinary ticked close still passes CI on gate 2.5 (exit 0)"
  else
    fail "C6: CI refused a legitimate ordinary close (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C7 — the base has no admin library (the push that first lands it): the
  # administrative route does not exist for that range, and the close fails.
  d="$(mk c7 noadmin)"; spec "$d" p5306 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5306" push
  before="$(head_of "$d")"
  cp "$W/scripts/lib/admin-close.sh" "$d/scripts/lib/"; ( cd "$d" && git add scripts/lib/admin-close.sh && git commit -qm "land lib" ) >/dev/null 2>&1
  hand_close "$d" p5306
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'not available at the range base' "$SCRATCH/ci.log"; then
    pass "C7: the PUSHED copy of the library is never used — with none at the base the close fails (exit $rc); P1444 must reach origin/main first"
  else
    fail "C7: CI used the pushed library or passed without one (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C8 — a base without ship-gates.sh fails the job instead of judging with the
  # pushed copy (the old fallback).
  d="$(mk c8)"; spec "$d" p5307 'type: task\npipeline_ran: [create-spec, dev]' x; commit "$d" "docs: add p5307" push
  ( cd "$d" && git rm -q scripts/ship-gates.sh && git commit -qm "drop gate" && git push -q origin main ) >/dev/null 2>&1
  before="$(head_of "$d")"
  ( cd "$d" && git show HEAD~1:scripts/ship-gates.sh > scripts/ship-gates.sh && git add scripts/ship-gates.sh \
    && git commit -qm "re-add gate" ) >/dev/null 2>&1
  hand_close "$d" p5307
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'has no scripts/ship-gates.sh' "$SCRATCH/ci.log"; then
    pass "C8: a range base without the gate script fails the job (exit $rc) — no fallback to the pushed copy"
  else
    fail "C8: CI fell back to the pushed gate script (exit $rc)"; show "$SCRATCH/ci.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# Review round 1 (2026-10-08): Codex 1444b, Gemini 1444b, Opus. Each case below was
# run RED against the pre-fix commit 10c2f07c7 before the fix landed.
# ════════════════════════════════════════════════════════════════════════════

# ── P: frontmatter parsing, through the library's own functions ────────────
fmx() { printf -- '---\n%b\n---\nBody.\n' "$1"; }
lib_rc() {  # lib_rc <function> <content> [off] — the function's exit code
  bash -c '. "$1/scripts/lib/admin-close.sh" || exit 99
           [ "$4" = on ] && ADMIN_TYPE_COMMENT_ELIGIBLE=1
           "$2" "$3" >/dev/null 2>&1; echo "$?"' _ "$W" "$1" "$2" "${3:-}" 2>/dev/null | tail -1
}
p_case() {  # p_case <id> <function> <want: 0|nonzero> <frontmatter> <label> [off]
  local got; got="$(lib_rc "$2" "$(fmx "$4")" "${6:-}")"
  if { [[ "$3" == 0 && "$got" == 0 ]] || [[ "$3" == nonzero && -n "$got" && "$got" != 0 ]]; }; then
    pass "$1: $5 ($2 rc $got)"
  else
    fail "$1: $5 — $2 returned ${got:-nothing}, wanted $3"
  fi
}
p_case P1  admin_classify nonzero 'type: task\ntags: ["re tracted"]'           'a tag "re tracted" is not the retracted tag (Codex #5)'
p_case P2  admin_classify nonzero 'type: task\ntags: "[retracted]"'            'a quoted scalar "[retracted]" is not a tag list (Codex #5)'
p_case P3  admin_classify nonzero 'type: comment\ntype: task'                  'a duplicated type: key is ambiguous and refuses (Codex #6)'
p_case P3b admin_classify nonzero 'type: comment\n"type": task'                'a quoted duplicate key is ambiguous and refuses (Codex #6/#8)'
p_case P4  admin_classify 0       'type: task\ntags:\n  - security\n  - retracted' 'a block-form tag list carrying retracted classifies (L-e, Gemini #6)'
p_case P4b admin_classify nonzero 'type: task\ntags:\n  - retracted\n    nested: x' 'a block list with a nested line is unparseable and refuses (fail closed)'
p_case P5  admin_records_impl 0   'type: comment\npipeline_ran:\n  - create-spec\n  - dev' 'a block-form pipeline_ran with dev records an implementation (Gemini #3)'
p_case P6  admin_records_impl 0   'type: comment\npipeline_ran: ["create-spec", "dev"]' 'a quoted "dev" item records an implementation (Gemini #3)'
p_case P6b admin_records_impl 0   "type: comment\npipeline_ran: ['dev.1']"     'a quoted dev.1 re-run records an implementation (Gemini #3)'
p_case P6c admin_records_impl 0   'type: comment\n"pipeline_ran": [dev]'       'a quoted pipeline_ran key is ambiguous and counts as an implementation (fail closed)'
p_case P7  admin_classify 0       'type: task\nwithdrawn: "2026-01-01 #1"'     'a quoted withdrawn value containing # keeps its date (Gemini #7)'
p_case P8  admin_classify nonzero 'type: comment'                               'DEFAULT (founder 2026-10-08): type: comment alone does not qualify'
p_case P8b admin_classify 0       'type: task\ntags: [security, retracted]'    'control: inline tag list with retracted classifies'
p_case P8c admin_records_impl nonzero 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]' 'control: create-spec alone records no implementation'
p_case P9  admin_classify 0       'type: comment'                               'switch flipped to 1: type: comment qualifies again' on
p_case P9b admin_classify 0       'type: task\nwithdrawn: 2026-10-01'          'switch flipped to 1: a withdrawn spec still qualifies' on

# Pushes in this block go to the scratch bare remote created by mk(), never anywhere else.
spush() { git -C "$1" push -q origin "${2:-main}" >/dev/null 2>&1; }

# ── L: local route ──────────────────────────────────────────────────────────
# L8 (Opus H1) — implemented work, then withdrawn in an EARLIER push. Provenance
# cannot tell a real withdrawal from a relabel; implementation evidence can.
d="$(mk l8)"; spec "$d" p5070 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5070" push
( cd "$d" && echo impl > src.ts && git add src.ts && git commit -qm "feat(p5070): implement the thing" ) >/dev/null 2>&1; spush "$d"
spec "$d" p5070 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: withdraw" push
h0="$(head_of "$d")"; ship "$d" p5070; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5070 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'implementation evidence' "$SCRATCH/ship.log"; then
  pass "L8: a spec withdrawn after code naming it landed on main is refused (exit $rc) — implementation evidence"
else
  fail "L8: an implemented-then-withdrawn spec closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

d="$(mk l8b)"; spec "$d" p5071 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5071" push
echo "edit" >> "$d/features/p5071_demo.md"; commit "$d" "chore: p5071 ready for QA — demo" push
spec "$d" p5071 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: withdraw" push
ship "$d" p5071; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5071 && grep -q 'implementation evidence' "$SCRATCH/ship.log"; then
  pass "L8b: a 'ready for QA' stamp naming the spec is implementation evidence, even touching only features/ (exit $rc)"
else
  fail "L8b: a stamped spec closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

d="$(mk l8c)"; spec "$d" p5072 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5072" push
printf '{"type": "code", "pn": "p5072", "branch": "main", "sha": "0", "timestamp": "t"}\n' >> "$d/.git/.finish-reviewed"
ship "$d" p5072; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5072 && grep -q 'implementation evidence' "$SCRATCH/ship.log"; then
  pass "L8c: a code-review entry naming the spec is implementation evidence (exit $rc)"
else
  fail "L8c: a reviewed spec closed administratively (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L9 (Opus M2) — origin/main does not carry the library yet (P1444 not pushed).
d="$(mk l9 noadmin)"; spec "$d" p5080 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5080" push
cp "$W/scripts/lib/admin-close.sh" "$d/scripts/lib/"
( cd "$d" && git add scripts/lib/admin-close.sh && git commit -qm "land the library locally" ) >/dev/null 2>&1
h0="$(head_of "$d")"; ship "$d" p5080; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5080 && [[ "$(head_of "$d")" == "$h0" ]] \
   && grep -q 'ship P1444 first' "$SCRATCH/ship.log"; then
  pass "L9: an administrative close while origin/main lacks the library is refused locally (exit $rc) — CI would refuse it anyway"
else
  fail "L9: closed administratively before the library reached origin/main (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L10 (Codex #11) — a branch appears INSIDE the commit's pre-commit hook window,
# after the last pre-commit check. The commit lands; ship must not report success.
d="$(mk l10)"; spec "$d" p5090 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5090" push
late="$( cd "$d" && git checkout -q -b tmp-p5090 && echo code > src.ts && git add src.ts \
  && git commit -qm 'p5090: code' >/dev/null 2>&1 && git rev-parse HEAD && git checkout -q main && git branch -q -D tmp-p5090 )"
printf '#!/bin/sh\ngit update-ref refs/remotes/origin/feature/p5090-late %s\n' "$late" > "$d/.git/hooks/pre-commit"
chmod +x "$d/.git/hooks/pre-commit"
ship "$d" p5090; rc=$?
if [[ $rc -ne 0 ]] && grep -q 'LANDED' "$SCRATCH/ship.log" && grep -q 'a branch for p5090 is ahead of main' "$SCRATCH/ship.log"; then
  pass "L10: a branch created during the commit hook window is caught after the commit — ship exits $rc and says the commit landed"
else
  fail "L10: ship reported success with a branch ahead created mid-commit (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L11 (Codex #9) — an empty feature branch at main's tip: still refused (the branch
# route has nothing to ship), but the refusal now names the administrative remedy.
d="$(mk l11)"; spec "$d" p5091 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5091" push
( cd "$d" && git branch -q feature/p5091-empty ) >/dev/null 2>&1
ship "$d" p5091; rc=$?
if [[ $rc -ne 0 ]] && ! closed "$d" p5091 && grep -q 'delete the empty branch' "$SCRATCH/ship.log"; then
  pass "L11: an empty branch at main's tip refuses (exit $rc) and names the remedy for an administrative spec"
else
  fail "L11: refusal did not name the remedy (exit $rc)"; show "$SCRATCH/ship.log"
fi

# L12 (Gemini #2, case 2) — local main BEHIND origin/main and a remote branch that
# carries nothing but origin/main's commits: not ahead of main, so not a refusal.
d="$(mk l12)"; spec "$d" p5092 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5092" push
( cd "$SCRATCH" && git clone -q "$SCRATCH/l12.git" l12-peer && cd l12-peer && git config user.email c@t \
  && git config user.name c && echo other > other.txt && git add other.txt && git commit -qm "unrelated" ) >/dev/null 2>&1
spush "$SCRATCH/l12-peer" main; spush "$SCRATCH/l12-peer" main:feature/p5092-rebased
git -C "$d" fetch -q origin >/dev/null 2>&1
ship "$d" p5092; rc=$?
if [[ $rc -eq 0 ]] && closed "$d" p5092; then
  pass "L12: a remote branch holding only origin/main's commits is not 'ahead' when local main lags (exit 0)"
else
  fail "L12: false refusal with local main behind origin/main (exit $rc)"; show "$SCRATCH/ship.log"
fi

# ── E: approval ordering and output, end to end (fake helper, macOS only) ───
if [[ "$(uname -s)" != "Darwin" ]]; then
  skip "E6-E8: the production approval reader refuses off macOS before calling any helper"
else
  # E6 (L-f) — the stamp is missing, so the close would fail anyway: the founder
  # must not be asked to click first.
  d="$(mk e6)"; spec "$d" p5210 'type: task\npipeline_ran: [dev]'; commit "$d" "docs: add p5210" push
  write_fake "$d" 'acl=0,0 get=0'
  ship "$d" p5210 --override --reason "$REASON"; rc=$?
  if [[ $rc -ne 0 ]] && ! closed "$d" p5210 && grep -q "ready for QA' stamp" "$SCRATCH/ship.log" \
     && [[ ! -s "$d/scripts/lib/fake-calls" ]]; then
    pass "E6: a close that fails a non-approval check refuses (exit $rc) WITHOUT asking for the click"
  else
    fail "E6: approval was requested before a check that then refused (exit $rc; calls: $(tr '\n' ' ' < "$d/scripts/lib/fake-calls"))"; show "$SCRATCH/ship.log"
  fi

  # E7 (Gemini #5) — a helper that writes to stdout cannot reach the trailer.
  d="$(e2e_repo e7 p5211 'acl=0,0 get=0 leak=1')"
  ship "$d" p5211 --override --reason "$REASON"; rc=$?
  msg="$(git -C "$d" log -1 --format=%B)"
  if [[ $rc -eq 0 ]] && closed "$d" p5211 && ! grep -q 'SECRET-VALUE' <<<"$msg" \
     && grep -qx "Gate-Override-Reason: $REASON" <<<"$msg"; then
    pass "E7: helper stdout is discarded — the recorded reason is exactly the reason given"
  else
    fail "E7: helper output leaked into the closure commit (exit $rc)"; printf '%s\n' "$msg" | sed 's/^/    /' >&2
  fi

  # E8 (7c for L-f) — the BRANCH route still takes an approved override, now asked
  # for just before main.lock.
  d="$(mk e8)"; spec "$d" p5212 'type: task\npipeline_ran: [dev]'; commit "$d" "docs: add p5212" push
  ( cd "$d" && git checkout -q -b feature/p5212-x && echo impl > impl.ts && git add impl.ts \
    && git commit -qm "p5212: work" && git checkout -q main ) >/dev/null 2>&1
  write_fake "$d" 'acl=0,0 get=0'
  ship "$d" p5212 --override --reason "$REASON"; rc=$?
  if [[ $rc -eq 0 ]] && closed "$d" p5212 && git -C "$d" cat-file -e main:impl.ts 2>/dev/null \
     && git -C "$d" log -1 --format=%B | grep -q '^Gate-Override-Approval: keychain dialog$'; then
    pass "E8: the branch route closes on an approved override (exit 0), code picked, trailers recorded"
  else
    fail "E8: branch-route override (exit $rc)"; show "$SCRATCH/ship.log"
  fi
fi

# ── C: CI, review round ─────────────────────────────────────────────────────
if [[ ! -s "$SCRATCH/ci-gate.sh" ]]; then
  fail "C9-C15: workflow steps were not extracted — these cases did NOT run"
else
  # C9 (Codex #1) — a SIDE-branch push of relabel + close. BASE must come from
  # main, never the side branch's previous tip.
  d="$(mk c9)"; spec "$d" p5320 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5320" push
  ( cd "$d" && git checkout -q -b release/x ) >/dev/null 2>&1
  spec "$d" p5320 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: relabel"
  t1="$(git -C "$d" rev-parse HEAD)"; hand_close "$d" p5320; t2="$(git -C "$d" rev-parse HEAD)"
  ci_run "$d" push "$t1" "$t2" refs/heads/release/x; rc=$?
  git -C "$d" checkout -q main >/dev/null 2>&1
  if [[ $rc -ne 0 ]] && ! grep -q 'ADMIN: p5320' "$SCRATCH/ci.log"; then
    pass "C9: a side-branch push cannot supply its own provenance — relabel then close on a branch fails (job exit $rc)"
  else
    fail "C9: CI took BASE from a side branch's previous tip (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C10 (Codex #2) — a push to main whose 'before' is unavailable: fail, never an
  # empty range.
  d="$(mk c10)"; spec "$d" p5321 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5321" push
  hand_close "$d" p5321; spush "$d"
  ci_run "$d" push 1111111111111111111111111111111111111111 "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'no usable before' "$SCRATCH/ci.log"; then
    pass "C10: a push to main without a usable 'before' fails the job (exit $rc) instead of scanning an empty range"
  else
    fail "C10: CI reported on an empty range (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C11 (Codex #3) — the close made ON a feature branch that also carries work:
  # branches are judged against main, not against the closing commit.
  d="$(mk c11)"; spec "$d" p5322 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5322" push
  ( cd "$d" && git checkout -q -b feature/p5322-work && echo wip > wip.ts && git add wip.ts && git commit -qm "wip" ) >/dev/null 2>&1
  hand_close "$d" p5322
  spush "$d" feature/p5322-work; git -C "$d" fetch -q origin >/dev/null 2>&1
  ci_run "$d" push 0000000000000000000000000000000000000000 "$(git -C "$d" rev-parse HEAD)" refs/heads/feature/p5322-work; rc=$?
  git -C "$d" checkout -q main >/dev/null 2>&1
  if [[ $rc -ne 0 ]] && grep -q 'a branch for p5322 is ahead of main' "$SCRATCH/ci.log"; then
    pass "C11: a feature branch holding the close plus unmerged work is ahead of MAIN and fails (job exit $rc)"
  else
    fail "C11: CI compared branches with the closing commit (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C12 (Codex #7) — non-ASCII spec names (C-quoted by git) must still be found.
  d="$(mk c12)"; f="features/p5323_tâche.md"
  printf -- '---\nstatus: qa\ntype: task\npipeline_ran: [create-spec]\n---\n# p5323\n\n## Done-When\n\n- [ ] x\n' > "$d/$f"
  ( cd "$d" && git add -- "$f" && git commit -qm "docs: add p5323" ) >/dev/null 2>&1; spush "$d"
  before="$(head_of "$d")"
  ( cd "$d" && git mv -- "$f" "$SPRINT/p5323_tâche.md" && git commit -qm "chore: close p5323" ) >/dev/null 2>&1
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q '::error::p5323' "$SCRATCH/ci.log"; then
    pass "C12: a non-ASCII spec name is discovered and gated (job exit $rc), not silently skipped"
  else
    fail "C12: a quoted path escaped closure discovery (exit $rc)"; show "$SCRATCH/ci.log"
  fi
  d="$(mk c12b)"; f="features/p5324_née.md"
  printf -- '---\nstatus: backlog\ntype: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]\n---\n# p5324\n' > "$d/$f"
  ( cd "$d" && git add -- "$f" && git commit -qm "docs: add p5324" ) >/dev/null 2>&1; spush "$d"
  before="$(head_of "$d")"
  ( cd "$d" && git mv -- "$f" "$SPRINT/p5324_née.md" && git commit -qm "chore: close p5324" ) >/dev/null 2>&1
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -eq 0 ]] && grep -q 'ADMIN: p5324' "$SCRATCH/ci.log"; then
    pass "C12b: a non-ASCII administrative close is re-derived and passes (exit 0)"
  else
    fail "C12b: non-ASCII administrative close (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C13 (Codex #13, Opus M3) — an override needs the FULL trailer set in a real
  # trailer block. Still forgeable by whoever writes the commit; this only stops a
  # stray body line or a partial claim from counting.
  c13() {  # c13 <name> <pN> <message>
    local d; d="$(mk "$1")"; spec "$d" "$2" 'type: task\npipeline_ran: [dev]'; commit "$d" "docs: add $2" push
    local b; b="$(head_of "$d")"; hand_close "$d" "$2" "" "$3"
    ci_run "$d" push "$b" "$(head_of "$d")"
  }
  c13 c13a p5325 "$(printf 'chore: close p5325\n\nGate-Override-Reason: fabricated approval\n\nA closing paragraph, so that line is body text.')"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q '::error::p5325' "$SCRATCH/ci.log"; then
    pass "C13: a Gate-Override-Reason line in the BODY is not an override (job exit $rc)"
  else
    fail "C13: a body line counted as an override (exit $rc)"; show "$SCRATCH/ci.log"
  fi
  c13 c13b p5326 "$(printf 'chore: close p5326\n\nGate-Override-Reason: fabricated approval')"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q '::error::p5326' "$SCRATCH/ci.log"; then
    pass "C13b: a partial trailer set (reason only) is not an override (job exit $rc)"
  else
    fail "C13b: a lone reason trailer counted as an override (exit $rc)"; show "$SCRATCH/ci.log"
  fi
  c13 c13c p5327 "$(printf 'chore: close p5327\n\nGate-Override: closure gate failed; closed by override (keychain dialog).\nGate-Override-Reason: criteria retired in prose\nGate-Override-Approval: keychain dialog')"; rc=$?
  if [[ $rc -eq 0 ]] && grep -q 'OVERRIDE: p5327' "$SCRATCH/ci.log"; then
    pass "C13c: the full trailer set in a trailer block is accepted, with a warning (exit 0)"
  else
    fail "C13c: a well-formed override was refused (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C14 (Opus H1, CI side) — implementation evidence in history, from git alone.
  d="$(mk c14)"; spec "$d" p5328 'type: task\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5328" push
  ( cd "$d" && echo impl > src.ts && git add src.ts && git commit -qm "feat(p5328): build it" ) >/dev/null 2>&1; spush "$d"
  spec "$d" p5328 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: withdraw" push
  before="$(head_of "$d")"; hand_close "$d" p5328
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'implementation evidence' "$SCRATCH/ci.log"; then
    pass "C14: CI refuses an administrative close of a spec with implementation evidence in history (job exit $rc)"
  else
    fail "C14: CI closed an implemented-then-withdrawn spec (exit $rc)"; show "$SCRATCH/ci.log"
  fi

  # C15 (Gemini #4) — the UAT file moves as an exact PAIR or not at all.
  d="$(mk c15)"; spec "$d" p5329 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'
  echo uat > "$d/features/uat/p5329.md"; commit "$d" "docs: add p5329" push
  before="$(head_of "$d")"; ( cd "$d" && git rm -q features/uat/p5329.md ) >/dev/null 2>&1; hand_close "$d" p5329
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'UAT' "$SCRATCH/ci.log"; then
    pass "C15: a UAT file deleted without its done/ copy is refused (job exit $rc)"
  else
    fail "C15: an unpaired UAT deletion passed (exit $rc)"; show "$SCRATCH/ci.log"
  fi
  d="$(mk c15b)"; spec "$d" p5330 'type: task\nwithdrawn: 2026-10-01\npipeline_ran: [create-spec]'; commit "$d" "docs: add p5330" push
  before="$(head_of "$d")"; mkdir -p "$d/$SPRINT/uat"; echo uat > "$d/$SPRINT/uat/p5330.md"
  ( cd "$d" && git add "$SPRINT/uat/p5330.md" ) >/dev/null 2>&1; hand_close "$d" p5330
  ci_run "$d" push "$before" "$(head_of "$d")"; rc=$?
  if [[ $rc -ne 0 ]] && grep -q 'UAT' "$SCRATCH/ci.log"; then
    pass "C15b: a UAT copy added under done/ without its source is refused (job exit $rc)"
  else
    fail "C15b: an unpaired UAT addition passed (exit $rc)"; show "$SCRATCH/ci.log"
  fi
fi

# ── S. Shell-safety over every ship transcript above (P783) ────────────────
grep -E '^(git-ops|ship)[:[:space:]]|^\[GATE' "$SCRATCH/all-ship.log" > "$SCRATCH/own.log" 2>/dev/null || : > "$SCRATCH/own.log"
if [[ ! -s "$SCRATCH/own.log" ]]; then
  fail "S1: no git-ops or gate lines were captured — the shell-safety scan would be vacuous"
elif grep -q '[><|]' "$SCRATCH/own.log"; then
  fail "S1: a git-ops or gate status line carries a redirect or pipe character:"; grep -n '[><|]' "$SCRATCH/own.log" >&2
else
  pass "S1: no redirect or pipe characters in $(wc -l < "$SCRATCH/own.log" | tr -d ' ') git-ops and gate status lines across the run"
fi

# ── Result ──────────────────────────────────────────────────────────────────
echo ""
if [[ "$FAILURES" -ne 0 ]]; then
  echo "FAILED: $FAILURES P1444 invariant(s) (skipped: $SKIPS)"
  exit 1
fi
echo "PASS: all P1444 closure-gate invariants hold (skipped: $SKIPS)"
exit 0
