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

# Fail closed if audit script missing
AUDIT_SCRIPT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
if [ ! -x "$AUDIT_SCRIPT" ]; then
  echo "  ❌ $AUDIT_SCRIPT missing — cannot verify privacy, blocking push"
  exit 1
fi

# Load the blessed UTC parser — REQUIRED by the push-on expiry check below.
# Fail closed: if it's missing, parse_utc_epoch stays undefined, every flag reads as
# unparseable, and the Layer 3 confirm always fires. Safe, but push-on stops working —
# so make the reason visible rather than silently degrading.
DATETIME_LIB="$(git rev-parse --show-toplevel)/scripts/lib-datetime.sh"
if [[ -f "$DATETIME_LIB" ]]; then
  # shellcheck source=scripts/lib-datetime.sh
  source "$DATETIME_LIB"
else
  echo "  ⚠️  $DATETIME_LIB missing — push-on expiry cannot be verified; the prod confirm will always prompt." >&2
fi

# Load the shared watched-path constant (P950)
WATCHED_PATHS_FILE="$(git rev-parse --show-toplevel)/scripts/privacy-watched-paths.sh"
WATCHED_PATHS="docs/ features/ .claude/commands/ CLAUDE.md README.md content/articles/ content/sifter/ supabase/migrations/"
# shellcheck disable=SC1090
if [[ -f "$WATCHED_PATHS_FILE" ]]; then
  # shellcheck source=scripts/privacy-watched-paths.sh
  source "$WATCHED_PATHS_FILE"
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
# Requires a /privacy stamp (reviewed commit SHA) covering all watched-path commits
# in the push range. Runs REGARDLESS of push-enable (push-enable only waives Layer 3).
# Stamp path uses --git-common-dir (shared across all worktrees). (P950)
for line in "${PUSH_REFS[@]}"; do
  read -r local_ref local_sha remote_ref remote_sha <<< "$line"
  if [[ "$remote_ref" != "refs/heads/main" ]]; then
    continue
  fi

  # ── Determine push range (fail-closed on edge cases) ─────────────────────
  RANGE=""
  if [[ "$remote_sha" == "0000000000000000000000000000000000000000" ]]; then
    # New branch being pushed
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      RANGE="origin/main..$local_sha"
    else
      # No origin/main at all — fail-closed; can't determine what's new
      echo ""
      echo "  ❌ PRIVACY GATE: no origin/main found; cannot determine push range."
      echo "  Run /maintain:privacy first, then push."
      exit 1
    fi
  elif ! git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
    # Force-push: remote is not an ancestor of local — range would be degenerate
    echo ""
    echo "  ❌ PRIVACY GATE: force-push detected (remote SHA not an ancestor of local)."
    echo "  Run /maintain:privacy first, then push."
    exit 1
  else
    RANGE="$remote_sha..$local_sha"
  fi

  # ── Enumerate watched-path commits in range ───────────────────────────────
  # shellcheck disable=SC2086
  WATCHED_COMMITS="$(git rev-list "$RANGE" -- $WATCHED_PATHS 2>/dev/null)"

  if [[ -z "$WATCHED_COMMITS" ]]; then
    continue  # No watched-path commits — gate passes
  fi

  # ── Read the reviewed SHA stamp ───────────────────────────────────────────
  GIT_COMMON="$(git rev-parse --git-common-dir)"
  # git-common-dir may be relative (main worktree) or absolute (linked worktree)
  if [[ "$GIT_COMMON" != /* ]]; then
    GIT_COMMON="$(git rev-parse --show-toplevel)/$GIT_COMMON"
  fi
  STAMP_FILE="$GIT_COMMON/.privacy-reviewed"

  if [[ ! -f "$STAMP_FILE" ]]; then
    echo ""
    echo "  ❌ PRIVACY GATE: watched-path commits in push range but no /privacy review on record."
    echo "  Run /maintain:privacy first."
    echo ""
    echo "  Unreviewed commits:"
    echo "$WATCHED_COMMITS" | head -10 | while IFS= read -r c; do
      git log --oneline -1 "$c" 2>/dev/null | sed 's/^/     /'
    done
    exit 1
  fi

  REVIEWED_SHA="$(tr -d '[:space:]' < "$STAMP_FILE")"

  # Fail-closed on empty or non-SHA stamp
  if [[ -z "$REVIEWED_SHA" ]] || ! [[ "$REVIEWED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo ""
    echo "  ❌ PRIVACY GATE: stamp is empty or not a valid 40-char SHA."
    echo "  Re-run /maintain:privacy."
    exit 1
  fi

  # Fail-closed if REVIEWED_SHA doesn't exist in this repo
  if ! git cat-file -e "$REVIEWED_SHA" 2>/dev/null; then
    echo ""
    echo "  ❌ PRIVACY GATE: reviewed SHA $REVIEWED_SHA does not exist in this repo."
    echo "  Re-run /maintain:privacy."
    exit 1
  fi

  # ── Check each watched-path commit is an ancestor of REVIEWED_SHA ─────────
  UNCOVERED=""
  while IFS= read -r commit; do
    if [[ -z "$commit" ]]; then continue; fi
    if ! git merge-base --is-ancestor "$commit" "$REVIEWED_SHA" 2>/dev/null; then
      UNCOVERED="$UNCOVERED$commit "
    fi
  done <<< "$WATCHED_COMMITS"

  if [[ -n "$UNCOVERED" ]]; then
    echo ""
    echo "  ❌ PRIVACY GATE: these doc/content commits are not covered by the last /privacy review:"
    for c in $UNCOVERED; do
      git log --oneline -1 "$c" 2>/dev/null | sed 's/^/     /'
    done
    echo ""
    echo "  Run /maintain:privacy to review, then push again."
    exit 1
  fi
done

# ── push-on waiver: waives ONLY Layer 3 (the TTY confirm) below ──────────────
# Layers 1 and 2 already ran and passed above. `push-on` creates this flag with an
# expiry timestamp inside it; `push-off` removes it.
#
# The expiry is ENFORCED HERE (2026-08-05). Previously this tested `[[ -f ]]` alone,
# so a stale flag waived the confirm forever — `push-on`'s cleanup job is best-effort
# and dies with its terminal (observed live: a "30-minute" flag still granting pushes
# 3h23m later). A revocation that depends on a background job surviving is one that
# silently fails open, so the consumer must check.
#
# FAILS CLOSED on every ambiguity — missing, empty, legacy contentless, unparseable,
# or past expiry all fall through to the Layer 3 confirm. Worst case a human answers
# a prompt; the alternative is an unattended push on lapsed authorization.
PUSH_FLAG="$HOME/.push-enabled"
if [[ -f "$PUSH_FLAG" ]]; then
  _exp="$(head -1 "$PUSH_FLAG" 2>/dev/null)"
  _exp_s="$(parse_utc_epoch "$_exp" 2>/dev/null || true)"
  _now_s="$(date -u +%s)"
  # Ceiling mirrors block-prod-deploy.sh: a flag claiming >2h of remaining life is
  # bogus (typo'd `push-on 100000`, or hand-edited) and re-creates the permanent grant.
  if [[ -n "$_exp_s" ]] && (( _exp_s - _now_s <= 7200 )) && (( _now_s < _exp_s )); then
    echo "  ✅ Push allowed (push-on active until $_exp; PII scan + privacy gate enforced above)."
    exit 0
  fi
  echo "  ⚠️  ~/.push-enabled present but expired/unreadable (${_exp:-empty}) — falling through to the confirm." >&2
  echo "     Run 'push-on' to re-arm, or 'push-off' to tidy the stale flag." >&2
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
