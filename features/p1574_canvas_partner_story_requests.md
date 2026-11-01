---
status: backlog
type: story
rank: 324
workstream: clarity-canvas
blocked_by: [p1536]
created_date: '2026-10-26'
tags: [recognition-chain, canvas, mirror, stories, sales-mastermind]
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

Placeholder. Not scoped. Blast radius: one field on a replaced canvas point, plus who may see the
partner's name on it; a cross-user confirmation flow only for stories in the partner's name (Open
Question 1). Decision density: a few founder calls.

> Founder, 2026-10-30 (reframe): no approval request is needed for the link. The partner's reason is already
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
- **It can point to a partner's reason**: the round thread and who gave the reason (read from the
  transcript, P1390). The number the partner said is not shown on the canvas; it stays in the
  founder's research readout (P1390).
- **Who sees the partner's name follows who can read the round thread.** A canvas can be shared by
  public link (P1515; P1536: the draft "never quotes or names another person"), but a round thread is
  readable only by the event's host and attendees (P1592). So "Changed after Ben's reason in round 2"
  shows Ben's name, and opens the thread, only for people who can read that thread. Everyone else
  sees "Changed after a partner's reason". This needs no confirmation, because it reveals nothing
  the viewer could not already read.
- **It says the box changed, not that the owner's mind changed.** At the event the owner publishes the
  mirror's draft as it is and stances are optional (P1529). Only when the owner has marked a stance on
  the new box does the link count as a change of position. Showing that movement is
  [P1061](p1061_point_position_movement_analytics.md)'s job, built alongside this link.
- **A story in the partner's name needs the partner's confirmation.** In the room Ben confirmed Anna's
  spoken explain-back, not the mirror's wording. Until Ben confirms the wording it is **"Ben in
  Anna's eyes"**, private to Anna, with the naming, visibility and Anna's own draft-then-approve
  step already decided in [P1458](p1458_clarity_chat_agents_on_other_people.md) (decisions.md
  2026-10-12). P1458 is a placeholder, so this half needs P1458 built first. This matches
  P1390's "do not publish any derived story without the person confirming it".
- **Purpose: recognition.** It is what P1559 needs to show "your reason changed this canvas", and the
  data for H-StoryParaphrase (verified paraphrase of the story behind a position moves positions).
  Value test before building: the host does it by hand at the session 2
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
| Partners never confirm a story in their name | DEFER | It stays "Ben in Anna's eyes"; the link still works |
| Partner's name leaks through a public canvas link | MITIGATE | Name shown only to people who can read the round thread |
| Privacy text does not cover cross-user drafts | DEFER | Settle with the P1536 soft update |

**Non-Goals**
- Do NOT build before P1536 ships and one event has run with it.
- Do NOT build before the by-hand recognition at the session 2 opener shows the room cares.
- Do NOT ask the partner to approve the link (2026-10-30 reframe). Only a written story in their name asks them.

## Done-When

- [ ] Founder decides the open questions below and the spec is scoped.

## Open Questions

1. How does the confirmation request reach the partner: from the partner's **own** mirror in their own chat (no one else's agent writes to them), in the pair's chat sent by the owner, or only shown on the canvas for the partner to confirm when they open it? Decide after the session 2 opener shows recognition is worth it. (Drafting overlaps P1390 stage 1, "draft stories, filed for approval".)
2. Does the owner also file their own stories this way, so verified understanding can be compared with position moves?
3. Does the partner get told ("your reason changed Anna's pricing"), or only see it in P1559?

## Related

RELATED: [P1536](p1536_canvas_first_draft_from_owner_material.md) canvas draft versions ·
P1467 / [P1469](p1469_clarity_chat_letter_loop_v6.md) letter loop ("Would you say this?") ·
[P1390](p1390_room_audio_fills_live_from_the_transcript.md) numbers and stories from the transcript ·
[P1559](p1559_follow_through_record.md) recognition · P800 supersede ·
[P1458](p1458_clarity_chat_agents_on_other_people.md) "Alice in Bob's eyes" (naming, visibility; prototyped in P1437 v5) ·
[P1500](p1500_clarity_chat_canvas_from_event_threads.md) · P1515 sharing ·
[P1061](p1061_point_position_movement_analytics.md) position movement
