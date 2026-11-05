#!/bin/bash
# P1626: run services/transcribe-room-batch pytest from pre-commit, only when that service is staged.
#
# Inputs (environment, so the canary can drive the REAL helper):
#   CP_TRB_STAGED     newline list of staged paths (pre-commit passes the cached name list,
#                     deletions included: removing a test or module must run the suite too)
#   CP_TRB_VENV_ROOT  venv root (default ~/.cache/cp-transcribe-room-batch-venv); the venv used is
#                     ROOT/sha256-of-the-INDEXED-requirements.txt (built by the setup script)
#   CP_TRB_PREFIX     service path prefix (default services/transcribe-room-batch/)
# The repo is the COMMITTING repo: `git rev-parse --show-toplevel` from the cwd, never this file's
# location (a worktree runs main's symlinked hook, and an older branch may differ).
#
# Contract: exit 0 ONLY when (a) nothing under the prefix is staged, (b) the index holds no file
# under the prefix (service removed), or (c) pytest itself exited 0 on a snapshot of the INDEX.
# Everything else blocks: no venv for this lockfile, collection error (pytest 2), no tests (5),
# failures (1), any other code, or a zero-exit run that did not report passed tests.
# pytest runs on `git checkout-index` of every indexed service file, so it tests exactly what the
# commit will contain (git honours a hook's temporary GIT_INDEX_FILE); the lockfile hash comes from
# that snapshot too. pytest is never piped (gate 7: tee/pipefail masking): its code is captured directly.
# PYTEST_ADDOPTS and PYTEST_PLUGINS are cleared and -c /dev/null ignores stray ini files, so an
# inherited `-k` or `--collect-only` cannot turn a failing suite into a pass.
# Output contract (shell-safety): status lines carry no redirect tokens.
set -uo pipefail

PREFIX="${CP_TRB_PREFIX:-services/transcribe-room-batch/}"
VENV_ROOT="${CP_TRB_VENV_ROOT:-$HOME/.cache/cp-transcribe-room-batch-venv}"
SETUP_CMD="./scripts/setup-transcribe-room-batch-venv.sh"

banner() {
    echo "################################################################"
    echo "# BLOCKED: transcribe-room-batch worker tests cannot pass: $1"
    echo "# Fix: run  $SETUP_CMD  (builds the venv for the on-disk requirements.txt, keyed by its hash)"
    echo "# This commit touches the worker, so a silent pass is not allowed (P1626)."
    echo "################################################################"
}

TOUCHED=$(printf '%s\n' "${CP_TRB_STAGED:-}" | grep -c "^$PREFIX" || true)
if [ "${TOUCHED:-0}" -eq 0 ]; then
    echo "skipped: no $PREFIX path staged"
    exit 0
fi

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || { banner "not inside a git repo"; exit 1; }
cd "$REPO" || exit 1
SNAP=$(mktemp -d) || { banner "cannot create a temp dir"; exit 1; }
OUT="$SNAP.out"
trap 'rm -rf "$SNAP" "$OUT"' EXIT
trap 'exit 130' INT TERM HUP

INDEXED=$(git ls-files --cached -- "$PREFIX" | grep -c . || true)
if [ "${INDEXED:-0}" -eq 0 ]; then
    echo "service removed from index: no file under $PREFIX is indexed, nothing to test"
    exit 0
fi
if ! git ls-files -z --cached -- "$PREFIX" | xargs -0 git checkout-index --prefix="$SNAP/" --; then
    banner "could not snapshot the index"
    exit 1
fi
SERVICE_SNAP="$SNAP/${PREFIX%/}"
if [ ! -f "$SERVICE_SNAP/requirements.txt" ]; then
    banner "requirements.txt is not in the index"
    exit 1
fi
HASH=$(shasum -a 256 "$SERVICE_SNAP/requirements.txt" | awk '{print $1}')
PY="$VENV_ROOT/$HASH/bin/python"
if [ ! -x "$PY" ] || [ "$(cat "$VENV_ROOT/$HASH/requirements.sha256" 2>/dev/null)" != "$HASH" ]; then
    banner "no venv for the indexed requirements.txt (sha256 $HASH)"
    exit 1
fi

rc=0
(cd "$SERVICE_SNAP" && env -u PYTHONPATH -u PYTEST_ADDOPTS -u PYTEST_PLUGINS \
    PYTHONDONTWRITEBYTECODE=1 \
    "$PY" -m pytest -p no:cacheprovider -c /dev/null --rootdir="$SERVICE_SNAP" -q tests) > "$OUT" 2>&1 || rc=$?
if [ "$rc" -eq 0 ] && grep -q ' passed' "$OUT"; then
    tail -3 "$OUT"
    echo "OK: worker tests passed (pytest exit 0, on a snapshot of the index)"
    exit 0
fi
tail -40 "$OUT"
case "$rc" in
    0) why="pytest exited 0 but reported no passed tests" ;;
    1) why="tests failed (pytest exit 1)" ;;
    2) why="collection error or interrupted (pytest exit 2)" ;;
    5) why="no tests were collected (pytest exit 5)" ;;
    *) why="pytest exited $rc" ;;
esac
banner "$why"
exit 1
