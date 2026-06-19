#!/usr/bin/env bash
# branch-guard.sh — One-Worktree=One-Branch enforcement (P781).
#
# A feature/fix branch must live in a WORKTREE, never bare in the main checkout.
# A bare feature branch in the main working dir orphans the branch, lets a
# co-tenant switch HEAD/tree under you, and (incident 2026-06-19) duplicates the
# commit on main while staying invisible to kanban.
#
# Wired into:
#   - scripts/pre-commit-checks.sh (fires on every `git commit`)
#
# Worktrees (toplevel under .claude/worktrees/) are the legitimate home for
# feature/fix branches and are exempt. main / staging/* / presi/* etc. are not
# feature branches, so they pass. Bypassable only with `git commit --no-verify`.
#
# Usage: check_bare_branch "<toplevel>" "<branch>"
#   return 0 — ok (worktree, or not a feature/fix branch)
#   return 1 — violation (feature/feat/fix branch in the main checkout)
check_bare_branch() {
  local toplevel="$1" branch="$2"
  case "$toplevel" in
    */.claude/worktrees/*) return 0 ;;  # inside a worktree — legitimate
  esac
  case "$branch" in
    feature/*|feat/*|fix/*) return 1 ;;  # bare feature branch in main checkout
  esac
  return 0
}
