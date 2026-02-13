---
status: active
priority: p1
summary: "Stories give /live a purpose — verify understanding of specific stories, not abstract 'something'"
tests: [h-stories-solve-cold-start]
builds: [p128, p124]
measures: [o-story-usage]
answers: [oq-6, oq-7]
---

# C1: Stories + Live + Events (Coaching Foundation)

## TL;DR (Quick Summary)

**Hypothesis:** Stories solve the cold start problem — "verify understanding of THIS story" is clearer than "verify understanding of... something."

**How we test:** 20-user pilot over 4 weeks. Users create stories, verify via /live.

**Success metric:** ≥50% story creation rate, ≥30% verification rate, qualitative feedback: "Stories make /live purposeful."

**Kill signal:** <20% story creation after 4 weeks, or stories don't improve /live sessions.

---

## Deep Dive (Full Details)

**What we're building:** Story creation (profiles) + /live verification (beginning screen) + event rooms (workshop pairing)

**What we're testing:** [H-Stories: Stories solve cold start problem](../hypotheses/h-stories-solve-cold-start.md)

**What we're measuring:** [O-Story-Usage: Creation + verification rates](../outcomes/o-story-usage.md)

**Experiments running:** [E-Story-Creation: Pilot with 20 users](../experiments/e-story-creation-pilot.md)

## Build Requirements

**Phase 1-2:** Story creation on profiles (planned)
**Phase 3:** /live beginning screen linking to stories (P128)
**Phase 4:** Event rooms for workshop pairing (P124)

**Done when:** Can run a workshop where participants create stories, verify in /live, pair via event rooms

## Kill Signal

See [H-Stories kill criteria](../hypotheses/h-stories-solve-cold-start.md#failure-criteria-kill-signals): <20% story creation rate after 4 weeks, or stories don't improve /live sessions.

## Open Questions Answered

### OQ-6: What's the internal trigger?

**Answered by:** Stories create natural triggers ("I have a story to share" or "Someone shared a story with me")

**See:** [H-Stories rationale](../hypotheses/h-stories-solve-cold-start.md#rationale)

### OQ-7: Do we need Points for verification?

**Decision:** Start with holistic verification (no points). Add points only if holistic proves too vague.

**See:** [E-Story-Creation protocol](../experiments/e-story-creation-pilot.md#experimental-design-decisions) (Phase 4a tests holistic, Phase 4b adds points if needed)

---

## Related Documents

**Track category:** [Coaching Track](coaching-track.md) (classification guide)

**Hypothesis:** [h-stories-solve-cold-start.md](../hypotheses/h-stories-solve-cold-start.md)

**Experiment:** [e-story-creation-pilot.md](../experiments/e-story-creation-pilot.md)

**Outcome:** [o-story-usage.md](../outcomes/o-story-usage.md)

**Features:** P128 (/live beginning screen), P124 (event rooms)
