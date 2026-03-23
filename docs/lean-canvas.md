# Lean Canvas: ClarityPledge (Platform)

**Last updated:** 2026-03-22

> **Scope:** This canvas covers the ClarityPledge platform — the open-source tool and community. For the coaching business that funds and validates the platform, see the coaching canvas (private, `.private/docs/lean-canvas-coaching.md`).

---

## Problem

**People overestimate how well they communicate AND how well they understand others.** No feedback loop exists to close the gap.

Two calibration failures:
1. **Speakers** overestimate how clearly they communicated (illusion of transparency)
2. **Listeners** overestimate how well they understood (illusion of knowing)

Conversations end without checking if understanding actually happened. The result is **False Agreement** — both parties believe they've aligned, but neither has verified it.

**The measurement problem:** 75% of research relies on self-reports (the miscalibration we're trying to fix). Meta-analysis (Yang et al. 2023, N=15,889) shows self-assessed understanding correlates only r=.178 with actual comprehension. Gong measures talk-time, not comprehension. 360 feedback buries "listening" as 1 item among 30.

**What the platform measures:** Understanding calibration (metacognitive accuracy) — the gap between "how well I think I understood" and "how well I actually understood," as verified by the speaker.

*For the cognitive science behind this, see [philosophy.md](philosophy.md)*

---

## Why Now?

- **Remote/hybrid work** broke informal understanding-checks. Async communication multiplies misunderstanding.
- **Political polarization** at historic highs. People talk past each other constantly.
- **Social media dissatisfaction** — people want deeper connection, not more feeds.
- **Big problems require coordination** — climate, AI safety, institutional reform need groups to actually understand each other at scale.
- **Trust collapse** — institutional credibility at all-time lows. Individual reputation matters more.
- **AI enables reasoning at scale** — but can't verify human understanding. The human verification layer becomes MORE valuable.

The tools for talking got better. The tools for understanding didn't.

---

## Customer Segments

### Primary: Individual Practitioners

Anyone who wants to practice calibrated communication — professionals, students, couples, facilitators. The platform is free for individual use, forever.

**Jobs to be done:**
| Job | Value |
|-----|-------|
| Experience my calibration gap | "I didn't know I had this blindspot" |
| Practice explain-back with others | Skill building in safe environment |
| Track my calibration accuracy | See improvement over time |
| Signal commitment to understanding | Public pledge + certificate |

### Secondary: Coaches, Facilitators, OD Practitioners

Professionals who need a comprehension measurement tool — something DISC/MBTI/360 can't do. They bring the tool into their own practice with their own clients.

**Why promising:** $100B+ coaching/L&D market. Coaches already have alignment vocabulary; ClarityPledge adds comprehension accuracy they lack. Falsification-tested: large market, active tool adoption, existing problem awareness.

### Future Segments (explore after core validates)

| Segment | Status | Why Promising |
|---------|--------|---------------|
| Civic dialogue orgs (Braver Angels, etc.) | EXPLORE | $2B+ market. They know the problem; they lack measurement. Grant-fundable. |
| AI alignment researchers | PARKED | Needs session data corpus. Revisit after 10+ case studies. |
| Personal AI / digital twins | PARKED | Calibration as infrastructure for AI agent alignment. |
| Embeddable protocol (browser extension) | EXPLORED (P559) | Blocked by H-WTP-Pain + P523 validation. |

---

## Unique Value Proposition

> **"The first tool that measures whether understanding actually happened — not whether people think it did."**

Open-source, free, community-driven. A practice, not a SaaS — like NVC or Vipassana, a practice with a community around it. Practices spread through communities, not sales funnels.

**Strategic through-line:** Every session generates labeled calibration data — measured gaps between perceived and actual understanding. The platform IS the data collection mechanism. Long-term, this dataset powers mirror agents and predictive misunderstanding detection. "Intelligence infrastructure for human understanding."

---

## Solution

A **practice system for calibrated communication** — evolving toward **Stories that scale your inner world**.

### 1. The Pledge (Brand & Identity)
A social contract that makes verification acceptable:
> **YOUR RIGHT:** Ask me to explain back what I understood.
> **MY PROMISE:** I'll explain without judgment so you can confirm or correct.

### 2. /live — Real-time Verification (Core Product)
1. Speaker shares an idea
2. Listener plays back their understanding
3. Both rate: listener's confidence vs. speaker's accuracy rating
4. The gap = **Understanding Gap**
5. Speaker certifies when satisfied

### 3. Stories & Points (Scaling Mechanism)
Stories are how authors scale their inner world. Points are extracted from stories — never created standalone. Optional comprehension assessment lets authors and readers surface understanding gaps asynchronously.

**False-belief workshop curriculum (2026-03-22):** Each of the 8 calibration points has an inverse "false belief" — a common misconception (e.g., "understanding = feeling"). Workshops start from participants' false beliefs: question → surface belief → position on false-belief point → present counter-story → verify understanding (comprehension slider) → position switch → reflection ("what did this cost you?") → participant files story about their past false belief. Participant stories = testimonials + calibration data + social proof in one artifact. See [P567](../features/p567_false_belief_workshop_curriculum.md) and [facilitator-guide.md](facilitator-guide.md).

### 4. Briefing Protocol (Cold Start — Future)
Person A's mirror agent reaches out to Person B — "Someone you care about wants you to understand them better." Generates mirror claims, tests comprehension. A and B start at depth on day one.

### 5. Calibration Profile
Track accuracy over time. Public credential for professional reputation.

---

## Current Alternatives

- **Nothing** — assume understanding, discover misalignment later (the real competitor)
- **Facilitation tools** (Miro, Mural) — enable collaboration, don't verify understanding
- **Polling tools** (Slido, Mentimeter) — collect opinions, don't check comprehension
- **Communication training** (Crucial Conversations) — teaches skills, doesn't measure outcomes
- **Conversation intelligence** (Gong, Chorus) — measures talk-time, not comprehension
- **360 feedback** — listening is 1 checkbox of 30, rated once a year
- **Self-assessment** — people overestimate; that's the whole problem

**Gap:** No one treats understanding as something you can measure and certify.

---

## Channels

**Primary flywheel (2026-03-23):**
```
Workshop (false-belief curriculum on cards, P567)
    → Participant stories filed (testimonials + calibration data + social proof)
    → Blog article describing workshop experience → Distribution (LinkedIn, communities)
    → De-risking package (co-founder pairs)
    → New blog content + FCO retainer material → Flywheel
```
Workshop → coaching conversion (de-risking package, FCO retainer) is in the coaching canvas.

- **Blog + content** — 7-points article with false-belief inverses, build-in-public posts, workshop recordings
- **Workshops** — false-belief curriculum (P567). Participants calibrate against YOUR points, file stories. 1-to-many, no pairing needed.
- **Coach/facilitator adoption** — future, after workshops + sessions prove model
- **Community spread** — rationalists, EA, LessWrong, builder communities
- **Organic / SEO** — manifesto, blog, feed, pledge profiles
- **Open-source contributions** — AGPL-3.0, GitHub

---

## Key Metrics

| Metric | What it measures |
|--------|------------------|
| **Monthly active /live sessions** | Core engagement |
| **Understanding Gap measurements/week** | Protocol adoption |
| **Stories created** | Content flywheel |
| **Pledges signed** | Movement growth |
| **Calibration profiles with 5+ data points** | Sustained practice |
| **External practitioners using the tool** | Distribution beyond founder |

---

## Revenue Model

**Phase 1 (current): None.** The platform is free. Funded by the founder's coaching practice (see coaching canvas). The platform is the loss leader and data collection mechanism.

**Free tier (always):**
- Individual /live use: free (forever)
- Personal calibration profiles: free
- Basic stories/points: free

**Phase 2 (future, after coaching validates):**
- Mirror Agent SaaS subscription
- Premium analytics for teams
- API access for embedded calibration
- Grant funding for civic/research use cases

---

## Unfair Advantage

1. **First to measure conversational comprehension calibration.** Listener-side calibration in conversation doesn't exist in the literature. /live is the first instrument that measures it.
2. **Data moat** — every session generates calibration data. Over time, the largest dataset on human understanding gaps.
3. **Network effects** — verified listener reputation gains value as more people recognize it.
4. **Protocol-led growth** — the explain-back protocol spreads free. The measurement captures value.
5. **Brand as standard** — "Clarity Pledge" as default certification for good-faith dialogue.

**On open source:** The code is open, but the moat is the network + data + brand, not the software.

---

## Cost Structure

Hosting, Supabase, LLM API costs (Gemini via GCP credits). Founder's development time. Near-zero operational.

---

## Relationship to Coaching Business

ClarityPledge is the platform brand (like Stripe). The founder's coaching practice at ladischenski.com is the primary user, funder, and validator during Phase 1.

- **Coaching → Platform:** Funding, real session data, protocol validation, case studies
- **Platform → Coaching:** Diagnostic tool for sessions, credibility proof, SEO/content lead gen
- **Boundary:** The platform never charges for what coaching clients get in sessions. Coaching revenue flows through the personal brand; platform adoption through the community.

For the coaching business model, price ladder, and unit economics: see coaching canvas (`.private/docs/lean-canvas-coaching.md`).

---

## Validation Status

**Current state (2026-03-22):** 28+ sessions run. Protocol validated — gap reveals land. WTP untested via the platform itself (platform is free; WTP testing happens through coaching). Key open question: does the "holy shit" moment produce urgency or just curiosity? See [hypotheses.md](hypotheses.md) H-WTP-Pain.

---

## Related Documents

- [hypotheses.md](hypotheses.md) — Testable beliefs (what we're testing)
- [theory-of-change.md](theory-of-change.md) — How change spreads + Evidence Base
- [philosophy.md](philosophy.md) — WHY this works (epistemology)
- [definitions.md](definitions.md) — Concept definitions
