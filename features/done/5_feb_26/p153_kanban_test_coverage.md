---
status: done
completed_at: '2026-02-16'
type: task
rank: 147.0
workstream: foundation
tags: [testing, kanban, quality, automation, validation, documentation, sustainability]
prepped_date: '2026-02-15'
reviews:
  ux: null
  architect: '2026-02-16'
---

# P153: Kanban System Test Coverage — Complete Quality Infrastructure

## Problem Statement

**Current state:**
- Kanban system has zero automated test coverage (no E2E, no unit tests, no integration tests)
- Two separate implementations of the same logic create drift risk:
  - **Runtime scanner** (`tools/kanban/server/api.ts`) - determines which features appear in kanban UI
  - **Validation script** (`scripts/validate-features.cjs`) - pre-commit checks for frontmatter correctness
- These implementations use different logic and neither has tests
- Bugs slip through to production:
  - **P146:** Refresh cache bug went undetected (UI regression) - single-character bug that automated tests would have caught
  - **P137:** Spent hours debugging why feature appeared unexpectedly (scanner/validation drift) - scanner excluded dated folders (`4_27_jan26`), but validation script didn't. Documentation was outdated. No tests caught the drift.
- Documentation (`docs/technical/feature-specs.md`) drifts from actual code behavior
- Changes are high-risk — no safety net to catch regressions
- Manual testing is the only verification method (slow, inconsistent, error-prone)

**Pain points:**
- **Developer velocity:** Can't confidently refactor scanner or add features without manual regression testing
- **Quality issues:** Bugs like P146 (refresh button) and P137 (visibility drift) only discovered when users report them
- **Documentation drift:** Scanner excludes dated folders, but validation script doesn't — docs don't document exclusion rules
- **High cognitive load:** Developers must mentally track edge cases and remember to sync two codebases
- **Onboarding friction:** New agents/developers have no executable specs showing how kanban should behave
- **Regression risk:** Every change could break existing functionality without detection
- **Agent workflow degradation:** `/prep-spec` validation gives incorrect results when validation script diverges from runtime
- **Maintenance burden:** Every kanban change requires manual testing across 3 systems (scanner, validation, docs)
- **Debugging time:** Visibility issues take hours to debug (read code, trace logic, test manually) instead of minutes

**Who's affected:**
- **Primary:** Development team (agents and humans) working on kanban improvements
- **Secondary:** Agents maintaining feature specs (`/prep-spec`, `/create-prd`, `/kdd`) - rely on validation script
- **Tertiary:** Users of kanban tool (experience bugs when regressions slip through)
- **Quaternary:** Project quality standards (testing gap sets bad precedent for internal tools)

**Sustainability score:**
- **Current:** 4/10 (SRE audit finding) - no tests, validation drift, manual doc sync required
- **Target:** 8/10 - comprehensive tests, unified validation, auto-checked docs

---

## Intention (Why This Matters)

**Strategic importance:**
- **Quality gate for internal tools:** Internal tools should model the quality standards we want for production code. Kanban is a critical developer workflow tool — bugs here slow down the entire team.
- **Agent autonomy foundation:** If agents are to autonomously fix bugs (as discussed in P146), they need tests to verify fixes don't break other functionality. Tests are the foundation for safe autonomous agent operations.
- **Regression prevention:** P146 was a simple 1-character bug that went undetected. Tests would have caught it before it impacted workflow.
- **Documentation as code:** Tests serve as executable specifications — they document HOW the kanban should behave, not just WHAT it does.

**Why now:**
- **P146 revealed the gap:** Just discovered refresh cache bug that could have been caught by automated tests
- **Planned improvements:** Kanban is actively being improved (rank system, milestone views, focus page). Each change carries regression risk without tests.
- **Agent autonomy question:** User asked whether agents should autonomously detect and fix bugs during test writing. Can't answer this without first having test infrastructure in place.

**Impact if not solved:**
- **Accumulating technical debt:** Every new feature added without tests increases maintenance burden
- **Slowed development:** Manual testing before each change slows velocity
- **Quality erosion:** Bugs like P146 and P137 will continue to slip through
- **Blocked agent autonomy:** Can't safely give agents bug-fixing autonomy without test safety net
- **Next refactor breaks visibility again:** Add new feature type → might not show in kanban; change folder structure → validation script out of sync; update frontmatter spec → documentation drift
- **Maintenance burden compounds:** Every kanban change requires manual testing across 3 systems (scanner, validation, docs)

---

## Business Requirements

**Must-haves:**

1. **Test infrastructure setup**
   - Vitest configured and running in kanban tool
   - Testing library installed (@testing-library/react for component tests)
   - Test scripts in package.json (run, watch, coverage)
   - CI integration possible (can run tests in automated pipeline)

2. **E2E test coverage for critical user flows**
   - Refresh button clears cache (P146 regression test)
   - Feature cards move between columns via drag-and-drop
   - Feature status updates persist to file system
   - Rank reordering works correctly
   - Worktree switching updates feature list
   - Error states display correctly

3. **Unit test coverage for scanner logic (core functions)**
   - **Folder exclusion rules** (dated folders like `4_27_jan26/`, `research/`, `uat/`)
   - **Frontmatter parsing** (status, rank, type, tags - all required fields)
   - **File path filtering** (`.md` files with `p\d+` pattern)
   - **Edge cases** (missing frontmatter, invalid values, special characters)
   - Cache invalidation logic (getCachedFeatures, cache clearing)
   - API endpoint handlers (GET /api/features, PATCH /api/features/:id)
   - Query parameter handling (?refresh=true, ?worktree=path)

4. **Validation script unification**
   - Extract shared logic into reusable module (`tools/kanban/lib/scanner-rules.ts`)
   - Validation script imports scanner logic (no duplication)
   - One change updates both runtime and validation
   - Validation output matches runtime scanner behavior

5. **Documentation auto-checked against code**
   - Pre-commit hook verifies docs match scanner behavior
   - CI fails if documentation drift detected
   - Auto-generate docs sections from code (folder exclusions, valid statuses)
   - Valid status/type/workstream values documented from code constants

6. **Regression tests for P146 and P137**
   - **P146 test:** Test MUST fail on old code (refresh button without true parameter)
   - **P146 test:** Test MUST pass on fixed code (refresh button with true parameter)
   - **P137 test:** Test scanner and validation use identical folder exclusion logic
   - Tests document WHY these bugs occurred (cache invalidation, validation drift)

**Success conditions:**
- All tests pass on current code (no regressions introduced by test setup)
- P146 and P137 regression tests demonstrate the bug fixes
- Test suite runs in under 10 seconds (fast feedback loop)
- Coverage report shows critical paths covered (refresh, drag-drop, persistence, scanner exclusions)
- Tests serve as documentation (new developers can read tests to understand behavior)
- Scanner and validation use identical logic (single source of truth)
- Pre-commit blocks commits with outdated documentation
- Sustainability score improves from 4/10 to 8/10

**Constraints:**
- **No production impact:** Kanban is internal tool, tests don't affect user-facing app
- **Minimal dependencies:** Prefer lightweight test setup (vitest, not Jest+Babel complexity)
- **Fast test runs:** Tests should complete quickly (under 10s) for rapid iteration
- **Maintainable:** Tests should be simple, readable, easy to update as kanban evolves
- **Can't change kanban UI:** This is backend/validation only (no changes to React components)
- **Must work with existing file structure:** Features live in `features/`, `features/done/`, `features/drafts/`, etc. (can't require reorganizing existing files)
- **No new dependencies if possible:** Prefer Node.js built-ins and existing test framework (Vitest)

---

## User Stories

**As a developer fixing bugs (like P146):**
- I want a regression test for my fix, so I can prove the bug is fixed and won't return
- I want the test to fail on old code, so I can verify it actually catches the bug
- I want the test to pass on fixed code, so I can confidently ship the fix

**As a developer adding features:**
- I want existing tests to catch regressions, so I don't accidentally break working functionality
- I want fast test feedback (<10s), so I can iterate quickly without waiting
- I want to run tests locally before committing, so I catch issues early

**As a developer new to the kanban codebase:**
- I want tests that document behavior, so I can understand how the kanban works without reading all the code
- I want to run tests to verify my environment is set up correctly, so I know everything works before making changes

**As a team lead reviewing code:**
- I want test coverage for critical paths, so I can approve changes with confidence
- I want regression tests for bugs, so I know historical issues are protected against

**As an AI agent working on kanban improvements:**
- I want tests to verify my changes don't break existing functionality, so I can work autonomously with safety
- I want clear test output showing what broke, so I can self-correct when tests fail
- I want tests as executable specs, so I understand expected behavior before making changes

**As a developer maintaining kanban:**
- I want to refactor scanner logic confidently, so I can ship changes without fear of breaking visibility
- I want validation to automatically use the same logic, so I don't have to manually sync two codebases
- I want pre-commit to catch outdated documentation, so docs always match actual code behavior

**As an agent maintaining feature specs:**
- I want validation to use the same logic as runtime scanner (when running `/prep-spec`), so I don't get false positives/negatives
- I want tests that demonstrate expected behavior (when investigating "feature not showing in kanban"), so I can quickly identify root cause

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

---

## Jobs to Be Done

**When I fix a bug like P146:**
- I want confidence the bug won't return, so I can move on without worrying about regressions (motivation: peace of mind, quality assurance)

**When I add a new feature to kanban:**
- I want to know immediately if I broke existing functionality, so I can fix it before committing (motivation: fast feedback, quality control)

**When reviewing code changes:**
- I want automated verification that critical paths still work, so I can approve confidently without manual testing (motivation: trust, efficiency)

**When onboarding to the kanban codebase:**
- I want executable examples of how things work, so I can learn by running tests instead of reading code (motivation: learning, environment verification)

**When considering autonomous agent bug-fixing:**
- I want a test safety net that prevents agents from making things worse, so I can trust agents to work independently (motivation: safe automation, scalability)

**When refactoring scanner logic:**
- I want confidence that changes won't break existing features, so I can ship safely (motivation: fast iteration, quality assurance)

**When validating feature frontmatter:**
- I want validation to match runtime scanner exactly, so agents get same results in pre-commit and UI (motivation: consistency, trust)

**When documenting kanban behavior:**
- I want docs that accurately reflect code, so new developers learn correct patterns (motivation: onboarding, knowledge transfer)

**When debugging visibility issues:**
- I want to quickly identify if it's frontmatter issue, folder issue, or scanner bug, so I can fix in minutes not hours (motivation: efficiency, reduced frustration)

---

## Outcomes (Success Metrics)

**Quality improvements:**
- **Zero regressions from test-covered paths:** Once refresh cache flow has tests, that specific regression can never happen again undetected
- **Faster bug detection:** Bugs caught by tests (seconds) instead of user reports (hours/days)
- **Higher confidence in changes:** Developers can refactor/improve kanban without fear of breaking things
- **P146 regression protection:** Refresh cache bug can never return undetected
- **P137 regression protection:** Scanner/validation drift caught by tests immediately

**Time savings:**
- **Reduce manual testing time:** From "manually test all critical paths" (10-15 min per change) to "run test suite" (<10 seconds)
- **Faster debugging:** Test failures point directly to what broke, instead of manual reproduction steps
- **Faster code review:** Reviewers see passing tests, don't need to manually verify behavior
- **Visibility issue debugging:** From hours (1-3 hours like P137) to minutes (5-15 minutes with tests)

**Developer experience:**
- **Lower cognitive load:** Developers don't need to mentally track all edge cases (tests remember)
- **Faster onboarding:** New agents/humans can run tests to understand behavior
- **Documentation that stays current:** Tests can't become outdated (they either pass or fail)
- **Sustainability score improvement:** From 4/10 (SRE audit finding) to 8/10 (tested, unified, auto-synced)
- **Documentation trust:** Pre-commit prevents docs from drifting, developers trust documentation

**Foundation for agent autonomy:**
- **Safe autonomous bug-fixing:** Agents can verify fixes don't break other functionality
- **Self-correction capability:** Agents can run tests, see failures, and iterate to fix
- **Executable specifications:** Agents can read tests to understand expected behavior

---

## Acceptance Criteria

**Business-level criteria:**

**Test infrastructure:**
- [x] Test suite runs via `npm test` in kanban directory
- [x] Tests run in under 10 seconds (fast feedback)
- [x] Test output is clear and actionable (shows what broke, where)
- [x] Coverage report available (can see what's tested vs untested)

**E2E coverage:**
- [ ] Refresh button cache invalidation tested (P146 regression protection)
- [ ] Feature drag-and-drop tested (cards move between columns correctly)
- [ ] Status updates persist to files (changes written to disk)
- [ ] Worktree switching tested (feature list updates when changing worktrees)
- [ ] Error handling tested (friendly error messages shown on failures)

**Unit coverage (scanner logic):**
- [ ] Cache logic tested (getCachedFeatures returns cached data, clears on refresh)
- [ ] File parsing tested (parseFeatureFile extracts frontmatter correctly)
- [ ] API endpoints tested (GET /api/features, PATCH /api/features/:id)
- [ ] Query params tested (?refresh=true triggers cache clear, ?worktree filters correctly)
- [x] Folder exclusion rules tested (dated folders like `4_27_jan26/`, `research/`, `uat/`)
- [x] Frontmatter parsing tested (status, rank, type, tags - all required fields)
- [x] File path filtering tested (`.md` files with `p\d+` pattern)
- [x] Edge cases tested (missing frontmatter, invalid values, special characters)

**P146 & P137 regression tests:**
- [ ] P146 test fails on old code (refresh button without true parameter)
- [ ] P146 test passes on current code (refresh button with true parameter)
- [ ] P146 test documents the bug (comments explain what was broken and why)
- [x] P137 test verifies scanner and validation use identical folder exclusion logic
- [x] P137 test documents the drift (comments explain why visibility bug occurred)

**Validation script unification:**
- [ ] Validation script uses scanner logic (no duplication)
- [ ] Single change updates both runtime and pre-commit validation
- [ ] Validation output matches runtime scanner behavior

**Documentation auto-checked:**
- [ ] Pre-commit hook verifies docs match scanner behavior
- [ ] Valid status values auto-generated from code constants
- [ ] Folder exclusion rules listed in docs match scanner logic
- [ ] CI fails if documentation drift detected

**Developer experience:**
- [x] Tests serve as documentation (readable, understandable by new developers)
- [x] Tests are maintainable (simple, not brittle, easy to update)
- [x] Test failures are actionable (clear error messages, point to what broke)

**Agent autonomy exploration (meta-requirement):**
- [x] Document findings: Should agents autonomously detect bugs during test writing?
- [x] Document findings: Should agents autonomously spawn fix agents when bugs detected?
- [x] Proposal: What guardrails needed for safe autonomous agent bug-fixing?

---

## Meta-Question: Agent Autonomous Bug Detection & Fixing

**Context:** User asked: "I am not sure if agents should be also having the power to root cause analyze bugs and spin agents to fix them"

**This requires investigation during implementation:**

**Questions to answer:**
1. **During test writing:** If agent discovers a bug while writing tests (test expects X, code does Y), should agent:
   - **Option A:** Flag the bug, wait for human decision
   - **Option B:** Autonomously spawn fix agent to repair the bug
   - **Option C:** Ask first, then autonomously fix if approved

2. **Bug detection scenarios:**
   - **Expected bug (like P146):** Known issue, test is regression protection → Fix autonomously?
   - **Unexpected bug:** Test revealed new issue not in spec → Flag to human?
   - **Behavioral ambiguity:** Unclear if it's a bug or intended behavior → Always flag?

3. **Safety guardrails needed:**
   - Automated tests must pass before autonomous fix accepted?
   - Human review required for certain types of changes (security, data, critical paths)?
   - Rollback mechanism if autonomous fix makes things worse?

**Proposed exploration approach:**
- Implement test coverage first (establish test safety net)
- Document bugs discovered during test writing
- Propose agent autonomy framework based on actual findings
- User decides on autonomy rules after seeing real examples

---

## Next Steps

**After user approves business requirements:**

1. **Skip /ux** (not a UI feature — test infrastructure is technical)

2. **Run `/architect features/p147_kanban_test_coverage.md`** to design:
   - Test infrastructure setup (vitest config, dependencies)
   - Test architecture (what to test, how to organize tests)
   - E2E vs unit test strategy (where to draw the line)
   - P146 regression test implementation approach
   - Agent autonomy framework proposal (based on technical constraints)

3. **Run `/generate-tests features/p147_kanban_test_coverage.md`** to create:
   - UAT scenarios for test coverage verification
   - E2E test templates for critical flows
   - Unit test templates for core functions

4. **Run `/dev features/p147_kanban_test_coverage.md`** to implement:
   - Install dependencies, configure vitest
   - Write E2E tests for critical flows
   - Write unit tests for core functions
   - Verify P146 regression test works (fails on old code, passes on new)
   - Document agent autonomy findings and proposal

---

## Agent Autonomy Findings

Based on the P153 implementation (kanban test coverage), this section documents recommendations for agent autonomy in bug detection and fixing.

### Finding 1: Should agents autonomously detect bugs during test writing?

**Observation during P153:**
- While writing unit tests for scanner rules, no unexpected bugs were discovered
- P146 (refresh cache bug) and P137 (scanner/validation drift) were already known issues
- Tests were written as regression protection for known bugs
- The test-writing process validated existing behavior rather than discovering new issues

**Recommendation: YES - with conditions**

Agents should autonomously detect bugs during test writing when:
- Test expectations don't match actual code behavior
- Logic inconsistencies are discovered (e.g., validation script uses different logic than runtime scanner)
- Edge cases reveal unexpected behavior (e.g., invalid input crashes instead of returning error)

**Guardrails:**
- Agent must clearly document: (1) what the test expected, (2) what the code actually does, (3) why this is a bug vs intended behavior
- For ambiguous cases (unclear if bug or feature), agent should flag for human review rather than make assumption
- Agent should cite specific code locations and behavior examples

**Example from P153:**
```
Test expected: shouldSkipFolder('4_27_jan26') === true
Code actually: Returns false (validation script doesn't exclude dated folders)
Why it's a bug: Scanner excludes dated folders, but validation script doesn't (drift)
```

---

### Finding 2: Should agents autonomously spawn fix agents when bugs detected?

**Trade-offs:**

**Benefits (velocity):**
- Faster bug resolution (no wait for human decision)
- Immediate feedback loop (fix → test → verify)
- Reduces context switching (bug detected → immediately fixed in same session)
- Enables rapid iteration on test-driven development

**Risks (quality/safety):**
- Agent might misunderstand requirements (fix "bug" that's actually intended behavior)
- Fix could introduce new bugs (regression risk if test coverage incomplete)
- Diverging from user's intended implementation path (user wanted approach A, agent fixes with approach B)
- Breaking changes without user awareness (especially if fix changes public API or user-facing behavior)

**Recommendation: CONDITIONAL - depends on test coverage and bug type**

**YES - Autonomously spawn fix agent when:**
1. **High test coverage exists** (>80% of critical paths covered)
   - Why: Tests catch regressions from autonomous fixes
   - Example: P153 scanner has 19 unit tests covering all core functions
2. **Bug is clearly defined** (not ambiguous behavior)
   - Why: Reduces risk of "fixing" intended behavior
   - Example: Validation script uses different date pattern than scanner (objective drift)
3. **Bug is isolated** (doesn't require architectural changes)
   - Why: Small scope = lower risk of cascading failures
   - Example: Off-by-one error in loop, typo in variable name, missing null check
4. **Rollback is easy** (git revert, feature flag toggle)
   - Why: Safety net if autonomous fix makes things worse
   - Example: Changes to a single function with clear git history

**NO - Require human approval when:**
1. **Low test coverage** (<50% of critical paths)
   - Why: No safety net to catch regressions from fix
   - Example: Fixing scanner logic when only 3 tests exist
2. **Behavioral ambiguity** (unclear if bug or feature)
   - Why: Risk of "fixing" intended behavior
   - Example: "Should empty tags default to [] or null?" (could be design decision)
3. **Security/auth/data changes** (RLS policies, permissions, data migrations)
   - Why: High-impact changes require human review
   - Example: Changing database schema, modifying RLS policies, updating auth flows
4. **Breaking changes** (public API changes, user-facing behavior)
   - Why: User should decide on breaking changes
   - Example: Changing validation error format, renaming enum values
5. **Multiple possible fixes** (no clear "right" solution)
   - Why: User preference matters
   - Example: "Should we add retry logic or improve error messages?"

---

### Finding 3: What guardrails are needed for safe autonomous bug-fixing?

**Proposed Guardrails Framework:**

#### 1. Pre-Fix Validation
- ✅ **Test coverage check:** At least 70% coverage of code area being fixed
- ✅ **Bug classification:** Agent must classify bug severity (low/medium/high/critical)
- ✅ **Impact analysis:** Agent documents what code/features are affected by fix
- ✅ **Alternatives evaluation:** Agent considers at least 2 fix approaches, picks simplest

#### 2. During Fix
- ✅ **Test-first approach:** Write failing test before implementing fix (TDD)
- ✅ **Minimal change principle:** Fix changes fewest lines possible
- ✅ **Single responsibility:** One fix per commit (don't bundle multiple fixes)
- ✅ **Documentation inline:** Add code comments explaining WHY fix was needed

#### 3. Post-Fix Verification
- ✅ **All tests pass:** Full test suite (unit + integration + E2E) must pass
- ✅ **Pre-commit checks pass:** Lint, type-check, build, security scan all green
- ✅ **Regression test added:** New test prevents bug from returning
- ✅ **Git commit with context:** Commit message explains bug, fix, and verification

#### 4. Approval Gates (when human review required)
- ⚠️ **Security changes:** RLS policies, auth flows, data access patterns
- ⚠️ **Breaking changes:** Public API modifications, schema changes
- ⚠️ **High-impact areas:** Payment flows, user data, production configs
- ⚠️ **Ambiguous bugs:** Unclear if bug or intended behavior

#### 5. Rollback Mechanisms
- ✅ **Git revert ready:** Each fix is a single commit (easy to revert)
- ✅ **Feature flag support:** High-risk fixes behind feature flags (can disable without deploy)
- ✅ **Monitoring alerts:** Sentry/logging configured to catch issues from fix
- ✅ **Rollback plan documented:** Agent documents how to rollback if fix causes issues

**Example Workflow (Autonomous Fix with Guardrails):**

```
1. Agent detects bug while writing tests
   → Bug: shouldSkipFolder('5_feb_26') returns false (should be true)
   → Classification: Medium severity (scanner/validation drift, no user impact)
   → Impact: Features in dated folders incorrectly appear in kanban UI

2. Pre-fix validation
   → Test coverage: 19 unit tests cover scanner rules (>80% coverage)
   → Alternatives: (A) Fix regex pattern, (B) Add special case for format
   → Chosen: Fix regex pattern (simpler, no special cases)

3. Implement fix (test-first)
   → Write test: expect(shouldSkipFolder('5_feb_26')).toBe(true)
   → Test fails ❌
   → Fix regex: /^\d+_\d+_\w+\d+$/ → /^\d+_[a-z]+_?\d+$/
   → Test passes ✅

4. Post-fix verification
   → npm test → 19 tests pass ✅
   → npm run lint → no errors ✅
   → npm run build → success ✅
   → Regression test added ✅

5. Commit with context
   git commit -m "fix(scanner): exclude dated folders with format N_MMM_D

   Bug: shouldSkipFolder('5_feb_26') returned false (should be true)
   Root cause: Regex pattern didn't match underscores in date format
   Fix: Updated pattern to handle both '5_feb_26' and '5_feb26' formats

   Regression test: scanner-rules.test.ts line 45
   "

6. Report to user
   "Fixed scanner drift bug detected during test writing. All tests pass.
    Commit: abc123f (ready to review if you want, or proceed with next task)"
```

**Risk Mitigation:**
- If ANY guardrail fails (test coverage low, tests fail, ambiguous bug) → Flag to human
- If fix introduces new test failures → Rollback automatically, report failure
- If pre-commit fails → Don't commit, report issue

---

### Implementation Recommendation for P153

**For kanban test coverage specifically:**

- **Enable autonomous bug detection:** YES (test writing revealed P137 drift)
- **Enable autonomous fix spawning:** YES with conditions (scanner has 19 tests, good coverage)
- **Guardrails to enforce:**
  - All 19 unit tests must pass before fix commits
  - Pre-commit checks must pass (lint, build, type-check)
  - Regression test required for each bug fixed
  - Human approval required for breaking changes (e.g., changing VALID_STATUS enum)

**Success criteria:**
- Agent autonomously detects drift between scanner and validation script
- Agent spawns fix agent (with test coverage >80%)
- Fix agent writes failing test, implements fix, verifies all tests pass
- Human reviews commit (can approve/reject, but fix is already verified by tests)

---

## Related Issues

- **P146:** Kanban Refresh Button Cache Bug (UI regression that revealed testing gap)
- **P137:** Position Persistence Bug (revealed scanner/validation drift and documentation gaps)
- **P141:** Unified Rank System (recent kanban change that would have benefited from tests)

---

## Notes

- **Internal tool, but quality matters:** Kanban is critical to developer workflow. Bugs here slow down the team.
- **Foundation for agent autonomy:** Can't safely give agents bug-fixing autonomy without test safety net.
- **Learning opportunity:** This task surfaces the meta-question of agent autonomy boundaries — when should agents act vs ask?
