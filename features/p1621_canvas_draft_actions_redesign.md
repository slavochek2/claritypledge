---
status: qa
type: story
rank: 97
workstream: canvas
created_date: '2026-11-05'
tags: [canvas, ux, design-system]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
spec_review_hash: 650628a6f4626b0da9d138d5a3ec14988bccd904ce2131d1b5b90170558926ba
spec_review_vendors: [codex, gemini, openrouter]
---

# P1621: Canvas draft shows content first, and actions when a box is selected

## Problem

**Situation:** The owner's canvas draft has controls that were added one at a time: Add to chat in the box header, See all, a pencil and a chevron on the card, a dashed question that looks like an input, Undo as plain text, and a composer that shows `[Solution]` as raw text until sent. An owner cannot create a card by hand.

**Complication:** The founder used it and could not tell what some controls do, could not add a second card, and repeated a point to the agent three times without it landing.

> "we kind of have buttons all around the place in all corners, plus buttons inside"

> "Don't you think this is weird to just have like this small icon doing open?"

> "right now I cannot create a new cart by manually creating a point"

**Question:** How does the draft put the owner's words first while every action stays findable, on desktop and phone?

## Appetite

Blast radius: the canvas page for owners, and one new write path. Reversibility: code by git revert; a saved hand point is an ordinary draft point: it survives reloads and Publish, and leaves like any other point if the agent drops it or the draft is discarded. Decision density: low, the layout is approved; the copy marked below is open.

## Invariants

- A hand-written point follows P1614's rule: a published version never changes (decisions.md 2026-11-05).
- Never a dead control: an action that cannot run now is absent or says why (P955).
- A reader or signed-out visitor sees no owner action (P1536 D5).
- One main action on the page, Publish or Share (design system rule 9).

## Solution

Approved prototype: `/tree/canvas-actions?v=h`, branch `feature/p1621-canvas-action-variants`.

- **At rest:** each box shows its title and icon and its first card or its question. A box with more than one card also shows See all N at its bottom right. No hint line and no dots.
- **First visit:** the first time this person opens a draft in this browser, the first box with a card opens selected, which teaches selecting without text. On an empty canvas, Customer Segments opens with its editor. Recorded per user in browser storage; if storage is unavailable, nothing opens. Later visits start with nothing selected.
- **Selecting:** clicking anywhere in a box that is not a control selects it. Only one is selected at a time. Clicking it again or clicking outside any box deselects. Desktop hover shows a light blue border.
- **Selected filled box:** Mention in chat at the top right. On the first card, Edit then Open at its bottom right, with icons. Below the card, Add card at the left and See all N at the right.
- **Selected empty box:** the editor opens straight away with the question visible above it, then Save and Cancel, and Mention in chat at the top right. There is no Add card step. Cancel closes it and deselects.
- **Typed text:** clicking away or selecting another box never loses typed text. P1614's store is keyed by an existing point, so new cards need one buffer per draft and box. Returning to the box restores it; Cancel discards it.
- **Add card:** the same editor in a filled box. Save writes a point with no model and no run: these are the owner's own words. The write is owner-checked, draft-only, validated (box, trimmed non-empty text, the point length limit), safe to retry, and follows P1614's handling of privacy, the ledger and the revision check. Like an edit, a save closes Undo for earlier runs (decisions.md 2026-11-05).
- **Card limit:** 3 per box, the limit the agent already has, for hand-added cards too, enforced atomically on the server so simultaneous saves cannot pass it. A full box says so; Add card is absent, not disabled.
- **Open:** unchanged, a side panel on desktop and a full-screen sheet on phones, with Details leading to the full page.
- **Opened point:** the signed-in canvas owner can Add a story on their own point without taking a position first. The other conditions stay: stories loaded, no story of theirs yet, not a draft point kept from a published version (P1536). Inherited visibility and the audience note stay. The owner on a draft also gets Edit there. Readers are unchanged.
- **Section names:** the three layer names and numbers are removed, with a gap between rows. Founder-approved.
- **Box order (founder-approved):** Customer Segments, Problem, Solution; Offers & Pricing, Go-to-market strategy, My next milestone; My current biggest challenge, Hypotheses I've falsified, Guiding values. Display order only; points keep their boxes.
- **Button weight:** all box and card actions are quiet grey with a hover state; Save is the only filled button in a box.
- **See all (owner's draft only):** expands in place and selects the box, so every visible card shows Edit and Open; Show less collapses it. Readers and published versions keep today's side panel.
- **Mention in chat (founder-approved name):** puts a pill in the composer. The founder found that the button itself gives no sign anything happened, and repeated clicks look dead, so the button reads "Mentioned" while that box's pill is in the composer (removing or sending the pill resets it), and a repeat click adds no second pill.
- **Composer:** the pill sits above the text field with a remove control. Several different boxes in one message stay possible. Text someone types in brackets behaves as today.
- **Undo:** the secondary blue-outline style (founder request).
- **Upload icon:** tooltip on hover and focus, plus an accessible name.
- **Keyboard (founder requirement):** selecting a box and every action must work by keyboard. Each box's title row is a real button that says whether the box is selected; Enter or Space selects or deselects, and Tab then reaches that box's actions in visual order. Escape deselects and returns focus to the title. Selecting an empty box moves focus to the text field; Cancel returns it to the title. Clicking elsewhere in a box is a mouse and touch convenience on top of this, never the only way.

**Opened point, checked against the real panel (`feed-point-card.tsx`, `canvas-page.tsx`, `canvas-page-data.ts`):**

| Condition for Add a story | Today | After P1621 |
|---|---|---|
| Signed in (`viewerId`) | required | unchanged |
| Stories loaded (`linkedStories`) | required | unchanged |
| No story of the viewer's on this point | required | unchanged |
| Has not already added one through the canvas (`ownStoryAdded`) | required | unchanged |
| Not read-only (`readOnly`) | required | unchanged |
| Not a draft point kept from a published version (`noAddStory`) | required | unchanged |
| Viewer holds a position | required of everyone (line 163) | **canvas owner on their own point: not required.** Reader: still required |
| Story visibility | the point's, with the audience note on a private story | unchanged |
| Edit in the panel | absent | **owner on an open draft only**, gone while a run is going, as on the card |

The dialog inherits the point's visibility. Points made by the current engine are private, so on most canvases the story is private; the public path is reachable on an older public point and is tested at the dialog level.

**Who sees the layout changes:** section names and box order are the canvas's reading order, so they apply to every viewer.

## Behaviour Rules (from spec review)

- **Card click:** on the owner's open draft a card is not a button; clicking it selects the box, and Open opens the point. Readers and published versions keep the whole card opening. Closing the panel returns focus to that point's Open button when its box is selected, otherwise to the box title.
- **Where it applies:** selection with Edit, Add card and in-place See all exists only on the owner's open draft. On the owner's published version or a pending Clone, selecting shows Mention in chat only, cards still open, and See all keeps its panel. A `?box=` address still opens the panel. With no open draft there is nothing to save to, so no Add card and no editor opens (default, see Founder Review).
- **Open editors:** an Edit editor already open stays visible whatever is selected, and its Escape keeps P1614's behaviour. A new-card editor: Escape closes it and deselects, keeping the text; only Cancel discards; Escape does nothing during a save. A box holding unsaved new-card text shows a quiet "Unsaved text" label at rest. The buffer is separate from P1614's point entries, so it never reads as a gone point, and it clears on leaving the page as P1614's does.
- **After saving a card:** the box stays selected and expands so the new card is visible; focus goes to Add card, or to the title when the box is now full. The stance stays empty. The new card appears on the next published version.
- **Retry:** each save carries a client id stored with the point; a repeat returns the first result without writing, before the revision check.
- **Refusals keep the text:** a run going (same notice as P1614), a stale revision (P1614's sentence), a box that filled while typing (the full-box message, no Save), the same words already in the box (refused with a sentence), a draft gone (text kept to copy). Add card and Edit are absent while a run goes. A box already over 3 from an older version refuses a new card; edits stay allowed.
- **See all:** deselecting or selecting another box collapses it. A box with no question shows just the editor.
- **Mention in chat:** the tag stays in the composer's stored text, gathered at the start of the value, so drafts, voice notes, failed-send restore and Send keep working; the field shows only the words, and pills render above it. The composer needs words or a voice note to send, as its Send button does today, so Enter on pills alone does nothing. "Mentioned" holds while the tag is in the composer or waiting for it, and resets if a wait is dropped. On a wide screen the thread opens if closed and focus stays on the button; clicks in the thread do not deselect. Below 1280 the thread is shown as today, and the pill there is the feedback. The label always shows on a selected box, wrapping if needed.
- **Accessibility:** the title button sits inside the box's heading; each box stays a labelled section; the layer wrappers lose their names.
- **Add a story:** the owner's no-position case uses the existing "+ Add a story" copy.

## Founder Decisions (round 2)

Founder, after trying the build:
1. **Actions with no draft yet:** Edit, Open, Add card and Remove show on a clone and on a new canvas too. The first hand save (add or edit) creates the draft, as the first message does. Replaces Founder Review item 1.
2. **Mention per point:** each card has Mention in chat beside Edit and Open, and "Mentioned" is per point. An empty box keeps a box-level Mention in chat. The pill reads the box name, a dot, then the point text cut with an ellipsis (full text on hover), with the box icon. Sent, it becomes `[Box] "point text"`, so the box chip shows followed by the owner's exact words, and the run's scope stays the box. Several mentions per message are allowed (at most one per box or point).
3. **Remove:** each card on a draft has Remove, with no confirmation. It takes the point off this draft, as the agent's drop does: a point that exists only in this draft is gone at Publish or Discard; a point from a published version stays there. No other person's position or story can be lost, since drafts are private. The agent keeps its own power to drop. Replaces Founder Review item 3.
4. **Upload button:** the secondary blue outline, as Undo.
Still pending: the wording in Founder Review.

## Cost Budget

Applies because the migration adds a per-request function and the tests create and delete users. No timer, poll, retry loop or model call: one Save is one write and one re-read, the shape P1614 measured.

| Measure | Per user | Per test run |
|---|---|---|
| Requests | 1 Save = `canvas_draft_add_point` plus the page's re-read = 4 requests, taken from P1614's measurement of the same re-read, not re-measured. A box_full or stale refusal adds one re-read (3 requests) | e2e: 3 Saves x 4 requests x 3 widths = 36, plus 3 direct RPC calls x 3 widths = 9, so 45. Integration: 9 cases, about 3 calls each = 27. Total about 72, plus page loads and seeding as in P1614's walks |
| Users created / deleted | 0 | 3 e2e + 9 integration at most = 12 created and 12 deleted |
| Egress | 15 KB per Save (P1614's figure for an 18-point canvas) | 3 Saves x 3 widths x 15 KB = 135 KB, plus page loads |
| Log lines | 0 from refusals, which are returned; 1 per validation error | At most 1 per deliberate error case in integration: 3 |
| Gemini | 0 | 0, runs are stubbed |

**Fits today:** assuming 10 active owners x 20 Saves a month = 200 Saves x 15 KB = 3 MB a month, plus 10 test runs x 135 KB = 1.4 MB, about 4.4 MB against the 5 GB egress in the registry. **Fits at 10x:** 100 owners = 30 MB plus the same test traffic, about 31 MB, still under 1% of it. The owner and run counts are assumptions, not measurements.

Falsifier: a Save that triggers more than one re-read on TEST.

**Round 2 additions** (arithmetic, not measured): one Remove = `canvas_draft_remove_point` plus the same re-read = 4 requests. The first hand write on a pending clone adds the opener the first message already uses: 1 version-list read + 1 `canvas_draft_open` + 1 revision read, and for Edit or Remove 1 point-mapping read, so at most 4 extra requests once per clone. Integration adds the remove-point file: about 9 cases x 3 calls = 27 requests and up to 9 owners created and deleted (plus a second signed-in user for the refusal case). The open-replacing integration file (Start over in one transaction) has 7 cases with 9 owners created and deleted (five single-owner cases, two cases with two owners), about 9 fixtures x 8 requests = 72 requests plus about 14 calls, sign-ins and cleanups = about 86. Totals per test run become about 185 requests and 31 users created and deleted (counted from the test files, not measured). Start over itself is one call where the first message's path already makes one, so per-user traffic is unchanged. At 20 Removes a month per owner the egress budget above roughly doubles at worst, still under 1% of the 5 GB.

## Known Limitations

- If another edit moves the draft while the re-read after a box_full refusal is still out, Save can reappear briefly; pressing it is refused again with the text kept.
- The server's `btrim` strips spaces only, so a direct call could store a whitespace-only point. The editor trims all whitespace first, as P1614's does.
- A point mention is keyed by the point's words. If the owner edits or removes a card whose mention sits unsent in the composer, the pill keeps the old words and the card shows "Mention in chat" again; removing the pill still works.
- Remove on a pending clone creates the draft first (the clone's first hand write), the same as Add and Edit there.
- Start over carries the revision of the draft being replaced as it was when Start over was chosen, as the first message's path does. If that draft changes meanwhile (a run finishes), the hand write is refused as stale until the page is reloaded; the old draft is intact.
- Two Start over calls within milliseconds of each other can leave the owner one extra open draft (the open-draft cap and one-open-draft-per-canvas still hold). An old draft that expired rather than being discarded makes a Start over hand write refuse as stale until the page re-reads.
- On a clone, an unsaved Edit of a legacy public point (one the draft copies under a new id) shows read-only with its text kept if a different write (Add card, another Edit, or the first message) creates the draft first. Its text can be copied into the card's new Edit. An Edit whose own save created the draft follows the point.
- A voice note sent with a point mention scopes the run to that box but does not carry the point's words; only typed messages send `[Box] "point text"`.
- A hand save that is already running finishes when the tab is hidden, as a typed message does. Hidden-tab silence applies to reads and polls; aborting an action the owner started would lose their intent.
- A new canvas with nothing published gets its draft when the canvas is made, so it has no pending state; only a clone's pending page uses the hand-write opener.

## Founder Review

Defaults built, each easy to change (items 1 and 3 are replaced by Founder Decisions round 2): (1) no open draft means no hand-written card until the first message; (2) one hand card on an empty draft means the next message is no longer treated as the first draft: scope comes from the model instead of all nine boxes and no focus is set; (3) the agent can still drop a hand card, and Undo of that run brings it back; (4) saving a card closes Undo with no message; (5) the agent cannot reword a hand card unless the message supplies the words; (6) a private story on a hand card the agent later removes stays stored with no link, as P1614's does. Wording to approve: "Mentioned", the full-box message, the duplicate sentence, "Unsaved text", and the round-2 sentence for a draft open elsewhere: "This canvas already has a draft open somewhere else. Open it, then add your text there."

[FOUNDER DECISION: exact wording of the full-box message and of the "Mentioned" confirmation.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Owners miss actions hidden until selection | MITIGATE | First-visit open box and hover border; watch the founder's first real session. The founder has missed hidden actions before |
| A row grows when a box is selected, moving the rows below | ACCEPT | Measured about 71px in the prototype; founder saw it and approved H |
| On a phone, Mention in chat gives no feedback with the chat off-screen | MITIGATE | Verify on the real route, and show the thread or a confirmation |
| On a phone, tapping an empty box brings up the keyboard at once | ACCEPT | Founder asked for direct typing; Cancel backs out |
| Selecting replaces "tap a card to open" for the owner | MITIGATE | Applies to the owner's draft only; readers keep the whole card opening |
| A hand-added point during an agent run conflicts with the run | MITIGATE | Same busy handling as P1614's Edit, under the same lock as the limit check |
| A hand card can be removed by the agent or lost with Undo closed | ACCEPT | Founder Review items 3 and 4 |
| Save is a filled button alongside Publish | ACCEPT | P1614's editor already does this; it appears only while typing |

**Non-Goals**
- Do NOT change the quote check or the drop message; that is the separate short-point bug.
- Do NOT change what actions readers have or how their cards behave.
- Do NOT rename any box.
- Do NOT change where Open appears (panel, sheet) or the reader's position-first story rule.
- Do NOT change the mic button or box icons (reviewed, kept).

## Acceptance Criteria

- [x] At rest on an owner's draft, no box shows Edit, Open, Add card or Mention in chat
- [x] First visit opens the first box with a card; a later visit starts with none selected
- [x] Clicking any non-control area of a box selects it, including the row beside See all
- [x] Only one box is selected; clicking it again or outside deselects it
- [x] On a draft, a selected filled box shows Mention in chat top right and Edit then Open on the card, with Add card bottom left when it holds under 3 and no run is going, and See all N bottom right when it holds more than 1
- [x] Selecting an empty box focuses a text field, with the question visible, Save and Cancel
- [x] Typed text survives clicking away and selecting another box
- [x] See all N shows every card in one click, keeps the selection, and Show less collapses it
- [x] An owner adds a card by hand, it stays after reload, and a published version is unchanged
- [x] At 3 cards a box says it is full, with no dead button; two simultaneous saves cannot make a 4th
- [x] A save whose answer was lost and is repeated with the same client id makes one card; a box that fills while typing keeps the text and says so
- [x] Saving a card expands the box to show it; a published draft includes the hand card
- [x] Editing from the opened point keeps the panel open on the new point
- [x] Pills survive a reload and a failed send, and a voice note carries them
- [x] Open still opens the panel on desktop and the sheet on phones
- [x] The owner sees Add a story on their own point with no position taken, except a point kept from a published version, and can save it as public and as private; a reader's rule is unchanged
- [x] The owner can Edit from the opened point on a draft
- [x] Layer names and numbers are gone; boxes read in the approved order, on the page and with Previous/Next
- [x] Mention in chat confirms on the button; a repeat click adds no second pill; two boxes give two removable pills and the message sends with both
- [x] On a phone, Mention in chat shows the thread with the pill in it, and the box reads Mentioned on returning to the canvas
- [x] Undo has the blue outline; the upload icon has a tooltip and accessible name
- [x] A reader sees none of the owner actions
- [x] By keyboard alone: a box can be selected and deselected, and Edit, Open, Add card, See all, Show less, Mention in chat, Save and Cancel all work, with visible focus and focus never lost to the page
- [x] Long text, 0 cards and 3 cards hold at 320px, 375px and desktop, with every control at least 40px tall

## Open Questions

A hand-added point carries no quote and is not subject to the quote check.

## Alternatives Considered

Eight prototypes (a hint line, dots and hover-only were also tried), reviewed by Gemini Argon and Opus for attention. E (all actions always visible, 25 controls at rest) was the first pick and rejected for clutter. F (no cue at all) risks actions nobody finds. G (Add to chat as a composer picker) was read as "create a box". A `...` menu was rejected because the founder has already missed hidden actions.

## Related

P1536 (D5, J4) · P1535 (layers, one card per box) · P1581 (box titles) · P1613 (Add to chat in the header, replaced here) · P1614 (hand edit) · P1618 · P955
