---
status: active
priority: p1
track: C
milestone: C1
summary: "Stories give /live a purpose — verify understanding of specific stories, not abstract 'something'"
builds: []
answers: [oq-6, oq-7]
---

# C1: Stories + Live + Events (Coaching Foundation)

## TL;DR (30-second summary)

**Hypothesis:** Stories solve the cold start problem — "verify understanding of THIS story" is clearer than "verify understanding of... something."

**How we test:** 20-user pilot over 4 weeks (Feb 15 - Mar 15). Users create stories, verify via /live.

**Success signal:** After 10 sessions — people create stories without prompting, /live sessions happen on those stories, and when asked "did having a specific story make /live feel more purposeful?" the answer is yes.

**Kill signal:** People don't create stories, or sessions happen but feel forced ("I still didn't know what to verify").

**What we're building:** Story + point creation (done) + /live story verification (P272) + event room entry (before 1-to-many)

---

## Hypothesis

See [H-Stories-ColdStart](../hypotheses.md#h-stories-coldstart-stories-solve-lives-cold-start-problem) in hypotheses.md. Stories give /live a concrete "verify understanding of THIS" purpose, solving the cold start trigger problem ("on what? when?").

**Success:** After 10 sessions — stories created, /live sessions happened, qualitative: "purposeful." **Kill if:** stories don't trigger sessions, or sessions feel forced.

---

## How We're Testing

**Method:**
1. Build story creation feature (P126)
2. Invite 20 pilot users (10 previous /live users + 10 new)
3. Prompt: "Share a story that matters to you"
4. Observe: Do they create? Do they verify?

**Timeline:** Feb 15 - Mar 15 (4 weeks)

**Measurements:**
- **Manual counts:** did the person create a story? did a /live session happen on it?
- **One question after each session:** "Did having a specific story make /live feel more purposeful?" (yes/no + one sentence)
- No dashboard. No Mixpanel. 20 people — count manually.

**Key decisions:**
- Manual story creation (test if people WANT to create before adding AI)
- Holistic verification (0-10 "did they get it?" not Points-based)
- Mix of returning + new users (test retention + cold start)
- Decide after 10 sessions, not 4 weeks

---

## What We're Measuring

**The question:** Did having a story to point to make /live feel purposeful?

**After each session, record:**
- Story existed before the session? (yes/no)
- /live session happened on that story? (yes/no)
- Their answer: "Did this feel more purposeful than a generic /live session?" (yes/no + quote)

**Proceed to C2 if:** After 10 sessions — majority say yes, sessions are happening without heavy prompting.

**Kill if:** Stories don't trigger sessions, or sessions happen but people still feel "I didn't know what to verify."

---

## What We're Building

**Done:** Story + point creation on profiles, /live session flow, story verification in /live (P272), post-session magic link email (P274)
**Before 1-to-many:** Event room entry (must be easy, not QR/link friction)

**Done when:** Can run a workshop where participants create stories, verify in /live, enter rooms from event page.

## Pilot Sequence

Track current position:

1. [ ] Finish P272 (story verification in /live)
2. [ ] Push to production
3. [ ] Create own stories (active listening) — test the loop yourself
4. [ ] 1-on-1 free sessions (invite 20 warm contacts)
5. [ ] 1-on-1 paid, money-back guarantee
6. [ ] Fix event room entry (before 1-to-many)
7. [ ] 1-to-many free (Calibration Lab, lead gen)
8. [ ] 1-to-many paid
9. [ ] Offline events

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

**Next milestone:** C2 (First Founder Sessions) — gate: run ≥1 paid 1-on-1 session and hear "yes" to the purposeful question
