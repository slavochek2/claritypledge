---
status: backlog
type: story
rank: 324
workstream: clarity-canvas
created_date: '2026-10-26'
tags: [canvas, mirror, stories, sales-mastermind]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1574: Partner story requests on a canvas (placeholder)

## Problem

**Situation:** At the sales mastermind, a partner reads the owner's canvas, explains it back, then
challenges it. Their reasons ("I disagree with your pricing because my clients pay yearly") are in
the session transcript. P1536 turns that transcript into the owner's next canvas version, but the
partner's *reasons* are lost: P1536 forbids naming or quoting other people in a canvas.
**Complication:** A story under the partner's name must be the partner's own. If the owner's agent
writes it, it is the owner's guess.
**Question:** How does a partner's reason reach the canvas with the partner's approval?

> Founder, 2026-10-26: "this is possibly mirror agent of A sending request to B ... file spec as
> placeholder". Value named: the canvas "gets richer with stories of people met that explain their
> position", and one could see whether verified understanding of stories moves positions.

## Appetite

Placeholder. Not scoped. Blast radius: a cross-user request flow. Decision density: several founder calls.

## Solution

Sketch only. After a session, the owner's mirror drafts "why the partner holds position X on point Y"
from the transcript and sends the partner a request to **approve, correct or decline** it. Until it
is approved, it is the owner's own belief about the partner, which already has a shape: **"Partner in
Owner's eyes"** (decisions.md 2026-10, Clarity Chat mental-model ruling, quoted under Invariants). Once
approved, it is the partner's story on that point.

Stories carry over when the point is reused unchanged in a later version (P1536), and stay on the old
point when it is superseded.

## Invariants

- **"Did a person approve it as their own belief?"** decides what a thing is (decisions.md, Clarity
  Chat ruling): an unapproved draft about the partner is the owner's mental model, shown as "Partner
  in Owner's eyes" and private to the owner. It never appears under the partner's name.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Partners never answer requests | DEFER | Decide what the owner sees after no answer |
| Privacy text does not cover cross-user drafts | DEFER | Settle with the P1536 soft update |

**Non-Goals**
- Do NOT build before P1536 ships and one event has run with it.

## Done-When

- [ ] Founder decides the open questions below and the spec is scoped.

## Open Questions

1. Does the request land in the partner's mirror, the pair's DM thread (as in P1467's letter loop), or the event chat?
2. What does the partner see, and what happens if they never answer?
3. Does the owner also file their own stories this way, so verified understanding can be compared with position moves?

## Related

RELATED: [P1536](p1536_canvas_first_draft_from_owner_material.md) canvas draft versions ·
P1467 / [P1469](p1469_clarity_chat_letter_loop_v6.md) letter loop ("Would you say this?") ·
[P1500](p1500_clarity_chat_canvas_from_event_threads.md) · P1515 sharing
