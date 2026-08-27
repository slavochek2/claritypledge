---
description: 'Generate UAT checklist and runnable E2E test stubs from a spec'
when_to_use: "After /generate-tests, when UAT checklist and E2E stubs are needed from a spec."
name: generate-uat
version: 1.0.0
---

## Dispatch

**Phase A — Generate + preview (spawn → collect → present):**
Spawn Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Steps 1–7 from the skill below + spec path from $ARGUMENTS. Working dir: `<cp-root>`.
Collect the subagent's output (test count, categories, file paths, preview content). Present to user.
Ask: "Does this look correct? Should I save all 3 test files? (y/n)"

**Phase B — Save files (only after user approves):**
Spawn a second Agent tool: `model: "sonnet"`, `subagent_type: "general-purpose"`.
Prompt: Step 8 (save) from the skill below + the exact file content from Phase A output. Write all 3 files.
Report subagent output verbatim.

# /generate-tests

Generate User Acceptance Test checklist and runnable E2E test files from a feature specification.

**Announce at start:** "I'm using the /generate-tests skill to extract testable criteria from the spec and create test files."

## Usage

```
/generate-tests <path-to-spec> [--format full|minimal] [--output <path>]
```

**Examples:**
- `/generate-tests features/p61_events_complete_tech_spec.md`
- `/generate-tests features/p142_export_csv.md --format minimal`

## What This Skill Does

1. **Read the spec** — Parse the entire specification file
2. **Extract success criteria** — Find testable statements from these sections (in priority order):
   - "Acceptance Criteria"
   - "Success Criteria"
   - "User Stories"
   - "Requirements"
   - Bullet points under "Goals" or "Objectives"
3. **Categorize tests** — Group by feature area and test type
4. **Generate 3 types of test files:**
   - **UAT checklist** (`features/uat/p{N}.md`) — Manual validation checklist
   - **E2E test stubs** (`e2e/p{N}-{slug}.spec.ts`) — Runnable Playwright test file with TODO stubs
   - **Smoke tests** (`e2e/p{N}-smoke.spec.ts`) — Fast regression tests (page loads, no errors)

---

## What It Generates

### 1. UAT Checklist (Manual Validation)

**File:** `features/uat/p{N}.md`

**Purpose:** Manual checklist for user to validate:
- Business outcomes achieved
- User experience feels right
- Edge cases handled
- Acceptance criteria met

**Format:** Given/When/Then scenarios with verification methods

**Use case:** User validates quality (not just functionality)

---

### 2. E2E Test File Stubs (Automated Testing)

**File:** `e2e/p{N}-{feature-slug}.spec.ts`

**Purpose:** Runnable Playwright test file with TODO stubs for implementation

**Contains:**
- One test per acceptance criterion
- Setup/teardown scaffolding
- Page navigation stubs
- Assertion stubs (to be filled by /dev agent)
- Test helpers for auth, data creation, cleanup

**Example stub:**
```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P142: Export CSV', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'CSV Test User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('exports sifter responses as CSV', async ({ page }) => {
    // TODO: Setup - create sifter with responses
    // TODO: Navigate to results page
    // TODO: Click export button
    // TODO: Verify CSV file downloaded
    // TODO: Verify CSV contains expected data
  });

  test('disables export when no responses', async ({ page }) => {
    // TODO: Setup - create sifter with 0 responses
    // TODO: Navigate to results page
    // TODO: Verify export button disabled
    // TODO: Verify tooltip shows "No responses to export"
  });
});
```

---

### 3. Smoke Test File (Fast Regression Detection)

**File:** `e2e/p{N}-smoke.spec.ts`

**Purpose:** Fast smoke tests to catch basic breakage

**Contains:**
- Page loads test (no 404/500)
- No console errors test
- Critical elements present test

**Example:**
```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P142 Smoke Tests', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Smoke Test User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('results page loads without errors', async ({ page }) => {
    // TODO: Setup - create sifter
    // TODO: Navigate to results page
    // TODO: Verify page loads (no 404/500)
    // TODO: Verify no console errors
    // TODO: Verify main heading present
  });
});
```

---

## Process

### Step 1: Read the Spec

Read the entire spec file provided as argument.

If no file path provided, ask:
> Which spec file should I generate a UAT for? (e.g., `features/p70_new_feature.md`)

### Step 2: Find Success Criteria

Search for sections containing testable criteria. Look for these headers (case-insensitive):

**Explicit sections (highest priority):**
- `## Success Criteria`
- `## Acceptance Criteria`
- `## Requirements`
- `### Tests`

**User story format:**
```
As a [user], I want [action] so that [outcome]
→ Convert to: "User can [action]"
```

**Requirements tables:**
```
| Requirement | Priority |
|-------------|----------|
| Events have title | Must |
→ Convert to: "Events have title"
```

**Implicit in description (lowest priority):**
```
The events page shows upcoming events with title, date, and location.
→ Extract: "Events show title", "Events show date", "Events show location"
```

### Step 3: Categorize Tests

Assign each criterion to a category based on keywords:

| Keywords in criterion | Category |
|----------------------|----------|
| table, column, migration, SQL, RLS, database | Database |
| page, render, display, show, UI, component, screen | UI |
| login, auth, session, permission, role, authenticated | Auth |
| API, endpoint, request, response, fetch | API |
| form, input, validation, submit, field | Forms |
| navigation, route, link, redirect, URL | Navigation |
| error, fail, invalid, edge case | Error Handling |
| test, unit, e2e, playwright | Testing |

If no keywords match, use "General".

Group tests by category, then number sequentially: `UAT-{category}.{sequence}`

### Step 4: Convert to Given/When/Then

For each criterion, create a structured test:

```markdown
### UAT-{N}.{M}: {Short description}
**Given:** {precondition/context}
**When:** {action (if applicable)}
**Then:** {expected outcome}
**Verify:** {how to verify - Playwright MCP, DB query, visual inspection, etc.}
```

**Rules:**
- If criterion is a state (e.g., "Events table exists"), omit "When"
- For UI tests, verification is typically "Playwright MCP screenshot"
- For database tests, verification is "Run query in Supabase dashboard" or "npm run build"
- For API tests, verification is "Playwright MCP network tab" or "curl command"

### Step 5: Generate UAT Checklist Output

Use this template for `features/uat/p{N}.md`:

```markdown
# {Feature Name} — Acceptance Tests

**Purpose:** Testable acceptance criteria for {feature} implementation.
**Usage:** Ralph Loop iterates until ALL tests pass (score 100%).
**Source:** {spec_path}
**Generated:** {date}
**Generated by:** /generate-uat

---

## Test Scoring

\`\`\`
Score = passed_tests / {total} (shown as X/{total} or N%)
Total tests: {total}
Pass threshold: {total}/{total} (100% — all tests must pass)
\`\`\`

---

## Pre-Checks (must pass before UAT)

\`\`\`bash
npm run lint          # No errors
npm run build         # Compiles successfully
npm test              # All unit tests pass
\`\`\`

---

{For each category}
## Category {N}: {Category Name} ({count} tests)

{For each test in category}
### UAT-{N}.{M}: {Short description}
**Given:** {precondition}
**When:** {action}
**Then:** {expected outcome}
**Verify:** {verification method}

{End for each test}
---
{End for each category}

## Test Execution Log

| Test | Status | Notes |
|------|--------|-------|
| UAT-1.1 | ⬜ | |
| UAT-1.2 | ⬜ | |
| ... | ... | ... |

**Legend:** ⬜ Not tested | ✅ Pass | ❌ Fail | ⏭️ Skipped (blocked — add note)

---

## Success Criteria

Ralph Loop completes when:
1. All {total} UAT tests show ✅
2. `./scripts/pre-commit-checks.sh` passes
3. No console errors during Playwright verification

Output `<promise>{Feature ID} UAT COMPLETE</promise>` when done.

---

## Notes for Agent

- **Use Playwright MCP** for visual verification
- **Use Chrome DevTools MCP** if network issues
- **Commit after each category passes** — Progress is preserved
- **Update scorecard** after each test — This file is your state
```

### Step 6: Generate E2E Test Stubs

**File:** `e2e/p{N}-{feature-slug}.spec.ts`

**Process:**
1. Extract feature slug from spec filename (e.g., `p142_export_csv.md` → `export-csv`)
2. Extract acceptance criteria from spec
3. Create test structure:
   ```typescript
   import { test, expect } from '@playwright/test';
   import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

   test.describe('P{N}: {Feature Name}', () => {
     let testUser: TestUser;

     test.beforeEach(async () => {
       testUser = await createTestUser({ name: '{Feature} Test User' });
     });

     test.afterEach(async () => {
       if (testUser?.user?.id) {
         await deleteTestUser(testUser.user.id);
       }
     });

     {For each acceptance criterion}
     test('{test name from acceptance criterion}', async ({ page }) => {
       // TODO: Setup - {describe setup needed}
       // TODO: Navigate to {page}
       // TODO: {action to perform}
       // TODO: Verify {expected outcome}
     });
   });
   ```

4. Generate one test per acceptance criterion
5. Use descriptive TODO comments for /dev agent to implement
6. Include setup/teardown scaffolding (auth, data creation, cleanup)

**Rules:**
- Test names should be concise, lowercase, descriptive
- Use test helpers from `./helpers/test-user` for auth
- Leave implementation as TODOs (filled by /dev)
- Include common imports (test, expect, helpers)

---

### Step 7: Generate Smoke Tests

**File:** `e2e/p{N}-smoke.spec.ts`

**Process:**
1. Create basic smoke test structure:
   ```typescript
   import { test, expect } from '@playwright/test';
   import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

   test.describe('P{N} Smoke Tests', () => {
     let testUser: TestUser;

     test.beforeEach(async () => {
       testUser = await createTestUser({ name: 'Smoke Test User' });
     });

     test.afterEach(async () => {
       if (testUser?.user?.id) {
         await deleteTestUser(testUser.user.id);
       }
     });

     test('{main page} loads without errors', async ({ page }) => {
       // TODO: Setup - {minimal setup needed}
       // TODO: Navigate to {main page of feature}
       // TODO: Verify page loads (no 404/500)
       // TODO: Verify no console errors
       // TODO: Verify main heading/content present
     });
   });
   ```

2. Identify main page/route from spec (UX section, technical section, or acceptance criteria)
3. Create single smoke test for page load
4. Use TODOs for implementation details

**Purpose:** Fast test to catch basic breakage (page doesn't load, console errors, critical elements missing)

---

### Step 8: Confirm and Save

Before saving, show the user:
- Number of UAT tests extracted: {N}
- Number of E2E test stubs: {M}
- Categories: {list}
- Output paths:
  - UAT: `features/uat/p{N}.md`
  - E2E: `e2e/p{N}-{slug}.spec.ts`
  - Smoke: `e2e/p{N}-smoke.spec.ts`

Ask: "Does this look correct? Should I save all 3 test files?"

If approved, save all 3 files (or custom paths if `--output` specified).

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--output <path>` | `features/uat/p{N}.md` | Custom output path |
| `--format full` | `full` | Include Given/When/Then for each test |
| `--format minimal` | - | Scorecard table only (no detailed tests) |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spec has no acceptance/success criteria section | Warning: "No explicit acceptance criteria found. Extracting from description. Review generated tests carefully." |
| Spec is too vague to extract tests | Error: "Couldn't extract testable criteria. Add an 'Acceptance Criteria' section to the spec." |
| UAT file already exists | Ask: "UAT file exists at {path}. Overwrite / Merge / Cancel?" |
| E2E test file already exists | Ask: "E2E test file exists at {path}. Overwrite / Merge / Cancel?" |
| Spec has 50+ criteria | Warning: "Large spec ({N} criteria). Consider breaking into smaller features." |
| Category has no tests | Skip the category in UAT, don't create empty sections |
| Can't determine main page for smoke test | Use generic page (e.g., homepage or main feature page), add TODO for /dev to specify |
| Feature is backend-only (no UI) | Skip smoke test generation, only create E2E test stubs for API/database tests |

---

## Example Input → Output

**Input spec excerpt:**
```markdown
# P142: Export CSV

## Acceptance Criteria

- [ ] User can export sifter responses as CSV file
- [ ] Export button is disabled when sifter has 0 responses
- [ ] CSV includes all response data (timestamp, answers, respondent)
- [ ] File downloads with name format: `{sifter-title}-responses-{date}.csv`
```

**Output 1: UAT Checklist** (`features/uat/p142.md`):
```markdown
# Export CSV — Acceptance Tests

## Category 1: UI (2 tests)

### UAT-1.1: Export button works
**Given:** Sifter has 5 responses
**When:** User navigates to results page and clicks "Export CSV"
**Then:** CSV file downloads with correct data
**Verify:** Playwright MCP click + download verification

### UAT-1.2: Export disabled when empty
**Given:** Sifter has 0 responses
**When:** User navigates to results page
**Then:** Export button is disabled
**Verify:** Playwright MCP screenshot

## Category 2: Data (2 tests)

### UAT-2.1: CSV includes all data
**Given:** Sifter has responses with answers
**When:** CSV is exported
**Then:** File contains timestamp, answers, respondent columns
**Verify:** Open CSV file, check headers

### UAT-2.2: Filename format correct
**Given:** Sifter titled "Remote Trust"
**When:** CSV exported on 2026-02-13
**Then:** Filename is `remote-trust-responses-2026-02-13.csv`
**Verify:** Check downloaded file name
```

**Output 2: E2E Test Stubs** (`e2e/p142-export-csv.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P142: Export CSV', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'CSV Test User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('exports sifter responses as CSV', async ({ page }) => {
    // TODO: Setup - create sifter with responses
    // TODO: Navigate to results page
    // TODO: Click export button
    // TODO: Verify CSV file downloaded
    // TODO: Verify CSV contains expected data
  });

  test('disables export when no responses', async ({ page }) => {
    // TODO: Setup - create sifter with 0 responses
    // TODO: Navigate to results page
    // TODO: Verify export button disabled
    // TODO: Verify tooltip shows "No responses to export"
  });

  test('CSV includes all response data', async ({ page }) => {
    // TODO: Setup - create sifter with multiple responses
    // TODO: Export CSV
    // TODO: Verify CSV has timestamp, answers, respondent columns
  });

  test('filename format is correct', async ({ page }) => {
    // TODO: Setup - create sifter titled "Remote Trust"
    // TODO: Export CSV
    // TODO: Verify filename matches pattern: {slug}-responses-{date}.csv
  });
});
```

**Output 3: Smoke Tests** (`e2e/p142-smoke.spec.ts`):
```typescript
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P142 Smoke Tests', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Smoke Test User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('results page loads without errors', async ({ page }) => {
    // TODO: Setup - create sifter
    // TODO: Navigate to results page
    // TODO: Verify page loads (no 404/500)
    // TODO: Verify no console errors
    // TODO: Verify main heading present
  });
});
```

---

## Related Skills

- `/create-spec` → `/ux` → `/architect` → `/generate-tests` → `/dev` — New sequential flow (P143)
- `/prep-spec` — Legacy skill (deprecated, but still calls `/generate-tests`)
- `/dev` — Reads UAT + E2E stubs, implements tests, runs them, iterates until pass

---

## Backward Compatibility

**Skill name change:** `/generate-uat` → `/generate-tests`
- `/generate-uat` still works (alias to `/generate-tests`)
- Old behavior preserved: still generates `features/uat/p{N}.md`
- New behavior added: also generates E2E stubs + smoke tests

**What's new in this version:**
- Generates 3 files instead of 1
- E2E test stubs are runnable Playwright files (not manual checklists)
- Smoke tests for fast regression detection
- Integrates with `/dev` skill (reads stubs, implements, runs, iterates)

**Migration path:**
- Existing UAT files (features/uat/*.md) still valid
- New features after P143 get all 3 files
- Old features can be retro-fitted with E2E stubs if needed

---

## Validation

This skill was validated against:
- P61 acceptance tests (UAT generation)
- P135, P131, P140 E2E tests (test stub format)
- P143 sequential flow requirements (test automation)
