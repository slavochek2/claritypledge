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
echo "RESULT: all passed"
