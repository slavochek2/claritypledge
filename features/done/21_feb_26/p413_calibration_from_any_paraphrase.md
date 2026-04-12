---
status: all-done
type: story
rank: 125465
workstream: C2
created_date: 2026-02-22T00:00:00.000Z
tags: []
uat_file: features/uat/p413.md
test_files:
  - e2e/integration/p413-nullable-story-migration.spec.ts
  - e2e/p413-calibration-any-exchange.spec.ts
locked_at: '2026-02-26T04:17:44.921Z'
---

# P413: Count any completed paraphrase exchange toward calibration

## Problem

Calibration currently only unlocks after 5 completed story verifications where the speaker rated 10/10. This is too restrictive — users rarely reach 5 because it requires: a story to be selected, the full rating flow to complete, and a perfect speaker score. In practice the bar stays empty forever.

Calibration only needs two numbers: the listener's self-estimate + the speaker's rating of them. Both are available the moment both participants submit ratings in the first paraphrase round — no story, no perfect score, no session completion required.

## Solution

- Record a calibration data point on every completed paraphrase exchange (both `checkerRating` and `responderRating` submitted), regardless of score and regardless of whether a story is selected
- Make `story_id` / `version_id` optional in `story_verifications` (or use a new lightweight table)
- The existing DB trigger already increments `verification_session_count` per row — no trigger changes needed
- Threshold stays at 5 exchanges to unlock the calibration display

## Acceptance Criteria

- [x] A paraphrase exchange with no story selected increments `verification_session_count` for both participants
- [x] A paraphrase exchange where speaker rates < 10 still counts
- [x] Calibration unlocks after 5 such exchanges (any mix of story/no-story, any scores)
- [x] Existing calibration averages still compute correctly (speaker_rating, listener_rating columns unchanged)

## Testing

Do 5 quick paraphrase exchanges in a live session without creating any stories. Calibration bar should appear on profile after exchange 5.

**Accelerated:** Use DB seeding (see `features/uat/p413.md` UAT-1.1) — no live partner needed.

---

## Test Coverage Strategy

**What's tested:**
- ✅ Schema: `story_id` and `version_id` nullable after migration (integration)
- ✅ Trigger: no-story insert increments `verification_session_count` (integration)
- ✅ RLS: authenticated user can insert without story_id (integration)
- ✅ 5 no-story exchanges unlock calibration on profile (E2E)
- ✅ Low ratings (< 10) count toward calibration (E2E)
- ✅ Mixed story + no-story exchanges count together (E2E)
- ✅ < 5 exchanges do NOT unlock calibration (E2E)
- ✅ Calibration averages reflect actual ratings from no-story rows (E2E)
- ✅ Profile loads without errors for no-story verification user (smoke)

**What's NOT tested (rationale):**
- ❌ Full two-party /live session flow — requires 2 simultaneous browser sessions; covered by UAT-2.x manual scenarios
- ❌ `update_story_understood_count` trigger NULL guard — pure SQL behaviour, impossible to surface via UI test; relies on migration correctness

**Test pyramid:**
```
      /\
     /  \   5 E2E tests
    /____\
   / 1 SMOKE \
  /___________\
 / 5 INTEGRATION \
```

**Files:**
- `e2e/integration/p413-nullable-story-migration.spec.ts` — 5 integration tests
- `e2e/p413-calibration-any-exchange.spec.ts` — 5 E2E tests
- `e2e/p413-smoke.spec.ts` — 1 smoke test
- `features/uat/p413.md` — 7 UAT scenarios (4 automated-friendly, 3 require live session)
