#!/usr/bin/env bash
# scripts/test-p1279-commit-to-main-index-race.sh — canary for P1279.
#
# P1279: a `commit-to-main` that requested five paths committed exactly ONE file,
# belonging to a concurrent session, under the requesting session's message, and
# exited 0. `commit_staged_exact` had refused the two immediately preceding
# attempts, so the exact-match guard itself works.
#
# MECHANISM (reproduced below): the guard's equality check and the `git commit`
# it protects are NOT adjacent in time. `git commit` runs the pre-commit hook
# (this repo's `pre-commit-checks.sh`, minutes long) BEFORE it reads the index.
# Anything that mutates the shared index during that window — a co-tenant's raw
# `git reset` / `git add`, which main.lock does not hold off — is what gets
# committed. main.lock serializes git-ops CALLERS only.
#
# Scenarios:
#   1. race        — index mutated during the hook window: the commit must NOT
#                    be reported as success (exit non-zero).
#   2. clean       — a normal run still commits exactly the requested paths and
#                    exits 0 (false-positive control; epistemic.md 7c).
#   3. restage     — the hook re-stages a MODIFIED requested file (the ESLint
#                    --fix analogue). Content changes, file set does not: must
#                    still pass.
#   4. extra-path  — commit_staged_exact's pre-existing refusal still fires on a
#                    foreign path staged BEFORE the call (invariant: unchanged).
#
# Control run (a canary nobody has watched fail is not a canary):
#   P1279_GIT_OPS_SRC="$(mktemp -d)/pre.sh"  # git show <pre-fix-sha>:scripts/git-ops.sh
#   scenario 1 must FAIL; 2, 3, 4 must PASS.
#
# Hermetic: scratch repo under mktemp, no network, real repo untouched.
set -u

unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_AUTHOR_DATE \
      GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_COMMITTER_DATE

REPO_ROOT="$(git rev-parse --show-toplevel)"
GIT_OPS_SRC="${P1279_GIT_OPS_SRC:-$REPO_ROOT/scripts/git-ops.sh}"
PASS=0; FAIL=0
ok()  { echo "  OK   $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL $1"; FAIL=$((FAIL+1)); }

TMPROOT="$(mktemp -d)"
cleanup() { [ -n "${P1279_KEEP_TMP:-}" ] && { echo "TMPROOT kept: $TMPROOT"; return 0; }; rm -rf "$TMPROOT"; }
trap cleanup EXIT

# Build a fresh scratch main checkout for each scenario: the bug lands a commit,
# so scenarios must not inherit each other's history.
mk_repo() {
  local d="$TMPROOT/$1"
  mkdir -p "$d/scripts" "$d/.claude/worktrees" "$d/features"
  cp "$GIT_OPS_SRC" "$d/scripts/git-ops.sh"; chmod +x "$d/scripts/git-ops.sh"
  (
    cd "$d"
    git init -q; git config user.email canary@test; git config user.name canary
    git config commit.gpgsign false
    echo seed > README.md
    printf 'a\n' > a.txt; printf 'b\n' > b.txt; printf 'x\n' > foreign.txt
    git add README.md scripts/git-ops.sh a.txt b.txt foreign.txt
    git commit -qm seed
    git branch -M main
  ) >/dev/null 2>&1
  echo "$d"
}

# Install a pre-commit hook that runs CMD once, mid-`git commit`, standing in for
# a co-tenant touching the shared index during the (real, minutes-long) hook run.
install_hook() {
  local d="$1"; shift
  cat > "$d/.git/hooks/pre-commit" <<HOOK
#!/bin/bash
$*
exit 0
HOOK
  chmod +x "$d/.git/hooks/pre-commit"
}

# --no-renames is mandatory: without it git collapses a staged rename's
# delete(old)+add(new) into ONE line, and this helper would report a correct
# two-path rename commit as a one-path mismatch. (It did, first run.)
recorded_files() { ( cd "$1" && git show --stat --name-only --no-renames --format= HEAD | sed '/^$/d' | sort | tr '\n' ' ' ); }

# --- 1. race: index mutated inside the hook window --------------------------
D="$(mk_repo race)"
( cd "$D" && printf 'a2\n' > a.txt && printf 'b2\n' > b.txt && printf 'x2\n' > foreign.txt ) 
install_hook "$D" 'git reset -q HEAD -- a.txt b.txt; git add -- foreign.txt'
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 race" --files a.txt b.txt 2>&1 )"
RC=$?
echo "$OUT" | sed 's/^/    | /'
echo "    exit code: $RC"
# Assert the NUMBER, not merely non-zero. "Non-zero" was the original assertion here
# and it is the reason this canary passed while the CLI was flattening rc 3 to 1 --
# a probe that returns the same verdict for the fixed and the half-fixed code is
# blind. 3 = "a commit LANDED recording the wrong files"; 1 = "refused, nothing
# committed". Callers branch on the difference, so the difference is the contract.
if [ "$RC" -eq 0 ]; then
  bad "race: commit-to-main exited 0 after the index moved under it (recorded: $(recorded_files "$D"))"
elif [ "$RC" -ne 3 ]; then
  bad "race: commit-to-main exited $RC, expected 3 (landed-but-wrong) -- a non-zero code alone does not tell a caller whether a commit exists"
else
  ok "race: commit-to-main exits 3 (landed-but-wrong), not 0 and not a bare 1"
fi
case "$(recorded_files "$D")" in
  *foreign.txt*) echo "    note: the commit records foreign.txt — the mutation did land (window is real)";;
esac

# --- 2. clean: no false positive --------------------------------------------
D="$(mk_repo clean)"
( cd "$D" && printf 'a2\n' > a.txt && printf 'b2\n' > b.txt )
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 clean" --files a.txt b.txt 2>&1 )"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "clean: an ordinary two-file commit-to-main exited $RC"
elif [ "$(recorded_files "$D")" != "a.txt b.txt " ]; then
  bad "clean: recorded '$(recorded_files "$D")', expected 'a.txt b.txt '"
else
  ok "clean: ordinary run commits exactly the requested paths and exits 0"
fi

# --- 3. restage: hook rewrites CONTENT of a requested file -------------------
D="$(mk_repo restage)"
( cd "$D" && printf 'a2\n' > a.txt && printf 'b2\n' > b.txt )
install_hook "$D" 'printf "a3\n" > a.txt; git add -- a.txt'
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 restage" --files a.txt b.txt 2>&1 )"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "restage: an ESLint-style content re-stage of a requested file exited $RC"
elif [ "$(recorded_files "$D")" != "a.txt b.txt " ]; then
  bad "restage: recorded '$(recorded_files "$D")', expected 'a.txt b.txt '"
else
  ok "restage: hook re-staging a requested file's content still commits and exits 0"
fi

# --- 4. extra-path: the pre-existing refusal is intact ----------------------
D="$(mk_repo extra)"
( cd "$D" && printf 'a2\n' > a.txt && printf 'b2\n' > b.txt && printf 'x2\n' > foreign.txt && git add -- foreign.txt )
BEFORE="$( cd "$D" && git rev-parse HEAD )"
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 extra" --files a.txt b.txt 2>&1 )"
RC=$?
AFTER="$( cd "$D" && git rev-parse HEAD )"
if [ "$RC" -eq 3 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "extra-path: a PRE-commit refusal returned 3 (landed-but-wrong) -- callers will skip the index cleanup that this case still needs"
elif [ "$RC" -eq 0 ] || [ "$BEFORE" != "$AFTER" ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "extra-path: a foreign staged path was not refused (rc=$RC, HEAD moved: $([ "$BEFORE" != "$AFTER" ] && echo yes || echo no))"
elif ! echo "$OUT" | grep -q "staged set does not match"; then
  bad "extra-path: refused, but not by commit_staged_exact"
else
  ok "extra-path: commit_staged_exact still refuses a foreign staged path, HEAD unmoved"
fi

# --- 5. rename: git mv must still commit (false-positive control) -----------
# The post-commit check reads `git show --name-only --no-renames`, which lists a
# rename as delete(old)+add(new). If it ever loses --no-renames, git collapses
# them to ONE line and every spec-close rename in cmd_ship starts failing.
D="$(mk_repo rename)"
( cd "$D" && git mv -f a.txt a2.txt )
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 rename" --files a.txt a2.txt 2>&1 )"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "rename: a git mv of one file exited $RC"
elif [ "$(recorded_files "$D")" != "a.txt a2.txt " ]; then
  bad "rename: recorded '$(recorded_files "$D")', expected 'a.txt a2.txt '"
else
  ok "rename: a staged git mv commits both halves and exits 0"
fi

# --- 6. deletion: a pure delete must still commit ---------------------------
D="$(mk_repo delete)"
( cd "$D" && git rm -q a.txt )
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 delete" --files a.txt 2>&1 )"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "delete: a pure deletion exited $RC"
elif [ "$(recorded_files "$D")" != "a.txt " ]; then
  bad "delete: recorded '$(recorded_files "$D")', expected 'a.txt '"
else
  ok "delete: a pure deletion commits and exits 0"
fi

# --- 7. rc 3: a LANDED-but-wrong commit is distinguishable from a refusal ----
# Callers clean up the index on failure (cmd_ship's no-branch closure unstages
# its rename and tells the operator to git mv it back). That recovery is valid
# only when NO commit was created. The two cases must not share an exit code.
D="$(mk_repo rc3)"
( cd "$D" && printf 'a2\n' > a.txt && printf 'x2\n' > foreign.txt )
install_hook "$D" 'git reset -q HEAD -- a.txt; git add -- foreign.txt'
# Asserted through the real entry point: the landed-but-wrong path must NOT print
# the refusal wording (which is what callers key their index cleanup off), and
# must say a commit exists.
OUT="$( cd "$D" && bash scripts/git-ops.sh commit-to-main --message "canary: p1279 rc3" --files a.txt 2>&1 )"
RC=$?
if [ "$RC" -eq 0 ]; then
  bad "rc3: landed-but-wrong commit exited 0"
elif [ "$RC" -ne 3 ]; then
  echo "$OUT" | sed 's/^/    | /'
  bad "rc3: exited $RC, expected 3 -- the code that distinguishes a landed commit from a refusal is being flattened somewhere between commit_staged_exact and the CLI"
elif echo "$OUT" | grep -q "refusing to commit"; then
  echo "$OUT" | sed 's/^/    | /'
  bad "rc3: a LANDED commit was reported with the pre-commit refusal wording -- callers will unstage after it"
elif ! echo "$OUT" | grep -q "the commit LANDED"; then
  echo "$OUT" | sed 's/^/    | /'
  bad "rc3: the failure does not tell the caller a commit already exists"
elif ! echo "$OUT" | grep -q "nothing was unstaged\|nothing was rolled back\|NOT rolled back"; then
  bad "rc3: the failure does not state that nothing was rolled back"
else
  ok "rc3: a landed-but-wrong commit is reported as landed, not as a refusal"
fi

echo ""
echo "P1279 canary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
