---
status: active
priority: p1
track: C
milestone: C1
summary: "Stories give /live a purpose — verify understanding of specific stories, not abstract 'something'"
builds: [p305, p303]
answers: [oq-6, oq-7]
---

# C1: Stories + Live + Events (Coaching Foundation)

## TL;DR (30-second summary)

**Hypothesis:** Stories solve the cold start problem — "verify understanding of THIS story" is clearer than "verify understanding of... something."

**How we test:** 20-user pilot over 4 weeks (Feb 15 - Mar 15). Users create stories, verify via /live.

**Success metric:** ≥50% story creation rate, ≥30% verification rate, qualitative feedback: "Stories make /live purposeful."

**Kill signal:** <20% story creation after 4 weeks, or stories don't improve /live sessions.

**What we're building:** Story creation (profiles) + /live beginning screen (P128) + event rooms (P124)

---

## Hypothesis

See [H-Stories-ColdStart](../hypotheses.md#h-stories-coldstart-stories-solve-lives-cold-start-problem) in hypotheses.md. Stories give /live a concrete "verify understanding of THIS" purpose, solving the cold start trigger problem ("on what? when?").

**Success:** ≥50% story creation rate, ≥30% verification rate. **Kill if:** <20% creation after 4 weeks.

---

## How We're Testing

**Method:**
1. Build story creation feature (P126)
2. Invite 20 pilot users (10 previous /live users + 10 new)
3. Prompt: "Share a story that matters to you"
4. Observe: Do they create? Do they verify?

**Timeline:** Feb 15 - Mar 15 (4 weeks)

**Measurements:**
- **Quantitative:** Story creation rate (% who create ≥1 story), verification frequency (verifications per story), retention (do authors return?)
- **Qualitative:** Exit interviews ("Did stories make /live feel more purposeful?"), observation (do users ask "on what?" less?), sentiment ("natural" vs "forced")

**Key decisions:**
- Manual story creation (test if people WANT to create before adding AI)
- Holistic verification (0-10 "did they get it?" not Points-based)
- Mix of returning + new users (test retention + cold start)
- 4-week timeline (long enough for habits, short enough to iterate)

---

## What We're Measuring

**SMART Goal:** Users create stories on profiles and verify understanding via /live.

**Target values:**
- ≥50% story creation rate (10+ of 20 users create stories)
- ≥30% verification rate (stories get verified, not just created)
- Qualitative: "Stories make /live purposeful"

**Kill thresholds:**
- <20% story creation rate after 4 weeks (too low engagement)
- <10% verification rate (stories don't trigger /live usage)
- Qualitative: "Stories feel forced" (poor UX fit)

**Data sources:**
- Database events: `story_created`, `verification_completed`, retention tracking
- Analytics: Mixpanel events, drop-off points
- User surveys: Exit interviews, NPS, qualitative feedback

**Tracking:** Weekly snapshots during pilot, month-end full analysis with decision recommendation (proceed to C2 / iterate / kill).

---

## What We're Building

**Phase 1-2:** Story creation on profiles (P126 - planned)
**Phase 3:** /live beginning screen linking to stories (P128 - in progress)
**Phase 4:** Event rooms for workshop pairing (P124 - planned)

**Done when:** Can run a workshop where participants create stories, verify in /live, pair via event rooms.

---

## Open Questions Answered

**OQ-6: What's the internal trigger?**
Stories create natural triggers ("I have a story to share" or "Someone shared a story with me").

**OQ-7: Do we need Points for verification?**
Decision: Start with holistic verification (0-10 rating). Add Points only if holistic proves too vague. Phase 4a tests holistic first.

---

## Related Documents

**Category:** Coaching track (C-workstream) — 0-6 month time horizon, coaching/workshops focus

**Features:** P126 (story creation), P128 (/live beginning screen), P124 (event rooms)

**Next milestone:** C2 (First Workshops) if pilot validates ≥50% creation + ≥30% verification
