#!/bin/bash
# test-p1507-next-p-number.sh — canary for P1507: with no public placeholder, a
# sensitive spec's number is held by (a) its branch while in flight and (b) its
# archived copy in .private/features/ once the branch is gone. next-p-number.sh
# must never reissue either. Also from a worktree, where .private lives only in
# the main checkout.
# Gate 7: SCRIPT_UNDER_TEST=<pre-fix copy> must make N1-N3 fail.
set -u
W="$(cd "$(dirname "$0")/.." && pwd)"
SUT="${SCRIPT_UNDER_TEST:-$W/scripts/next-p-number.sh}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
FAIL=0
check() { if [[ "$2" == "$3" ]]; then echo "PASS: $1 ($2)"; else echo "FAIL: $1 (want $3, got $2)" >&2; FAIL=$((FAIL+1)); fi; }
mkrepo() {
  local r="$T/$1"; mkdir -p "$r/scripts" "$r/features" "$r/supabase/migrations"
  cp "$SUT" "$r/scripts/next-p-number.sh"; chmod +x "$r/scripts/next-p-number.sh"
  echo x > "$r/features/p10_a.md"
  ( cd "$r" && git init -q && git config user.email c@t && git config user.name c && git config commit.gpgsign false \
    && printf '.private/\n.claude/worktrees/\n' > .gitignore && git add .gitignore scripts features \
    && git commit -qm s && git branch -M main ) >/dev/null 2>&1
  echo "$r"
}
DONE=features/done
r="$(mkrepo n1)"; mkdir -p "$r/.private/$DONE/2026-01-01"; echo x > "$r/.private/$DONE/2026-01-01/p5000_s.md"
check "N1: an archived private spec holds its number" "$("$r/scripts/next-p-number.sh")" 5001
r="$(mkrepo n2)"; git -C "$r" branch feature/p6000-sensitive >/dev/null 2>&1
check "N2: a feature branch with no spec on main holds its number" "$("$r/scripts/next-p-number.sh")" 6001
r="$(mkrepo n3)"; mkdir -p "$r/.private/$DONE/x"; echo x > "$r/.private/$DONE/x/p7000_s.md"
( cd "$r" && git worktree add -q .claude/worktrees/w1 -b feature/p11-x ) >/dev/null 2>&1
check "N3: run from a worktree still sees the main checkout's .private" "$("$r/.claude/worktrees/w1/scripts/next-p-number.sh")" 7001
r="$(mkrepo n4)"; mkdir -p "$r/.private/crm"; echo x > "$r/.private/crm/p9999_note.md"
check "N4: .private outside features/ does not drive the sequence" "$("$r/scripts/next-p-number.sh")" 11
(( FAIL == 0 )) && echo "RESULT: all passed" || { echo "RESULT: $FAIL failure(s)"; exit 1; }
