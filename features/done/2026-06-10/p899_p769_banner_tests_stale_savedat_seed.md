---
status: all-done
type: bug
rank: 1000788.0
severity: medium
workstream: live
date_reported: '2026-06-05'
created_date: '2026-06-05'
tags: [e2e, test-infra, live-session, banner]
pipeline_ran: [create-bug, fix, ship]
completed_at: 2026-06-10
---

# P899: p769 banner e2e tests seed stale `savedAt` field — 2 hard failures on main, 2 vacuous passes

## Summary

`e2e/p769-session-end-terminal-authority.spec.ts` seeds `cp_active_session` localStorage with a `savedAt` field at 3 live sites, but `getActiveSessionFromStorage` requires `timestamp` (`src/app/contexts/live-session-context.tsx:34`) and silently returns null on mismatch — the ActiveSessionBanner never renders, so 2 banner-presence tests hard-fail on main today and 2 banner-absence tests pass vacuously (found during P888's KDD critic pass).

## Root Cause

`StoredActiveSession` (`live-session-context.tsx:7-14`) requires `timestamp: string` (ISO 8601); the shape validator at line 34 (`if (!parsed.code || !parsed.role || !parsed.timestamp) return null;`) rejects entries without it — silently, no error. The p769 seeds use `savedAt` instead (a field name that survives only in placeholder comments of `e2e/p511-session-resilience.spec.ts` and commented-out blocks of `src/tests/sessionResilience.test.ts`). Seeded entries never validate → `useActiveSession` reports no active session → banner never renders.

Same mechanism as the P888 session's first p888-7 draft (fixed there by reading the interface; documented in `docs/technical/e2e-testing-guide.md` "Seeding the ActiveSessionBanner").

## Reproduction Steps

1. On main, run: `npx playwright test e2e/p769-session-end-terminal-authority.spec.ts --grep "Banner" --reporter=list > /tmp/p769.log 2>&1`
2. Observe 2 hard failures (both attempts):
   - "author ends session from ActiveSessionBanner — banner disappears ≤1s; partner on /live sees ended screen within 3s" (End Session button never visible — banner absent)
   - "creator clicks End Session then navigates to /letters during upload — no banner" (P775 describe)
3. Observe 2 passes that assert banner ABSENCE — "partner visits /letters — no ActiveSessionBanner after session ended" and the joiner-path P775 test — which pass even before any session-end logic runs, because the broken seed alone guarantees no banner (vacuous pass).

**Reproduction rate:** 100% (verified on main 2026-06-05, exit 1, failures on both attempts — not load-related flake; distinct from P893)

## Expected Behavior

All four banner tests exercise a rendered ActiveSessionBanner: presence tests see the banner and its End Session button; absence tests prove the banner disappears BECAUSE the session ended, not because the seed never validated.

## Actual Behavior

Banner never renders in any of the four tests. Presence tests fail; absence tests pass for the wrong reason (no regression protection).

## Affected Files

- `e2e/p769-session-end-terminal-authority.spec.ts:131, 374, 671` — live `savedAt` seeds → replace with `timestamp: new Date().toISOString()`
- `e2e/p511-session-resilience.spec.ts:351` — live seed in a placeholder-assertion test (`expect(true).toBe(true)`); fix the field while touching, low impact
- Comment-only references (sweep opportunistically, no behavior change): `e2e/a11y/p511-accessibility.spec.ts:48`, `src/tests/sessionResilience.test.ts:155,172,208-243`
- Reference pattern: `docs/technical/e2e-testing-guide.md` — "Seeding the ActiveSessionBanner (P888 pattern)" section

## Severity

**Medium** — no user-facing impact, but 2 tests guarding session-end UX (P769/P775 regressions) are red on main and 2 more provide illusory coverage; red-on-main tests also pollute every verification batch (compounds P893 triage noise).

## Fix Approach

1. Replace `savedAt` → `timestamp` at the 4 live seed sites (p769 ×3, p511 ×1).
2. Re-run the full p769 spec: the 2 presence tests must go green; for the 2 absence tests, verify non-vacuity — temporarily assert the banner IS visible after seeding (before the end-session step) or confirm via trace that the banner rendered pre-assertion.
3. Sweep the comment-only `savedAt` references to `timestamp` so the stale name can't be copied again (the P888 incident and this bug share that exact vector).
4. If any test still fails after the seed fix, classify against P893 (parallel-load race) before changing anything else.

## Acceptance Criteria

> **Reconciliation (2026-06-10 — investigation).** The original AC#1 assumed the `savedAt` seed was p769's *only* source of redness. The full-suite run disproved that: 5 p769 tests fail on the session-ENDED state, **3 of which use no seed** and are therefore unaffected by this fix. That is a separate session-end propagation regression, now tracked as **P921** (DB-drift, stale-server, and P893 all falsified there). AC#1 is down-scoped to this spec's actual scope (the seed bug); "full p769 green" moves to P921.

- [x] `savedAt → timestamp` at all live seeds — the seeded ActiveSessionBanner now validates and renders. **Evidence:** presence test @110 advanced from failing at the End Session *button* (`getByRole('button', /end session/i)` — banner never rendered) to failing *downstream* at the partner ended-screen (`:151`) — banner renders, button clicked. *(Full p769 green → P921; the residual failures are a separate session-end regression, not this fix.)*
- [x] The banner-absence tests are no longer vacuous — @736 (P775 joiner) renders the banner (End Session visible) before asserting absence; @347 now passes via real ended-session suppression instead of seed-validation short-circuit. *(Literal "render-then-disappear" for the realtime path is covered by P921.)*
- [x] `grep -rn "savedAt" e2e/ src/` returns zero hits — verified.
- [x] No console errors during the affected flows — `P769 smoke: /live page loads without console errors` passes.
