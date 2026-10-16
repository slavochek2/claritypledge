---
status: week
type: story
rank: 41
workstream: clarity-canvas
created_date: '2026-10-16'
tags: [canvas, lean-canvas, points, stories]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1508: Clarity Canvas, an owner's canvas built from their points

## Problem

**Situation:** A lean canvas is the set of bets a business rests on. Clarity Pledge already stores
bets as points (agree/disagree, versions) with stories behind them, and tags points from hashtags.
A canvas view was designed in May (playground `clarity-canvas/`, v1 to v10) and parked pending
demand; it was never built, and no owner's canvas exists in production.
**Complication:** The next event (`docs/goals.md` 3a, a two-session sales mastermind) runs on each
attendee's lean canvas: people understand, then challenge, each other's riskiest boxes. That needs
a real canvas in the product, and this event is the demand the 2026-05-19 parking decision waited
for.
**Question:** What is the smallest proper Clarity Canvas, built from existing points, stories and
components, that an owner can open and others can read?

> Founder, 2026-10-16: "we are creating a clarity canvas, a proper one, with points and stories on
> clarity pledge that takes into v10 and v9 maybe into account. And that reuses the components that
> we have and it is clear, short and brief and fulfills the thing."

> Founder, on where it lives: "let's go for artifact because slash stake is not artifact in that
> sense. It's just a filter on top of feed."

Outcome: the founder's own canvas lives in Clarity Pledge.

## Appetite

Blast radius: one new surface; reads existing points/stories, writes nothing new to them.
Reversibility: high if no schema change; medium if `/architect` adds a canvas record.
Decision density: a few (marked below).

## Solution

- **A canvas is an owner's artifact with its own address**, not a `/stake` tag filter. It belongs
  to one owner and is identified by a project tag. Its contents are that owner's points carrying
  the project tag, placed into boxes by box tags (`canvas:<box>`), per the 2026-05-19 ruling that the
  canvas is a tag-grouped view and the lean canvas is one layout. Stories show as they already do
  behind a point.
- **Reuse the real components.** Each point renders with the current production point card
  (`feed-point-card.tsx` family: position buttons, details, linked stories); stories with the
  current story card. The playground cards are outdated reference only. No look-alike cards.
- **Layout.** Desktop: the 9 lean-canvas boxes as a grid that fits one screen, each box titled.
  Mobile: boxes stacked, each with its title. A box holding several points scrolls sideways inside
  the box; boxes never grow to fit.
- **No canvas/letter switcher.**
- **Viewing as** (v10 lens: show one person's positions on the canvas): include only if it reuses
  existing position data with no new query shape; otherwise drop to a follow-up.
- **Seed:** the founder's canvas, from the hand-made decomposition in the playground (`data-v9.js`,
  an older canvas; being up to date does not matter for the showcase).
- **Prototype first** on a `/tree` route with real components and seed data; founder reviews; then
  build the production route.

[FOUNDER DECISION: the address shape (e.g. `/canvas/<id>`) and the canvas's display name.]
[FOUNDER DECISION: box titles (lean-canvas standard nine, or adapted wording).]
[FOUNDER DECISION: whether a canvas needs its own record (title, owner, project tag), or is fully
derived from owner + project tag until the artifacts spec. `/architect` recommends.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Canvas points are public, and owners don't want their canvas public | DEFER | Prerequisite for the event; owned by the follow-up artifacts + sharing spec (builds on P1181, community-scoped visibility, parked on its branch). This spec shows the owner's own canvas and public points only. |
| Anyone can tag a point with someone else's project tag | MITIGATE | Only the owner's own points are shown on their canvas. |
| A box with many points becomes unusable on mobile | MITIGATE | Sideways scroll inside the box; check at 320px. |
| Prototype drifts from production cards again | MITIGATE | Prototype imports the production components, no copies. |

**Non-Goals**
- Do NOT add sharing, group or event visibility, or inbox listing (follow-up artifacts spec).
- Do NOT wire Clarity Chat, uploads or agents (P1500 and its siblings).
- Do NOT build a canvas creation UI; points are created as today (hashtags become tags).
- Do NOT add a letter view or switcher; do NOT touch P1332.
- Do NOT change point or story cards' behaviour; reuse them as they are.

## Acceptance Criteria

- [ ] The founder opens their canvas at its own address and sees their points in the nine titled boxes.
- [ ] Every point on the canvas is the production point card: they can take a position and open its stories.
- [ ] On desktop the nine boxes fit one screen without page scroll at 1440x900.
- [ ] On a 375px and a 320px screen, boxes stack with titles; a box with 3+ points scrolls sideways inside itself.
- [ ] A point by another user carrying the same project tag does not appear on the owner's canvas.
- [ ] The founder approved the `/tree` prototype before the production route was built.

## Related

- P1500 Clarity Canvas from event threads (chat follow-up) · P1332 canvas to letter (backlog) ·
  P611 renderer (rejected) · P1181 community-scoped visibility (branch, parked) · P1503 Clarity Chat prototype
- Rulings: `docs/decisions.md` 2026-05-19 [product] x3 (parked pending demand; tag-grouped schema
  view; four curation principles)
- Design reference: `~/Projects/public/superdesign-playground/clarity-canvas/` (v9-SPEC.md, v10-SPEC.md, v10-mvp.html)

## Open Questions

1. Founder: "practically it will live in drafts ... then it's a bit hidden somewhere buried which is
   fine for the beginning" — how owners find their canvas is left to the artifacts spec.
