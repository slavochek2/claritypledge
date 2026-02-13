---
status: active
priority: p1
track: C1
tested_by: [e-story-creation-pilot]
supports: [o-story-usage]
related_hypotheses: []
---

# H-Stories: Stories Solve the Cold Start Problem

## Hypothesis Statement

Stories provide the "what" that /live needs. "Verify understanding of THIS story" is a clearer purpose than "verify understanding of... something."

## Rationale

**The problem:** /live works (users report feeling understood) but users ask "on what? when?" — no trigger for spontaneous use.

**Why stories solve this:**
- Stories are concrete (not abstract "let's verify something")
- Stories create natural triggers ("I have a story to share")
- Stories provide context (verification feels purposeful)
- Stories are the content layer /live was missing

**User feedback that led to this hypothesis:**
- "I like /live but don't know when to use it" (P96 validation notes)
- "On what?" (repeated question during /live demos)
- "/live feels good in the moment but I forget about it later"

## Assumptions

**Critical assumptions:**
1. People have stories they want to share (not just professional updates)
2. Story creation is low-friction enough (won't block usage)
3. Verification on stories feels more purposeful than verification on abstract topics
4. Story authors value knowing who understood (creates retention loop)

**Dependency assumptions:**
- /live verification protocol already works (H1 validated)
- Explain-back mechanism proven effective (healthcare teach-back evidence)

## Evidence

**Supporting research:**
- **Narrative psychology:** Stories are how humans make sense of experience (Jerome Bruner)
- **Social proof:** Medium, Substack built on "everyone has a story worth sharing"
- **User feedback:** "I like /live but don't know when to use it" (P96 validation notes)

**Hypothesis-specific evidence:**
- None yet (pilot starting)
- Will be updated as e-story-creation-pilot generates data

## Success Criteria

**Hypothesis validated if:**
- [ ] Users create stories without prompting
- [ ] Users select stories to verify (don't ask "on what?")
- [ ] Verification sessions feel focused (qualitative feedback)
- [ ] Story authors see value in knowing who understood (retention signal)
- [ ] "On what?" question disappears (users have answer)

**Quantitative threshold:**
- ≥50% of pilot users create at least 1 story
- ≥30% of stories get verified via /live
- Qualitative: "Stories make /live feel purposeful" (exit interviews)

## Failure Criteria (Kill Signals)

**Hypothesis invalidated if:**
- Nobody creates stories after 4 weeks of availability
- Stories exist but users still ask "on what?" during /live sessions
- Story verification feels forced/artificial (qualitative feedback)
- Story creation friction too high (users abandon mid-creation)
- No retention loop (story authors don't return to see who understood)

**Quantitative kill threshold:**
- <20% story creation rate after 4 weeks
- <10% verification rate on existing stories
- Qualitative: "Stories feel like homework" (negative feedback)

**If hypothesis fails:** Return to cold start problem. Consider alternatives:
- Pre-seeded topics (e.g., "verify understanding of calibration concept")
- Prompted contexts (e.g., "verify understanding of yesterday's meeting")
- Event-triggered verification (e.g., "verify understanding after workshop")

## Related Hypotheses

None yet. Future hypotheses might test:
- H-Stories-Scale-Understanding (AI can verify understanding at scale)
- H-Stories-Training-Data (verified Stories work as AI training data)
- H-Story-Modes (Listener Mode vs Tester Mode reciprocity)

## Experiments Testing This

See `/docs/experiments/`:
- [e-story-creation-pilot.md](../experiments/e-story-creation-pilot.md) — 20-user pilot over 4 weeks

## Outcomes This Supports

See `/docs/outcomes/`:
- [o-story-usage.md](../outcomes/o-story-usage.md) — Story creation + verification rates

## Track Context

This hypothesis is part of **C1: Stories + Live + Events** (Coaching foundation track).

See [../tracks/c1-stories-live-events.md](../tracks/c1-stories-live-events.md) for full track context.
