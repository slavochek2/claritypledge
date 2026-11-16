---
status: qa
type: story
rank: 340
workstream: events
created_date: '2026-11-16'
tags: [canvas, events, mastermind, publish]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
depends_on: p1529
spec_review_hash: 3ea96c62a3360c69a3d0b42ede63f560ff4edc9edb8422473e952e747cbfe02d
spec_review_vendors: [gemini, openrouter]
---

# P1686: Review and publish the next version without leaving the event room

## Problem

**Situation:** Between Sales Mastermind rounds, a canvas owner's room card offers "Create next version" (P1529). The tap makes a draft and the card then says "Open your draft". That link opens the canvas workspace, where Publish is.
**Complication:** Nothing brings the owner back to the room after Publish. They leave the event mid-evening to finish a one-tap job, and have to find their own way back.
**Question:** How does the owner see what changed and publish it while staying in the room, without ever publishing something they have not seen?

> Founder, 2026-11-15 (option A), verbatim: "They stay in the Event Room, then they can preview, which would open the canvas and the chat... Or they just can publish from there, just one click away... at the moment of publishing I guess they need to be returned to event room automatically."

## Appetite

Blast radius: one flow (the owner's between-rounds card and the workspace's return after Publish). Reversibility: code is a git revert with no migration; a version published through it stays published, as from the workspace. Decision density: founder decisions are copy only; behaviour is decided here.

## Invariants

- **Never publish blind** (decisions.md 2026-11-13 [product]: peers' figures can reach the canvas, and the owner's review is the safeguard). The room's Publish appears only once the changes it would publish are on screen. It sends the draft revision from the same read that produced the list, never a revision taken from a refusal. If the draft moved on after the read (the server's `stale_view` refusal), nothing publishes, Publish leaves the screen, and it returns only with the re-read list.
- Nothing publishes by itself (P1529 UAT 2026-11-13 (f), same ruling): every publish is the owner's tap.
- A canvas still never names or quotes a person (same ruling). The change view shows the points' own text, nothing more.

## Solution

1. **"Create next version" keeps the owner in the room.** Today the tap navigates to the workspace as soon as the draft exists (`mastermind-offer-cards.tsx`). It no longer does: the card moves through its working face to `ready`.
2. **Room card, `ready` face:** the card reads the owner's draft view (`get_canvas` with the draft's version) and the version it was started from (the version whose `seq` is the draft's `baseSeq`). It then lists what changed, box by box in canvas box order, under each box's title: points added and points removed, matched by exact point text. A draft with no base version shows every point as added. Under the list are a primary **Publish** and a secondary **Open full draft**. The owner stays in the room. After a successful Publish the card re-reads the offer and shows its existing `published` face.
3. **"Open full draft"** (and the `creating` face's draft link) opens the workspace (canvas and mirror chat) as today. Publishing there brings the owner back to the event room automatically. The room link marks this in the navigation state, and the workspace's Publish returns to the table path it already carries (`backToTable`). It does not reuse `afterPublish`, which would show the preparation banner ("Publish, then share") and hide "Back to your table".
4. **Edge states on `ready`:** while the changes load, or are re-read, the card says so and shows no Publish. If they cannot be read: a line, Try again, and Open full draft, never Publish. With no text-level changes: a line and Open full draft, no Publish. While Publish is in flight the button is busy and cannot be tapped twice. Refusals: `stale_view` re-reads, and Publish comes back only with the new list; `busy` (the mirror is working on the draft) says so and re-reads; `no_changes`/`draft_empty` re-read into the no-changes state; any other failure says it could not publish, and the list stays with Publish.

[FOUNDER DECISION: copy] every new sentence and label: the changes heading, "Added" and "Removed" markers, "Publish", "Open full draft", and the loading, unreadable, no-changes, busy and failed lines.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The draft changes between the read and the tap (the mirror chat edits it in another tab) | MITIGATE | Publish sends the read revision; `stale_view` re-reads and shows the new changes (Invariant 1) |
| A long change list pushes Publish far down on a phone | ACCEPT | Seeing the changes is the review the ruling requires; a scroll before the button is the right cost |
| Text-level diff shows a reworded point as one removed and one added | ACCEPT | Honest about what changed; a rewording view is not asked for |
| Ships only after P1529, since it builds on that unshipped branch | ACCEPT | Branch cut from `feature/p1529-sales-mastermind-room`; ship P1529 first |
| A draft change outside point text (title, reordering) is not listed | ACCEPT | Points are what peers' figures reach (the ruling's concern); Open full draft shows everything |
| Room Publish skips the workspace's share-with-event question and its toast | ACCEPT | The next-version card only exists for a canvas already shared with the event; the card's published face is the confirmation |

**Non-Goals**
- Do NOT add a migration or a new RPC. Reads use `get_canvas`; publish uses `canvas_draft_publish`.
- Do NOT change the workspace's Publish beyond the room return.
- Do NOT change the mirror's round rules or how the draft is made; only the navigation after the tap changes.
- Do NOT offer editing in the room. Editing stays in the workspace.

## Acceptance Criteria

- [x] Tapping "Create next version" leaves the owner in the event room (the address does not change).
- [x] With a ready next version, the room card lists the boxes that changed, each with its added and removed points, and a Publish button under them.
- [x] Tapping Publish in the card publishes the draft. The card shows the published face, and the canvas page shows the new version (verified in the browser on TEST). Evidence: P1529 walk 8e on TEST, room Publish made published_seq 2; 8j/8k partners opened that v2.
- [x] Publish is absent from the `ready` card while loading, while re-reading, after a failed read and with no changes (component test per state).
- [x] A `stale_view` refusal removes Publish and brings it back only with the re-read list, and the second Publish sends the re-read revision (component test).
- [x] "Open full draft" opens the workspace with no preparation banner. Publishing there lands the owner back in the event room (verified in the browser on TEST). Evidence: P1529 walk 8f on TEST, no preparation banner, Publish made published_seq 2 and the page returned to the room.
- [x] Each new string sits in one constants block marked `[FOUNDER DECISION: copy]`.

## Related

- P1529 (the room card, next version, Back to your table): unshipped, this work depends on it.
- P1536 (workspace Publish, `afterPublish` return).
