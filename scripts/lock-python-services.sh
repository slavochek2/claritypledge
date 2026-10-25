#!/usr/bin/env bash
# P1563 item 5: regenerate the hash-locked requirements for the Python services.
#
#   ./scripts/lock-python-services.sh [transcribe|transcribe-room-batch|all]    (default: all)
#
# Each service keeps its ranged dependencies in requirements.in (the only file a human edits) and a
# fully hash-locked requirements.txt generated from it FOR THE IMAGE'S REAL TARGET (interpreter and
# platform below), which the Dockerfile installs with `pip install --require-hashes`.
#
# Why a container: openai-whisper and docopt ship only as source archives, and uv must run their
# setup.py to learn their dependencies. That has to happen on linux/amd64 (the metadata is platform
# dependent) and not on the developer machine, so uv runs inside a digest-pinned uv image under
# linux/amd64. Needs Docker. Only the service directory is mounted. Nothing is installed.
#
# EXCLUDE_NEWER is the release-age cooldown for Python (the .npmrc `min-release-age` equivalent):
# resolution ignores any release newer than this timestamp, which also makes a re-run reproducible.
# Bump it deliberately (about a week behind today) when refreshing a lock.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
EXCLUDE_NEWER="2026-10-18T00:00:00Z"
PLATFORM="x86_64-manylinux_2_28"
UV_IMG_311="ghcr.io/astral-sh/uv:python3.11-bookworm@sha256:58683a39536f1f4ed2e1dd79cf155edccfb47731aba8964bd0312aac942126cf"
UV_IMG_312="ghcr.io/astral-sh/uv:python3.12-bookworm@sha256:85d4cb1afa769a7338e095b927bee941cf5ec92266c7424b3f6c0f2748567248"

command -v docker >/dev/null || { echo "lock-python-services: docker not found" >&2; exit 2; }

# lock <service> <python-version> <uv-image> [--input F --output F] [extra uv args: source-only packages]
lock() {
  local svc="$1" py="$2" img="$3" in="requirements.in" out="requirements.txt"; shift 3
  if [ "${1:-}" = "--input" ]; then in="$2"; out="$4"; shift 4; fi
  local dir="$ROOT/services/$svc"
  [ -f "$dir/$in" ] || { echo "lock-python-services: $dir/$in missing" >&2; exit 2; }
  echo "== $svc: python $py, $PLATFORM, packages not on a wheel: ${*:-none}"
  docker run --rm --platform linux/amd64 -v "$dir":/work -w /work "$img" \
    uv pip compile "$in" --generate-hashes --only-binary :all: "$@" \
      --python-version "$py" --python-platform "$PLATFORM" \
      --exclude-newer "$EXCLUDE_NEWER" -o "$out"
}

target="${1:-all}"
case "$target" in transcribe|transcribe-room-batch|all) ;; *) echo "usage: $0 [transcribe|transcribe-room-batch|all]" >&2; exit 2 ;; esac
if [ "$target" = transcribe ] || [ "$target" = all ]; then
  # openai-whisper and docopt: source archives only on PyPI (see docs/technical/supply-chain.md)
  lock transcribe 3.11 "$UV_IMG_311" --no-binary openai-whisper --no-binary docopt
  # build tooling for those two source builds (installed first by the Dockerfile)
  lock transcribe 3.11 "$UV_IMG_311" --input build-requirements.in --output build-requirements.txt
fi
if [ "$target" = transcribe-room-batch ] || [ "$target" = all ]; then
  lock transcribe-room-batch 3.12 "$UV_IMG_312"
fi
