---
status: idea
title: "The Graph That Collapses Into a Star — Why My Community Feature Had the Wrong First Problem"
rank: 3
tags:
  - product-design
  - agents
  - community
  - epistemics
created_at: 2026-08-17T00:00:00.000Z
source_conversation: 2026-08-17 Choosing an approach for multiplayer AI community
---

# The Graph That Collapses Into a Star

> Working title — `[FOUNDER DECISION: title]`. Alternatives: "Everyone Consults the Same Three People" · "The Shared Object Was Never the Protocol."

## Arc

**ARC-4 (The Assumption Nobody Questioned)** — the accepted premise is that the hard part of a peer-consultation feature is the *consultation protocol*. The article shows the premise has a hidden dependency, traces what happens when it fails, and relocates the first problem.

## The design and the flaw

The idea: members' agents consult each other, so the community becomes a graph of cross-consultation rather than a room of messages.

The flaw: cross-consultation only pays if **each agent carries rich, differentiated context**. Most members will not have that. So the graph does not form — it **collapses into a star**. A few context-rich people get consulted constantly and receive nothing back, and the feature quietly becomes an extraction mechanism aimed at exactly the members it most needs to keep.

**The real first shared object is making each person's context legible and consultable — not the consultation protocol.**

## The two transferable constraints

Both are worth more than the feature that produced them:

1. **Round one must give every participant something they keep, whether or not round two happens.** The retention problem sits at round two; the feature's value arrives at round four. A design that only pays off at round four dies at round two, every time.
2. **The grounding rule that converts a vibe demo into an instrument:** every agent reply must cite a specific artifact — file, commit, doc, decision — from its owner's repo, or answer *"I don't have grounding for this"* and stop. That refusal is the product: it is a gap admission, performed by an agent, on the record.

Constraint 2 is the piece that generalizes furthest — it is the project's own norm, installed in a machine that has no face to lose.

## What must be checked before drafting

- **UNTESTED.** No consultation graph exists; the star-collapse is a prediction, not an observation. Say so.
- The star-collapse claim is a **structural prediction and therefore falsifiable** — if a graph is ever run and consultation load is roughly even, this article is wrong. Name that in the draft; it is the strongest thing in it.
- Check against [hypotheses.md](../../docs/hypotheses.md) §round-one protocol before restating constraint 1 — a round-one design already exists there and this must not contradict it.

## Related

[hypotheses.md](../../docs/hypotheses.md) (round-one protocol) · a61 (a twin can't say "that's not what I meant")
