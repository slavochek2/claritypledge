# /fix

Systematic bug remediation workflow (reproduce → test → fix → verify).

> **Principle:** Every bug fix should make it impossible for that bug to return.

## Usage

**Standard mode (with bug spec):**
```bash
/fix features/p99_bug_description.md    # Fix bug from spec
/fix p99                                 # Short form
```

**Quick mode (inline description):**
```bash
/fix "Login button broken on Safari"    # Creates minimal spec inline
```

**When to use /fix:**
- ✅ Use `/fix` when bug is reproducible and cause is known
- ⚠️ For complex bugs (unclear cause, hard to reproduce): Investigate using debugging protocol (see docs/technical/debugging.md) before running /fix

---

## How to Think

Bug fixes are not just code changes — they're opportunities to prevent entire classes of failures.

**Three lenses to apply:**

### The Regression Lens
> "How do we prove this bug can't come back?"

- Every fix needs a test that would have caught the original bug
- Regression tests are not optional — they're the proof of fix
- If you can't write a test, you don't understand the bug well enough

### The Root Cause Lens
> "What made this bug possible in the first place?"

- Symptoms vs causes. Fix causes, not symptoms.
- If fix requires more than 5 lines of code, question if you found the real root cause
- Document WHY it broke, not just WHAT was broken

### The Blast Radius Lens
> "What else could this change affect?"

- Every fix is a potential regression in disguise
- Test suite must pass after fix (no new bugs introduced)
- Minimal changes reduce risk — fix first, refactor separately

### The Surface Lens
> "Where else does this symptom exist?"

- UI behavior bugs almost always exist in more than one component
- Fixing one surface without checking others = filing the same bug again next month
- Always grep for the pattern, not just the reported location
- If you find other surfaces: surface them to the user explicitly. Never decide silently.

**Apply all four before marking bug as fixed.**

---

## When to Use

✅ **Use /fix for:**
- Bugs with clear reproduction steps
- Regressions (something that worked before, broke now)
- Bugs with known root cause
- Simple fixes (typo, logic error, missing validation)

❌ **Don't use /fix for:**
- Complex bugs with unclear cause → investigate first (see docs/technical/debugging.md)
- Bugs that can't be reproduced → investigate with debugging protocol
- "Bugs" that might be feature requests → clarify with user first

**Relationship to debugging:**
```
Bug reported
│
├─ Simple (known cause) → /fix directly
└─ Complex (unknown cause) → Investigate (debugging.md) → /fix
```

/fix auto-closes the feature on success: moves spec to `features/done/`, sets `status: done` + `completed_at`, prompts for `/kdd`.

---

## Workflow

### Phase 0: Mark in Progress

If a P-number spec was provided (file path or short form like `p99`):
1. Locate feature file: `features/p{N}_*.md`
2. Update frontmatter `status` → `in-progress`
3. Report: "Marked pN as in-progress in kanban."

Skip silently if no feature file exists (inline description mode, e.g. `/fix "Login button broken"`).

---

### Phase 1: Reproduce the Issue

**Goal:** Confirm the bug exists and understand how to trigger it

**Steps:**
1. Read bug description from spec
2. Identify reproduction steps (from bug report or spec)
3. Execute reproduction steps in test/dev environment
4. Document actual vs expected behavior
5. Confirm: Can you trigger the bug reliably?

**Output:**
```
Bug confirmed: [Brief description]
Reproduction steps:
1. [Step 1]
2. [Step 2]
3. Bug occurs: [What happens]

Expected: [What should happen]
Actual: [What actually happens]
```

**If can't reproduce:**
- Flag to user: "Unable to reproduce bug. Recommend /debugging for investigation."
- Do NOT proceed to fix

---

### Phase 1b: Surface Audit

**Goal:** Find every place in the codebase where this symptom exists — not just the reported one.

**Why this phase exists:** Bugs about UI behavior (counts, highlighting, persistence, state) almost always affect multiple components. Fixing only the reported surface leaves the bug alive elsewhere and you file it again next week.

**Steps:**
1. Identify the core symptom as a grep pattern. Examples:
   - "position counts show 0" → grep for `PositionButtons`, `positionCounts`, `userPosition`
   - "button not highlighted" → grep for `useState.*null` near position rendering
2. Search codebase for every component that renders the affected behavior
3. For each match, quickly assess: is the bug present here too? (look for the same pattern — hardcoded zeros, missing DB call, no initial state load)
4. Present the full list to the user:

```
Surface audit for: "position counts show 0"

Found this symptom on 3 surfaces:
  1. Profile → Points tab          (reported)
  2. Profile → Stories tab expanded (QuotedPointCard — hardcoded zeros)
  3. Point detail page              (userPosition never loaded on mount)

Which do you want fixed in this ticket?
- Fix all 3 now?
- Fix 1 now, defer 2 and 3? (I'll create tickets for them immediately)
```

5. Wait for explicit user confirmation before proceeding.
6. For any surface the user defers: create a bug ticket NOW before moving on. Run `./scripts/next-p-number.sh` from repo root to get the next P-number, create `features/p{N}_{surface_slug}.md`, and include the P-number in your summary to the user. "Out of scope" without a ticket number is not allowed.

**Output:**
```
Surface audit complete.
In scope for this ticket: [list]
Deferred (tickets created): [P-XXX: surface, P-YYY: surface]

Proceeding with confirmed scope.
```

**Skip this phase only for:**
- Bugs clearly isolated to infrastructure (build errors, DB migrations, CI config)
- Bugs with zero UI behavior (pure logic, no rendering)

---

### Phase 2: Write Regression Test

**Goal:** Create test that FAILS before fix, PASSES after fix — testing the USER-VISIBLE SYMPTOM, not the fix mechanism.

**Critical rule:** The test must assert what a user would see, not what the code does internally.

```
❌ Wrong (tests mechanism):
   await expect(page.getByText('Test point')).toBeVisible()
   → passes even if counts are 0, button not highlighted

✅ Right (tests symptom):
   await expect(countLabel).toHaveText('1')
   await expect(agreeButton).toHaveAttribute('aria-pressed', 'true')
   → fails if counts are 0 or button not highlighted
```

**Steps:**
1. Determine test type:
   - E2E test if bug affects user-facing behavior
   - Unit test if bug is in isolated function/logic
2. Write test that asserts the visible symptom (a number, a highlight, a state the user sees)
3. Run test → should FAIL (proves bug exists)
4. Document test location: `e2e/p{N}-bug-fix.spec.ts` or `src/tests/bug-fix.test.ts`
5. For bugs affecting multiple surfaces (from Phase 1b): the test must cover ALL confirmed in-scope surfaces

**Example E2E regression test:**
```typescript
test('p142: Login button should work on Safari', async ({ page }) => {
  // Reproduce bug
  await page.goto('/login');
  await page.click('[data-testid="login-button"]');

  // This should pass after fix
  await expect(page).toHaveURL('/dashboard');

  // Before fix: stays on /login (bug)
  // After fix: redirects to /dashboard (expected)
});
```

**Output:**
```
Regression test created: e2e/p142-login-safari-fix.spec.ts
Running test...
❌ Test fails (expected - bug exists)

Test proves bug exists. Ready to fix.
```

---

### Phase 3: Fix the Code

**Goal:** Fix the bug without breaking other functionality

**Steps:**
1. Identify root cause (from reproduction + test)
2. Make minimal fix to code
3. Run regression test → should now PASS
4. Run smoke tests → should still PASS
5. Run full test suite → should still PASS (no regressions)

**Fix strategy:**
- Prefer minimal changes (smallest diff that fixes bug)
- Don't refactor while fixing (fix first, refactor separately)
- Add defensive checks if bug was due to missing validation
- Document WHY fix works (not just WHAT changed)

**Example fix:**
```typescript
// Before (bug):
function handleLogin(event) {
  login(event.target.value); // BUG: Safari doesn't support event.target on buttons
}

// After (fix):
function handleLogin(event) {
  event.preventDefault(); // FIX: Prevent default behavior
  login(formData.email); // FIX: Use form data instead of event.target
}
```

**Output:**
```
Fix applied: src/app/auth/login.ts
- Added event.preventDefault()
- Changed to use formData instead of event.target

Running regression test...
✅ Test passes

Root cause: Safari doesn't support event.target on button clicks
Fix: Use form data reference instead of event target
```

---

### Phase 4: Verify Fix

**Goal:** Ensure bug is fixed AND no new bugs introduced

**Verification checklist:**
- [ ] Regression test passes (proves bug is fixed)
- [ ] Smoke tests pass (fast regression check)
- [ ] Full test suite passes (no new bugs introduced)
- [ ] **Browser verification (required for any UI change)** — navigate to affected route, screenshot, confirm fix visually. Use Chrome DevTools MCP (headless) or Claude in Chrome (authenticated). "Tests pass" is not sufficient.
- [ ] Bug spec updated with resolution details

**Steps:**
1. Run regression test → MUST pass
2. Run smoke tests → MUST pass
3. Run full test suite → MUST pass
4. **Once tests pass, spawn in parallel (do not wait for one before starting the other):**
   - **Code review agent** — review tests + implementation together. Prompt: "Review tests AND implementation for [bug]. Check: missing surface coverage, threshold/logic bugs, accessibility gaps, stale state risks."
   - **Browser verify agent** (UI bugs only) — navigate to affected route, screenshot, confirm fix visually.
   - Apply any HIGH findings from code review before committing.
5. Update bug spec:
   - Set `date_resolved: YYYY-MM-DD`
   - Add `root_cause: [brief explanation]`
   - Add `resolution: [what was fixed]`

**Output:**
```
Verification complete:
✅ Regression test passes (bug fixed)
✅ Smoke tests pass (1/1)
✅ Full test suite passes (512/512)
✅ Manual verification in Safari (if UI bug)

Bug spec updated:
- date_resolved: 2026-02-13
- root_cause: Safari event.target incompatibility on buttons
- resolution: Changed to use formData reference

Bug fixed and verified. Closing feature.
```

---

## Completion Criteria

Before marking bug as fixed, verify:

**Required:**
- [ ] Bug is reproducible (proven in Phase 1)
- [ ] Regression test created and passes
- [ ] All smoke tests pass
- [ ] All existing tests still pass (no regressions)
- [ ] Bug spec updated with resolution details

**Conditional:**
- [ ] If UI bug: Manual verification in browser
- [ ] If critical bug (P0): Notify user for manual verification
- [ ] If data bug: Verify data integrity checks pass

**Never skip verification:** If ANY check fails, iterate on fix until all pass.

---

## Bug Spec Format

Bug specs in `features/` should have:

```yaml
---
status: in-progress  # or: done (after fix verified)
type: bug
severity: critical | high | medium | low
date_reported: YYYY-MM-DD
date_resolved: YYYY-MM-DD  # Added after fix
root_cause: Brief explanation  # Added after fix
resolution: What was fixed  # Added after fix
---

# P142: Login Button Broken on Safari

## Bug Description

**Reported:** 2026-02-13
**Severity:** High (blocks Safari users from logging in)

**Symptoms:**
- Login button click has no effect on Safari
- Works on Chrome/Firefox
- No console errors

**Reproduction steps:**
1. Open app in Safari
2. Navigate to /login
3. Click login button
4. Expected: Redirect to /dashboard
5. Actual: Nothing happens, stays on /login

**Affected users:** Safari users (estimated 15% of user base)

---

## Resolution

**Fixed:** 2026-02-13
**Root cause:** Safari doesn't support event.target on button clicks
**Resolution:** Changed login handler to use formData reference instead of event.target

**Files changed:**
- src/app/auth/login.ts (line 42)

**Regression test:** e2e/p142-login-safari-fix.spec.ts
```

---

## Feature Closure

After commit succeeds:

1. **Review** — Spawn `/review-all` as a subagent with: "Review all changes on this branch vs main. Spec: [spec path if exists]. Do NOT pause for scope selection — proceed directly with scope = all changes vs main." Present HIGH/MEDIUM findings. Ask: "Fix issues before closing? (all HIGH / select / skip)". Apply approved fixes and commit them.
2. Update frontmatter: `status: done`, `completed_at: YYYY-MM-DD`
3. Find destination: `ls -d features/done/*/ 2>/dev/null | sort -V | tail -1`
   Use current month's folder if it exists (`{N}_{mon}_{yy}`), else create next.
4. Move files:
   ```bash
   mkdir -p features/done/{folder}
   git mv features/{spec} features/done/{folder}/
   git mv features/uat/p{N}.md features/done/{folder}/ 2>/dev/null
   ```
5. Commit: `chore: close P{N} — {title}`
6. Spawn parallel closing subagents:
   - **fix-kanban** (always): Invoke `/slava:maintain:fix-kanban` — fixes frontmatter drift + refreshes kanban
   - **verify** (if `*.tsx` files changed): Run browser check automatically — navigate to affected route, screenshot, report. If Chrome MCP unavailable, state "browser check skipped — run `/verify` manually." Do not ask; just do it.
6. Ask: "Capture learnings with /kdd? (y/n)"

---

## Relationship to Other Skills

**Before /fix:**
- Debugging protocol (docs/technical/debugging.md) - Use first if bug cause is unclear

**After /fix:**
- `/kdd` - Capture learnings (optional, if bug revealed patterns)

**Parallel:**
- `/simplify` - If fix requires complex decision

---

## Examples

### Simple Bug (Direct to /fix)

**Bug:** "Submit button disabled when form is valid"

```
/fix features/p142_submit_button_bug.md

Phase 1: Reproduce
✅ Bug reproduced: Button stays disabled even with valid form

Phase 2: Regression test
✅ Test created: e2e/p142-submit-button.spec.ts
❌ Test fails (expected)

Phase 3: Fix
✅ Fixed: src/components/Form.tsx (inverted boolean logic)

Phase 4: Verify
✅ Regression test passes
✅ All tests pass (512/512)

Bug fixed. Closing feature.
```

### Complex Bug (Debugging first)

**Bug:** "Data loss occurs sometimes, unclear when"

```
# First: Investigate
/debugging features/p143_data_loss_bug.md
→ Root cause identified: Race condition in save handler

# Then: Fix
/fix features/p143_data_loss_bug.md
→ Reproduce race condition
→ Write regression test
→ Fix with debounce + queue
→ Verify

Bug fixed. Closing feature.
```

---

## Notes

- **Regression tests are mandatory** - Every bug fix MUST have a test that would have caught it
- **Minimal fixes preferred** - Fix the bug, don't refactor (refactor separately)
- **Document root cause** - Help future developers understand WHY it broke
- **Verify thoroughly** - Running tests is not optional, it's required
- **Announce at start:** "I'm using the fix skill to remediate this bug."
- **TypeScript verification: use `tsc --noEmit`, NOT `npm run build`** — `npm run build` runs Vite + asset pipeline and can trigger side-effects (e.g. eslint-plugin-react-hooks auto-fixing dep arrays in unrelated files).
- **Scope discipline:** Only edit files specified in the fix task. Never touch files outside the stated scope as a build side-effect.
