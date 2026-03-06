---
status: active
priority: p0
track: C
milestone: C1
summary: "Run 3-5 facilitated sessions with co-founder pairs, surface clarity gaps, test if they return"
builds: []
answers: [oq-6, oq-7]
---

# C1: First Pairs (Facilitated Calibration Sessions)

## TL;DR (30-second summary)

**Hypothesis:** Co-founder pairs who experience a false agreement/disagreement revealed in a Slava-facilitated session will recognize it as a costly problem and return for more.

**How we test:** Run 3-5 free facilitated sessions with real co-founder pairs on real decisions. Slava uses /live as his diagnostic tool — pairs don't need to learn the tool.

**Success signal:** "Holy shit" reaction — pair discovers they thought they agreed but didn't. They quantify the cost. They book session 2.

**Kill signal:** Gap reveal doesn't surprise them, or they find it interesting but not worth paying to prevent, or zero pairs book a second session.

**What we're building:** Nothing new. Use existing /live + stories/points. The session IS the product discovery.

---

## Hypothesis

See [H-PairsReturn](../hypotheses.md#h-pairsreturn-co-founder-pairs-recognize-the-clarity-gap-as-a-costly-problem-and-return-for-ongoing-facilitated-calibration) in hypotheses.md. Core question: do co-founder pairs recognize false agreements as costly enough to pay for ongoing calibration?

**Secondary test (H-Stories-ColdStart):** After facilitated session + agreement, do pairs use /live independently? If not, does filing content FOR them trigger return? See [H-Stories-ColdStart](../hypotheses.md#h-stories-coldstart-filed-content-gives-live-a-trigger--without-it-pairs-ask-on-what-and-dont-return-independently).

---

## Session Format

Slava is the doctor. /live is the stethoscope. Pairs don't need to learn the stethoscope.

**Session (45-60 min):**
1. Ask Founder A: "Explain your position on [real decision]"
2. Ask Founder B: "Tell me what A just said"
3. Watch the gap appear
4. A confirms: "...no, that's not what I meant"
5. Both founders go "holy shit"
6. Quantify: "How long have you been misaligned on this? What did it cost?"
7. If strong reaction → create partner agreement → book session 2

**Prep (optional, for session 2+):**
- Pair shares a recent meeting transcript or decision context
- Slava + AI processes it, identifies likely false agreements
- Session targets the specific gaps found

---

## What We're Measuring

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Sessions run | 3-5 | Calendar |
| "Holy shit" reaction | Present in ≥3 | Observation + notes |
| Pain quantified | "This cost us X weeks/dollars" | Direct quote |
| Agreement created | ≥50% of sessions | Agreement count |
| Session 2 booked | ≥2 pairs | Calendar |
| Independent /live use (H-Stories-ColdStart) | Observe | Session logs (30-day check) |

---

## 2-Step Return Test (H-Stories-ColdStart)

After a facilitated session where agreement was created:

**Step 1 (weeks 1-2):** Observe — does the pair use /live independently without prompting?

**Step 2 (if no return):** File 2-3 stories/points FOR them from the session. Send: "Your co-founder filed a point about [topic]. Agree or disagree?" Observe if notification triggers return.

| Result | What it means | Next step |
|--------|---------------|-----------|
| Return WITHOUT content | Protocol + agreement is enough | Filing is enhancement (V2) |
| Return only AFTER content filed | Content is the trigger | Build easy filing (AI-assisted) |
| No return either way | Problem is deeper | Reassess: motivation, UX, or wrong ICP |

---

## Pilot Sequence

1. [ ] Identify 3 co-founder pairs (warm intros, prospect, founder communities)
2. [ ] Reach out to first pair — "45 min, free, I surface where you think you agree but don't"
3. [ ] Run first facilitated session on a real decision they're facing
4. [ ] Observe: did the "holy shit" moment happen? Did they quantify pain?
5. [ ] Create partner agreement with the pair (if session landed)
6. [ ] Book session 2 with first pair
7. [ ] Observe 2-week window: does pair use /live independently? (H-Stories-ColdStart step 1)
8. [ ] If no independent return: file 2-3 stories/points FOR them, send notification (step 2)
9. [ ] Run sessions 2-3 with additional pairs
10. [ ] Decision: proceed to C3 retainer offer (if ≥2 pairs book session 2) or reassess

---

## Acquisition

**For first 1-3 pairs:** Direct warm outreach. Message:

> "I'm testing a new format — 45 minutes, free. I sit with you and your co-founder while you discuss a real decision. I'll surface where you think you agree but don't. Interested?"

**For pairs 3-10:** Calibration Lab workshops (group format, AI calibration teaser as opener — see H-AICalib-EntryTeaser).

**Booking channel:** ladischenski.com → free Calibration Lab or direct session.

---

## Decision Points

**If <2 pairs agree to session:** Outreach problem, not product problem. Try different channels.

**If gap reveals don't surprise:** Wrong pairs (too aligned) or wrong framing. Try pairs with visible tension.

**If "holy shit" but no session 2:** Value recognized but not enough to act on. Explore: is it friction? Cost? Timing?

**If ≥2 pairs book session 2 + quantify pain:** Proceed to retainer offer (H-Retainers-Sticky / C3). Create first case study for R-track.

---

## History

**Previously "C1: Stories + Live + Events"** — a 20-user pilot (Feb 15 - Mar 15) testing stories as cold start content. Pilot never ran. Merged with C2 (First Calibration Labs) on 2026-03-06. Rationale: the prior framing assumed pairs would use /live independently with filed stories. Revised understanding: Slava facilitates first, independent use is a downstream question (H-Stories-ColdStart step 2).

**What carried forward from original C1:**
- Stories/points architecture (built, working in prod)
- /live session flow (built, working in prod)
- Story verification in /live (P272, built)
- The "on what? when?" insight → now tested explicitly in H-Stories-ColdStart

---

## Related Documents

**Category:** Coaching track (C-workstream) — months 1-6

**Next milestone:** C3 (Paid Founder Retainers / Fractional Clarity Officer) — gate: ≥2 pairs book session 2 + quantify pain

**Features in prod:** P126 (story creation), P272 (story verification in /live), P274 (magic link email), partner agreements
