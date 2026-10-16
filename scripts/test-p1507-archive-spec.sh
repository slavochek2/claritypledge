#!/usr/bin/env bash
# test-p1507-archive-spec.sh — hermetic canary for P1507: a spec withheld by
# `ship` (disclosure: embargo) is archived into the private .private repo and is
# never published. The branch is deleted only after the nightly off-machine
# backup is proven to hold every archived blob, byte for byte.
#
# Acceptance Criteria mapping (features/p1507_*.md):
#   Half 1 writes exactly the manifest's paths, inner blob ids = branch ids,
#     branch + worktree untouched, main unchanged ..................... R1
#   Half 2 refuses with a blob missing / different / snapshot too old;
#     branch still exists afterwards ................................. R2, R3, R4
#   Half 2 deletes branch + worktree after proof; no main commit (S1) .. R5
#   Legacy stub (S0): one-path main commit, subject 'chore: close pN' .. R6
#   Half 1 refusals: another ref holds the spec; outside main checkout;
#     inner blob id mismatch; not embargo; prod migration missing ...... R7-R10, R12
#   publish-spec is gone ............................................... R11
#   --finish-pending sweeps every unfinished archive ................... R13
#
# The off-machine copy is the nightly backup; it proves each archive by writing
# a proof file, which this suite writes itself. No network is touched.
#
# Usage: scripts/test-p1507-archive-spec.sh [path/to/git-ops.sh]

set -uo pipefail

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

# ── the off-machine proof ───────────────────────────────────────────────────
# The nightly backup job verifies each archive manifest against its own snapshot
# and writes <pN>.proof (snapshot_time=<epoch>, then blob<TAB>dest per file). The
# suite plays that job: snapshot() hashes what a snapshot would hold and writes
# the proof exactly as the job does; tests then corrupt it to exercise refusals.
export CP_ARCHIVE_PROOF_DIR="$SCRATCH/proof"
mkdir -p "$CP_ARCHIVE_PROOF_DIR"

# mk <name> — a main repo with the real ship scripts and an inner .private repo.
mk() {
  local d="$SCRATCH/$1"
  mkdir -p "$d/scripts/lib" "$d/$SPRINT" "$d/.claude/worktrees" "$d/.private"
  cp "$GIT_OPS_SRC" "$d/scripts/git-ops.sh"
  cp "$W/scripts/ship-gates.sh" "$d/scripts/"
  cp "$W/scripts/lib/gate-override.sh" "$W/scripts/lib/admin-close.sh" \
     "$W/scripts/lib/worktree-changes.sh" "$d/scripts/lib/"
  chmod +x "$d/scripts/git-ops.sh" "$d/scripts/ship-gates.sh"
  : > "$d/$SPRINT/.gitkeep"
  printf '.private/\n.claude/worktrees/\n' > "$d/.gitignore"
  ( cd "$d" && git init -q && git config user.email c@t && git config user.name c \
    && git config commit.gpgsign false && echo seed > README.md \
    && git add README.md .gitignore scripts features && git commit -qm seed && git branch -M main ) >/dev/null 2>&1
  ( cd "$d/.private" && git init -q && git config user.email c@t && git config user.name c \
    && git config commit.gpgsign false && echo idx > INDEX.md && git add INDEX.md \
    && git commit -qm seed && git branch -M main ) >/dev/null 2>&1
  echo "$d"
}

spec_body() {
  printf -- '---\nstatus: qa\ntype: bug\nrank: 1\ndisclosure: %s\ndelivery_stage: fix\npipeline_ran: [fix]\n---\n# %s: Demo\n\nSecret defect detail.\n%s\n## Done-When\n\n- [x] fixture criterion\n' \
    "$2" "$1" "${3:-}"
}

# branch_split <repo> <pN> <disclosure> — code-only, spec-only, spec+UAT commits.
branch_split() {
  local d="$1" pn="$2" disc="$3"
  ( cd "$d" && git checkout -q -b "feature/${pn}-x" \
    && echo code > "src-${pn}.ts" && git add "src-${pn}.ts" && git commit -qm "fix(${pn}): code" \
    && spec_body "$pn" "$disc" > "features/${pn}_demo.md" && git add features && git commit -qm "spec(${pn}): add" \
    && mkdir -p features/uat && spec_body "$pn" "$disc" "Stamped." > "features/${pn}_demo.md" \
    && echo uat > "features/uat/${pn}.md" && git add features && git commit -qm "spec(${pn}): stamp + uat" \
    && git checkout -q main ) >/dev/null 2>&1
}

review_stamp() {
  printf '{"type": "code", "pn": "%s", "branch": "feature/%s-x", "sha": "%s", "timestamp": "%s", "issues_found": 0, "issues_fixed": 0}\n' \
    "$2" "$2" "$(git -C "$1" rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$1/.git/.finish-reviewed"
}

run() {  # run <repo> <args...>
  local d="$1" rc=0; shift
  ( cd "$d" && bash scripts/git-ops.sh "$@" </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc=$?
  cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
  return $rc
}

# shipped <name> <pN> — repo where pN was shipped with its spec withheld.
shipped() {
  local d; d="$(mk "$1")"; branch_split "$d" "$2" embargo; review_stamp "$d" "$2"
  run "$d" ship "$2" || { echo "FIXTURE: ship $2 failed" >&2; show "$SCRATCH/out.log"; }
  echo "$d"
}

# snapshot <repo> [epoch] — write proofs for every manifest, hashing the live
# .private files (what a snapshot taken now would hold). Default time: now + 60s.
snapshot() {
  local d="$1" t="${2:-$(( $(date -u +%s) + 60 ))}" mf pn
  while IFS= read -r mf; do
    pn="$(basename "$mf" .manifest)"
    { echo "snapshot_time=$t"
      grep -E $'^[0-9a-f]{40}\t' "$mf" | while IFS=$'\t' read -r b s dd; do
        printf '%s\t%s\n' "$(git hash-object "$d/.private/$dd")" "$dd"; done
    } > "$CP_ARCHIVE_PROOF_DIR/$pn.proof"
  done < <(find "$d/.private/features/done" -name 'p*.manifest' 2>/dev/null)
}
proof() { echo "$CP_ARCHIVE_PROOF_DIR/$1.proof"; }
finish() {  # finish <repo> <pN> [extra args]
  local d="$1"; shift
  run "$d" archive-spec "$@" --finish
}

PDIR=".private/$SPRINT"

# ════════════════════════════════════════════════════════════════════════════
# R1 — Half 1: exact manifest, inner blob ids = branch ids, nothing else moves
# ════════════════════════════════════════════════════════════════════════════
d="$(shipped r1 p9101)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9101 --yes --skip-smoke; rc=$?
inner="$(git -C "$d/.private" show --name-only --format= HEAD | LC_ALL=C sort | tr '\n' ' ')"
want="$(printf '%s\n' "$SPRINT/p9101.manifest" "$SPRINT/p9101_demo.md" "$SPRINT/uat/p9101.md" | LC_ALL=C sort | tr '\n' ' ')"
b_spec="$(git -C "$d" rev-parse feature/p9101-x:features/p9101_demo.md)"
i_spec="$(git -C "$d/.private" rev-parse "HEAD:${SPRINT}/p9101_demo.md" 2>/dev/null)"
b_uat="$(git -C "$d" rev-parse feature/p9101-x:features/uat/p9101.md)"
i_uat="$(git -C "$d/.private" rev-parse "HEAD:${SPRINT}/uat/p9101.md" 2>/dev/null)"
if [[ $rc -eq 0 && "$inner" == "$want" && "$b_spec" == "$i_spec" && "$b_uat" == "$i_uat" \
      && "$(git -C "$d" rev-parse main)" == "$h0" ]] \
   && git -C "$d" rev-parse --verify -q feature/p9101-x >/dev/null \
   && grep -qx 'disclosure: embargo' "$d/$PDIR/p9101_demo.md" \
   && [[ -z "$(git -C "$d" status --porcelain)" ]]; then
  pass "R1: Half 1 commits exactly spec + UAT + manifest in .private, blob ids equal, branch kept, main unchanged (exit 0)"
else
  fail "R1: Half 1 (exit $rc; inner: $inner; spec $b_spec/$i_spec; uat $b_uat/$i_uat)"; show "$SCRATCH/out.log"
fi
R1="$d"

# R2 — Half 2 with the proof missing the UAT blob refuses; branch survives.
snapshot "$R1"; sed -i '' '/uat\/p9101.md$/d' "$(proof p9101)"
finish "$R1" p9101; rc=$?
if [[ $rc -ne 0 ]] && grep -q "missing or different" "$SCRATCH/out.log" && git -C "$R1" rev-parse --verify -q feature/p9101-x >/dev/null; then
  pass "R2: a blob missing from the off-machine snapshot refuses (exit $rc); branch still exists"
else
  fail "R2: missing blob (exit $rc)"; show "$SCRATCH/out.log"
fi

# R3 — the snapshot holds different bytes: refuse.
echo tampered >> "$R1/$PDIR/p9101_demo.md"; snapshot "$R1"; git -C "$R1/.private" checkout -q -- .
finish "$R1" p9101; rc=$?
if [[ $rc -ne 0 ]] && grep -q "missing or different" "$SCRATCH/out.log" && git -C "$R1" rev-parse --verify -q feature/p9101-x >/dev/null; then
  pass "R3: snapshot bytes differ from the branch blob: refused (exit $rc); branch still exists"
else
  fail "R3: different bytes (exit $rc)"; show "$SCRATCH/out.log"
fi

# R4 — the latest snapshot started before the archive: refuse.
snapshot "$R1" 978307200
finish "$R1" p9101; rc=$?
if [[ $rc -ne 0 ]] && grep -q "predates the archive" "$SCRATCH/out.log" && git -C "$R1" rev-parse --verify -q feature/p9101-x >/dev/null; then
  pass "R4: snapshot older than the archive: refused (exit $rc); branch still exists"
else
  fail "R4: stale snapshot (exit $rc)"; show "$SCRATCH/out.log"
fi

# R5 — proof present: branch and worktree removed, no commit on main.
( cd "$R1" && git worktree add -q .claude/worktrees/w9 feature/p9101-x ) >/dev/null 2>&1
h0="$(git -C "$R1" rev-parse main)"
snapshot "$R1"
finish "$R1" p9101; rc=$?
if [[ $rc -eq 0 && "$(git -C "$R1" rev-parse main)" == "$h0" ]] \
   && ! git -C "$R1" rev-parse --verify -q feature/p9101-x >/dev/null \
   && [[ ! -d "$R1/.claude/worktrees/w9" ]] \
   && ! git -C "$R1" ls-tree -r --name-only main -- features | grep -q p9101; then
  pass "R5: off-machine proof found: branch + worktree removed, no main commit, nothing of p9101 on main (exit 0)"
else
  fail "R5: finish (exit $rc)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# R6 — legacy stub on main: Half 2 deletes it in a one-path 'chore: close pN'
# ════════════════════════════════════════════════════════════════════════════
d="$(mk r6)"
printf -- '---\nstatus: backlog\ntype: task\nrank: 9\ntags: [disclosure-embargo]\ndisclosure: public\n---\n# p9106: Under disclosure embargo\n\nReserved.\n' \
  > "$d/features/p9106_security-review-pending.md"
( cd "$d" && git add features && git commit -qm "spec(p9106): reserve number" ) >/dev/null 2>&1
branch_split "$d" p9106 embargo; review_stamp "$d" p9106
run "$d" ship p9106; rc0=$?
run "$d" archive-spec p9106 --yes --skip-smoke; rc1=$?
snapshot "$d"; finish "$d" p9106; rc2=$?
ns="$(git -C "$d" show --name-status --no-renames --format= HEAD | tr '\t\n' ' ')"
subj="$(git -C "$d" log -1 --format=%s main)"
if [[ $rc0 -eq 0 && $rc1 -eq 0 && $rc2 -eq 0 && "$ns" == "D features/p9106_security-review-pending.md " && "$subj" == "chore: close p9106" ]] \
   && ! git -C "$d" ls-tree -r --name-only main -- features/done | grep -q p9106; then
  pass "R6: legacy stub deleted in one commit 'chore: close p9106', nothing added under done/ (exit 0)"
else
  fail "R6: stub close (ship $rc0, half1 $rc1, half2 $rc2; HEAD: $ns; subject: $subj)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Half 1 refusals — each leaves .private and main unchanged
# ════════════════════════════════════════════════════════════════════════════
unchanged() {  # unchanged <repo> <inner-head> <main-head>
  [[ "$(git -C "$1/.private" rev-parse HEAD)" == "$2" && "$(git -C "$1" rev-parse main)" == "$3" \
     && -z "$(git -C "$1/.private" status --porcelain)" ]]
}

# R7 — another local ref carries a commit with the spec.
d="$(shipped r7 p9107)"; ( cd "$d" && git branch feature/p9999-cut-from-tip feature/p9107-x ) >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9107 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "feature/p9999-cut-from-tip" "$SCRATCH/out.log"; then
  pass "R7: another ref holding the spec refuses (exit $rc), names the ref, nothing written"
else
  fail "R7: other ref (exit $rc)"; show "$SCRATCH/out.log"
fi

# R8 — run from a worktree, not the main checkout.
d="$(shipped r8 p9108)"; ( cd "$d" && git worktree add -q .claude/worktrees/w8 feature/p9108-x ) >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"; rc=0
( cd "$d/.claude/worktrees/w8" && bash "$d/scripts/git-ops.sh" archive-spec p9108 --yes --skip-smoke </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "main checkout" "$SCRATCH/out.log"; then
  pass "R8: outside the main checkout refuses (exit $rc), nothing written"
else
  fail "R8: worktree caller (exit $rc)"; show "$SCRATCH/out.log"
fi

# R9 — a public spec is not archived.
d="$(mk r9)"; branch_split "$d" p9109 public
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9109 --yes --skip-smoke; rc=$?
d2="$(mk r9b)"
( cd "$d2" && git checkout -q -b feature/p9119-x && spec_body p9119 public | sed '/^disclosure:/d' > features/p9119_demo.md \
  && git add features && git commit -qm "spec(p9119): add" && git checkout -q main ) >/dev/null 2>&1
run "$d2" archive-spec p9119 --yes --skip-smoke; rc2=$?
if [[ $rc -ne 0 && $rc2 -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "'disclosure: absent'" "$SCRATCH/out.log"; then
  pass "R9: a public spec refuses (exit $rc), a spec with no field refuses with 'absent' (exit $rc2), nothing written"
else
  fail "R9: public spec (exit $rc)"; show "$SCRATCH/out.log"
fi

# R10 — a pN migration absent from origin/main's prod manifest refuses; so does
# a spec with no migration and no --yes.
d="$(mk r10)"
( cd "$d" && mkdir -p supabase && echo '{"prod":{"migrations":[]}}' > supabase/deploy-manifest.json \
  && git add supabase && git commit -qm manifest ) >/dev/null 2>&1
branch_split "$d" p9110 embargo
( cd "$d" && git checkout -q feature/p9110-x && mkdir -p supabase/migrations \
  && echo 'select 1;' > supabase/migrations/20260101000000_p9110_fix.sql \
  && git add supabase && git commit -qm "fix(p9110): migration" && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9110; run "$d" ship p9110 || { echo "FIXTURE: ship p9110 failed" >&2; show "$SCRATCH/out.log"; }
( cd "$d" && git update-ref refs/remotes/origin/main main ) >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9110 --skip-smoke; rc=$?; cp "$SCRATCH/out.log" "$SCRATCH/r10.log"
d2="$(shipped r10b p9120)"; i2="$(git -C "$d2/.private" rev-parse HEAD)"; h2="$(git -C "$d2" rev-parse main)"
run "$d2" archive-spec p9120 --skip-smoke; rc2=$?
if [[ $rc -ne 0 && $rc2 -ne 0 ]] && unchanged "$d" "$i0" "$h0" && unchanged "$d2" "$i2" "$h2" \
   && grep -q "absent from origin/main deploy-manifest" "$SCRATCH/r10.log" && grep -q "has no migration" "$SCRATCH/out.log"; then
  pass "R10: migration not on prod refuses (exit $rc); no migration without --yes refuses (exit $rc2)"
else
  fail "R10: prod gates (exit $rc / $rc2)"; show "$SCRATCH/out.log"
fi

# R11 — publish-spec no longer exists.
# Not through run(): the unknown-subcommand help text is not under test for Z.
rc=0; ( cd "$R1" && bash scripts/git-ops.sh publish-spec p9101 --yes --skip-smoke </dev/null ) >"$SCRATCH/r11.log" 2>&1 || rc=$?
if [[ $rc -ne 0 ]] && grep -q "unknown subcommand 'publish-spec'" "$SCRATCH/r11.log"; then pass "R11: publish-spec is gone (exit $rc)"; else fail "R11: publish-spec still runs"; fi

# R12 — the inner repo stores different bytes (a clean filter rewrites them).
d="$(shipped r12 p9112)"
( cd "$d/.private" && git config filter.mangle.clean 'sed s/Secret/Public/' && git config filter.mangle.smudge cat \
  && printf '*.md filter=mangle\n' > .gitattributes && git add .gitattributes && git commit -qm attrs ) >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9112 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -qi "blob" "$SCRATCH/out.log"; then
  pass "R12: inner blob id differs from the branch blob: refused (exit $rc), inner commit rolled back"
else
  fail "R12: inner blob mismatch (exit $rc)"; show "$SCRATCH/out.log"
fi

# R13 — --finish-pending finishes every archive whose branch still exists.
d="$(shipped r13 p9113)"
run "$d" archive-spec p9113 --yes --skip-smoke; rc1=$?
snapshot "$d"
run "$d" archive-spec --finish-pending; rc2=$?
if [[ $rc1 -eq 0 && $rc2 -eq 0 ]] && ! git -C "$d" rev-parse --verify -q feature/p9113-x >/dev/null; then
  pass "R13: --finish-pending removed the proven branch (exit 0)"
else
  fail "R13: finish-pending (half1 $rc1, sweep $rc2)"; show "$SCRATCH/out.log"
fi

# ════════════════════════════════════════════════════════════════════════════
# Review findings 2026-10-16 (Codex, Opus, Gemini, criteria) — one case each
# ════════════════════════════════════════════════════════════════════════════

# R14 — a truncated manifest (no entries) plus a fresh proof must not delete the branch.
d="$(shipped r14 p9114)"; run "$d" archive-spec p9114 --yes --skip-smoke
snapshot "$d"; m="$(find "$d/.private/features" -name p9114.manifest)"
sed -i '' -E '/^[0-9a-f]{40}/d' "$m"
finish "$d" p9114; rc=$?
if [[ $rc -ne 0 ]] && grep -q "lists no archived spec" "$SCRATCH/out.log" && git -C "$d" rev-parse --verify -q feature/p9114-x >/dev/null; then
  pass "R14: an empty manifest refuses (exit $rc); branch kept"
else fail "R14: empty manifest (exit $rc)"; show "$SCRATCH/out.log"; fi

# R15 — a commit added to the branch after Half 1 blocks Half 2.
d="$(shipped r15 p9115)"; run "$d" archive-spec p9115 --yes --skip-smoke
( cd "$d" && git checkout -q feature/p9115-x && echo late > late.ts && git add late.ts && git commit -qm late && git checkout -q main ) >/dev/null 2>&1
snapshot "$d"; finish "$d" p9115; rc=$?
if [[ $rc -ne 0 ]] && grep -q "moved since it was archived" "$SCRATCH/out.log" && git -C "$d" rev-parse --verify -q feature/p9115-x >/dev/null; then
  pass "R15: branch advanced after the archive refuses (exit $rc); branch kept"
else fail "R15: advanced branch (exit $rc)"; show "$SCRATCH/out.log"; fi

# R16 — unshipped code on the branch blocks Half 1 (deleting the branch would lose it).
d="$(shipped r16 p9116)"
( cd "$d" && git checkout -q feature/p9116-x && echo late > late.ts && git add late.ts && git commit -qm "fix(p9116): late" && git checkout -q main ) >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9116 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "late.ts" "$SCRATCH/out.log"; then
  pass "R16: unshipped code on the branch refuses (exit $rc), names the file, nothing written"
else fail "R16: unshipped code (exit $rc)"; show "$SCRATCH/out.log"; fi

# R17 — another embargoed file on the branch (ship withholds it by content) blocks Half 1.
d="$(mk r17)"; branch_split "$d" p9117 embargo
( cd "$d" && git checkout -q feature/p9117-x && spec_body p9117 embargo > features/p9117-exploit-notes.md \
  && git add features && git commit -qm "spec(p9117): notes" && git checkout -q main ) >/dev/null 2>&1
review_stamp "$d" p9117; run "$d" ship p9117
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9117 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "exploit-notes" "$SCRATCH/out.log"; then
  pass "R17: an extra embargoed file on the branch refuses (exit $rc), nothing written"
else fail "R17: extra embargoed file (exit $rc)"; show "$SCRATCH/out.log"; fi

# R18 — a blob-mismatch rollback keeps the founder's unrelated uncommitted .private edits.
d="$(shipped r18 p9118)"
( cd "$d/.private" && git config filter.mangle.clean 'sed s/Secret/Public/' && git config filter.mangle.smudge cat \
  && printf '*.md filter=mangle\n' > .gitattributes && git add .gitattributes && git commit -qm attrs ) >/dev/null 2>&1
echo "founder's unsaved note" >> "$d/.private/INDEX.md"; i0="$(git -C "$d/.private" rev-parse HEAD)"
run "$d" archive-spec p9118 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 && "$(git -C "$d/.private" rev-parse HEAD)" == "$i0" ]] && grep -q "unsaved note" "$d/.private/INDEX.md" \
   && [[ -z "$(find "$d/.private/features" -type f 2>/dev/null)" ]]; then
  pass "R18: rollback removed only its own files; the uncommitted .private edit survived (exit $rc)"
else fail "R18: rollback scope (exit $rc)"; show "$SCRATCH/out.log"; fi

# R19 — --finish-pending with one proven and one unproven archive: exit 0, only the proven goes.
d="$(mk r19)"
for pn in p9131 p9132; do branch_split "$d" "$pn" embargo; review_stamp "$d" "$pn"
  run "$d" ship "$pn" || { echo "FIXTURE: ship $pn" >&2; show "$SCRATCH/out.log"; }
  run "$d" archive-spec "$pn" --yes --skip-smoke || { echo "FIXTURE: archive $pn" >&2; show "$SCRATCH/out.log"; }; done
snapshot "$d"; rm -f "$(proof p9132)"
run "$d" archive-spec --finish-pending; rc=$?
if [[ $rc -eq 0 ]] && ! git -C "$d" rev-parse --verify -q feature/p9131-x >/dev/null \
   && git -C "$d" rev-parse --verify -q feature/p9132-x >/dev/null && grep -q "1 of 2" "$SCRATCH/out.log"; then
  pass "R19: sweep finished the proven archive, kept the unproven one, exit 0"
else fail "R19: mixed sweep (exit $rc)"; show "$SCRATCH/out.log"; fi

# R20 — no gitleaks: refuse rather than commit unscanned.
d="$(shipped r20 p9140)"; i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
rc=0; ( cd "$d" && PATH="/usr/bin:/bin:/usr/sbin:/sbin" bash scripts/git-ops.sh archive-spec p9140 --yes --skip-smoke </dev/null ) >"$SCRATCH/out.log" 2>&1 || rc=$?
cat "$SCRATCH/out.log" >> "$SCRATCH/all.log"
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "gitleaks is not installed" "$SCRATCH/out.log"; then
  pass "R20: without gitleaks Half 1 refuses (exit $rc), nothing written"
else fail "R20: no gitleaks (exit $rc)"; show "$SCRATCH/out.log"; fi

# R21 — a merge commit on the branch (git cherry cannot see it) blocks Half 1.
d="$(shipped r21 p9141)"
( cd "$d" && git checkout -q -b side main && echo m > merge-only.ts && git add merge-only.ts && git commit -qm side \
  && git checkout -q feature/p9141-x && git merge -q --no-ff side -m "merge side" && git checkout -q main ) >/dev/null 2>&1
git -C "$d" branch -D side >/dev/null 2>&1
i0="$(git -C "$d/.private" rev-parse HEAD)"; h0="$(git -C "$d" rev-parse main)"
run "$d" archive-spec p9141 --yes --skip-smoke; rc=$?
if [[ $rc -ne 0 ]] && unchanged "$d" "$i0" "$h0" && grep -q "merge commits" "$SCRATCH/out.log"; then
  pass "R21: a merge commit on the branch refuses (exit $rc), nothing written"
else fail "R21: merge on branch (exit $rc)"; show "$SCRATCH/out.log"; fi

# Z — no redirect-parseable tokens in output.
if bad="$(sed '/^#CP_DIAGNOSTIC_BEGIN$/,/^#CP_DIAGNOSTIC_END$/d' "$SCRATCH/all.log" | grep -nE '[<>|]')"; then
  fail "Z: output carries > < | tokens:"; printf '%s\n' "$bad" | sed 's/^/    /' >&2
else
  pass "Z: no > < | tokens in output"
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: $FAILURES failure(s)"; exit 1; fi
echo "RESULT: all passed"
