#!/usr/bin/env bash
# env-sentinel.sh — shared 0-byte check for .env.local and .env.test.local.
#
# Origin: P783 — `.env.local` silently truncated to 0 bytes by an
# eval-of-stderr redirect-injection bug in setup-worktree.sh output.
# Sentinel wired into:
#   - scripts/check-worktree-env.sh (fires on every `npm run dev`)
#   - scripts/pre-commit-checks.sh (fires on every `git commit`)
#
# Exits the caller (returns non-zero from the function) if any required env
# file exists but has size 0, or if its symlink target has size 0. Files that
# do not exist at all are allowed through — this script only flags truncation.

check_env_sentinel() {
  local root="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
  if [[ -z "$root" || ! -d "$root" ]]; then
    echo "env-sentinel: could not resolve repo root" >&2
    return 1
  fi

  local f target
  for f in "$root/.env.local" "$root/.env.test.local"; do
    # Not present (or via a symlink whose target doesn't exist): nothing to check
    [[ -e "$f" ]] || continue

    if [[ ! -s "$f" ]]; then
      echo "FATAL: $f is 0 bytes (possible truncation — see features/p783_env_local_truncation.md)" >&2
      echo "       Restore from restic (gs:claritypledge-backups:/mac) or Dropbox GPG tarball." >&2
      return 1
    fi

    if [[ -L "$f" ]]; then
      target="$(readlink "$f")"
      # Resolve relative symlink targets against the symlink's directory.
      if [[ "$target" != /* ]]; then
        target="$(cd "$(dirname "$f")" && pwd)/$target"
      fi
      if [[ -e "$target" && ! -s "$target" ]]; then
        echo "FATAL: $f symlink target $target is 0 bytes" >&2
        return 1
      fi
    fi
  done

  return 0
}
