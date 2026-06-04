---
status: in-progress
type: bug
rank: 1000778.0
severity: medium
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [letters, navigation, regression, focus-page]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/p888-letter-results-nav.spec.ts
  root_cause: "P852 isLetterPage = pathname.startsWith('/letter/') (clarity-landing-layout.tsx:66) sweeps /results + /overview, suppressing SimpleNavigation/top padding/banner; results page has no FocusHeader and StoryWalk's exit renders only on the last story → mid-walk dead-end"
  confidence: high
  surfaces_in_scope: [letter-results, letter-overview]
  surfaces_deferred: []
  reproduced_at: 2026-06-04
---

# P888: Letter results + overview pages lost top navigation (P852 prefix sweep)

## Summary

`/letter/:id/results` and `/letter/:id/overview` render with no top nav — a regression from P852's `startsWith("/letter/")` prefix check, contradicting P699's explicit design ("top menu visible", route comment `App.tsx:699`). On multi-story letters the results page is a complete navigation dead-end mid-walk: no top nav, no bottom nav, no FocusHeader, and StoryWalk's "Back to Letters" button only renders on the last story.

## Root Cause

Confirmed by `/reproduce`: disproof checks ran (neither page renders its own `SimpleNavigation` — grep empty; `d7eec751` touched the layout predicate). Reproduced 100% via Playwright with a sealed 2-story letter + authenticated sender: `nav[data-nav="main"]` absent on results and overview; no "Back to Letters" affordance mid-walk (story 1 of 2). Canary: `e2e/p888-letter-results-nav.spec.ts` — 3 canary tests FAIL on symptom assertions, 3 immersive-route guards PASS.

Causal chain:

1. **P699** built the results page relying on the top menu as its exit affordance — the page itself has no FocusHeader or back button in its main render path (`letter-results-page.tsx:240-276`; the "Back to Letters" links at lines 214/225 are error-state-only).
2. **P846** (`5bec18b1`) added `isLetterPage = location.pathname.startsWith("/letter/")` to `clarity-landing-layout.tsx` — scoped to hiding the **footer** only.
3. **P852** (`d7eec751`) reused that same predicate to also suppress `SimpleNavigation`, top padding, and `ActiveSessionBanner` (`clarity-landing-layout.tsx:66,75-76,83`). The intent was the immersive letter **reading** flow (which got a "Leave" chevron in its progress bar as replacement exit). The prefix swept `/results` and `/overview` in as collateral.
4. Independently, `bottom-nav.tsx:44` lists `/letter/` in `focusRoutes`, hiding the mobile bottom nav on all letter routes — by itself fine (focus-page pattern), but combined with (3) the results page has zero persistent chrome.

## Reproduction Steps

1. Log in as a user with at least one sealed letter delivery (sender or receiver)
2. Navigate to `/letter/{id}/results?delivery={deliveryId}` (e.g. via Letters → Sent → a sealed letter's results link)
3. Observe: no top nav on desktop, no top or bottom nav on mobile
4. For the dead-end variant: open results for a letter with 2+ stories, stay on story 1
5. Observe: bottom bar shows "Next Story" only — no exit affordance anywhere on the page

Same nav absence on `/letter/{id}/overview` (author-only cohort view), which at least has a FocusHeader back button (`letter-overview-page.tsx:116`).

**Reproduction rate:** 100%

## Expected Behavior

Founder-confirmed desired outcome (decided in filing session):

- **Results** (`/letter/:id/results`): top nav (`SimpleNavigation`) visible on desktop + mobile; new `FocusHeader` "Back to Letters" at top of page content; mobile bottom nav stays hidden (focus-page pattern — avoids collision with StoryWalk's `FixedBottomBar`, both are `fixed bottom-0 z-50`)
- **Overview** (`/letter/:id/overview`): top nav visible; keeps existing FocusHeader; bottom nav stays hidden
- **Unchanged (immersive by design):** reading flow `/letter/:id` (P852, exit = Leave chevron), compose `/letter/:docId/compose` (wizard with own internal navigation), preview + confirm (explicit `chromeFree` prop, P665/P684)

## Actual Behavior

- Results: no top nav, no bottom nav, no FocusHeader. Only exit is StoryWalk's "Back to Letters" — rendered solely on the last story (`story-walk.tsx:191-210`). Mid-walk on multi-story letters: browser back or URL editing only.
- Overview: no top nav (FocusHeader present, so an exit exists but brand nav is gone).

## Affected Files

- `src/app/layouts/clarity-landing-layout.tsx:66` — `isLetterPage` prefix check; narrow to immersive routes only (reading exact-match + compose). Note: must still match shortcode form `/letter/st5` (P772) — e.g. `/^\/letter\/[^/]+(\/compose)?$/`
- `src/app/pages/letter-results-page.tsx:240` — add `FocusHeader` ("Back to Letters" → `/letters`) at top of main render
- `src/App.tsx:699` — stale comment "(top menu visible)" becomes true again; no code change needed on the route
- `src/app/components/layout/bottom-nav.tsx:44` — no change (focus-page treatment confirmed for both pages); listed for context
- `e2e/` — regression spec asserting nav presence/absence per route

**Footer side-effect check (P846):** `LegalFooter` renders only for logged-out users; results + overview redirect logged-out users to login, so narrowing the predicate does not visibly resurrect the footer there. The reading flow (recipient possibly logged-out, P846's original concern) stays immersive.

## Pre-Existing Tests Broken Since P852 (found by /reproduce)

Two existing e2e tests have been failing since P852 shipped — both verified failing on current main:

1. **`e2e/p699-letter-results-sender.spec.ts:342`** ("top menu is visible") — asserts `nav[data-nav="main"]` visible on results. This IS a regression test for this exact bug; it existed but wasn't run when P852 shipped. The fix must turn it green unchanged — do NOT modify its assertion.
2. **`e2e/p846-letter-chrome-cleanup.spec.ts:42`** (p846-1, LegalFooter) — fails on its *hydration wait* `expect(page.locator('nav')).toBeVisible()`, whose comment "SimpleNavigation is always rendered on letter routes" became false under P852. The test's actual assertion (footer not attached) is unaffected. The wait anchor is wrong, not the spec — `/fix` should replace the anchor with a non-nav element (reading routes stay nav-free after the fix), keeping the footer assertion intact.

## Severity

**Medium** — results content itself works and a workaround exists (browser back / last-story button), but a core letters-flow page is a navigation dead-end mid-walk and both pages strand users without brand navigation.

## Fix Approach

1. In `clarity-landing-layout.tsx`, replace `startsWith("/letter/")` with a predicate matching only the immersive routes: `/letter/:id` (exact, UUID or shortcode) and `/letter/:id/compose`. Results + overview then regain `SimpleNavigation`, top padding, and `ActiveSessionBanner` automatically (banner exclusion was for the reading flow's `top-0` progress bar, which results/overview don't have).
2. Add `<FocusHeader onBack={() => navigate('/letters')} label="Back to Letters" />` to `letter-results-page.tsx` main render (mirror overview's usage at `letter-overview-page.tsx:116`).
3. Leave `bottom-nav.tsx` `focusRoutes` untouched.
4. Regression test: nav visible on results/overview; nav absent on reading/compose; FocusHeader present on results mid-walk (story 1 of 2+).

## Acceptance Criteria

- [ ] `/letter/:id/results` shows the top nav on desktop and mobile (logged-in)
- [ ] `/letter/:id/results` shows a "Back to Letters" FocusHeader at top, on every story of a multi-story walk (not just the last)
- [ ] `/letter/:id/overview` shows the top nav; existing FocusHeader still present
- [ ] Mobile bottom nav remains hidden on both pages (no overlap with StoryWalk's bottom bar)
- [ ] `/letter/:id` (reading), `/letter/:docId/compose`, preview, and confirm remain chrome-free — including shortcode form `/letter/st5`
- [ ] ActiveSessionBanner renders on results/overview when a live session is active, without layout collision
- [ ] Regression test passes: `e2e/p888-letter-results-nav.spec.ts`
- [ ] Pre-existing test passes again unchanged: `e2e/p699-letter-results-sender.spec.ts` ("top menu is visible")
- [ ] `e2e/p846-letter-chrome-cleanup.spec.ts` p846-1 passes (hydration anchor repaired, footer assertion unchanged)
- [ ] No console errors during the affected flows
