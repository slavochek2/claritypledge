#!/bin/bash
# P1626: build the venv pre-commit uses to run services/transcribe-room-batch tests.
# Layout: ~/.cache/cp-transcribe-room-batch-venv/SHA256/ where SHA256 is the hash of the ON-DISK
# services/transcribe-room-batch/requirements.txt. Python 3.12 (the image's), hash-checked install
# (--require-hashes). Built in a temp sibling and published by atomic rename; a live venv is never
# deleted, so venvs for different lockfiles coexist (another branch or worktree keeps working).
# Re-run after requirements.txt changes (stage the new lockfile too: the hook keys on the INDEXED one).
# Output contract: no redirect tokens in status lines.
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
REQ="$ROOT_DIR/services/transcribe-room-batch/requirements.txt"
VENV_ROOT="${CP_TRB_VENV_ROOT:-$HOME/.cache/cp-transcribe-room-batch-venv}"

command -v uv >/dev/null 2>&1 || { echo "FATAL: uv is not installed"; exit 1; }
[ -f "$REQ" ] || { echo "FATAL: missing $REQ"; exit 1; }

# One-time migration: the first version of this script made the venv AT the root. Remove it only
# when it is exactly that shape (a venv with this script's stamp), never anything else.
if [ -f "$VENV_ROOT/pyvenv.cfg" ] && [ -f "$VENV_ROOT/requirements.sha256" ]; then
    echo "migrating: removing the old unkeyed venv this script created at $VENV_ROOT"
    rm -rf "$VENV_ROOT"
fi
mkdir -p "$VENV_ROOT"

HASH=$(shasum -a 256 "$REQ" | awk '{print $1}')
FINAL="$VENV_ROOT/$HASH"
if [ -x "$FINAL/bin/python" ] && [ "$(cat "$FINAL/requirements.sha256" 2>/dev/null)" = "$HASH" ]; then
    echo "OK: venv for $HASH already exists at $FINAL"
    exit 0
fi

TMPV="$VENV_ROOT/.building-$HASH-$$"
trap 'rm -rf "$TMPV"' EXIT
uv venv --python 3.12 "$TMPV"
uv pip install --python "$TMPV/bin/python" --require-hashes -r "$REQ"
echo "$HASH" > "$TMPV/requirements.sha256"
# Atomic publish: a racing setup's valid venv is kept; an invalid one (bad or no stamp) is moved aside,
# then removed, so the command the hook's banner names always repairs what the hook refuses.
publish() { python3 -c 'import os,sys; os.rename(sys.argv[1], sys.argv[2])' "$TMPV" "$FINAL" 2>/dev/null; }
valid() { [ -x "$FINAL/bin/python" ] && [ "$(cat "$FINAL/requirements.sha256" 2>/dev/null)" = "$HASH" ]; }
if publish; then
    echo "OK: venv ready at $FINAL"
elif valid; then
    echo "OK: a concurrent build published $FINAL first"
else
    ASIDE="$VENV_ROOT/.invalid-$HASH-$$"
    mv "$FINAL" "$ASIDE" && publish && rm -rf "$ASIDE" && valid || { echo "FATAL: could not publish $FINAL"; exit 1; }
    echo "OK: replaced an invalid venv at $FINAL"
fi
