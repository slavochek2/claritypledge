---
status: today
type: task
rank: 1
tags:
  - testing
  - e2e
  - infra
  - quality-gate
  - p617
  - p638
  - p643
created_date: 2026-04-04T00:00:00.000Z
---

# P644: Two-Party Test Infrastructure — Fix the Tests Before Fixing the Code

## Problem

The /live E2E test infrastructure produces false passing results. Tests pass, features are broken. This has happened across 5 implementation sessions over 6 days. **Until the test infrastructure can reproduce real browser behavior, every /live bug fix is unverifiable.**

### Why current tests are structurally unable to catch /live bugs

| What tests do | What real browsers do | Gap |
|---|---|---|
| `page.reload()` after DB poll — loads full state from DB | Rely on Realtime WebSocket + drift polling | Tests bypass the delivery mechanism entirely |
| `createTwoPartySession` pre-inserts both users in DB | Guest joins mid-session via join flow | Tests bypass subscription timing + `hasJoinerRef` guards |
| Assert DOM state after forced sync | State arrives (or doesn't) via Realtime/polling | Tests prove "can render" not "does deliver" |
| Both pages navigate simultaneously | Guest joins later, subscription establishes asynchronously | Tests miss Realtime channel establishment window |

### Impact

Every /live bug fix follows the same pattern:
1. Agent writes fix
2. Agent runs tests → all pass
3. Agent declares "done"
4. User tests manually → nothing works
5. New investigation reveals different layer was broken
6. Repeat

This has consumed **5 full sessions** on the same 4 bugs (P617, P626, P637, P638). The bugs aren't in the logic — `getViewState()` is correct. The bugs are in state delivery, and the tests can't test delivery.

## Requirements

### 1. `waitForUIUpdate()` helper (replaces `page.reload()`)

```typescript
// e2e/helpers/test-realtime.ts
export async function waitForUIUpdate(
  page: Page,
  locator: Locator,
  timeoutMs: number = 20000,
): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
}
```

No `page.reload()`. If state doesn't arrive through the app's own mechanisms, the test fails — which is the point.

### 2. `createTwoPartySessionRealistic()` helper

A new fixture that mimics the real join flow:
1. Create session with host only (no `joiner_name`)
2. Navigate host to `/live/{code}`
3. Wait for host's Realtime subscription to establish (`SUBSCRIBED` status)
4. THEN navigate guest to `/live/{code}` (simulating late join)
5. Wait for guest's Realtime subscription to establish
6. Return both pages + cleanup

This exercises the real subscription timing + `hasJoinerRef` guard path.

### 3. Drift detection completeness test

```typescript
// src/tests/drift-detection-completeness.test.ts
const DRIFT_CHECKED_FIELDS = [/* fields from clarity-live-page.tsx drift block */];
const UI_AFFECTING_FIELDS = [/* all fields that change what users see */];

it('drift detection covers all UI-affecting fields', () => {
  const missing = UI_AFFECTING_FIELDS.filter(f => !DRIFT_CHECKED_FIELDS.includes(f));
  expect(missing).toEqual([]);
});
```

### 4. `advanceSessionState()` helper (from P636)

```typescript
export async function advanceSessionState(
  sessionCode: string,
  stateOverrides: Record<string, unknown>,
): Promise<void> {
  // Read current, merge, write back via supabaseAdmin
}
```

For skipping to specific session states without multi-reload chains.

### 5. Ban `page.reload()` in two-party tests

Add to `.claude/rules/tests.md`:
```
## Two-Party Helpers

Available in `e2e/helpers/test-realtime.ts` and `e2e/helpers/test-session.ts`:

- `waitForUIUpdate(page, locator, timeoutMs?)` — waits for a DOM element to appear via
  the app's own delivery (Realtime + drift polling). Use instead of page.reload().
- `advanceSessionState(sessionCode, overrides)` — writes live_state directly to DB.
  Use to skip multi-step UI flows without reload chains.
- `createTwoPartySessionRealistic(browser)` — creates a session with proper join-flow
  timing: host subscribes first, guest joins later.

## Two-Party Test Rule

Never use page.reload() to sync state in two-party /live tests.
Use waitForUIUpdate() instead — if state doesn't arrive via the app's own
delivery mechanisms, the test must fail.

Full guide: docs/technical/e2e-testing-guide.md (Two-Party Sessions section)
```

### 6. Auth injection guard — no Google OAuth in tests

`getTestAuthContext()` injects Supabase tokens into localStorage via `addInitScript`. When this fails silently (race condition), the page redirects to Google OAuth — a dead end for Playwright. Tests should never encounter Google Sign In.

Add a post-navigation guard to `createTwoPartySession` (and `createTwoPartySessionRealistic`):
- After navigating to `/live/{code}`, verify the page URL is NOT a Google/OAuth redirect
- If auth failed, throw immediately with a clear error ("Auth injection failed — page redirected to login") instead of timing out 20s later on a missing locator
- Also dismiss "Updated Terms" dialog inside the helper (currently every test does this ad-hoc)

### 7. Fix wrong Realtime comment in `test-realtime.ts`

The file header (lines 5-13) claims "Supabase Realtime presence events do NOT propagate between Playwright's isolated browser contexts." This is wrong — ClarityPledge uses `postgres_changes` (DB-level, WAL-based), not `presence` (connection-scoped). Cross-context delivery works. The P644 verification experiment confirmed state delivery via the app's own mechanisms without `page.reload()`.

Update the comment to accurately describe what works and what doesn't.

### 8. Convert existing P617/P638 tests

Refactor the 3 tests in `p617-mode-switcher-lifecycle.spec.ts` that use `page.reload()` to use `waitForUIUpdate()` instead. If they fail — that's evidence of a real bug, not a test to fix.

## Acceptance Criteria

- [x] `waitForUIUpdate()` helper exists in `e2e/helpers/test-realtime.ts`
- [ ] `createTwoPartySessionRealistic()` helper exists in `e2e/helpers/test-session.ts`
- [x] `advanceSessionState()` helper exists in `e2e/helpers/test-realtime.ts`
- [ ] Drift detection completeness unit test exists and passes
- [ ] `.claude/rules/tests.md` Two-Party Helpers section added (positive usage guidance + ban)
- [ ] `docs/technical/e2e-testing-guide.md` Two-Party Sessions section added (usage examples)
- [ ] Auth injection guard: post-navigation URL check + clear error on redirect (no Google OAuth in tests)
- [ ] Terms dialog dismissal baked into `createTwoPartySession` (not ad-hoc per test)
- [ ] `test-realtime.ts` header comment corrected (postgres_changes DO propagate across contexts)
- [ ] At least 3 existing P617 tests converted from `reload()` to `waitForUIUpdate()`
- [ ] If converted tests FAIL — that's a PASS for this spec (proves the infra works)

## Scope

**In scope:** Test helpers, test rules, test conversion, agent discovery docs
**Out of scope:** Fixing P643 bugs — that happens AFTER this infrastructure is in place

## References

- **Root cause analysis:** `.private/thinking/t010_p617_systemic_failure.md`
- **Discovery session:** `~/.claude/projects/-Users-slavochek-Projects-public-claritypledge/593ee69e-4fbe-461d-b2af-44f00b84661c.jsonl`
- **Predecessor specs:** P636, P637 (partially implemented), P638
- **Bug to fix after this:** P643
- **Subsumes:** P636 (`advanceSessionState`), P637 (no-reload sync) — consolidates both into one actionable spec
