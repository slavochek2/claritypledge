---
status: in-progress
type: bug
rank: 1000756.5
severity: high
workstream: live
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [badge, certification, live, rating-phase, p686-followup]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p804-badge-all-completion-paths.spec.ts
  root_cause: "Two bugs combine: (1) clarity-live-page.tsx:2127 isPerfect block runs only analytics — no badgeService.insertBadgePoint anywhere on rating-phase 10/10 path; (2) line 1654 .find() over #understanding-tagged points returns first match arbitrarily, blocking badge when listener disagrees with whichever point .find() lands on first."
  confidence: high
  surfaces_in_scope: [rating-phase-instant-10, rating-phase-after-paraphrase-10, free-mode-10-multi-understanding]
  surfaces_deferred: []
  reproduced_at: 2026-04-24
---

# P804: Badge certification silently drops across all /live round-completion paths

## Summary

When a /live round ends with mutual 10/10 (speaker certifies listener understood, listener confirms), the P686 badge often fails to insert. Two distinct bugs combine to drop badges across all three completion paths: rating-phase instant 10, rating-phase after-paraphrase 10, and free-mode 10/10 sliders.

## Root Cause

**Confirmed by canary `e2e/p804-badge-all-completion-paths.spec.ts` on 2026-04-24** — all three completion paths drove their respective UIs through to the perfect-celebration screen, then failed at the `Badge point earned!` headline assertion (the symptom is identical for both bugs because both end at "no badge inserted, no amber UI"). Both bug locations confirmed by source reading.

Two distinct bugs in the badge-insertion logic, both visible in `clarity-live-page.tsx`:

### Bug 1 — Rating-phase 10/10 has NO badge code path

In `clarity-live-page.tsx:2127`, when `isPerfect = checkerRating === 10 && responderRating === 10` becomes true (the rating-phase equivalent of "mutual 10"), the code only tracks an analytics event. There is no call to `badgeService.insertBadgePoint` anywhere in this path. This affects:

- Speaker certifies listener at 10 instantly (no paraphrase) → no badge
- Speaker certifies at 10 after one paraphrase round → no badge

This is the dominant /live completion path (story-mode rating-phase). The P686 badge has likely never awarded in production for this path.

### Bug 2 — `.find()` over story #understanding points picks first match arbitrarily

In `clarity-live-page.tsx:1654` (inside `handleFreeRoundComplete`):

```
let understandingPoint = selectedStoryData?.points?.find(
  (p) => p.systemTags?.includes('understanding')
);
```

`.find()` returns whichever `#understanding`-tagged point appears first in the array. When a story has multiple `#understanding` points (legitimate v1/v2/v3 versions OR the data-bug case of duplicate v<N>), `.find()` may land on a point the listener disagreed with — blocking a badge that should have fired for a different agreed-upon point in the same story.

### Verified against prod session 1315d912-0e54-43b4-b0d6-6b02ba0f8755 (2026-04-24)

Diagnostic queries against the prod REST API confirmed:
- Session involved creator profile `a99042ef` (slug `slava`, `is_certifier=true` — speaker) and joiner profile `87d82577` (slug `vyacheslav-ladischenski-2`, `is_certifier=false` — listener)
- `badge_points` rows for session: **0**
- Listener has `agree` positions on 2 of the story's `#understanding`-tagged points (and `disagree` on 1, plus a duplicate-v1 data bug)
- All four documented P686 badge conditions appeared satisfied; no badge inserted

## Reproduction Steps

### Path A — Bug 1: Rating-phase instant 10/10

1. Two authenticated users in /live, story-mode (creator has `is_certifier=true`)
2. Creator selects a story whose linked points include at least one `#understanding`-tagged point
3. Listener has previously positioned `agree` on the `#understanding` HEAD point (set in profile or letter, before this session)
4. Both enter the rating phase
5. Speaker rates 10. Listener rates 10. (No paraphrase round needed.)
6. `isPerfect` triggers; success screen renders ("perfect understanding" copy)
7. **Observe:** no amber "Badge point earned!" headline; `badge_points` table has no row for this session

### Path B — Bug 1: Rating-phase 10/10 after paraphrase

Same as Path A, but speaker rates `<10` first time. Listener does explain-back. Speaker re-rates at 10. `isPerfect` triggers. Same outcome: no badge.

### Path C — Bug 2: Free-mode 10/10 with multi-#understanding story

1. Two authenticated users in /live, story-mode (creator has `is_certifier=true`)
2. Creator selects a story whose linked points include TWO OR MORE `#understanding`-tagged points
3. Listener has positioned `disagree` on point A (which `.find()` may return first) AND `agree` on point B
4. Round goes through paraphrase + free-mode sliders
5. Both sliders reach 10
6. **Observe:** no badge — `.find()` returned point A (disagreed), guard failed

**Reproduction rate:** 100% for Bug 1 (any rating-phase 10/10). Bug 2 manifests when story has multiple `#understanding` points with mixed listener positions.

## Expected Behavior

For all three round-completion paths, the unified product rule is:

> For the story being discussed in /live: find the LATEST version of its `#understanding`-tagged point (highest `v<N>` tag, or HEAD post-P800). If the listener positioned `agree` or `strongly_agree` on that specific point AND the round ends with mutual 10/10 → badge fires. Amber "Badge point earned!" headline appears on the success screen for both speaker and listener (via Realtime propagation).

The certifier's slider/rating value IS the certification signal. No minimum-work gate. Trust the certifier's authority. Instant 10 is legitimate.

## Actual Behavior

- Path A (instant 10): silent failure, no badge code runs at all
- Path B (after-paraphrase 10): silent failure, no badge code runs at all
- Path C (free-mode 10/10): badge code runs but `.find()` lottery sometimes picks a disagreed point, silent failure
- All three: success screen renders normally without amber headline; user cannot tell anything went wrong

## Affected Files

- `src/app/pages/clarity-live-page.tsx`
  - `handleFreeRoundComplete` (~lines 1620-1731) — Bug 2 lives here; refactor target
  - `handleRatingSubmit` `isPerfect` block (~line 2127) — Bug 1: missing badge call
- `src/app/components/partners/live-mode-view.tsx` (~lines 3075-3085) — verify rating-phase success headline pipes `badgePointEarned` through to the amber-banner UI; may need parity with `free-mode-success.tsx`

## Severity

**High** — silently breaks the core P686 mechanism (badge certification) across the dominant /live completion paths. The rating-phase `isPerfect` path has likely never awarded a badge in production. Free mode awards badges only when `.find()` happens to land on an agreed point — partially working by luck.

## Fix Approach

**Two-part refactor + new call site:**

1. **Extract** the badge-check logic from `handleFreeRoundComplete` into a shared helper (e.g., `awardBadgeIfEligible`) that takes session/profile context and returns `{ badgePointEarned, newBadgeCount }`.

2. **Replace** the `.find()` over `#understanding` points with a `.reduce` that picks the HIGHEST `v<N>` tag among `#understanding`-tagged points in `selectedStoryData.points`:
   - Pre-P800: parses `v<N>` from `system_tags` to identify the latest version
   - Post-P800: `/live` filter constrains the array to HEAD versions; same code picks the (single) one
   - Forward-compatible without modification

3. **Wire** the shared helper into the rating-phase `isPerfect` path at line 2127 (NEW call site). Update `LiveSessionState` write to include `badgePointEarned` and `badgeCount`.

4. **Verify** the rating-phase success screen (`live-mode-view.tsx:3075-3085` area) renders the amber badge headline when `badgePointEarned` is true. If the headline component doesn't accept this prop today, thread it through — same pipeline as `free-mode-success.tsx`.

5. **Remove** the `selectedPointId` primary path and `selectedStoryId`-only DB fallback from the badge code (both have the same `.find()` bug; `selectedPointId` is also unreachable in current production UI per dead `ContentPicker`).

Net change: ~60 lines of badge logic → ~25 lines + new call site. Removes both `.find()` bugs AND dead branches in one pass.

## Coverage matrix (after fix)

| /live path | Badge fires correctly? |
|---|---|
| Regular story-mode, instant rating 10/10 | ✓ (Bug 1 fix) |
| Regular story-mode, after-paraphrase 10/10 | ✓ (Bug 1 fix) |
| Regular story-mode, free-mode sliders 10/10 | ✓ (Bug 2 fix) |
| Letter-preloaded /live (P703 path), instant 10/10 | ✓ (inherits Bug 1 fix) |
| Letter-preloaded /live, after-paraphrase 10/10 | ✓ (inherits Bug 1 fix) |
| Letter-preloaded /live, free-mode 10/10 | ✓ (inherits Bug 2 fix) |

## Acceptance Criteria

- [ ] Rating-phase instant 10/10 (speaker rates 10 first try, listener rates 10 confidence) on a story with a `#understanding` HEAD where listener already positioned `agree` → amber "Badge point earned!" headline visible on speaker's success screen AND a row inserted in `badge_points` (Bug 1)
- [ ] Rating-phase 10/10 after one paraphrase round → amber headline + DB row (Bug 1)
- [ ] Free-mode 10/10 on a story with TWO `#understanding`-tagged points where listener disagreed on v1 and agreed on v2 → badge fires for v2 (Bug 2)
- [ ] Free-mode 10/10 on a story with single `#understanding` point + listener agreed → badge fires (P797 regression coverage holds)
- [ ] Story with no `#understanding`-tagged point + mutual 10/10 → no badge, no error
- [ ] Story with `#understanding` HEAD + listener position `disagree` + mutual 10/10 → no badge, no error
- [ ] Letter-preloaded /live session reaches mutual 10/10 (any path) → badge fires (P703 path coverage)
- [ ] Existing `e2e/p797-badge-certification.spec.ts` continues to pass
- [ ] New regression test `e2e/p804-badge-all-completion-paths.spec.ts` covers Path A, Path B, Path C
- [ ] No console errors during any of the three completion paths

## Out of Scope (file separately)

- **Data cleanup of stories with duplicate `v<N>` per (st-group, variant)** — separate cleanup spec. Once data is clean, the `.reduce` HEAD-by-version picker is unambiguous. Pre-cleanup, on broken stories, the picker may pick one duplicate-v1 over the other. Known limitation.
- **Pruning unreachable `selectedPointId` code paths** — `ContentPicker` is defined but never imported; entire point-mode picker UI is dead. Remove in a separate cleanup spec.
- **Anti-variant (`#misunderstanding`) badging** — separate product question. Defer.
- **Bootstrap edge case** — letter pre-loaded with both ratings already at 10 won't auto-badge unless a rating is re-submitted. Unlikely in practice. Worth a separate UX note if it shows up in the wild.
- **Minimum-work gate on instant 10** — explicitly REJECTED. The certifier's authority IS the signal.

## P800 forward-compatibility

The fix is designed to work both pre- and post-P800 (point supersede schema):

- **Pre-P800:** `.reduce` picks the highest `v<N>` tag among `#understanding`-tagged points
- **Post-P800:** `/live` filter (per P800 line 53) removes superseded points from `selectedStoryData.points`; only HEAD remains; same `.reduce` code picks the (single) one
- **Future v4/v5 added with P800 in place:** HEAD changes; same code picks new HEAD
- **No code change needed when P800 ships**

Order of work is independent: ship P804 first (today) OR after P800 — fix works either way.

## Branch

`fix/p804-badge-all-completion-paths`
