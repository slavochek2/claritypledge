---
status: rejected
type: task
rank: 148.0
workstream: foundation
tags: [testing, validation, documentation, sustainability, kanban]
prepped_date: null
rejection_reason: "Duplicate of P153 (formerly P147) - merged into comprehensive kanban system test coverage spec. All technical analysis, architecture decisions, and implementation approach preserved in P153."
reviews:
  ux: null
  architect: null
  alignment: null
---

# P148: Kanban Sustainability - Prevent Documentation Drift

## Problem Statement

### Current State

The kanban visibility system has **two separate implementations** of the same logic:

1. **Runtime scanner** (`tools/kanban/server/api.ts`) - Determines which features appear in kanban UI
2. **Validation script** (`scripts/validate-features.cjs`) - Pre-commit checks for frontmatter correctness

**The problem:** These implementations use **different logic** and **neither has tests**. When scanner logic changes (e.g., adding new folder exclusions), the validation script doesn't get updated, and documentation (`docs/technical/feature-specs.md`) drifts from actual code behavior.

**Recent incident (P137):** Spent hours debugging why a feature appeared in kanban unexpectedly. Root cause: scanner excluded dated folders (`4_27_jan26`), but validation script didn't. Documentation was outdated. No tests caught the drift.

### Pain Points

**For developers maintaining kanban:**
- Refactoring scanner logic is risky - no tests to verify changes work
- Debugging visibility issues takes hours (read code, trace logic, test manually)
- Documentation drift goes undetected until user reports a bug

**For agents working with features:**
- `/prep-spec` and other agents rely on validation script to check frontmatter
- When validation logic differs from runtime, agents get false negatives/positives
- Agents waste time debugging "feature not showing" when frontmatter is valid

### Who's Affected

- **Developers** refactoring kanban code (future you in 3 months)
- **Agents** creating/validating feature specs (`/prep-spec`, `/create-prd`, `/kdd`)
- **Users** encountering unexpected kanban behavior (features appearing/disappearing)

### Sustainability Score

**Current: 4/10** (SRE audit finding)
- No automated tests for scanner logic
- Validation script duplicates logic with drift
- Documentation requires manual sync with code
- High maintenance burden, frequent bugs

**Target: 8/10**
- Scanner logic has comprehensive tests
- Validation uses same logic as scanner (single source of truth)
- Documentation auto-checked against code (CI catches drift)
- Future refactors are safe and fast

---

## Intention (Why This Matters)

### Strategic Importance

**Sustainability is a multiplier:**
- Well-tested infrastructure = faster feature development
- Unified validation = fewer agent debugging cycles
- Auto-synced docs = onboarding new developers/agents is fast

**This is foundation work** that pays dividends every time we touch kanban code.

### Why Now

**Just paid the cost of drift:**
- P137 debugging took hours (could have been 5 minutes with tests)
- SRE audit flagged sustainability as critical risk
- Kanban is core infrastructure - used by all agents and developers

**If we refactor again without tests, we'll hit the same bug.**

### Impact if Not Solved

**Next refactor breaks visibility again:**
- Add new feature type? Might not show in kanban
- Change folder structure? Validation script out of sync
- Update frontmatter spec? Documentation drift

**Maintenance burden compounds:**
- Every kanban change requires manual testing across 3 systems
- Documentation updates are manual, error-prone
- Future developers/agents waste time debugging preventable issues

**Agent workflows degrade:**
- `/prep-spec` validation gives incorrect results
- Agents can't trust validation script output
- More manual intervention required

---

## Business Requirements

### Must-Haves

1. **Scanner logic has automated tests**
   - Test folder exclusion rules (dated folders, `research/`, `uat/`)
   - Test frontmatter parsing (status, rank, type, tags)
   - Test file path filtering (`.md` files with `p\d+` pattern)
   - Test edge cases (missing frontmatter, invalid values, special characters)

2. **Validation script uses same logic as scanner**
   - Extract shared logic into reusable module
   - Validation script imports scanner logic (no duplication)
   - One change updates both runtime and validation

3. **Documentation auto-checked against code**
   - Pre-commit hook verifies docs match scanner behavior
   - CI fails if documentation drift detected
   - Auto-generate docs sections from code (folder exclusions, valid statuses)

### Success Conditions

**Tests prevent breakage:**
- Add new folder exclusion → tests verify runtime and validation match
- Change frontmatter parsing → tests catch regressions
- Refactor scanner → tests confirm no behavior change

**Validation stays in sync:**
- Developer updates scanner → validation automatically uses new logic
- No manual "remember to update validation script" step

**Documentation stays accurate:**
- Pre-commit blocks commits with outdated docs
- Valid status values auto-generated from code constants
- Folder exclusion rules listed in docs match code

### Constraints

**Can't change kanban UI:**
- This is backend/validation only
- No changes to React components or user-facing behavior

**Must work with existing file structure:**
- Features live in `features/`, `features/done/`, `features/drafts/`, etc.
- Can't require reorganizing existing files
- Must handle historical features without breaking

**No new dependencies if possible:**
- Prefer Node.js built-ins and existing test framework (Vitest)
- Don't add heavyweight testing libraries

---

## User Stories

### As a developer maintaining kanban

**Story 1: Confident refactoring**
- **As a** developer refactoring scanner logic
- **I want** automated tests that verify behavior
- **So that** I can ship changes without fear of breaking visibility

**Story 2: Single source of truth**
- **As a** developer updating folder exclusion rules
- **I want** validation to automatically use the same logic
- **So that** I don't have to manually sync two codebases

**Story 3: Docs stay current**
- **As a** developer documenting kanban behavior
- **I want** pre-commit to catch outdated documentation
- **So that** docs always match actual code behavior

### As an agent maintaining feature specs

**Story 4: Reliable validation**
- **As an** agent running `/prep-spec` on a feature
- **I want** validation to use the same logic as runtime scanner
- **So that** I don't get false positives/negatives

**Story 5: Debugging visibility issues**
- **As an** agent investigating "feature not showing in kanban"
- **I want** tests that demonstrate expected behavior
- **So that** I can quickly identify root cause

---

## Jobs to Be Done

**Job 1: When refactoring scanner logic**
- **Motivation:** Need to add new folder exclusion rule
- **Goal:** Confidence that change won't break existing features
- **Outcome:** Run tests, see green, ship safely

**Job 2: When validating feature frontmatter**
- **Motivation:** Agent needs to check if feature is valid before building
- **Goal:** Get same result as runtime scanner
- **Outcome:** Validation script uses scanner logic, results match

**Job 3: When documenting kanban behavior**
- **Motivation:** New developer needs to understand visibility rules
- **Goal:** Read docs that accurately reflect code
- **Outcome:** Pre-commit prevents docs from drifting

**Job 4: When debugging visibility issues**
- **Motivation:** User reports "feature disappeared from kanban"
- **Goal:** Quickly identify if it's frontmatter issue, folder issue, or scanner bug
- **Outcome:** Run tests, check validation, diagnose in minutes (not hours)

---

## Outcomes (Success Metrics)

### Quantitative

**Sustainability score:**
- **Before:** 4/10 (SRE audit)
- **After:** 8/10 (tested, unified, auto-synced)

**Time to debug visibility issues:**
- **Before:** 1-3 hours (read code, trace logic, test manually)
- **After:** 5-15 minutes (run tests, check validation output)

**Documentation drift incidents:**
- **Before:** Multiple per month (docs lag code changes)
- **After:** Zero (pre-commit catches drift)

### Qualitative

**Developer confidence:**
- Can refactor scanner without fear
- Documentation is trusted, not outdated

**Agent reliability:**
- `/prep-spec` validation matches runtime
- Agents don't waste time on false positives

**Maintenance burden:**
- Future kanban changes are fast and safe
- Onboarding new developers is easier (docs are accurate)

---

## Acceptance Criteria

**Scanner tests exist:**
- [ ] Tests verify folder exclusion rules (dated folders, `research/`, `uat/`)
- [ ] Tests verify frontmatter parsing (all required fields)
- [ ] Tests verify file filtering (`.md` files, `p\d+` pattern)
- [ ] Tests cover edge cases (missing frontmatter, invalid values)
- [ ] Test suite runs in CI (blocks merges if failing)

**Validation logic unified:**
- [ ] Validation script uses scanner logic (no duplication)
- [ ] Single change updates both runtime and pre-commit validation
- [ ] Validation output matches runtime scanner behavior

**Documentation auto-checked:**
- [ ] Pre-commit hook verifies docs match code
- [ ] Valid status values auto-generated from code constants
- [ ] Folder exclusion rules listed in docs match scanner logic
- [ ] CI fails if documentation drift detected

**Sustainability improved:**
- [ ] SRE audit score improves from 4/10 to 8/10
- [ ] Future refactors don't break visibility (tests catch regressions)
- [ ] Time to debug visibility issues drops from hours to minutes

---

## Next Steps

**This is a technical task (no UX design needed).**

Run `/architect features/p148_kanban_sustainability.md` next to:
1. Design test architecture (where tests live, what framework to use)
2. Plan extraction of shared logic (module structure, exports)
3. Design pre-commit doc consistency check (how to detect drift)
4. Create implementation plan (order of work, rollout strategy)
---

## Technical Analysis

### Current Code State

**Scanner Implementation (`tools/kanban/server/api.ts`):**
- **Location:** `scanDir()` function (lines 170-193)
- **Folder exclusion logic:**
  ```typescript
  const skipFolders = ['research', 'uat']
  const isDateArchive = /^\d+_\d+_\w+\d+$/.test(entry.name)
  if (!skipFolders.includes(entry.name) && !isDateArchive) {
    await scanDir(fullPath)
  }
  ```
- **File filtering:** `entry.name.endsWith('.md') && /\bp\d+/.test(entry.name)`
- **Frontmatter parsing:** Uses `gray-matter` library in `parseFeatureFile()` (lines 93-164)
- **Enum validation:** Constants `VALID_STATUS`, `VALID_TYPE`, `VALID_SIZE` (lines 68-71)
- **Type definitions:** Imported from `../src/lib/types.ts`

**Validation Script (`scripts/validate-features.cjs`):**
- **Location:** Standalone Node.js script (CommonJS)
- **Folder exclusion logic:**
  ```javascript
  function isHistorical(filePath) {
    const datedFolderPattern = /\/\d+_\w+\d+\//;
    const inDoneDir = filePath.includes('/done/');
    const inArchive = filePath.includes('/archive/');
    return datedFolderPattern.test(filePath) || inDoneDir || inArchive;
  }
  ```
- **Exclusion:** `excludedDirs = ['research/', 'uat/']`
- **Frontmatter parsing:** Custom regex-based parser (lines 27-48) - **NOT using gray-matter**
- **Validation checks:** Required fields, date format, status/folder consistency

**Key Differences (Drift Points):**
1. **Different date patterns:**
   - Scanner: `/^\d+_\d+_\w+\d+$/` (anchored, full folder name)
   - Validation: `/\/\d+_\w+\d+\//` (path-based, slightly different pattern)
2. **Different frontmatter parsers:**
   - Scanner: `gray-matter` (robust YAML parser)
   - Validation: Custom regex (fragile, doesn't handle complex YAML)
3. **Different exclusion checks:**
   - Scanner: Checks folder name against skip list
   - Validation: `isHistorical()` function combines multiple conditions
4. **No shared constants:**
   - Scanner: TypeScript enums in `types.ts`
   - Validation: No enum validation (just checks field presence)

**Documentation (`docs/technical/feature-specs.md`):**
- Lines 128-140: Workstream values documented (C1, C2, R1, E1, X1, foundation)
- Lines 56-66: Status values documented (backlog, week, today, in-progress, blocked, done, draft, rejected)
- Lines 73-80: Type values documented (story, bug, task, comment)
- Lines 105: Size values documented (xs, s, m, l, xl)
- Lines 319-327: Folder structure documented (drafts/, done/, archive/, research/)
- **No explicit documentation of folder exclusion rules** (research/, uat/, dated folders)

**Test Coverage:**
- **Scanner:** ZERO tests
- **Validation script:** ZERO tests
- **No integration tests** verifying scanner and validation match

### Dependencies

**Testing Framework:**
- **Vitest** already configured in `vite.config.ts` (lines 155-169)
- Test setup file: `./src/tests/setup.tsx`
- Current exclude patterns already defined

**Build System:**
- Kanban runs in separate Node.js process (`npm run kanban`)
- Main app uses Vite with Vitest
- Kanban server is Express.js app (not bundled by Vite)

**Shared Dependencies:**
- `gray-matter` already used by scanner (not validation script)
- Scanner uses ES modules, validation uses CommonJS
- Both are Node.js runtime (no browser code)

**Pre-commit Infrastructure:**
- Script: `scripts/pre-commit-checks.sh`
- Already runs: TypeScript, lint, build, tests, secrets scan, bundle size, console.log check
- **No feature validation or doc consistency check** in pre-commit

### Key Findings

**Critical Issue #1: Divergent Parsers**
- Scanner uses `gray-matter` (industry-standard YAML parser)
- Validation uses custom regex (breaks on multi-line values, quotes, arrays)
- **Risk:** Validation script can't parse frontmatter that scanner handles correctly

**Critical Issue #2: Different Exclusion Logic**
- Scanner: `skipFolders + isDateArchive`
- Validation: `isHistorical` (combines dated folders, done/, archive/)
- **Result:** Validation script scans files scanner skips (e.g., `features/done/5_feb_26/`)

**Critical Issue #3: No Shared Constants**
- Scanner has TypeScript enums in `types.ts`
- Validation script has NO enum validation
- **Risk:** Invalid enum values pass validation but break scanner

**Critical Issue #4: Documentation Drift**
- Folder exclusions not documented in `feature-specs.md`
- No link between code constants and documentation
- **Impact:** Developers read outdated docs, make wrong assumptions

**Sustainability Bottleneck:**
- Every scanner change requires manual sync to validation script
- No tests to catch when sync fails
- No pre-commit enforcement of doc accuracy

---

## Architecture Decisions

### Decision 1: Extract Shared Logic to Reusable Module

**Chosen:** Create `tools/kanban/lib/scanner-rules.ts` with all exclusion and validation logic

**Rationale:**
- Single source of truth for folder exclusions, date patterns, enum values
- Both scanner and validation import same logic
- TypeScript provides type safety (validation script can use `.cjs` wrapper)

**Trade-off:**
- **Pro:** One change updates both runtime and pre-commit
- **Pro:** Can test shared logic in isolation
- **Pro:** Validation script becomes thin wrapper (less code to maintain)
- **Con:** Validation script needs to call TypeScript module (requires ts-node or compiled output)

**Alternative Rejected: Keep Separate, Add Tests**
- Still duplicates logic (drift risk remains)
- Tests would verify each independently but not consistency
- Doesn't solve root cause (two implementations)

**Implementation:**
```typescript
// tools/kanban/lib/scanner-rules.ts
export const SKIP_FOLDERS = ['research', 'uat'] as const
export const DATE_ARCHIVE_PATTERN = /^\d+_\d+_\w+\d+$/
export const VALID_STATUS = ['backlog', 'week', ...] as const
export const VALID_TYPE = ['bug', 'task', ...] as const

export function shouldSkipFolder(folderName: string): boolean {
  return SKIP_FOLDERS.includes(folderName) || DATE_ARCHIVE_PATTERN.test(folderName)
}

export function isFeatureFile(filename: string): boolean {
  return filename.endsWith('.md') && /\bp\d+/.test(filename)
}
```

---

### Decision 2: Test Strategy - Unit + Integration

**Chosen:** Unit tests for `scanner-rules.ts`, integration tests for `scanDir()`

**Rationale:**
- **Unit tests:** Fast, exhaustive coverage of edge cases (date patterns, special characters)
- **Integration tests:** Verify scanner + validation produce same results on real file tree

**Trade-off:**
- **Pro:** Unit tests catch logic bugs (e.g., regex doesn't match "1_nov25")
- **Pro:** Integration tests catch drift (scanner includes file validation rejects)
- **Pro:** Tests are fast (no filesystem needed for unit tests)
- **Con:** Requires test fixtures (mock file tree) for integration tests

**Alternative Rejected: Only Integration Tests**
- Slower (filesystem I/O)
- Harder to test edge cases (need to create many fixture files)
- Less granular failure messages

**Test Framework:** Vitest (already configured, same as main app)

**Test Location:**
- `tools/kanban/lib/__tests__/scanner-rules.test.ts` - Unit tests
- `tools/kanban/server/__tests__/api.test.ts` - Integration tests

---

### Decision 3: Validation Script Migration Strategy

**Chosen:** Replace validation script with thin wrapper calling scanner-rules

**Rationale:**
- Validation script becomes ~50 lines (vs current ~200)
- All logic in tested TypeScript module
- Pre-commit still runs fast (no bundling needed)

**Trade-off:**
- **Pro:** Validation uses exact same logic as runtime scanner
- **Pro:** Drastically reduces maintenance burden
- **Con:** Need to handle TypeScript import in Node.js script

**Solution for TypeScript Import:**
Option A: Use `tsx` (TypeScript executor) in validation script shebang:
```javascript
#!/usr/bin/env tsx
import { shouldSkipFolder, VALID_STATUS } from '../tools/kanban/lib/scanner-rules.ts'
```

Option B: Compile `scanner-rules.ts` to CommonJS, import compiled output:
```javascript
const { shouldSkipFolder, VALID_STATUS } = require('../tools/kanban/lib/scanner-rules.js')
```

**Chosen: Option A (`tsx`)** - Simpler, no build step needed for pre-commit

**Alternative Rejected: Rewrite Scanner in CommonJS**
- Kanban codebase is ES modules (would break existing imports)
- Moving backwards (TypeScript is better than JavaScript)
- Doesn't match project standards (main app is TypeScript)

---

### Decision 4: Doc Consistency Check - Parse Code Comments

**Chosen:** New script `scripts/validate-docs-match-code.sh` that parses TypeScript constants and compares to docs

**Rationale:**
- Documentation should be derived from code (not vice versa)
- Automated check prevents drift (CI catches outdated docs)
- Can extract constants from TypeScript AST or regex

**Trade-off:**
- **Pro:** Catches doc drift immediately (pre-commit)
- **Pro:** Developers know docs are trustworthy
- **Con:** Adds ~10 seconds to pre-commit (acceptable)

**Implementation Approach:**
1. Parse `scanner-rules.ts` to extract `SKIP_FOLDERS`, `VALID_STATUS`, etc.
2. Parse `feature-specs.md` to extract documented values
3. Compare and report differences

**Parsing Strategy:**
- **Simple regex** (no need for full TypeScript parser)
- Extract array values from TypeScript files
- Check against doc sections

**Alternative Rejected: Manual Doc Updates**
- Humans forget (proven by P137 incident)
- No enforcement mechanism
- Sustainability score stays at 4/10

---

### Decision 5: Pre-commit Integration Strategy

**Chosen:** Add doc consistency check to existing `scripts/pre-commit-checks.sh`

**Rationale:**
- Pre-commit already runs validation script (line 207-218 reference doc links)
- Natural place to add kanban-specific validation
- Blocks commits with outdated docs (prevents drift)

**Trade-off:**
- **Pro:** Enforces doc accuracy at commit time
- **Pro:** No new developer workflow (pre-commit already established)
- **Con:** Slightly slower pre-commit (~10s added)

**Integration Point:**
Add after line 218 (after doc link validation):
```bash
# 13. Kanban documentation consistency
echo ">>> Validating kanban docs match code..."
if [ -f "./scripts/validate-docs-match-code.sh" ]; then
    if ./scripts/validate-docs-match-code.sh; then
        echo -e "${GREEN}✓ Kanban docs match code${NC}"
    else
        echo -e "${RED}✗ Kanban docs drift detected${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${YELLOW}⚠ Kanban doc validator not found${NC}"
fi
echo ""
```

**Alternative Rejected: Separate Git Hook**
- Adds complexity (two hooks to maintain)
- Developers might skip one but not the other
- Pre-commit-checks.sh is already comprehensive

---

## Security Review

**Scope:** Internal development tooling only

### RLS Policies
**N/A** - Scanner operates on local filesystem, no database access

### Authentication
**N/A** - Developer-only tooling (no user authentication)

### Input Validation
- ✅ Scanner validates frontmatter format via `gray-matter`
- ✅ Validation script checks field types (status, type, rank)
- ⚠️ **Recommendation:** Add schema validation for frontmatter enums
  - Use Zod schema in `scanner-rules.ts` to validate frontmatter
  - Reject invalid enum values before scanner processes them

**Proposed Schema:**
```typescript
import { z } from 'zod'

export const FrontmatterSchema = z.object({
  status: z.enum(['backlog', 'week', 'today', 'in-progress', 'blocked', 'done', 'draft', 'rejected']),
  type: z.enum(['bug', 'task', 'story', 'comment']).optional(),
  rank: z.number().positive(),
  tags: z.array(z.string()).default([]),
  workstream: z.string().optional(),
})

export function validateFrontmatter(data: unknown): FrontmatterSchema {
  return FrontmatterSchema.parse(data) // Throws if invalid
}
```

### Data Protection
- ✅ No user data processed (features are product specs)
- ✅ Feature files are public (open source repo on GitHub)
- ✅ No secrets stored in frontmatter (checked by existing pre-commit scan)

### Path Traversal Protection
- ⚠️ Scanner recursively walks `features/` directory
- **Current safety:** Excludes `node_modules`, `dist`, `.git` (implicit via skipFolders)
- **Recommendation:** Add explicit path validation to prevent traversal outside features/

**Risk Assessment:** **LOW** (internal tooling, no external input, no user data)

---

## Implementation Approach

### Files to Create

1. **`tools/kanban/lib/scanner-rules.ts`** - Shared exclusion and validation logic
2. **`tools/kanban/lib/__tests__/scanner-rules.test.ts`** - Unit tests for scanner rules
3. **`tools/kanban/server/__tests__/api.test.ts`** - Integration tests for scanner
4. **`scripts/validate-docs-match-code.sh`** - Documentation consistency checker

### Files to Modify

1. **`tools/kanban/server/api.ts`** - Refactor scanner to use shared logic
2. **`scripts/validate-features.cjs`** - Unify with scanner logic
3. **`scripts/pre-commit-checks.sh`** - Add doc consistency check
4. **`package.json`** - Add test scripts (if needed)
5. **`docs/technical/feature-specs.md`** - Document folder exclusion rules

### Build Sequence

**Phase 1: Extract Shared Logic (Foundation)**
1. Create `tools/kanban/lib/scanner-rules.ts` with all constants and functions
2. Verify TypeScript compiles

**Phase 2: Refactor Scanner (Runtime)**
3. Update `tools/kanban/server/api.ts` to import from scanner-rules
4. Manual verification: Start kanban, verify UI shows same features
5. Smoke test: Drag card, verify no errors

**Phase 3: Add Tests (Safety Net)**
6. Create unit tests for scanner-rules
7. Run tests: `npm run test:kanban`
8. Acceptance: All tests pass

**Phase 4: Unify Validation Script (Pre-commit)**
9. Refactor validation script to use scanner-rules
10. Smoke test: Run validation on features/, verify same output

**Phase 5: Integration Tests (Confidence)**
11. Create integration tests for scanner
12. Run all tests

**Phase 6: Doc Consistency Check (Enforcement)**
13. Create doc consistency check script
14. Update pre-commit-checks.sh
15. Manual test: Break docs, verify pre-commit fails

**Phase 7: Documentation (Onboarding)**
16. Update feature-specs.md
17. Run pre-commit to verify all checks pass

**No database migrations needed**

### Testing Strategy

**Unit Tests:** Test folder exclusion, date patterns, file filtering, frontmatter validation
**Integration Tests:** Test full scanDir() flow, verify exclusions work end-to-end
**Pre-commit Tests:** Verify doc consistency check catches drift
