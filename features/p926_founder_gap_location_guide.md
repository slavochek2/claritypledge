---
status: week
type: story
rank: 5
workstream: content
created_date: '2026-06-10'
tags: [content, topic-selection, founder-guide, h-topicdepthgate]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P926: Founder Gap-Location Guide — where the illusion of understanding hides

> **Re-scope approved 2026-08-07 (board review). Two changes, and the second is a promotion.**
>
> 1. **Re-frame from co-founder pairs to the active wedge.** This spec asks for "the
>    curated, founder-specific map… where **co-founder pairs** most often carry an
>    un-revealed illusion of understanding." The active focus since 2026-07-20 is a
>    **seed–A team pair** — sales/product/dev, entering through felt build-the-wrong-thing
>    pain ([lean-canvas.md](../docs/lean-canvas.md) §active-market-focus). The underlying
>    problem is unchanged and well-evidenced (~40% of /live sessions fail on topic
>    inadequacy, H-TopicDepthGate); only the domain list needs re-cutting for teams.
>
> 2. **New primary consumer: the 12-event funnel.** [goals.md](../docs/goals.md) plans
>    **12 weekly events**, and names the content gap directly — *"12–24 articles from 12
>    events… the event is the forcing function."* A curated map of high-risk domains is
>    exactly an event-topic supply: each domain is a candidate event subject **and** the
>    article that follows it. That makes this spec an input to the funnel rather than a
>    standalone marketing asset, which is why it is ranked above the letter/live work.
>
> The three consumers are now, in order: **(a)** event + article topic supply (new),
> **(b)** topic-selection aid before a session, **(c)** candidate input set for a solo
> instrument — noting that P918, the spec that owned (c), was **rejected** 2026-08-07 for
> resting on self-report. Do not revive (c) without answering that objection.



## Problem

**Situation:** ~40% of /live sessions fail on topic inadequacy (H-TopicDepthGate, [hypotheses.md](../docs/hypotheses.md)) — the protocol reaches depth fast on the *right* topic and produces confusion on the wrong one. Founders don't arrive knowing *where* their important illusions of understanding most likely sit.

**Complication:** The product makes it safe and cheap to reveal and bridge a gap (lean-canvas value-map, affective gain "safety to be radically honest"; cognitive gain "lower friction via clarity letters") — but it does not tell a co-founder pair *which* of their domains is the one quietly degrading. Without that, topic selection is left to chance or to Slava's live facilitation skill, which doesn't scale and is the ~40% failure surface.

**Question:** What is the curated, founder-specific map of the high-risk domains where co-founder pairs most often carry an un-revealed illusion of understanding — usable as a topic-selection aid before a session, as standalone marketing content, and later as the candidate input set for P918's solo risk-score?

## Appetite

**Blast radius — small.** A content artifact (guide / checklist), not a product build. No code path, no schema, no existing flow changes. Reflects on brand (it's published), so the domain framing carries reputational weight.
**Reversibility — high.** It's content; revise or unpublish freely.
**Decision density — HIGH.** The domain list, their ordering, the exact published wording, and any CTA are all `[FOUNDER DECISION]` — they encode the product's point of view on cofounder failure modes. Do not invent them; the founder seeds and prioritizes.

## Solution

A curated **gap-location guide**: a map of the domains where the cofounder feedback loop most often degrades silently, so a pair knows where to point the instrument before the loop breaks.

**Founder-seeded starting domains** (this session, 2026-06-10 — `[FOUNDER DECISION: confirm, prune, prioritize, and add]`):
- Cap table / equity split
- Decision rights & voting (who decides what, when, and how ties break)
- Role & responsibility boundaries (who owns what)
- Reward / compensation structure
- Lean canvas & core strategy assumptions (what business we're actually in)
- Exit conditions / "what if we split"

**Framing (per this session's mechanism correction):** present each domain as a place where the feedback loop between cofounders quietly degrades — not "here are gaps you can't see" (detection) but "here is where it is most worth making it safe to check, before the loop breaks" (safety + repair). "Repair" is deliberate: it is native vocabulary for the relationship-coach market (Gottman repair attempts) and consistent with the canvas's infrastructural-not-moral commitment.

**Form factor `[FOUNDER DECISION]`:** simplest viable is a written guide / checklist (blog or letter-template companion). Keep it content; do not build an interactive tool.

**Multi-purpose (note, don't scope-creep):**
- (a) Topic-selection instrument for sessions — directly attacks H-TopicDepthGate.
- (b) Marketing content — a founder-resonant artifact, not a lead-magnet for an unvalidated product (contrast the rejected P831).
- (c) Later, the candidate question/input set that feeds **P918** (solo misunderstanding-risk self-diagnostic). Relationship noted; this spec stays standalone.

## Risks / Non-Goals

### Risks
- **Domain list reads as generic founder advice.** Mitigation (MITIGATE): each domain must be tied to the *illusion-of-understanding* failure mode specifically (where both believe they agree but haven't verified), not to general cofounder conflict — otherwise it's undifferentiated from any accelerator's "align on equity early" listicle.
- **Prescribing the founder's point of view.** Mitigation (ACCEPT): the domains and wording are founder-authored; this spec provides structure and the H-TopicDepthGate rationale, not the content.

### Non-Goals
- Do NOT build an interactive product, scorer, or form — this is content. (That is P918's job.)
- Do NOT duplicate or fork P918's solo risk-score instrument.
- Do NOT invent the domain list, ordering, published copy, or any CTA — all `[FOUNDER DECISION]`.
- Do NOT promote it as a funnel into an unvalidated product surface (the P831 failure mode); it stands on its own as a topic aid + content piece.
- Do NOT add it to the session flow as a required step — it is an aid, not a gate.

## Done-When

- [ ] A published guide exists mapping the high-risk cofounder domains, with each domain tied to the illusion-of-understanding failure mode (not generic conflict advice).
- [ ] The domain list, ordering, and wording were founder-authored (every `[FOUNDER DECISION]` resolved by the founder, not filled silently).
- [ ] The guide is usable as a pre-session topic-selection aid (a pair can pick a domain to verify from it).
- [ ] No product/code build shipped under this spec (content only).
- [ ] The P918 relationship is recorded (this guide's domains are noted as candidate inputs) without this spec depending on P918.

## Deliverable

A written guide / checklist (blog post or letter-template companion — form `[FOUNDER DECISION]`), publishable on claritypledge.com and/or usable as session prep. The deliverable is the content, not a feature.
