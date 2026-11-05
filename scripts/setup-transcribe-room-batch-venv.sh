#!/bin/bash
# P1626: build the venv that pre-commit uses to run services/transcribe-room-batch tests.
# Outside the repo (shared by every worktree), Python 3.12 (the image's), installed from the
# hash-locked requirements.txt with --require-hashes. Stamps the sha256 of that lockfile
# inside the venv; scripts/lib/transcribe-room-batch-tests.sh refuses a venv whose stamp differs.
# Re-run this after requirements.txt changes. Output contract: no redirect tokens in status lines.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REQ="$ROOT/services/transcribe-room-batch/requirements.txt"
VENV="$HOME/.cache/cp-transcribe-room-batch-venv"   # fixed: this script rm -rf's it

command -v uv >/dev/null 2>&1 || { echo "FATAL: uv is not installed"; exit 1; }
[ -f "$REQ" ] || { echo "FATAL: missing $REQ"; exit 1; }

rm -rf "$VENV"
uv venv --python 3.12 "$VENV"
uv pip install --python "$VENV/bin/python" --require-hashes -r "$REQ"
shasum -a 256 "$REQ" | awk '{print $1}' > "$VENV/requirements.sha256"
echo "OK: venv ready at $VENV (stamp $(cat "$VENV/requirements.sha256"))"
