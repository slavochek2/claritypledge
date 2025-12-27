# P13: Future Vision — Meme Mapping Platform

## Summary

Long-term vision for a platform that maps shared understanding across ideas, enabling peer-to-peer verification of understanding and highlighting when people can understand each other despite disagreement.

**Status:** Vision document — not for immediate implementation. See [p12](./p12_onboarding-comprehension-check.md) for current MVP.

## The Big Idea

A Twitter-like platform where:
- **Ideas exist independently** (no owners, like Dawkins' memes)
- **People hold positions** (agree/disagree/don't know)
- **Understanding can be certified peer-to-peer** after real conversations
- **Cross-disagreement understanding is highlighted** as the valuable signal
- **PageRank-style algorithm** weights understanding reputation

## Core Insight: Understanding ≠ Agreement

The system distinguishes:
- **Agreement:** Same position on an idea
- **Understanding:** Ability to articulate someone else's position accurately

**You can disagree AND understand.** This is the valuable signal.

A person who disagrees with you but can accurately paraphrase your position is more valuable than someone who agrees but can't explain why.

## Understanding Certification Flow

When two people have a conversation and one successfully paraphrases the other:

1. **Trigger:** Person A asks Person B to mirror back their idea
2. **Paraphrase:** Person B explains back what they think A meant
3. **Confirmation:** Person A confirms "Yes, you understood me"
4. **Certification:** A certifies in the app: "[B] understands my position on [Idea X]"

This creates:
- A certification record linking A, B, and Idea X
- Data about their respective positions (agree/disagree)
- Reputation for B as a "verified listener"

## Cross-Disagreement Understanding

**The most valuable certification:** When two people hold opposite positions but still verify mutual understanding.

```
Idea: "The pledge should be mandatory for all employees"

Alice: Agrees
Bob: Disagrees

After conversation:
- Alice certified Bob understands her (despite disagreeing)
- Bob certified Alice understands him (despite disagreeing)

Signal: This disagreement is REAL, not a misunderstanding
```

## Peer-to-Peer Model (No Owners)

Ideas have no owners — only holders:
- First person to submit an idea is just "first holder"
- If they remove their position, idea still exists if others hold it
- Anyone can certify understanding with anyone else
- Certifications are directional: "A understands B" ≠ "B understands A"

## UI Concepts Explored

### On Idea Card
```
🤝 2 verified across disagreement
   ↳ "Marcus (✗) understood by Billy (✓)"
```

### On User Profile
```
🤝 Verified Listener Score: 4
   "4 people have certified this person understands them"
   2 across disagreement
```

### In Reactions Modal
```
👤 Marcus Chen ✗
   🤝 Verified listener: 2 (1 across disagreement)
   [Certify Marcus understands me]
```

## PageRank-Style Reputation

**Concept:** Understanding reputation weighted by:
- Who certified you (high-reputation certifiers = more weight)
- Whether certification crosses disagreement (harder = more valuable)
- Diversity of ideas (understanding across many topics = breadth)

**Signal:** "This person genuinely listens and understands, even people they disagree with"

## Data Model (Future)

### understanding_certifications
- id (uuid)
- idea_id (uuid)
- certifier_id (uuid) — who is certifying
- certified_user_id (uuid) — who is being certified
- certifier_reaction — certifier's position on the idea
- certified_user_reaction — certified user's position
- created_at
- evidence (text, nullable) — optional transcript/notes

### Derived Metrics
- `verified_listener_score` — count of certifications received
- `cross_disagreement_count` — certifications where positions differ
- `understanding_breadth` — unique ideas certified on

## Use Cases

### 1. Workshops
- Facilitator creates list of controversial ideas
- Participants mark agree/disagree
- Pairs discuss, trigger paraphrasing
- Certify understanding after successful paraphrase
- See who can understand across disagreement

### 2. Onboarding Verification
- New pledgers take comprehension check
- Admin (or AI) verifies understanding
- Creates certification record
- Builds baseline understanding score

### 3. Conflict Resolution
- Two parties in disagreement
- Each marks position on core ideas
- Facilitate paraphrasing back and forth
- Certify mutual understanding
- Disagreement becomes "informed disagreement"

### 4. Team Alignment
- Team creates ideas about project direction
- Members mark positions
- Surface where team disagrees
- Verify mutual understanding before deciding

## Why This Matters

### False Agreements
People think they agree but actually interpret differently.
→ Paraphrasing reveals "we meant different things"

### False Disagreements
People think they disagree but actually agree.
→ Paraphrasing reveals "oh, we're saying the same thing"

### Informed Disagreement
The goal: disagreements where both parties understand each other.
→ Now you can decide without talking past each other

## Open Questions

1. **Voice/Video Recording:** Should paraphrasing be recorded as evidence?
2. **AI Verification:** Can AI certify understanding, or only humans?
3. **Gaming Prevention:** How to prevent friends certifying each other falsely?
4. **Cold Start:** How to bootstrap with sparse data?
5. **Privacy:** Who sees certification data? Public or private?

## Metrics to Track (When Built)

- Triggers per user per day
- Certification rate (triggers that result in certification)
- Cross-disagreement rate
- Time to first certification
- Correlation: certification → pledge virality

## Related

- [p12_onboarding-comprehension-check.md](./p12_onboarding-comprehension-check.md) — Current MVP
- Richard Dawkins — The Selfish Gene (memes concept)
- Steven Pinker — Common Knowledge (coordination problem)
- Sender-Receiver Communication Model

## Status

**Not for implementation now.** This document captures vision from design thinking session (Dec 2024) to inform future development once MVP data validates core assumptions.
