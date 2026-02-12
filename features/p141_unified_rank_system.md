---
status: in-progress
type: task
priority: p0
tags: []
sort_order: 1000002
---

# P141: Unified Rank System

## Problem

The kanban currently has two overlapping ordering systems (`priority: p0-p3` for strategic buckets and `sort_order` for tactical positioning), creating ambiguity when multiple features share the same priority. When looking at the focus tab, it's unclear which p0 item should be worked on first. Additionally, the current p0-p3 range is too coarse for expressing fine-grained importance across a growing backlog.

**Key pain points:**
- Multiple p0 items in same status have no inherent ordering without manual drag
- `sort_order` is the actual ordering mechanism but it's invisible and tedious to manage
- Can't express relative importance beyond 4 levels (p0-p3)
- System doesn't scale for agent-driven re-prioritization in the future

## Solution

**Merge `priority` and `sort_order` into a single `rank` field with fractional numbering.**

### Design Decisions (from requirements analysis)

1. **Field name:** `rank` (avoids collision with P-numbers like p140)
2. **Number type:** Fractional (0.5, 1.0, 1.5, 100.234) for infinite insertion without renumbering
3. **Semantics:** Ordinal position (rank: 1.0 = 1st item, rank: 50.0 = 50th item), NOT strategic meaning
4. **Sorting:** Numeric ascending (lower rank = higher priority)
5. **Status expansion:** Add `status: draft` and `status: rejected` to match folder structure

### Key Benefits

- **Single source of truth:** One field for ordering, no ambiguity
- **Agent-friendly:** Can insert anywhere without touching other features (insert 5.5 between 5.0 and 6.0)
- **Sustainable:** No renumbering cascades as backlog grows
- **Git-friendly:** Inserting a feature only changes ONE file
- **Clear "what's next":** Focus tab sorts by rank, shows unambiguous ordering

## Technical Requirements

### Executive Summary (from Tech Architect Agent ae55106)

**Scope:** Replace dual ordering system (`priority: p0-p3` + `sort_order: number`) with single `rank: number` field.

**Complexity:** Medium-High. Changes affect 8 core files, requires migration of ~15 active features, no database schema changes (markdown frontmatter only).

**Risk Level:** Medium. Breaking changes to TypeScript types, potential for data loss during migration if not careful, git history could become messy if migration isn't atomic.

**Implementation:** 4-phase gradual rollout (Schema → UI dual-mode → Migration → Cleanup)

### Gap Analysis: What Breaks

#### 1. Type Definitions (`tools/kanban/src/lib/types.ts`)
- **Breaks:** All code referencing `Priority` type, `feature.priority`, `feature.sort_order`
- **Impact:** ~20 code locations across 6 files
- **Fix:** Add `rank?: number` (Phase 1), remove old fields (Phase 4)

#### 2. Backend (`tools/kanban/server/api.ts`)
- **Breaks:** Validation fails for `rank`, parsing ignores `rank`, PATCH rejects `rank` updates
- **Impact:** HIGH — Features with rank rejected, drag-and-drop fails
- **Fix:** Add rank parsing/validation/caching (Phase 1)

#### 3. UI (`App.tsx`, `FocusPage.tsx`, `Card.tsx`)
- **Breaks:** Sorting breaks entirely (no field to sort by), drag-and-drop calculations fail
- **Impact:** CRITICAL — Board becomes unusable
- **Fix:** Update to use `rank ?? sort_order` fallback (Phase 2)

#### 4. Feature Creation (`.claude/commands/slava/build/create-feature.md`)
- **Breaks:** Skill creates features with obsolete `priority` field
- **Impact:** MEDIUM — New features won't sort correctly
- **Fix:** Update templates to use `rank` (Phase 3)

### Implementation Phases

#### Phase 1: Schema Changes (Non-Breaking)
**Goal:** Add `rank` field without removing `priority`/`sort_order` yet

**Changes:**
1. `types.ts`: Add `rank?: number`, add `'draft' | 'rejected'` to Status
2. `api.ts`: Add rank parsing, validation, PATCH handler, cache updates
3. Test: Kanban still works with old fields, accepts new rank field

**Why First:** Allows gradual rollout, easy rollback

#### Phase 2: UI Changes (Dual Support)
**Goal:** Make UI prefer `rank` over `sort_order`, but fall back if missing

**Changes:**
1. `App.tsx`: `getEffectiveOrder()` checks `rank ?? sort_order`
2. `FocusPage.tsx`: Sort by `rank ?? sort_order`
3. `Card.tsx`: Show rank badge if present, priority badge otherwise
4. Test: Features with rank sort correctly, features without rank fall back

**Why Second:** UI changes need schema support (Phase 1) first

#### Phase 3: Migration (Data Transformation)
**Goal:** Convert all features from priority/sort_order to rank

**Process:**
1. Backup features/
2. Run migration script (see Migration Strategy section)
3. Verify: count unchanged, ordering preserved, all have rank
4. Commit atomically

**Why Third:** Requires UI dual-mode (Phase 2) before cleanup (Phase 4)

#### Phase 4: Cleanup (Remove Old Fields)
**Goal:** Remove priority/sort_order entirely, make rank required

**Changes:**
1. Remove `Priority` type, `priority` field, `sort_order` field from types
2. Remove priority/sort_order validation, parsing, handlers from API
3. Simplify UI (no fallbacks, rank-only)
4. Test: All features have rank, no TypeScript errors

**Why Last:** Migration (Phase 3) must complete before removing old fields

### Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Migration script data loss** | HIGH | MEDIUM | Backup features/ before migration, dry-run mode, atomic commit, verify post-migration |
| **Rank value collisions** | MEDIUM | LOW | Migration assigns unique integers, drag uses fractional insertion, sorting uses id tiebreaker |
| **Drag-and-drop breaks during transition** | HIGH | MEDIUM | Phase 2 uses dual-mode (`rank ?? sort_order`), test with mixed features |
| **Git history pollution** | MEDIUM | HIGH | Single atomic commit, use `.git-blame-ignore-revs`, clear commit message |
| **Skill out of sync** | MEDIUM | HIGH | Update skill in same commit as migration, add pre-commit validation |
| **Fractional rank accumulation** | LOW | HIGH | Use `toFixed(2)` when saving, future "compact ranks" operation if needed |

### Rollback Plan

**Immediate Rollback (During Development):**
```bash
git reset --hard HEAD~1  # Revert schema/UI/migration changes
npm run kanban           # Verify old version works
```

**Complete Rollback (Production Emergency):**
```bash
# Restore from backup
rm -rf features/
cp -r features.backup.<timestamp> features/
git add features/
git commit -m "Rollback P141: restore priority/sort_order system"
```

**Recovery Time:** ~15 minutes (if backup exists)

### Files to Change

1. **`tools/kanban/src/lib/types.ts`** (18 lines)
   - Phase 1: Add `rank?: number`, add draft/rejected to Status
   - Phase 4: Remove Priority type, priority field, sort_order field

2. **`tools/kanban/server/api.ts`** (549 lines)
   - Phase 1: Add rank parsing (line ~151), validation, PATCH handler, cache
   - Phase 4: Remove VALID_PRIORITY, priority/sort_order parsing/handlers

3. **`tools/kanban/src/App.tsx`** (750 lines)
   - Phase 2: Update `getEffectiveOrder()` to `rank ?? sort_order`
   - Phase 4: Simplify to rank-only

4. **`tools/kanban/src/components/FocusPage.tsx`** (~400 lines)
   - Phase 2: Update `sortFeatures()` to prefer rank
   - Phase 4: Remove PRIORITY_ORDER, simplify sorting

5. **`tools/kanban/src/components/Card.tsx`** (250+ lines)
   - Phase 2: Add rank badge rendering
   - Phase 4: Remove PRIORITY_STYLES, priority badge

6. **`tools/kanban/src/components/CardDialog.tsx`** (~350 lines)
   - Phase 2: Add rank field to editable properties
   - Phase 4: Remove priority from PRIORITY_OPTIONS

7. **`.claude/commands/slava/build/create-feature.md`**
   - Phase 3: Replace priority prompt with rank prompt

8. **Status expansion** (`api.ts` folder auto-move logic)
   - Phase 5: Add draft → features/drafts/, rejected → features/archive/

## Migration Strategy

### Overview (from Migration Engineer Agent acd73ea)

**Scope:** Mechanical conversion of ~15 active features (excludes done/archive folders)

**Process:** Read features → Sort by (sort_order, priority, status, id) → Assign sequential ranks (1.0, 2.0, 3.0) → Remove old fields → Verify ordering preserved

**Safety:** Backup before migration, dry-run mode, atomic git commit, comprehensive validation

### Migration Algorithm

1. **Scan Phase:** Find `features/*.md`, `features/bugs_and_debt/*.md` (exclude done/, archive/, drafts/)
2. **Parse Phase:** Extract frontmatter (priority, sort_order, status, id)
3. **Sort Phase:** Replicate current kanban sorting logic:
   ```javascript
   sort by: (sort_order ?? 1000000) → status → (priority ?? 99) → id
   ```
4. **Rank Assignment:** Sequential integers (1.0, 2.0, 3.0, ...)
5. **Frontmatter Update:** Add `rank`, remove `priority`/`sort_order`, preserve all other fields
6. **File Write:** Serialize YAML, write back
7. **Verification:** Count unchanged, ordering preserved, all have rank field

### Migration Script

**File:** `scripts/migrate-to-rank.js` (Node.js with js-yaml)

**Usage:**
```bash
# Preview changes
node scripts/migrate-to-rank.js --dry-run

# Execute migration
node scripts/migrate-to-rank.js

# Verbose output
node scripts/migrate-to-rank.js --verbose
```

**Key features:**
- Dry-run mode (shows changes without writing)
- Verbose logging (shows each file conversion)
- Edge case handling (missing priority/sort_order)
- Skip already-migrated features
- Metrics reporting (count, time, breakdown)

**Script provided in agent output** (acd73ea) — ~150 lines, ready to execute

### Pre-Migration Checklist

- [ ] **Backup features directory**
  ```bash
  cp -r features/ "features.backup.$(date +%Y%m%d_%H%M%S)"
  ```

- [ ] **Install dependencies**
  ```bash
  npm install js-yaml
  ```

- [ ] **Run pre-migration validation**
  - Count features
  - Capture current ordering (save to /tmp/order-before.json)
  - Compute content checksum

- [ ] **Test in dry-run mode**
  ```bash
  node scripts/migrate-to-rank.js --dry-run | head -50
  ```

- [ ] **Commit current state** (clean rollback point)
  ```bash
  git add .
  git commit -m "Pre-migration checkpoint: P141"
  ```

### Migration Execution

1. **Run migration:** `node scripts/migrate-to-rank.js`
2. **Verify no errors:** Check script output
3. **Run post-migration validation:** Verify count, ranks, ordering preserved
4. **Visual spot-check:** Open kanban, test drag-and-drop
5. **Git commit:** Atomic commit with detailed message
6. **Test in kanban:** Create feature, drag-and-drop, filter by status

### Post-Migration Validation

**Script:** `scripts/post-migration-validation.sh`

**Checks:**
- [ ] Feature count unchanged
- [ ] All features have `rank` field
- [ ] No features have `priority` or `sort_order` fields
- [ ] Feature ordering preserved (compare IDs before/after)
- [ ] Rank values valid (positive numbers)

### Rollback Procedure

**If migration fails:**

1. **Git revert (if committed):** `git revert HEAD`
2. **Restore from backup:** `rm -rf features/ && cp -r features.backup.* features/`
3. **Manual fix (if partial):** Restore specific files from backup

### Edge Case Handling

| Case | Strategy |
|------|----------|
| Feature with priority but no sort_order | Use priority fallback (sort_order = 1000000) |
| Feature with sort_order but no priority | Use sort_order only (priority = 99) |
| Feature with neither | Use status/id fallback (sorts to bottom) |
| Feature in done/ folder | SKIP migration (historical data) |
| Feature already has rank | SKIP migration (already migrated) |
| Duplicate sort_order | Tiebreaker: priority → status → id |

### Migration Metrics

**Report includes:**
- Total scanned: 15 features
- Migrated: 14 features
- Skipped: 1 feature (already migrated)
- Errors: 0
- Time: 1.2s
- Breakdown by status/priority
- Sample conversions (before → after)

## Testing & QA

### Overview (from QA Strategist Agent ad44e71)

**Testing Scope:** 35+ test scenarios across 8 categories

**Coverage:**
- Migration correctness (ordering preservation, no data loss)
- UI functionality (drag-and-drop, sorting, filtering)
- New statuses (draft/rejected)
- Edge cases (rank collisions, missing data, boundary values)
- Regression prevention (existing workflows)
- Performance (no degradation)

**Risk Areas:** Migration data loss, rank calculation errors, drag-and-drop race conditions, fractional precision issues

### Acceptance Criteria (Given/When/Then)

#### Feature: Rank-based Ordering in Focus Tab

```gherkin
Scenario: Features sort by rank ascending
  Given I have features with ranks: 5.0, 1.0, 10.0
  When I open the Focus tab
  Then features appear in order: 1.0, 5.0, 10.0

Scenario: Rank takes precedence over status
  Given feature A (rank: 10.0, status: backlog)
  And feature B (rank: 5.0, status: week)
  Then feature B appears before feature A
```

#### Feature: Drag-and-Drop Rank Updates

```gherkin
Scenario: Dragging between features inserts fractional rank
  Given feature A (rank: 10.0) and feature B (rank: 20.0)
  When I drag feature C between A and B
  Then feature C gets rank: 15.0 (midpoint)

Scenario: Dragging to top assigns rank below minimum
  Given feature A (rank: 5.0, lowest in group)
  When I drag feature B above A
  Then feature B gets rank: 2.5
```

#### Feature: Migration Preserves Ordering

```gherkin
Scenario: Migration converts priority + sort_order to rank
  Given features sorted by (sort_order, priority, id)
  When I run migration script
  Then features have sequential ranks preserving order
  And all features have rank field
  And no features have priority or sort_order fields
```

### E2E Test Scenarios

#### Test File: `e2e/kanban-rank-ordering.spec.ts`

1. **Features sort by rank in Focus tab**
   - Setup: Create 3 features with ranks 5.0, 1.0, 10.0
   - Action: Navigate to Focus tab
   - Expected: Order is 1.0, 5.0, 10.0

2. **Drag-and-drop updates rank**
   - Setup: Features A (10.0), B (20.0)
   - Action: Drag C between A and B
   - Expected: C gets rank ~15.0

3. **Drag between columns updates status and rank**
   - Setup: Feature A (status: week, rank: 10.0)
   - Action: Drag to "today" column
   - Expected: status: today, rank adjusted

#### Test File: `e2e/kanban-migration-validation.spec.ts`

1. **Pre-migration feature count matches post-migration**
2. **Migration preserves feature ordering**
3. **Migration removes priority/sort_order fields**
4. **Migration handles missing fields gracefully**

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| **Null rank** | Sort to bottom, use (status, id) fallback |
| **Zero rank** | Valid, sorts first |
| **Negative rank** | INVALID — validation rejects |
| **Duplicate rank** | Both valid, tiebreaker: (status, id) |
| **Very large rank (999999)** | Valid, sorts last, no UI overflow |
| **Non-numeric rank** | INVALID — validation rejects |
| **Empty rank field** | Treated as null, fallback sorting |
| **Draft in wrong folder** | Valid (status takes precedence) |
| **Drag to same position** | No-op, rank unchanged |
| **Rapid successive drags** | Second waits for first (no race) |

### Regression Tests

**Ensure existing functionality works:**

- [ ] Drag between columns updates status
- [ ] Feature creation via UI works
- [ ] Done/rejected folder auto-move works
- [ ] Milestone grouping in Focus tab works
- [ ] Card dialog opens on click

### Validation Strategy

**Pre-migration checks:**
- Count features
- Capture ordering (save to JSON)
- Compute content checksum

**Post-migration checks:**
- Feature count unchanged
- All features have rank field
- No priority/sort_order fields remain
- Ordering preserved (compare JSON arrays)
- Rank values valid (positive numbers)

**UI validation (manual):**
- Focus tab renders without errors
- Feature ordering looks correct
- Drag-and-drop works
- Rank updates persist after refresh
- No layout regressions

### Performance Testing

**Metrics to track:**

1. **Focus tab load time** (100+ features)
   - Baseline: < 2 seconds
   - Expected: No degradation (< 5% difference)

2. **Drag-and-drop latency**
   - Baseline: < 200ms from drag-end to rank update
   - Expected: Same or better

3. **Sorting algorithm performance**
   - Old: Sort by (sort_order, priority, status, id) — 4-key sort
   - New: Sort by (rank, status, id) — 3-key sort
   - Expected: New system faster (fewer comparisons)

## Acceptance Criteria

### Phase 1: Schema Changes
- [ ] `rank?: number` field added to Feature type
- [ ] `status: draft` and `status: rejected` added to Status type
- [ ] Backend parses rank from frontmatter
- [ ] Backend validates rank (positive number)
- [ ] PATCH endpoint accepts rank updates
- [ ] Cache tracks rank changes

### Phase 2: UI Dual-Mode
- [ ] Focus tab sorts by `rank ?? sort_order` (prefers rank, falls back)
- [ ] Board view sorts by `rank ?? sort_order` within columns
- [ ] Drag-and-drop updates rank field (not sort_order)
- [ ] Rank badge displays if rank present
- [ ] Card dialog allows editing rank field
- [ ] Features without rank still work (fallback to old system)

### Phase 3: Migration
- [ ] Migration script runs without errors
- [ ] Feature count unchanged (15 active features)
- [ ] All features have rank field
- [ ] No features have priority or sort_order fields
- [ ] Feature ordering preserved (compare IDs before/after)
- [ ] Content unchanged (only frontmatter modified)
- [ ] Git commit atomic (all changes in one commit)

### Phase 4: Cleanup
- [ ] Priority type removed from types.ts
- [ ] Priority/sort_order fields removed from Feature interface
- [ ] PRIORITY_ORDER constant removed from FocusPage
- [ ] Priority badges removed from UI
- [ ] Sorting logic simplified (rank only, no fallbacks)
- [ ] No TypeScript compilation errors
- [ ] Kanban works correctly with rank-only system

### Phase 5: Status Expansion
- [ ] `status: draft` moves file to features/drafts/ (optional)
- [ ] `status: rejected` moves file to features/archive/
- [ ] Folder moves are bidirectional (can move back)

### End-to-End
- [ ] Create new feature → has rank field
- [ ] Drag-and-drop feature → rank updates
- [ ] Refresh page → rank persists
- [ ] Filter by status → works correctly
- [ ] Focus tab shows clear ordering (no ties)
- [ ] Board view shows clear ordering (no ties)

## Implementation Notes

**Files likely to change:**
- `tools/kanban/src/lib/types.ts` - Type definitions
- `tools/kanban/server/api.ts` - Validation, parsing
- `tools/kanban/src/components/` - UI components (Card, FocusPage, App)
- `.claude/commands/slava/build/create-feature.md` - Feature creation workflow
- `CLAUDE.md` - Documentation
- `docs/technical/feature-specs.md` - Documentation

**Migration approach:**
- Create migration script
- Test on copy of features/
- Run on actual features/
- Commit all changes at once

## Open Questions

### Resolved

✅ **Q: How should rank be displayed in UI?**
- **Answer:** Badge display (similar to priority badges), show `#1`, `#15`, `#142`
- **Details:** Display `Math.floor(rank)` to hide fractional precision, blue badge color

✅ **Q: What happens if two features have same rank?**
- **Answer:** Both valid, tiebreaker uses (status, id)
- **Details:** Sorting is deterministic, duplicates don't break functionality

✅ **Q: Should agents be able to auto-commit rank changes?**
- **Answer:** Future feature (not part of P141)
- **Details:** Current scope is schema change only, agent workflows come later

✅ **Q: Do we need "compact ranks" operation?**
- **Answer:** Not initially, add later if needed
- **Details:** Use `toFixed(2)` when saving, manual operation if precision grows

✅ **Q: How does Board vs Focus view differ?**
- **Answer:** Both use rank for sorting (global rank, not per-status)
- **Details:** Column gaps are acceptable (user understands cross-status movement)

### Unresolved (Need User Decision)

_All questions resolved! Ready for implementation._

### Resolved Decisions

✅ **Q1: Migrate done/ and archive/ folders?**
- **Decision:** Skip (Option A) — Migrate only active features (~15 files)
- **Rationale:** Historical data not displayed in kanban, no benefit, keeps scope small

✅ **Q2: Rank number starting point?**
- **Decision:** Sequential 1.0, 2.0, 3.0 (Option A)
- **Rationale:** Simplest, fractional insertion handles future needs

✅ **Q3: Rank precision limit?**
- **Decision:** Truncate to 3 decimals (Option B)
- **Rationale:** Prevents precision creep, supports 1000+ insertions

✅ **Q4: API validation for rank field?**
- **Decision:** Allow zero, allow duplicates, truncate on save
- **Rationale:** Most permissive, graceful handling, tiebreaker for duplicates

✅ **Q5: Status expansion folder behavior?**
- **Decision:** Auto-move (Option A) — draft → drafts/, rejected → archive/
- **Rationale:** Consistent with current done/rejected behavior

## Next Steps

### Before Implementation

1. **Review this spec** — Ensure all sections make sense
2. **Resolve open questions** (5 unresolved questions above)
3. **Create migration scripts** — Implement scripts from agent outputs
4. **Create validation scripts** — Implement pre/post migration checks

### Implementation Sequence

1. **Phase 1: Schema** (1-2 hours)
   - Update types.ts, api.ts
   - Test: Kanban accepts rank field

2. **Phase 2: UI Dual-Mode** (2-3 hours)
   - Update App.tsx, FocusPage.tsx, Card.tsx, CardDialog.tsx
   - Test: Drag-and-drop works with rank

3. **Phase 3: Migration** (1 hour)
   - Run migration script
   - Verify: Ordering preserved, no data loss

4. **Phase 4: Cleanup** (1 hour)
   - Remove old fields from types, API, UI
   - Test: Kanban works with rank-only

5. **Phase 5: Status Expansion** (1 hour)
   - Add draft/rejected folder auto-move
   - Test: Status changes move files

6. **Documentation** (1 hour)
   - Update CLAUDE.md, feature-specs.md
   - Update create-feature skill

**Total estimated effort:** 8-10 hours

### Post-Implementation

- [ ] Run `/kdd` to capture knowledge
- [ ] Add pre-commit hook (reject priority/sort_order fields)
- [ ] Monitor kanban for issues (24-48 hours)
- [ ] Close this feature (move to features/done/)

## References

**Agent outputs:**
- System analysis: Agent a16afcb (Explore)
- Requirements optimization: Agent a512e70 (general-purpose)
- Technical architecture: Agent ae55106 (Plan)
- QA strategy: Agent ad44e71 (general-purpose)
- Migration plan: Agent acd73ea (general-purpose)

**Design artifacts:**
- Initial problem statement: This conversation
- Business requirements: This conversation
- User decisions: This conversation (field name, fractional, mechanical migration)
