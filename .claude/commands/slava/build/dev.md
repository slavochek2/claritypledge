---
name: dev
description: Execute a development task with TDD discipline and production thinking
when_to_use: "After spec exists (/create-prd, /architect done). Triggered by /dev."
version: 1.0.0
---

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

## Step -1: Context Load (NEVER SKIP when a spec exists — even if you discussed it earlier)

Before ANY other step — including worktree setup:
1. Read the full spec file (`features/pN*.md`) — Decisions section first, then Acceptance Criteria, then tasks
2. If spec references DB columns/tables: verify they exist (`curl` the REST API or check migration files)

**Why this is step -1:** After context compaction, the conversation summary says "working on pN" but the spec details are gone. This step costs 10 seconds and prevents 30-minute wrong-direction implementations.

Skip if no spec exists (inline description mode like `/dev refactor the auth module`).

---

## Workflow

0. **Pre-flight: branch lineage check** — Before any branching or worktree creation:

   **Branch lineage check:**
   Run `git rev-list --count main..HEAD`. If >5 commits ahead of main:
   - WARN: "Current branch is N commits ahead of main. /ship would merge all of them."
   - Offer: A) Branch from main instead (recommended), B) Cherry-pick after implementation, C) Proceed knowingly

0. **Pre-flight: worktree setup** — If this is a P-number feature AND current branch is `main`:

   **Default: create a worktree.**
   ```bash
   git worktree add .claude/worktrees/w1 -b feature/pN-short-description
   ./scripts/setup-worktree.sh .claude/worktrees/w1
   cd .claude/worktrees/w1
   ```
   Check `git worktree list` to find existing slots. Use the next available number (`w1`, `w2`, `w3`, `w4`, etc.) — never stop to ask which worktree to free up. Report: "Created worktree {slot} on branch feature/pN-..."

   **Exception — skip worktree if ALL of these are true:** (a) task is a trivial single-file fix (typo, copy change, config tweak), (b) no other features are in progress on the index, (c) user explicitly says "just do it inline." In that case, create a feature branch instead: `git checkout -b feature/pN-short-description`.

   Skip entirely if already in a worktree on the correct feature branch, or if task is not a P-number feature (infra, docs).

0.1. **Pre-flight: worktree signal check** — If a spec file was provided, scan it for the word "worktree". If found (e.g., "Apply in a worktree", "Worktree recommended"), confirm the worktree was created in step 0. If step 0 was skipped (exception case), present the option proactively:
   ```
   Spec recommends a worktree for this change (high blast radius).
   (A) Create worktree now — recommended
   (B) Proceed on current branch
   ```
   Wait for decision. Skip if inline description mode (no spec file).

0.2. **Pre-flight: index collision check** — Run `git status --short`. If modified or untracked files from a **different** feature exist, stop and present options before touching any code:
   - **(A) Create a worktree** for this feature (recommended — clean index, parallel isolation)
   - **(B) Commit the in-progress work first** (if it's at a safe checkpoint)
   - **(C) Proceed anyway** (only if user explicitly confirms both features are one logical changeset)
   Wait for user decision. Skip this check if already in a worktree (isolation is structural) or if the tree is clean.

0.3. **Pre-flight: two-party test coverage** — If the spec references `/live`, `clarity_sessions`, `session_code`, `joiner`, or `LiveMeeting`, run `grep -rl 'p{N}\|{feature-keyword}' e2e/` (substituting the actual P-number and a feature-specific keyword) and verify at least one test file exercises *this feature's* code path. A generic two-party helper match (e.g., `test-realtime.ts`) does not count — look for the P-number or feature name. If none exists, add a two-party E2E test to the implementation plan. *Rationale: P495 shipped a bug where the RPC call was inside an early-returning function — no two-party test existed to catch it.*

0.4. **Mark in-progress** — If a P-number spec was provided, update `status: in-progress` in frontmatter (skip silently if inline description mode)
1. **Read tests** — UAT scenarios, E2E test stubs, acceptance criteria
1.5. **Read Component Strategy** — If spec has `## Component Strategy`, read the Component Map table. Every Reuse/Extend/Extract/New classification is a constraint — follow it. Do not create new components when the map says Reuse or Extend. If the Extraction Plan lists a prerequisite refactor, do it first.
2. **Verify context** — Confirm Step -1 context is loaded (re-read spec if post-compaction or if >10 tool calls since Step -1). Key check: can you state (a) the top constraint from Decisions, (b) what "done" looks like from Acceptance Criteria, and (c) the next unchecked task? If not, re-read now. Every decision is a constraint, not a suggestion — if you can't name what the spec rules out, you haven't internalized it.
3. **Implement** — Feature code + fill in test stubs
4. **Run tests** — Execute test suite, check results
5. **Iterate** — Fix code until ALL tests pass (max 5 attempts)
6. **Skeptic check** — What could break? What did I assume?
7. **Mark** — Change `[ ]` to `[x]` after task passes
8. **Check** — Run `./scripts/pre-commit-checks.sh`
8.5. **Spec fidelity check (mandatory for UI features)** — If `.tsx` files were modified AND the spec has a `## UI Contract` section:
   a. Read the UI Contract table from the spec
   b. Spawn a SEPARATE subagent with ONLY the UI Contract table + the code diff (not implementation rationale). Prompt: "For each row in this UI Contract, verify the exact value exists in the code diff. Report PASS/FAIL per row with the line of code where found or 'NOT FOUND'."
   c. Any FAIL → fix the code, re-run check. Max 3 iterations.
   d. Skip this step if no `## UI Contract` section exists (non-UI features, older specs).
8.9. **Verification toll gate (HARD GATE)** — Before committing, paste proof the change works:
   - **Logic/data change:** paste `npm test` output showing relevant tests green
   - **UI change:** take a screenshot or run visual QA subagent
   - **DB/migration change:** paste query result confirming schema/data is correct
   - **Config/infra change:** paste command output confirming the change took effect
   - "It should work because [reasoning]" is NOT evidence. Run it and paste the result.
9. **Commit** — Only if ALL tests pass AND verification evidence is produced
9.5. **Review** — Spawn `/review-all` as a subagent with this explicit instruction: "Review all changes on this branch vs main. Spec: [current spec path]. Do NOT pause for scope selection — proceed directly with scope = all changes vs main." Present HIGH/MEDIUM findings to user. Ask: "Fix issues before closing? (all HIGH / select / skip)". Apply approved fixes and commit them.
9.7. **Pre-deploy checklist** — If spec has a `## Pre-deploy Checklist` section, execute each item on the target environment now. Verify edge functions are deployed, secrets are set, and migrations are applied — don't defer to `/ship`. Report what was provisioned.
9.8. **Prod verification (optional)** — After deploy, if the feature touches DB/auth/edge functions, run a Playwright prod verification test using `e2e-agent@claritypledge.com`. See `e2e/verify-prod-agreements.spec.ts` as template. Command: `VERIFY_PROD=1 PROD_SERVICE_ROLE_KEY="<srk>" npx playwright test e2e/verify-prod-<feature>.spec.ts`
10. **UAT gate** — Set `delivery_stage: uat` in spec frontmatter (keep `status: in-progress`, do NOT move to `features/done/`). Tell user: "Feature ready for UAT on branch feature/pN-xxx. Suggest: run `/verify pN` for live UAT, then `/ship pN` when satisfied."

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
- **Establish page state before asserting** — After `page.goto()`, check which tab, panel, or step the page defaults to. If your assertion targets a non-default state (e.g., a secondary tab), navigate there explicitly first. Never assume the default UI state matches what you need to test.

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
- Reads feature spec (business + UX + technical) — **copy enumerated values verbatim**: any phase name, enum value, or string literal in the spec (e.g., `'polish'`, `'visibility'`, `delivery_stage: uat`) must be transcribed exactly. Do not substitute synonyms.
- Reads UAT scenarios (features/uat/pN.md)
- Reads E2E test stubs (e2e/pN-*.spec.ts)
- Reads acceptance criteria
- **Two-party check (step 0.3):** If spec references `/live`, `clarity_sessions`, `session_code`, `joiner`, or `LiveMeeting` — verify a feature-specific two-party test exists before implementing. See Workflow step 0.3.

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

Feature ready for UAT — delivery_stage: uat set in spec.
Branch: feature/pN-xxx
Run /verify pN for live UAT, then /ship pN when satisfied → merges to prod and closes the spec.
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

## Feature UAT Gate

After successful commit, mark the feature ready for UAT — do NOT move to `features/done/` yet.

1. Mark all `## Acceptance Criteria` checkboxes `[x]` in the spec file.
2. **Determine test URL:** Run `pwd` to identify worktree slot. Look up port from `docs/technical/worktree-setup.md` (w0=5001, w1=5100, w2=5200, etc.). If on main (w0), port is 5001.
3. **If `*.tsx` files changed: Auto-run visual verification** (do not ask — just do it).
   - **Pre-check:** Run `mcp__claude-in-chrome__tabs_context_mcp` to verify Chrome MCP is available. If it errors → skip to fallback immediately (don't spawn).
   - Take screenshots of the affected pages at desktop and 390px mobile widths
   - Read the visual QA checklist from `.claude/rules/visual-qa.md`
   - **Spawn a SEPARATE visual QA subagent** (anti-confirmation-bias: it must NOT see the spec or code diff):
     ```
     You are a visual QA reviewer. You succeed by FINDING problems, not confirming quality.

     Here are screenshots of a feature at http://localhost:{port}/{relevant-path}.
     {attach all screenshots taken above}

     Apply this visual QA checklist to every screenshot:
     {inlined visual-qa.md checklist}

     Return exactly one of:
     - PASS: no visual issues found. List what you checked.
     - FAIL: list each issue found (overflow, clipping, spacing, contrast, etc.) with which screenshot.
     ```
   - If subagent returns **PASS**: proceed to step 4
   - If subagent returns **FAIL**: report findings to the user. Tell them: "Visual QA found issues — fix them and re-run `/dev`, or run `/verify` for full UAT." Do NOT proceed to step 4.
   - **Fallback** (Chrome MCP unavailable): tell user "Chrome unavailable — run `/verify` manually for visual QA" and proceed to step 4.
4. Update frontmatter: `delivery_stage: uat` (keep `status: in-progress`)
5. Commit: `chore: pN ready for UAT — {title}`
6. Run fix-kanban: Invoke `/slava:maintain:fix-kanban`
7. Tell user: "Feature ready for UAT on branch `feature/pN-xxx` at **http://localhost:{port}/**. Visual QA: {✅ passed / ⚠️ issues found — see above / ⏭️ skipped (Chrome unavailable)}. Run `/verify pN` for live UAT, then `/ship pN` when satisfied to merge to prod and close the spec."

**Do NOT:**
- Move spec to `features/done/` — that happens in `/ship`
- Set `status: done` — that happens in `/ship`
- Deploy to prod — that happens in `/ship`

If no spec file exists (inline description mode), skip the UAT gate silently.

---

## Related

- `/slava:ux` — User experience review
- `/slava:lean` — Challenge scope, find the MVP
- `/slava:build:generate-uat` — Generate UAT scenarios and E2E test stubs
