---
description: 'Generate comprehensive test strategy and runnable test files from a spec'
when_to_use: "After /architect, before /dev. When a spec needs comprehensive test strategy."
name: generate-tests
version: 1.0.0
---

# /generate-tests

Generate comprehensive test strategy: unit, integration, E2E, accessibility, smoke tests, and UAT scenarios.

**Announce at start:** "I'm using the /generate-tests skill to create a comprehensive test strategy from the spec."

---

## Usage

```
/generate-tests <path-to-spec>
```

**Examples:**
- `/generate-tests features/p142_csv_export.md`
- `/generate-tests features/p61_events_complete_tech_spec.md`

---

## What This Skill Does

**Intelligently generates test files across the test pyramid:**

1. **Analyzes spec** — Reads business + UX + technical requirements
2. **Determines test strategy** — What test types are needed (adaptive, not formulaic)
3. **Generates runnable tests:**
   - **Unit tests** (`src/tests/*.test.ts`) — Utilities, services, business logic
   - **Integration tests** (`e2e/integration/*.spec.ts`) — API + database interactions
   - **E2E tests** (`e2e/p{N}-*.spec.ts`) — User flows, happy paths, edge cases
   - **Accessibility tests** (`e2e/a11y/p{N}-*.spec.ts`) — Keyboard, screen reader support
   - **Smoke tests** (`e2e/p{N}-smoke.spec.ts`) — Fast regression detection
   - **UAT scenarios** (`features/uat/p{N}.md`) — Manual validation checklist
4. **Creates test helpers** (`e2e/helpers/test-*.ts`) — Data factories, utilities (when needed)
5. **Provides coverage report** — What's tested (and WHY), what's NOT tested (and WHY)

---

## What Makes This Different from `/generate-uat`?

| Aspect | `/generate-uat` (old) | `/generate-tests` (new) |
|--------|----------------------|-------------------------|
| **Test types** | UAT + E2E stubs + smoke | Unit + integration + E2E + a11y + smoke + UAT |
| **Intelligence** | Formulaic (always same structure) | Adaptive (analyzes spec, determines what's needed) |
| **Test files** | TODO stubs (filled by /dev) | Runnable tests + TODOs where appropriate |
| **Coverage rationale** | None | Clear explanation of what's tested/skipped and WHY |
| **Test helpers** | Uses existing helpers | Creates new helpers when needed |
| **Test pyramid** | Heavy E2E focus | Balanced pyramid (unit, integration, E2E) |

**Migration:** `/generate-uat` is now an alias to `/generate-tests` (backward compatible)

---

## When to Use

**In the sequential flow:**
```
/create-prd → /ux (if UI) → /architect → /ui (if UI) → /generate-tests → /spec-review → /decompose* → /dev
```

**Run this after:**
- ✅ Business requirements approved (`/create-prd` complete)
- ✅ UX design approved (`/ux` complete, if UI feature)
- ✅ Architecture approved (`/architect` complete)

**Before:**
- ❌ `/spec-review` (spec-review needs all layers present — run after this skill)
- ❌ `/dev` (implementation needs tests to drive development)

---

## Output

**Files generated** (adaptive based on feature type):

### 1. Unit Tests (if utilities/services added)
**File:** `src/tests/{name}.test.ts` or `src/app/data/{service}.test.ts`

**When generated:**
- ✅ New utility functions (validators, transformers, formatters)
- ✅ New service methods (CRUD, calculations)
- ✅ Complex business logic (algorithms, state machines)

**When skipped:**
- ❌ Simple getters/setters (no logic)
- ❌ React components (covered by E2E)
- ❌ One-line wrappers

**Example:**
```typescript
// src/tests/exportCSV.test.ts
describe('exportResponsesAsCSV', () => {
  it('transforms responses to CSV format', () => {
    // Runnable test with concrete assertions
  });

  it('handles empty array', () => {
    // Edge case
  });

  it('handles large datasets (100+ responses)', () => {
    // Performance edge case
  });
});
```

---

### 2. Integration Tests (if API/database changes)
**File:** `e2e/integration/p{N}-{layer}.spec.ts`

**When generated:**
- ✅ API endpoints (request → response)
- ✅ Database operations (CRUD + RLS validation)
- ✅ Service interactions (auth + profiles)
- ✅ **Two-party session flows** — when spec references `/live`, `clarity_sessions`, `session_code`, `joiner`, or `LiveMeeting`

**When skipped:**
- ❌ Simple database reads (covered by E2E)
- ❌ Mocked services (defeats purpose)

**Two-party test rule:** When the spec describes a two-party session flow, scaffold an E2E test using the two-party helpers. Read `.claude/rules/tests.md` (Two-Party Helpers section) and `docs/technical/e2e-testing-guide.md` (Two-Party Sessions section) for current fixtures, assertion patterns, and banned practices. The test MUST include: create session → partner join → trigger feature code path → assert state via `waitForUIUpdate()` (never `page.reload()`). See `e2e/live-content-picker.spec.ts` as reference.

**Example:**
```typescript
// e2e/integration/p142-csv-export-api.spec.ts
test('fetches responses from database and exports CSV', async () => {
  // Create test data in DB
  // Fetch + transform
  // Verify CSV output
});
```

---

### 3. E2E Tests (user flows)
**File:** `e2e/p{N}-{feature}.spec.ts`

**Always generated** for features with user-facing changes.

**Example:**
```typescript
// e2e/p142-csv-export.spec.ts
test('exports sifter responses as CSV', async ({ page }) => {
  // Happy path: user clicks export → CSV downloads
});

test('disables export when no responses', async ({ page }) => {
  // Edge case: empty state
});
```

---

### 4. Accessibility Tests (if UI changes)
**File:** `e2e/a11y/p{N}-accessibility.spec.ts`

**When generated:**
- ✅ New UI components (buttons, forms, modals)
- ✅ Complex interactions (keyboard, focus)
- ✅ Dynamic content (screen reader announcements)

**Example:**
```typescript
// e2e/a11y/p142-csv-export-accessibility.spec.ts
test('export button is keyboard accessible', async ({ page }) => {
  // Tab to button, Enter to activate
});

test('screen reader announces export status', async ({ page }) => {
  // Verify ARIA labels
});
```

---

### 5. Smoke Tests (fast regression)
**File:** `e2e/p{N}-smoke.spec.ts`

**Always generated** for features with pages/routes.

**Example:**
```typescript
// e2e/p142-smoke.spec.ts
test('results page loads without errors', async ({ page }) => {
  // Navigate to page
  // Verify no 404/500
  // Verify no console errors
  // Verify main heading present
});
```

---

### 6. UAT Scenarios (manual validation)
**File:** `features/uat/p{N}.md`

**Always generated** for all features.

**Format:** Given/When/Then scenarios with verification methods

**Example:**
```markdown
### UAT-1.1: Export button works
**Given:** Sifter has 5 responses
**When:** User clicks "Export CSV"
**Then:** CSV file downloads with correct data
**Verify:** Playwright MCP click + download verification
```

---

### 7. Test Helpers (if needed)
**File:** `e2e/helpers/test-{feature}.ts`

**When generated:**
- ✅ Multiple tests need same setup
- ✅ Complex data factories
- ✅ Reusable assertions

**Example:**
```typescript
// e2e/helpers/test-sifter.ts
export async function createTestSifter(
  creatorId: string,
  options: { withResponses?: number } = {}
): Promise<TestSifter> {
  // Create sifter + optional responses
}
```

---

### 8. Test Coverage Report
**Appended to spec:** `features/p{N}_{feature}.md`

**Contains:**
- What's tested (and WHY)
- What's NOT tested (and WHY)
- Test pyramid breakdown
- Files generated
- Run time estimates

**Example:**
```markdown
## Test Coverage Strategy

**What's Tested:**
- ✅ Core export logic (unit) — Complex transformation
- ✅ Data pipeline (integration) — DB fetch + export
- ✅ User flow (E2E) — Happy path + empty state

**What's NOT Tested:**
- ❌ Component internals — Covered by E2E
- ❌ Browser APIs — Real download in E2E

**Test Pyramid:**
     /\
    /  \   1 E2E
   /____\
  / 2 INT \
 /__________\
/ 3 UNIT    \

Total: 6 automated tests + 4 UAT scenarios
```

---

## Adaptive Behavior

**The skill analyzes the spec to determine what's needed:**

### Example 1: UI Feature (Dark Mode)
**Spec has:** Business + UX + Technical sections

**Generates:**
- ✅ Unit tests for `useTheme.ts` hook (state logic)
- ❌ No integration tests (no API/DB)
- ✅ E2E tests for toggle interaction
- ✅ Accessibility tests (keyboard + screen reader)
- ✅ Smoke test (page loads with toggle)
- ✅ UAT scenarios

**Rationale:** UI feature with state logic → unit + E2E + a11y

---

### Example 2: Backend Feature (API Endpoint)
**Spec has:** Business + Technical sections (no UX)

**Generates:**
- ✅ Unit tests for request validator
- ✅ Integration tests for API endpoint
- ❌ No E2E tests (no user-facing UI)
- ❌ No accessibility tests (no UI)
- ✅ Smoke test (endpoint responds 200)
- ✅ UAT scenarios

**Rationale:** Backend feature → unit + integration + smoke

---

### Example 3: Database Migration
**Spec has:** Business + Technical sections (migration script)

**Generates:**
- ❌ No unit tests (pure SQL)
- ✅ **Integration test (MANDATORY)** — schema existence + RLS check
- ❌ No E2E tests (no UI)
- ❌ No accessibility tests (no UI)
- ✅ Smoke test (migration runs without errors)
- ✅ UAT scenarios (verify data migrated correctly)

**Rationale:** Data migration → integration + smoke + UAT

**⚠️ P270 RULE — Integration test is MANDATORY for any feature adding a DB migration.**

The integration test MUST include a schema existence check using the **two-client pattern**:
1. `supabaseAdmin` — query `{table}.select('{column}')` to verify column exists (fails immediately if migration not applied)
2. User-scoped JWT client — write/read to verify RLS allows user access (service role bypasses RLS and would miss policy bugs)

**Template:** Copy `e2e/integration/migration-template.spec.ts` — rename to `e2e/integration/p{N}-{feature}-migration.spec.ts`

**Why this matters:** P160 shipped with 44 tests, all of which mocked or bypassed the DB. The `is_private` column was missing and no test caught it. A single integration test with `supabaseAdmin.from('clarity_sessions').select('is_private')` would have failed immediately.

---

## Quality Guarantees

**All generated tests:**
- ✅ Use existing test helpers (`createTestUser`, `setTestSession`, etc.)
- ✅ Follow cleanup order (delete points BEFORE users)
- ✅ Include edge cases (errors, loading, empty states)
- ✅ Have concrete assertions (not vague "verify it works")
- ✅ Are runnable immediately (filled in by `/dev`, but structure is complete)
- ✅ If spec has `## UI Contract`: every string literal in test assertions (button labels, toast text, placeholders, page titles) must be copied verbatim from the UI Contract table — not paraphrased

---

## Workflow

1. **You run:** `/generate-tests features/p142_csv_export.md`
2. **Agent analyzes:** Business + UX + Technical requirements
3. **Agent determines:** What test types are needed (unit + integration + E2E + a11y + smoke + UAT)
4. **Agent generates:** 7 test files + coverage report — **the 6 file types are independent after analysis; dispatch them as parallel subagents for large features**
5. **Agent appends:** Test strategy to spec. **Retirement step:** Remove `## Open Questions for /generate-tests` if present. Remove `## Next Steps` if all listed steps are completed (check delivery_stage)
6. **Agent updates frontmatter** — adds generated file paths to spec frontmatter using the Edit tool (insert before the closing `---`):
   - `uat_file: features/uat/p{N}.md` (always)
   - `test_files:` list of all generated automated test files (e2e, unit, integration, a11y, smoke)

   Format:
   ```yaml
   uat_file: features/uat/p272.md
   test_files:
     - e2e/p272-live-verification.spec.ts
     - e2e/p272-smoke.spec.ts
     - e2e/integration/p272-live-migration.spec.ts
     - e2e/a11y/p272-accessibility.spec.ts
   ```

   Omit any test type that was skipped (e.g., no unit tests generated → no unit test entry). Do not add `test_files:` if no automated tests were generated (UAT-only features).

7. **You proceed:** `/dev features/p142_csv_export.md`

---

## Integration with Sequential Flow

```
/architect → /ui (if UI) → /generate-tests → /spec-review → /decompose* → /dev
```

* /decompose optional — run AFTER /spec-review (not before). /decompose reads the
  `## Test Coverage Strategy` section written here to add `Tests:` lines to each task entry.

**Before `/generate-tests`:**
- `/create-prd` → Business requirements approved ✅
- `/ux` → UX design approved ✅ (if UI)
- `/architect` → Architecture approved ✅

**After `/generate-tests`:**
- `/spec-review` → Pre-dev audit (always run after `/generate-tests`, before `/decompose` or `/dev`)
- `/decompose` → (complex features only) reads Test Coverage Strategy to annotate tasks with test refs
- `/dev` → Reads tests, implements feature, fills in TODOs, runs tests, iterates until all pass

**Auto-chain.** After all test files are generated and the coverage report is appended to the spec, spawn `/spec-review` as Phase 2 on the same spec file — do not return to the user between phases. The combined output is: test files created + spec-review findings. Return to the user only after both phases complete.

---

## Common Questions

### Q: Do I need to review the generated tests?
**A:** No gate required. The coverage report is appended to the spec — review it if you want. If edge cases are missing, add them to the spec and re-run `/generate-tests`. Then run `/dev`.

### Q: Can I modify generated tests before `/dev`?
**A:** Yes, but usually not needed. If acceptance criteria change, update the spec and re-run `/generate-tests`.

### Q: What if tests are missing edge cases?
**A:** Add edge cases to spec (UX Design section), re-run `/generate-tests`. Or add tests manually after `/dev`.

### Q: Do all features need all test types?
**A:** No. The skill is adaptive — only generates test types that make sense for the feature. Backend features skip E2E/a11y, UI features skip integration tests, etc.

### Q: How long does this take?
**A:** 2-5 minutes for most features (generates 5-10 test files)

---

## Example Output

```markdown
## Test Strategy Generated for P142: CSV Export

**Files created:**
- ✅ Unit tests: `src/tests/exportCSV.test.ts` (3 tests)
- ✅ Integration tests: `e2e/integration/p142-csv-export-api.spec.ts` (2 tests)
- ✅ E2E tests: `e2e/p142-csv-export.spec.ts` (2 tests)
- ✅ Accessibility tests: `e2e/a11y/p142-csv-export-accessibility.spec.ts` (2 tests)
- ✅ Smoke tests: `e2e/p142-smoke.spec.ts` (1 test)
- ✅ UAT scenarios: `features/uat/p142.md` (4 scenarios)
- ✅ Test helpers: `e2e/helpers/test-sifter.ts`

**Test pyramid:**
```
     /\
    /  \   2 E2E tests
   /____\
  / 2 INT  \
 /__________\
/ 3 UNIT    \
```

**Total:** 10 automated tests + 4 UAT scenarios
**Estimated run time:** ~15 seconds

**What's tested:**
- ✅ Core export logic (unit)
- ✅ Data pipeline (integration)
- ✅ User flows (E2E)
- ✅ Accessibility (keyboard + screen reader)

**What's NOT tested (rationale):**
- ❌ Component internals (covered by E2E)
- ❌ Browser APIs (real download in E2E test)

**Coverage report:** See "Test Coverage Strategy" section in spec

---

**Next step:** Run `/dev features/p142_csv_export.md` to implement feature + run tests
```

---

## Related Skills

- `/create-prd` → Business requirements (layer 1)
- `/ux` → UX design (layer 2, if UI)
- `/architect` → Technical architecture (layer 3)
- `/ui` → Component strategy (layer 3.5, if UI)
- `/generate-tests` → Test strategy (layer 4) ← **YOU ARE HERE**
- `/dev` → Implementation + testing (layer 5)

---

## Backward Compatibility

**`/generate-uat` is now an alias to `/generate-tests`:**
- Old behavior preserved (still generates UAT + E2E stubs + smoke)
- New behavior added (unit + integration + a11y + helpers + coverage report)
- Features using `/generate-uat` automatically get new capabilities

---

## Validation

This skill was validated against:
- P61 acceptance tests (UAT generation)
- P135, P131, P140 E2E tests (E2E test format)
- P142 sequential flow (test automation)
- Existing test patterns (unit, integration, E2E, a11y)
