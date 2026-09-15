---
status: all-done
type: bug
disclosure: public
rank: 213
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [e2e, feed, points, test-debt]
pipeline_ran: [create-bug, fix]
completed_at: 2026-09-15
---

# P1078: `e2e/p491-hashtag-feed.spec.ts` fails since P543 shipped — fixture never stakes a position

## Summary

7-8 tests in `e2e/p491-hashtag-feed.spec.ts` fail consistently on `main` (confirmed, not flaky) because the suite's `createTestPoint()` fixture creates a point with zero positions, and P543 (2026-03-17, unrelated feature) hides all zero-position points from every listing surface including `/feed`.

## Root Cause

`e2e/p491-hashtag-feed.spec.ts`'s `beforeEach` calls `createTestPoint(author.user.id, { statement: ..., tags: [...] })` and never calls the separately-available `createTestPosition()` helper (`e2e/helpers/test-point.ts:116`) to stake a position on it. `getPublicPointsFeed` (`points-service-real.ts:834`) ends with `.filter(point => point.totalPositions > 0)` per [P543 — decisions.md 2026-03-17 "Zero-position points hidden from listings"](../../../docs/decisions.md): "Filter zero-position points at query level — hidden from all listing surfaces (feed, profile, live picker)." This suite predates that decision (or was never updated after it shipped) and has apparently been red on `main` since.

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

- [x] `npx playwright test e2e/p491-hashtag-feed.spec.ts` passes with 0 failures — **RUN 2026-09-15,
  exit 0: `12 passed, 1 skipped` (the skip is the pre-existing `test.skip` for the /live fixture).**
  Run twice under the config's own settings (`fullyParallel: true`, 3 workers), 25.7s and 27.3s,
  same result both times — not a single lucky pass. Serial run also green (12 passed). The owed run
  is no longer owed.
- [x] Fixture change is limited to `beforeEach`/`afterEach` staking/cleanup — no assertions weakened —
  `beforeEach` gains one `createTestPosition(taggedPoint.id, author.user.id, 'agree')` call, mirroring
  `e2e/p503-profile-tag-pills.spec.ts:47`. No `afterEach` change needed: `point_positions.point_id` is
  `REFERENCES points(id) ON DELETE CASCADE`
  (`supabase/migrations/20260204_stories_points_calibration.sql:99`), so the existing `deleteTestPoint`
  already removes the position.
- [x] No regression to the currently-passing "Authenticated User Flows" / "/live" tests in the same file —
  the `/live` test is untouched. The authenticated-redirect test's heading assertion was CORRECTED, not
  weakened: it asserted a `/feed/i` heading while `src/app/pages/feed-page.tsx:323` renders `<h1>Home</h1>`.

## Additional stale assertions found by adversarial review (same file, same root class)

Codex review of the fix surfaced three further deterministic failures in this spec file that the
P1078 report did not name. Each was verified against the source before changing anything:

- [x] Empty-state test expected `no content tagged nonexistent yet` and a `link` named
  "Browse all content". `src/app/pages/feed-page.tsx:478` renders
  `No content matching #nonexistent yet` and `:480-489` renders a `<button>`. Test corrected to match.
- [x] Authenticated-redirect test expected a heading matching `/feed/i`;
  `src/app/pages/feed-page.tsx:323` renders `<h1>Home</h1>`. Test corrected to `/home/i`, level 1.
- [x] Two `getByText('fundraising')` assertions become strict-mode ambiguous once the point is visible —
  the active-filter chip (`src/app/components/feed/active-tag-filter.tsx:24`) and the card's tag pill
  (`src/app/components/shared/tag-pills.tsx:85`) both carry the string. Both replaced with
  `getByLabel('Remove tag filter for fundraising')`, which asserts the active-filter chip specifically
  — a strictly stronger assertion, matching each site's own comment ("Active tag filter should be visible").

One review finding was **rejected** after checking the source: codex claimed the tag-pill locator
becomes ambiguous because the tagged story also carries `fundraising`. `feed-page.tsx` renders only
`activeContent` for the active tab, and the Points tab is the default, so the story's pill is not in
the DOM at that point. Before this fix the Points tab rendered ZERO such pills (the point was hidden);
after it, exactly one.

One review finding is **out of scope and unfixed**: the `/live` tag-pill requirement at
`e2e/p491-hashtag-feed.spec.ts:250-256` is explicitly skipped, so a regression there stays green. That
is a coverage gap, not a failing test, and P1078 is scoped to the failures.


## What executing the run actually found (2026-09-15)

The fixture fix in this spec was **correct and sufficient for its own defect** — the point is
visible now. But the suite had five further deterministic failures underneath it, none of which
could be seen without running it. Two were introduced by the previous session's static reasoning.

**Nothing in this suite could run at all in this worktree.** Playwright derives the port as
`5000 + slot*100`, so slot w10 is **port 6000 — which Chromium refuses outright** (X11, on its
restricted-ports list). Every test died with `net::ERR_UNSAFE_PORT` before the app loaded. Verified
via an untracked local override on port 6010. **This is not fixed here and needs its own spec:**
it silently disables the entire e2e suite for whichever slot lands on 6000, and reads as an
application failure rather than a port problem.

**`ActiveTagFilter` is dead code, and it misled the previous session.**
`src/app/components/feed/active-tag-filter.tsx` is exported from the feed barrel and imported by
**no page** — confirmed on `main`, not just on this branch. The live page renders its own inline
chip at `feed-page.tsx:391` with a *different* label:

| | aria-label |
|---|---|
| live page (rendered) | `Remove filter for #fundraising` |
| dead component (asserted) | `Remove tag filter for fundraising` |

The previous session read the component file, found a plausible label, and wrote three assertions
against a control that is never mounted. This is the hazard in "verified against the source before
changing" — the source was real; it just was not the source being rendered. Grepping for an
importer is the check that was missing.

**P592's trigger owns `stories.tags`; the helper's `tags:` option is a no-op.**
`20260327084215_auto_extract_story_hashtags.sql` runs `BEFORE INSERT` and unconditionally does
`NEW.tags := ARRAY(regexp_matches(NEW.content, '#(\w+)', 'g'))`. So `createTestStory(..., { tags:
['fundraising','startups'] })` wrote a story with `tags = {}`. The story still appeared on the
UNFILTERED Stories tab, so this presented as a broken tag filter rather than a broken fixture.
Confirmed three ways: the filtered panel rendered "No content matching #fundraising yet"; the tag
cloud carried `#fundraising` and `#startup-advice` (the POINT's tags) but no `#startups`; and the
trigger source says so. The fixture now tags via content, which is how a real author tags a story
— the P1078 invariant. *(The same mechanism is recorded independently for p506 in `dd0af279c`.)*

**The story card strips `#tag` tokens out of the prose**, re-rendering them as pill links, so
`getByText(story.content)` can never match — `"A story about #x for #y."` renders as
`"A story about  for ."`. Assertions now target the prose half, with hashtags appended at the end.

**The bottom-nav entry for the feed is labelled `Home`, not `Feed`** (`bottom-nav.tsx:86-88`,
`{ label: "Home", to: "/feed" }`). The same Feed→Home rename this file already corrects for the
page's `<h1>`; the nav assertion was missed. UAT-9's subject is the destination, so the assertion
now binds the link's `href` — what would actually regress if the entry were repointed.

**`fullyParallel: true` + one shared database + fixed fixture strings = self-collision.** Three
workers each created a point with the same statement, so `getByText` hit three matches and failed
strict mode. This is why the first run showed 6 failures and the serial run 5. Fixture strings now
carry a per-test suffix, so the suite passes as invoked rather than only under `--workers=1`.

**Unrelated and untouched:** `src/tests/p491-hashtag-feed.test.tsx` reports
`TS6133: '_createMockUser' is declared but its value is never read`. Pre-existing, a different file,
not in scope here.

- [x] All assertion targets re-verified against **`main`'s** copies of `bottom-nav.tsx`,
  `feed-page.tsx` and the feed barrel — not only against this branch's six-day-old checkout — so the
  cherry-pick lands on components that still match. `main` has not modified
  `e2e/p491-hashtag-feed.spec.ts` since this branch was cut.
