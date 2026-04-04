---
status: all-done
completed_at: "2026-04-03"
type: task
rank: 0.008
superseded_by: p644
flow: dev
tags:
  - testing
  - e2e
  - infra
created_date: 2026-04-03T00:00:00.000Z
---

# P636: Two-Party E2E State Advancement Helper

## Problem Statement

Two-party /live session E2E tests hit a 30s Playwright timeout when driving multi-step flows through the UI across isolated browser contexts. Supabase Realtime does NOT propagate between Playwright's isolated `browser.newContext()` — each context has its own WebSocket subscription. The only cross-context sync mechanism is: DB poll → page.reload() → wait for render, which takes ~5s per step.

**Concrete example (P617 UAT-6):** A full round requires: host clicks Speak → host submits rating → guest reloads + submits → both reload for results → both click Continue → both reload for idle. That's 6+ reload cycles at ~5s each = 30-40s, exceeding the 30s global test timeout. The browser context gets killed mid-test.

**Workaround discovered during P617:** Write intermediate `live_state` directly to DB via `supabaseAdmin`, then reload once. This cut UAT-6 from 30s+ (timeout) to <10s (passing). But the pattern was hand-rolled inline in the test file — not reusable.

## Context

**Discovery session:** `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/593ee69e-4fbe-461d-b2af-44f00b84661c.jsonl`

Key commits on `feature/p617-mode-switcher-lifecycle` (worktree w1):
- `c6c76375` — UAT-3 disabled mode switcher verified via CSS class assertion
- `6aee1a92` — UAT-6 solved via DB-driven state pattern (the workaround)

Relevant files:
- `e2e/helpers/test-realtime.ts` — existing DB poll helpers (`waitForDBPresence`, `waitForDBStateKey`)
- `e2e/helpers/test-session.ts` — `createTwoPartySession()` fixture
- `e2e/p617-mode-switcher-lifecycle.spec.ts` — working example of the pattern (UAT-6 test)

## Proposed Solution

### `advanceSessionState()` helper

Add to `e2e/helpers/test-realtime.ts`:

```typescript
/**
 * Advance a live session's state by writing directly to DB via supabaseAdmin.
 * Use this to skip multi-step UI flows in two-party tests where Realtime
 * doesn't propagate between isolated browser contexts.
 *
 * After calling this, reload the page(s) that need to pick up the new state.
 *
 * @param sessionCode - The session room code
 * @param stateOverrides - Partial LiveSessionState to merge into live_state
 */
export async function advanceSessionState(
  sessionCode: string,
  stateOverrides: Record<string, unknown>,
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', sessionCode)
    .single();
  const current = (data?.live_state as Record<string, unknown>) ?? {};
  await supabaseAdmin
    .from('clarity_sessions')
    .update({ live_state: { ...current, ...stateOverrides } })
    .eq('code', sessionCode);
}
```

### State preset factories

Common test scenarios as one-call presets:

```typescript
/** State after speaker clicks Speak (Step 2 in P617 flow) */
export function speakerInitiatedState(speakerName: string) {
  return { ratingInitiatedBy: speakerName };
}

/** State after full round completion — back to idle (Step 4) */
export function postRoundIdleState() {
  return {
    ratingPhase: 'idle',
    checkerName: undefined,
    checkerRating: undefined,
    responderRating: undefined,
    ratingInitiatedBy: undefined,
    checkerSubmitted: undefined,
    responderSubmitted: undefined,
    proverName: undefined,
    explainBackRatings: [],
  };
}

/** State mid-round: checker submitted, waiting for responder */
export function checkerSubmittedState(checkerName: string, rating: number) {
  return {
    ratingPhase: 'waiting',
    checkerName,
    checkerRating: rating,
    checkerSubmitted: true,
    ratingInitiatedBy: checkerName,
  };
}
```

### Usage example (refactoring P617 UAT-6)

```typescript
// Before: 6+ reloads, 30s+ timeout
// After: 1 DB write + 1 reload, <10s
await advanceSessionState(session.sessionCode, postRoundIdleState());
await host.page.reload();
await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });
```

## Acceptance Criteria

- [x] `advanceSessionState()` added to `e2e/helpers/test-realtime.ts`
- [x] At least 2 state preset factories (post-round-idle, checker-submitted)
- [ ] P617 UAT-6 refactored to use the new helper (removes inline DB logic) — deferred: test file only exists on `feature/p617-mode-switcher-lifecycle` (w1), not main
- [x] All existing E2E tests still pass
- [x] Helper documented in `docs/technical/e2e-testing-guide.md`

## Scope Fence

**What NOT to build:**
- Shared Realtime between contexts (Playwright architecture limitation)
- Custom WebSocket relay (over-engineering)
- Changes to `playwright.config.ts` timeout (treats symptom, not cause)

**What this enables (future features):**
- Any two-party E2E test can skip to any session state in 1 DB call
- Multi-round tests become feasible (currently impossible in 30s)
- Agent-driven `/verify` can cover UAT-8 through UAT-11 for P617 and similar features
