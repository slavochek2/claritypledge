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

# P1574: Why a canvas point changed, and whose reason it was (placeholder)

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

> Founder, 2026-10-30 (reframe): no async approval request is needed. The partner's reason is already
> verified in the room: the owner explains it back until the partner says above 8 out of 10
> (docs/events/sales-mastermind.md, the loop). What is missing is the link from a changed point to
> the reason that changed it.

## Solution

Sketch only (replaces the 2026-10-26 approve/correct/decline request).

- **A supersede reason.** When a point is replaced in a new version, the replacement records a short
  "why it changed". Today only *which* point replaced which is stored (P800), never why.
- **Written by the mirror or by the owner.** The mirror writes it when it drafts the version (P1536);
  the owner can write or edit it when they replace a point themselves. Anyone who can see the canvas
  can open a replaced point and read it.
- **It can point to a partner's reason**: the round thread, who gave the reason, and the number the
  partner said for the owner's explain-back (read from the transcript, P1390).
- **No extra confirmation.** The partner already confirmed in the room; the owner publishes the
  version anyway. Every added confirmation is a demand on users with no value named yet.
- **Purpose: recognition.** It is what P1559 needs to show "your reason changed this canvas", and the
  data for H-StoryFirst. Value test before building: the host does it by hand at the session 2
  opener (docs/events/sales-mastermind.md, Between sessions).

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
- Do NOT build before the by-hand recognition at the session 2 opener shows the room cares.
- Do NOT send the partner an approval request (2026-10-30 reframe).

## Done-When

- [ ] Founder decides the open questions below and the spec is scoped.

## Open Questions

1. Does the partner's reason become a story on the canvas, or stay a link to the round thread? (Overlaps P1390 stage 1, "draft stories, filed for approval".)
2. Does the owner also file their own stories this way, so verified understanding can be compared with position moves?
3. Does the partner get told ("your reason changed Anna's pricing"), or only see it in P1559?

## Related

RELATED: [P1536](p1536_canvas_first_draft_from_owner_material.md) canvas draft versions ·
P1467 / [P1469](p1469_clarity_chat_letter_loop_v6.md) letter loop ("Would you say this?") ·
[P1390](p1390_room_audio_fills_live_from_the_transcript.md) numbers and stories from the transcript ·
[P1559](p1559_follow_through_record.md) recognition · P800 supersede ·
[P1500](p1500_clarity_chat_canvas_from_event_threads.md) · P1515 sharing
