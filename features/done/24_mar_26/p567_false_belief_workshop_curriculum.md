---
status: all-done
type: story
rank: 1000011
tags:
  - workshop
  - content
  - points
  - stories
  - facilitation
flow: inline
created_date: 2026-03-22T00:00:00.000Z
locked_at: '2026-03-23T14:37:11.444Z'
---

# P567: False Belief Workshop Curriculum — File 8 Inverse Points as Stories

**Related:** P523 (story-first vision), H-WTP-Pain, H-TopicDepthGate, H-WorkshopFormat
**No code changes required** — this is content filing using existing product features.

## Problem

Workshops need structured curriculum. The 7-8 calibration points exist as Slava's positions, but there's no pre-filed content representing the common misconceptions they counter. Without "false belief" starting points, workshops rely on improvised questions rather than a structured discovery sequence.

## Solution

For each of Slava's 8 calibration points, file the **inverse common belief** as a story + extracted point. These become the workshop entry material:

1. Facilitator presents the false belief point (e.g., "Understanding = feeling")
2. Participants rate their position (most will agree)
3. Facilitator presents counter-story with counter-point (e.g., "Three types of understanding")
4. Participants verify understanding of counter-story via comprehension slider (P561)
5. Position switch happens — it becomes their recognized past false belief
6. Facilitator asks: "What situations would have been different? What did holding this belief cost you?"
7. Participants file stories about their past false belief, the cost, and how removing it changes things

## Content to File (8 false beliefs — inverse of calibration points)

Each item below needs: one story explaining the common belief + one extracted point.

| # | Common false belief (to file) | Slava's counter-point | Question to surface it |
|---|---|----|---|
| 1 | "Understanding someone means feeling what they feel" | Three types of understanding (cognitive, emotional, behavioral) | "When someone says 'you don't understand me,' what do they mean?" |
| 2 | "If we agree, we understand each other" | Agreement ≠ understanding | "How do you know you and your co-founder are aligned?" |
| 3 | "Good listeners just need to pay attention" | Listening accuracy is measurable and usually miscalibrated | "How would you rate yourself as a listener, 1-10?" |
| 4 | "Misunderstandings are obvious — you notice when they happen" | The gap is invisible (illusion of transparency + illusion of knowing) | "When was the last time you discovered a misunderstanding that had been building for weeks?" |
| 5 | "Asking 'do you understand?' is enough to check" | "Do you understand?" produces false positives — explain-back is the only verification | "What do you do when you need to make sure someone really got it?" |
| 6 | "Smart people understand each other faster" | Intelligence doesn't correlate with calibration accuracy | "Do you find communication easier with smarter people?" |
| 7 | "Conflict means we don't understand each other" | Most conflict is informed disagreement, not misunderstanding — but most people can't tell which | "Think of your last disagreement — was it about understanding or about values?" |
| 8 | "More communication fixes miscommunication" | Volume ≠ verification — more talking without checking compounds the gap | "When communication breaks down, what's your instinct?" |

**Note:** The exact wording of false beliefs and questions will be refined through workshop use. File V1 now, iterate from real participant reactions.

## V2 — 9-question surfacing set (the 9 stories)

Refined, open-question phrasing tied to the 9 belief-stories. Where the table above starts from the *false belief* and derives a question, this set leads with the **open question** and names the belief it surfaces — the format used to open a workshop/1:1 without tipping the answer. This is the current canonical surfacing set; the 8-row table above is retained as the calibration-point mapping (belief → counter-point).

| # | Open Question | False Belief It Surfaces |
|---|---|---|
| 1 | "When someone says 'you don't understand me,' what do they really want?" | Understanding = empathy; you feel it or you don't |
| 2 | "How reliably can you determine whether you cognitively understand what someone is saying — and what's the evidence for this?" | My track record is reliable; I'd notice if I misunderstood |
| 3 | "How do you know someone understood what you said?" | Intuition is the most reliable indicator |
| 4 | "Does expressing your emotions freely while listening help or hurt reaching understanding?" | Expressing freely = engaged; holding back = withholding |
| 5 | "When interests clash, what should you aim for first?" | Make the other person feel what you feel |
| 6 | "Is it OK to decline a paraphrasing request without saying why?" | It's patronizing; you shouldn't have to prove you listened |
| 7 | "Should partners formalize how they reach clarity — or just figure it out naturally?" | No formal process needed if both people care |
| 8 | "How do you test a potential partner's capacity to learn and admit mistakes?" | No way to test upfront; only experience tells |
| 9 | "What is the most effective way to inspire others to practice verified cognitive understanding?" | Actions are enough; public declarations don't matter |

## Acceptance Criteria

- [ ] 8 stories filed on ClarityPledge (one per false belief), each with Slava as author
- [ ] 8 points extracted from those stories (the false belief claims)
- [ ] Slava takes "strongly disagree" position on each false belief point
- [ ] Each false belief point links to Slava's existing counter-story/counter-point
- [ ] Content is workshop-ready: questions in story text, false belief as extracted point

## Workshop Flow (Using Filed Content)

```
For each false belief (8 total, pick 3-4 per workshop):

1. SURFACE: Ask the question → participants discover their belief
2. POSITION: Participants rate agreement with false belief point (most: 8-10)
3. STORY: Present your counter-story (or let them read on card)
4. VERIFY: Comprehension slider on your story (P561)
5. SWITCH: After verified understanding, re-rate position
6. REFLECT: "What situations would have been different?"
7. FILE: Participants file their own story about their past false belief
   - What it cost them (past pain)
   - What holding it in others costs their relationships (empathy)
   - How predictably removing it improves things (future value)
```

## Why This Matters

- **H-WTP-Pain:** Step 6 is the direct test — does breaking a false belief connect to felt cost?
- **H-TopicDepthGate:** False beliefs engineer depth immediately — no topic drift needed
- **Content flywheel:** Participant stories (step 7) become testimonials + calibration data
- **Story reputation:** Points where diverse audiences switch positions after verified understanding = empirically calibrating stories. Measurable once P561 ships.

## Out of Scope

- Product code changes (uses existing filing flow)
- P561 (comprehension slider — separate spec, must ship first or in parallel)
- Automated position-switch tracking (future metric, not V1)
