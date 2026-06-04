---
status: week
type: bug
rank: 1000783.0
severity: medium
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [e2e, test-infra, letters, race-condition]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P893: p660/p665 e2e suites fail under default parallel load (pre-existing races, not flake noise)

## Summary

9 tests across `e2e/p660-letters-nav.spec.ts` (all 5) and `e2e/p665-letter-immersive.spec.ts` (AC8/9/11/12) fail deterministically-under-load: they fail BOTH attempts (failed, not flaky) when run as part of a multi-file parallel run at the default worker count, but pass at `--workers=2`. Verified pre-existing on main via controlled comparison during P888 verification.

## Root Cause

Under investigation — two distinct failure shapes observed, both races that parallel-load slowness exposes:

1. **Strict-mode nav duplicate (p660 "nav shows Letters"):** `locator('nav').getByText(/Letters/)` resolves to 2 elements — the desktop `SimpleNavigation` link AND the mobile bottom nav (`getByLabel('Mobile navigation')`) — once both are hydrated. On fast runs the assertion wins the race against `BottomNav` hydration (auth-gated render) and sees 1 element; under load, hydration completes first and strict mode throws. The locator is not strict-safe by design.
2. **Default-tab race (p660 "default tab is Drafts"):** `getByRole('tab', { name: /Drafts/i })` resolves with `aria-selected="false"` — another tab ends up selected after data load. Suspected: the letters page re-selects a tab once letter data arrives; under load the assertion window lands after the re-selection.
3. **p665 AC8/9/11/12 (preview flow):** first-attempt failure snapshots show the preview stuck at the cover stage ("Open the Letter") — content-progression timing under load; assertions use 3–10s timeouts that a contended dev server exceeds.

Common substrate: one shared Vite dev server serving N parallel Playwright workers.

## Reproduction Steps

1. From the repo root (or any worktree), run a multi-file letter-suite batch at default worker count:
   `npx playwright test e2e/p660-letters-nav.spec.ts e2e/p665-letter-immersive.spec.ts e2e/p700-letter-overview.spec.ts e2e/p699-letter-results-sender.spec.ts e2e/p699-letter-results-receiver.spec.ts e2e/p694-letter-not-found-flash.spec.ts`
2. Observe: the 9 tests fail (both attempts — listed under `failed`, not `flaky`)
3. Re-run only the two files at `--workers=2`: `npx playwright test e2e/p660-letters-nav.spec.ts e2e/p665-letter-immersive.spec.ts --workers=2`
4. Observe: all pass (one intermittent retry-pass possible, e.g. p665 AC7)

**Reproduction rate:** 100% at default worker count in 6–8-file batches (reproduced twice on feature/p888-letter-results-nav, once on main, same 9 tests each time)

## Expected Behavior

Letter-suite e2e tests pass at the default worker count regardless of how many spec files run in the batch. A multi-file verification run is trustworthy without manually capping workers.

## Actual Behavior

Same-batch evidence (P888 verification session):

- main: 66 passed / 10 failed (the 9 + `p699 "top menu is visible"`, which was the P888 bug itself)
- feature/p888 branch: 75 passed / 9 failed (identical 9 — the p699 delta is the P888 fix)
- `--workers=2`: 18–19/19 pass

The 9 failures mask real regressions in letter-route suites: any verification batch reports failures that must be manually triaged against main each time.

## Affected Files

- `e2e/p660-letters-nav.spec.ts` — tests at lines 28, 45, 58, 86, 152 (all 5 in file)
- `e2e/p665-letter-immersive.spec.ts` — tests at lines 317, 349, 436, 459 (AC8/9/11/12)
- Suspected contributing: `playwright.config.ts` default worker count vs single shared dev server

## Severity

**Medium** — verification noise with a workaround (`--workers=2`); no user-facing impact, but it erodes trust in every letter-suite verification run and forces a main-baseline comparison to triage.

## Fix Approach

Per-test repair over global worker capping (capping hides the races, doesn't fix them):

1. p660 nav assertion: scope to the specific nav (`nav[data-nav="main"]` / `nav[data-nav="bottom"]`) so the locator is strict-safe regardless of hydration order.
2. p660 default-tab: anchor the assertion after the data-loaded state (await the tab list's settled selection signal), or assert against the URL-param-driven state the test actually controls.
3. p665 AC8/9/11/12: identify the cover→reading progression wait that's missing; replace fixed timeouts with state-anchored waits.
4. Only if per-test repair proves insufficient: consider config-level worker tuning, stated explicitly in the spec rather than silently.

## Acceptance Criteria

- [ ] The 6-file batch from Reproduction Steps passes at default worker count, run twice consecutively
- [ ] `e2e/p660-letters-nav.spec.ts` — all 5 tests listed above pass in that batch
- [ ] `e2e/p665-letter-immersive.spec.ts` — AC8/9/11/12 pass in that batch
- [ ] No assertion semantics weakened (strict-safe scoping and state-anchored waits only; no `.skip`, no `.only`, no timeout inflation as the primary fix)
- [ ] No console errors introduced in the affected flows
