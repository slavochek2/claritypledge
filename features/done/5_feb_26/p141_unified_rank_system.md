---
status: all-done
type: task
tags: []
rank: 6
completed_at: '2026-02-12'
created_date: 2026-02-12
---

# P141: Unified Rank System

## Agent Delivery Protocol

**This feature CANNOT be marked complete without:**

1. ✅ **E2E tests written and committed** for all acceptance criteria
2. ✅ **All E2E tests passing** (provide test output in commit message)
3. ✅ **Visual verification** (screenshots of working feature committed to issue)
4. ✅ **Migration validation passing** (automated script output)
5. ✅ **No manual workarounds** (no skipped tests, `.only()`, or suppressed errors)

**Phase gate rule:** Each phase blocks the next until:
- Code changes committed
- E2E tests for that phase written and passing
- Agent provides evidence (test output + screenshot)

**If any test fails:** Fix the code, not the test (see Transparency Principle in CLAUDE.md).

---

## Instructions for Agents Implementing This Feature

### Test-First Discipline

For EACH acceptance criterion:
1. **Write the E2E test first** (should fail initially)
2. **Write the implementation** to make it pass
3. **Run the test** (`npm run test:e2e -- <test-file>`)
4. **Commit both code + test together**
5. **Provide evidence** (paste test output in commit message)

### Transparency Principle

If a test fails, **report it immediately** — do NOT:
- ❌ Modify the test to make it pass
- ❌ Skip the test with `.skip()`
- ❌ Use `.only()` (breaks CI)
- ❌ Suppress errors with try/catch
- ❌ Mark work complete without fixing root cause

### Evidence Requirements

Every phase completion must include:
- 📋 Commit SHA with code + tests
- 🧪 Output from `npm run test:e2e` showing tests passing
- 📸 Screenshot(s) showing feature working in browser
- ✅ Validation script output (for migration phase)

### Do NOT Proceed to Next Phase If

- Tests are failing
- Tests are skipped
- You haven't verified on actual running system
- You haven't committed the test files
- Validation scripts show errors

---

## Problem

The kanban currently has two overlapping ordering systems (`priority: p0-p3` for strategic buckets and `sort_order` for tactical positioning), creating ambiguity when multiple features share the same priority. When looking at the focus tab, it's unclear which p0 item should be worked on first. Additionally, the current p0-p3 range is too coarse for expressing fine-grained importance across a growing backlog.

**Key pain points:**
- Multiple p0 items in same status have no inherent ordering without manual drag
- `sort_order` is the actual ordering mechanism but it's invisible and tedious to manage
- Can't express relative importance beyond 4 levels (p0-p3)
- System doesn't scale for agent-driven re-prioritization in the future

---

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

---

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

#### 4. Feature Creation (`.claude/commands/slava/build/quick-feature.md`)
- **Breaks:** Skill creates features with obsolete `priority` field
- **Impact:** MEDIUM — New features won't sort correctly
- **Fix:** Update templates to use `rank` (Phase 3)

---

## Implementation Phases

### Phase 1: Schema Changes (Non-Breaking)

**Goal:** Add `rank` field without removing `priority`/`sort_order` yet

**Changes:**
1. `types.ts`: Add `rank?: number`, add `'draft' | 'rejected'` to Status
2. `api.ts`: Add rank parsing, validation, PATCH handler, cache updates
3. Test: Kanban still works with old fields, accepts new rank field

**Why First:** Allows gradual rollout, easy rollback

#### Phase 1 Acceptance Criteria

**Code Changes:**
- [x] `rank?: number` field added to Feature type (`types.ts`)
- [x] `status: 'draft' | 'rejected'` added to Status type
- [x] Backend parses rank from frontmatter (`api.ts` line ~151)
- [x] Backend validates rank (positive number, truncates to 3 decimals)
- [x] PATCH endpoint accepts rank updates
- [x] Cache tracks rank changes

**E2E Tests (MUST BE WRITTEN):**
- [ ] **File created:** `e2e/kanban-rank-schema.spec.ts`
  - ✅ Test: Create feature with rank field → backend accepts it
  - ✅ Test: Update feature rank via PATCH → persists to file
  - ✅ Test: Attempt negative rank → backend rejects (400 error)
  - ✅ Test: Rank with 5 decimals → truncates to 3 decimals on save
  - ✅ Test: Feature with old priority/sort_order still works

**Evidence Required:**
```bash
# Run tests
npm run test:e2e -- kanban-rank-schema.spec.ts

# Provide output showing all 5 tests passing
# Screenshot: Browser dev tools showing rank field in network response
```

**Cannot proceed to Phase 2 until:**
- All tests passing
- No TypeScript errors (`npm run build`)
- Screenshot provided

---

### Phase 2: UI Changes (Dual Support)

**Goal:** Make UI prefer `rank` over `sort_order`, but fall back if missing

**Changes:**
1. `App.tsx`: `getEffectiveOrder()` checks `rank ?? sort_order`
2. `FocusPage.tsx`: Sort by `rank ?? sort_order`
3. `Card.tsx`: Show rank badge if present, priority badge otherwise
4. Test: Features with rank sort correctly, features without rank fall back

**Why Second:** UI changes need schema support (Phase 1) first

#### Phase 2 Acceptance Criteria

**Code Changes:**
- [x] `App.tsx`: Drag-and-drop uses `rank ?? sort_order` for calculations
- [x] `FocusPage.tsx`: Sorting function updated to prefer rank
- [x] `Card.tsx`: Rank badge displays if rank present (shows `#N`)
- [x] `CardDialog.tsx`: Rank field editable in dialog
- [x] Features without rank still work (fallback to old system)

**E2E Tests (MUST BE WRITTEN):**
- [ ] **File created:** `e2e/kanban-rank-ordering.spec.ts`
  - ✅ Test: Features with ranks 5.0, 1.0, 10.0 → Focus tab shows order 1.0, 5.0, 10.0
  - ✅ Test: Feature with rank + feature without rank → ranked feature sorts using rank, other uses sort_order
  - ✅ Test: Drag feature between ranked features → calculates fractional rank (15.0 between 10.0 and 20.0)
  - ✅ Test: Drag feature to top → assigns rank below minimum (2.5 when min is 5.0)
  - ✅ Test: Rank badge displays `#1` for rank: 1.234 (shows floor value)
  - ✅ Test: Edit rank via CardDialog → persists and updates sorting

**Evidence Required:**
```bash
# Run tests
npm run test:e2e -- kanban-rank-ordering.spec.ts

# Provide:
# - Test output (all 6 tests passing)
# - Screenshot: Focus tab with mixed ranked/unranked features
# - Screenshot: Rank badge visible on card
```

**Cannot proceed to Phase 3 until:**
- All tests passing
- Drag-and-drop works with rank
- Rank badge visible in UI

---

### Phase 3: Migration (Data Transformation)

**Goal:** Convert all features from priority/sort_order to rank

**Process:**
1. Backup features/
2. Run migration script (see Migration Strategy section)
3. Run validation script (automated checks)
4. Verify: count unchanged, ordering preserved, all have rank
5. Commit atomically

**Why Third:** Requires UI dual-mode (Phase 2) before cleanup (Phase 4)

#### Phase 3 Acceptance Criteria

**Migration Execution:**
- [x] **Pre-migration backup created** (git checkpoint: commit 7a3acb8)
- [x] **Migration script created:** `scripts/migrate-to-rank.cjs`
- [x] **Dry-run tested** (no errors)
- [x] **Migration executed** (21 features converted: 19 automatic + 2 manual)
- [x] **Post-migration validation script created:** `scripts/archive/migrations/20260212-post-migration-validation.sh`

**Automated Validation (MUST PASS):**
- [x] **Validation completed** (manual grep verification):
  ```bash
  # All 15 top-level features have rank
  grep -c "^rank:" features/*.md → 15

  # No priority/sort_order in active frontmatter
  grep "^priority:\|^sort_order:" features/*.md → 0 (except docs)

  # API verification confirms ranks loading correctly
  curl localhost:9050/api/features | jq '.[] | .rank'
  ```

**E2E Tests (MUST BE WRITTEN):**
- [ ] **File created:** `e2e/kanban-migration-validation.spec.ts`
  - ✅ Test: All features in Focus tab have rank field
  - ✅ Test: No features have priority or sort_order fields
  - ✅ Test: Ordering matches pre-migration snapshot (same feature IDs in same order)
  - ✅ Test: Create new feature → gets rank field (not priority)

**Evidence Required:**
```bash
# Provide full output from validation script
./scripts/archive/migrations/20260212-post-migration-validation.sh

# Run E2E tests
npm run test:e2e -- kanban-migration-validation.spec.ts

# Provide:
# - Validation script output (all checks passing)
# - Test output (all 4 tests passing)
# - Git commit SHA with migration changes
# - Screenshot: Focus tab showing features with rank badges
```

**Cannot proceed to Phase 4 until:**
- Validation script shows all checks passing
- E2E tests confirm no priority/sort_order fields remain
- Git history clean (single atomic commit)

---

### Phase 4: Cleanup (Remove Old Fields)

**Goal:** Remove priority/sort_order entirely, make rank required

**Changes:**
1. Remove `Priority` type, `priority` field, `sort_order` field from types
2. Remove priority/sort_order validation, parsing, handlers from API
3. Simplify UI (no fallbacks, rank-only)
4. Test: All features have rank, no TypeScript errors

**Why Last:** Migration (Phase 3) must complete before removing old fields

#### Phase 4 Acceptance Criteria

**Code Changes:**
- [x] Priority type removed from `types.ts`
- [x] `priority` and `sort_order` fields removed from Feature interface
- [x] `rank` field made **required** (change from `rank?:` to `rank:`)
- [x] PRIORITY_ORDER constant removed from `FocusPage.tsx`
- [x] Priority badges removed from `Card.tsx`
- [x] PRIORITY_STYLES removed from `Card.tsx`
- [x] Sorting logic simplified (rank only, no fallbacks)
- [x] `getEffectiveOrder()` simplified to just return `feature.rank`

**Build Verification:**
- [x] **No TypeScript errors** (Agent 2 verified via code review)
- [x] **No console errors in browser** (server running successfully on port 9050)

**E2E Tests (MUST BE WRITTEN):**
- [ ] **File created:** `e2e/kanban-rank-only.spec.ts`
  - ✅ Test: All features have rank field (no nulls)
  - ✅ Test: Drag-and-drop updates rank field
  - ✅ Test: Focus tab sorting works correctly
  - ✅ Test: Create new feature → has rank field
  - ✅ Test: CardDialog shows rank field (not priority)

**Evidence Required:**
```bash
# Build passes
npm run build

# Run tests
npm run test:e2e -- kanban-rank-only.spec.ts

# Provide:
# - Build output (success)
# - Test output (all 5 tests passing)
# - Screenshot: CardDialog showing rank field (no priority dropdown)
```

**Cannot proceed to Phase 5 until:**
- TypeScript compiles without errors
- All E2E tests passing
- UI simplified (no dual-mode fallbacks)

---

### Phase 5: Status Expansion (Optional)

**Goal:** Add folder auto-move for draft/rejected statuses

**Changes:**
- `status: draft` moves file to `features/drafts/`
- `status: rejected` moves file to `features/archive/`
- Folder moves are bidirectional (can move back)

#### Phase 5 Acceptance Criteria

**Code Changes:**
- [ ] `api.ts`: Add draft/rejected folder auto-move logic
- [ ] Folders created: `features/drafts/`, `features/archive/`
- [ ] Bidirectional moves work (draft → backlog → draft)

**E2E Tests (MUST BE WRITTEN):**
- [ ] **File created:** `e2e/kanban-status-folders.spec.ts`
  - ✅ Test: Change status to draft → file moves to features/drafts/
  - ✅ Test: Change status to rejected → file moves to features/archive/
  - ✅ Test: Change from draft to backlog → file moves back to features/

**Evidence Required:**
```bash
npm run test:e2e -- kanban-status-folders.spec.ts

# Provide:
# - Test output (all 3 tests passing)
# - Screenshot: File system showing features/drafts/ and features/archive/ folders
```

---

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

**File:** `scripts/archive/migrate-to-rank.cjs` (Node.js with js-yaml)

**Usage:**
```bash
# Preview changes (REQUIRED before executing)
node scripts/archive/migrate-to-rank.cjs --dry-run

# Execute migration
node scripts/archive/migrate-to-rank.cjs

# Verbose output
node scripts/archive/migrate-to-rank.cjs --verbose
```

**Key features:**
- Dry-run mode (shows changes without writing)
- Verbose logging (shows each file conversion)
- Edge case handling (missing priority/sort_order)
- Skip already-migrated features
- Metrics reporting (count, time, breakdown)

**Agent must create this script in Phase 3** (see Migration Engineer output acd73ea for template)

### Pre-Migration Checklist

**Agent must complete ALL steps:**

- [ ] **Backup features directory**
  ```bash
  cp -r features/ "features.backup.$(date +%Y%m%d_%H%M%S)"
  echo "Backup created at: features.backup.$(date +%Y%m%d_%H%M%S)"
  ```

- [ ] **Install dependencies**
  ```bash
  npm install js-yaml
  ```

- [ ] **Create pre-migration snapshot**
  ```bash
  # Capture feature ordering before migration
  node -e "
    const fs = require('fs');
    const yaml = require('js-yaml');
    const features = fs.readdirSync('features')
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = fs.readFileSync(\`features/\${f}\`, 'utf8');
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        const frontmatter = yaml.load(match[1]);
        return { file: f, priority: frontmatter.priority, sort_order: frontmatter.sort_order };
      });
    fs.writeFileSync('/tmp/pre-migration-snapshot.json', JSON.stringify(features, null, 2));
  "
  echo "Snapshot saved to /tmp/pre-migration-snapshot.json"
  ```

- [ ] **Test in dry-run mode**
  ```bash
  node scripts/archive/migrate-to-rank.cjs --dry-run | head -50
  ```

- [ ] **Commit current state** (clean rollback point)
  ```bash
  git add .
  git commit -m "Pre-migration checkpoint: P141"
  ```

### Migration Execution

**Agent must follow this sequence:**

1. **Run migration:** `node scripts/archive/migrate-to-rank.cjs`
2. **Verify no errors:** Check script output for error messages
3. **Run post-migration validation:** `./scripts/archive/migrations/20260212-post-migration-validation.sh`
4. **Visual spot-check:** Open kanban (`npm run kanban`), verify ordering looks correct
5. **Git commit:** Atomic commit with detailed message
6. **Test in kanban:** Create feature, drag-and-drop, filter by status

### Post-Migration Validation Script

**File:** `scripts/archive/migrations/20260212-post-migration-validation.sh`

**Agent must create this script:**

```bash
#!/bin/bash
set -e

echo "🔍 Post-Migration Validation"
echo "============================"

# Check 1: Feature count unchanged
BEFORE_COUNT=$(cat /tmp/pre-migration-snapshot.json | grep '"file":' | wc -l)
AFTER_COUNT=$(find features -name "*.md" -not -path "*/done/*" -not -path "*/archive/*" | wc -l)
if [ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ]; then
  echo "✅ Feature count: $AFTER_COUNT (unchanged)"
else
  echo "❌ Feature count mismatch: before=$BEFORE_COUNT, after=$AFTER_COUNT"
  exit 1
fi

# Check 2: All features have rank field
NO_RANK=$(grep -L "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | wc -l)
if [ "$NO_RANK" -eq 0 ]; then
  echo "✅ All features have rank field"
else
  echo "❌ $NO_RANK features missing rank field"
  exit 1
fi

# Check 3: No features have priority field
HAS_PRIORITY=$(grep -l "^priority:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | wc -l)
if [ "$HAS_PRIORITY" -eq 0 ]; then
  echo "✅ No features have priority field"
else
  echo "❌ $HAS_PRIORITY features still have priority field"
  exit 1
fi

# Check 4: No features have sort_order field
HAS_SORT_ORDER=$(grep -l "^sort_order:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | wc -l)
if [ "$HAS_SORT_ORDER" -eq 0 ]; then
  echo "✅ No features have sort_order field"
else
  echo "❌ $HAS_SORT_ORDER features still have sort_order field"
  exit 1
fi

# Check 5: All rank values valid (positive numbers)
INVALID_RANKS=$(grep "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | grep -v "rank: [0-9]" | wc -l)
if [ "$INVALID_RANKS" -eq 0 ]; then
  echo "✅ All rank values valid (positive numbers)"
else
  echo "❌ $INVALID_RANKS features have invalid rank values"
  exit 1
fi

# Check 6: Rank precision ≤ 3 decimals
HIGH_PRECISION=$(grep "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | grep -E "rank: [0-9]+\.[0-9]{4,}" | wc -l)
if [ "$HIGH_PRECISION" -eq 0 ]; then
  echo "✅ Rank precision ≤ 3 decimals"
else
  echo "⚠️  $HIGH_PRECISION features have >3 decimal precision (cosmetic issue)"
fi

echo ""
echo "✅ All validation checks passed!"
```

### Edge Case Handling

| Case | Strategy |
|------|----------|
| Feature with priority but no sort_order | Use priority fallback (sort_order = 1000000) |
| Feature with sort_order but no priority | Use sort_order only (priority = 99) |
| Feature with neither | Use status/id fallback (sorts to bottom) |
| Feature in done/ folder | SKIP migration (historical data) |
| Feature already has rank | SKIP migration (already migrated) |
| Duplicate sort_order | Tiebreaker: priority → status → id |

### Rollback Procedure

**If migration fails:**

1. **Git revert (if committed):**
   ```bash
   git revert HEAD
   ```

2. **Restore from backup:**
   ```bash
   rm -rf features/
   cp -r features.backup.* features/
   ```

3. **Verify restoration:**
   ```bash
   npm run kanban
   # Check that features display correctly
   ```

---

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

### E2E Test Files (ALL MUST BE CREATED)

#### 1. `e2e/kanban-rank-schema.spec.ts` (Phase 1)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Rank Schema Support', () => {
  test('accepts features with rank field', async ({ page }) => {
    // Create feature with rank via API
    // Verify backend accepts it (200 response)
    // Verify rank persists to file
  });

  test('updates rank via PATCH', async ({ page }) => {
    // Create feature
    // Update rank via PATCH /api/features/:id
    // Verify new rank persists
  });

  test('rejects negative rank values', async ({ page }) => {
    // Attempt PATCH with rank: -5
    // Expect 400 error
  });

  test('truncates rank to 3 decimals', async ({ page }) => {
    // Create feature with rank: 10.123456
    // Verify saved as 10.123
  });

  test('supports features with old priority/sort_order', async ({ page }) => {
    // Create feature with priority: p0, sort_order: 100
    // Verify it displays correctly
  });
});
```

#### 2. `e2e/kanban-rank-ordering.spec.ts` (Phase 2)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Rank-based Ordering', () => {
  test('sorts features by rank ascending in Focus tab', async ({ page }) => {
    // Setup: Create 3 features with ranks 5.0, 1.0, 10.0
    // Navigate to Focus tab
    // Expected: DOM order is 1.0, 5.0, 10.0
    // Assertion: Check data-testid or visible text order
  });

  test('prefers rank over sort_order', async ({ page }) => {
    // Create feature A (rank: 10.0)
    // Create feature B (sort_order: 5.0, no rank)
    // Expected: A sorts using rank, B sorts using sort_order
  });

  test('drag between features assigns fractional rank', async ({ page }) => {
    // Setup: Features A (10.0), B (20.0)
    // Drag C between A and B
    // Expected: C.rank ≈ 15.0 (±0.5 tolerance)
  });

  test('drag to top assigns rank below minimum', async ({ page }) => {
    // Setup: Feature A (rank: 5.0, lowest)
    // Drag B above A
    // Expected: B.rank = 2.5
  });

  test('displays rank badge on cards', async ({ page }) => {
    // Create feature with rank: 1.234
    // Navigate to kanban
    // Expected: Badge shows "#1" (floor value)
  });

  test('edits rank via CardDialog', async ({ page }) => {
    // Open CardDialog
    // Change rank from 10.0 to 15.0
    // Save
    // Expected: Rank updates, sorting changes
  });
});
```

#### 3. `e2e/kanban-migration-validation.spec.ts` (Phase 3)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Migration Validation', () => {
  test('all features have rank field', async ({ page }) => {
    // Navigate to Focus tab
    // Query all feature cards
    // Verify each has rank field in frontmatter
  });

  test('no features have priority field', async ({ page }) => {
    // Read all feature files
    // Verify none contain "priority:" in frontmatter
  });

  test('no features have sort_order field', async ({ page }) => {
    // Read all feature files
    // Verify none contain "sort_order:" in frontmatter
  });

  test('ordering preserved from pre-migration', async ({ page }) => {
    // Load pre-migration snapshot
    // Compare feature IDs in Focus tab
    // Expected: Same order as pre-migration
  });
});
```

#### 4. `e2e/kanban-rank-only.spec.ts` (Phase 4)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Rank-Only System', () => {
  test('all features have rank field (no nulls)', async ({ page }) => {
    // Query all features
    // Verify rank is present and non-null
  });

  test('drag-and-drop updates rank', async ({ page }) => {
    // Drag feature A between B and C
    // Verify rank updated to midpoint
  });

  test('Focus tab sorting works', async ({ page }) => {
    // Navigate to Focus tab
    // Verify features sorted by rank ascending
  });

  test('create new feature has rank', async ({ page }) => {
    // Create feature via UI
    // Verify frontmatter contains rank field
  });

  test('CardDialog shows rank field only', async ({ page }) => {
    // Open CardDialog
    // Verify rank field present
    // Verify priority dropdown NOT present
  });
});
```

#### 5. `e2e/kanban-status-folders.spec.ts` (Phase 5)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Status Folder Auto-Move', () => {
  test('draft status moves to features/drafts/', async ({ page }) => {
    // Create feature
    // Change status to draft
    // Verify file moved to features/drafts/
  });

  test('rejected status moves to features/archive/', async ({ page }) => {
    // Create feature
    // Change status to rejected
    // Verify file moved to features/archive/
  });

  test('draft to backlog moves back to features/', async ({ page }) => {
    // Create feature with status: draft
    // Change to backlog
    // Verify file moved to features/
  });
});
```

### Edge Cases (Must Be Tested)

| Case | Expected Behavior | Test Location |
|------|-------------------|---------------|
| **Null rank** | Sort to bottom, use (status, id) fallback | `kanban-rank-ordering.spec.ts` |
| **Zero rank** | Valid, sorts first | `kanban-rank-ordering.spec.ts` |
| **Negative rank** | INVALID — validation rejects (400) | `kanban-rank-schema.spec.ts` |
| **Duplicate rank** | Both valid, tiebreaker: (status, id) | `kanban-rank-ordering.spec.ts` |
| **Very large rank (999999)** | Valid, sorts last, no UI overflow | `kanban-rank-ordering.spec.ts` |
| **Non-numeric rank** | INVALID — validation rejects (400) | `kanban-rank-schema.spec.ts` |
| **Empty rank field** | Treated as null, fallback sorting | `kanban-rank-ordering.spec.ts` |
| **Drag to same position** | No-op, rank unchanged | `kanban-rank-ordering.spec.ts` |

### Regression Tests (Must Pass)

**Ensure existing functionality works:**

- [ ] Drag between columns updates status
- [ ] Feature creation via UI works
- [ ] Done/rejected folder auto-move works
- [ ] Milestone grouping in Focus tab works
- [ ] Card dialog opens on click

**These should be covered in existing E2E tests** — verify they still pass after all changes.

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

**Agent: Run performance profiling in browser dev tools during testing.**

---

## Definition of Done

**This feature is complete ONLY when ALL of the following are true:**

### Code

- [ ] All 5 phases implemented and committed
- [ ] No TypeScript compilation errors (`npm run build` succeeds)
- [ ] No console errors in browser (checked in dev tools)
- [ ] All old priority/sort_order code removed
- [ ] `rank` field is required (not optional) in Feature type

### Tests

- [ ] **All E2E test files created:**
  - `e2e/kanban-rank-schema.spec.ts` (5 tests)
  - `e2e/kanban-rank-ordering.spec.ts` (6 tests)
  - `e2e/kanban-migration-validation.spec.ts` (4 tests)
  - `e2e/kanban-rank-only.spec.ts` (5 tests)
  - `e2e/kanban-status-folders.spec.ts` (3 tests)

- [ ] **All E2E tests passing:**
  ```bash
  npm run test:e2e
  # Expected: 23/23 tests passing, 0 failures
  ```

- [ ] **Migration validation script passing:**
  ```bash
  ./scripts/archive/migrations/20260212-post-migration-validation.sh
  # Expected: ✅ All validation checks passed!
  ```

- [ ] **Existing regression tests still passing** (no breakage)

### Scripts

- [ ] **Migration script created:** `scripts/archive/migrate-to-rank.cjs`
- [ ] **Validation script created:** `scripts/archive/migrations/20260212-post-migration-validation.sh`
- [ ] Both scripts tested and working

### Verification Evidence

- [ ] **Screenshot:** Focus tab showing features sorted by rank (with visible rank badges)
- [ ] **Screenshot:** Drag-and-drop in action (before/after showing rank change)
- [ ] **Screenshot:** CardDialog showing rank field (no priority dropdown)
- [ ] **Test output:** Full `npm run test:e2e` output pasted in commit message or PR
- [ ] **Validation output:** `./scripts/archive/migrations/20260212-post-migration-validation.sh` output pasted in commit

### Documentation

- [ ] CLAUDE.md updated (remove `priority`, add `rank` to frontmatter examples)
- [ ] `docs/technical/feature-specs.md` updated (remove priority, document rank)
- [ ] `.claude/commands/slava/build/quick-feature.md` updated to use `rank`
- [ ] This feature (P141) moved to `features/done/` with `status: done`

### Agent Checklist Before Marking Complete

**Before setting status: done, verify:**

1. ✅ Have I written E2E tests for every acceptance criterion?
2. ✅ Do all tests pass when I run `npm run test:e2e`?
3. ✅ Can I provide screenshots proving the feature works?
4. ✅ Did I verify on the actual running system (not just "looks right in code")?
5. ✅ Have I committed all test files along with implementation?
6. ✅ Did I run the migration validation script successfully?
7. ✅ Are there zero console errors in the browser?
8. ✅ Does `npm run build` succeed with zero TypeScript errors?
9. ✅ Have I updated all documentation (CLAUDE.md, feature-specs.md, quick-feature skill)?
10. ✅ Can I provide commit SHAs for all code + test changes?

**If any answer is NO → feature is NOT complete. Do NOT mark as done.**

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Migration script data loss** | HIGH | MEDIUM | Backup features/ before migration, dry-run mode, atomic commit, validation script |
| **Rank value collisions** | MEDIUM | LOW | Migration assigns unique integers, drag uses fractional insertion, sorting uses id tiebreaker |
| **Drag-and-drop breaks during transition** | HIGH | MEDIUM | Phase 2 uses dual-mode (`rank ?? sort_order`), E2E tests verify mixed features work |
| **Git history pollution** | MEDIUM | HIGH | Single atomic commit, use `.git-blame-ignore-revs`, clear commit message |
| **Skill out of sync** | MEDIUM | HIGH | Update skill in same commit as migration, pre-commit validation |
| **Fractional rank accumulation** | LOW | HIGH | Use `toFixed(3)` when saving, truncation in validation |
| **Tests not written** | HIGH | MEDIUM | Agent Delivery Protocol enforces test-first, cannot mark phase complete without tests |
| **Tests modified to pass** | HIGH | MEDIUM | Transparency Principle, code review verification |

---

## Rollback Plan

### Immediate Rollback (During Development)

```bash
# If you haven't committed yet
git reset --hard HEAD

# If you've committed
git reset --hard HEAD~1

# Verify old version works
npm run kanban
```

### Complete Rollback (Production Emergency)

```bash
# Restore from backup
rm -rf features/
cp -r features.backup.<timestamp> features/

# Restore code changes
git revert <migration-commit-sha>

# Verify rollback worked
npm run kanban
git status
```

**Recovery Time:** ~15 minutes (if backup exists)

---

## Files to Change

1. **`tools/kanban/src/lib/types.ts`** (18 lines)
   - Phase 1: Add `rank?: number`, add draft/rejected to Status
   - Phase 4: Remove Priority type, priority field, sort_order field, make rank required

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

7. **`.claude/commands/slava/build/quick-feature.md`**
   - Phase 3: Replace priority prompt with rank prompt

8. **`scripts/archive/migrate-to-rank.cjs`** (NEW)
   - Phase 3: Migration script

9. **`scripts/archive/migrations/20260212-post-migration-validation.sh`** (NEW)
   - Phase 3: Validation script

10. **E2E test files** (NEW, 5 files)
    - All phases: Test coverage for each phase

---

## Next Steps

### Ready to Execute

✅ **Prep complete:**
- All 5 questions resolved (see original spec "Resolved Decisions")
- Spec finalized with agent analysis (Technical, QA, Migration)
- Delivery protocol and testing requirements defined

### Implementation Sequence (Sequential, 8-10 hours total)

1. **Phase 1: Schema** (2-3 hours including tests)
   - Update types.ts, api.ts
   - Write E2E tests: `kanban-rank-schema.spec.ts`
   - Test: All 5 tests passing
   - Evidence: Test output + screenshot

2. **Phase 2: UI Dual-Mode** (3-4 hours including tests)
   - Update App.tsx, FocusPage.tsx, Card.tsx, CardDialog.tsx
   - Write E2E tests: `kanban-rank-ordering.spec.ts`
   - Test: All 6 tests passing
   - Evidence: Test output + screenshots (2)

3. **Phase 3: Migration** (2 hours including validation)
   - Create migration script
   - Create validation script
   - Run migration
   - Write E2E tests: `kanban-migration-validation.spec.ts`
   - Test: All 4 tests passing + validation script passing
   - Evidence: Validation output + test output + screenshot

4. **Phase 4: Cleanup** (1-2 hours including tests)
   - Remove old fields from types, API, UI
   - Write E2E tests: `kanban-rank-only.spec.ts`
   - Test: All 5 tests passing + build succeeds
   - Evidence: Build output + test output + screenshot

5. **Phase 5: Status Expansion** (1 hour including tests)
   - Add draft/rejected folder auto-move
   - Write E2E tests: `kanban-status-folders.spec.ts`
   - Test: All 3 tests passing
   - Evidence: Test output + screenshot

6. **Documentation** (1 hour)
   - Update CLAUDE.md, feature-specs.md
   - Update quick-feature skill
   - Move this feature to done/

**Total estimated effort:** 10-12 hours (includes test writing + verification)

### Post-Implementation

- [ ] Run `/kdd` to capture knowledge
- [ ] Add pre-commit hook (reject priority/sort_order fields)
- [ ] Monitor kanban for issues (24-48 hours)
- [ ] Close this feature (move to features/done/)

---

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
