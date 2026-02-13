---
status: active
type: leading
track: C1
workstream: C1
target_value: "≥50% story creation rate, ≥30% verification rate"
kill_threshold: "<20% story creation rate after 4 weeks"
measured_by: [e-story-creation-pilot]
---

# KR-Story-Usage: Story Creation + Verification Rates

## SMART Goal Definition

**Specific:** Users create stories on their profiles and verify understanding of those stories via /live.

**Measurable:**
- **Story creation rate:** % of active users who create ≥1 story
- **Verification rate:** % of stories that get verified via /live
- **Retention:** % of story authors who return to see who understood

**Achievable:** Based on analogous platforms (Medium, Substack), 20-50% content creation rate is realistic for early adopters.

**Relevant:** Leading indicator for H-Stories hypothesis. If users don't create stories, hypothesis fails. If they create but don't verify, Stories don't solve cold start problem.

**Time-bound:** 4-week pilot (Feb 15 - Mar 15, 2026)

## Measurement Method

**Data collection:**
- **Story creation events:** Logged in database (`stories` table, `created_at` timestamp)
- **/live session events:** Linked to stories (`story_verifications` table, `story_id` FK)
- **User feedback surveys:** Exit interviews (qualitative coding)
- **Analytics:** Mixpanel events `story_created`, `verification_completed`

**Analysis:**
- **Weekly snapshot:** Creation rate, verification rate (track trends)
- **Cohort analysis:** Returning users vs new users (do behaviors differ?)
- **Qualitative coding:** Exit interview themes ("purposeful" vs "forced" vs "confusing")

**Calculation:**
```
Story Creation Rate = (Users who created ≥1 story) / (Total pilot users) × 100%
Verification Rate = (Stories verified via /live) / (Total stories created) × 100%
Retention Rate = (Story authors who returned) / (Story authors) × 100%
```

## Target Value

**Success threshold:**
- **≥50% story creation rate** (10+ of 20 pilot users create stories)
- **≥30% verification rate** (3+ of 10 stories get verified)
- **Qualitative:** "Stories make /live purposeful" feedback (exit interviews)

**Why these targets:**
- 50% creation = majority find value, not just power users
- 30% verification = stories actually used as intended (not just created and abandoned)
- Qualitative = stories solve the "on what?" problem (users have clear purpose for /live)

**Leading indicator:** This key result predicts workshop success (C2). If users don't create stories organically, workshop participants won't either.

## Kill Threshold

**Abandon H-Stories hypothesis if:**
- **<20% story creation rate** after 4 weeks (too low engagement)
- **<10% verification rate** (stories don't trigger /live usage)
- **Qualitative:** "Stories feel forced" (poor UX fit)

**Why these kill signals:**
- 20% creation = only 1 in 5 engaged (not viable for workshops)
- 10% verification = stories created but not used (doesn't solve cold start)
- Forced feeling = UX mismatch (stories add friction, don't remove it)

**Next steps if killed:**
- Test alternative cold start solutions (pre-seeded topics, event prompts)
- Consider: Is /live the problem, not lack of context?
- Pivot C1 workstream or pause until solution found

## Related Key Results

**C-workstream key results:**
- **KR-Workshop-Retention (C2):** Do workshop participants create stories?
- **KR-Revenue-5K (C3):** Does workshop revenue validate business model?

**R-workstream key results:**
- **KR-Essay-Reach (R1):** Do essays mention Stories feature? (cross-promotion)

**E-workstream key results:**
- **KR-Point-Adoption (E1):** Do users prefer Points (structured) over Stories (holistic)?

## Tracking Over Time

**Monthly snapshots:**
- Month 1 (pilot): Creation + verification rates from 20-user pilot
- Month 2-3 (workshops): Creation rates from workshop participants
- Month 4+ (scale): Organic creation rate from general users

**Expected trajectory:**
- Pilot (Month 1): 50%+ creation, 30%+ verification (early adopters)
- Workshops (Month 2-3): 40%+ creation (coached users)
- Organic (Month 4+): 20-30% creation (general users, no coaching)

**Trend to watch:** If creation rate stays >40% after workshops end, protocol is spreading (self-sustaining). If it drops <20%, workshops are necessary for adoption (not viral).

## Data Sources

**Database tables:**
- `stories` table: `id`, `author_id`, `created_at`, `visibility`
- `story_verifications` table: `story_id`, `verifier_id`, `session_id`, `rating`
- `verification_sessions` table: `id`, `listener_id`, `speaker_id`, `story_id` (nullable), `created_at`

**Analytics events:**
- `story_created`: User completes story creation flow
- `verification_completed`: /live session ends with rating
- `story_viewed`: Someone views a story (potential verifier)
- `story_shared`: Author shares story to event or publicly

**Survey data:**
- Exit interviews (qualitative feedback after 4-week pilot)
- NPS: "How likely to recommend Stories feature?" (0-10)
- Open-ended: "What did you like/dislike about Stories?"

## Reporting Cadence

**Weekly (during pilot):**
- Dashboard snapshot: Creation rate, verification rate, cohort breakdown
- Shared with stakeholders: "5 of 20 users created stories so far (25%)"

**Month-end (after pilot):**
- Full analysis report: Quantitative + qualitative findings
- Decision recommendation: Proceed to C2 / Iterate / Kill

**Quarterly (after workshops begin):**
- Track creation rates from workshop cohorts
- Compare: Pilot (early adopters) vs Workshops (coached) vs Organic (general)

## Related Documents

**Hypothesis:**
- [h-stories-solve-cold-start.md](../hypotheses/h-stories-solve-cold-start.md)

**Experiment:**
- [e-story-creation-pilot.md](../experiments/e-story-creation-pilot.md)

**Workstream:**
- [c1-stories-live-events.md](../workstreams/c1-stories-live-events.md)

**Features:**
- P126: Story creation (profiles)
- P128: /live beginning screen
