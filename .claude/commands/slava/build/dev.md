---
name: dev
description: Execute a development task with TDD discipline and production thinking
when_to_use: "After spec exists (/create-spec, /architect done). Triggered by /dev."
version: 2.0.0
---

# /dev

Execute a development task with TDD discipline and production thinking.

> **Principle:** Write code you'd be proud to debug at 3am. Today's shortcut is tomorrow's incident.

## Orchestrator Mode (when task manifest exists)

If the spec contains `## Implementation Tasks`, /dev operates as an orchestrator:

1. Read ONLY the `## Implementation Tasks` section (not the full spec)
2. Find all unchecked tasks: `- [ ] Complete`
3. For each unchecked task in dependency order:
   a. Spawn a subagent (`model: "sonnet"`) with: task title + files list + spec refs (read only those lines from the spec, not the full file)
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

After worktree setup (so CWD resolves to the correct branch):
1. Read the full spec file (`features/pN*.md`) — Decisions section first, then Acceptance Criteria, then tasks
2. If spec has `type: change-request` and `changes: pN` in frontmatter: also read the predecessor spec at `features/done/**/pN_*.md` (or `features/pN_*.md` if not yet shipped). Report: "Reading predecessor P{N} for context: {path}". If predecessor not found, warn but don't block.
3. If spec references DB columns/tables: verify they exist (`curl` the REST API or check migration files)
4. If spec has mixed `[x]`/`[ ]` acceptance criteria (rewritten matryoshka bug): announce which layers are done and which remain. Focus implementation on unchecked items only.

**Why this runs after worktree setup:** The spec on the feature branch may differ from main (e.g., rewritten matryoshka bugs). Reading before worktree setup reads the stale main copy. This step costs 10 seconds and prevents 30-minute wrong-direction implementations.

Skip if no spec exists (inline description mode like `/dev refactor the auth module`).

---

## Workflow

0. **Pre-flight: branch lineage check** — Before any branching or worktree creation:

   **Branch lineage check:**
   Run `git rev-list --count main..HEAD`. If >5 commits ahead of main:
   - WARN: "Current branch is N commits ahead of main. /ship would merge all of them."
   - Offer: A) Branch from main instead (recommended), B) Cherry-pick after implementation, C) Proceed knowingly

0. **Pre-flight: is this spec's deliverable SKILL FILES? Then stay on main — do not create a worktree.**

   Run this **before** the worktree step, not after:
   ```bash
   # Prompt to LOOK — not a verdict. Read each hit in context.
   grep -nE '\.claude/commands/|SKILL\.md|^\*\*[0-9]+\. New `/' features/p${N}*.md | head
   ```
   **A hit is not the answer — read the hits.** Measured 2026-08-14: this pattern fires on 8 of 105 open specs, and the three inspected were all *incidental* mentions — a data-ordering bug quoting a skill doc's claim, a security audit tabulating files, a spec about a stamp path. Acting on the match alone would push **product code** onto main with no worktree, which is worse than the problem this check solves.

   The question is what the spec makes you **write**, not what it mentions: *"when I finish, which files are modified?"* Skill files (`.claude/commands/slava/**/*.md`) → work on `main`, skip step 0 below entirely. Anything else → worktree as normal, even if the spec quotes a skill path on every page.

   **Two independent reasons, and the second one fails silently:**

   1. `.claude/rules/skills.md` — Branch Guard: skill files must be committed on `main`. A skill fix on a feature branch is stranded.
   2. **The skills you edit in a worktree are not the skills that run.** A Claude Code session resolves `/command` from the project root it was launched in — the main checkout. Edit `/weekly` in `w3`, then invoke `/weekly` to test it, and you have just exercised the *old* copy on `main` while believing you tested the new one. Any AC of the form "run the skill and paste the output" silently produces a false pass.

   > **Why this check has to live here rather than in the rules file.** `.claude/rules/skills.md` is path-triggered on `.claude/commands/slava/**`, so it loads when an agent *edits* a skill — which is **after** the worktree already exists. It structurally cannot fire in time to prevent the worktree. Observed on P1081 (2026-08-14): a worktree was claimed, two files written, then torn down and re-applied to main once the conflict surfaced. This is the routing-time form of decisions.md 2026-08-07 — *a rule must live where it can fire.*

   Mixed specs (product code **and** skill files) are the one judgment call: worktree the code, and land the skill files on main as a separate commit following the Branch Guard's wip-commit pattern. Say which you are doing before you start.

0. **Pre-flight: worktree setup** — If this is a P-number feature AND current branch is `main`:

   **First: check if a worktree is already on this feature's BRANCH.**
   ```bash
   for wt in .claude/worktrees/w*/; do
     br=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null)
     case "$br" in
       feature/p${N}-*|feature/p${N}_*|fix/p${N}-*|fix/p${N}_*)
         cd "$wt"
         echo "Entering existing worktree $wt — on branch $br."
         break ;;
     esac
   done
   ```
   If a worktree is on this feature's branch, enter it instead of creating a new one. The feature branch copy is always >= main in freshness (see `.claude/rules/features.md` — Spec Location).

   > **Match the BRANCH, never the spec file.** An earlier version of this step tested `ls "$wt"/features/p${N}_*.md` — which matches in **every** worktree, because every checkout contains every spec committed to main. It therefore selected whichever slot happened to sort first and reported "spec found here" with full confidence. Observed twice on 2026-08-09/10: it pointed at a co-tenant's slot mid-way through an unrelated feature, and following it would have committed one feature's code onto another feature's branch — a violation the one-worktree=one-branch guard cannot catch, because from inside the worktree the commit looks legitimate. A spec file proves nothing about a worktree; the branch is the only thing that identifies it.

   **If no worktree has the spec, create one via `git-ops.sh claim`:**
   ```bash
   eval "$(./scripts/git-ops.sh claim pN short-description 2>/tmp/claim-stderr.log | \
           sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
   cat /tmp/claim-stderr.log  # human summary
   # Exports CP_LOCK_NONCE_wN; worktree+branch+lockfile created atomically
   ```
   Report: "Created worktree {slot} on branch feature/pN-... (lockfile acquired)."

   **Exception — skip worktree if ALL of these are true:** (a) task is a trivial single-file fix (typo, copy change, config tweak), (b) no other features are in progress on the index, (c) user explicitly says "just do it inline." In that case, proceed on main for skill/docs edits, or use `git-ops.sh claim` for a minimal branch scope.

   Skip entirely if already in a worktree on the correct feature branch, or if task is not a P-number feature (infra, docs).

0.0.5. **Pre-flight check** — after worktree creation, run:
   ```bash
   ./scripts/pre-flight.sh dev --spec pN
   ```
   If pre-flight fails, stop and report. Fix before proceeding.

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

0.4. **Pipeline stamp (P659)** — If a P-number spec was provided (skip silently if inline description mode):
   1. Read spec frontmatter
   2. Set `delivery_stage: dev` and `status: in-progress`
   3. Append `dev` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, dev]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [dev]`. Always inline format.
   4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `dev` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
   5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"
1. **Read tests** — UAT scenarios, E2E test stubs, acceptance criteria
1.5. **Read Component Strategy** — If spec has `## Component Strategy`, read the Component Map table. Every Reuse/Extend/Extract/New classification is a constraint — follow it. Do not create new components when the map says Reuse or Extend. If the Extraction Plan lists a prerequisite refactor, do it first.
1.6. **Read view_locked** — If spec frontmatter has `view_locked: [path1, path2, ...]`, treat each path as read-only for the remainder of this run. Paths are literal strings resolved relative to the repo root — do NOT interpret them as globs or regex. Reject any entry containing `..`, starting with `/`, or otherwise escaping the repo root (mistyped entries must fail loudly, not silently disable the guard). Before any Write or Edit call, normalize the target file path (repo-root-relative) and check literal equality against every view_locked entry. If a write to a locked path is attempted, STOP and report: "Attempted to edit locked view file {path}. /view owns this file. Options: (A) re-run /view to update the view, (B) remove path from view_locked if ownership has changed, (C) edit a different file." Continue only after founder confirms. If view_locked is absent, proceed with current behavior (backward-compatible).
2. **Verify context** — Confirm Step -1 context is loaded (re-read spec if post-compaction or if >10 tool calls since Step -1). Key check: can you state (a) the top constraint from Decisions, (b) what "done" looks like from Acceptance Criteria, and (c) the next unchecked task? If not, re-read now. Every decision is a constraint, not a suggestion — if you can't name what the spec rules out, you haven't internalized it.
3. **Implement** — Feature code + fill in test stubs. **For UI features (.tsx changes):** get tests passing before applying visual refinement (spacing, shadows, animation). Don't polish a broken feature.
3.5. **Adjacent bug rule** — If you discover a bug OUTSIDE this feature's acceptance criteria (e.g., a pre-existing bug in a shared function), do NOT fix it inline. Call `/fix "description"` — it will auto-file a `/create-bug` spec and proceed with TDD (canary test → fix → verify). Bugs INSIDE this feature's acceptance criteria are covered by this feature's own tests.
4. **Run tests** — Execute test suite, check results
5. **Iterate** — Fix code until ALL tests pass (max 5 attempts)
6. **Skeptic check** — What could break? What did I assume?
7. **Mark** — Change `[ ]` to `[x]` after task passes
8. **Check** — Run `./scripts/pre-commit-checks.sh`
8.5. **Spec fidelity check (mandatory for UI features)** — If `.tsx` files were modified AND the spec has a `## UI Contract` section:
   a. Read the UI Contract table from the spec
   b. Spawn a SEPARATE subagent (`model: "sonnet"`) with ONLY the UI Contract table + the code diff (not implementation rationale). Prompt: "For each row in this UI Contract, verify the exact value exists in the code diff. Report PASS/FAIL per row with the line of code where found or 'NOT FOUND'."
   c. Any FAIL → fix the code, re-run check. Max 3 iterations.
   d. Skip this step if no `## UI Contract` section exists (non-UI features, older specs).
8.9. **Verification toll gate (HARD GATE)** — Before committing, paste proof the change works:
   - **Logic/data change:** paste `npm test` output showing relevant tests green
   - **UI change (.tsx):** the **p955-gate** deterministic DOM checks must PASS — these BLOCK the commit (run by pre-commit, Chrome-independent via vitest+jsdom). The screenshot / visual QA subagent is the *perceptual* layer on top — surfaced, never blocking.
   - **DB/migration change:** paste query result confirming schema/data is correct
   - **Config/infra change:** paste command output confirming the change took effect
   - "It should work because [reasoning]" is NOT evidence. Run it and paste the result.
9. **Commit** — Only if ALL tests pass AND verification evidence is produced
9.5. **Review** — Spawn `/finish code` as a subagent (`model: "sonnet"`) with this explicit instruction: "Review all code changes on this branch vs main. Spec: [current spec path]. Proceed directly — no scope confirmation needed. End your response with a summary line in this exact format: `Found: N HIGH, M MEDIUM issues.` (substitute actual integers; exclude LOW). The caller needs these counts for the review stamp." Present HIGH/MEDIUM findings to user. Ask: "Fix issues before closing? (all HIGH / select / skip)". Apply approved fixes and commit them.

9.5a. **Write review stamp** — after the approval gate in 9.5 completes (whether user chose all HIGH / select / skip), append one JSON line to the shared `.finish-reviewed` stamp at `<git-common-dir>/.finish-reviewed` (resolves to the main repo from any worktree, mirroring `.privacy-reviewed`, P950/P1002):
   ```bash
   # Set FOUND = HIGH+MEDIUM count from subagent summary line (exclude LOW).
   # Set FIXED = count of issues user approved for fixing (0 if "skip").
   FOUND=3; FIXED=2  # ← replace these integers with the actual counts before running
   GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
   BRANCH="$(git rev-parse --abbrev-ref HEAD)"
   echo "{\"type\":\"code\",\"branch\":\"$BRANCH\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"issues_found\":$FOUND,\"issues_fixed\":$FIXED}" >> "$GIT_COMMON_DIR/.finish-reviewed"
   ```
   The stamp resolves to the same file whether written from a worktree or the main repo, so it can never disagree with what `/ship` gate 2.7 reads. The `branch` field lets the gate distinguish this branch's review from a concurrent worktree's review of an unrelated feature (P1002).
9.6. **Proto route cleanup** — If spec frontmatter has `view_locked`, the `/view` skill added a preview route and a static import to `src/App.tsx`. After integration (when the view component is wired into real containers), remove: (1) the `import {FeatureName}Demo from './components/_proto/{feature}-view.demo'` line, (2) the `{import.meta.env.DEV && <Route path="/tree/{feature}" .../>}` route entry. Also remove `view_locked` from spec frontmatter — it served its purpose. Skip if `view_locked` is absent.
9.7. **Pre-deploy checklist** — If spec has a `## Pre-deploy Checklist` section, execute each item on the target environment now. Verify edge functions are deployed, secrets are set, and migrations are applied — don't defer to `/ship`. Report what was provisioned.
9.8. **Prod verification (optional)** — After deploy, if the feature touches DB/auth/edge functions, run a Playwright prod verification test using `e2e-agent@claritypledge.com`. See `e2e/verify-prod-agreements.spec.ts` as template. Command: `VERIFY_PROD=1 PROD_SERVICE_ROLE_KEY="<srk>" npx playwright test e2e/verify-prod-<feature>.spec.ts`
9.9. **Untracked test file check** — Run `git status --short | grep "^?? e2e/p${N}"` (substituting the actual P-number). If any `e2e/pN-*.spec.ts` files appear as untracked (`??`), inspect them: if they test a rejected design or have broken setup, fix or delete before declaring done. An untracked test file is invisible to CI and strands work that looks complete but isn't.
10. **UAT gate** — Keep `status: in-progress` and existing `delivery_stage: dev` (already set by pipeline stamp on entry — do NOT set delivery_stage again). Do NOT move to `features/done/`. Tell user: "Feature ready for UAT on branch feature/pN-xxx. Suggest: run `/verify pN` for live UAT, then `/ship pN` when satisfied."

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

**0. Pipeline stamp (if P-number provided):**
- Apply pipeline stamp (P659) from Workflow step 0.4 — sets `delivery_stage: dev`, `status: in-progress`, appends to `pipeline_ran`, checks predecessor
- Report: "Marked pN as in-progress in kanban."
- Skip silently if no feature file (inline description mode)

**1. Pre-flight checks:**
- Reads feature spec (business + UX + technical) — **copy enumerated values verbatim**: any phase name, enum value, or string literal in the spec (e.g., `'polish'`, `'visibility'`, `delivery_stage: dev`) must be transcribed exactly. Do not substitute synonyms.
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
4. If UI modified → suggests running /finish
5. Reports results to user with clear pass/fail status

**Never skip verification:** The agent MUST verify all criteria before returning. Partial completion is not allowed - iterate until all checks pass.

**Self-review checklist:**
- [ ] Feature code implements all acceptance criteria
- [ ] E2E test stubs filled in (no TODOs left)
- [ ] All tests pass (unit + E2E)
- [ ] No console errors
- [ ] Code follows style guide
- [ ] Pre-commit checks pass
- [ ] No locked view files modified (if view_locked present in spec)

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
  - Agent suggests: "UI files were modified. Run /finish before marking done to verify UI compliance (buttons, colors, accessibility)? (y/n)"
  - If user approves → run /finish
- [ ] If UI feature: No console errors in browser
- [ ] If API changes: No breaking changes to existing endpoints (or documented as breaking)

**Output to user:**
```
✅ All tests passing
✅ Acceptance criteria verified
✅ No regressions detected

Running /finish...
[Review findings presented — HIGH/MEDIUM/LOW]
Fix issues before closing? (all HIGH / select / skip)

Feature ready for UAT — delivery_stage: dev set in spec.
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
    Recommend /finish.
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
    Recommend /finish.
    Run now? (y/n)

Feature implementation complete.
```

---

## Feature UAT Gate

After successful commit, mark the feature ready for UAT — do NOT move to `features/done/` yet.

1. **AC completeness check:** Review each `## Acceptance Criteria` checkbox. Only mark `[x]` for items you actually implemented and verified in this run. If any items remain `[ ]` (e.g., layers not yet fixed in a matryoshka spec), do NOT set `status: qa`. Report: "Cannot mark as ready — {N} acceptance criteria still unchecked: {list}."
2. **Determine test URL:** Run `pwd` to identify worktree slot. Look up port from `docs/technical/worktree-setup.md` (w0=5001, w1=5100, w2=5200, etc.). If on main (w0), port is 5001.
3. **If `*.tsx` files changed: Auto-run visual verification** (do not ask — just do it).
   - **Pre-check:** Run `mcp__claude-in-chrome__tabs_context_mcp` to verify Chrome MCP is available. If it errors → skip to fallback immediately (don't spawn).
   - Take screenshots at 3 viewports: desktop (1280px), tablet (768px), mobile (390px)
   - Read the visual QA checklist from `.claude/rules/visual-qa.md`
   - **Check for Visual Specification:** If spec has `## Component Strategy` with a Visual Specification subsection, read it. This provides design intent (hierarchy, register, spacing, animation) that the QA subagent should evaluate against.
   - **Spawn a SEPARATE visual QA subagent (`model: "sonnet"`)** (anti-confirmation-bias: it must NOT see the code diff):
     ```
     You are a visual QA reviewer. You succeed by FINDING problems, not confirming quality.

     Here are screenshots of a feature at http://localhost:{port}/{relevant-path}
     at 3 viewports (desktop 1280px, tablet 768px, mobile 390px).
     {attach all screenshots taken above}

     ## Defect checklist
     Apply this visual QA checklist to every screenshot:
     {inlined visual-qa.md checklist}

     ## Design quality evaluation (only if Visual Specification provided)
     {if Visual Specification exists, inline it here; otherwise omit this section entirely}

     If a Visual Specification is provided, also evaluate:
     - Does the visual hierarchy guide the eye to the primary action as specified?
     - Does information density match the stated density intent?
     - Does the component's visual weight match adjacent pages (if visual reference was given)?
     - Are the specified Tailwind classes for spacing/animation consistent with what's rendered?

     Return exactly one of:
     - PASS: no visual issues found. List what you checked.
     - FAIL: list each issue found with which screenshot and viewport.
       For defect issues: overflow, clipping, spacing, contrast, etc.
       For design issues (if Visual Specification was provided): hierarchy mismatch, density mismatch, etc.
     ```
   - If subagent returns **PASS**: proceed to step 4
   - If subagent returns **FAIL with defect issues**: fix them, re-screenshot, re-run QA subagent (1 retry max). If still failing after retry, report to user: "Visual QA issues persist after 1 fix cycle — run `/verify` for full UAT."
   - If subagent returns **FAIL with design-quality issues only**: these are *perceptual* (hierarchy / density / visual-weight). Surface them to the user and recommend `/verify` for design review. The perceptual layer is surfaced, never blocking — the blocking checks are the deterministic **p955-gate** at pre-commit (separate, already ran).
   - **Fallback** (Chrome MCP unavailable): the deterministic **p955-gate** already ran at pre-commit (Chrome-independent vitest+jsdom) and BLOCKS independently of this step. Only the *perceptual* pass is deferred — log `chrome-unavailable: deferred` and tell the user to run `/verify` for perceptual visual QA. Continue to the next step.
4. Keep existing `delivery_stage: dev` and `status: in-progress` (already set by pipeline stamp on entry)
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
