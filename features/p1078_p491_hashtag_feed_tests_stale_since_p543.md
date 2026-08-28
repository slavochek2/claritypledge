---
status: backlog
type: bug
rank: 213
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [e2e, feed, points, test-debt]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1078: `e2e/p491-hashtag-feed.spec.ts` fails since P543 shipped — fixture never stakes a position

## Summary

7-8 tests in `e2e/p491-hashtag-feed.spec.ts` fail consistently on `main` (confirmed, not flaky) because the suite's `createTestPoint()` fixture creates a point with zero positions, and P543 (2026-03-17, unrelated feature) hides all zero-position points from every listing surface including `/feed`.

## Root Cause

`e2e/p491-hashtag-feed.spec.ts`'s `beforeEach` calls `createTestPoint(author.user.id, { statement: ..., tags: [...] })` and never calls the separately-available `createTestPosition()` helper (`e2e/helpers/test-point.ts:116`) to stake a position on it. `getPublicPointsFeed` (`points-service-real.ts:834`) ends with `.filter(point => point.totalPositions > 0)` per [P543 — decisions.md 2026-03-17 "Zero-position points hidden from listings"](../docs/decisions.md): "Filter zero-position points at query level — hidden from all listing surfaces (feed, profile, live picker)." This suite predates that decision (or was never updated after it shipped) and has apparently been red on `main` since.

## Invariants

- P543's zero-position filter is correct, intentional product behavior — do not work around it or special-case test fixtures against it. The fix here is to make the test fixture stake a position, matching how real content actually becomes visible.

## Reproduction Steps

1. On `main` (confirmed via wip-commit-and-compare during P1075's regression check, 2026-08-13), run: `npx playwright test e2e/p491-hashtag-feed.spec.ts`
2. Observe: "anonymous user can browse Points tab (default)", "anonymous user can switch to Stories tab", "clicking a tag pill navigates to /feed?tag=X", "dismissing tag filter returns to unfiltered /feed", "tag filter shows only matching content", "tag filter with nonexistent tag shows empty state", "shared /feed?tag=X URL works for anonymous users", "browser back restores previous filter/tab state" all fail — each waiting on `taggedPoint.statement` (or content derived from it) to become visible, which never happens because the point has zero positions.

**Reproduction rate:** 100%, deterministic (not timing-dependent).

## Expected Behavior

The test suite's fixtures should produce content that's actually visible under current (correct) app behavior, so these tests exercise real tag-filtering/navigation logic rather than failing on an unrelated precondition.

## Actual Behavior

All Points-tab assertions time out waiting for `taggedPoint.statement`, because the point is invisible on every listing surface per P543.

## Affected Files

- `e2e/p491-hashtag-feed.spec.ts` — `beforeEach` (~line 21-39): needs a `createTestPosition()` call after `createTestPoint()`
- `e2e/helpers/test-point.ts` — `createTestPosition` (~line 116) already exists and does what's needed; just unused by this spec's setup

## Severity

**Medium** — no production impact (P543 itself is correct and shipped fine); this is broken CI/regression signal for the feed's points-tab flows, silently red for an unknown period, masking whether real regressions in this area would be caught.

## Fix Approach

Add a `createTestPosition(taggedPoint.id, author.user.id, 'agree')` (or similar) call in `beforeEach` after `createTestPoint()`, and clean it up in `afterEach` if the helper requires explicit deletion (check `deleteTestPosition` availability). Re-run the full suite and confirm all 8 currently-failing tests pass.

## Acceptance Criteria

- [ ] `npx playwright test e2e/p491-hashtag-feed.spec.ts` passes with 0 failures
- [ ] Fixture change is limited to `beforeEach`/`afterEach` staking/cleanup — no assertions weakened
- [ ] No regression to the currently-passing "Authenticated User Flows" / "/live" tests in the same file
