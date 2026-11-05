#!/bin/bash
# P1626: run services/transcribe-room-batch pytest from pre-commit, only when that service is staged.
#
# Inputs (environment, so the canary can drive the REAL helper):
#   CP_TRB_STAGED       newline list of staged paths (pre-commit passes the cached name list,
#                       deletions included: removing a test or module must run the suite too)
#   CP_TRB_SERVICE_DIR  service dir (default: this repo's services/transcribe-room-batch)
#   CP_TRB_VENV         venv dir (default: ~/.cache/cp-transcribe-room-batch-venv)
#   CP_TRB_PREFIX       staged-path prefix that triggers the run (default services/transcribe-room-batch/)
#
# Contract: exit 0 ONLY when (a) nothing under the prefix is staged, in which case no Python is
# touched, or (b) pytest itself exited 0. Everything else blocks: missing venv, stale stamp,
# collection error (pytest 2), no tests collected (pytest 5), failures (1), any other code.
# pytest is run WITHOUT a pipe: `pytest | tee` under pipefail masking is epistemic gate 7's trap,
# so its exit code is captured directly and output goes to a temp file.
#
# WORKING TREE, NOT INDEX: pytest imports the files as they are ON DISK. A file that is only
# partially staged (git add -p) is tested as the whole working copy, not as the staged blob.
# Honest limit: the verdict covers what is on disk, which is what the author last ran.
# Output contract (shell-safety): status lines carry no redirect tokens.
set -uo pipefail

SERVICE_DIR="${CP_TRB_SERVICE_DIR:-$(git rev-parse --show-toplevel)/services/transcribe-room-batch}"
VENV="${CP_TRB_VENV:-$HOME/.cache/cp-transcribe-room-batch-venv}"
PREFIX="${CP_TRB_PREFIX:-services/transcribe-room-batch/}"
SETUP_CMD="./scripts/setup-transcribe-room-batch-venv.sh"

banner() {
    echo "################################################################"
    echo "# BLOCKED: transcribe-room-batch worker tests cannot run: $1"
    echo "# Fix: run  $SETUP_CMD  (builds $VENV from the hash-locked requirements.txt)"
    echo "# This commit touches the worker, so a silent pass is not allowed (P1626)."
    echo "################################################################"
}

TOUCHED=$(printf '%s\n' "${CP_TRB_STAGED:-}" | grep -c "^$PREFIX" || true)
if [ "${TOUCHED:-0}" -eq 0 ]; then
    echo "skipped: no $PREFIX path staged"
    exit 0
fi

PY="$VENV/bin/python"
if [ ! -x "$PY" ]; then
    banner "venv missing at $VENV"
    exit 1
fi
STAMP_FILE="$VENV/requirements.sha256"
if [ ! -f "$STAMP_FILE" ]; then
    banner "venv has no requirements stamp"
    exit 1
fi
WANT=$(shasum -a 256 "$SERVICE_DIR/requirements.txt" 2>/dev/null | awk '{print $1}')
HAVE=$(cat "$STAMP_FILE")
if [ -z "$WANT" ] || [ "$WANT" != "$HAVE" ]; then
    banner "venv stamp is stale (built from a different requirements.txt)"
    exit 1
fi

OUT=$(mktemp)
rc=0
(cd "$SERVICE_DIR" && env -u PYTHONPATH PYTHONDONTWRITEBYTECODE=1 \
    "$PY" -m pytest -p no:cacheprovider -q tests) > "$OUT" 2>&1 || rc=$?
if [ "$rc" -eq 0 ]; then
    tail -3 "$OUT"
    rm -f "$OUT"
    echo "OK: worker tests passed (pytest exit 0, working tree as on disk)"
    exit 0
fi
tail -40 "$OUT"
rm -f "$OUT"
case "$rc" in
    1) why="tests failed (pytest exit 1)" ;;
    2) why="collection error or interrupted (pytest exit 2)" ;;
    5) why="no tests were collected (pytest exit 5)" ;;
    *) why="pytest exited $rc" ;;
esac
banner "$why"
exit 1
