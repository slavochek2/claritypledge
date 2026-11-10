#!/usr/bin/env bash
# finish-skip-check.sh — may /finish skip its code review? (P1662)
#
#   scripts/finish-skip-check.sh <pN|->
#
# Exit 0  skip is safe: a code entry for this pN records sha == HEAD, AND the working tree
#         and index hold NO change of any kind (modified, staged, deleted, renamed, or a new
#         untracked file). The tree is then exactly the HEAD that was reviewed.
# Exit 1  the review must run.
# Exit 2  usage error.
#
# Why: `sha == HEAD` alone said "same HEAD, same tree", which is false for uncommitted work.
# /finish reviews staged and unstaged changes, so a review, then an uncommitted edit, then a
# re-run skipped the review and the edit shipped unreviewed. A content receipt was tried and
# rejected in review (deleted files, the staged-vs-worktree split and unreadable files all
# slipped through it). A clean tree has no such gaps: whatever is not committed forces a review.
# The cost is deliberate: re-running /finish on a dirty tree always reviews again.
#
# Ignored: specs under features/ (not code-reviewed), and the untracked worktree artifacts
# `.lock` and `node_modules` (any depth).
# Not covered: a source file the user deliberately gitignores is invisible to git status.
# Fails closed: any git error means "review". Output contract: no redirect tokens.
set -u

# tree_clean — 0 when the working tree and index match HEAD, by the one rule both the stamp
# writers (--tree-state) and the skip decision use. Fails closed on any git error.
tree_clean() {
  # Index flags that make git status blind to an edit (assume-unchanged, skip-worktree).
  if grep -qE '^([a-z]|S) ' < <(git ls-files -v 2>/dev/null); then
    echo "index has assume-unchanged or skip-worktree paths"; return 1
  fi
  # Submodules can hide edits in more ways than one status call sees (their own index flags,
  # a nested `ignore = all`, P1662 review rounds 3-4). This repo has none, so any submodule at
  # all means "review" rather than chasing each configuration.
  if [[ -n "$(git submodule status --recursive 2>/dev/null)" || -f "$(git rev-parse --show-toplevel 2>/dev/null)/.gitmodules" ]]; then
    echo "the repository has submodules; the skip does not cover them"; return 1
  fi
  local status_file
  status_file="$(mktemp)" || { echo "cannot create a temp file"; return 1; }
  # NUL-separated, so no path shape (spaces, newlines, quotes) can be misread.
  if ! git status --porcelain=v1 -z --untracked-files=all --ignore-submodules=none > "$status_file" 2>/dev/null; then
    rm -f "$status_file"; echo "git status failed"; return 1
  fi
  python3 - "$status_file" <<'PY'
import sys
data = open(sys.argv[1], "rb").read().split(b"\0")
def ignored(path, xy):
    # Specs are not code-reviewed (dev.md 9.95 exempts features/ from review freshness), so a
    # ticked acceptance box after the review must not force a code re-review.
    if path.startswith(b"features/"):
        return True
    # Worktree artifacts, untracked only: .lock, and node_modules at any depth
    # (pre-commit links tools/kanban/node_modules into every worktree).
    if xy == b"??" and (path == b".lock" or b"node_modules" in path.split(b"/")):
        return True
    return False
i, dirty = 0, []
while i < len(data):
    entry = data[i]
    i += 1
    if not entry:
        continue
    xy, path = entry[:2], entry[3:]
    if xy[:1] in (b"R", b"C"):
        i += 1  # a rename/copy carries its source path as the next record
    if ignored(path.rstrip(b"/"), xy):
        continue
    dirty.append(path.decode("utf-8", "replace"))
if dirty:
    print("changed since HEAD: " + ", ".join(dirty[:5]) + (" ..." if len(dirty) > 5 else ""))
    sys.exit(1)
sys.exit(0)
PY
  local rc=$?
  rm -f "$status_file"
  return "$rc"
}

# --tree-state: what a stamp writer records as "clean" at review time.
if [[ "${1:-}" == "--tree-state" && "$#" -eq 1 ]]; then
  if tree_clean > /dev/null; then echo true; else echo false; fi
  exit 0
fi

pn="${1:-}"
if [[ -z "$pn" || "$#" -ne 1 ]]; then
  echo "usage: finish-skip-check.sh <pN|->   |   finish-skip-check.sh --tree-state" >&2
  exit 2
fi

head="$(git rev-parse HEAD 2>/dev/null)" || { echo "finish-skip-check: no HEAD: review runs"; exit 1; }
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || { echo "finish-skip-check: no git dir: review runs"; exit 1; }
stamp="${common}/.finish-reviewed"
if [[ ! -s "$stamp" ]]; then
  echo "finish-skip-check: no review stamp: review runs"
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || branch=""

# A code entry naming this pN, this HEAD and this branch, recorded on a clean tree.
# Parsed as JSON, never grepped by key order (P1216); undecodable bytes are skipped.
if ! python3 - "$stamp" "$pn" "$head" "$branch" <<'PY'
import json, sys
stamp, pn, head, branch = sys.argv[1:5]
for line in open(stamp, encoding="utf-8", errors="replace"):
    try:
        e = json.loads(line)
    except ValueError:
        continue
    # "clean": the review saw exactly HEAD (P1662 round 2: a review of a dirty tree, then the
    # edit discarded, would otherwise skip with a committed version nobody read). Entries
    # without it, or without a branch, never skip.
    if (e.get("type") == "code" and e.get("pn") == pn and e.get("sha") == head
            and e.get("branch") == branch and e.get("clean") is True):
        sys.exit(0)
sys.exit(1)
PY
then
  echo "finish-skip-check: no clean-tree code review recorded for ${pn} at HEAD ${head:0:9} on ${branch}: review runs"
  exit 1
fi

if ! why="$(tree_clean)"; then
  echo "finish-skip-check: the tree differs from the reviewed HEAD (${why}): review runs"
  exit 1
fi

echo "finish-skip-check: ${pn} reviewed at HEAD ${head:0:9} and the tree is clean: skip"
exit 0
