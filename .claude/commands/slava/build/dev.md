# /dev

Execute a development task with TDD discipline and production thinking.

> **Principle:** Write code you'd be proud to debug at 3am. Today's shortcut is tomorrow's incident.

## Orchestrator Mode (when task manifest exists)

If the spec contains `## Implementation Tasks`, /dev operates as an orchestrator:

1. Read ONLY the `## Implementation Tasks` section (not the full spec)
2. Find all unchecked tasks: `- [ ] Complete`
3. For each unchecked task in dependency order:
   a. Spawn a subagent with: task title + files list + spec refs (read only those lines from the spec, not the full file)
   b. Subagent implements the task and runs its verification step
   c. On success: mark `- [x] Complete` in the spec
   d. Commit the task's changes before moving to next task
4. After all tasks complete, run the full test suite (`npm test && npm run test:e2e`)

**Parallelization:** Tasks listed under "Can parallelize" in the manifest summary can be dispatched simultaneously as concurrent subagents.

If no `## Implementation Tasks` section exists, use standard /dev behavior (instructions below).

---

## Usage

```bash
/dev features/p99.md           # Implement feature from spec
/dev refactor the auth module  # With inline description
```

---

## How to Think

You're not just writing code — you're building something that will run in production, be maintained by others, and fail in ways you haven't imagined.

**Two lenses to apply constantly:**

### The Sustainability Lens
> "Will we regret this in 6 months?"

- Long-term over short-term. A "quick fix" that creates a 2-week cleanup wasn't quick.
- Patterns exist for reasons. Violating them might be right, but understand why the pattern exists first.
- Production is different. Happy path demos don't prove robustness.

### The Skeptic's Lens
> "Why will this fail?" (not "might" — "will")

- Assumptions are hypotheses. Every assumption is something that could be wrong.
- Plans survive until contact with reality. What real-world conditions could break this?
- Hand-waving hides risk. When something is glossed over, that's where bugs live.

**Apply both before you ship:**
- What shortcuts might hurt later?
- What happens when this fails? (not "if")
- What assumptions are we making?
- Is this testable? Debuggable by someone else?

---

## Workflow

0. **Pre-flight: branch check** — If current branch is `main` AND this is a P-number feature, create a feature branch before writing any code:
   ```bash
   git checkout -b feature/pN-short-description
   ```
   Name it `feature/pN-short-description`. Report: "Created branch feature/pN-... — commits will stay off main until you /ship."
   Skip this if already on a feature branch or if task is not a P-number feature (infra, docs, small fixes).

0.1. **Pre-flight: index collision check** — Run `git status --short`. If modified or untracked files from a **different** feature exist, stop and present options before touching any code:
   - **(A) Create a worktree** for this feature (recommended — clean index, parallel isolation)
   - **(B) Commit the in-progress work first** (if it's at a safe checkpoint)
   - **(C) Proceed anyway** (only if user explicitly confirms both features are one logical changeset)
   Wait for user decision. Skip this check if the tree is clean or all changes belong to this feature.

0.1. **Mark in-progress** — If a P-number spec was provided, update `status: in-progress` in frontmatter (skip silently if inline description mode)
1. **Read tests** — UAT scenarios, E2E test stubs, acceptance criteria
2. **Understand** — Read spec, find `[ ]` tasks (skip `[x]` done)
3. **Implement** — Feature code + fill in test stubs
4. **Run tests** — Execute test suite, check results
5. **Iterate** — Fix code until ALL tests pass (max 5 attempts)
6. **Skeptic check** — What could break? What did I assume?
7. **Mark** — Change `[ ]` to `[x]` after task passes
8. **Check** — Run `./scripts/pre-commit-checks.sh`
9. **Commit** — Only if ALL tests pass
9.5. **Review** — Spawn `/review-all` as a subagent with this explicit instruction: "Review all changes on this branch vs main. Spec: [current spec path]. Do NOT pause for scope selection — proceed directly with scope = all changes vs main." Present HIGH/MEDIUM findings to user. Ask: "Fix issues before closing? (all HIGH / select / skip)". Apply approved fixes and commit them.
10. **Close** — Move spec to `features/done/`, set `status: done` + `completed_at`, prompt for `/kdd`

---

## Test-Driven Workflow

/dev follows strict test-driven development:

```
1. READ TESTS → Agent reads UAT, E2E stubs, acceptance criteria
     ↓
2. IMPLEMENT → Agent writes feature code + fills in test stubs
     ↓
3. RUN TESTS → Agent executes: npm test && npm run test:e2e
     ↓
4. ANALYZE → Agent checks results (how many pass/fail)
     ↓
5. ITERATE → If failures, agent fixes code and re-runs (step 3)
     ↓
6. COMMIT → Only when ALL tests pass ✅
```

**Why this matters:**
- User validates UX only (not functionality)
- Bugs caught during implementation (not after)
- Regression tests prevent "fix breaks something else"
- Manual testing time: 20 min → 5 min per feature

---

## Pre-Implementation: Read Tests

Before implementing ANY feature, agent MUST read:

1. **UAT scenarios** — `features/uat/pN.md`
   - Given/When/Then test scenarios
   - Acceptance criteria verification
   - Edge cases to handle

2. **E2E test stubs** — `e2e/pN-*.spec.ts`
   - Test structure and expectations
   - TODO stubs to fill in
   - Integration test scenarios

3. **Acceptance criteria** — From feature spec
   - Business requirements
   - Success metrics
   - Definition of done

**Example:**
```bash
# Read UAT file
features/uat/p142.md

# Read E2E test stubs
e2e/p142-export-csv.spec.ts
e2e/p142-smoke.spec.ts
```

**Agent reports:** "Found 3 acceptance criteria, 2 E2E test files, 4 test scenarios."

---

## Implementation: Feature + Tests

Agent implements TWO things in parallel:

### 1. Feature Code
- Follows technical requirements from spec
- Implements business logic
- Follows code style (React 19, TypeScript, Tailwind)
- Handles edge cases from UAT

### 2. Test Implementation
- **Fills in E2E test stubs** — Replace `// TODO: implement test` with actual test code
- **Creates unit tests** — If needed for complex logic
- **Verifies test structure** — Tests match acceptance criteria

**Example:**
```typescript
// BEFORE (stub):
test('should export CSV when clicking export button', async ({ page }) => {
  // TODO: implement test
});

// AFTER (implemented):
test('should export CSV when clicking export button', async ({ page }) => {
  await setTestSession(page, testUser.email);
  await page.goto('/sifter/123/results');

  const exportButton = page.getByRole('button', { name: /export/i });
  await exportButton.click();

  // Verify CSV download
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toMatch(/responses-.*\.csv/);
});
```

---

## Test Execution

**Agent runs tests after implementation:**

```bash
# Unit tests
npm test

# E2E tests (specific feature)
npm run test:e2e -- e2e/p142-*.spec.ts

# All E2E tests
npm run test:e2e
```

**Agent interprets results:**
- ✅ All tests pass → Ready to commit
- ❌ Some tests fail → Analyze errors, fix code, re-run
- ⚠️ Tests can't run → Fix test infrastructure first

**Progress reporting:**
Agent tells user what's happening:
- "Running tests... 7/10 passing"
- "Fixing: Login validation missing email check"
- "Re-running tests... 9/10 passing"
- "Fixing: Empty state not handling null responses"
- "All tests pass ✅"

**Iteration limit:**
- Agent iterates up to 5 times
- If still failing after 5 iterations, agent reports to user for help

---

## Handling Test Failures

**When tests fail, agent:**

1. **Reads error messages carefully**
   - What test failed?
   - What was expected vs actual?
   - Stack trace (where in code?)

2. **Identifies root cause**
   - Logic error in feature code?
   - Edge case not handled?
   - Test stub incorrectly filled in?

3. **Fixes the CODE (not the test)**
   - Principle: Tests are the spec, code must match
   - If test seems wrong, agent flags it to user

4. **Re-runs tests**
   - Same command: `npm test && npm run test:e2e`
   - Checks if fix resolved the failure

5. **Iterates until pass**
   - Max 5 iterations
   - If still failing, reports to user: "Tests still failing after 5 attempts. Error: [details]. Need help debugging."

**Example iteration:**

```
Iteration 1:
  Tests: 8/10 passing
  Failures:
    - "Export button disabled" test failed
    - Expected button to be disabled, but it was enabled

  Analysis: Missing check for empty responses array
  Fix: Add condition: disabled={responses.length === 0}

  Re-running tests...

Iteration 2:
  Tests: 10/10 passing ✅

  All tests pass. Ready to commit.
```

---

## TDD Flow

```
1. Write failing test first
2. Run test, confirm it fails for RIGHT reason
3. Implement MINIMAL code to pass
4. Run npm test — MUST paste output
5. If tests fail → fix before proceeding
```

**Skip TDD only for:**
- Pure refactoring (tests exist)
- UI-only with no logic
- Trivial changes (typos)

---

## Agent Behavior

The dev agent:

**0. Mark in-progress (if P-number provided):**
- Locate feature file: `features/p{N}_*.md`
- Update frontmatter `status` → `in-progress`
- Report: "Marked pN as in-progress in kanban."
- Skip silently if no feature file (inline description mode)

**1. Pre-flight checks:**
- Reads feature spec (business + UX + technical)
- Reads UAT scenarios (features/uat/pN.md)
- Reads E2E test stubs (e2e/pN-*.spec.ts)
- Reads acceptance criteria

**2. Implementation:**
- Implements feature code (follows technical requirements)
- Fills in TODO stubs in E2E test files
- Creates unit tests if needed
- Follows code style (React 19, TypeScript, Tailwind)

**3. Test execution:**
- Runs: `npm test && npm run test:e2e`
- Checks: How many pass? How many fail?
- Reports progress to user

**4. Iteration loop (if tests fail):**
- Analyzes error messages
- Identifies root cause
- Fixes code (NOT the test)
- Re-runs tests
- Repeats until ALL tests pass (max 5 iterations)

**5. Commit (only if tests pass):**
- Runs pre-commit checks
- Creates commit with descriptive message
- Reports completion to user

**6. Completion verification:**
The dev agent runs a comprehensive checklist before marking work complete:
1. Runs full test suite (E2E + unit + smoke)
2. Verifies no existing tests broken (regression check)
3. Checks acceptance criteria from spec
4. If UI modified → suggests running /design-audit
5. Reports results to user with clear pass/fail status

**Never skip verification:** The agent MUST verify all criteria before returning. Partial completion is not allowed - iterate until all checks pass.

**Self-review checklist:**
- [ ] Feature code implements all acceptance criteria
- [ ] E2E test stubs filled in (no TODOs left)
- [ ] All tests pass (unit + E2E)
- [ ] No console errors
- [ ] Code follows style guide
- [ ] Pre-commit checks pass

---

## When Stuck

If 3+ attempts fail or you're fighting the architecture:

**1. STOP** — Don't keep trying the same thing

**2. Root cause first**
```
- Read error messages COMPLETELY
- Reproduce consistently
- Trace backward to source
- Hypothesis: "X is root cause because Y"
```

**3. If still stuck, present options:**
```
Problem: [what's blocking]

Options:
A) Quick fix: [hacky, note tech debt]
B) Local refactor: [fix area, ~N files]
C) Needs discussion: [architecture issue]

Which approach?
```

---

## Completion Criteria

Before marking a feature complete, `/dev` verifies:

**Required checks:**
- [ ] All new E2E tests pass (generated by /generate-tests)
- [ ] All new unit tests pass (if any were created)
- [ ] All smoke tests pass (fast regression detection)
- [ ] All existing tests still pass (no regressions introduced)
- [ ] Acceptance criteria met (from spec Business Requirements section)

**Conditional checks:**
- [ ] If UI files modified (*.tsx, *.css, styles):
  - Agent suggests: "UI files were modified. Run /design-audit before marking done to verify UI compliance (buttons, colors, accessibility)? (y/n)"
  - If user approves → run /design-audit
- [ ] If UI feature: No console errors in browser
- [ ] If API changes: No breaking changes to existing endpoints (or documented as breaking)

**Output to user:**
```
✅ All tests passing
✅ Acceptance criteria verified
✅ No regressions detected

Running /review-all...
[Review findings presented — HIGH/MEDIUM/LOW]
Fix issues before closing? (all HIGH / select / skip)

Feature closed → features/done/5_feb_26/
Capture learnings with /kdd? (y/n)
```

**Failure handling:**
- If ANY required check fails → do NOT mark complete
- Report which check failed and why
- Iterate on fix until all checks pass

---

## Definition of Done

**Prod ready. Proud to ship it.**

- ALL tests pass (unit + E2E + smoke)
- Pre-commit checks pass
- It actually works (you tried it)
- You applied both lenses (sustainability + skeptic)
- You'd be proud to debug this at 3am

**CRITICAL: Do NOT commit if tests fail.**

If you're hesitating — that's a signal. Fix what's causing it.

---

## Resume Support

If spec has checkboxes, they track progress:
- `[ ]` = pending — do this task
- `[x]` = done — skip

After each task passes tests, mark `[x]` in spec file. If interrupted, re-run `/dev` and it picks up where you left off.

---

## Output

```markdown
## Done

**Task:** [description]

**Test Results:**
- Unit tests: [X/Y passing]
- E2E tests: [X/Y passing]
- Total: [X/Y passing] ✅

**Test Evidence:**
[PASTE npm test output]
[PASTE npm run test:e2e output]

**Files Changed:**
- src/...
- src/...
- e2e/... (tests implemented)

**Test Iteration Log:**
- Iteration 1: [X/Y passing] - Fixed: [what was fixed]
- Iteration 2: [X/Y passing] - Fixed: [what was fixed]
- Final: [X/Y passing] ✅

**Sustainability/Skeptic Notes:**
- [Any concerns, assumptions, or things to watch]

**Status:** DONE / BLOCKED [reason]
```

---

## Example Usage

### Input
```
/dev features/p142_export_csv.md
```

### Output (with test-driven workflow)

**Step 1: Reading tests**
```
Reading feature spec...
Reading UAT scenarios: features/uat/p142.md
Reading E2E test stubs: e2e/p142-export-csv.spec.ts, e2e/p142-smoke.spec.ts

Found 3 acceptance criteria, 2 E2E test files, 4 test scenarios.
```

**Step 2: Implementation**
```
Implementing feature:
  - Created: src/lib/csv/export.ts
  - Modified: src/app/sifter/[id]/results/page.tsx
  - Modified: package.json (added papaparse)

Filling in test stubs:
  - e2e/p142-export-csv.spec.ts (2 tests implemented)
  - e2e/p142-smoke.spec.ts (1 test implemented)
```

**Step 3: Running tests**
```
Running: npm test && npm run test:e2e

Tests: 9/10 passing
Failures:
  - "disables export when no responses" test failed
  - Expected button disabled, but enabled

Analyzing error...
```

**Step 4: Iteration**
```
Root cause: Missing check for empty responses array
Fix: Added disabled={responses.length === 0} to ExportButton

Re-running tests...

Tests: 10/10 passing ✅
```

**Step 5: Completion verification**
```
Running completion checklist...
✅ All E2E tests pass (3/3)
✅ All smoke tests pass (1/1)
✅ No regressions (512 existing tests still pass)
✅ Acceptance criteria verified

⚠️  UI files modified: src/app/sifter/[id]/results/page.tsx
    Recommend /design-audit.
    Run now? (y/n)

Feature implementation complete.
```

**Step 6: Commit**
```
All tests pass. Running pre-commit checks...

Pre-commit checks pass ✅

Creating commit:
  feat(sifter): add CSV export for responses

  - Export button on results page
  - Generates CSV with question, response, timestamp
  - Disabled when no responses
  - E2E tests for export and disabled state
  - Smoke test for page load

  Tests: 10/10 passing

  Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

Committed: abc1234
```

**Important notes:**
- Agent NEVER skips tests
- Agent NEVER commits if tests fail
- Agent fixes code to match tests (not tests to match code)
- Agent reports progress so user knows what's happening
- Agent asks for help if stuck after 5 iterations

---

### Example: Feature Complete with UI Changes

```
Reading tests from e2e/p142-dark-mode.spec.ts...
Implementing dark mode toggle...
Running tests...

Iteration 1: ❌ Toggle not visible on profile page
  → Fix: Add toggle to ProfileHeader component
  → Re-run tests

Iteration 2: ❌ Theme preference not persisted
  → Fix: Add localStorage persistence
  → Re-run tests

Iteration 3: ✅ All tests passing

Running completion checklist...
✅ All E2E tests pass (3/3)
✅ All smoke tests pass (1/1)
✅ No regressions (512 existing tests still pass)
✅ Acceptance criteria verified

⚠️  UI files modified: src/app/components/ProfileHeader.tsx
    Recommend /design-audit.
    Run now? (y/n)

Feature implementation complete.
```

---

## Feature Closure

After successful commit, close the feature:

1. Mark all `## Acceptance Criteria` checkboxes `[x]` in the spec file.
2. Update frontmatter: `status: done`, `completed_at: YYYY-MM-DD`
3. Find destination:
   ```bash
   ls -d features/done/*/ 2>/dev/null | sort -V | tail -1
   ```
   Use current month's folder if it exists (`{N}_{mon}_{yy}`), else create next.
4. Move files:
   ```bash
   mkdir -p features/done/{folder}/uat
   git mv features/{spec} features/done/{folder}/
   git mv features/uat/p{N}.md features/done/{folder}/uat/ 2>/dev/null
   ```
5. Commit: `chore: close P{N} — {title}`
6. Spawn parallel closing subagents:
   - **fix-kanban** (always): Invoke `/slava:maintain:fix-kanban` — fixes frontmatter drift + refreshes kanban
   - **verify** (if `*.tsx` files changed): Ask "Run `/verify` for visual QA? (y/n)" — spawn as subagent if yes
   fix-kanban runs automatically; verify is opt-in.
6. Ask: "Capture learnings with /kdd? (y/n)"

If no spec file exists (inline description mode), skip closure silently.

---

## Related

- `/slava:ux` — User experience review
- `/slava:lean` — Challenge scope, find the MVP
- `/slava:build:generate-uat` — Generate UAT scenarios and E2E test stubs
