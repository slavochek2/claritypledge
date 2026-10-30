---
status: backlog
type: story
rank: 90
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, follow-up]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: heuristic
---

# P1500: Bring a thread into your canvas chat (the homework path)

## Problem

> Founder, 2026-10-16: "Process it all together and update my Clarity Canvas. That's a very different way to interacting with my agent."

**Narrowed 2026-10-30 (founder).** Most of the original problem is now owned elsewhere:

- **Making a new version from a thread** is P1536 (design v6, on its branch): every message in a
  canvas's chat updates the private draft, Publish makes it visible to whoever the canvas is shared
  with, and copied chats in the draft's own thread are read as material. P1536 names the event's
  between-rounds use as its fast path.
- **The in-event path** (after a round, "make my next version" with no wiring) is P1529, the
  mastermind's own event-room flow.

What is left, and what this spec owns: **outside the event**, an owner opens their canvas to work on
it (the mastermind's homework before session 2, or any time later) and cannot bring an existing
thread, such as a round thread from an event channel, into that canvas's chat in one step. Forward
lands in a chat, not in a particular thread, and the mirror then has to guess why it was sent.

## Appetite

Placeholder. Designed in its own session **after mastermind session 1** (founder, 2026-10-30), when
the in-event button (P1529) has shown how owners actually bring conversations into a new version.
Not needed for session 1; useful before session 2.

## Solution

Direction, decided (founder, 2026-10-30):

- **Pick the thread from where you are improving the canvas.** In the canvas's chat, the composer's
  attach control lists threads the owner can read (round threads first), and picking one copies it
  into the draft's thread as material. The canvas and the intent are already known there, so the
  mirror does not guess.
- **No "create a new version" step.** As P1536 already rules, the first message, upload or copied
  thread opens the next draft.
- **Every step is visible.** Nothing is pulled in or shared in the background.

## Risks / Non-Goals

- **Rejected:** forwarding into a specific mirror thread. It needs a new kind of forward target, and
  the receiving end still has to work out why the thread was sent.
- **Rejected:** automatic per-event pipelines that update a canvas without the owner choosing the
  thread (founder: "we shouldn't do things in the background or hidden").
- **Settled by P1536, carried here:** other attendees' words reach the draft only as copied
  material; the draft never quotes or names another person.
- **Settled:** snapshot, not live. A copied thread is a copy (forward/clarify snapshot).
- Do NOT build the in-event path here (P1529), or the drafting engine (P1536).

## Done-When

- [ ] Designed in a session after mastermind session 1, with what the in-event button taught.
- [ ] From an open canvas chat, an owner picks a round thread and the next draft uses it, with no
      forwarding and no "new version" step.

## Related

- P1536 (drafting engine, versions, Publish): `features/p1536_canvas_first_draft_from_owner_material.md`; its current design (v6) is on branch `feature/p1536-canvas-draft-versions`.
- P1529 (the mastermind's event-room flow, the in-event path): `features/p1529_canvas_event_host_coordination.md`.
- P1592 (round threads in the event channel): `features/p1592_event_transcripts_land_in_round_threads.md`.
- Run-of-show: `docs/events/sales-mastermind.md` § Between sessions.
