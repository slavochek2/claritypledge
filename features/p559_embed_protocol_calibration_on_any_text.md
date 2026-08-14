---
status: backlog
type: story
rank: 18
tags:
  - distribution
  - protocol
  - embed
  - comprehension
  - exploration
created_date: 2026-03-21T00:00:00.000Z
flow: dev
---

# P559: Embed Protocol — Calibration on Any Text

**Origin:** Claude.ai conversation (2026-03-19, "Middleware durability in the AI stack") + exploration session (2026-03-21)
**Relationship to P523:** P523 builds the mechanism (story-first, comprehension assessment). P559 is the distribution surface that takes it to where readers already are. P523 should validate first.
**Depends on:** H-StoryFirst (P523), H-WTP-Pain (bottleneck — gap reveal must produce pain before distribution matters)

---

## Problem Statement

ClarityPledge's comprehension gap mechanism only works inside the product. Nobody comes to the product unprompted. Distribution is the bottleneck after mechanism validation.

**Insight:** Any text IS a story. Points are reader-extracted through engagement. The author's existing writing is the story — no author cooperation needed to start.

---

## Core Concept

A protocol layer (browser extension) that enables comprehension assessment on any text on the web.

**How it works:**
1. Reader highlights a sentence → takes position (agree/disagree) or rates understanding (0-10)
2. AI identifies claims in the text automatically (hostile peer reviewer model); author can override if they embed
3. Gap revelation WITHOUT the author — via "spot the distortion" (AI paraphrases with subtle errors, reader catches or misses) and teach-back (reader explains, AI scores)
4. Data stored centrally, private by default, aggregates visible
5. Valuable to a single user on day one — personal calibration record, no network effects needed

---

## Exploration Results (2026-03-21)

250 ideas generated across 5 design questions, falsified to top survivors.

### Q1: What's a story vs point in any text?
**Winner:** Hybrid — AI identifies claims automatically (hostile peer reviewer), author overrides when available. Everything is a story by default; points are extracted through reader engagement.

### Q2: What's the interaction?
**Winner:** Nothing visible until text selection → ClarityPledge icon in tooltip → take position or rate understanding. Chrome side panel for dashboard. "Contrarian mode" (highlights where YOU diverge from others) for retention.

### Q3: Data ownership?
**Winner:** Centralized, private by default, aggregates public. Anonymous by default, attributed on opt-in.

### Q4: Comprehension without the author? (Breakthrough)
**Winner:** "Spot the distortion" — AI paraphrases text with 2-3 subtle errors. Reader catches or misses. Gap revelation is structural (you either caught it or you didn't). Author NOT needed.

Also: teach-back (explain in your own words, AI scores) and Socratic interrogation (3 deepening questions until boundary found).

**Key insight:** The revelation only lands when the reader PRODUCED the wrong output themselves. Recognition tasks allow rationalization; generation tasks don't.

### Q5: Differentiation from Hypothesis/Genius/Medium?
**Winner:** Useful with zero other readers (personal calibration record). Captures before/after delta (no tool does this). Symbiotic with authors (they get comprehension data).

---

## Conversation Import Use Case (tangent worth preserving)

Import a real conversation (WhatsApp, email, transcript) → each person's statements become stories → rate understanding → invite the other person → they counter-assess → gaps appear → prepared for /live.

This is the briefing protocol (Stage 0b) applied to real conversations. Both parties exist and have stakes. Maps to real relationships (co-founders, family, partners).

**Not in scope for P559** — this is P523 + P551 (clarity docs) + invitation flow. Filed here as future validation that the architecture is right.

---

## Mirror Agent Direction (parked)

AI could extract stories/points from everything a public figure writes → mirror agents representing people who haven't signed up → political calibration platform.

**Parked because:** Different company. 6+ months. No revenue path tested. But architecturally consistent with briefing protocol Stage 0b.

---

## Blockers

1. **H-WTP-Pain must be answered first.** If gap reveal doesn't produce pain, distributing it wider doesn't help.
2. **P523 must validate async gap revelation.** The embed distributes a mechanism; the mechanism must work first.
3. **"Spot the distortion" must be tested manually.** Take one blog post, have AI generate 3 distortions, show to one person. 2 hours, zero code.

---

## Next Steps (when unblocked)

1. Manual proof-of-concept: one blog post + AI distortions + one test reader
2. If gap revelation lands → scope V0 browser extension
3. If it doesn't → the embed concept needs the author side (falls back to P523's two-sided model)
