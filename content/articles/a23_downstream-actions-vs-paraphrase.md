---
status: idea
title: "Downstream Actions vs Paraphrase — Two Heuristics for Catching the Illusion"
rank: 3
tags:
  - protocol-mechanics
  - verification
  - paraphrase
  - failure-modes
created_at: 2026-05-22T00:00:00.000Z
source_conversation: 2026-05-22 Understanding through downstream actions
---

# Downstream Actions vs Paraphrase

## Idea

An alternative heuristic to ClarityPledge's paraphrase verification: **action articulation** — instead of asking the listener to paraphrase, ask them what they'll *do* with what they heard. The reasoning: actions are concrete; words are slippery.

The article concedes the case where action-articulation works (concrete near-term actions in shared context) and names the failure modes where it misses:

1. **Long-horizon decisions** — actions are too far away to articulate.
2. **Same-words-different-meaning** — both can articulate the same action while meaning different things.
3. **Implicit constraints** — the listener's articulated action skips constraints the speaker assumed.
4. **Untested actions** — articulation feels coherent but never gets reality-tested.

Paraphrase becomes necessary as misunderstanding cost rises — it's the more general instrument because it operates at the meaning layer, not the consequence layer.

**The regress argument (sharper than the four failure modes above).** The strongest objection is that a skilled practitioner can just ask deeper action questions ("what do we ship? what's on the landing page? how many users before launch?") and surface the gap. The real limit is a *regress*: ask "what do we ship?" and both answer "the MVP" — same words, surface agreement, gap not surfaced. Ask deeper — "what's in the MVP?" — both say "core features." The illusion reforms one level down. You either stop (exhausted, client restless) or you've reintroduced the verification overhead the heuristic was supposed to skip. The structural reason: action-articulation verifies through *more shared vocabulary*, but the original illusion was *built on* shared vocabulary (same words, different models). Adding words gives the illusion more surface to hide on. Paraphrase is different in kind — it forces the listener to reproduce the model *in different language*; if the underlying model didn't transfer, the new words won't reconstruct the same meaning. The reformulation is the test, not the agreement. So action-articulation isn't a substitute for paraphrase — it's another instance of the same problem it claims to solve, with extra steps. This regress argument is the actual disagreement; the launch-date example is just the entry point.

## Why article-worthy

- Engages a real alternative heuristic on its merits, not a straw man — gives it a hook beyond internal CP vocabulary. **Deliberately unattributed:** practitioners who use action articulation are not ClarityPledge's competitors, and naming a private individual to frame them as one is both inaccurate and not ours to do.
- Honest about where the other heuristic wins. Strengthens credibility of the broader claim.
- Short, focused — easier to ship than a 3000-word piece.

## Open question

Should this be a standalone short piece (a23) or a section inside a17 (three types of understanding) / a18 (common ground vs language)? Currently filed as standalone; revisit if it stays under 800 words.

## Source

2026-05-22 conversation: Understanding through downstream actions. Founder marker: "could be an article or addition to one of our articles."
