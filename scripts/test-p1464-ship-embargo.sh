#!/usr/bin/env bash
# test-p1464-ship-embargo.sh — hermetic canary for P1464: under
# `disclosure: embargo`, `git-ops.sh ship` must not land the embargoed spec on
# main through branch commits. (Its closing step is archive-spec since P1507;
# that step has its own suite, scripts/test-p1507-archive-spec.sh.)
#
# Acceptance Criteria mapping (features/p1464_*.md):
#   AC1 code-only + spec-only commits: code ships, spec withheld, journaled,
#       --resume a no-op ............................................ A1 (stub on main), A2 (branch-born, no stub)
#   AC2 mixed commit refused before any pick, main unchanged ......... B1 (stub on main), B2 (branch-born)
#   AC3 public spec on the same fixtures ships as before ............. C1 (main tree identical to the pre-fix script's)
#   AC5 (superseded by P1507) publish-spec is gone; main untouched ..... D1
#   Shell-safety: no > < | tokens in any ship / archive-spec output .. Z
#   Codex review findings: F0 final message, F1/F1b quoted names, F2 ambiguous
#   specs, F3 done/ + archive/, F4 conflict resume, F5 crash-window journal, F6 merges
#   Codex round 2 (content rule): G1 add-then-delete, G1b resume after branch
#   delete, G2 stub-named embargo file, G3 another P-number's embargoed spec
#   Codex round 3: H1 CRLF, H2 BOM, H3 indented YAML, H4 .markdown, H5 .MD,
#   H6 close commit on --resume refuses a staged embargoed spec
#   Codex round 4: I1 quoted keys, I2 bare pX.md UAT pairing, (I3 removed with publish-spec, P1507)
#   P1689 (a spec reclassified on the branch): J1 public first then embargo,
#   J2 the public-first commit also carries code, J3 renamed before the
#   reclassification, J4 reclassified then deleted at the tip, J5 renamed and
#   reclassified in one commit, J6 the same after an interrupted ship and --resume,
#   J3b two renames, J3c a rename between names that share nothing,
#   J7 an embargoed document renamed and declared public,
#   J7b the marker reversed, then renamed to another P-number's name,
#   J8 a staged conflict resolution carrying the public-first version,
#   J6c a pre-fix journal that had not reached the spec commits (needs GIT_OPS_BASELINE),
#   J6b a ship whose pre-fix half already landed the spec (needs GIT_OPS_BASELINE),
#   C2 a public branch with those shapes ships exactly as the pre-fix tool does,
#   K1 / K2 another session's commit to main's public copy does not stop the ship,
#   J9 a once-embargoed note renamed to the ship's own spec name is never seeded
#   Codex review of P1689: L1a/L1b/L1d/L1e a failed git read (change list, blob,
#   commit, staged blob) stops the ship, L1c an unreadable landed commit stops the
#   end-of-ship check, L2a the UAT pair of a spec protected only by a rename is
#   withheld, L2b and the end-of-ship check covers it, L3 a P1694 empty pick
#   recorded at another session's tip is not judged, L4a/L4b refusals print no
#   commit subject, L5 the staged-resolution refusal advises only git reset HEAD --
#
# Usage: scripts/test-p1464-ship-embargo.sh [path/to/git-ops.sh]
#   The optional argument runs the suite against another git-ops.sh (gate 7:
#   point it at the pre-fix copy and watch it fail). C1 always also runs the
#   pre-fix copy from HEAD as its baseline when GIT_OPS_BASELINE is set.
#
# Hermetic: scratch repos under mktemp; no network, no remote, no push.

set -uo pipefail

# Skip-safe precondition: git-ops' main.lock records the holder's start time via
# `ps -o lstart=` and dies without it, so every ship below would fail for a reason
# unrelated to the code under test. Say so and exit 77 (skipped), never 0.
if [[ -z "$( { ps -o lstart= -p $$ 2>/dev/null || true; } | tr -d '[:space:]' )" ]]; then
  echo "SKIP: ps cannot report process start times here (git-ops main.lock needs ps -o lstart); suite NOT run"
  exit 77
fi

unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

W="$(cd "$(dirname "$0")/.." && pwd)"
GIT_OPS_SRC="${1:-$W/scripts/git-ops.sh}"
SCRATCH="$(mktemp -d)"
trap '[[ -n "${KEEP:-}" ]] || rm -rf "$SCRATCH"' EXIT; echo "scratch: $SCRATCH"
SPRINT=features/done/2026-04-22
: > "$SCRATCH/all.log"

FAILURES=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }
show() { sed 's/^/    /' "$1" >&2; }

# mk <name> [git-ops source] — a main repo carrying the real ship scripts.
mk() {
  local d="$SCRATCH/$1" src="${2:-$GIT_OPS_SRC}"
  mkdir -p "$d/scripts/lib" "$d/$SPRINT" "$d/.claude/worktrees"
  cp "$src" "$d/scripts/git-ops.sh"
  cp "$W/scripts/ship-gates.sh" "$d/scripts/"
  cp "$W/scripts/lib/gate-override.sh" "$W/scripts/lib/admin-close.sh" \
     "$W/scripts/lib/worktree-changes.sh" "$d/scripts/lib/"
  chmod +x "$d/scripts/git-ops.sh" "$d/scripts/ship-gates.sh"
  : > "$d/$SPRINT/.gitkeep"
  ( cd "$d" && git init -q && git config user.email c@t && git config user.name c \
    && git config commit.gpgsign false && echo seed > README.md \
    && git add README.md scripts features && git commit -qm seed && git branch -M main ) >/dev/null 2>&1
  echo "$d"
}

# spec_body <pN> <disclosure> [extra line]
spec_body() {
  printf -- '---\nstatus: qa\ntype: bug\nrank: 1\ndisclosure: %s\ndelivery_stage: fix\npipeline_ran: [fix]\n---\n# %s: Demo\n\nSecret defect detail.\n%s\n## Done-When\n\n- [x] fixture criterion\n' \
    "$2" "$1" "${3:-}"
}
stub_body() {
  printf -- '---\nstatus: backlog\ntype: task\nrank: 9\ntags: [disclosure-embargo]\ndisclosure: public\n---\n# %s: Under disclosure embargo\n\nReserved.\n' "$1"
}

# add_stub <repo> <pN> — the neutral stub committed to main (create-bug step 4).
add_stub() {
  stub_body "$2" > "$1/features/$2_security-review-pending.md"
  ( cd "$1" && git add features && git commit -qm "spec($2): reserve number" ) >/dev/null 2>&1
}

# add_gated_stub <repo> <pN> — a stub ship-gates.sh can pass. ship-gates resolves
# the spec with a first-match, non -z grep limited to features/ top level, so for a
# non-ASCII or done/archive spec it gates the STUB instead (out of P1464 scope).
# This keeps those cases testing git-ops' classifier, not ship-gates' refusal.
add_gated_stub() {
  { stub_body "$2"; printf -- '\n## Done-When\n\n- [x] reserved\n'; } \
    | sed 's/^disclosure: public$/disclosure: public\npipeline_ran: [fix]/' > "$1/features/$2_security-review-pending.md"
  ( cd "$1" && git add features && git commit -qm "spec($2): reserve number" ) >/dev/null 2>&1
}

# branch_split <repo> <pN> <disclosure> — code-only commit, spec-only commit,
# spec-edit + UAT-pair commit (all three shapes AC1 cares about).
branch_split() {
  local d="$1" pn="$2" disc="$3"
  ( cd "$d" && git checkout -q -b "feature/${pn}-x" \
    && echo code > src.ts && git add src.ts && git commit -qm "fix(${pn}): code" \
    && spec_body "$pn" "$disc" > "features/${pn}_demo.md" && git add features && git commit -qm "spec(${pn}): add" \
    && mkdir -p features/uat && spec_body "$pn" "$disc" "Stamped." > "features/${pn}_demo.md" \
    && echo uat > "features/uat/${pn}.md" && git add features && git commit -qm "spec(${pn}): stamp + uat" \
    && git checkout -q main ) >/dev/null 2>&1
}

# branch_mixed <repo> <pN> <disclosure> — the P1454 shape: spec added WITH the code.
branch_mixed() {
  local d="$1" pn="$2" disc="$3"
  ( cd "$d" && git checkout -q -b "feature/${pn}-x" \
    && echo code > src.ts && spec_body "$pn" "$disc" > "features/${pn}_demo.md" \
    && git add src.ts features && git commit -qm "fix(${pn}): code and spec" \
    && echo more > more.ts && git add more.ts && git commit -qm "fix(${pn}): more code" \
    && git checkout -q main ) >/dev/null 2>&1
}

review_stamp() {
  local d="$1" pn="$2"
  printf '{"type": "code", "pn": "%s", "branch": "feature/%s-x", "sha": "%s", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' \
    "$pn" "$pn" "$(git -C "$d" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$d/.git/.finish-reviewed"
}

run() {  # run <repo> <args...> — git-ops, transcript in $SCRATCH/out.log
  local d="$1" rc=0; shift
  ( cd "$d" && bash scripts/git-ops.sh "$@" </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc=$?
  cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
  return $rc
}

# did any commit on main ever add or modify the embargoed spec / UAT pair?
spec_on_main_history() {
  local d="$1" pn="$2"
  [[ -n "$(git -C "$d" log main --format=%H -- "features/${pn}_demo.md" "features/uat/${pn}.md" "$SPRINT/${pn}_demo.md")" ]]
}
journal_of() { echo "$1/.claude/worktrees/.ship-journal/$2.json"; }
withheld_count() {
  python3 -c 'import json,sys; print(sum(1 for c in json.load(open(sys.argv[1]))["commits"] if c.get("withheld")))' "$1" 2>/dev/null || echo "none"
}

# ════════════════════════════════════════════════════════════════════════════
# A1 — stub on main, embargoed spec on the branch, code-only + spec-only commits
# ════════════════════════════════════════════════════════════════════════════
d="$(mk a1)"; add_stub "$d" p9001; branch_split "$d" p9001 embargo; review_stamp "$d" p9001
run "$d" ship p9001; rc=$?
cp "$SCRATCH/out.log" "$SCRATCH/a1.log"
j="$(journal_of "$d" p9001)"
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! spec_on_main_history "$d" p9001 \
   && git -C "$d" cat-file -e main:features/p9001_security-review-pending.md 2>/dev/null \
   && [[ "$(grep -c "withheld from main (embargoed spec only)" "$SCRATCH/out.log")" == "2" ]] \
   && git -C "$d" rev-parse --verify -q feature/p9001-x >/dev/null; then
  pass "A1: code shipped, spec + UAT pair never on main, stub kept, both spec-only commits withheld, branch retained (exit 0)"
else
  fail "A1: embargoed ship with stub on main (exit $rc)"; show "$SCRATCH/out.log"
fi
A1_REPO="$d"

# A3 — interrupted ship: withheld commits are journaled, and --resume never
# picks them. The interruption is a real code conflict AFTER the withholding.
d="$(mk a3)"; add_stub "$d" p9006
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base ) >/dev/null 2>&1
( cd "$d" && git checkout -q -b feature/p9006-x \
  && spec_body p9006 embargo > features/p9006_demo.md && git add features && git commit -qm "spec(p9006): add" \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9006): code" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
review_stamp "$d" p9006
j="$(journal_of "$d" p9006)"
run "$d" ship p9006; rc1=$?
w1="$(withheld_count "$j")"
if [[ $rc1 -ne 0 && "$w1" == "1" ]] && ! spec_on_main_history "$d" p9006; then
  pass "A3a: spec-only commit journaled withheld before the code conflict stopped the ship (exit $rc1)"
else
  fail "A3a: interrupted embargoed ship (exit $rc1, withheld=$w1)"; show "$SCRATCH/out.log"
fi
( cd "$d" && echo resolved > src.ts && git add src.ts ) >/dev/null 2>&1
run "$d" ship p9006 --resume; rc2=$?
if [[ $rc2 -eq 0 ]] && ! spec_on_main_history "$d" p9006 \
   && [[ "$(git -C "$d" show main:src.ts)" == "resolved" ]] \
   && ! grep -q "withheld from main (embargoed spec only)" "$SCRATCH/out.log"; then
  pass "A3b: --resume converges the code and does not re-pick or re-withhold the spec commit (exit 0)"
else
  fail "A3b: --resume after withholding (exit $rc2)"; show "$SCRATCH/out.log"
fi
h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9006 --resume; rc3=$?
if [[ "$(git -C "$d" rev-parse main)" == "$h0" ]] && ! spec_on_main_history "$d" p9006; then
  pass "A3c: a further --resume is a no-op on main (exit $rc3: journal already gone)"
else
  fail "A3c: repeated --resume moved main (exit $rc3)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# A2 — branch-born, NO stub on main (the original P1255 route)
# ════════════════════════════════════════════════════════════════════════════
d="$(mk a2)"; branch_split "$d" p9002 embargo; review_stamp "$d" p9002
run "$d" ship p9002; rc=$?
j="$(journal_of "$d" p9002)"
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! spec_on_main_history "$d" p9002 && [[ "$(grep -c "withheld from main (embargoed spec only)" "$SCRATCH/out.log")" == "2" ]]; then
  pass "A2: branch-born embargoed spec, no stub: code shipped, spec withheld + journaled (exit 0)"
else
  fail "A2: branch-born embargo (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# B1/B2 — a mixed commit is refused before any pick, main unchanged
# ════════════════════════════════════════════════════════════════════════════
for v in b1 b2; do
  pn=p9003; [[ $v == b2 ]] && pn=p9004
  d="$(mk $v)"; [[ $v == b1 ]] && add_stub "$d" $pn
  branch_mixed "$d" $pn embargo; review_stamp "$d" $pn
  h0="$(git -C "$d" rev-parse main)"
  mixed_sha="$(git -C "$d" rev-parse "feature/${pn}-x~1")"
  run "$d" ship $pn; rc=$?
  if [[ $rc -ne 0 ]] && [[ "$(git -C "$d" rev-parse main)" == "$h0" ]] \
     && git -C "$d" diff --quiet HEAD && ! git -C "$d" cat-file -e main:src.ts 2>/dev/null \
     && grep -q "$mixed_sha" "$SCRATCH/out.log" && grep -qi "split" "$SCRATCH/out.log" \
     && [[ ! -f "$(journal_of "$d" $pn)" ]]; then
    pass "$v: mixed spec+code commit refused before any pick (exit $rc), main unchanged, sha named, no stale journal"
  else
    fail "$v: mixed commit under embargo (exit $rc)"; show "$SCRATCH/out.log"
  fi
done

# ════════════════════════════════════════════════════════════════════════════
# C1 — the same fixture with disclosure: public ships exactly as before
# ════════════════════════════════════════════════════════════════════════════
c1_run() {  # c1_run <name> <git-ops source> — prints main's final tree id
  local d; d="$(mk "$1" "$2")"; branch_split "$d" p9005 public; review_stamp "$d" p9005
  run "$d" ship p9005 >/dev/null 2>&1; local rc=$?
  # Tree outside scripts/ (the copied git-ops.sh itself differs by design),
  # plus the commit subjects in order.
  echo "$rc $(git -C "$d" ls-tree -r main | grep -v '	scripts/' | git hash-object --stdin) $(git -C "$d" log --format=%s main | git hash-object --stdin)"
}
new_res="$(c1_run c1new "$GIT_OPS_SRC")"; cp "$SCRATCH/out.log" "$SCRATCH/c1new.log"
if [[ -n "${GIT_OPS_BASELINE:-}" ]]; then
  base_res="$(c1_run c1base "$GIT_OPS_BASELINE")"
  # The close commit stamps completed_at; strip the date-sensitive part by
  # comparing the code + count, and the spec location separately below.
  if [[ "$new_res" == "$base_res" && "${new_res%% *}" == "0" ]]; then
    pass "C1: public spec ships identically to the pre-fix script (rc tree count: $new_res)"
  else
    fail "C1: public ship diverged from baseline (new: $new_res, baseline: $base_res)"; show "$SCRATCH/c1new.log"
  fi
else
  d="$SCRATCH/c1new"
  if [[ "${new_res%% *}" == "0" ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
     && git -C "$d" cat-file -e "main:$SPRINT/p9005_demo.md" 2>/dev/null \
     && git -C "$d" cat-file -e main:features/uat/p9005.md 2>/dev/null \
     && ! grep -q withheld "$SCRATCH/c1new.log"; then
    pass "C1: public spec: every commit picked, spec closed to done (no baseline given)"
  else
    fail "C1: public ship (result $new_res)"; show "$SCRATCH/c1new.log"
  fi
fi

# ════════════════════════════════════════════════════════════════════════════
# D1 — P1507: publish-spec no longer exists; nothing on main changes
d="$A1_REPO"; h0="$(git -C "$d" rev-parse main)"; rc=0
( cd "$d" && bash scripts/git-ops.sh publish-spec p9001 --yes --skip-smoke </dev/null ) >/dev/null 2>&1 || rc=$?
if [[ $rc -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]]; then
  pass "D1: publish-spec is gone (exit $rc); main unchanged — sensitive specs are archived, never published"
else
  fail "D1: publish-spec still runs (exit $rc)"
fi

# ════════════════════════════════════════════════════════════════════════════
# Adversarial-review findings (Codex, 2026-10-12). One case per finding.
# ════════════════════════════════════════════════════════════════════════════

# F0 — the final message on an embargoed ship does not claim the branch is gone.
if grep -q "branch retained until archive-spec" "$SCRATCH/a1.log" \
   && ! grep -q "branch and journal cleaned up" "$SCRATCH/a1.log"; then
  pass "F0: embargoed ship's final line says the branch is retained, not cleaned up"
else
  fail "F0: embargoed ship's final message"; show "$SCRATCH/a1.log"
fi

# F1 — a non-ASCII spec name (C-quoted by core.quotePath) in a mixed commit.
d="$(mk f1)"; add_gated_stub "$d" p9012
( cd "$d" && git checkout -q -b feature/p9012-x \
  && echo code > src.ts && spec_body p9012 embargo > "features/p9012_é.md" \
  && git add src.ts features && git commit -qm "fix(p9012): code and spec" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9012; h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9012; rc=$?
if [[ $rc -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] && grep -qi "split" "$SCRATCH/out.log"; then
  pass "F1: mixed commit with a quoted (non-ASCII) spec name is refused (exit $rc), main unchanged"
else
  fail "F1: quoted spec name in a mixed commit (exit $rc)"; show "$SCRATCH/out.log"
fi

# F1b — the same non-ASCII spec, split correctly, ships withheld.
d="$(mk f1b)"; add_gated_stub "$d" p9017
( cd "$d" && git checkout -q -b feature/p9017-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9017): code" \
  && spec_body p9017 embargo > "features/p9017_é.md" && git add features && git commit -qm "spec(p9017): add" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9017
run "$d" ship p9017; rc1=$?
leaked="$(git -C "$d" log main -z --name-only --format= | tr '\0' '\n' | grep -c 'p9017_é' || true)"
if [[ $rc1 -eq 0 && "$leaked" == "0" ]]; then
  pass "F1b: non-ASCII embargoed spec withheld at ship (exit 0), never on main"
else
  fail "F1b: non-ASCII spec ship (ship $rc1, leaked $leaked)"; show "$SCRATCH/out.log"
fi

# F2 — two non-stub specs disagreeing on disclosure: ship and archive-spec refuse.
d="$(mk f2)"; add_stub "$d" p9011
( cd "$d" && git checkout -q -b feature/p9011-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9011): code" \
  && spec_body p9011 public > features/p9011_aaa.md && git add features && git commit -qm "spec(p9011): aaa" \
  && spec_body p9011 embargo > features/p9011_zzz.md && git add features && git commit -qm "spec(p9011): zzz" \
  && git checkout -q main ) >/dev/null 2>&1
( cd "$d" && printf '.private/\n' > .gitignore && git add .gitignore && git commit -qm ignore \
  && mkdir .private && cd .private && git init -q && git config user.email c@t && git config user.name c \
  && echo i > INDEX.md && git add INDEX.md && git commit -qm s ) >/dev/null 2>&1
review_stamp "$d" p9011; h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9011; rc1=$?; cp "$SCRATCH/out.log" "$SCRATCH/f2.log"
run "$d" archive-spec p9011 --yes --skip-smoke; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && grep -q "disagree on disclosure" "$SCRATCH/f2.log" && grep -q "ambiguous" "$SCRATCH/out.log"; then
  pass "F2: public + embargoed specs on one branch: ship refuses (exit $rc1), archive-spec refuses (exit $rc2), main unchanged"
else
  fail "F2: ambiguous specs (ship $rc1, archive $rc2)"; show "$SCRATCH/f2.log"; show "$SCRATCH/out.log"
fi

# F3 — the spec placed under features/done/ or features/archive/ is still protected.
d="$(mk f3)"; add_gated_stub "$d" p9013
( cd "$d" && git checkout -q -b feature/p9013-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9013): code" \
  && spec_body p9013 embargo > "$SPRINT/p9013_demo.md" && git add features && git commit -qm "spec(p9013): in done" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9013
run "$d" ship p9013; rc1=$?; cp "$SCRATCH/out.log" "$SCRATCH/f3.log"
d2="$(mk f3b)"; add_gated_stub "$d2" p9018
( cd "$d2" && git checkout -q -b feature/p9018-x && mkdir -p features/archive \
  && echo code > src.ts && spec_body p9018 embargo > features/archive/p9018_demo.md \
  && git add src.ts features && git commit -qm "fix(p9018): code and archived spec" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d2" p9018; h0="$(git -C "$d2" rev-parse main)"
run "$d2" ship p9018; rc2=$?
if [[ $rc1 -eq 0 ]] && [[ -z "$(git -C "$d" log main --format=%H -- "$SPRINT/p9013_demo.md")" ]] \
   && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && [[ $rc2 -ne 0 && "$(git -C "$d2" rev-parse main)" == "$h0" ]]; then
  pass "F3: a spec under done/ is withheld (exit 0); a mixed commit with an archive/ spec is refused (exit $rc2)"
else
  fail "F3: done/ and archive/ specs (ship $rc1, archive ship $rc2)"; show "$SCRATCH/f3.log"; show "$SCRATCH/out.log"
fi

# F4 — a conflict resolution that stages the embargoed spec is refused on --resume.
d="$(mk f4)"; add_stub "$d" p9014
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9014-x \
  && spec_body p9014 embargo > features/p9014_demo.md && git add features && git commit -qm "spec(p9014): add" \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9014): code" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
review_stamp "$d" p9014
run "$d" ship p9014; rc1=$?
( cd "$d" && echo resolved > src.ts && git show feature/p9014-x:features/p9014_demo.md > features/p9014_demo.md \
  && git add src.ts features/p9014_demo.md ) >/dev/null 2>&1
h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9014 --resume; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && ! spec_on_main_history "$d" p9014 && [[ -f "$(journal_of "$d" p9014)" ]] \
   && grep -q "staged resolution adds or modifies an embargoed spec" "$SCRATCH/out.log"; then
  pass "F4: --resume refuses a staged resolution carrying the spec (exit $rc2), nothing committed, journal kept"
else
  fail "F4: conflict resume with staged spec (first $rc1, resume $rc2)"; show "$SCRATCH/out.log"
fi

# F5 — crash window: zero landed_sha but a pick was attempted and main moved.
# The mixed-commit refusal must KEEP the journal.
d="$(mk f5)"; add_stub "$d" p9015
( cd "$d" && git checkout -q -b feature/p9015-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9015): code" \
  && echo more > more.ts && spec_body p9015 embargo > features/p9015_demo.md \
  && git add more.ts features && git commit -qm "fix(p9015): mixed" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9015
start="$(git -C "$d" rev-parse main)"
c1="$(git -C "$d" rev-parse feature/p9015-x~1)"; c2="$(git -C "$d" rev-parse feature/p9015-x)"
( cd "$d" && git cherry-pick "$c1" ) >/dev/null 2>&1   # landed, but the journal never heard
mkdir -p "$d/.claude/worktrees/.ship-journal"
python3 - "$(journal_of "$d" p9015)" "$c1" "$c2" "$start" <<'PY'
import json, sys
path, c1, c2, start = sys.argv[1:]
json.dump({"p_number": "p9015", "started_at": "t", "session_id": "s",
           "source_branch": "feature/p9015-x", "spec_file": "features/p9015_security-review-pending.md",
           "start_head": start,
           "commits": [{"source_sha": c1, "landed_sha": None, "landed_at": None, "pre_pick_head": start},
                       {"source_sha": c2, "landed_sha": None, "landed_at": None, "pre_pick_head": None}],
           "spec_closed": False, "branch_deleted": False}, open(path, "w"), indent=2)
PY
run "$d" ship p9015 --resume; rc=$?
if [[ $rc -ne 0 && -f "$(journal_of "$d" p9015)" ]] && grep -q "$c2" "$SCRATCH/out.log" \
   && grep -q "journal kept" "$SCRATCH/out.log"; then
  pass "F5: refusal after an attempted pick keeps the journal (exit $rc) and says how to proceed"
else
  fail "F5: crash-window journal (exit $rc, journal present: $([[ -f "$(journal_of "$d" p9015)" ]] && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# F6 — a merge commit on an embargoed branch is refused before any pick.
d="$(mk f6)"; add_stub "$d" p9016
( cd "$d" && git checkout -q -b feature/p9016-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9016): code" \
  && git checkout -q -b side \
  && spec_body p9016 embargo > features/p9016_demo.md && git add features && git commit -qm "spec(p9016): add" \
  && git checkout -q feature/p9016-x && echo x > x.ts && git add x.ts && git commit -qm "fix(p9016): x" \
  && git merge -q --no-ff --no-edit side && git branch -D side \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9016; h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9016; rc=$?
if [[ $rc -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] && grep -q "merge commits" "$SCRATCH/out.log" \
   && [[ ! -f "$(journal_of "$d" p9016)" ]]; then
  pass "F6: a merge commit under embargo is refused before any pick (exit $rc), main unchanged, journal removed"
else
  fail "F6: merge commit under embargo (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Codex round 2: leaks from path / P-number classification. The content rule
# (any features/**.md whose blob says disclosure: embargo) must close each.
# ════════════════════════════════════════════════════════════════════════════

# public_spec_on_main <repo> <pN> — a shippable public spec committed to main.
public_spec_on_main() {
  spec_body "$2" public > "$1/features/$2_demo.md"
  ( cd "$1" && git add features && git commit -qm "spec($2): add" ) >/dev/null 2>&1
}
in_main_history() { [[ -n "$(git -C "$1" log main --format=%H -- "$2")" ]]; }

# G1 — embargoed spec added, then deleted at the tip: the tip shows nothing.
d="$(mk g1)"; public_spec_on_main "$d" p9101
( cd "$d" && git checkout -q -b feature/p9101-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9101): code" \
  && spec_body p9101 embargo > features/p9101_secret.md && git add features && git commit -qm "spec(p9101): secret" \
  && git rm -q features/p9101_secret.md && git commit -qm "spec(p9101): drop secret" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9101
run "$d" ship p9101; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! in_main_history "$d" features/p9101_secret.md; then
  pass "G1: a spec embargoed in history but deleted at the tip never reaches main (exit 0)"
else
  fail "G1: add-then-delete embargoed spec (exit $rc)"; show "$SCRATCH/out.log"
fi

# G1b — interrupted embargoed ship; operator deletes the spec from the retained
# branch, then stages it in the conflict resolution. --resume must refuse.
# Since P1198 (refuse-on-drift, 2026-10-14) the "drop spec" commit is branch
# drift, so --resume refuses before Phase 1 ever reads the staged resolution;
# the staged-resolution refusal itself stays pinned by the scenario above.
d="$(mk g1b)"; add_gated_stub "$d" p9104
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9104-x \
  && spec_body p9104 embargo > features/p9104_demo.md && git add features && git commit -qm "spec(p9104): add" \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9104): code" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
review_stamp "$d" p9104
run "$d" ship p9104; rc1=$?
spec_blob="$(git -C "$d" show feature/p9104-x:features/p9104_demo.md)"
( cd "$d" && git branch -q tmp-del feature/p9104-x && git worktree add -q "$SCRATCH/g1b-wt" tmp-del \
  && cd "$SCRATCH/g1b-wt" && git rm -q features/p9104_demo.md && git commit -qm "drop spec" \
  && cd "$d" && git branch -q -f feature/p9104-x tmp-del && git worktree remove --force "$SCRATCH/g1b-wt" \
  && git branch -q -D tmp-del ) >/dev/null 2>&1
( cd "$d" && echo resolved > src.ts && printf '%s\n' "$spec_blob" > features/p9104_demo.md \
  && git add src.ts features/p9104_demo.md ) >/dev/null 2>&1
h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9104 --resume; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && ! in_main_history "$d" features/p9104_demo.md \
   && grep -q "no longer matches this ship's journal" "$SCRATCH/out.log" \
   && [[ -z "$(git -C "$d" ls-tree -r --name-only feature/p9104-x -- features/p9104_demo.md)" ]]; then
  pass "G1b: after the spec is deleted from the branch, --resume refuses (branch drift, P1198) and lands nothing (exit $rc2)"
else
  fail "G1b: resume after branch-side delete (first $rc1, resume $rc2)"; show "$SCRATCH/out.log"
fi

# G2 — a stub-NAMED file below top level carrying embargo content.
d="$(mk g2)"; add_gated_stub "$d" p9102
( cd "$d" && git checkout -q -b feature/p9102-x && mkdir -p features/archive \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9102): code" \
  && spec_body p9102 embargo > features/archive/p9102_security-review-pending.md \
  && git add features && git commit -qm "spec(p9102): archived" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9102
run "$d" ship p9102; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! in_main_history "$d" features/archive/p9102_security-review-pending.md; then
  pass "G2: embargo content under a stub filename in archive/ is withheld (exit 0)"
else
  fail "G2: stub-named embargoed file (exit $rc)"; show "$SCRATCH/out.log"
fi

# G3 — shipping public pA whose commits add ANOTHER P-number's embargoed spec.
d="$(mk g3)"; public_spec_on_main "$d" p9103
( cd "$d" && git checkout -q -b feature/p9103-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9103): code" \
  && spec_body p9199 embargo > features/p9199_secret.md && mkdir -p features/uat && echo u > features/uat/p9199.md \
  && git add features && git commit -qm "spec(p9199): secret" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9103
run "$d" ship p9103; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! in_main_history "$d" features/p9199_secret.md && ! in_main_history "$d" features/uat/p9199.md \
   && git -C "$d" cat-file -e "main:$SPRINT/p9103_demo.md" 2>/dev/null \
   && git -C "$d" rev-parse -q --verify feature/p9103-x >/dev/null; then
  pass "G3: pB's embargoed spec + UAT pair withheld while shipping public pA (exit 0); pA closed; branch kept"
else
  fail "G3: other P-number's embargoed spec (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Codex round 3: frontmatter normalization, extensions, close-on-resume.
# H1-H5 ship public pA whose spec-only commit adds pB's embargoed file in a
# variant encoding or extension; it must be withheld, never reach main.
# ════════════════════════════════════════════════════════════════════════════
variant_case() {  # <name> <pA> <pB> <relative path> <content printf-format>
  local name="$1" pa="$2" pb="$3" rel="$4" fmt="$5" d rc
  d="$(mk "$name")"; public_spec_on_main "$d" "$pa"
  ( cd "$d" && git checkout -q -b "feature/${pa}-x" \
    && echo code > src.ts && git add src.ts && git commit -qm "fix(${pa}): code" \
    && printf -- "$fmt" "$pb" > "$rel" && git add -- "$rel" && git commit -qm "spec(${pb}): variant" \
    && git checkout -q main ) >/dev/null 2>&1
  # Fixture control: the variant file must really exist on the branch, or the
  # leak check below passes vacuously (it did once, on a printf option bug).
  if [[ -z "$(git -C "$d" ls-tree --name-only "feature/${pa}-x" -- "$rel")" ]]; then
    fail "$name: fixture did not commit $rel"; return 0
  fi
  review_stamp "$d" "$pa"
  run "$d" ship "$pa"; rc=$?
  if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && ! in_main_history "$d" "$rel"; then
    pass "$name: embargoed $rel withheld (exit 0)"
  else
    fail "$name: $rel reached main or ship failed (exit $rc)"; show "$SCRATCH/out.log"
  fi
}
variant_case h1-crlf     p9201 p9291 features/p9291_crlf.md     $'---\r\nstatus: qa\r\ndisclosure: embargo\r\n---\r\n# %s: secret\r\n'
variant_case h2-bom      p9202 p9292 features/p9292_bom.md      $'\xef\xbb\xbf---\nstatus: qa\ndisclosure: embargo\n---\n# %s: secret\n'
variant_case h3-indent   p9203 p9293 features/p9293_indent.md   $'  ---\n  status: qa\n  disclosure: embargo\n  ---\n# %s: secret\n'
variant_case h4-markdown p9204 p9294 features/p9294_x.markdown   $'---\ndisclosure: embargo\n---\n# %s: secret\n'
variant_case h5-upper-md p9205 p9295 features/p9295_x.MD         $'---\ndisclosure: embargo\n---\n# %s: secret\n'

# H6 — close on --resume: code already landed, spec_closed false, and the local
# spec on main has been edited to `disclosure: embargo` and staged. The close
# commit must refuse instead of moving it into features/done/.
d="$(mk h6)"; public_spec_on_main "$d" p9206
( cd "$d" && git checkout -q -b feature/p9206-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9206): code" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9206
start="$(git -C "$d" rev-parse main)"; c1="$(git -C "$d" rev-parse feature/p9206-x)"
( cd "$d" && git cherry-pick "$c1" ) >/dev/null 2>&1
landed="$(git -C "$d" rev-parse main)"
mkdir -p "$d/.claude/worktrees/.ship-journal"
python3 - "$(journal_of "$d" p9206)" "$c1" "$landed" "$start" <<'PY'
import json, sys
path, c1, landed, start = sys.argv[1:]
json.dump({"p_number": "p9206", "started_at": "t", "session_id": "s",
           "source_branch": "feature/p9206-x", "spec_file": "features/p9206_demo.md",
           "start_head": start,
           "commits": [{"source_sha": c1, "landed_sha": landed, "landed_at": "t", "pre_pick_head": start}],
           "spec_closed": False, "branch_deleted": False}, open(path, "w"), indent=2)
PY
( cd "$d" && sed -i '' 's/^disclosure: public$/disclosure: embargo/' features/p9206_demo.md \
  && git add features/p9206_demo.md ) >/dev/null 2>&1
run "$d" ship p9206 --resume; rc=$?
if [[ $rc -ne 0 ]] && [[ "$(git -C "$d" rev-parse main)" == "$landed" ]] \
   && ! in_main_history "$d" "$SPRINT/p9206_demo.md" \
   && grep -q "refusing the spec-close commit" "$SCRATCH/out.log"; then
  pass "H6: a staged spec turned embargo is refused at the close commit on --resume (exit $rc), nothing committed"
else
  fail "H6: close-on-resume with an embargoed local spec (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Codex round 4: quoted keys, bare pX.md UAT pairing.
# ════════════════════════════════════════════════════════════════════════════
variant_case i1a-dquote-key p9301 p9391 features/p9391_q.md $'---\n"disclosure": embargo\n---\n# %s: secret\n'
variant_case i1b-squote-key p9304 p9394 features/p9394_q.md $'---\n\'disclosure\' : "embargo"\n---\n# %s: secret\n'

# I2 — embargoed spec named bare pX.md: its UAT pair, in its own commit, is withheld too.
d="$(mk i2)"; public_spec_on_main "$d" p9302
( cd "$d" && git checkout -q -b feature/p9302-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9302): code" \
  && spec_body p9393 embargo > features/p9393.md && git add features && git commit -qm "spec(p9393): bare" \
  && mkdir -p features/uat && echo u > features/uat/p9393.md && git add features && git commit -qm "uat(p9393)" \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9302
run "$d" ship p9302; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null \
   && ! in_main_history "$d" features/p9393.md && ! in_main_history "$d" features/uat/p9393.md; then
  pass "I2: bare features/p9393.md embargoed: spec and its UAT pair both withheld (exit 0)"
else
  fail "I2: bare pX.md UAT pairing (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# P1689: a spec reclassified on the branch. The content rule judges each commit
# by the disclosure the file carried AT that commit, so a spec first committed
# `disclosure: public` and marked embargo later had its early commits picked.
# Once any commit of the range (or the tip) says embargo for a file, every
# commit touching that file, under any name it had in the range, is protected.
# ════════════════════════════════════════════════════════════════════════════

# Fixture control: a fixture whose commits did not all land would let the
# "never on main" checks below pass with nothing to withhold.
fixture_commits() {  # <repo> <branch> <expected commits ahead of main's fork point> <case>
  local n; n="$(git -C "$1" rev-list --count "$(git -C "$1" merge-base main "$2")..$2" 2>/dev/null || echo 0)"
  [[ "$n" == "$3" ]] || fail "$4: fixture built $n commit(s) on $2, expected $3 — the result below is not evidence"
}
# After a ship nothing may be left at any features/ path of the main checkout or
# its index: "in no commit on main" alone would pass a file written and cleaned up.
features_clean() { [[ -z "$(git -C "$1" status --porcelain -- features 2>/dev/null)" ]]; }
SKIPPED=0

# J1 — spec-only commits: added public, reclassified embargo by a later commit.
d="$(mk j1)"
( cd "$d" && git checkout -q -b feature/p9401-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9401): code" \
  && spec_body p9401 public > features/p9401_demo.md && git add features && git commit -qm "spec(p9401): add" \
  && spec_body p9401 embargo "Reclassified." > features/p9401_demo.md && git add features && git commit -qm "spec(p9401): reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9401-x 3 J1
review_stamp "$d" p9401
run "$d" ship p9401; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9401_demo.md \
   && [[ "$(grep -c "withheld from main (embargoed spec only)" "$SCRATCH/out.log")" == "2" ]]; then
  pass "J1: a spec committed public, then reclassified embargo: both spec commits withheld, code shipped (exit 0)"
else
  fail "J1: public-first spec reached main or ship failed (exit $rc; on main: $(git -C "$d" log main --format=%s -- features/p9401_demo.md | tr '\n' ';'))"; show "$SCRATCH/out.log"
fi

# J2 — the public-first commit also carries code: refuse before any pick.
d="$(mk j2)"
( cd "$d" && git checkout -q -b feature/p9402-x \
  && echo code > src.ts && spec_body p9402 public > features/p9402_demo.md \
  && git add src.ts features && git commit -qm "fix(p9402): code and spec" \
  && spec_body p9402 embargo "Reclassified." > features/p9402_demo.md && git add features && git commit -qm "spec(p9402): reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9402-x 2 J2
review_stamp "$d" p9402; h0="$(git -C "$d" rev-parse main)"
mixed_sha="$(git -C "$d" rev-parse feature/p9402-x~1)"
run "$d" ship p9402; rc=$?
if [[ $rc -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] && features_clean "$d" \
   && ! in_main_history "$d" features/p9402_demo.md \
   && grep -q "$mixed_sha" "$SCRATCH/out.log" && grep -qi "split" "$SCRATCH/out.log" \
   && [[ ! -f "$(journal_of "$d" p9402)" ]]; then
  pass "J2: a public-first commit carrying code AND the later-embargoed spec is refused before any pick (exit $rc), sha named"
else
  fail "J2: public-first mixed commit (exit $rc; main moved: $([[ "$(git -C "$d" rev-parse main)" == "$h0" ]] && echo no || echo yes))"; show "$SCRATCH/out.log"
fi

# J3 — renamed while still public, reclassified afterwards: the old name is
# the same spec and must not reach main either.
d="$(mk j3)"
( cd "$d" && git checkout -q -b feature/p9403-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9403): code" \
  && spec_body p9403 public > features/p9403_first_name.md && git add features && git commit -qm "spec(p9403): add" \
  && git mv features/p9403_first_name.md features/p9403_neutral.md && git commit -qm "spec(p9403): rename" \
  && spec_body p9403 embargo "Reclassified." > features/p9403_neutral.md && git add features && git commit -qm "spec(p9403): reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9403-x 4 J3
review_stamp "$d" p9403
run "$d" ship p9403; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9403_first_name.md && ! in_main_history "$d" features/p9403_neutral.md; then
  pass "J3: a spec renamed while public and reclassified later: neither name reaches main (exit 0)"
else
  fail "J3: renamed-then-reclassified spec (exit $rc; old name on main: $(in_main_history "$d" features/p9403_first_name.md && echo yes || echo no), new name on main: $(in_main_history "$d" features/p9403_neutral.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J4 — added public, reclassified, then deleted at the tip: the tip shows nothing.
d="$(mk j4)"; public_spec_on_main "$d" p9404
( cd "$d" && git checkout -q -b feature/p9404-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9404): code" \
  && spec_body p9404 public "Second document." > features/p9404_secret.md && git add features && git commit -qm "spec(p9404): second doc" \
  && spec_body p9404 embargo "Second document." > features/p9404_secret.md && git add features && git commit -qm "spec(p9404): reclassify" \
  && git rm -q features/p9404_secret.md && git commit -qm "spec(p9404): drop" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9404-x 4 J4
review_stamp "$d" p9404
run "$d" ship p9404; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9404_secret.md; then
  pass "J4: public first, reclassified, deleted at the tip: never reaches main (exit 0)"
else
  fail "J4: public-first spec deleted at the tip (exit $rc; on main: $(git -C "$d" log main --format=%s -- features/p9404_secret.md | tr '\n' ';'))"; show "$SCRATCH/out.log"
fi

# J5 — renamed AND reclassified by one commit. That commit holds only spec
# changes, so it is withheld, not refused as "spec and other files".
d="$(mk j5)"
( cd "$d" && git checkout -q -b feature/p9405-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9405): code" \
  && spec_body p9405 public > features/p9405_first_name.md && git add features && git commit -qm "spec(p9405): add" \
  && git mv features/p9405_first_name.md features/p9405_neutral.md \
  && spec_body p9405 embargo > features/p9405_neutral.md && git add features && git commit -qm "spec(p9405): rename and reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9405-x 3 J5
review_stamp "$d" p9405
run "$d" ship p9405; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9405_first_name.md && ! in_main_history "$d" features/p9405_neutral.md; then
  pass "J5: renamed and reclassified in one commit: withheld under both names, code shipped (exit 0)"
else
  fail "J5: rename-and-reclassify commit (exit $rc; old name on main: $(in_main_history "$d" features/p9405_first_name.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J6 — J1's shape behind a code conflict: the interrupted ship and its --resume
# must not land the public-first commit either.
d="$(mk j6)"
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9406-x \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9406): code" \
  && spec_body p9406 public > features/p9406_demo.md && git add features && git commit -qm "spec(p9406): add" \
  && spec_body p9406 embargo "Reclassified." > features/p9406_demo.md && git add features && git commit -qm "spec(p9406): reclassify" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
fixture_commits "$d" feature/p9406-x 3 J6
review_stamp "$d" p9406
run "$d" ship p9406; rc1=$?
( cd "$d" && echo resolved > src.ts && git add src.ts ) >/dev/null 2>&1
run "$d" ship p9406 --resume; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -eq 0 ]] && [[ "$(git -C "$d" show main:src.ts)" == "resolved" ]] \
   && ! in_main_history "$d" features/p9406_demo.md; then
  pass "J6: interrupted ship then --resume: the public-first spec commit is never picked (first exit $rc1, resume exit 0)"
else
  fail "J6: public-first spec across --resume (first $rc1, resume $rc2; on main: $(git -C "$d" log main --format=%s -- features/p9406_demo.md | tr '\n' ';'))"; show "$SCRATCH/out.log"
fi

# J3b — two renames while public, then reclassified: every earlier name is the
# same spec (the rename links are followed to a fixpoint, not one hop).
d="$(mk j3b)"
( cd "$d" && git checkout -q -b feature/p9410-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9410): code" \
  && spec_body p9410 public > features/p9410_name_a.md && git add features && git commit -qm "spec(p9410): add" \
  && git mv features/p9410_name_a.md features/p9410_name_b.md && git commit -qm "spec(p9410): rename" \
  && git mv features/p9410_name_b.md features/p9410_name_c.md && git commit -qm "spec(p9410): rename again" \
  && spec_body p9410 embargo "Reclassified." > features/p9410_name_c.md && git add features && git commit -qm "spec(p9410): reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9410-x 5 J3b
review_stamp "$d" p9410
run "$d" ship p9410; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9410_name_a.md && ! in_main_history "$d" features/p9410_name_b.md \
   && ! in_main_history "$d" features/p9410_name_c.md; then
  pass "J3b: renamed twice while public, then reclassified: none of the three names reaches main (exit 0)"
else
  fail "J3b: two-hop rename (exit $rc; a/b/c on main: $(in_main_history "$d" features/p9410_name_a.md && echo yes || echo no)/$(in_main_history "$d" features/p9410_name_b.md && echo yes || echo no)/$(in_main_history "$d" features/p9410_name_c.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J3c — J3 with names that share nothing: no P-number, another directory, another
# base name. Only the rename link can connect them.
d="$(mk j3c)"; public_spec_on_main "$d" p9418
( cd "$d" && git checkout -q -b feature/p9418-x && mkdir -p features/notes features/archive \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9418): code" \
  && spec_body p9499 public > features/notes/alpha.md && git add features && git commit -qm "notes: add" \
  && git mv features/notes/alpha.md features/archive/omega.md && git commit -qm "notes: move" \
  && spec_body p9499 embargo "Reclassified." > features/archive/omega.md && git add features && git commit -qm "notes: reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9418-x 4 J3c
review_stamp "$d" p9418
run "$d" ship p9418; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/notes/alpha.md && ! in_main_history "$d" features/archive/omega.md; then
  pass "J3c: renamed between names that share nothing, then reclassified: neither name reaches main (exit 0)"
else
  fail "J3c: rename between unrelated names (exit $rc; old/new name on main: $(in_main_history "$d" features/notes/alpha.md && echo yes || echo no)/$(in_main_history "$d" features/archive/omega.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J7 — the other direction: an embargoed document renamed AND declared public
# by one commit. The verdict is never downgraded, so the new name is withheld
# too; pre-fix this was refused as "spec and other files" with a split advised.
d="$(mk j7)"; public_spec_on_main "$d" p9411
( cd "$d" && git checkout -q -b feature/p9411-x && mkdir -p features/notes \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9411): code" \
  && spec_body p9499 embargo > features/notes/first.md && git add features && git commit -qm "notes: add" \
  && git mv features/notes/first.md features/notes/second.md \
  && spec_body p9499 public > features/notes/second.md && git add features && git commit -qm "notes: rename and declassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9411-x 3 J7
review_stamp "$d" p9411
run "$d" ship p9411; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/notes/first.md && ! in_main_history "$d" features/notes/second.md; then
  pass "J7: an embargoed document renamed and declared public in one commit stays withheld under both names (exit 0)"
else
  fail "J7: rename-and-declassify commit (exit $rc; new name on main: $(in_main_history "$d" features/notes/second.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J7b — the marker reversed first, the file renamed by a LATER commit, and to a
# name that carries another P-number: no file-name rule can link the two, only
# the rename link followed forward from the once-embargoed path.
d="$(mk j7b)"; public_spec_on_main "$d" p9415
( cd "$d" && git checkout -q -b feature/p9415-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9415): code" \
  && spec_body p9413 embargo > features/p9413_a.md && git add features && git commit -qm "notes: add" \
  && spec_body p9413 public > features/p9413_a.md && git add features && git commit -qm "notes: declassify" \
  && git mv features/p9413_a.md features/p9414_b.md && git commit -qm "notes: rename" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9415-x 4 J7b
review_stamp "$d" p9415
run "$d" ship p9415; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/p9413_a.md && ! in_main_history "$d" features/p9414_b.md; then
  pass "J7b: embargoed, declared public, then renamed to another P-number's name: withheld under both names (exit 0)"
else
  fail "J7b: marker reversed then renamed (exit $rc; old/new name on main: $(in_main_history "$d" features/p9413_a.md && echo yes || echo no)/$(in_main_history "$d" features/p9414_b.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J8 — F4's guard for the public-first version: an operator's conflict resolution
# that stages the spec as it was BEFORE it was reclassified is refused on --resume.
d="$(mk j8)"
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9412-x \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9412): code" \
  && spec_body p9412 public > features/p9412_demo.md && git add features && git commit -qm "spec(p9412): add" \
  && spec_body p9412 embargo "Reclassified." > features/p9412_demo.md && git add features && git commit -qm "spec(p9412): reclassify" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
fixture_commits "$d" feature/p9412-x 3 J8
review_stamp "$d" p9412
run "$d" ship p9412; rc1=$?
( cd "$d" && echo resolved > src.ts && git show feature/p9412-x~1:features/p9412_demo.md > features/p9412_demo.md \
  && git add src.ts features/p9412_demo.md ) >/dev/null 2>&1
h0="$(git -C "$d" rev-parse main)"
run "$d" ship p9412 --resume; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && ! in_main_history "$d" features/p9412_demo.md \
   && grep -q "staged resolution adds or modifies an embargoed spec" "$SCRATCH/out.log"; then
  pass "J8: --resume refuses a staged resolution carrying the spec's public-first version (exit $rc2), nothing committed"
else
  fail "J8: staged public-first version on --resume (first $rc1, resume $rc2; on main: $(in_main_history "$d" features/p9412_demo.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# J6b — the first half of the ship ran on the PRE-FIX tool and landed the
# public-first commit before a code conflict stopped it; the resume runs on the
# tool under test. It cannot take the commit back, so it must refuse to report
# success: non-zero, the path and the landed commit named, no "Ready to push".
if [[ -n "${GIT_OPS_BASELINE:-}" ]]; then
  d="$(mk j6b "$GIT_OPS_BASELINE")"
  ( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
    && git checkout -q -b feature/p9409-x \
    && spec_body p9409 public > features/p9409_demo.md && git add features && git commit -qm "spec(p9409): add" \
    && spec_body p9409 embargo "Reclassified." > features/p9409_demo.md && git add features && git commit -qm "spec(p9409): reclassify" \
    && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9409): code" \
    && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
  fixture_commits "$d" feature/p9409-x 3 J6b
  review_stamp "$d" p9409
  run "$d" ship p9409; rc1=$?
  leaked="$(git -C "$d" log main --format=%H -- features/p9409_demo.md | sed -n '1p')"
  if [[ $rc1 -eq 0 || -z "$leaked" ]]; then
    fail "J6b: fixture — the pre-fix half was meant to land the public-first commit and stop on a conflict (exit $rc1, landed: ${leaked:-none}); the result below is not evidence"
  fi
  ( cd "$d" && echo resolved > src.ts && git add src.ts ) >/dev/null 2>&1
  rc2=0; ( cd "$d" && bash "$GIT_OPS_SRC" ship p9409 --resume </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc2=$?
  cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
  if [[ $rc2 -ne 0 ]] && grep -q "features/p9409_demo.md" "$SCRATCH/out.log" \
     && grep -q "${leaked:0:12}" "$SCRATCH/out.log" && ! grep -q "Ready to push" "$SCRATCH/out.log" \
     && [[ -f "$(journal_of "$d" p9409)" ]]; then
    pass "J6b: resuming a ship whose pre-fix half already landed the spec refuses to report success (exit $rc2), names the path and the commit, keeps the journal"
  else
    fail "J6b: resume after a pre-fix leak (first $rc1, resume $rc2; said Ready to push: $(grep -q "Ready to push" "$SCRATCH/out.log" && echo yes || echo no))"; show "$SCRATCH/out.log"
  fi
else
  SKIPPED=$((SKIPPED + 1)); echo "SKIP: J6b needs the pre-fix tool — set GIT_OPS_BASELINE=<pre-fix git-ops.sh> (not run, not a pass)"
fi

# J6c — the pre-fix half stopped on a code conflict BEFORE it reached the spec
# commits, and its journal already marks the reclassifying commit withheld. The
# resume on the tool under test sees only the public-first commit as pending, so
# it withholds it only if discovery reads the whole range, not the pending list.
if [[ -n "${GIT_OPS_BASELINE:-}" ]]; then
  d="$(mk j6c "$GIT_OPS_BASELINE")"
  ( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
    && git checkout -q -b feature/p9416-x \
    && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9416): code" \
    && spec_body p9416 public > features/p9416_demo.md && git add features && git commit -qm "spec(p9416): add" \
    && spec_body p9416 embargo "Reclassified." > features/p9416_demo.md && git add features && git commit -qm "spec(p9416): reclassify" \
    && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
  fixture_commits "$d" feature/p9416-x 3 J6c
  review_stamp "$d" p9416
  run "$d" ship p9416; rc1=$?
  if [[ $rc1 -eq 0 ]] || in_main_history "$d" features/p9416_demo.md || [[ ! -f "$(journal_of "$d" p9416)" ]]; then
    fail "J6c: fixture — the pre-fix half was meant to stop on the code conflict with nothing landed and a journal left (exit $rc1); the result below is not evidence"
  fi
  ( cd "$d" && echo resolved > src.ts && git add src.ts ) >/dev/null 2>&1
  rc2=0; ( cd "$d" && bash "$GIT_OPS_SRC" ship p9416 --resume </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc2=$?
  cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
  if [[ $rc2 -eq 0 ]] && [[ "$(git -C "$d" show main:src.ts)" == "resolved" ]] \
     && ! in_main_history "$d" features/p9416_demo.md; then
    pass "J6c: resuming a pre-fix journal that had not reached the spec yet withholds the public-first commit (first exit $rc1, resume exit 0)"
  else
    fail "J6c: resume of a pre-fix journal (first $rc1, resume $rc2; on main: $(git -C "$d" log main --format=%s -- features/p9416_demo.md | tr '\n' ';'))"; show "$SCRATCH/out.log"
  fi
else
  SKIPPED=$((SKIPPED + 1)); echo "SKIP: J6c needs the pre-fix tool — set GIT_OPS_BASELINE=<pre-fix git-ops.sh> (not run, not a pass)"
fi

# K1 / K2 — epistemic gate 7c for the end-of-ship check: it answers only for
# commits THIS ship landed (the journal's landed_sha entries). The spec is public
# on main and embargoed by the branch, and another session commits an edit to
# main's public copy after the ship's start point. That commit is correct, was
# not landed by this ship, and must not stop it.
# The journals are written by hand, as F5 and H6 do: K1 is a ship interrupted
# after its first code pick, K2 a ship whose start point predates the edit with
# nothing landed yet (the window between planning the journal and taking the lock).
k_run() {  # k_run <name> <pN> <land the first code commit: 1|0>
  local name="$1" pn="$2" land="$3" d start c1 c2 c3 landed="" cot rc
  d="$(mk "$name")"; public_spec_on_main "$d" "$pn"
  ( cd "$d" && git checkout -q -b "feature/${pn}-x" \
    && echo a > a.ts && git add a.ts && git commit -qm "fix(${pn}): code a" \
    && echo b > b.ts && git add b.ts && git commit -qm "fix(${pn}): code b" \
    && spec_body "$pn" embargo "Reclassified." > "features/${pn}_demo.md" && git add features && git commit -qm "spec(${pn}): reclassify" \
    && git checkout -q main ) >/dev/null 2>&1
  fixture_commits "$d" "feature/${pn}-x" 3 "$name"
  review_stamp "$d" "$pn"
  start="$(git -C "$d" rev-parse main)"
  c1="$(git -C "$d" rev-parse "feature/${pn}-x~2")"; c2="$(git -C "$d" rev-parse "feature/${pn}-x~1")"; c3="$(git -C "$d" rev-parse "feature/${pn}-x")"
  if [[ "$land" == "1" ]]; then ( cd "$d" && git cherry-pick "$c1" ) >/dev/null 2>&1; landed="$(git -C "$d" rev-parse main)"; fi
  ( cd "$d" && spec_body "$pn" public "Rank changed on main." > "features/${pn}_demo.md" \
    && git add features && git commit -qm "spec(${pn}): rank" ) >/dev/null 2>&1
  cot="$(git -C "$d" rev-parse main)"
  mkdir -p "$d/.claude/worktrees/.ship-journal"
  python3 - "$(journal_of "$d" "$pn")" "$pn" "$start" "$c1" "$c2" "$c3" "$landed" <<'PY'
import json, sys
path, pn, start, c1, c2, c3, landed = sys.argv[1:]
first = {"source_sha": c1, "landed_sha": landed or None, "landed_at": "t" if landed else None,
         "pre_pick_head": start if landed else None}
rest = [{"source_sha": c, "landed_sha": None, "landed_at": None, "pre_pick_head": None} for c in (c2, c3)]
json.dump({"p_number": pn, "started_at": "t", "session_id": "s", "source_branch": "feature/%s-x" % pn,
           "spec_file": "features/%s_demo.md" % pn, "start_head": start, "commits": [first] + rest,
           "spec_closed": False, "branch_deleted": False}, open(path, "w"), indent=2)
PY
  run "$d" ship "$pn" --resume; rc=$?
  if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:a.ts 2>/dev/null && git -C "$d" cat-file -e main:b.ts 2>/dev/null \
     && [[ "$(git -C "$d" rev-parse "main:features/${pn}_demo.md")" == "$(git -C "$d" rev-parse "${cot}:features/${pn}_demo.md")" ]] \
     && grep -q "Ready to push" "$SCRATCH/out.log" && ! grep -q "STOP" "$SCRATCH/out.log" && features_clean "$d"; then
    pass "$name: another session's commit to main's public copy does not stop the ship (exit 0): code landed, main keeps that copy, embargoed version withheld"
  else
    fail "$name: the end-of-ship check stopped on a commit this ship did not land (exit $rc; b.ts on main: $(git -C "$d" cat-file -e main:b.ts 2>/dev/null && echo yes || echo no))"; show "$SCRATCH/out.log"
  fi
}
k_run k1 p9420 1
k_run k2 p9422 0

# J9 — a note once marked embargo, then declared public, then renamed to the
# ship's own spec name. The seed step must not write it into the main checkout
# or stage it: the whole ship is embargoed, the code lands, the spec is withheld.
d="$(mk j9)"
( cd "$d" && git checkout -q -b feature/p9421-x && mkdir -p features/notes \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9421): code" \
  && spec_body p9421 embargo > features/notes/draft.md && git add features && git commit -qm "notes: add" \
  && spec_body p9421 public > features/notes/draft.md && git add features && git commit -qm "notes: declassify" \
  && git mv features/notes/draft.md features/p9421_x.md && git commit -qm "notes: becomes the spec" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9421-x 4 J9
review_stamp "$d" p9421
run "$d" ship p9421; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && [[ -z "$(git -C "$d" diff --cached --name-only)" ]] \
   && ! in_main_history "$d" features/p9421_x.md && ! in_main_history "$d" features/notes/draft.md; then
  pass "J9: a once-embargoed note renamed to the ship's own spec name is never seeded: nothing written or staged on main, code shipped (exit 0)"
else
  fail "J9: once-embargoed note as the ship's spec (exit $rc; main status: $(git -C "$d" status --porcelain -- features | tr '\n' ';'))"; show "$SCRATCH/out.log"
fi

# C2 — epistemic gate 7c: a branch with NO embargo content anywhere, but with
# the shapes the new discovery looks at (a renamed document, a heavy rewrite,
# a second document added then deleted), ships exactly as the pre-fix tool does.
c2_run() {  # c2_run <name> <git-ops source> — prints "rc tree-id subjects-id"
  local d; d="$(mk "$1" "$2")"; public_spec_on_main "$d" p9408
  ( cd "$d" && git checkout -q -b feature/p9408-x \
    && echo code > src.ts && git add src.ts && git commit -qm "fix(p9408): code" \
    && { printf -- '---\ndisclosure: public\n---\n# Notes\n\n'; seq 1 40; } > features/notes_draft.md \
    && echo scratch > features/scratch.md && git add features && git commit -qm "docs: notes" \
    && git mv features/notes_draft.md features/notes_final.md && git commit -qm "docs: rename notes" \
    && { printf -- '---\ndisclosure: public\n---\n# Notes, rewritten\n\n'; seq 100 170; } > features/notes_final.md \
    && git add features && git commit -qm "docs: rewrite notes" \
    && git rm -q features/scratch.md && git commit -qm "docs: drop scratch" \
    && spec_body p9408 public "Stamped." > features/p9408_demo.md && git add features && git commit -qm "spec(p9408): stamp" \
    && git checkout -q main ) >/dev/null 2>&1
  [[ "$(git -C "$d" rev-list --count main..feature/p9408-x 2>/dev/null)" == "6" ]] || echo "FIXTURE-BROKEN"
  review_stamp "$d" p9408
  run "$d" ship p9408 >/dev/null 2>&1; local rc=$?
  echo "$rc $(git -C "$d" ls-tree -r main | grep -v '	scripts/' | git hash-object --stdin) $(git -C "$d" log --format=%s main | git hash-object --stdin)"
}
new_c2="$(c2_run c2new "$GIT_OPS_SRC")"; cp "$SCRATCH/out.log" "$SCRATCH/c2new.log"
d="$SCRATCH/c2new"
if [[ "$new_c2" == *FIXTURE-BROKEN* ]]; then
  fail "C2: fixture did not build its six commits — not evidence"
elif [[ "${new_c2%% *}" != "0" ]] || grep -q withheld "$SCRATCH/c2new.log" \
     || ! git -C "$d" cat-file -e main:features/notes_final.md 2>/dev/null \
     || ! in_main_history "$d" features/notes_draft.md || ! in_main_history "$d" features/scratch.md \
     || ! git -C "$d" cat-file -e "main:$SPRINT/p9408_demo.md" 2>/dev/null; then
  fail "C2: a public branch with a rename, a rewrite and a deleted document did not ship whole (result $new_c2)"; show "$SCRATCH/c2new.log"
elif [[ -n "${GIT_OPS_BASELINE:-}" ]]; then
  base_c2="$(c2_run c2base "$GIT_OPS_BASELINE")"
  if [[ "$new_c2" == "$base_c2" ]]; then
    pass "C2: a public branch with a rename, a rewrite and a deleted document ships identically to the pre-fix tool (rc tree subjects: $new_c2)"
  else
    fail "C2: public ship diverged from the pre-fix tool (new: $new_c2, baseline: $base_c2)"; show "$SCRATCH/c2new.log"
  fi
else
  pass "C2: a public branch with a rename, a rewrite and a deleted document ships whole, nothing withheld (no baseline given)"
fi

# ════════════════════════════════════════════════════════════════════════════
# Codex review of P1689 (L1 to L5). L1: a git read that fails must stop the
# ship, never read as "nothing embargoed here". The failure is injected by a git
# wrapper on PATH that fails exactly one read and passes everything else through.
# ════════════════════════════════════════════════════════════════════════════
REAL_GIT="$(command -v git)"
mkdir -p "$SCRATCH/fakegit"
cat > "$SCRATCH/fakegit/git" <<EOF
#!/bin/bash
# Fails one read: the subcommand GITFAIL_SUB given an argument containing
# GITFAIL_ARG (and the argument GITFAIL_FLAG, when set). Everything else is git.
if [[ -n "\${GITFAIL_SUB:-}" ]]; then
  _sub=0; _arg=0; _flag=0
  for _a in "\$@"; do
    [[ "\$_a" == "\$GITFAIL_SUB" ]] && _sub=1
    [[ "\$_a" == *"\$GITFAIL_ARG"* ]] && _arg=1
    [[ -z "\${GITFAIL_FLAG:-}" || "\$_a" == "\$GITFAIL_FLAG" ]] && _flag=1
  done
  if (( _sub == 1 && _arg == 1 && _flag == 1 )); then
    echo "fatal: injected read failure" >&2
    [[ -n "\${GITFAIL_LOG:-}" ]] && echo hit >> "\$GITFAIL_LOG"
    exit 128
  fi
fi
exec "$REAL_GIT" "\$@"
EOF
chmod +x "$SCRATCH/fakegit/git"
run_failing() {  # run_failing <repo> <subcommand> <argument substring> <flag or ""> <git-ops args...>
  local d="$1" sub="$2" arg="$3" flag="$4" rc=0; shift 4
  : > "$SCRATCH/gitfail.hits"
  ( cd "$d" && PATH="$SCRATCH/fakegit:$PATH" GITFAIL_SUB="$sub" GITFAIL_ARG="$arg" GITFAIL_FLAG="$flag" \
      GITFAIL_LOG="$SCRATCH/gitfail.hits" bash scripts/git-ops.sh "$@" </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc=$?
  cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
  return $rc
}
injected() { [[ -s "$SCRATCH/gitfail.hits" ]]; }   # did the wrapper fire at all?

# j1_shape <repo> <pN> — J1's branch: code, the spec added public, then reclassified.
j1_shape() {
  ( cd "$1" && git checkout -q -b "feature/$2-x" \
    && echo code > src.ts && git add src.ts && git commit -qm "fix($2): code" \
    && spec_body "$2" public > "features/$2_demo.md" && git add features && git commit -qm "spec($2): add" \
    && spec_body "$2" embargo "Reclassified." > "features/$2_demo.md" && git add features && git commit -qm "spec($2): reclassify" \
    && git checkout -q main ) >/dev/null 2>&1
}
# l1_case <name> <pN> <subcommand> <argument template> <flag> — the template's
# @S@ is the reclassifying commit's sha. A failed read must stop the ship.
l1_case() {
  local name="$1" pn="$2" sub="$3" tmpl="$4" flag="$5" d h0 s3 arg rc
  d="$(mk "$name")"; j1_shape "$d" "$pn"
  fixture_commits "$d" "feature/${pn}-x" 3 "$name"
  review_stamp "$d" "$pn"; h0="$(git -C "$d" rev-parse main)"
  s3="$(git -C "$d" rev-parse "feature/${pn}-x")"; arg="${tmpl//@S@/$s3}"
  run_failing "$d" "$sub" "$arg" "$flag" ship "$pn"; rc=$?
  if ! injected; then
    fail "$name: fixture — the injected failure never fired, so the result is not evidence"; show "$SCRATCH/out.log"
  elif [[ $rc -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] && features_clean "$d" \
     && ! in_main_history "$d" "features/${pn}_demo.md" && grep -q "embargo check: cannot read" "$SCRATCH/out.log"; then
    pass "$name: a failed git read ($sub) during the embargo check stops the ship (exit $rc), main unchanged"
  else
    fail "$name: a failed git read ($sub) was taken as no embargo (exit $rc; spec on main: $(in_main_history "$d" "features/${pn}_demo.md" && echo yes || echo no))"; show "$SCRATCH/out.log"
  fi
}
l1_case L1a p9441 diff-tree "@S@" --name-status          # the commit's change list
l1_case L1b p9443 cat-file "@S@:features/p9443_demo.md" -p   # the spec blob
l1_case L1d p9444 cat-file "@S@^{commit}" -e              # the commit itself

# L1e — a conflict resolution's staged documents are read blob by blob; a read
# that fails must refuse the --resume, not let a staged embargoed document ride
# into the pick's commit.
d="$(mk l1e)"
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9446-x \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9446): code" \
  && spec_body p9446 embargo > features/p9446_demo.md && git add features && git commit -qm "spec(p9446): add" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
fixture_commits "$d" feature/p9446-x 2 L1e
review_stamp "$d" p9446
run "$d" ship p9446; rc1=$?
( cd "$d" && echo resolved > src.ts && spec_body p9446 embargo "Extra." > features/p9446_extra.md \
  && git add src.ts features/p9446_extra.md ) >/dev/null 2>&1
h0="$(git -C "$d" rev-parse main)"
run_failing "$d" cat-file ":features/p9446_extra.md" -p ship p9446 --resume; rc2=$?
if ! injected; then
  fail "L1e: fixture — the injected failure never fired (first exit $rc1), so the result is not evidence"; show "$SCRATCH/out.log"
elif [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && ! in_main_history "$d" features/p9446_extra.md && grep -q "embargo check: cannot read" "$SCRATCH/out.log"; then
  pass "L1e: a staged document whose blob cannot be read refuses the --resume (exit $rc2), nothing committed"
else
  fail "L1e: an unreadable staged document was taken as public (first $rc1, resume $rc2; on main: $(in_main_history "$d" features/p9446_extra.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# L1f — on --resume the pending list comes from the journal, and the branch's
# history is read only for the embargo check. A failed read of that history must
# stop the resume, not shrink the check to the pending commits.
d="$(mk l1f)"
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9447-x \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9447): code" \
  && spec_body p9447 embargo > features/p9447_demo.md && git add features && git commit -qm "spec(p9447): add" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
fixture_commits "$d" feature/p9447-x 2 L1f
review_stamp "$d" p9447
run "$d" ship p9447; rc1=$?
( cd "$d" && echo resolved > src.ts && git add src.ts ) >/dev/null 2>&1
h0="$(git -C "$d" rev-parse main)"
run_failing "$d" rev-list "main..feature/p9447-x" --reverse ship p9447 --resume; rc2=$?
if ! injected; then
  fail "L1f: fixture — the injected failure never fired (first exit $rc1), so the result is not evidence"; show "$SCRATCH/out.log"
elif [[ $rc1 -ne 0 && $rc2 -ne 0 && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && ! in_main_history "$d" features/p9447_demo.md && grep -q "embargo check: cannot read the commits of" "$SCRATCH/out.log"; then
  pass "L1f: a branch history that cannot be read stops the --resume (exit $rc2), nothing committed"
else
  fail "L1f: an unreadable branch history was taken as no history (first $rc1, resume $rc2; on main: $(in_main_history "$d" features/p9447_demo.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# hand_journal <path> <pN> <start> <entry>... — entry is source:landed:pre_pick
# (empty landed / pre_pick = null). Same shape as k_run's journal.
hand_journal() {
  local path="$1"; shift
  mkdir -p "$(dirname "$path")"
  python3 - "$path" "$@" <<'PY'
import json, sys
path, pn, start, *entries = sys.argv[1:]
commits = []
for e in entries:
    s, l, p = e.split(":")
    commits.append({"source_sha": s, "landed_sha": l or None, "landed_at": "t" if l else None, "pre_pick_head": p or None})
json.dump({"p_number": pn, "started_at": "t", "session_id": "s", "source_branch": "feature/%s-x" % pn,
           "spec_file": "features/%s_demo.md" % pn, "start_head": start, "commits": commits,
           "spec_closed": False, "branch_deleted": False}, open(path, "w"), indent=2)
PY
}
# k_shape <repo> <pN> — K's branch over main's public spec: two code commits,
# then the spec reclassified embargo.
k_shape() {
  public_spec_on_main "$1" "$2"
  ( cd "$1" && git checkout -q -b "feature/$2-x" \
    && echo a > a.ts && git add a.ts && git commit -qm "fix($2): code a" \
    && echo b > b.ts && git add b.ts && git commit -qm "fix($2): code b" \
    && spec_body "$2" embargo "Reclassified." > "features/$2_demo.md" && git add features && git commit -qm "spec($2): reclassify" \
    && git checkout -q main ) >/dev/null 2>&1
}

# L1c — the end-of-ship check must not skip a landed commit it cannot read. An
# earlier half of this ship landed the reclassifying commit (as J6b's pre-fix
# tool did); the resume runs with that commit's read failing.
d="$(mk l1c)"; k_shape "$d" p9445
fixture_commits "$d" feature/p9445-x 3 L1c
review_stamp "$d" p9445
start="$(git -C "$d" rev-parse main)"
c1="$(git -C "$d" rev-parse feature/p9445-x~2)"; c2="$(git -C "$d" rev-parse feature/p9445-x~1)"; c3="$(git -C "$d" rev-parse feature/p9445-x)"
( cd "$d" && git cherry-pick "$c3" ) >/dev/null 2>&1; leaked="$(git -C "$d" rev-parse main)"
hand_journal "$(journal_of "$d" p9445)" p9445 "$start" "$c3:$leaked:$start" "$c1::" "$c2::"
run_failing "$d" cat-file "${leaked}^{commit}" -e ship p9445 --resume; rc=$?
if ! injected || [[ "$leaked" == "$start" ]]; then
  fail "L1c: fixture — the leak was not landed or the injected failure never fired; not evidence"; show "$SCRATCH/out.log"
elif [[ $rc -ne 0 ]] && grep -q "cannot read landed commit" "$SCRATCH/out.log" && ! grep -q "Ready to push" "$SCRATCH/out.log" \
   && [[ -f "$(journal_of "$d" p9445)" ]]; then
  pass "L1c: a landed commit the end-of-ship check cannot read stops the ship (exit $rc), not reported ready"
else
  fail "L1c: an unreadable landed commit was skipped (exit $rc; said Ready to push: $(grep -q "Ready to push" "$SCRATCH/out.log" && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# l2_shape <repo> <pN> — a note embargoed, declared public, renamed to the
# ship's own spec name, then the UAT pair added in a commit of its own. The
# note's first name carries no P-number, so only the rename links it to pN.
l2_shape() {
  ( cd "$1" && git checkout -q -b "feature/$2-x" && mkdir -p features/notes features/uat \
    && echo code > src.ts && git add src.ts && git commit -qm "fix($2): code" \
    && spec_body "$2" embargo > features/notes/draft.md && git add features && git commit -qm "notes: add" \
    && spec_body "$2" public > features/notes/draft.md && git add features && git commit -qm "notes: declassify" \
    && git mv features/notes/draft.md "features/$2_demo.md" && git commit -qm "notes: becomes the spec" \
    && echo uat > "features/uat/$2.md" && git add features && git commit -qm "spec($2): uat" \
    && git checkout -q main ) >/dev/null 2>&1
}
# L2a — the protected spec's UAT pair is protected too.
d="$(mk l2a)"; l2_shape "$d" p9430
fixture_commits "$d" feature/p9430-x 5 L2a
review_stamp "$d" p9430
run "$d" ship p9430; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:src.ts 2>/dev/null && features_clean "$d" \
   && ! in_main_history "$d" features/uat/p9430.md && ! in_main_history "$d" features/p9430_demo.md \
   && ! in_main_history "$d" features/notes/draft.md; then
  pass "L2a: a note renamed onto pN's spec name: its UAT pair is withheld with it, code shipped (exit 0)"
else
  fail "L2a: UAT pair of a spec protected only by a rename (exit $rc; UAT on main: $(in_main_history "$d" features/uat/p9430.md && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# L2b — the end-of-ship check covers the UAT pair: an earlier half of the ship
# landed L2a's UAT commit (as the pre-fix tool did); the resume must not report ready.
d="$(mk l2b)"; l2_shape "$d" p9431
fixture_commits "$d" feature/p9431-x 5 L2b
review_stamp "$d" p9431
start="$(git -C "$d" rev-parse main)"
l2c=( $(git -C "$d" rev-list --reverse main..feature/p9431-x) )
( cd "$d" && git cherry-pick "${l2c[4]}" ) >/dev/null 2>&1; leaked="$(git -C "$d" rev-parse main)"
hand_journal "$(journal_of "$d" p9431)" p9431 "$start" "${l2c[4]}:$leaked:$start" "${l2c[0]}::" "${l2c[1]}::" "${l2c[2]}::" "${l2c[3]}::"
run "$d" ship p9431 --resume; rc=$?
if [[ "$leaked" == "$start" ]]; then
  fail "L2b: fixture — the UAT commit did not land; not evidence"
elif [[ $rc -ne 0 ]] && grep -q "features/uat/p9431.md" "$SCRATCH/out.log" && grep -q "${leaked:0:12}" "$SCRATCH/out.log" \
   && ! grep -q "Ready to push" "$SCRATCH/out.log"; then
  pass "L2b: a landed UAT pair of a protected spec stops the end-of-ship check (exit $rc), path and commit named"
else
  fail "L2b: landed UAT pair passed the end-of-ship check (exit $rc; said Ready to push: $(grep -q "Ready to push" "$SCRATCH/out.log" && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# L3 — P1694 records a pick that changed nothing at the existing main tip
# (landed_sha == pre_pick_head). That tip is not this ship's commit: here it is
# another session's commit that also edits main's public copy of the spec.
d="$(mk l3)"; k_shape "$d" p9432
fixture_commits "$d" feature/p9432-x 3 L3
review_stamp "$d" p9432
start="$(git -C "$d" rev-parse main)"
c1="$(git -C "$d" rev-parse feature/p9432-x~2)"; c2="$(git -C "$d" rev-parse feature/p9432-x~1)"; c3="$(git -C "$d" rev-parse feature/p9432-x)"
( cd "$d" && echo a > a.ts && spec_body p9432 public "Rank changed on main." > features/p9432_demo.md \
  && git add a.ts features && git commit -qm "other session: a and rank" ) >/dev/null 2>&1
cot="$(git -C "$d" rev-parse main)"
hand_journal "$(journal_of "$d" p9432)" p9432 "$start" "$c1:$cot:$cot" "$c2::" "$c3::"
run "$d" ship p9432 --resume; rc=$?
if [[ $rc -eq 0 ]] && git -C "$d" cat-file -e main:b.ts 2>/dev/null && grep -q "Ready to push" "$SCRATCH/out.log" \
   && ! grep -q "STOP" "$SCRATCH/out.log" && features_clean "$d" \
   && [[ "$(git -C "$d" rev-parse main:features/p9432_demo.md)" == "$(git -C "$d" rev-parse "${cot}:features/p9432_demo.md")" ]]; then
  pass "L3: a pick recorded empty at another session's tip is not taken as a commit this ship landed (exit 0)"
else
  fail "L3: the end-of-ship check judged another session's tip recorded by an empty pick (exit $rc)"; show "$SCRATCH/out.log"
fi

# L4 — embargo refusals name commits by sha only: a subject can repeat the
# confidential title. A mixed commit (J2's shape) and a merge (F6's shape).
d="$(mk l4a)"
( cd "$d" && git checkout -q -b feature/p9433-x \
  && echo code > src.ts && spec_body p9433 public > features/p9433_demo.md \
  && git add src.ts features && git commit -qm "fix(p9433): Zanzibar overflow code and spec" \
  && spec_body p9433 embargo "Reclassified." > features/p9433_demo.md && git add features && git commit -qm "spec(p9433): Zanzibar reclassify" \
  && git checkout -q main ) >/dev/null 2>&1
fixture_commits "$d" feature/p9433-x 2 L4a
review_stamp "$d" p9433
mixed_sha="$(git -C "$d" rev-parse feature/p9433-x~1)"
run "$d" ship p9433; rc=$?
if [[ $rc -ne 0 ]] && grep -q "$mixed_sha" "$SCRATCH/out.log" && ! grep -q "Zanzibar" "$SCRATCH/out.log"; then
  pass "L4a: the mixed-commit refusal names the commit by sha and prints no subject (exit $rc)"
else
  fail "L4a: mixed-commit refusal (exit $rc; subject printed: $(grep -q "Zanzibar" "$SCRATCH/out.log" && echo yes || echo no))"; show "$SCRATCH/out.log"
fi
d="$(mk l4b)"; add_stub "$d" p9434
( cd "$d" && git checkout -q -b feature/p9434-x \
  && echo code > src.ts && git add src.ts && git commit -qm "fix(p9434): code" \
  && git checkout -q -b side \
  && spec_body p9434 embargo > features/p9434_demo.md && git add features && git commit -qm "spec(p9434): add" \
  && git checkout -q feature/p9434-x && echo x > x.ts && git add x.ts && git commit -qm "fix(p9434): x" \
  && git merge -q --no-ff -m "merge: Zanzibar overflow" side && git branch -D side \
  && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9434
merge_sha="$(git -C "$d" rev-parse feature/p9434-x)"
run "$d" ship p9434; rc=$?
if [[ $rc -ne 0 ]] && grep -q "$merge_sha" "$SCRATCH/out.log" && grep -q "merge commits" "$SCRATCH/out.log" \
   && ! grep -q "Zanzibar" "$SCRATCH/out.log"; then
  pass "L4b: the merge-commit refusal names the commit by sha and prints no subject (exit $rc)"
else
  fail "L4b: merge refusal (exit $rc; subject printed: $(grep -q "Zanzibar" "$SCRATCH/out.log" && echo yes || echo no))"; show "$SCRATCH/out.log"
fi

# L5 — J8's refusal of a staged resolution recommends only a step that keeps the
# working copy (git reset HEAD -- FILE), never one that discards an edit.
d="$(mk l5)"
( cd "$d" && echo base > src.ts && git add src.ts && git commit -qm base \
  && git checkout -q -b feature/p9435-x \
  && echo branch > src.ts && git add src.ts && git commit -qm "fix(p9435): code" \
  && spec_body p9435 public > features/p9435_demo.md && git add features && git commit -qm "spec(p9435): add" \
  && spec_body p9435 embargo "Reclassified." > features/p9435_demo.md && git add features && git commit -qm "spec(p9435): reclassify" \
  && git checkout -q main && echo main > src.ts && git add src.ts && git commit -qm "main moves" ) >/dev/null 2>&1
fixture_commits "$d" feature/p9435-x 3 L5
review_stamp "$d" p9435
run "$d" ship p9435; rc1=$?
( cd "$d" && echo resolved > src.ts && git show feature/p9435-x~1:features/p9435_demo.md > features/p9435_demo.md \
  && git add src.ts features/p9435_demo.md ) >/dev/null 2>&1
run "$d" ship p9435 --resume; rc2=$?
if [[ $rc1 -ne 0 && $rc2 -ne 0 ]] && grep -q "staged resolution adds or modifies an embargoed spec" "$SCRATCH/out.log" \
   && grep -q "git reset HEAD -- " "$SCRATCH/out.log" \
   && ! grep -qE "checkout HEAD|git restore|rm --cached" "$SCRATCH/out.log"; then
  # And the advice works: following it lets the resume finish without the spec.
  ( cd "$d" && git reset -q HEAD -- features/p9435_demo.md ) >/dev/null 2>&1
  if [[ "$(cat "$d/features/p9435_demo.md" 2>/dev/null)" == "$(git -C "$d" show feature/p9435-x~1:features/p9435_demo.md)" ]]; then
    pass "L5: the staged-resolution refusal recommends git reset HEAD -- FILE, which keeps the working copy"
  else
    fail "L5: following the recommended step lost the working copy"
  fi
else
  fail "L5: staged-resolution refusal advice (first $rc1, resume $rc2)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Z — shell-safety: no redirect-parseable tokens in any transcript
# ════════════════════════════════════════════════════════════════════════════
# git's own cherry-pick hints (inside the #CP_DIAGNOSTIC block) are quoted
# verbatim by design and are excluded; every git-ops status line is checked.
if bad="$(sed '/^#CP_DIAGNOSTIC_BEGIN$/,/^#CP_DIAGNOSTIC_END$/d' "$SCRATCH/all.log" | grep -nE '[<>|]')"; then
  fail "Z: output carries > < | tokens:"; printf '%s\n' "$bad" | sed 's/^/    /' >&2
else
  pass "Z: no > < | tokens in ship / archive-spec output"
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: $FAILURES failure(s)"; exit 1; fi
if (( SKIPPED > 0 )); then echo "RESULT: every scenario that ran passed; $SKIPPED skipped (a skip is not evidence)"; exit 0; fi
echo "RESULT: all passed"
