#!/usr/bin/env bash
# ship-gates.sh — Hard-assert ship gates 2.5 and 2.7 before merging.
# Usage: ./scripts/ship-gates.sh pN
# Exit 0: all gates pass (output lines are human-readable gate results).
# Exit 1: at least one hard gate failed (message explains which).
#
# Output contract: no >, <, or | at word boundaries (shell-safety.md P783).

# NOTE: pipefail intentionally OFF. Every pipeline below parses into `head -1`,
# which closes the pipe early and SIGPIPE-kills the upstream `git`/`grep`/`find`
# (exit 141). Under pipefail + set -e that aborted the whole script silently
# before any gate ran. These parse-pipes have no real failure to detect upstream.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pn="${1:-}"
if [[ -z "$pn" ]]; then
  echo "Usage: $0 pN" >&2
  exit 1
fi
if [[ ! "$pn" =~ ^p[0-9]+$ ]]; then
  echo "Error: pN must match p[0-9]+ (got: $pn)" >&2
  exit 1
fi

fail=0

# ── Gate 2.5: spec status ───────────────────────────────────────────────────
# Reads from the feature branch (authoritative — specs evolve on the branch,
# main's copy is stale until /ship completes per features.md).
# Falls back to main disk if no feature branch exists.

feature_branch="$(cd "$REPO_ROOT" && git branch --list "feature/${pn}-*" | head -1 | tr -d ' *+')"
spec_status=""

if [[ -n "$feature_branch" ]]; then
  spec_path="$(cd "$REPO_ROOT" && git ls-tree -r --name-only "$feature_branch" 2>/dev/null \
    | grep -E "^features/${pn}_[^/]+\.md$" | head -1)"
  if [[ -n "$spec_path" ]]; then
    spec_status="$(cd "$REPO_ROOT" && git show "${feature_branch}:${spec_path}" 2>/dev/null \
      | grep -m1 '^status:' | sed 's/^status:[[:space:]]*//' | tr -d '[:space:]')"
    spec_source="branch ${feature_branch}"
  else
    spec_source="${feature_branch} (spec not found on branch — trying main disk)"
  fi
fi

if [[ -z "$spec_status" ]]; then
  # No branch or spec not on branch — fall back to main disk
  spec_file="$(cd "$REPO_ROOT" && find features -maxdepth 3 -type f -name "${pn}_*.md" \
    ! -path "features/done/*" ! -path "features/archive/*" ! -path "features/uat/*" \
    2>/dev/null | sort | head -1)"
  if [[ -n "$spec_file" ]]; then
    spec_status="$(grep -m1 '^status:' "${REPO_ROOT}/${spec_file}" | sed 's/^status:[[:space:]]*//' | tr -d '[:space:]')"
    spec_source="${spec_source:-main disk}"
  fi
fi

if [[ -z "$spec_status" ]]; then
  echo "[GATE 2.5] FAIL: spec not found for ${pn} on branch or disk"
  fail=1
elif [[ "$spec_status" == "qa" || "$spec_status" == "done" || "$spec_status" == "all-done" ]]; then
  echo "[GATE 2.5] PASS: spec status is '${spec_status}' (from ${spec_source})"
else
  echo "[GATE 2.5] FAIL: spec status is '${spec_status}' (from ${spec_source}) — must be qa, done, or all-done"
  fail=1
fi

# ── Gate 2.7: code review artifact ─────────────────────────────────────────

finish_file="${REPO_ROOT}/.claude/.finish-reviewed"

if [[ ! -f "$finish_file" ]]; then
  echo "[GATE 2.7] FAIL: .claude/.finish-reviewed not found — run /finish before shipping"
  fail=1
else
  code_entry_count="$(grep -c '"type":"code"' "$finish_file" 2>/dev/null || echo 0)"
  if [[ "$code_entry_count" -lt 1 ]]; then
    echo "[GATE 2.7] FAIL: .claude/.finish-reviewed has no code review entry — run /finish before shipping"
    fail=1
  else
    echo "[GATE 2.7] PASS: code review artifact present (${code_entry_count} code entr$([ "$code_entry_count" -eq 1 ] && echo "y" || echo "ies"))"
  fi
fi

# ── Gate 2.7b: staleness check (warn only) ─────────────────────────────────

if [[ -f "$finish_file" ]]; then
  branch="feature/${pn}-"
  matching_branch="$(cd "$REPO_ROOT" && git branch --list "${branch}*" | head -1 | tr -d ' *+')"

  if [[ -n "$matching_branch" ]]; then
    latest_commit_ts="$(cd "$REPO_ROOT" && git log -1 --format="%ct" "$matching_branch" 2>/dev/null || echo 0)"

    if command -v stat >/dev/null 2>&1; then
      # macOS
      finish_mtime="$(stat -f '%m' "$finish_file" 2>/dev/null)" || \
        # Linux fallback
        finish_mtime="$(stat -c '%Y' "$finish_file" 2>/dev/null)" || \
        finish_mtime=0
    else
      finish_mtime=0
    fi

    if [[ "$finish_mtime" -eq 0 || "$latest_commit_ts" -eq 0 ]]; then
      echo "[GATE 2.7b] SKIP: could not determine mtime or commit timestamp"
    elif [[ "$latest_commit_ts" -gt "$finish_mtime" ]]; then
      echo "[GATE 2.7b] WARN: .finish-reviewed is older than latest commit on ${matching_branch} — consider re-running /finish"
    else
      echo "[GATE 2.7b] PASS: .finish-reviewed is current"
    fi
  fi
fi

# ── Result ──────────────────────────────────────────────────────────────────

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

exit 0
