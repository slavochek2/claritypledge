#!/bin/bash
# Pre-push hook (TRACKED SOURCE — installed as a symlink by scripts/install-hooks.sh).
#
# Edit THIS file, not .git/hooks/pre-push. The live hook is a symlink to this file,
# so a fresh `bash scripts/install-hooks.sh` recreates it on any clone / worktree / CI.
#
# Three layers, in order — each strictly more bypassable than the one above it:
#   1. PII content scan        — NON-bypassable. Not by push-enable, not by any agent file.
#   2. Privacy judgment gate   — requires a /maintain:privacy stamp. push-enable does NOT waive it.
#   3. Prod TTY confirm         — human-only. push-enable DOES waive this (and only this).
#
# Why the gate sits ABOVE push-enable (P917): authorizing a push (`push-enable`) is not the
# same as having done the privacy review. push-enable means "I, a human, accept this push" —
# it waives the interactive confirm, never the judgment layer.

remote="$1"

# Parse an ISO-8601 UTC timestamp (e.g. 2026-06-10T07:39:12Z) to epoch seconds.
# The stamp is written with `date -u` (SKILL.md step 6), so it MUST be parsed as UTC.
# Portable across BSD `date` (macOS dev) and GNU `date` (Linux CI / fresh clone):
#   - BSD: `date -j -f` ignores the Z and assumes LOCAL time unless TZ=UTC is forced.
#   - GNU: `date -j` is invalid, so it falls through to `date -u -d` which honors Z.
# Without TZ=UTC a fresh stamp reads as hours-stale and the gate hard-blocks every push.
parse_iso_utc() {
  TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null \
    || date -u -d "$1" +%s 2>/dev/null \
    || echo 0
}

# Fail closed if audit script missing
AUDIT_SCRIPT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
if [ ! -x "$AUDIT_SCRIPT" ]; then
  echo "  ❌ $AUDIT_SCRIPT missing — cannot verify privacy, blocking push"
  exit 1
fi

# Read stdin into array (bash 3.2 compatible — no mapfile)
PUSH_REFS=()
while IFS= read -r line; do
  [ -n "$line" ] && PUSH_REFS+=("$line")
done

# ── Layer 1: PII content scan ────────────────────────────────────────────────
# Runs for ALL branches. NOT bypassable by push-enable, and NOT bypassable by any
# agent-touchable file. Legit exceptions go through the committed + reviewed
# .privacy-allowlist, never an ad-hoc flag.
for line in "${PUSH_REFS[@]}"; do
  read -r local_ref local_sha remote_ref remote_sha <<< "$line"
  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      RANGE="origin/main..$local_sha"
    else
      RANGE="$local_sha"
    fi
  else
    RANGE="$remote_sha..$local_sha"
  fi

  if ! "$AUDIT_SCRIPT" "$RANGE" > /tmp/cp-pii-push.log 2>&1; then
    echo ""
    echo "  ❌ PUSH BLOCKED: personal identifiers in range $RANGE"
    head -15 /tmp/cp-pii-push.log
    echo ""
    echo "  Fix options:"
    echo "    1. Amend / add new commits to remove the PII"
    echo "    2. Allowlist the path: add to .privacy-allowlist (committed + reviewed)"
    echo "  (The touch-able .allow-pii-next-push one-shot was removed — an agent could"
    echo "   create it, silently defeating this scan. Use the committed allowlist instead.)"
    exit 1
  fi
done

# ── Layer 2: Privacy judgment gate ───────────────────────────────────────────
# Requires a fresh /maintain:privacy stamp when docs/ (etc.) change on a push to main.
# Runs REGARDLESS of push-enable (push-enable only waives Layer 3 below).
# Stamp path is unified with .claude/commands/slava/maintain/privacy/SKILL.md step 6:
#   .claude/.privacy-reviewed  (gitignored — never committable)
for line in "${PUSH_REFS[@]}"; do
  read -r local_ref local_sha remote_ref remote_sha <<< "$line"
  if [[ "$remote_ref" != "refs/heads/main" ]]; then
    continue
  fi

  DOCS_CHANGED=""
  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      DOCS_CHANGED=$(git diff --name-only "origin/main..$local_sha" -- docs/ features/ .claude/commands/ CLAUDE.md README.md 2>/dev/null)
    else
      DOCS_CHANGED=$(git diff-tree --no-commit-id --name-only -r "$local_sha" -- docs/ features/ .claude/commands/ CLAUDE.md README.md 2>/dev/null)
    fi
  else
    DOCS_CHANGED=$(git diff --name-only "$remote_sha".."$local_sha" -- docs/ features/ .claude/commands/ CLAUDE.md README.md 2>/dev/null)
  fi

  if [[ -n "$DOCS_CHANGED" ]]; then
    STAMP_FILE="$(git rev-parse --show-toplevel)/.claude/.privacy-reviewed"
    if [[ ! -f "$STAMP_FILE" ]]; then
      echo ""
      echo "  ❌ PRIVACY GATE: docs/ files changed but no /privacy review on record."
      echo "  Run /maintain:privacy first (writes .claude/.privacy-reviewed)."
      echo ""
      echo "  Changed docs:"
      echo "$DOCS_CHANGED" | head -10 | sed 's/^/     /'
      exit 1
    fi

    # Check if stamp is older than the latest doc commit
    STAMP_TIME=$(parse_iso_utc "$(cat "$STAMP_FILE" | tr -d '[:space:]')")
    # Fail CLOSED on an unparseable / empty stamp (parse_iso_utc returns 0). A 0
    # would otherwise pass the `-lt` check whenever LATEST_DOC_COMMIT also resolves
    # to 0 (no commits on the watched paths), silently waiving the review.
    if [[ "$STAMP_TIME" -le 0 ]]; then
      echo ""
      echo "  ❌ PRIVACY GATE: .claude/.privacy-reviewed is empty or unparseable."
      echo "  Re-run /maintain:privacy to write a valid UTC timestamp."
      exit 1
    fi
    LATEST_DOC_COMMIT=$(git log -1 --format=%ct -- docs/ features/ .claude/commands/ CLAUDE.md README.md 2>/dev/null || echo "0")
    if [[ "$STAMP_TIME" -lt "$LATEST_DOC_COMMIT" ]]; then
      echo ""
      echo "  ⚠️  PRIVACY GATE: docs changed AFTER last /privacy review."
      echo "  Re-run /maintain:privacy to refresh the stamp."
      echo ""
      echo "  Changed since review:"
      echo "$DOCS_CHANGED" | head -10 | sed 's/^/     /'
      exit 1
    fi
  fi
done

# ── push-enable waiver: waives ONLY Layer 3 (the TTY confirm) below ──────────
# Layers 1 and 2 already ran and passed above. `push-enable` creates this flag,
# `push-disable` removes it.
if [[ -f "$HOME/.push-enabled" ]]; then
  echo "  ✅ Push allowed (push-enable active; PII scan + privacy gate enforced above)."
  exit 0
fi

# ── Layer 3: Prod TTY confirm ────────────────────────────────────────────────
for line in "${PUSH_REFS[@]}"; do
  read -r local_ref local_sha remote_ref remote_sha <<< "$line"
  if [[ "$remote_ref" != "refs/heads/main" ]]; then
    continue
  fi

  # Check for in-progress features (extra context for the prompt)
  IN_PROGRESS=$(grep -rl "status: in-progress" features/ 2>/dev/null | grep "features/p" | sort)

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Pushing to main → Vercel will deploy to claritypledge.com"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [[ -n "$IN_PROGRESS" ]]; then
    echo ""
    echo "  ⚠️  In-progress features (NOT on this push, just FYI):"
    while IFS= read -r file; do
      title=$(grep "^title:" "$file" 2>/dev/null | head -1 | sed 's/title: //')
      echo "     $(basename "$file" | sed 's/_.*//; s/p/P/') — $title"
    done <<< "$IN_PROGRESS"
  fi

  echo ""
  echo "  Ship to production? (y/N)"

  # Require TTY — agents can't provide this, so they're blocked
  exec < /dev/tty
  read -r answer

  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo "  Push cancelled."
    exit 1
  fi

  echo "  Pushing..."
done

exit 0
