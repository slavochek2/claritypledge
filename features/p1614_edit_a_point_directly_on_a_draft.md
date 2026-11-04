---
status: qa
type: story
rank: 92
workstream: canvas
created_date: '2026-11-04'
tags: [canvas, drafts, editing]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

An owner viewing their open draft gets an Edit control on every point, on the board and in See all, sitting on the card. It opens the text in place of the card with Save and Cancel. Save calls one new owner RPC under the v6 revision protocol (expected revision, lock order, refusals). No model is called and no run is used.

**Save does what an agent `reword` of that point does, for every kind of point.** `_canvas_draft_run_complete` already handles the three kinds. The RPC follows that reword branch by hand rather than calling it (the engine's function is one routine tied to runs, scope and spend), so it is a fourth path that must be kept in step: a change to the engine's reword branch is checked against `canvas_draft_edit_point` (pointer in `docs/technical/database.md`). The behavior is:

- It always writes a NEW point and takes the draft's tag off the old one. No point is ever changed in place, so a published version cannot be affected.
- A reused published head point gets a pending supersede link (old to new), applied at Publish.
- A point this draft made passes its existing link on to the new point (the chain), and the new point goes in the `canvas_draft_points` ledger, so Discard cleans it. A private copy of a legacy public point (`copied_from`) follows the engine's existing branch.
- The owner's story links carry over as they do for a reword.

**Stance:** D20 says a point "the AI writes or rewords" starts with no stance. A hand edit is the owner's own words, so it keeps the stance they had on the old point. This is the one difference from a reword. Founder accepted this default on 2026-11-04.

**Undo:** undo restores a snapshot taken by the latest run, so undoing a run from before the edit would silently lose it. Saving an edit therefore closes undo for the runs before it, by removing the draft's undo steps, and the state read then offers no Undo. A later run takes a snapshot that includes the edit, so undoing that run keeps the edit. An edit has no undo of its own: the owner can edit again. No schema change.

**Retries:** no `p_client_id`, since it lives on the runs table and no run is made. After a thrown call or a `stale_view` from this editor's own Save, the client re-reads. It counts the edit as saved only if the point it was opened on is gone AND a point new since the save started has the exact text. A `busy` refusal never counts.

**When the point goes away under an open editor:** the typed text stays visible and read-only, with a notice and Dismiss, and no Save. It never moves onto another point on a guess; two reviews reproduced that saving onto the wrong point. Unsaved text is discarded on leaving the page, as in any unsaved form.

The control is a pencil icon named "Edit", matching the canvas name's pencil (founder accepted this default on 2026-11-04).

**After a save:** the box shows Changed if it differs from the base (existing `changed_boxes`). The next agent run reads the edited text, since it reads the draft's points. An unchanged save writes nothing.

**Refusals, returned as the protocol's `{status:'refused', code, revision}`:** a run or Publish is going (`busy`), or the view is old (`stale_view`). The open editor keeps the typed text and says why. While a run is going the Edit control is absent; an editor already open stays, with Save blocked and the reason shown.

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

- [x] On their open draft, the owner edits a point, saves, and sees the new text at once and after a reload, with no agent reply and no run used. *(Walk at 1440, 375, 320; integration: no run row, no allowance used.)*
- [x] Editing a point reused from v2 leaves v2 reading the old text. After Publish, v3 shows the new text and the old point is superseded. *(Integration and walk; the walk uses v1.)*
- [x] Editing a point the draft created and then discarding the draft leaves nothing behind. *(Integration and walk.)*
- [x] After an edit, the agent's next message works from the edited wording. *(Integration: the draft's points hold the edited text, which is what a run reads. Runs are stubbed; no real model run followed an edit.)* `[post-deploy]` founder tries one real message after an edit.
- [x] While a run is going there is no Edit control. A save racing a run is refused, keeps the typed text and says why. *(Component: pencil gone, open editor kept with Save blocked and the reason shown. Integration: `busy`, nothing written.)*
- [x] Empty text cannot be saved. Cancel changes nothing and writes nothing. *(Component, walk; integration raises `22023`; an unchanged save writes nothing.)*
- [x] A reader, a signed-out visitor and the owner on a published version see no Edit. A direct RPC call by another signed-in person is refused (integration test). *(Component, walk; integration: `42501`, signed-out refused.)*
- [x] After an edit, Undo of an earlier run is not offered and a direct call is refused as stale. Undoing a later run keeps the edit, its supersede link and its ledger row. *(Integration, with a base version: the link, the edit and the ledger row survive.)*
- [x] Editing the same point twice, or a point the agent reworded, leaves one pending link from the published point to the newest text, and Publish applies it. *(Integration.)*
- [x] A story and the owner's stance on the old point are on the new point after the edit; a legacy private copy edit publishes correctly. *(Integration. The legacy copy state is built by hand, because self-hosted TEST cannot seed a public canvas point; its public visibility is not exercised.)*
- [x] Visual QA passed by a separate reviewer at 1440, 375 and 320, editor open and closed. *(Separate screenshots-only reviewer, two rounds at 1440, 375, 320; its findings were fixed. The last small fixes were checked by the build agent's screenshots and the walk, not re-reviewed.)*

## Cost Budget

Applies because the migration adds a per-request function and the tests create and delete users. No timer, poll, retry loop or model call: one owner tap is one write and one re-read.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | 1 Save = 1 RPC + 1 canvas re-read = 2 requests, none on a hidden tab (the re-read waits for visibility; repeats for one draft coalesce into 1) | Saves per hour x 2; an owner editing by hand makes few | Browser walks: (3 + 3 + 1 + 2) = 9 users x (1 create + 1 delete) = 18 auth admin calls, plus ordinary page reads. Integration: 14 tests x 1 owner = 14 users x 2 = 28 calls |
| Users created / deleted | 0 | 0 | 9 + 14 = 23 created, 23 deleted in `finally` or `afterAll` |
| Egress | 1 existing canvas read per Save, no new payload | as above | test canvases only; no media |
| Log lines | a refusal is returned, not raised, so 0 from `busy` or `stale_view`; a validation error is 1 line | 0 expected | a few deliberate refusals in integration: up to 1 line each for 3 validation cases and 2 authorization cases = 5 |
| Gemini | 0 | 0 | 0: runs are stubbed |

1. **Fits the plan limit today?** Yes. Tests run on self-hosted TEST, a Compute Engine VM billed by the hour and not by request (registry, Compute Engine row). On prod, Supabase egress grows by (Saves per user x 1 canvas read) x active users, read against the registry's Supabase row; a hand edit is a rare owner action on a draft, far below the page's normal reads, so it fits.
2. **Fits at 10x?** Yes, for the same reasons.
3. **Rule 1 (bulk on the server):** cleanup deletes users one call each through the shared helper, as sibling specs do; Auth's admin API deletes one user per call. **Rule 3 (hidden tab):** the re-read waits for a visible tab. **Rule 6:** met by this table.

## Known Limitations

- Stepping from See all into a point's detail moves an open editor to the grid behind it. The text is kept.
- The pencil's 40px hit area overlaps the bottom of the statement's text box by about 5px, so a tap there opens Edit instead of the card.
- Blank-only text sent by direct RPC, such as a newline, passes the server's trim, as it does for the engine. The app's own check blocks it.
- A signed-out viewer sees no editor at once; their text is removed when the page unmounts.
- Typing the original words back drops a stance that was set only on the intermediate point.

## Migration Plan

Two migrations add and then correct the RPC and nothing else, applied to the active TEST server through main's `./scripts/migrate.sh`. Applied to prod by the normal push path.

## Rollback Plan

Revert the client and drop the RPC. Points already edited stay valid, since they use existing shapes.

## Related

P1536 (v6 engine, revision protocol) · P1613
