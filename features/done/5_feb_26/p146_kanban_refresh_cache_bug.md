---
status: all-done
type: bug
severity: medium
date_reported: 2026-02-15
date_resolved: 2026-02-15
completed_at: 2026-02-15
rank: 146.0
root_cause: Kanban server cached features on first request, cache never invalidated when new files created on disk
resolution: Added cache-busting via ?refresh=true query parameter
tags: []
created_date: 2026-02-15
---

# P146: Kanban Refresh Button Doesn't Invalidate Cache

## Bug Description

**Reported:** 2026-02-15
**Severity:** Medium (affects developer workflow, not user-facing)

**Symptoms:**
- Items marked as `status: done` in frontmatter via git don't appear in Done column
- Refresh button doesn't update the kanban board to reflect file changes made outside the UI
- Cache persists stale data until server restart

**Reproduction steps:**
1. Start kanban server (`npm run kanban`)
2. Move a feature file from `features/` to `features/done/` via git
3. Update frontmatter to `status: done` via git/editor
4. Click refresh button in kanban UI
5. Expected: Item moves to Done column
6. Actual: Item stays in original column with old status

**Affected users:** Developers using kanban board (internal tool)

**Root cause:** (from debugging agent analysis)
- Refresh button calls `fetchFeatures()` → `getCachedFeatures()`
- `getCachedFeatures()` returns cached data without staleness check
- Cache is only invalidated on PATCH operations (UI updates)
- No mechanism to bypass cache on explicit refresh

**Files involved:**
- Kanban server implementation (likely in `scripts/`)

---

## Resolution

**Fixed:** 2026-02-15
**Root cause:** Kanban server cached features on first GET request. Cache only invalidated on PATCH (UI updates), never when new files added to disk or when refresh button clicked.
**Resolution:** Added `?refresh=true` query parameter support:
- Server: Clears cache before fetching when `refresh=true` parameter is present
- Client: Refresh button now passes `refresh=true` to API endpoint

**Files changed:**
- `tools/kanban/server/api.ts` (added cache invalidation logic)
- `tools/kanban/src/App.tsx` (modified refresh button to pass `refresh=true`)

**Verification:**
- All 4 URL patterns tested (with/without refresh, with/without worktree)
- P144 now appears after clicking refresh
- All tests passing (535/535)
- No regressions detected
