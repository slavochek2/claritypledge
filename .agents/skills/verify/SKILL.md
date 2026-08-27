---
description: 'Live UAT: verify a shipped feature works, looks great, and meets its acceptance criteria — from the user perspective'
when_to_use: "After /dev ships a feature. When verifying it works from the user perspective."
name: verify
version: 1.0.0
---

# /verify

Live UAT execution from the user's perspective. Auto-routes each scenario to the right tool: Playwright for functional checks, Claude in Chrome for visual QA.

> **Principle:** A feature isn't done until a real human (or an agent acting like one) confirms it works and looks right.

## Usage

```bash
/verify               # Auto-detect from current branch
/verify pN            # Verify specific feature
```

No flags. The skill reads the spec, classifies scenarios, and picks the right tool automatically.

## What Makes This Different

| `/finish` | `/verify` |
|----------|-----------|
| Static analysis (code, design, UX, skills, rules, docs) | Live interaction + assertions |
| Developer perspective | User perspective |
| "Is the code correct?" | "Does it work and look right?" |
| Reads files | Runs Playwright + opens browser |
| Fast (no browser) | Thorough (assertions + screenshots) |

## Tool Routing

The skill auto-routes each scenario. **Default: Playwright.** Chrome only for pure visual.

**Priority rule:** If a scenario involves clicking a button, link, or form element → **always Playwright**, even if it also checks visual state afterward. Chrome cannot click React Router links or interactive elements reliably (P660: 5 scenarios skipped due to this). Chrome is reserved for appearance-only checks where no interaction is needed.

| Scenario type | Detection | Tool |
|---|---|---|
| Auth-gated action (create, submit, save) | Needs "verified user" or "logged in" | Playwright with `setTestSession()` |
| Two-party /live session | Tagged `**Requires:** two-party` or contains "listener"/"creator" | Playwright with `createTwoPartySession()` |
| Toast/error message verification | Checks specific text output | Playwright assertion |
| Navigation/redirect | Checks URL change | Playwright assertion |
| DB state verification | Checks data persistence | Playwright with Supabase admin client |
| Form submission | Fills and submits a form | Playwright with locator API |
| Button/link click action | "Click [X]", "[X] action", "press Back" | Playwright with locator API |
| Multi-step sequential flow | Steps depend on prior interaction state | Playwright (orchestrate full flow) |
| Visual appearance (no interaction) | About "looks right", styling, layout — NO clicks | Claude in Chrome |
| Mobile viewport (no interaction) | UI files changed in feature — NO clicks | Claude in Chrome (`resize_window`) |

## Environment Detection

The skill auto-detects the environment — no user input needed:

| Signal | Detection | Effect |
|---|---|---|
| **Prod mode** | On `main` AND (`dev` in `pipeline_ran` OR `delivery_stage` is `dev` or `uat` for backward compat) | Runs against `claritypledge.com` with `e2e-agent` account |
| **Localhost mode** | On feature branch OR spec not at `uat` | Runs against `localhost:{port}` (worktree-aware) |
| **Visual pass needed** | `git diff main...HEAD` shows `.tsx`, `.css`, `.module.css` | Adds Chrome visual QA after Playwright |
| **Two-party needed** | Spec/UAT contains "two-party", "listener", "creator", "/live session" | Uses `createTwoPartySession()` |

---

## Pipeline Stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: verify`
3. Append `verify` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, verify]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [verify]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `verify` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## Execution Steps

### Step 1: Find the Spec

If argument given (e.g., `p273`):
```bash
find features -name "*p273*" -not -path "*/archive/*" 2>/dev/null
```

If no argument, infer from branch:
```bash
git branch --show-current  # e.g., feature/p273-verification-gate → p273
```

**Worktree-first resolution:** Before reading the spec, check if a worktree has a newer version:
```bash
git worktree list  # find worktree paths
find /path/to/worktree/features -name "p{N}_*.md" 2>/dev/null
```
If found in a worktree → read from the worktree path (it is ahead of main by definition — has pipeline stamps, checked ACs, etc.). If not found in any worktree → read from the current working directory.

Read the spec file completely. Also confirm what was actually shipped:
```bash
git log --oneline -5 feature/p{N}-*  # what commits landed on this branch?
```

Also check for a UAT file (same worktree-first rule applies):
```bash
ls features/uat/p{N}.md 2>/dev/null
```

If UAT file exists → **use it as the primary verification plan** (it has structured scenarios).
If not → **create one now** (Step 1b), then proceed.

---

### Step 1b: Auto-create UAT file (when none exists)

**Why:** The UAT scorecard is the only state that survives context compaction. Without it, a compaction mid-/verify resets all progress and causes re-testing. Always create one before starting.

Parse the spec's "Acceptance Criteria" (or any `- [ ]` checklist, Given/When/Then, or "must/should" statements) into numbered scenarios. Then write `features/uat/p{N}.md`:

```markdown
# UAT: P{N} — {Title}

> Auto-generated by /verify — edit freely.

## Test Execution Log

| Scenario | Result | Notes |
|----------|--------|-------|
| UAT-1: {first acceptance criterion, <=10 words} | --- | |
| UAT-2: {second criterion} | --- | |
| UAT-3: {third criterion} | --- | |
```

Rules:
- One row per acceptance criterion. Merge trivially related sub-bullets.
- Scenario IDs are flat (`UAT-1`, `UAT-2`) — not nested unless the spec is already sectioned.
- Keep descriptions short — they're labels for resume detection, not prose.
- Write the file with the Write tool before proceeding. Do not defer.

Announce: "No UAT file found — created `features/uat/p{N}.md` with {N} scenarios. Resume detection now active."

---

### Step 1c: Mode Announcement (mandatory)

After environment detection, announce the mode clearly before proceeding:

**Localhost mode:**
```
Running /verify in LOCALHOST mode (feature branch detected).
Target: http://localhost:{PORT}
This is pre-merge UAT — run /ship after passing.
```

**Production mode:**
```
Running /verify in PRODUCTION mode (on main, feature was shipped).
Target: https://claritypledge.com
This is post-deploy smoke test — issues go to /fix.
```

---

### Step 2: Build Verification Plan

Parse the UAT file (or acceptance criteria) into a structured list:

```
Verification plan for P{N}: {Title}
------------------------------------
Scenarios to run: {N}
Environment: {localhost:PORT / claritypledge.com (prod)}
Tool routing:
  Playwright (functional): {N} scenarios
  Chrome (visual): {yes/no — UI files changed?}
  Two-party: {yes/no}

Scenarios:
  [PW] UAT-1: {short description} — {user state}
  [PW] UAT-2: {short description} — {user state}
  [CH] Visual: desktop + mobile pass (appearance only, no clicks)
  ...

**Classification rules (apply in order):**
1. If scenario description contains click/tap/press/submit/fill/type/drag/navigate actions → `[PW]`
2. If scenario checks a state change triggered by an interaction (badge decrement, status update, read marking) → `[PW]`
3. If scenario requires browser history (back/forward) → `[PW]`
4. If scenario needs data seeding (empty state, boundary condition) → `[PW]` (Chrome has no programmatic data setup)
5. If scenario is purely about visual appearance with NO interaction → `[CH]`
6. Default → `[PW]`
```

**Resume detection:** Parse the Test Execution Log table in the UAT file. Rows with pass, fail, or skip markers are already complete — exclude them from the plan. Announce:
```
Resume detected: {N}/{total} already tested. Running remaining: {scenario-ids}.
```
If all scenarios are already tested, skip to Step 6 and produce the final report from the scorecard.

**Skip validation (mandatory before marking any scenario skip):** Never mark a scenario `skip` or "covered by existing spec" based on a label or assumption alone. Before writing `skip`:
- If the claim is "untestable — underlying function handles X only": read the function body. RPCs and service functions often handle multiple paths; only one may be untestable.
- If the claim is "covered by existing spec p{N}": run that spec (`npx playwright test e2e/p{N}-*.spec.ts --reporter=line --workers=1`) and confirm it passes. A spec file existing is not evidence of coverage.

**CTA coverage check:** From the spec's acceptance criteria, identify every submission action introduced or modified by this feature (buttons that commit user intent — "Accept", "Create", "Submit", "Save", etc.). For each one, check whether a scenario both triggers it *and* verifies a specific expected outcome. If any feature-introduced submission action is missing coverage, add a scenario:
```
Added UAT-{N}: CTA "[button label]" — missing outcome verification.
```

Announce the plan. If > 8 scenarios, ask: "That's {N} scenarios. Run all, or pick specific ones? (all / 1,3,5 / etc.)"

---

### Step 3: Functional Pass — Playwright

This is the primary verification path. Runs headless, no Chrome extension needed.

#### 3a. Pre-flight

**Environment detection:**
```bash
# Am I on main with a uat-stage spec? → prod mode
BRANCH=$(git branch --show-current)
```

If prod mode:
- Read `PROD_SUPABASE_ANON_KEY` and `PROD_SERVICE_ROLE_KEY` from `.env.prod`
- Base URL: `https://claritypledge.com`
- Test account: `e2e-agent@claritypledge.com` (password in `.env.prod`)

If localhost mode:
- Read from `.env.test.local`
- Detect port from `playwright.config.ts` (worktree-aware: main=5001, worktrees=5100-5700)
- Check dev server is running:
  ```bash
  curl -s http://localhost:{PORT} -o /dev/null -w "%{http_code}" 2>/dev/null
  ```
  If not running → "Dev server not running at localhost:{PORT}. Start with `npm run dev` then run /verify again." Stop here.

**Data prerequisite:** Before running tests, confirm the scenario's test entity has the required data shape. Create missing data programmatically using service role key:
```bash
curl -s -X POST "${VITE_SUPABASE_URL}/rest/v1/{table}" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"field": "test_value", ...}'
```
Use `test_verify_` prefix on slugs/titles. Follow patterns from `e2e/helpers/test-point.ts` and `test-story.ts`.

#### 3b. Check for Existing E2E Specs

```bash
ls e2e/p{N}-*.spec.ts 2>/dev/null
```

If specs exist → run them directly:
```bash
npx playwright test e2e/p{N}-*.spec.ts --reporter=line --workers=1
```

> **Always `--workers=1` when running p{N}-*.spec.ts.** Multiple spec files each create test users in `beforeAll` — parallel workers hit Supabase auth rate limits (429), producing false failures that mask real ones. See decisions.md 2026-04-12 [process].

Skip to 3d (parse results).

#### 3c. Generate Verification Test (when no spec exists)

Write a temporary `e2e/p{N}-verify.spec.ts` using existing helpers. The skill writes this file, mapping UAT scenarios to Playwright assertions.

**Helper reference (use these, don't reinvent):**

| Need | Helper | Import from |
|---|---|---|
| Auth (single user) | `setTestSession(page, email)` | `e2e/helpers/test-user.ts` |
| Auth (browser context) | `getTestAuthContext(role, browser)` | `e2e/helpers/auth-context.ts` |
| Two-party session (standard) | `createTwoPartySession(browser, opts)` | `e2e/helpers/test-session.ts` |
| Two-party session (realistic join) | `createTwoPartySessionRealistic(browser, opts)` | `e2e/helpers/test-session.ts` |
| Cross-context UI assertion | `waitForUIUpdate(page, locator, timeoutMs?)` | `e2e/helpers/test-realtime.ts` |
| State advancement | `advanceSessionState(code, overrides)` | `e2e/helpers/test-realtime.ts` |
| DB polling (sync point) | `waitForDBPresence(table, col, val, ...)` | `e2e/helpers/test-realtime.ts` |
| Mic permission mock | `mockMicPermission(page)` | `e2e/helpers/test-realtime.ts` |
| Test point + position | `createTestPoint()`, `createTestPosition()` | `e2e/helpers/test-point.ts` |
| Test story | `createTestStory()`, `linkStoryToPoint()` | `e2e/helpers/test-story.ts` |
| Test agreement | `createTestAgreement()` | `e2e/helpers/test-agreement.ts` |
| Test user (create/delete) | `createTestUser()`, `deleteTestUser()` | `e2e/helpers/test-user.ts` |

**Assertion patterns (from existing tests):**

```typescript
// Toast verification
await expect(page.getByRole('alert')).toContainText('Expected message');

// Navigation verification
await expect(page).toHaveURL(/\/expected-path/, { timeout: 10000 });

// Element visibility
await expect(page.getByText('Expected text')).toBeVisible({ timeout: 10000 });

// Form fill (use locator API, NOT native value setter)
await page.getByLabel('Story').fill('Remote work improves communication');
await page.getByRole('button', { name: /create/i }).click();

// DB state verification
const { data } = await supabaseAdmin.from('table').select('*').eq('id', id).single();
expect(data.field).toBe('expected');
```

**Two-party patterns:** Read `.claude/rules/tests.md` (Two-Party Helpers section) and `docs/technical/e2e-testing-guide.md` (Two-Party Sessions section) for current helpers, fixtures, and banned practices. Do not hardcode patterns here — the guide is the single source of truth.

**Cleanup:** Always wrap in try/finally with cleanup calls. Use `deleteTestUser()`, `deleteTestPoint()`, etc.

Run the generated test:
```bash
npx playwright test e2e/p{N}-verify.spec.ts --reporter=line --workers=1
```

#### 3d. Parse Results and Update Scorecard

Map Playwright output to UAT scorecard:
- Test passed → mark scenario row with pass + evidence (assertion text)
- Test failed → mark with fail + Playwright's error message
- Playwright auto-captures screenshots on failure (per `playwright.config.ts`)

**Write each result to the scorecard immediately** (Edit tool on `features/uat/p{N}.md`). Do not accumulate in memory.

#### 3e. On Failure — Triage Rule

On failure, write the result to the scorecard with Expected vs Actual, then **immediately continue to the next scenario**. Do NOT open source files. Do NOT investigate why. Do NOT suggest or attempt a fix. Root cause analysis is `/fix`'s job.

---

### Step 4: Visual Pass — Claude in Chrome

**Auto-triggered when** UI files changed in this feature. Skipped for pure backend/config changes.

Detection:
```bash
git diff main...HEAD --name-only 2>/dev/null | grep -E '\.(tsx|css|module\.css)$'
```

Fallback (on main or branch merged):
```bash
git show --name-only --format="" HEAD | grep -E '\.(tsx|css|module\.css)$'
```

If no UI files changed → skip visual pass entirely, mark as "skipped (no UI changes)" in report.

#### 4a. Open Chrome and Baseline

Use `mcp__claude-in-chrome__tabs_context_mcp` first to see current tabs.

Open a new tab to the app:
```
mcp__claude-in-chrome__navigate(url="http://localhost:{PORT}")
```

Take a baseline screenshot. Assess:
- Does the page load (not blank, not 404)?
- Is the basic layout intact (header, nav, content area)?

Check for console errors:
```
mcp__claude-in-chrome__read_console_messages(pattern="error|Error|TypeError|Uncaught")
```

Record error count as **`BASELINE_ERROR_COUNT = {N}`**.

If baseline fails (blank page, 404, console errors at load) → **stop and report**.

#### 4b. Visual QA Checklist

Navigate to the main page(s) affected by this feature. Take screenshots. Apply the full checklist from `.claude/rules/visual-qa.md`:

- Overflow, clipping, text truncation
- Spacing, alignment, touch targets
- Responsive squeeze, edge data
- Contrast, visual weight vs adjacent components
- State match

**Anti-confirmation-bias rule:** The visual QA assessment should find problems, not confirm quality. Look for what's wrong, not what's right.

#### 4c. Mobile Sanity Shot

If UI files changed → resize to 390px and take one screenshot of the main affected page:

```
mcp__claude-in-chrome__resize_window(width=390, height=844, tabId=...)
```

Take screenshot, then restore:
```
mcp__claude-in-chrome__resize_window(width=1280, height=800, tabId=...)
```

Check for mobile failure modes:
- Dialog/drawer buttons not hidden behind bottom nav
- Text not truncated or overflowing at narrow width
- Touch targets large enough (>=44px)
- No horizontal scroll introduced

#### 4d. Score Visual Pass

```
Visual quality: {pass / issues / needs-work}
Mobile (390px): {clean / issues / skipped (no UI changes)}
Issues: {list if any}
```

Check for **new** console errors (diff from baseline). Only errors above baseline are new failures.

---

### Step 5: Verify Scorecard Completeness

Results should already be written after each scenario (Step 3d) and visual pass (Step 4d). This step is a completeness check only.

Scan the Test Execution Log for any remaining unfinished rows. For each that was in scope but has no result: fill it in now. If a scenario was not attempted: mark it skipped with a reason.

After this step, no unmarked scenarios should remain for scenarios that were in the verification plan.

---

### Step 6: Report

```
P{N} Verification Report
========================

Functional: {passed}/{total} scenarios passed (Playwright)
Visual quality: {pass / issues / needs-work / skipped}
Mobile (390px): {clean / issues / skipped}
Environment: {localhost:PORT / claritypledge.com}
UAT scorecard: updated

PASSED
  UAT-1: Verified user creates story successfully
  UAT-2: Unverified user sees correct gate toast

FAILED
  UAT-3: Wrong toast on position gate — still shows old message
    Expected: "Verify your email to set a position"
    Got: "Please verify your email to record positions"
    Playwright error: expect(locator).toContainText - Received string does not contain...

VISUAL ISSUES
  Toast sits too close to bottom nav on mobile (390px). Small padding fix.

========================
VERDICT: {verdict}
========================

{next step guidance}
```

**Pre-verdict completeness gate (mandatory):**
Before printing the verdict, enumerate every obligated check from the verification plan:
1. Every UAT scenario must be marked (pass/fail/partial/skipped with reason). Any unmarked → STOP.
2. If UI files changed: mobile screenshot must be done or skipped with reason. Missing → STOP.
3. If CTA coverage check flagged unverified buttons: each must now be verified. Missing → STOP.

If any item is missing, complete it before producing the verdict.

**Verdict rules:**
- **Ready to ship** — All functional scenarios pass, visual quality clean or minor-only
- **Ship with caveats** — All functional pass, visual has real issues worth fixing but not blockers
- **Not ready** — Any functional scenario fails

---

### Step 6a: Set status: qa on passing verdict

This step runs only after a "Ready to ship" verdict. Skip for other verdicts.

**1. Resolve P-number** — from argument or branch name.

**2. Locate spec:**
```bash
find features -name "p{N}_*.md" -not -path "*/done/*" -not -path "*/archive/*"
```

**3. Apply guards (stop on first hit):**
- `locked_at:` present → status not changed
- Neither `dev` nor `fix` present in `pipeline_ran` → status not changed. **Test `pipeline_ran`, never `delivery_stage`:** the Pipeline Stamp at the top of this skill overwrites `delivery_stage` with `verify` *before this step runs*, so any `delivery_stage` test here is either self-blocking or vacuous. `pipeline_ran` is append-only and preserves the history the guard is actually asking about. `fix` counts because bug specs reach here through `/fix`, not `/dev`, and bugs are the largest spec type.
- `status:` not `in-progress` → status not changed
- **Any `## Acceptance Criteria` or `## Done-When` checkbox still `[ ]` → status not changed.** A green runtime pass does not override an incomplete checklist — the drive only tests paths that exist, not the ones still missing. Override the verdict to **BLOCKED-by-state**, list every unticked item, and report what is left to build.

**4. All guards pass** — replace `status: in-progress` with `status: qa`, then **commit it with the
subject `chore: pN ready for QA — {title}`.**

**The subject string is a contract.** `git-ops.sh`'s no-branch closure path (P920) proves an
implementation landed by matching a non-revert commit whose *subject* carries the P-number and the
literal phrase `ready for QA`. `/fix` writes it; `/dev` writes it since P1169. `/verify` wrote no
stamp at all, so a spec whose work lives on `main` with no branch and which reached `qa` through
`/verify` could not be closed by `/ship` — found on P1001, 2026-08-27, 41 days after it was
finished. Do not reword this subject.

Report: "Set `status: qa` in {spec-path} and stamped it. Run `/ship p{N}` when ready to merge."

---

## Edge Cases

| Situation | Behavior |
|-----------|----------|
| No UAT file exists | Auto-create `features/uat/p{N}.md` (Step 1b), then proceed |
| No acceptance criteria section | Derive from any "Given/When/Then" or "must/should" statements in spec |
| Scenario needs unauthenticated state | Playwright: don't call `setTestSession()` — page loads without auth by default |
| Scenario requires DB setup | Auto-create via service role key (Step 3a). Fall back to asking user only if key unavailable |
| Page doesn't exist yet | Fail immediately — page not found is a functional failure |
| Dev server on different port (worktree) | Auto-detect from `playwright.config.ts` |
| Existing E2E specs cover all scenarios | Run them directly, skip test generation |
| Chrome extension not available | Skip visual pass, report "Visual QA skipped — Chrome extension unavailable. Functional pass complete." |
| All scenarios are visual-only | Fall back to Chrome-only mode (rare — most specs have functional ACs) |

---

## Escalation Protocol

If not-ready verdict:
1. **List failures clearly** — exact scenario, what was expected, what happened
2. **Tell user to investigate** — "Run `/fix` to investigate and resolve these failures."
3. **Tell user next step** — "Fix the issues, commit, then run `/verify` again."

If ship-with-caveats verdict (visual issues only):
1. List them as non-blocking
2. Ask: "Fix visual issues now or ship anyway? (fix/ship)"

---

## Generated Test File Lifecycle

The `e2e/p{N}-verify.spec.ts` file generated in Step 3c:
- **Keep it** — it becomes a regression test for this feature
- `/dev` on future features can run it as part of the test suite
- If the spec's ACs change, regenerate with `/verify` (it overwrites)

---

## Related Skills

- `/generate-tests` — Generates the UAT file + E2E stubs this skill can use
- `/dev` — Runs automated tests, stops at QA gate on success
- `/ship` — Merges to prod after verification passes
- `/finish` — Consolidated static review (code, design, UX, skills, rules, docs — no browser)
- `/sim` — Persona-based UX exploration (separate from correctness verification)
- `/fix` — Investigate and resolve failures found by /verify
