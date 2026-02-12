---
status: future
priority: p3
summary: "Test whether group visibility of calibration creates social proof that drives adoption and behavioral change"
tests: [H2, H3, H4, H5]
answers: []
blocked_until: E2 completes (need 30+ active users for group dynamics)
---

# X2: Social Dynamics (Group Behavior Change)

**Build:** Calibration leaderboard, event page with visible verification, reputation badges

**Done when:** 30-person event shows (1) non-participants request verification after seeing scores, (2) >50% do ≥1 verification, (3) qualitative status shift toward "verified understanding wins"

**Kill signal:** No behavior change from visibility; people ignore calibration scores; confident assertion still dominates

**Requires:** E2 (Scale — Partners + Async) completes to achieve 30+ active user base

---

## Hypothesis: Visible Calibration Creates Social Proof

**What we're testing:** Does group visibility of verification create social dynamics that drive adoption and change behavior?

This milestone combines three related hypotheses that all test group effects:

### H3: Social FOMO drives adoption

When non-participants see others with calibration scores (ears 👂) and verification history, does social FOMO motivate them to participate?

**Observable:** Non-verified attendees request verification after seeing leaderboard

### H4: Visibility changes group behavior

When a group can SEE who verified understanding with whom (on which topics), does their behavior change? Do they seek verification? Do they trust verified listeners more?

**Observable:** >50% of attendees do at least one /live verification; >60% report "worth it"

### H2: Calibration revelation motivates action

When users see their calibration gap (how well they THINK they communicate vs how well they ACTUALLY do), does this motivate them to:
1. Improve their own communication
2. Help others calibrate
3. Seek verification

**Observable:** Users report "I didn't realize I was miscalibrated"; ongoing use after workshop

### H5: Status flip happens

Will social status shift from "confident assertion wins" to "verified understanding wins"? Will the room reward someone who says "I was wrong" more than someone who "won" the argument?

**Observable:** Qualitative shift in group dynamics — people seek out verified listeners

---

## How to Test

Run 30-person event with:
- Topics provided by organizer (not user-created Stories for MVP)
- /live verification between attendees
- Calibration visible on event page (ears count, verification pairs)
- Calibration leaderboard showing relative scores
- Post-event surveys and observation

**Track:**
- Do unverified attendees seek verification after seeing leaderboard?
- Do users with visible gaps seek more /live sessions?
- Do people seek out verified listeners?
- Does verification rate correlate with visible calibration?

**Survey questions:**
- "Did seeing others' calibration make you want to participate?"
- "Did seeing your gap surprise you? Motivate you?"
- "Did you approach anyone based on their verification history?"
- "Worth it?" (>60% target)

---

## Success Criteria

**Quantitative:**
- >50% of attendees complete at least one /live verification
- >60% report event was "worth it"
- Non-verified attendees request verification after seeing scores
- Verification rate higher for users who saw their gap

**Qualitative:**
- Users mention "I saw [person] had high ears, wanted that too"
- Users report "I didn't realize I was this miscalibrated"
- Ongoing use: They use /live in their own meetings after workshop
- Status shift observable: Room rewards "I was wrong" over "I won"
- People seek out verified listeners post-event

---

## Critical Observation (Cold Start Dependency)

Cannot test until we solve the cold start problem. Users need content (topics) or organizer-provided prompts to verify understanding ABOUT. The "what" must exist before visibility can change behavior around it. Event organizers provide this trigger — individuals don't have it intrinsically.

This is why X2 is blocked by E2 (Partner-run events + async verification) — we need established event flow first.

---

## Why These Hypotheses Are Grouped

All three test facets of the same mechanism: **"Does group visibility of calibration create social proof that drives adoption?"**

- H3: FOMO from seeing *others'* scores
- H4: Behavior change from seeing *the group's* verification patterns
- H2: Self-insight from seeing *your own* gap
- H5: Cultural shift from *group norms* rewarding verification

They share the same infrastructure (event page, visible calibration, leaderboard) and can be tested in a single 30-person event. No information is lost by grouping them.
