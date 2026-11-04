---
status: week
type: story
rank: 92
workstream: canvas
created_date: '2026-11-04'
tags: [canvas, drafts, editing]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: heuristic
---

# P1614: The owner can edit a point's text directly on a draft

## Problem

> Founder, verbatim: "when I'm in draft mode, maybe instead of asking to change text in a given card, I can just have an edit button until it's published."

Today an owner changes a draft only by messaging the agent. A typo fix spends a model run and one of the draft's run allowance, and the owner's exact wording can come back reworded. `canvas-grid.tsx` records the old premise: "owners change the canvas through their agent".

## Appetite

Blast radius: draft points, Publish's supersede links, undo, and the agent's next read. Reversibility: migration plus code; only drafts are touched. Decision density: one label call, below.

## Solution

An owner viewing their open draft gets an Edit control on each point card. It opens the text in place with Save and Cancel. Save calls one new owner RPC under the v6 revision protocol (expected revision, lock order, refusals). No model is called and no run is used.

**Save does exactly what an agent `reword` of that point does, for every kind of point.** `_canvas_draft_run_complete` already handles the three kinds, so the RPC shares that logic rather than adding a fourth path:

- It always writes a NEW point and takes the draft's tag off the old one. No point is ever changed in place, so a published version cannot be affected.
- A reused published head point gets a pending supersede link (old to new), applied at Publish.
- A point this draft made passes its existing link on to the new point (the chain), and the new point goes in the `canvas_draft_points` ledger, so Discard cleans it. A private copy of a legacy public point (`copied_from`) follows the engine's existing branch.
- The owner's story links carry over as they do for a reword.

**Stance:** D20 says a point "the AI writes or rewords" starts with no stance. A hand edit is the owner's own words, so it keeps the stance they had on the old point. This is the one difference from a reword. `[FOUNDER DECISION: keep the stance on a hand edit, as proposed, or clear it as a reword does.]`

**Undo:** undo restores a snapshot taken by the latest run, so undoing a run from before the edit would silently lose it. Saving an edit therefore closes undo for the runs before it, by removing the draft's undo steps, and the state read then offers no Undo. A later run takes a snapshot that includes the edit, so undoing that run keeps the edit. An edit has no undo of its own: the owner can edit again. No schema change.

**Retries:** no `p_client_id`, since it lives on the runs table and no run is made. A retry after a lost answer is refused as `stale_view`; the client re-reads and, if the text already matches, treats it as saved.

`[FOUNDER DECISION: the control's label. Proposed: a pencil icon named "Edit", matching the canvas name's pencil.]`

**After a save:** the box shows Changed if it differs from the base (existing `changed_boxes`). The next agent run reads the edited text, since it reads the draft's points. An unchanged save writes nothing.

**Refusals, returned as the protocol's `{status:'refused', code, revision}`:** a run or Publish is going (`busy`), or the view is old (`stale_view`). The open editor keeps the typed text and says why. The Edit control is absent while a run is going, as other draft actions are.

## Invariants

- A published version's points never change, whatever is edited on a draft.
- Edit exists only for the owner, only on their open draft. Authorization failures raise `42501`, under the existing lock order (P1536 v6).
- Every successful edit bumps `canvas_drafts.revision`.
- Discard removes everything an edit created, through the ledger, and never deletes a reused point.
- Point text keeps the same validation as every other path that writes a point.
- Undo never silently discards or resurrects a hand edit: after an edit, earlier runs cannot be undone; undoing a later run keeps the edit.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The owner loses Undo of the last agent run by fixing a typo | ACCEPT | The alternative loses the edit silently; the owner can still message the agent or edit again |
| The agent's next run rewrites a hand edit | ACCEPT | The owner asked for that run and sees Undo; pinning edits is a later feature if it hurts |
| A card is itself a button, so a nested control is invalid | MITIGATE | Edit is a sibling of the card button, as Add to chat is a sibling for the same reason |
| Other people's positions stay on the old point | ACCEPT | Same as an agent reword: new wording is a new point, and they have not taken a position on it |
| A typo fix on a reused point still creates a supersede link | ACCEPT | Same as a reword; the rule that published wording never changes outranks it |

**Non-Goals**
- Do NOT add, delete or move points by hand; this is text only.
- Do NOT allow editing on a published version or for a reader.
- Do NOT add a pending-Clone edit: nothing is written until first Send, so Edit appears once the draft exists.

## Acceptance Criteria

- [ ] On their open draft, the owner edits a point, saves, and sees the new text at once and after a reload, with no agent reply and no run used.
- [ ] Editing a point reused from v2 leaves v2 reading the old text. After Publish, v3 shows the new text and the old point is superseded.
- [ ] Editing a point the draft created and then discarding the draft leaves nothing behind.
- [ ] After an edit, the agent's next message works from the edited wording.
- [ ] While a run is going there is no Edit control. A save racing a run is refused, keeps the typed text and says why.
- [ ] Empty text cannot be saved. Cancel changes nothing and writes nothing.
- [ ] A reader, a signed-out visitor and the owner on a published version see no Edit. A direct RPC call by another signed-in person is refused (integration test).
- [ ] After an edit, Undo of an earlier run is not offered and a direct call is refused as stale. Undoing a later run keeps the edit, its supersede link and its ledger row.
- [ ] Editing the same point twice, or a point the agent reworded, leaves one pending link from the published point to the newest text, and Publish applies it.
- [ ] A story and the owner's stance on the old point are on the new point after the edit; a legacy private copy edit publishes correctly.
- [ ] Visual QA passed by a separate reviewer at 1440, 375 and 320, editor open and closed.

## Migration Plan

One new migration adds the RPC and nothing else, applied to the active TEST server through main's `./scripts/migrate.sh`. Applied to prod by the normal push path.

## Rollback Plan

Revert the client and drop the RPC. Points already edited stay valid, since they use existing shapes.

## Related

P1536 (v6 engine, revision protocol) · P1613
