---
status: done
completed_at: '2026-02-22'
type: story
rank: 125465
workstream: C2
created_date: 2026-02-22
tags: []
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

- [ ] A paraphrase exchange with no story selected increments `verification_session_count` for both participants
- [ ] A paraphrase exchange where speaker rates < 10 still counts
- [ ] Calibration unlocks after 5 such exchanges (any mix of story/no-story, any scores)
- [ ] Existing calibration averages still compute correctly (speaker_rating, listener_rating columns unchanged)

## Testing

Do 5 quick paraphrase exchanges in a live session without creating any stories. Calibration bar should appear on profile after exchange 5.
