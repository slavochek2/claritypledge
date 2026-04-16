---
name: fix
description: Systematic bug remediation workflow (reproduce, test, fix, verify)
when_to_use: "When a bug needs structured diagnosis and fix. Triggered by /fix."
version: 1.0.0
---

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
/fix "Login button broken on Safari"    # Auto-files via /create-bug, then proceeds
```

When called with a description string instead of a P-number, `/fix` auto-invokes `/create-bug` to file a tracked spec BEFORE any fix work begins. See Phase 0.pre below.

**When to use /fix:**
- ✅ Use `/fix` when `/reproduce` has already confirmed the bug (spec has `reproduce_artifact`)
- ✅ Use `/fix` directly for trivial bugs where root cause is self-evident (one-liner fixes)
- ⚠️ For bugs without reproduction: run `/reproduce` first — `/fix` will refuse without `reproduce_artifact` unless overridden
- ⚠️ For complex bugs (unclear cause, hard to reproduce): Investigate using debugging protocol (see docs/technical/debugging.md) before running /reproduce

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
- **Hard gate: run the grep and paste the output before Phase 3 opens.** The output is the proof it happened. No output = gate not passed.
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

/fix stops at a QA gate on success: sets `status: qa` in frontmatter, stays on the feature branch. Run `/ship pN` to merge to prod and close the spec.

**Prod verification:** After deploying a fix that touches DB/auth/edge functions, verify on prod with Playwright: `VERIFY_PROD=1 PROD_SERVICE_ROLE_KEY="<srk>" npx playwright test e2e/verify-prod-<feature>.spec.ts`. Uses persistent test account `e2e-agent@claritypledge.com`. See `e2e/verify-prod-agreements.spec.ts` as template.

---

## Workflow

### Phase 0.pre: Ensure spec exists (BEFORE worktree setup)

If `/fix` was called with a **plan file path** (e.g. `~/.claude/plans/*.md`): treat it as architect context, extract the title as the bug description, and auto-invoke `/create-bug` with that title to file a tracked spec before proceeding. Plan files are not specs.

If `/fix` was called with a description string (not a P-number or spec path):

1. **You must be on main (w0).** If in a worktree, switch to main first: `cd ~/Projects/public/claritypledge`
2. Invoke `/create-bug` with the description to file a tracked spec
3. Use the resulting P-number and spec file for all subsequent phases
4. Report: "Filed as P{N}. Proceeding with fix."

**If `/create-bug` fails** (script error, validation failure): halt and report the error. Do NOT fall back to untracked mode. The user must fix the issue and retry.

**If already in a worktree** when discovering a new bug during another task:
1. Switch to main: `cd ~/Projects/public/claritypledge`
2. Run `/create-bug` to file the spec (commits to main)
3. Return to worktree: `cd .claude/worktrees/wN`
4. Rebase to pick up the spec: `git rebase main`
5. Proceed with `/fix` using the new P-number

---

### Phase 0.0: Worktree setup

If this is a P-number bug fix AND current branch is `main`:

**First: check if a worktree already has this spec.**
```bash
for wt in .claude/worktrees/w*/; do
  if ls "$wt"/features/p${N}_*.md 2>/dev/null >/dev/null; then
    cd "$wt"
    echo "Entering existing worktree $wt — spec found here."
    break
  fi
done
```
If an existing worktree has the spec file, enter it instead of creating a new one. The feature branch copy is always >= main in freshness (see `.claude/rules/features.md` — Spec Location).

**If no worktree has the spec, create one:**
```bash
git worktree add .claude/worktrees/w1 -b feature/pN-short-description
./scripts/setup-worktree.sh .claude/worktrees/w1
cd .claude/worktrees/w1
```
Use the first available slot (`w1`, `w2`). Check `git worktree list` first — if both slots are occupied, STOP and ask: "Both worktree slots are in use (w1: feature/pX, w2: feature/pY). Remove one or proceed on a branch?" Report: "Created worktree {slot} on branch feature/pN-... — dev server will run on port {5100 for w1, 5200 for w2}."

**Exception — skip worktree if ALL of these are true:** (a) fix is a trivial single-file change, (b) no other features are in progress on the index, (c) user explicitly says "just do it inline." In that case, create a feature branch instead: `git checkout -b feature/pN-short-description`.

Skip entirely if already in a worktree on the correct feature branch, or if task is a non-P-number fix (infra, docs, urgent prod hotfix).

---

### Phase 0.1: Collision check

Run `git status --short`. If modified or staged files from a **different** feature exist (files unrelated to this bug fix):

Present options and wait for decision:
- **(A) Create a worktree** for this fix — clean index, full isolation (recommended). Create under `.claude/worktrees/w1`, then run `./scripts/setup-worktree.sh .claude/worktrees/w1`.
- **(B) Commit current work first** — if in-progress work is at a safe checkpoint
- **(C) Proceed anyway** — only if user confirms both are one logical changeset

Do NOT proceed until user chooses. Skip if already in a worktree (isolation is structural) or if tree is clean.

---

### Phase -1: Reproduce Gate + Context Load (NEVER SKIP)

After worktree setup (so CWD resolves to the correct branch):

**Reproduce gate (check FIRST):**
1. Read the spec frontmatter. Look for `reproduce_artifact:` block.
2. **If `reproduce_artifact` exists:**
   - Read the `test_file` path — verify the canary test file exists on this branch.
   - If `reproduce_artifact` has `post_fix_timeout:`, update the canary test assertion timeout to that value before running it. The original tight timeout was a staleness sentinel written by /reproduce — it is expected to be wrong after the fix. This is not a test modification; it is applying the handoff contract between /reproduce and /fix.
   - Run the canary test — it MUST still fail (bug not yet fixed). If it passes, the bug may already be fixed or the test is stale. Report and stop.
   - Read `root_cause` from the artifact. This is your starting point for Phase 3.
   - Read `surfaces_in_scope` — all listed surfaces must be addressed in Phase 3. Read `surfaces_deferred` — verify the deferred ticket P-numbers exist.
   - If `confidence: medium` — warn: "Root cause confidence is medium. Consider additional verification before committing the fix."
   - **Skip Phases 1, 1b, and 2** — reproduction is already done. Jump to Phase 3.
3. **If `reproduce_artifact` is missing:**
   - **For type: bug specs:** STOP. Tell user: "P{N} has no reproduce artifact. Run `/reproduce p{N}` first to confirm the bug and write a failing test."
   - **Override:** If user explicitly says "skip reproduce" or bug is a trivial one-liner (e.g., typo, obvious logic inversion) — proceed to Phase 1 as fallback. Note: "Proceeding without /reproduce — user override."

**Context load (always):**
1. If a P-number spec exists: read it fully (reproduction steps, root cause if documented, acceptance criteria)
   **Status gate:** if `status: qa` or `status: done` → stop immediately: "P{N} is already at {status}. Nothing to fix. Run `/ship pN` to merge." Do not continue.
   **Exception — QA-phase bug:** If the user explicitly invokes `/fix pN <bug description>` on a `status: qa` spec, treat it as a QA-phase discovery. Proceed, surface the gate bypass ("QA-phase fix — user-directed, bypassing status gate"), reset status to `in-progress`, suffix `pipeline_ran` entry as `fix.2` (or `.3`, etc.).
2. Read the source file(s) mentioned in the spec or user description — verify current state matches your assumptions
3. If bug involves DB: check the actual schema (`curl` REST API with `?select=column&limit=1`)
   **If bug involves a client-side count function** (badge, summary, etc.): grep the corresponding SECURITY DEFINER RPC migration to confirm the full filter set (`status IN (...)`, exclusion predicates, etc.) before writing any fix code. Count functions silently under- or over-count when their filter set diverges from the RPC.
4. If spec has mixed `[x]`/`[ ]` acceptance criteria (rewritten matryoshka bug): announce which layers are done and which remain. Focus on unchecked items.
5. **If bug involves token-based RPCs or token-gated flows:** identify the manual verification path now — before writing code. State: "Fresh token source: [UI path / service-role query / Playwright canary]". Consumed or RLS-blocked tokens are a common dead end at UAT time.

Skip context load steps 1 and 3 in inline mode (`/fix "description"`) — but always do step 2 (using the user description to identify source files).

---

### Phase 0.2: Branch distance check

If on a feature branch (not in a worktree), check distance from main:
```bash
git rev-list --count main..HEAD
```

- **≤ 5 commits ahead**: safe, proceed.
- **> 5 commits ahead**: **STOP and warn**:
  ```
  ⚠️  You're on `{branch}` — {N} commits ahead of main.
  Running /ship later will ship ALL {N} commits, not just this work.

  A) Create a worktree off main for this change (recommended — clean /ship path)
  B) Stay here — cherry-pick the commit to a main-based branch after implementation
  C) Proceed anyway — you intend to ship this whole branch

  Which? (A/B/C)
  ```
  Wait for decision. Do NOT proceed without confirmation.

### Phase 0.3: Pipeline Stamp (P659)

If a P-number spec was provided (file path or short form like `p99`):
1. Read spec frontmatter
2. Set `delivery_stage: fix` and `status: in-progress`
3. Append `fix` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, fix]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [fix]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `fix` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"
6. Report: "Marked pN as in-progress in kanban."

Skip silently if no feature file exists (inline description mode, e.g. `/fix "Login button broken"`).

---

### Phase 1: Reproduce the Issue (FALLBACK — skip if `reproduce_artifact` exists)

**Goal:** Confirm the bug exists and understand how to trigger it.
**Note:** This phase is a fallback for legacy specs or user-override mode. For new bugs, `/reproduce` handles this with better tooling and a failing test output.

**Steps:**
1. Confirm Phase -1 context is loaded (re-read spec if post-compaction). Focus on reproduction steps.
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

### Phase 1b: Surface Audit (FALLBACK — skip if `reproduce_artifact` exists)

**Fallback only.** When `reproduce_artifact` exists, the surface audit was already done by `/reproduce` Phase 2b — read `surfaces_in_scope` and `surfaces_deferred` from the artifact instead.

For the full surface audit protocol (when running without `/reproduce`), see `/reproduce` Phase 2b. The short version: grep for the symptom pattern across the codebase, list all affected surfaces, get user confirmation on scope, file deferred tickets immediately.

**Skip for:** Infrastructure bugs, pure logic bugs with zero UI behavior.

---

### Phase 2: Write Canary Test (FALLBACK — skip if `reproduce_artifact` exists)

**Goal:** Create test that FAILS before fix, PASSES after fix — testing the USER-VISIBLE SYMPTOM, not the fix mechanism. This is the canary: if it doesn't fail before the fix, you don't understand the bug. If it doesn't pass after, you didn't fix it.

**Note:** When `reproduce_artifact` exists, the canary test was already written by `/reproduce`. Skip this phase — just verify the existing test still fails before proceeding to Phase 3.

**Hard gate:** Run the canary test BEFORE writing any fix code. It MUST fail. If it passes, the test is wrong or the bug isn't what you think. Do not proceed until the canary fails for the right reason.

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
4. Document test location: `e2e/p{N}-reproduce.spec.ts` or `src/tests/p{N}-reproduce.test.ts`
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

**DB-layer canary gate:** If the bug is in a DB function or migration (RPC, trigger, policy), the canary from `/reproduce` likely simulated the bug by inserting the broken state directly (e.g., inserting a row with `NULL` where the fix sets a value). After applying the fix, rewrite the canary to call the actual changed code path (the RPC, the edge function, etc.) so the test proves the fix works — not just that the correct state is readable. Also add a direct DB assertion on the column or value the fix changes: `expect(row.column).toBe(expected)` via `supabaseAdmin`. Without this, the canary passes whether or not the migration was applied.

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
- [ ] **Browser verification — HARD GATE for any `*.tsx` diff.** Before proceeding to commit: provide screenshot path (e.g. `~/Screenshots/p123-fix.png`) OR write explicit `N/A: [reason]` (e.g. "N/A: layout-only constant, no rendered state change"). Use Chrome DevTools MCP (headless) or Claude in Chrome (authenticated). "Tests pass" is not sufficient and does not satisfy this gate.
- [ ] Bug spec updated with resolution details

**Steps:**
1. Run regression test → MUST pass
2. Run smoke tests → MUST pass
3. Run full test suite → MUST pass
4. **Once tests pass, spawn in parallel (do not wait for one before starting the other), both with `model: "sonnet"`:**
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

Bug fixed and verified. Status set to qa — run `/ship pN` when satisfied.
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

## Feature QA Gate

After commit succeeds:

0. **AC completeness check (HARD GATE):**
   Count unchecked `[ ]` items in `## Acceptance Criteria`.
   - All `[x]`: proceed to step 1.
   - Any `[ ]`: **STOP.** Do NOT set `status: qa`. Report:
     "Cannot set qa — {N} acceptance criteria still unchecked:
      - [ ] {item 1}
      - [ ] {item 2}
     Fix remaining items or update the spec before closing."
1. **Review** — Spawn `/finish code` as a subagent (`model: "sonnet"`) with: "Review all code changes on this branch vs main. Spec: [spec path if exists]. Proceed directly — no scope confirmation needed." Present HIGH/MEDIUM findings. Ask: "Fix issues before closing? (all HIGH / select / skip)". Apply approved fixes and commit them.
2. Update frontmatter: `status: qa` (keep `delivery_stage: fix` — do not clear it). **If the spec was moved (e.g., to a subfolder) in this session, Edit its frontmatter at the new location AFTER the `git mv` is staged — never Edit before staging the rename, or the frontmatter change lands in a separate commit.**
3. Commit: `chore: pN ready for QA — {title}`

   **If pre-commit hook blocks on a test failure:**
   1. Run the failing test against `main` to classify using the wip-commit pattern (never `git stash` — banned):
      ```bash
      git commit -m "wip: in-progress fix before pre-existing failure check"
      git checkout main
      npm test -- <failing-test-file>
      git checkout -
      git reset HEAD~1
      ```
   2. Present to user:
      - **(A) Pre-existing (fails on main too):** Create a deferred bug spec via `/create-spec` for the pre-existing failure (get a P-number). Then, with user explicit approval, use `--no-verify` and include `(skips --no-verify: pre-existing P{N} failure)` in the commit message body. The P-number is the trail — no ticket = no bypass.
      - **(B) Introduced by this fix (passes on main):** Return to Phase 3 — fix the code.
      - **(C) Can't determine:** Report "Cannot classify failure — run `/debugging` before committing." Do not commit.
   3. Wait for user choice. Never commit a blocked pre-commit without user explicit approval.

4. Invoke `/slava:maintain:fix-kanban` — fixes frontmatter drift + refreshes kanban
5. **`*.tsx` diff present — HARD GATE before this step:** Provide screenshot path or explicit `N/A: [reason]`. Attempt Claude in Chrome first; if unavailable, state: "browser check blocked — run `/verify` before `/ship`." Do NOT advance to step 6 without one of these two.
6. Tell user: "Fix ready for QA on branch `feature/pN-xxx`. Run `/ship pN` when satisfied to merge to prod and close the spec."

---

## Relationship to Other Skills

**Before /fix:**
- `/reproduce` — confirms the bug, writes a failing canary test, stamps `reproduce_artifact` in spec. **Default prerequisite for all bugs.**
- Debugging protocol (docs/technical/debugging.md) — use before `/reproduce` if even hypotheses are hard to form

**After /fix:**
- `/kdd` - Capture learnings (optional, if bug revealed patterns)

**Parallel:**
- `/simplify` - If fix requires complex decision

**Flow:**
```
/create-bug → /reproduce → /fix → /ship
```

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

Bug fixed. Status set to qa — run `/ship pN` when satisfied.
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

Bug fixed. Status set to qa — run `/ship pN` when satisfied.
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
