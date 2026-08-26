---
name: reproduce
description: >
  Reproduce a bug with evidence before fixing it. Root cause hypothesis,
  tool-aware reproduction, and a failing test that proves the bug exists.
when_to_use: >
  After /create-bug (or when a bug spec exists) and before /fix.
  Triggered by "/reproduce", "/reproduce pN", or when /pick-flow recommends it.
  Skip only for trivial one-liner bugs where root cause is self-evident from the code.
version: 1.0.0
---

# /reproduce

Reproduce a bug with evidence. Output: a confirmed root cause hypothesis + a failing test.

> **Principle:** If you can't make it fail on demand, you don't understand it well enough to fix it.

## Usage

```bash
/reproduce p714                              # From bug spec
/reproduce features/p714_letter_link.md      # Full path
/reproduce "counts show 0 after refresh"     # Inline — auto-files via /create-bug first
```

**Announce at start:** "I'm using the reproduce skill to confirm this bug and write a failing test."

---

## How to Think

### The Falsification Lens
> "What's the cheapest test that would disprove my hypothesis?"

Never say "Root cause: X." Say "Hypothesis: X. Cheapest disproof: [test]. Run it?"
One DB query might kill the hypothesis in 10 seconds before you spend an hour building a fix on the wrong assumption.

### The Tool Selection Lens
> "What's the fastest path to observable evidence?"

Different bugs need different tools. Pick the right combination:

| Bug type | Primary tool | Why |
|----------|-------------|-----|
| Visual/UI (layout, styling, state) | **Claude in Chrome** (real browser, has cookies) | Sees what the user sees, auth-aware |
| Network/API (wrong response, 4xx/5xx) | **Chrome DevTools MCP** (headless) | Network panel, console logs, no auth needed for public routes |
| E2E flow (multi-step, navigation) | **Playwright** | Scriptable, repeatable, becomes the canary test |
| Two-party flow (sender + recipient) | **Playwright multi-context** or **Claude in Chrome + incognito** | Each party needs its own session |
| DB/RLS (wrong data, permission denied) | **curl REST API** or **Supabase MCP** (test DB) | Direct data verification, no UI needed |
| Auth/token (expired, consumed, wrong scope) | **Playwright** with test account + **curl** for token state | Token lifecycle needs both browser and API |
| Server-side (edge function, webhook) | **curl** + **console logs** | No browser needed |

**Two-party infrastructure:** For bugs in flows involving two users (letter sender/recipient, story creator/responder):
- **Playwright:** Use `browser.newContext()` for each party — separate cookies, separate auth
- **Claude in Chrome:** Use main window for party A, incognito for party B
- **Test accounts:** Check `e2e/` fixtures and `.env.local` for existing test credentials before creating new ones
- **Service role:** For verifying DB state across both parties, use service role key from `.env.local`

**Auth-gated pages:** Chrome DevTools MCP is headless with no cookies — blank page on auth routes. Use Claude in Chrome (real browser) or Playwright with test accounts.

---

## Workflow

### Phase 0: Setup + Context Load

**Phase 0.pre: Ensure spec exists**

If inline description (no P-number): invoke `/create-bug` first from main (w0) to file a tracked spec. Then continue with the resulting P-number.

**Phase 0.0: Branch management**

`/reproduce` does NOT create worktrees. It runs on the current branch (typically `main`). The canary test and spec updates are committed to `main`. When `/fix` later creates a worktree, it branches from `main` and picks up the canary test automatically.

**Exception:** If you're already in a worktree for this bug (e.g., `/fix` was attempted and failed, sending you back to `/reproduce`), stay in the worktree.

**Phase 0.1: Context load**

1. Read the full bug spec — reproduction steps, symptoms, affected files, any prior root cause notes.
2. **Status gate:** If spec shows `status: qa` or `status: done` → STOP. "P{N} is already at {status}. Nothing to reproduce."
3. Read the source file(s) mentioned in the spec. Verify current state matches assumptions.
4. If bug involves DB: read schema from `docs/technical/database.md` and relevant migration files. Do NOT query live DB for schema discovery.

**Phase 0.2: Pipeline Stamp (P659)**

1. Read spec frontmatter.
2. Set `delivery_stage: reproduce` and `status: in-progress`.
3. Append `reproduce` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, reproduce]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [reproduce]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `reproduce` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

### Phase 1: Root Cause Hypothesis

**Goal:** Form a testable hypothesis about why the bug exists.

**Steps:**
1. Read the code paths involved in the bug. Trace from user action to symptom.
2. Form 1-3 hypotheses, ranked by likelihood.
3. For each hypothesis, name the **cheapest disproof** — the single test/query/check that would kill it fastest.

**Output:**
```
## Root Cause Analysis

**Hypothesis 1** (most likely): [description]
Cheapest disproof: [specific command/query/check]

**Hypothesis 2**: [description]
Cheapest disproof: [specific command/query/check]

→ Run cheapest disproof for H1?
```

4. **Wait for user approval** before running expensive checks. Run cheap ones (<10 seconds) immediately.
5. Execute the disproof. If hypothesis survives, it's confirmed. If killed, move to next hypothesis.
6. If all hypotheses killed: report "All hypotheses disproved. Recommend deeper investigation with debugging protocol." Do NOT proceed to Phase 2.

**Hard rule:** A hypothesis that survives one disproof is "confirmed for now" — not "proven." State confidence level.

---

### Phase 2: Live Reproduction

**Goal:** Trigger the bug reliably and capture evidence.

**Steps:**
1. Select tool(s) based on bug type (see Tool Selection Lens above).
2. Follow reproduction steps from spec. If steps are vague, refine them as you go.
3. Capture evidence:
   - **Visual bugs:** Screenshot showing the symptom
   - **Data bugs:** Query output showing wrong state
   - **Flow bugs:** Step-by-step log of what happened vs. what should have happened
   - **Error bugs:** Console output, network response, or error message

   **Redact real names before writing evidence into the spec (public repo).** Live reproduction surfaces real participant data — screenshots, prod `live_state`/query output, console logs with display names. When evidence goes into the spec body, write people as roles (`creator`/`joiner`/`host`/`partner`/`founder`); keep only session code + profile UUIDs. The pre-commit privacy gate is allowlist-based and won't catch a real name (decisions.md 2026-06-12 [process]; P929/P933/P934).

**Output:**
```
Bug reproduced: [yes/no]
Evidence: [screenshot path / query output / error message]
Reproduction rate: [100% / intermittent — N/M attempts]
Refined reproduction steps:
1. [step]
2. [step]
3. Bug occurs: [what happens]
```

**If can't reproduce after 3 attempts:**
- Flag: "Unable to reproduce after 3 attempts. Possible causes: [list]. Recommend: [next investigation step]."
- Do NOT proceed to Phase 3. The user decides whether to dig deeper or close.

---

### Phase 2b: Surface + Scenario Audit

**Goal:** Find every place and every way this bug can occur — not just the reported one.

This phase has two tracks. Run the one that fits the bug type; run both if the bug straddles both.

---

#### Track A — Surface Audit (UI/layout/rendering bugs)

**Why:** UI behavior bugs almost always affect multiple components. Fixing only the reported surface leaves the bug alive elsewhere and you file it again next month.

**Steps:**
1. Identify the core symptom as a grep pattern. Examples:
   - "position counts show 0" → grep for `PositionButtons`, `positionCounts`, `userPosition`
   - "button not highlighted" → grep for `useState.*null` near position rendering

   **If the symptom is a value being dropped (a prop/column/field not passed), invert the search.** Grepping the dropped identifier itself only finds sites where it IS present — a site that drops it has no occurrence of it to match (verified: `profile-page-v2.tsx:1745` passes `isPledger` but contains zero occurrences of `avatarColor` in that call). Instead, grep the **consumer anchor** — the component tag or query/RPC name (e.g. `grep -rn "<GravatarAvatar" src/`) — and inspect each hit for the field's absence. Never grep only the symptom's literal value either (e.g. `isPledger={false}`): a sibling site can have that part correctly wired while a different related field is still silently dropped (P1109: `isPledger` correct, `avatarColor` missing).
2. Search codebase for every component that renders the affected behavior.
3. For each match, assess: is the bug present here too?
3.5. **Completion check for dropped-value bugs (one pass, not a loop).** Re-run the consumer-anchor search from step 1 with no value literal and no prop filter, and diff that hit list against step 2's. Any site only the broader search found goes back through step 3 before it appears in the step-4 list. If the anchor returns more than ~100 hits, narrow by directory rather than reintroducing a value literal, and say so in the output.
4. Present the full list:

```
Surface audit: [symptom pattern]

Found on 3 surfaces:
  1. Profile > Points tab          (reported)
  2. Profile > Stories tab          (same pattern — affected)
  3. Point detail page              (different pattern — NOT affected)

Which do you want fixed in this ticket?
- Fix all affected now?
- Fix 1 now, defer others? (I'll create tickets immediately)
```

5. Wait for user confirmation before proceeding.
6. For deferred surfaces: create bug tickets NOW via `./scripts/next-p-number.sh`. "Out of scope" without a ticket number is not allowed.

**Skip Track A for:** Infrastructure bugs (build, CI, migrations), pure logic bugs with zero UI behavior.

---

#### Track B — Scenario Audit (auth/flow/async/security bugs)

**Why:** Guards that work for one scenario can be bypassed by a different trigger sequence. Fixing one scenario leaves identical guards broken in others — same bug, different path. This is how "it worked once, then broke again" happens.

**Use Track B when the bug involves:** authentication state, tokens, URL parameters, async timing, race conditions, multi-party flows, or any guard that checks a condition before allowing access.

**Steps:**
1. **Enumerate trigger scenarios** — all the ways a user could arrive at this code path. Ask:
   - Who could be logged in? (correct user / wrong user / anon / briefly-anon due to race)
   - What URL state could be present? (token, hash fragment, redirect param, error hash, expired token)
   - What async timing windows exist? (auth settling, SIGNED_OUT→SIGNED_IN flicker, RPC delay)
   - What data state variations exist? (null field, already-completed, unclaimed, mode=one-to-many vs 1-to-1)

2. **Map scenarios to guards** — for each scenario, trace which guard would fire. Name the exact line/condition.

3. **Find unguarded scenarios** — scenarios where no guard fires or the guard condition is false:

```
Scenario audit: [guard being tested]

Scenario 1: Wrong user, receiver_email set, auth settled        → guard fires (line 292) ✓
Scenario 2: Wrong user, receiver_email null                     → guard skipped (null check) ✗
Scenario 3: Wrong user, auth briefly null (race condition)      → guard skipped (currentUser null) ✗
Scenario 4: Wrong user, hash error fragment from expired OTP    → [need to trace] ?

Unguarded: scenarios 2, 3, 4 — all must be covered by fix or explicitly deferred with tickets.
```

4. Wait for user confirmation on scope before proceeding.
5. For deferred scenarios: create bug tickets NOW. "Out of scope" without a ticket number is not allowed.

**Output:**
```
Scenario audit complete.
In scope for this ticket: [scenario 1, 2, 3]
Deferred (tickets created): [P-XXX: scenario 4]
Canary test must cover: [all in-scope scenarios]
```

**Skip Track B for:** Pure UI/layout bugs with no guard logic, no async state, no auth.

---

> **Note:** This is the authoritative surface/scenario audit. `/fix` Phase 1b references this phase as fallback for legacy specs. The canary test in Phase 3 must cover all in-scope items from both tracks.

---

### Phase 3: Write Canary Test

**Goal:** A test that FAILS now (proving the bug exists) and will PASS after the fix.

**Hard gate:** Run the test BEFORE any fix code exists. It MUST fail. If it passes → the test is wrong or the bug isn't what you think. Loop back to Phase 1.

**Test selection:**
- **E2E test** (Playwright) — if bug affects user-visible behavior. File: `e2e/p{N}-reproduce.spec.ts`
- **Unit test** — if bug is in isolated function/logic. File: `src/tests/p{N}-reproduce.test.ts`
- **Integration test** — if bug involves DB/RLS/auth. File: `src/tests/p{N}-reproduce.test.ts`

**Critical rule:** Test the USER-VISIBLE SYMPTOM, not the code mechanism.

```typescript
// WRONG (tests mechanism — passes even when bug exists):
await expect(page.getByText('Test point')).toBeVisible()

// RIGHT (tests symptom — fails when bug exists):
await expect(countLabel).toHaveText('1')
await expect(agreeButton).toHaveAttribute('aria-pressed', 'true')
```

**For two-party bugs:** Test must set up both parties. Use Playwright's `browser.newContext()` for isolation:
```typescript
const senderContext = await browser.newContext({ storageState: senderAuth });
const recipientContext = await browser.newContext({ storageState: recipientAuth });
const senderPage = await senderContext.newPage();
const recipientPage = await recipientContext.newPage();
```

**Steps:**
0. **Before writing the test:** name where the function-under-test is invoked from in the UI (`grep -r "functionName" src/` — paste the result). If the call site is more than one step removed from the user action (e.g., button → handler → submitX), trace the chain explicitly. A test that never reaches the call site cannot prove the bug.
1. Write the test asserting the expected (correct) behavior.
2. Run it: `npx playwright test e2e/p{N}-reproduce.spec.ts` or `npm test -- src/tests/p{N}-reproduce.test.ts`
3. Confirm it FAILS with the right error (symptom-related, not setup-related).
4. If it passes → hypothesis is wrong. Return to Phase 1.
5. If it fails for the wrong reason (setup error, missing fixture) → fix the test setup, not the assertion.

**Output:**
```
Canary test: e2e/p714-reproduce.spec.ts
Result: FAILS (expected)
Failure message: Expected "1" but received "0"
                 ↑ confirms the bug: counts show 0

Test proves the bug exists. Ready for /fix.
```

---

### Phase 4: Write Reproduce Artifact

**Goal:** Stamp the spec so `/fix` knows reproduction is done.

Update the bug spec frontmatter:
```yaml
reproduce_artifact:
  test_file: e2e/p714-reproduce.spec.ts
  root_cause: "LetterReadingFlow passes consumed URL token to hook after auth — hook sets tokenExpired=true"
  confidence: high | medium
  surfaces_in_scope: [profile-points, profile-stories]
  surfaces_deferred: [P720, P721]
  surface_audit_anchor: "<GravatarAvatar"   # optional — set when Track A's dropped-value inversion ran; the consumer-anchor grep actually executed
  surface_audit_hits: 58                    # optional — count of sites the anchor returned
  reproduced_at: 2026-04-16
  post_fix_timeout: 20000   # optional (ms). Set when canary uses a tight timeout
                             # to prove staleness/no-update bug. /fix reads this
                             # and updates the assertion timeout before running.
```

> **`post_fix_timeout` rule:** When the canary assertion uses `toBeVisible({ timeout: N })` or `toHaveText()` with a short N (≤ 6000ms) to prove that an update does NOT appear within N ms — set `post_fix_timeout` to `expected_polling_interval + 5000`. This signals to /fix that the timeout is a staleness sentinel, not a UX budget.

Update spec body — add or update `## Root Cause` section with the confirmed hypothesis.

Commit: `chore(p{N}): reproduce — failing test + root cause confirmed`

**Tell user:**
```
Reproduction complete for P{N}.
- Root cause: [one-liner]
- Canary test: [file path] (FAILS — proves bug exists)
- Surfaces in scope: [list]

Next step: /fix p{N}
```

---

## Completion Criteria

Before marking reproduction as done:

- [ ] Root cause hypothesis stated and survived at least one disproof attempt
- [ ] Bug reproduced with observable evidence (screenshot, query output, or error log)
- [ ] Surface audit complete (or explicitly skipped with reason)
- [ ] Canary test written, runs, and FAILS for the right reason
- [ ] `reproduce_artifact` written to spec frontmatter
- [ ] Spec body updated with confirmed root cause
- [ ] Changes committed

**Never skip the failing test.** If you can't write one, you don't understand the bug.

---

## Relationship to Other Skills

```
/create-bug → /reproduce → /fix → /ship
                  ↑ YOU ARE HERE
```

**Before /reproduce:**
- `/create-bug` — files the spec (or `/reproduce` auto-invokes it for inline descriptions)
- `/screenshot-debug` — for initial triage from a screenshot when you don't yet have a spec or reproduction steps
- Debugging protocol (`docs/technical/debugging.md`) — for deep investigation when even hypotheses are hard to form
- `/slava:dd:frame-analyze` — when root cause is truly unclear and needs structured problem framing

**After /reproduce:**
- `/fix` — reads the `reproduce_artifact`, skips its own reproduce phases, goes straight to fixing code
- `/kdd` — capture learnings if root cause revealed patterns

---

## Examples

### Visual Bug (Chrome Extension)
```
/reproduce p714

Phase 1: Hypothesis: consumed token passed to hook after auth.
         Cheapest disproof: check if effectiveToken is undefined when authenticated.
         → Confirmed: token always passed regardless of auth state.

Phase 2: Reproduced via Claude in Chrome on localhost:5173/letter/read?token=abc
         Screenshot: ~/Screenshots/p714-expired-toast.png
         Rate: 100%

Phase 3: Canary test: e2e/p714-reproduce.spec.ts
         FAILS: Expected no error toast, got "This sign-in link has expired"

Phase 4: reproduce_artifact written. Next: /fix p714
```

### Two-Party Flow (Playwright)
```
/reproduce p700

Phase 1: Hypothesis: recipient sees stale sender name because fetch races with render.
         Cheapest disproof: add 500ms delay before assertion.
         → Confirmed: with delay, name resolves correctly.

Phase 2: Reproduced via Playwright with two contexts (sender + recipient).
         sender creates letter → recipient opens → sees "Someone" for 2s.
         Rate: 80% (timing-dependent)

Phase 3: Canary test: e2e/p700-reproduce.spec.ts
         Uses browser.newContext() for each party.
         FAILS: Expected "Alice" but received "Someone"

Phase 4: reproduce_artifact written. Next: /fix p700
```

### Data/RLS Bug (curl + Supabase)
```
/reproduce p707

Phase 1: Hypothesis: RLS blocks unverified users from reading positions.
         Cheapest disproof: query positions table as unverified user.
         → KILLED: unverified user CAN read. Wrong hypothesis.

         Hypothesis 2: Missing join in position count RPC.
         Cheapest disproof: compare RPC output vs direct query.
         → Confirmed: RPC returns 0, direct query returns 3.

Phase 2: Reproduced via curl against test DB.
         Rate: 100%

Phase 3: Canary test: src/tests/p707-reproduce.test.ts
         FAILS: Expected count 3, got 0

Phase 4: reproduce_artifact written. Next: /fix p707
```
