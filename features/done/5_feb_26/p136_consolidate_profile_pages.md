---
status: today
type: bug
priority: p0
tags: [profile, technical-debt, duplication]
blocks: [134]
---

# P136: Consolidate Profile Page Files & Fix Linked Stories/Points

## Problem

**Two profile page files exist with split features.**

```typescript
// App.tsx uses this (CORRECT - modern UI):
import { ProfilePageV2 } from "@/app/pages/profile-page-v2";

// But P134 implementation was done in this (OLD UI):
import { ProfilePage } from "@/app/pages/profile-page";
```

**Result:** Linked stories/points don't appear because P134 was implemented in the OLD file with outdated UI.

### Root Cause

1. `profile-page-v2.tsx` (1021 lines) - **Current production (MODERN UI)**
   - ✅ Has: Modern UI design, interactive components from P115
   - ❌ Missing: P134 adapter functions, batch queries, linked IDs

2. `profile-page.tsx` (716 lines) - **OLD file (OUTDATED UI)**
   - ✅ Has: P134 adapters, batch queries, linked stories/points logic
   - ❌ Missing: Modern UI (big blue "View My Pledge" button, old layout)

**This violates Single Source of Truth principle.**

## Solution: The KISS Path

### Phase 1: Port P134 to ProfilePageV2

**Goal:** Get links working in the MODERN UI file (ProfilePageV2)

**Strategy:** Port the batch query + adapter logic FROM ProfilePage TO ProfilePageV2

Key code to port:
1. Batch queries for story_points table (lines 160-175 in profile-page.tsx)
2. Map-based lookups: `linksByStory`, `linksByPoint` (lines 177-193)
3. Adapter logic to resolve linked IDs (lines 195-241)
4. Update ProfilePageV2's inline components OR replace with production components

**Verification:**
1. Navigate to any profile (e.g., `/p/vyacheslav-ladischenski-slava`)
2. Stories should show expandable "X points by [Name]" sections
3. Points should show expandable "X stories by [Name]" sections
4. Modern UI should remain intact (no big blue button)

### Phase 2: Test P134 in ProfilePageV2

**After porting the adapter logic:**

```bash
# Start dev server
npm run dev

# Navigate to test profile
open http://localhost:5001/p/vyacheslav-ladischenski-slava

# Check:
# 1. Modern UI is intact (clean layout, "See their Clarity Pledge" link)
# 2. Points tab shows expandable "X stories" sections
# 3. Stories tab shows expandable "X points" sections
```

### Phase 3: Delete Old Profile Page

```bash
# Once ProfilePageV2 has P134 working:
git rm src/app/pages/profile-page.tsx
git commit -m "refactor: consolidate profile pages, delete old UI"
```

**Update any remaining references:**
```bash
# Find any other references to ProfilePage (without V2)
grep -r "from.*profile-page\"" src/ --exclude-dir=node_modules
```

## Acceptance Criteria

- [ ] Phase 1: P134 adapter logic ported to ProfilePageV2
- [ ] Linked stories appear under points on profile (ProfilePageV2)
- [ ] Linked points appear under stories on profile (ProfilePageV2)
- [ ] Modern UI remains intact (no UI regression)
- [ ] Phase 2: Manual testing completed
- [ ] Phase 3: profile-page.tsx (old UI) deleted
- [ ] No references to old ProfilePage remain in codebase
- [ ] All E2E tests pass
- [ ] Git history shows clear refactor commit

## Why This Approach

### KISS Benefits

✅ **Uses existing working code** - Adapter implementation already done
✅ **One source of truth** - Eliminates confusion about which file to edit
✅ **Faster** - Links work with 1-line import change
✅ **Sustainable** - Future changes go to one place

### Anti-Pattern Avoided

❌ Porting adapters to v2 = accepting duplication as permanent
❌ Maintaining two versions = how we got into this mess
❌ "Both files work" = future bugs hide in unused code

## Technical Context

### How We Got Here

1. Original `profile-page.tsx` created (P116/P117)
2. `profile-page-v2.tsx` created for P115 prototype features
3. App switched to use v2
4. P134 work happened on original file (not being used)
5. **Result:** Implementation exists but doesn't execute

### Files Involved

| File | Lines | Status | Has Adapters | Used By App |
|------|-------|--------|--------------|-------------|
| `profile-page.tsx` | 716 | ✅ Current | ✅ Yes | ❌ No |
| `profile-page-v2.tsx` | 1021 | 🗑️ Delete | ❌ No | ✅ Yes |
| `profile-data-bridge.ts` | 74 | ✅ Keep | - | ✅ Yes |
| `App.tsx` | - | 🔧 Update | - | ✅ Yes |

### Related Work

- **P134**: Profile story/point links (implementation done, but in wrong file)
- **P115**: Prototype interactive components (imported by v2)
- **P117**: Backend service layer (used by both files)

## Testing Strategy

### Manual Testing

```bash
# 1. Switch import
# 2. Start dev server
npm run dev

# 3. Navigate to profile
open http://localhost:5001/p/carol-observer-1770616505518

# 4. Check console (should see):
# 🔍 Profile Data Loaded: {
#   stories: N,
#   points: M,
#   storiesWithLinks: X,
#   pointsWithLinks: Y
# }

# 5. Visual check:
# - Stories have expandable sections showing linked points
# - Points have expandable sections showing linked stories
```

### Automated Testing

```bash
# Run full test suite after consolidation
npm test
npm run test:e2e

# Verify no regressions
```

## Migration Notes

### Breaking Changes

**None expected** - This is internal refactoring. External behavior should be identical (or better, since links now work).

### Rollback Plan

If Phase 1 breaks something:

```typescript
// Revert src/App.tsx
import { ProfilePageV2 } from "@/app/pages/profile-page-v2";
```

Simple one-line revert.

## Decision Record

**Why port P134 TO ProfilePageV2 (not switch away from it)?**

ProfilePageV2 is the production version with modern UI:
- Modern, clean layout (not the old "View My Pledge" button design)
- Already in production use
- Users expect this UI

ProfilePage has outdated UI:
- Big blue "View My Pledge" button (marked "outdated" by user)
- Old layout and styling
- Would be a UI regression to switch to it

**Why not just keep both files?**

- Violates Single Source of Truth
- Creates confusion about which file to edit
- One file will drift and become stale

**Philosophy:** Keep the modern UI, port the feature logic to it, delete the old UI file.

## Definition of Done

1. ✅ App continues to use ProfilePageV2 (modern UI)
2. ✅ P134 adapter logic ported to ProfilePageV2
3. ✅ Linked stories/points appear on ProfilePageV2
4. ✅ Modern UI remains intact (no regression)
5. ✅ profile-page.tsx deleted (old UI file)
6. ✅ Tests pass (unit + E2E)
7. ✅ No references to old "ProfilePage" (without V2) remain
8. ✅ Committed with clear message

## Success Metrics

**Before:**
- Links don't appear (code in wrong file)
- Two profile page files (duplication)
- Confusion about which to edit

**After:**
- Links appear correctly
- One profile page file
- Clear where changes go

---

## Implementation Log

### Phase 1: Port P134 to ProfilePageV2
- [x] Copy batch query logic from profile-page.tsx (lines 160-175)
- [x] Copy Map-based lookups (lines 177-193)
- [x] Copy adapter logic (lines 195-241) - adapted production → prototype types
- [x] Update ProfilePageV2's inline components to use linked data
- [x] Replaced PointCardFull with PointCardWithLinks (production component)
- [x] Test on local dev
- [x] Visual verification: expandable sections appear

### Phase 2: Verify No Regression
- [x] Modern UI still intact (no big blue button)
- [x] Stories tab shows linked points
- [x] Points tab shows linked stories
- [x] All interactive features still work
- [x] Screenshot taken showing working state

### Phase 3: Cleanup
- [x] Delete profile-page.tsx (old UI)
- [x] Deleted profile-page.test.tsx (tests for old UI)
- [x] Search for remaining references to "ProfilePage" (without V2) - none found
- [x] Update any imports if needed - none needed
- [x] Run full test suite (532 passed, 2 pre-existing failures unrelated to changes)
- [ ] Commit consolidation
