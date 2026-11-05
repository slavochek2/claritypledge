---
status: week
type: story
rank: 97
workstream: canvas
created_date: '2026-11-05'
tags: [canvas, ux, design-system]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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

Blast radius: the canvas page for owners, and one new write path. Reversibility: code by git revert; points created by hand stay as data. Decision density: low, the layout is approved; the copy marked below is open.

## Invariants

- A hand-written point follows P1614's rule: a published version never changes (decisions.md 2026-11-05).
- Never a dead control: an action that cannot run now is absent or says why (P955).
- A reader or signed-out visitor sees no owner action (P1536 D5).
- One main action on the page, Publish or Share (design system rule 9).

## Solution

Approved prototype: `/tree/canvas-actions?v=h`, branch `feature/p1621-canvas-action-variants`.

- **At rest:** each box shows its title and icon, its first card or its question, and See all N when it has more than one card. See all opens all the cards in one click. One hint line sits above the grid.
- **Selecting:** any box, empty or filled, can be selected by clicking it. Only one is selected at a time. Clicking it again or clicking outside any box deselects.
- **Selected card:** Edit then Open at its bottom right, with icons.
- **Selected box:** below the card, Add card on the left and Add to chat on the right, both with icons and labels at every width. This replaces P1613's icon-only Add to chat.
- **Add card:** opens an editor in the box, with the box's question visible above the text field, then Save and Cancel. No model and no run: these are the owner's own words.
- **Section names:** the three layer names and numbers are removed, with a gap between rows. Founder-approved.
- **Box order (founder-approved):** Customer Segments, Problem, Solution; Offers & Pricing, Go-to-market strategy, My next milestone; My current biggest challenge, Hypotheses I've falsified, Guiding values. Display order only; points keep their boxes.
- **Button weight:** Add card is the selected box's one secondary button (blue outline). Edit, Open, Add to chat and See all stay quiet grey.
- **See all:** expands in place, up to the box's limit, and Show less collapses it.
- **Composer:** a box added to chat is a pill above the text field with a remove control. Several boxes in one message stay possible. Typed `[Solution]` keeps working.
- **Undo:** the secondary blue-outline style (founder request).
- **Upload icon:** tooltip and accessible name, understandable without hover.

Hint line: "Tap a box to see what you can do." It goes away after first use (founder-approved).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Owners miss actions hidden until selection | MITIGATE | Hint line; watch the founder's first real session. The founder has missed hidden actions before |
| A row grows when a box is selected, moving the rows below | ACCEPT | Measured about 71px in the prototype; founder saw it and approved H |
| On a phone, Add to chat gives no feedback with the chat off-screen | MITIGATE | Verify on the real route, and show the thread or a confirmation |
| Selecting replaces "tap a card to open" for the owner | MITIGATE | Applies to the owner's draft only; readers keep the whole card opening |
| A hand-added point during an agent run conflicts with the run | MITIGATE | Same busy handling as P1614's Edit |

**Non-Goals**
- Do NOT change the quote check or the drop message; that is separate work.
- Do NOT change what readers see.
- Do NOT rename any box.
- Do NOT change the mic button or box icons (reviewed, kept).

## Acceptance Criteria

- [ ] At rest on an owner's draft, no box shows Edit, Open, Add card or Add to chat
- [ ] An empty box and a filled box can each be selected, and only one at a time
- [ ] Clicking a selected box, or outside any box, deselects it
- [ ] A selected card shows Edit then Open at its bottom right; Add card is left and Add to chat right below it
- [ ] See all N shows every card in one click
- [ ] An owner adds a second card by hand, it stays after reload, and a published version is unchanged
- [ ] The box question stays visible while typing a new card
- [ ] Add to chat from two boxes shows two removable pills, and the message sends with both boxes
- [ ] Layer names and numbers are gone; boxes read in the approved order, on the page and with Previous/Next
- [ ] Undo has the blue outline; the upload icon has a tooltip and accessible name
- [ ] Add to chat on a phone gives visible feedback when the chat is off-screen
- [ ] A reader sees none of the owner actions
- [ ] Long text, 0 cards and many cards hold at 320px, 375px and desktop, with every control at least 40px tall

## Open Questions

1. The owner's published canvas shows Add to chat today (a tap starts a Clone, P1536 J4). Does selection apply there too? Default: yes for Add to chat only. UNVERIFIED against the real route.
2. Adding a point needs a new write path. Not yet designed; P1614's edit RPC is the model. A hand-added point carries no quote and is not subject to the quote check.

## Alternatives Considered

Seven prototypes, reviewed by Gemini Argon and Opus for attention. E (all actions always visible, 25 controls at rest) was the first pick and rejected for clutter. F (no cue at all) risks actions nobody finds. G (Add to chat as a composer picker) was read as "create a box". A `...` menu was rejected because the founder has already missed hidden actions.

## Related

P1536 (D5, J4) · P1535 (layers, one card per box) · P1581 (box titles) · P1613 (Add to chat in the header, replaced here) · P1614 (hand edit) · P1618 · P955
