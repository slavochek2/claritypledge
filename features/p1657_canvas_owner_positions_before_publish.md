---
status: backlog
type: story
rank: 327
workstream: clarity-canvas
created_date: '2026-11-10'
tags: [clarity-canvas, positions, publish, points]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
blocked_by: p1658
---

# P1657: The Clarity Canvas owner takes a position on every point before publishing

## Problem

**Situation:** A Clarity Canvas is made of points (decisions.md 2026-10-19, P1508). P1536 D20 (2026-10-30) lets the owner mark a stance on draft points "or publish it unmarked". P1631 (points from Clarify and the Mirror, specced, not yet built) requires the owner's position to publish a point there.

**Complication:** On a canvas the owner can publish points with no position of their own, so readers see claims nobody stands behind, and the canvas differs from what P1631 specifies for points made in chat.

> Founder, 2026-11-10: "Why can Clarity Canvas owner publish points without setting position? Because if you cannot set position, then it's not a point. Then of course other people cannot set position. Then the whole idea of disagreement on points within the canvas makes no sense."
> Founder, 2026-11-10, on the obvious fix: "one needs to open each card. So I click on the card, I click Open, then I set position. Then I need to go back … This is a lot of clicks."

**Question:** How does an owner set a position on every point before publishing without opening every card?

## Appetite

Blast radius: medium (every canvas publish, every owner). Reversibility: high for the UI; positions written are permanent records of the owner's stance. Decision density: a few founder calls (below).

## Prior rulings

- **Reverses P1536 D20** ("or publishes it unmarked"), by founder request 2026-11-10. D20's stated reason was "Needed by P1529's mid-session canvas update", so the reversal must answer how the event's 12-minute update step works (Open Question 2) before `/dev`.
- **P1614 (on main):** a hand edit keeps the owner's stance on the new point; only an AI rewrite starts without one.
- **decisions.md 2026-11-02:** no disabled Publish ("a dead control"); the main action stays tappable.
- **P1536 known limitation:** a kept (unchanged) draft point is the same row as the published point, so a stance set on it goes live at once.
- **Aligns with P1631 (unbuilt)**: "Publish is required to have the owner's position."
- **P1529 D6 / D7:** at the event's canvas-update step the owner "publishes the draft as it is"; stances "never block Publish". This spec changes that too: a decision is needed on how the event's quick publish works (Open Question 2).
- **P1631 invariant:** an agent's guess is never someone's position. No position is pre-filled for the owner.

## Invariants

- No point is published without its owner's own position on it, except where the founder's answer to Open Question 2 scopes the event's update step out (then said so in this list).
- No position is filled in by an agent or by a default.

## Solution

A **Review before publishing** step, proposed:

1. Tapping Publish opens one screen listing every point of the version across the 12 boxes, grouped by box, each with inline position buttons (one tap per point, no card opening). Points that already carry the owner's stance (unchanged points, hand-edited points per P1614, copied points per D20) show it; AI-written or AI-reworded points need a tap.
2. The screen says what it is and how many points need a position `[FOUNDER DECISION: copy]`. No time estimate unless it is computed from the count.
3. Publish on that screen is always tappable. With points still missing it says how many and scrolls to the first; with none missing it publishes.
4. Positions are saved as they are tapped (server-side, so a reload or another device keeps them). A tap on an unchanged point is live at once, because that point is already published; the screen says so. A failed save shows on that point and counts as missing.
5. `[FOUNDER DECISION: which positions count — is "unsure" enough, or does it mean the point should be reworded first?]`
6. `[FOUNDER DECISION: is the position at publish recorded with the version (a snapshot), or is it only the owner's current position, which they can later change or remove?]`
7. Canvases already published without positions: the next publish asks for them; nothing is backfilled.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A long canvas (12 boxes, several points each) makes publishing slow | MITIGATE | Only points without the owner's stance need a tap; the count is shown up front |
| The event's canvas-update step (12 minutes, many owners) cannot fit a review | MITIGATE | Open Question 2 decides before `/dev` |
| Positions on poorly worded points mean little | MITIGATE | Blocked by P1658 (points written as claims) |
| Owners tap through without thinking | ACCEPT | Same as any position; a stance is still a statement they own |

**Non-Goals**
- Do NOT pre-fill positions.
- Do NOT change how readers set positions.
- Do NOT change the drafting engine.

## Acceptance Criteria

- [ ] Tapping Publish on a canvas draft shows every point on one screen with its position buttons; no point needs to be opened.
- [ ] Tapping Publish with points missing says how many and scrolls to the first; it never publishes a point without the owner's position.
- [ ] A point that already carries the owner's stance (unchanged, hand-edited, copied) shows it without a tap; an AI-written or AI-reworded point asks.
- [ ] Reloading the review, or opening it on another device, keeps the positions already set; a failed save shows on its point and counts as missing.
- [ ] A published version shows the owner's position on every point to readers.

## Open Questions

1. Is "unsure" acceptable on a published point?
2. At the Sales Mastermind's canvas-update step, does the quick publish keep D6 ("as it is") with positions afterwards, or does the review apply there too?
3. Should the review also offer a one-line "why" per point? (Founder, 2026-11-10: "Or maybe at the point when he set position, he gives another feedback.")
4. Positions: snapshot with the version, or current only (Solution 6)?
5. Is "unsure" enough (Solution 5)?

## Related

P1536 (D20), P1631, P1529 (D6, D7), P1656 (point and story scores), P1658 (canvas box rules; blocks this).
