---
name: refactor
description: Post-implementation quality improvement with rigorous test-driven safety
when_to_use: "After shipping when code needs cleanup. Triggered by /refactor."
version: 1.0.0
---

# /refactor

Post-implementation quality improvement with rigorous test-driven safety.

> **Principle:** Refactoring without tests is rewriting. Tests are the safety net that proves behavior is preserved.

## Usage

**Standard mode (after implementation):**
```bash
/refactor features/p99.md           # Refactor implemented feature
/refactor src/components/Auth.tsx   # Refactor specific file
```

**When to use:**
- ✅ After `/dev` completes and all tests pass
- ✅ When code works but quality can improve
- ✅ Iteratively - can be run multiple times on same feature

**When NOT to use:**
- ❌ Before implementation is complete
- ❌ When existing tests are failing
- ❌ As part of bug fixes (fix first, refactor separately)

---

## How to Think

Refactoring is not about rewriting code — it's about improving clarity, maintainability, and performance while PROVING behavior is unchanged.

**Three lenses to apply constantly:**

### The Safety Lens
> "How do I prove this refactor doesn't break anything?"

- Tests are the contract. They must pass before, during, and after refactoring.
- If tests fail after refactor, revert immediately and try different approach.
- No test coverage? Add tests FIRST, then refactor.
- Every refactor step must be verifiable — small changes, frequent test runs.

### The Clarity Lens
> "Will this be easier to understand in 6 months?"

- Code is read 10x more than written. Optimize for reading, not writing.
- Names should reveal intent. If you need a comment to explain, rename instead.
- Simpler is better. If refactor adds complexity, question if it's worth it.
- Patterns should reduce cognitive load, not increase it.

### The Restraint Lens
> "Is this refactor worth the risk?"

- Perfect is the enemy of done. Working code has value.
- Minimal changes = minimal risk. Don't refactor what doesn't need it.
- Big refactors = big risk. Break into small, verifiable steps.
- If tempted to "fix everything" — stop. Focus on highest-impact improvements.

**Apply all three before changing ANY line of code.**

---

## When to Use

✅ **Use /refactor for:**
- Improving clarity (better names, simpler logic, clearer structure)
- Reducing duplication (extract common patterns)
- Enhancing maintainability (modular code, separation of concerns)
- Performance optimization (with proof via tests or profiling)
- After implementation completes and tests pass

❌ **Don't use /refactor for:**
- Bug fixes (use `/fix` instead — fix first, refactor separately)
- Adding features (use `/dev` — refactor after feature works)
- When tests are failing (fix tests first)
- "Just because" refactors (must have clear improvement goal)

**Relationship to other skills:**
```
Implementation flow:
/dev → All tests pass → feature auto-closed → /refactor (optional code cleanup)

Bug fix flow:
/fix → All tests pass → feature auto-closed → /refactor (optional, if needed)

Never:
/dev (tests failing) → /refactor ❌
/fix + /refactor (combined) ❌
```

---

## Phase -1: Context Load (NEVER SKIP when refactoring a P-number feature)

Before running tests or changing code:
1. If refactoring a feature (P-number): read the spec — understand constraints and decisions that shaped the current code
2. Read `git log --oneline -10 -- <files>` for the files you'll refactor — don't undo intentional patterns from recent work
3. `git status --short` — verify the working tree state matches what you expect

**Why this is Phase -1:** Refactoring often happens in a later session than implementation. The original decisions and constraints may not be in context.

---

## Workflow

### Phase 0: Pre-Flight Safety Check

**Goal:** Establish baseline — all tests MUST pass before any refactoring

**Steps:**
1. Run full test suite: `npm test && npm run test:e2e`
2. Verify ALL tests pass (no failures, no skipped tests)
3. Document baseline: "X/X tests passing"
4. If ANY tests fail → STOP, fix tests first, then refactor

**Output:**
```
Pre-flight check:
✅ Unit tests: 248/248 passing
✅ E2E tests: 42/42 passing
✅ Smoke tests: 8/8 passing

Baseline established. Safe to refactor.
```

**If tests fail:**
```
❌ Pre-flight check failed:
   Unit tests: 246/248 passing (2 failures)

Cannot refactor with failing tests.
Fix tests first, then re-run /refactor.
```

**CRITICAL:** Do NOT proceed to Phase 1 if ANY tests fail.

---

### Phase 1: Read Implemented Code

**Goal:** Understand current implementation before changing it

**Steps:**
1. Read feature spec (understand business requirements)
2. Read implementation files (feature code + tests)
3. Identify refactoring opportunities:
   - Clarity improvements (confusing names, complex logic)
   - Duplication (repeated patterns)
   - Performance bottlenecks (if measurable)
   - Maintainability issues (tight coupling, mixed concerns)
4. Prioritize improvements by impact vs risk

**Output:**
```
Code review complete:
- Files: src/app/auth/login.tsx, src/lib/auth.ts
- Test coverage: 3 E2E tests, 5 unit tests

Refactoring opportunities identified:
1. HIGH IMPACT: Extract validation logic (duplicated 3x)
2. MEDIUM IMPACT: Rename ambiguous variable names (x, temp, data)
3. LOW IMPACT: Add JSDoc comments for public functions

Starting with HIGH impact improvements.
```

**Prioritization criteria:**
- HIGH: Clarity issues that affect understanding or maintenance
- MEDIUM: Improvements that reduce duplication or complexity
- LOW: Nice-to-haves that don't significantly impact quality

---

### Phase 2: Add Comprehensive Tests

**Goal:** Ensure test coverage is sufficient to catch regressions during refactoring

**Steps:**
1. Review existing test coverage
2. Identify gaps:
   - Edge cases not covered
   - Error conditions not tested
   - Boundary conditions not verified
3. Add missing tests (write tests that pass with current implementation)
4. Run new tests → ALL must pass before refactoring
5. Document test additions

**Example test additions:**
```typescript
// BEFORE refactoring: Add edge case tests

test('should handle empty input gracefully', async () => {
  const result = validateEmail('');
  expect(result.isValid).toBe(false);
  expect(result.error).toBe('Email is required');
});

test('should handle null gracefully', async () => {
  const result = validateEmail(null);
  expect(result.isValid).toBe(false);
  expect(result.error).toBe('Email is required');
});

test('should trim whitespace before validation', async () => {
  const result = validateEmail('  test@example.com  ');
  expect(result.isValid).toBe(true);
  expect(result.value).toBe('test@example.com'); // trimmed
});
```

**Output:**
```
Test coverage analysis:
- Existing: 3 E2E tests, 5 unit tests
- Gaps identified: Edge cases (empty/null), boundary conditions

New tests added:
- test: Empty input handling
- test: Null input handling
- test: Whitespace trimming
- test: Max length boundary

Running new tests...
✅ All new tests pass (8/8)

Test safety net complete. Ready to refactor.
```

**CRITICAL:** Do NOT refactor until all new tests pass.

---

### Phase 3: Refactor for Quality

**Goal:** Improve code quality without breaking functionality

**Steps:**
1. Make ONE small change at a time
2. Run tests after EACH change
3. If tests fail → revert immediately, try different approach
4. Document each refactor step
5. Iterate until quality goals achieved

**Refactoring strategies (in order of safety):**

**1. SAFEST: Rename (variables, functions, types)**
```typescript
// Before: Unclear names
function processData(x: any) {
  const temp = x.value;
  return temp * 2;
}

// After: Clear intent
function doubleScore(userResponse: Response): number {
  const score = userResponse.value;
  return score * 2;
}
```

**2. SAFE: Extract function/component**
```typescript
// Before: Inline duplication
if (!email || !email.includes('@') || email.length > 255) {
  throw new Error('Invalid email');
}
// ... same check repeated 3x elsewhere

// After: Extract + reuse
function validateEmail(email: string): void {
  if (!email || !email.includes('@') || email.length > 255) {
    throw new Error('Invalid email');
  }
}
```

**3. MODERATE: Simplify logic**
```typescript
// Before: Nested conditionals
function canSubmit(user, form) {
  if (user) {
    if (user.isActive) {
      if (form.isValid) {
        if (form.isDirty) {
          return true;
        }
      }
    }
  }
  return false;
}

// After: Guard clauses
function canSubmit(user, form) {
  if (!user?.isActive) return false;
  if (!form.isValid) return false;
  if (!form.isDirty) return false;
  return true;
}
```

**4. RISKY: Restructure (change flow/architecture)**
- Only if necessary
- Smallest possible changes
- Test after every micro-step
- Consider if risk is worth reward

**Output after each step:**
```
Refactor Step 1: Rename 'processData' → 'doubleScore'
- Changed: src/lib/scoring.ts (lines 42-45)
- Running tests...
- ✅ Tests pass (256/256)

Refactor Step 2: Extract validation to validateEmail()
- Changed: src/lib/auth.ts (extracted function)
- Changed: src/app/login/page.tsx (uses validateEmail)
- Changed: src/app/signup/page.tsx (uses validateEmail)
- Running tests...
- ✅ Tests pass (256/256)

Refactor Step 3: Simplify canSubmit() logic
- Changed: src/components/Form.tsx (guard clauses)
- Running tests...
- ✅ Tests pass (256/256)
```

**If tests fail:**
```
Refactor Step 4: Extract API call to custom hook
- Changed: src/app/dashboard/page.tsx
- Running tests...
- ❌ Tests fail (254/256)

REVERTING: git restore src/app/dashboard/page.tsx
Analyzing failure: Hook violates rules of hooks (called conditionally)
Trying different approach: Keep inline, simplify error handling instead
```

**CRITICAL RULE:** If tests fail after a refactor step, REVERT immediately. Do not try to "fix forward."

---

### Phase 4: Verify Rigorously

**Goal:** Prove that refactoring preserved all behavior

**Verification checklist:**
- [ ] All new tests pass (edge cases covered)
- [ ] All existing tests pass (no regressions)
- [ ] Smoke tests pass (fast sanity check)
- [ ] No console errors (if UI changes)
- [ ] Code quality improved (measurably clearer/simpler)
- [ ] For P0/P1 features: Recommend manual smoke test

**Steps:**
1. Run full test suite: `npm test && npm run test:e2e`
2. Compare results to baseline (Phase 0)
3. Verify ALL tests still pass
4. Run smoke tests for fast sanity check
5. For critical features (P0/P1): Recommend manual verification

**Output:**
```
Verification complete:

Baseline (before refactor):
- Unit tests: 248/248 passing
- E2E tests: 42/42 passing
- Smoke tests: 8/8 passing

Current (after refactor):
- Unit tests: 256/256 passing (+8 new edge case tests)
- E2E tests: 42/42 passing
- Smoke tests: 8/8 passing

✅ All tests pass
✅ No regressions introduced
✅ Test coverage improved (+8 tests)

Code quality improvements:
- Extracted 3 duplicated validation functions
- Renamed 12 ambiguous variables
- Simplified 4 complex conditionals
- Reduced cyclomatic complexity: 45 → 28

[Feature is P0/P1]
⚠️  RECOMMENDATION: This is a P0 feature (login flow)
    Suggest manual smoke test:
    1. Open /login in browser
    2. Enter valid credentials
    3. Verify redirect to /dashboard
    4. Enter invalid credentials
    5. Verify error message displays

Refactoring complete. All tests pass.
```

**If verification fails:**
```
❌ Verification failed:
   Unit tests: 254/256 passing (2 regressions)
   Failures:
   - test: "should handle empty email" - Expected error, got undefined
   - test: "should trim whitespace" - Expected trimmed, got untrimmed

REVERTING: All changes since last passing state
Analyzing root cause...
```

**CRITICAL:** Only mark refactoring complete when ALL tests pass.

---

### Phase 5: Iterate Until Perfect

**Goal:** Achieve quality goals without compromising safety

**Iteration strategies:**

**1. If tests fail after refactor:**
- Revert immediately (git restore or git reset)
- Analyze WHY tests failed (logic error? test error?)
- Try smaller change (break refactor into micro-steps)
- Re-run tests after each micro-step

**2. If quality goals not met:**
- Identify next highest-impact improvement
- Apply same workflow (refactor → test → verify)
- Iterate until satisfied or risk exceeds reward

**3. If stuck after 3 attempts:**
- Stop and assess: Is this refactor worth the risk?
- Present options to user:
  - A) Accept current state (good enough)
  - B) Try different refactoring approach
  - C) Defer refactor (mark as tech debt)

**Example iteration:**
```
Iteration 1: Extract validation logic
- Changed: 3 files
- Tests: ❌ 254/256 passing
- Action: REVERT

Iteration 2: Extract validation logic (smaller scope)
- Changed: 1 file only
- Tests: ✅ 256/256 passing
- Action: COMMIT

Iteration 3: Extract remaining validations
- Changed: 2 more files
- Tests: ✅ 256/256 passing
- Action: COMMIT

Iteration 4: Rename ambiguous variables
- Changed: 4 files
- Tests: ✅ 256/256 passing
- Action: COMMIT

Quality goals achieved:
✅ Validation logic centralized
✅ Variable names clarified
✅ All tests passing
✅ No regressions

Refactoring complete.
```

**Maximum iterations:** No hard limit, but if 5+ iterations fail, recommend stopping:
```
After 5 failed attempts, current approach isn't working.

Options:
A) Accept current code quality (works, tests pass, adequate)
B) Try fundamentally different refactoring approach
C) Mark as tech debt, revisit later with fresh perspective

Recommend: [Agent's recommendation based on risk/reward analysis]
```

---

## Safety Mechanisms

**Before ANY refactoring:**
- ✅ Baseline established (all tests pass)
- ✅ Test coverage verified (edge cases, errors, boundaries)

**During refactoring:**
- ✅ One small change at a time
- ✅ Run tests after EACH change
- ✅ Revert immediately if tests fail
- ✅ Document each refactor step

**After refactoring:**
- ✅ All tests pass (new + existing)
- ✅ No regressions introduced
- ✅ Code quality measurably improved
- ✅ For P0/P1: Manual smoke test recommended

**Git safety:**
```bash
# Before refactoring: Create checkpoint
git add .
git commit -m "checkpoint: before refactoring [feature]"

# After each successful refactor step: Checkpoint
git add .
git commit -m "refactor: [what changed]"

# If tests fail: Revert to last checkpoint
git reset --hard HEAD~1
```

**CRITICAL RULES:**
1. NEVER proceed with failing tests
2. ALWAYS revert if tests fail after refactor
3. NEVER skip test runs between changes
4. ALWAYS commit after successful refactor step
5. NEVER combine refactoring with bug fixes or features

---

## Completion Criteria

Before marking refactor as complete, verify:

**Required:**
- [ ] All new tests pass (edge cases covered)
- [ ] All existing tests pass (no regressions)
- [ ] Smoke tests pass (fast sanity check)
- [ ] Code quality measurably improved (clarity, duplication, complexity)
- [ ] Pre-commit checks pass
- [ ] Changes committed with clear messages

**Conditional:**
- [ ] If P0/P1 feature: Manual smoke test recommended
- [ ] If UI changes: No console errors
- [ ] If performance refactor: Benchmarks show improvement

**Output to user:**
```
✅ Refactoring complete

Baseline vs Current:
- Tests: 248/248 → 256/256 (+8 new edge case tests)
- Files changed: 4
- Lines changed: +82 -135 (net reduction: 53 lines)

Quality improvements:
- Extracted 3 validation functions (DRY)
- Renamed 12 ambiguous variables (clarity)
- Simplified 4 complex conditionals (readability)
- Cyclomatic complexity: 45 → 28 (38% reduction)

[If P0/P1]
⚠️  RECOMMENDATION: Manual smoke test suggested
    This is a P0 feature. Verify:
    1. [Step 1]
    2. [Step 2]
    3. [Step 3]

Refactoring complete.
```

**Failure handling:**
- If ANY required check fails → do NOT mark complete
- Report which check failed and why
- Iterate on refactor until all checks pass

---

## Agent Behavior

The refactor agent:

**Pre-flight:**
- Runs baseline test suite (must all pass)
- Reads implemented code (feature + tests)
- Identifies refactoring opportunities (prioritized by impact)

**Test enhancement:**
- Reviews test coverage for gaps
- Adds edge case tests (empty, null, boundaries, errors)
- Runs new tests (must all pass before refactoring)

**Refactoring:**
- Makes ONE small change at a time
- Runs tests after EACH change
- Reverts immediately if tests fail
- Documents each refactor step
- Commits after each successful step

**Verification:**
- Runs full test suite (compares to baseline)
- Verifies no regressions (all existing tests still pass)
- Measures quality improvement (complexity, duplication, clarity)
- For P0/P1: Recommends manual smoke test

**Self-review checklist:**
- [ ] Baseline established (all tests passing before refactor)
- [ ] Test coverage enhanced (edge cases, errors, boundaries)
- [ ] Each refactor step tested independently
- [ ] All tests pass after refactor (no regressions)
- [ ] Code quality measurably improved
- [ ] Changes are minimal (only what's needed)
- [ ] P0/P1 features flagged for manual verification

---

## When Stuck

If 3+ refactor attempts fail or tests keep breaking:

**1. STOP** — Don't keep trying the same approach

**2. Analyze WHY it's failing:**
```
- Read test failure messages COMPLETELY
- Identify which test failed and why
- Is it a refactoring error or test error?
- Hypothesis: "Refactor broke X because Y"
```

**3. Try smaller steps:**
```
Instead of: Refactor 3 files at once
Try: Refactor 1 file, test, then next file
```

**4. If still stuck after 5 attempts, present options:**
```
Problem: [what's blocking]

Options:
A) Accept current code quality (works, adequate, safe)
B) Try fundamentally different refactoring approach
C) Mark as tech debt (revisit later, not blocking)

Risk/Reward analysis:
- Current code: [quality assessment]
- Refactor benefit: [potential improvement]
- Refactor risk: [what could break]

Recommendation: [Agent's reasoned recommendation]
```

**5. User decides:** Accept current state, try different approach, or defer

---

## Definition of Done

**Better than before. Provably safe.**

- ALL tests pass (new + existing)
- Code quality measurably improved
- No regressions introduced
- Changes are minimal (only what's needed)
- You'd be proud to maintain this code

**CRITICAL: Do NOT mark refactor complete if ANY tests fail.**

If you're hesitating — that's a signal. Either fix what's causing it or accept current code quality.

---

## Relationship to Other Skills

**Before /refactor:**
- `/dev` - Implementation complete, all tests pass
- `/fix` - Bug fixed, all tests pass

**After /refactor:**
- `/kdd` - Capture learnings (user runs separately)

**Parallel:**
- `/finish` - If UI changes during refactor

**NEVER combine:**
- ❌ `/dev` + `/refactor` (implement first, refactor after)
- ❌ `/fix` + `/refactor` (fix first, refactor after)

---

## Output Format

```markdown
## Refactoring Complete

**Feature:** [description]

**Baseline (before refactor):**
- Unit tests: X/X passing
- E2E tests: X/X passing
- Smoke tests: X/X passing

**Current (after refactor):**
- Unit tests: X/X passing (+N new tests)
- E2E tests: X/X passing
- Smoke tests: X/X passing

**Test Evidence:**
[PASTE npm test output]
[PASTE npm run test:e2e output]

**Files Changed:**
- src/... (extracted validation logic)
- src/... (renamed variables)
- src/... (simplified conditionals)

**Quality Improvements:**
- [Measurable improvement 1]
- [Measurable improvement 2]
- [Measurable improvement 3]

**Refactor Iteration Log:**
- Step 1: Extract validation → ✅ Tests pass
- Step 2: Rename variables → ✅ Tests pass
- Step 3: Simplify conditionals → ❌ Tests fail → REVERT
- Step 3 (retry): Smaller change → ✅ Tests pass

**Code Quality Metrics:**
- Cyclomatic complexity: [before] → [after]
- Lines of code: [before] → [after]
- Duplication removed: [N instances]

**[If P0/P1 feature]**
⚠️ RECOMMENDATION: Manual smoke test suggested
   This is a P0/P1 feature. Verify:
   1. [Critical user flow step 1]
   2. [Critical user flow step 2]
   3. [Critical user flow step 3]

**Status:** COMPLETE
```

---

## Examples

### Example 1: Extract Duplicated Logic

**Input:**
```
/refactor features/p142_login.md
```

**Output:**

```
## Refactoring Login Feature

**Pre-flight check:**
✅ Baseline: 248/248 tests passing

**Phase 1: Code Review**
Identified opportunities:
- Email validation duplicated in 3 files
- Password validation duplicated in 2 files
- Unclear variable names (x, temp, data)

**Phase 2: Test Enhancement**
Added edge case tests:
- Empty email/password handling
- Null input handling
- Whitespace trimming
- Max length boundaries

Running new tests...
✅ All tests pass (256/256)

**Phase 3: Refactoring**

Step 1: Extract email validation
- Created: src/lib/validation/email.ts
- Changed: src/app/login/page.tsx
- Changed: src/app/signup/page.tsx
- Changed: src/app/settings/profile/page.tsx
- Tests: ✅ 256/256 passing

Step 2: Extract password validation
- Created: src/lib/validation/password.ts
- Changed: src/app/login/page.tsx
- Changed: src/app/signup/page.tsx
- Tests: ✅ 256/256 passing

Step 3: Rename variables
- Changed: src/app/login/page.tsx (x → email, temp → trimmedEmail)
- Tests: ✅ 256/256 passing

**Phase 4: Verification**

Baseline: 248/248 tests
Current: 256/256 tests (+8 edge cases)

✅ All tests pass
✅ No regressions
✅ Quality improved

Quality metrics:
- Duplication removed: 5 instances → 0
- Lines of code: 342 → 289 (15% reduction)
- Test coverage: 78% → 94%

Refactoring complete. Refactoring complete.
```

---

### Example 2: Failed Refactor (Revert and Retry)

**Input:**
```
/refactor src/components/Dashboard.tsx
```

**Output:**

```
## Refactoring Dashboard Component

**Pre-flight check:**
✅ Baseline: 512/512 tests passing

**Phase 1: Code Review**
Identified opportunities:
- Complex nested conditionals (cyclomatic complexity: 18)
- Inline API calls (should extract to hooks)

**Phase 2: Test Enhancement**
✅ Edge case tests added: 8 new tests
✅ All tests pass (520/520)

**Phase 3: Refactoring**

Step 1: Simplify conditionals
- Changed: src/components/Dashboard.tsx (guard clauses)
- Tests: ✅ 520/520 passing
- COMMIT: refactor: simplify Dashboard conditionals

Step 2: Extract API calls to custom hook
- Changed: src/components/Dashboard.tsx
- Changed: src/hooks/useDashboardData.ts (new file)
- Tests: ❌ 518/520 passing

FAILURE: 2 tests failed
- "should load dashboard on mount" - Hook error: rendered more hooks than previous render
- "should refetch on user change" - Hook error: Cannot call hooks conditionally

REVERTING: git reset --hard HEAD~1

Analysis: Custom hook violates rules of hooks (called inside condition)

Retry with different approach:
Step 2 (retry): Inline API call remains, simplify error handling only
- Changed: src/components/Dashboard.tsx (simplified error state)
- Tests: ✅ 520/520 passing
- COMMIT: refactor: simplify Dashboard error handling

**Phase 4: Verification**

Baseline: 512/512 tests
Current: 520/520 tests (+8 edge cases)

✅ All tests pass
✅ No regressions
✅ Quality improved (guard clauses, error handling)

Quality metrics:
- Cyclomatic complexity: 18 → 12 (33% reduction)
- Lines of code: 245 → 198 (19% reduction)

Note: Custom hook extraction deferred (violates hooks rules)
Marked as tech debt: P144 (extract Dashboard data fetching to proper hook)

Refactoring complete. Refactoring complete.
```

---

### Example 3: P0 Feature (Manual Test Recommended)

**Input:**
```
/refactor features/p99_payment_flow.md
```

**Output:**

```
## Refactoring Payment Flow (P0)

[... standard refactoring steps ...]

**Phase 4: Verification**

Baseline: 512/512 tests
Current: 520/520 tests (+8 edge cases)

✅ All tests pass
✅ No regressions
✅ Quality improved

Quality metrics:
- Extracted payment validation logic
- Simplified error handling
- Improved variable naming

⚠️  CRITICAL: This is a P0 feature (payment processing)

RECOMMENDATION: Manual smoke test REQUIRED before shipping

Manual test steps:
1. Open /checkout in browser
2. Enter valid payment details (test card: 4242 4242 4242 4242)
3. Click "Pay Now"
4. Verify success page loads
5. Verify payment confirmation email sent
6. Try invalid card (4000 0000 0000 0002)
7. Verify error message displays correctly

Refactoring complete. Tests pass. MANUAL VERIFICATION REQUIRED.

Ready for manual smoke test.
```

---

## Related Skills

- `/dev` - Implementation (run before /refactor)
- `/fix` - Bug fixes (run before /refactor)
- `/kdd` - Capture learnings (user runs after /refactor)
- `/finish` - If UI changes during refactor

---

## Notes

- **/refactor is OPTIONAL** - Only run if code quality improvements are desired
- **Can be run multiple times** - Iterative quality improvement is encouraged
- **Tests are mandatory** - Cannot refactor without passing tests
- **Revert is your friend** - If tests fail, revert immediately and try different approach
- **Small steps win** - One change at a time, test after each change
- **P0/P1 features need manual testing** - Automated tests aren't enough for critical paths
- **/refactor does NOT include /kdd** - User runs that separately. Feature was already closed by `/dev` or `/fix`.

---

## Announce at Start

When invoked, agent announces:

```
I'm using the refactor skill to improve code quality with test-driven safety.

Pre-flight check: Running baseline tests...
```
