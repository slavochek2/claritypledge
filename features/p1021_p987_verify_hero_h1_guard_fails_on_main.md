---
status: backlog
type: bug
rank: 203
severity: medium
date_reported: '2026-07-31'
created_date: '2026-07-31'
tags: [tests, landing, program-page, e2e, regression-guard]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1021: `p987-verify` hero h1 guard fails on main — a landing regression guard is dead

## Summary

`e2e/p987-verify.spec.ts:19` ("UAT-1/2/5/6/8: hero, CTA, stat, closing, pledge link present") fails on `main` — its `main >> h1` hero locator finds no element, so the homepage's hero-copy regression guard has been silently dead for some time.

## Root Cause

**Under investigation.** What is established:

- The failure is on `main`, reproduced independently of any feature branch. Surfaced while classifying an unrelated failure during P1017's fix; **not** introduced by P1017, whose diff touches only `intro-page.tsx`.
- The failing locator is `locator('main').locator('h1').filter({ hasText: /Keep the hire you can't/i })` → "element(s) not found".
- The copy **is** present in source: `src/app/pages/program-page.tsx:267` renders `Keep the hire you can't` with `afford to lose.` on line 270.
- A `<main>` element **does** wrap page content (`clarity-landing-layout.tsx:114`).
- A sibling assertion in `e2e/landing-no-horizontal-scroll.spec.ts` using `page.getByText(/Keep the hire you can't/i)` **passes** against the same route.

So the copy renders and `<main>` exists, but the `main >> h1 >> hasText` composition does not match. The gap is in one of: the apostrophe character (typographic `’` in the DOM vs straight `'` in the test regex), the hero heading not actually being an `h1` at the test viewport, or the heading rendering outside that `<main>`. **Each is a one-command check; none has been run.**

The sibling test passing while this one fails points hardest at the locator composition, not at missing copy.

## Reproduction Steps

1. `cd` to the main repo on branch `main`.
2. `npx playwright test e2e/p987-verify.spec.ts --project=chromium`
3. Observe: 1 failed, 4 passed.

**Reproduction rate:** 100% (confirmed on `main`, including the automatic retry).

## Expected Behavior

The guard passes on `main`, and fails only when the hero copy actually regresses.

## Actual Behavior

The guard fails unconditionally, so it can no longer detect a hero regression. Worse than a missing test: it reads as coverage on the board while proving nothing, and it trains anyone who runs the suite to treat a red result as normal.

## Affected Files

- `e2e/p987-verify.spec.ts:19` — the failing assertion
- `src/app/pages/program-page.tsx:261-270` — the hero heading it targets
- `src/app/layouts/clarity-landing-layout.tsx:114` — the `<main>` the locator scopes to

## Severity

**Medium** — no user-facing defect; the page renders correctly. The cost is a false-green regression guard on the primary landing page and a red suite that normalises ignoring failures.

## Fix Approach

1. Determine which of the three candidates above is the cause — dump the hero's `outerHTML` and its ancestor chain at the test viewport. Do this **before** editing anything.
2. Fix the **locator**, not the copy — the copy is correct and decisions.md 2026-07-16 / the P987 entries make the current hero wording deliberate.
3. If the cause is the apostrophe, the regex must tolerate both forms (`can[''']t`) rather than pinning one — the same trap will otherwise recur on the next copy edit.

**Do not** relax the assertion to `getByText` scoped to the page. That would make it pass without restoring what it was guarding: that the hero copy is in an `h1`, inside `main`. Tests are specs (`.claude/rules/tests.md`) — fix the locator so it tests the same contract, don't weaken the contract to match a broken locator.

## Acceptance Criteria

- [ ] Root cause named, with the command output that established it
- [ ] `npx playwright test e2e/p987-verify.spec.ts` passes on `main`
- [ ] The guard is proven to still fire: temporarily alter the hero copy, confirm the test goes red, revert (epistemic gate 7 — a gate you have not seen fail is unproven)
- [ ] The assertion still requires an `h1` inside `main` — the contract is unchanged
