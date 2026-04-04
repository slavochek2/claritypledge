---
status: all-done
completed_at: '2026-04-04'
type: bug
rank: 1000051.0
severity: low
workstream: tooling
date_reported: '2026-04-04'
created_date: '2026-04-04'
tags: [kanban, worktrees, tooling]
date_resolved: '2026-04-04'
root_cause: getWorktrees() in kanban api.ts did not filter prunable worktree blocks from git worktree list --porcelain output; agent worktrees with paths not matching /w\d+/ fell through to name="main" fallback
---

# P645: Kanban shows multiple "main" entries in worktree dropdown

## Summary

The kanban worktree dropdown displays 4–5 entries labeled "(main) summary" instead of one, due to stale prunable agent worktrees being included in the list.

## Root Cause

`getWorktrees()` in `tools/kanban/server/api.ts` parses all blocks from `git worktree list --porcelain` but never checks for the `prunable` line. Prunable agent worktrees (paths like `.claude/worktrees/agent-a338541b`) don't match the `/\/worktrees\/(w\d+)$/` regex, so they all fall through to the `name = 'main'` fallback. With 4 stale agent worktrees present, the dropdown shows 5 items named "main".

## Reproduction Steps

1. Ensure 2+ prunable agent worktrees exist: `git worktree list` — look for entries marked `prunable`
2. Start kanban: `npm run kanban` (port 9050)
3. Open worktree dropdown in the top-right of the kanban UI
4. Observe: multiple "(main) summary" entries appear

**Reproduction rate:** 100% when prunable agent worktrees exist

## Expected Behavior

Dropdown shows one entry per active (non-prunable) worktree: `(main)`, `(wt) w1 — feature/p617`, `(wt) w2 — feature/p581`.

## Actual Behavior

Dropdown shows 5 `(main) summary` entries (1 real main + 4 ghost entries from prunable agent worktrees), plus the 2 active feature worktrees.

## Affected Files

- `tools/kanban/server/api.ts` — `getWorktrees()` function, lines 37–60 — missing `prunable` line check

## Severity

**Low** — cosmetic/tooling only; kanban still functions, but the duplicate entries are confusing and clutter the dropdown.

## Fix Approach

In `getWorktrees()`, skip any worktree block that contains a line starting with `prunable`:

```ts
// Skip prunable worktrees (stale agent worktrees with no .git dir)
if (lines.some(l => l.startsWith('prunable'))) continue
```

Add this check at the top of the `for (const block of blocks)` loop, before extracting `path` and `branch`.

## Acceptance Criteria

- [ ] Kanban worktree dropdown shows exactly one "(main)" entry when prunable agent worktrees exist
- [ ] Active feature worktrees (w1, w2) still appear correctly
- [ ] `git worktree list` output with prunable entries does not affect the dropdown count
- [ ] No console errors in kanban server related to worktree parsing
