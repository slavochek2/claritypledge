#!/usr/bin/env bash
# test-p1507-leak-guard.sh — hermetic canary for P1507 leak path 3: a features/**
# markdown blob whose frontmatter says `disclosure: embargo` may never be committed
# on main (pre-commit, staged mode) nor reach main through a pushed range (CI,
# range mode). Gate 7c: the workflows that already exist must still pass.
#
# Usage: scripts/test-p1507-leak-guard.sh [path/to/check-disclosure.sh]
set -uo pipefail
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE

W="$(cd "$(dirname "$0")/.." && pwd)"
CHECK="${1:-$W/scripts/check-disclosure.sh}"
SCRATCH="$(mktemp -d)"; trap 'rm -rf "$SCRATCH"' EXIT
FAILURES=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES + 1)); }

spec() {  # spec <disclosure-line> [body]
  printf -- '---\nstatus: backlog\ntype: bug\nrank: 1\n%s\n---\n# Demo\n%s\n' "$1" "${2:-}"
}
D="$SCRATCH/r"; mkdir -p "$D/features/done/2026-01-01"
( cd "$D" && git init -q && git config user.email c@t && git config user.name c && git config commit.gpgsign false \
  && echo seed > README.md && git add README.md && git commit -qm seed && git branch -M main ) >/dev/null 2>&1

staged() {  # staged <expect-rc> <label> — run staged mode, reset index afterwards
  local want="$1" label="$2" rc=0
  ( cd "$D" && bash "$CHECK" ) >"$SCRATCH/out" 2>&1 || rc=$?
  # A refusal must be THIS guard's refusal, not the older missing-field check's.
  if [[ $rc -eq $want ]] && { [[ $want -eq 0 ]] || grep -q "must never reach main" "$SCRATCH/out"; }; then
    pass "$label (exit $rc)"; else fail "$label (want $want, got $rc)"; sed 's/^/    /' "$SCRATCH/out" >&2; fi
  ( cd "$D" && git reset -q && git clean -qfdx features ) >/dev/null 2>&1
}
stage() { mkdir -p "$D/$(dirname "$1")"; printf '%s' "$2" > "$D/$1"; ( cd "$D" && git add -- "$1" ); }

# ── staged mode, on main ────────────────────────────────────────────────────
stage features/p1_x.md "$(spec 'disclosure: embargo')";                   staged 1 "S1: new embargo spec staged on main refused"
stage features/done/2026-01-01/p2_x.md "$(spec 'disclosure: embargo')";   staged 1 "S2: embargo copy under done/ (e.g. from .private) refused"
stage features/p3_x.md "$(spec '  "Disclosure" : embargo')";               staged 1 "S3: indented, quoted, any-case key refused"
stage features/p4_x.md "$(printf -- '---\r\nstatus: x\r\ndisclosure: embargo\r\n---\r\n')"; staged 1 "S4: CRLF frontmatter refused"
stage features/p5_x.md "$(spec 'disclosure: public' 'Mentions disclosure: embargo in prose.')"; staged 0 "S5: public spec that mentions embargo in its body passes"
stage features/p6_security-review-pending.md "$(spec 'disclosure: public')"; staged 0 "S6: legacy public stub passes"
stage docs/x.md "$(spec 'disclosure: embargo')";                          staged 0 "S7: a non-features file is out of scope"

# Modify an existing tracked public spec into embargo: refused even though it is M, not A.
stage features/p8_x.md "$(spec 'disclosure: public')"; ( cd "$D" && git commit -qm p8 ) >/dev/null 2>&1
stage features/p8_x.md "$(spec 'disclosure: embargo')";                   staged 1 "S8: modifying a tracked spec to embargo on main refused"

# ── staged mode, on a feature branch (a worktree): embargo is the expected state ──
( cd "$D" && git checkout -q -b feature/p9-x ) >/dev/null 2>&1
stage features/p9_x.md "$(spec 'disclosure: embargo')";                   staged 0 "S9: embargo spec on its own feature branch passes"
( cd "$D" && git checkout -q main ) >/dev/null 2>&1

# ── range mode (CI on main) ─────────────────────────────────────────────────
base="$(git -C "$D" rev-parse main)"
rng() {  # rng <expect-rc> <label>
  local want="$1" label="$2" rc=0
  ( cd "$D" && bash "$CHECK" --range "$base..HEAD" ) >"$SCRATCH/out" 2>&1 || rc=$?
  # A refusal must be THIS guard's refusal, not the older missing-field check's.
  if [[ $rc -eq $want ]] && { [[ $want -eq 0 ]] || grep -q "must never reach main" "$SCRATCH/out"; }; then
    pass "$label (exit $rc)"; else fail "$label (want $want, got $rc)"; sed 's/^/    /' "$SCRATCH/out" >&2; fi
}
( cd "$D" && git checkout -q -b r1 && mkdir -p features && spec 'disclosure: embargo' > features/p10_x.md \
  && git add features && git commit -qm leak ) >/dev/null 2>&1
rng 1 "G1: a pushed range adding an embargo spec refused"
( cd "$D" && git checkout -q main && git checkout -q -b r2 && spec 'disclosure: public' > features/p11_x.md \
  && git add features && git commit -qm ok ) >/dev/null 2>&1
rng 0 "G2: a normal ship range (public spec only) passes"
( cd "$D" && git checkout -q main && git checkout -q -b r3 && spec 'disclosure: embargo' > features/p12_x.md \
  && git add features && git commit -qm add && git rm -q features/p12_x.md && git commit -qm del ) >/dev/null 2>&1
rng 1 "G3: embargo added then deleted inside the range still refused (it is in history)"
( cd "$D" && git checkout -q main && spec 'disclosure: public' > features/p13_security-review-pending.md \
  && git add features && git commit -qm stub ) >/dev/null 2>&1; base="$(git -C "$D" rev-parse main)"
( cd "$D" && git checkout -q -b r4 && git rm -q features/p13_security-review-pending.md && git commit -qm "chore: close p13" ) >/dev/null 2>&1
rng 0 "G4: legacy stub deletion ('chore: close pN') passes"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: $FAILURES failure(s)"; exit 1; fi
echo "RESULT: all passed"
