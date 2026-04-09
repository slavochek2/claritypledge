---
status: all-done
type: bug
rank: 0.5
severity: high
date_reported: '2026-04-07'
created_date: 2026-04-07T00:00:00.000Z
delivery_stage: create-spec
pipeline_ran:
  - create-spec
superseded_by: p674
tags:
  - live
  - calibration
  - data-quality
---

# P675: Calibration Should Use Post-Paraphrase Ratings

## Problem

Listener calibration is calculated from the wrong data point. The current flow collects three rating moments:

1. **Sealed-bid ratings (#2)** — speaker and listener both rate *before* the listener paraphrases. The speaker rates "how well did they understand?" based on a feeling, not evidence. The listener rates self-confidence without having tested it.
2. **Paraphrase** — the listener explains back what they understood.
3. **Post-paraphrase re-rating (#3)** — after hearing the paraphrase, the speaker rates based on *actual evidence* of understanding. The listener re-rates knowing whether they could articulate it.

`story_verifications.speaker_rating` stores rating #2 (pre-paraphrase). Rating #3 is tracked in `explainBackRatings` array in live state but **never written to the calibration record**. The calibration gap (`avg(listener_self) - avg(speaker_rating)`) is computed from gut-feel numbers, not evidence-based ones.

This makes the calibration metric unreliable: a speaker who would rate 6/10 before paraphrase might rate 9/10 after hearing a good explanation back — or 3/10 after hearing a bad one. The pre-paraphrase number measures prediction, not assessment.

## Appetite

Low blast radius. The live session flow and UI stay the same — only which rating values get written to `story_verifications` changes. The `calibration-service-real.ts` calculation logic is already correct (it averages whatever is in the table). Historical data becomes a mixed pool (old = pre-paraphrase, new = post-paraphrase) but this is acceptable — calibration improves as new data accumulates.

## Solution

When a round includes an explain-back loop (rating #3 exists), write the **post-paraphrase ratings** to `story_verifications` instead of the sealed-bid ratings. When no explain-back happens (speaker rates 10/10 on sealed bid), the sealed-bid values are the only values and are correct to store.

Specifically:
- If `explainBackRatings` array has entries after the round completes, use the **last** speaker re-rating and the **last** listener self-re-rating as `speaker_rating` and `listener_rating` in the verification record.
- If no explain-back occurred, use the sealed-bid values (current behavior, unchanged).

## Risks / Non-Goals

- **Non-goal:** Changing the live session UI or flow sequence. The sealed-bid moment stays as-is for the user experience.
- **Non-goal:** Migrating historical data. Old records stay as-is; new records use the better values.
- **Non-goal:** Changing calibration calculation formula in `calibration-service-real.ts` — the formula is correct, only its input data is wrong.
- **Risk:** If `explainBackRatings` structure doesn't cleanly separate speaker vs. listener re-ratings, we may need to adjust how re-ratings are captured in live state.

## Done-When

- [ ] When a round includes explain-back, `story_verifications` stores the post-paraphrase speaker and listener ratings (not sealed-bid)
- [ ] When a round has no explain-back (sealed-bid 10/10), behavior is unchanged
- [ ] Existing calibration display (`calibration-service-real.ts`) works without changes
- [ ] No regression in E2E tests for the verification flow
