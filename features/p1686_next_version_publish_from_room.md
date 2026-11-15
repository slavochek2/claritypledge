---
status: week
type: story
rank: 340
workstream: events
created_date: '2026-11-16'
tags: [canvas, events, mastermind, publish]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
depends_on: p1529
---

# P1686: Review and publish the next version without leaving the event room

## Problem

**Situation:** Between Sales Mastermind rounds, a canvas owner's room card offers "Create next version" (P1529). The tap makes a draft and the card then says "Open your draft". That link opens the canvas workspace, where Publish is.
**Complication:** Nothing brings the owner back to the room after Publish. They leave the event mid-evening to finish a one-tap job, and have to find their own way back.
**Question:** How does the owner see what changed and publish it while staying in the room, without ever publishing something they have not seen?

> Founder, 2026-11-15 (option A), verbatim: "They stay in the Event Room, then they can preview, which would open the canvas and the chat... Or they just can publish from there, just one click away... at the moment of publishing I guess they need to be returned to event room automatically."

## Appetite

Blast radius: one flow (the owner's between-rounds card and the workspace's return after Publish). Reversibility: git revert, no migration. Decision density: copy only.

## Invariants

- **Never publish blind** (decisions.md 2026-11-13 [product]: peers' figures can reach the canvas, and the owner's review is the safeguard). The room's Publish appears only once the changes it would publish are on screen. It sends the draft revision that was read for that view. If the draft moved on after the read (the server's `stale_view` refusal), nothing publishes and the card shows the new changes before Publish can be tapped again.
- Nothing publishes by itself (P1529 UAT 2026-11-13 (f), same ruling): every publish is the owner's tap.
- A canvas still never names or quotes a person (same ruling). The change view shows the points' own text, nothing more.

## Solution

1. **Room card, `ready` face:** the card reads the owner's draft and the version it was started from, then shows what changed, box by box: points added and points removed. Under the changes are a primary **Publish** (one tap) and a secondary **Open full draft**. The owner stays in the room. After Publish the card shows its existing `published` face.
2. **"Open full draft"** opens the workspace (canvas and mirror chat) as today, with the room as the place to return to after Publish. Publishing there brings the owner back to the event room automatically. The workspace already returns to an `afterPublish` path after Publish (P1529 preparation), so the room link passes the room path that way.
3. **Edge states:** while the changes load, the card says so and shows no Publish. If they cannot be read, the card says so and offers Try again and Open full draft, never Publish. If the draft has no changes, the card says so and offers Open full draft, not Publish.

[FOUNDER DECISION: copy] every new sentence and label: the changes heading, "Added" and "Removed" markers, "Publish", "Open full draft", and the loading, unreadable and no-changes lines.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The draft changes between the read and the tap (the mirror chat edits it in another tab) | MITIGATE | Publish sends the read revision; `stale_view` re-reads and shows the new changes (Invariant 1) |
| A long change list pushes Publish far down on a phone | ACCEPT | Seeing the changes is the review the ruling requires; a scroll before the button is the right cost |
| Text-level diff shows a reworded point as one removed and one added | ACCEPT | Honest about what changed; a rewording view is not asked for |
| Ships only after P1529, since it builds on that unshipped branch | MITIGATE | Branch cut from `feature/p1529-sales-mastermind-room`; ship P1529 first |

**Non-Goals**
- Do NOT add a migration or a new RPC. Reads use `get_canvas`; publish uses `canvas_draft_publish`.
- Do NOT change the workspace's Publish beyond the room return.
- Do NOT change the mirror's round rules or the draft-making flow.
- Do NOT offer editing in the room. Editing stays in the workspace.

## Acceptance Criteria

- [ ] With a ready next version, the room card lists the boxes that changed, each with its added and removed points, and a Publish button under them. No navigation happens.
- [ ] Tapping Publish in the card publishes the draft. The card shows the published face, and the canvas page shows the new version.
- [ ] Publish is never on screen before the changes are shown: not while loading, not after a failed read, not with no changes (unit test over every face).
- [ ] A Publish refused because the draft moved on publishes nothing, and the card shows the re-read changes (unit test).
- [ ] "Open full draft" opens the workspace. Publishing there lands the owner back in the event room (verified in the browser on TEST).
- [ ] Every new sentence is marked `[FOUNDER DECISION: copy]` in code.

## Related

- P1529 (the room card, next version, Back to your table): unshipped, this work depends on it.
- P1536 (workspace Publish, `afterPublish` return).
