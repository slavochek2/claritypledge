---
status: week
type: bug
rank: 1000789.0
severity: high
workstream: live
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags: [e2e, test-infra, live-session, session-end, p769, regression]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P921: p769 session-end state does not propagate — 5 ended-state tests fail (serial + parallel)

## Summary

The full `e2e/p769-session-end-terminal-authority.spec.ts` suite fails **5 tests, identically in parallel AND serial** (`--workers=1`). Every failing assertion waits for the **session-ENDED state** — either the "this session has ended" heading on `/live`, or `clarity_sessions.live_state.sessionEnded = true` polled directly via service-role. Tests that do not assert ended-state all pass. The `complete_clarity_session` RPC and the app call/read sites are verified correct, so the failure is a runtime propagation gap, not a missing migration or test-seed bug.

**Discovered during P899** (savedAt→timestamp seed fix). P899's seed bug was *masking* this: two seed-based tests (@110, @647) used to fail at the banner (seed never validated); once the seed was fixed they render the banner and now fail downstream at the same ended-state point as three no-seed tests.

## Failing tests (line refs as of 2026-06-10)

| Test | Seed? | Fails at |
|------|-------|----------|
| @110 author ends from ActiveSessionBanner → partner sees ended screen | yes (now valid) | partner "this session has ended" heading (`:151`, via `waitForUIUpdate`) |
| @279 partner navigates to /live/{code} already-ended → ended screen | no | ended heading (`:306`) |
| @401 both host+guest empty clarity_live_* sessionStorage within 5s | no | (`:441`) |
| @647 partner refreshes /live within 5s — no RejoinPrompt flash; ended ≤3s | yes (now valid) | ended screen reconciliation (`:687`) |
| @700 (P775) creator clicks End Session then navigates — no banner | no | `waitForDBStateKey live_state.sessionEnded=true` direct DB poll (`:730`, 10s timeout) |

Passing ended-related tests for contrast: @347 (ended-session suppression — banner correctly hidden), @736 (P775 joiner — explicitly does NOT assert sessionEnded; joiner path uses clearSessionJoiner + cancelLiveInvite, not terminate).

## Root Cause

**UNKNOWN — needs `/reproduce` with two-party runtime tracing.** This spec captures what has been ruled OUT so the next pass does not repeat it.

**Ruled out (with evidence):**
- **P899 savedAt seed bug** — fixed and verified; @110 advanced from failing-at-EndSession-button to failing-downstream (banner renders). Not the cause of the 5 ended-state failures.
- **Test-DB migration drift** — FALSIFIED. Read the live test DB function directly (Management API `pg_get_functiondef`): `public.complete_clarity_session` is the correct P769 version — it merges `{sessionEnded:true, sessionEndedAt}` into `live_state` and sets `status='completed'` (`sessionEnded`×3, `live_state`×3, `target_listener_id` present). The `20260420140000_p769_complete_clarity_session_sets_session_ended` migration IS effectively applied to test.
- **Stale dev server** — FALSIFIED. `lsof :5400` empty after runs → Playwright booted+tore-down its own fresh server each invocation, serving current app code (w4 only changed test files, so app code == main).
- **P893 parallel-load race** — FALSIFIED. Fails identically at `--workers=1`. (P893 is `all-done` and scoped to p660/p665, not p769.)

**App code verified present and correct (not yet runtime-traced):**
- `src/app/data/api.ts:4292` `completeClaritySession()` calls `supabase.rpc('complete_clarity_session', …)` and throws on error (covered by `src/tests/p769-terminate-session.test.ts`).
- `src/app/data/api.ts:1156` ended-detection reads `liveState?.sessionEnded === true || liveState?.joinerEnded === true`.

**Open split (the actual investigation):**
- @279 calls the RPC *directly* via `supabaseAdmin` (service-role, function confirmed to set the state) yet the app does not render the ended screen → points at the `/live` **read/render** path.
- @700 ends via the *app* (authenticated creator) yet the direct DB poll never sees `sessionEnded=true` → points at the app **not reaching/calling** the RPC at runtime, or the call erroring.
These two sub-symptoms may share one cause or be two. The trace must distinguish them.

## Reproduction Steps

```bash
cd <cp-root>   # or a worktree
npx playwright test e2e/p769-session-end-terminal-authority.spec.ts --workers=1 --reporter=list > /tmp/p921.log 2>&1
grep -E "[0-9]+ (passed|failed)" /tmp/p921.log   # → 5 failed, 7 passed
```
Reproduction rate: 100% (serial and parallel, 2026-06-10).

## Suspects

Recent churn in the `/live` path that could be a regression source — bisect these first:
- `abecd6d5 fix(p892): record completed /live rounds despite abandoned celebration handshake`
- p827 series (`7f3e500f`, `cd71c642`, `12efddc1`) — /live preload + rating-state guards.

## Severity

**High — prod impact UNCONFIRMED.** If real, End Session may not propagate the ended state to the partner (partner never sees "this session has ended"), which is a user-facing session-end failure. But it may also be a test-only timing/harness issue. The `/reproduce` trace must establish prod-impact before escalating.

## Affected Files (to investigate, not yet edited)

- `e2e/p769-session-end-terminal-authority.spec.ts` — the 5 failing tests (and `e2e/helpers/test-realtime.ts:305` `waitForUIUpdate`, `:236` `waitForDBStateKey`)
- `src/app/pages/clarity-live-page.tsx` — ended-screen detection/render on `/live` (`sessionEnded`, `sessionEndedOnLoad` state)
- `src/app/data/api.ts` — `completeClaritySession` (~4292), ended-detection (~1156)
- `src/app/components/session/session-ended-screen.tsx` — the ended screen

## Next Step

`/reproduce p921` — two-party flow trace: in a `createTwoPartySessionRealistic` session, capture (a) the End Session network request (is `complete_clarity_session` called? does it 200?), (b) the `live_state` row immediately after, (c) the partner page's console + whether the realtime/drift update arrives. Then bisect the p892/p827 commits if a regression is confirmed.

## Acceptance Criteria

- [ ] Root cause identified and framed as hypothesis + disproof (per epistemic gate)
- [ ] `npx playwright test e2e/p769-session-end-terminal-authority.spec.ts --workers=1` passes (5 currently-failing ended-state tests green)
- [ ] Prod-impact determined: confirmed user-facing regression (escalate) OR test-only (note and de-risk)
- [ ] If a regression: the offending commit identified and a regression test added that would have caught it
