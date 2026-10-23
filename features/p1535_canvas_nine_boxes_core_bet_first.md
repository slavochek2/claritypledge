---
status: in-progress
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 42
changes: p1508
tags:
  - redesign
  - p1508
workstream: clarity-canvas
disclosure: public
created_date: 2026-10-21
delivery_stage: dev
pipeline_ran: [change-request, dev]
---

# P1535: Clarity Canvas, nine boxes, core bet first, one screen

> **Redesign of:** [P1508: Clarity Canvas owner artifact](done/2026-06-10/p1508_clarity_canvas_owner_artifact.md)
> **What was wrong:** The eleven-box canvas opens with an Ikigai layer (What I love, What I'm good
> at, What the world needs) and carries two lean-canvas boxes that founders fill with fluff (Unfair
> Advantage, Cost Structure). Interviewing the founder box by box on his own sales mastermind canvas
> showed that "What I'm good at" invites self-praise, "What I love" lists hobbies instead of
> commitments, and Unfair Advantage stays empty or invented. Four layers also push the core bet below
> the fold.

## Operating Mode

> This spec is an **incremental correction** to P1508, not a greenfield design.
> The predecessor spec is **read-only shipped history**. Implement the delta below. Settled P1508
> decisions not named here (panel, cards, Compare, header, visibility, tags) are not re-examined.

## Problem Statement

> Founder framing, verbatim (2026-10-21): *"We don't need to keep Ikigai. We are developing a
> clarity canvas. The question is what people actually need to be aware of. And I think being aware
> of values, positive externality and your weaknesses is arguably more valuable."*

The founder, building his own canvas for the sales mastermind, judged each box by that test, from
the point of view of founders building businesses in the AI world:

- "Values are things that you sacrifice for ... in my case, it's intellectual honesty and integrity."
- "Usually my strengths are my weaknesses ... maybe the canvas should say ... when your strengths
  become your weaknesses."
- "Unfair advantage, we just delete it. It's a shitty thing that never worked in Lean Canvas."
- "Distribution, we should rename to ... go to market strategy." Cost structure: "I don't think it is
  [important for digital businesses]." Offers and pricing: keep. Key metrics: "keep metrics ok".
- On the externality box: "Who else wins when I win? ... it requires first to specify the basics. So
  ... it's one of the last boxes."
- "If the boxes contain only one point per row then ... they can be smaller ... can we see all of it
  in one page?" and "the core bet is the top layer."

## Jobs To Be Done

- **Preserved from P1508:** read a canvas first and act on open; understand, then challenge, the
  riskiest boxes at an event; compare positions with one person; owner edits through the agent.
- **Corrected:** self-reflection was Ikigai (love, good at, world needs); it becomes awareness of
  values (what you sacrifice for), where strengths turn into weaknesses, and who else wins.
- **New:** see the whole canvas at once on a desktop screen, so a peer can challenge all of it.

## Current State

`src/lib/canvas-boxes.ts` defines eleven boxes in four layers:

```
01 Why I do this   What I love | What I'm good at | What the world needs
02 The core bet    Customer Segments | Problem | Solution
03 How we win      Unfair Advantage | Distribution | Key Metrics
04 How it pays     Offers & Pricing (half) | Cost Structure (half)
```

`canvas-page.tsx` renders `CANVAS_LAYERS` in a 6-column grid at lg (boxes span 2, the two-box layer
spans 3), with `mt-10` between layers, cards clamped to 5 lines, up to 2 cards per box.

## Root Cause

The box list encodes a framework (Ikigai plus lean canvas) instead of the awareness a founder needs;
it was approved in rounds where nobody had yet written a real canvas in it. The first real canvas
(founder interview, 2026-10-21) exposed the boxes that produce no challengeable statement. Layout:
the four-layer order (`CANVAS_LAYERS`, canvas-boxes.ts) and generous spacing (`mt-10` per layer,
`line-clamp-5` cards, canvas-page.tsx) put the core bet in the second screenful.

## Redesign

Titles change, **keys stay** (sixth-round R1 precedent: "Renames are titles only ... no key
changes"). Two keys leave the box list, as `canvas:uvp` did.

**After (desktop, three columns, one screen at 1440x900 with up to one card per box):**
```
Clarity Canvas
by <owner> · <canvas name>  [Compare positions]
01 Core assumptions       Customer Segments | Problem               | Solution
02 Profitability assumptions      Go-to-market strategy | Offers & Pricing  | How I'll know it's working
03 Founder-fit assumptions        My values        | My biggest challenge | Who else wins when I win?
```
Two columns from 640px and one below, same reading order. Panel, Previous / Next and "See all N"
unchanged; they follow the new order.

| Key | New title | Layer |
|---|---|---|
| canvas:segments | Customer Segments | Core assumptions |
| canvas:problem | Problem | Core assumptions |
| canvas:solution | Solution | Core assumptions |
| canvas:channels | Go-to-market strategy | Profitability assumptions |
| canvas:revenue | Offers & Pricing | Profitability assumptions |
| canvas:metrics | How I'll know it's working | Profitability assumptions |
| canvas:love | My values | Founder-fit assumptions |
| canvas:good-at | My biggest challenge | Founder-fit assumptions |
| canvas:world-needs | Who else wins when I win? | Founder-fit assumptions |
| canvas:advantage | (dropped) | |
| canvas:cost | (dropped) | |

Founder decided (2026-10-21): layers "Core assumptions", "Profitability assumptions", "Founder-fit
assumptions", so every row reads as unproven ("assuptions for me clearr"). Replaces the placeholders
"Go to market" (clashed with its own Go-to-market strategy box) and "Me and the world"; "bet" was
rejected as unclear. The metrics title "How I'll know it's working" stays.

Compact layout: tighter spacing between layers, cards clamped to fewer lines, smaller box padding,
so nine boxes with one card each fit 1440x900 without page scroll. Each box shows ONE card, and
"See all N" opens the rest (founder, 2026-10-21: "strive for only one card per section"; a layout
nudge, not a hard limit: a second point is still allowed and reachable).

## Predecessor Sections Superseded

| Section | P1508 said | Status | Replaced by |
|---|---|---|---|
| Boxes (2026-10-17) | "the lean canvas's nine boxes plus three ikigai boxes ... Twelve boxes" | Superseded | Redesign table |
| R1 layers | "Who I am ... The core bet ... How we win ... Money in, money out" / R12 "Why I do this ... How it pays" | Superseded | Three layers, core bet first |
| R1 order rationale | "it starts with what I love, what I'm good at, what the world needs" | Superseded | Core bet first; self-awareness last |
| AC Layout (R1, R12) | "eleven boxes under four numbered layers ... each half the row at three columns" | Superseded | AC 1, 4 |
| AC owner view | "sees their points in the eleven titled boxes" | Superseded | AC 1 |
| Event redesign | "The page may scroll ... reverses the earlier one-screen AC at 1440x900" | Superseded | AC 3 |
| R1 UVP | "its points move to Solution or Unfair Advantage" | Partially superseded | Advantage gone; Solution only |

## Requirements

1. `CANVAS_BOXES` holds the nine boxes above, keys unchanged, new titles; `CANVAS_LAYERS` the three
   layers in the order above. `canvas:advantage` and `canvas:cost` leave the list.
2. A point tagged with a dropped key shows on no canvas (same as `canvas:uvp` today); its tag still
   never shows as a pill (`isCanvasTag` is pattern-based) and the DB guard (pattern-based, migration
   20261019120000) is unchanged.
3. Icons exist for every box; new meanings get fitting icons (Values, strengths-weaknesses, who else
   wins, go-to-market, metrics).
4. Compact layout as in Redesign; long titles wrap inside the box header and the panel header with
   no overflow at 320px.
5. Update the box-set unit and e2e tests: they are the spec of the old set.

## Invariants

- Reading order equals visual order at every width, and Previous / Next follow it (P1508 AC).
- Every box is shown, filled or empty, to everyone (P1508 D3).
- No sideways page scroll at 375px or 320px (P1508 AC).
- Box tags stay system tags; no client write can set one.

## What Stays the Same

Data model, migrations, seed scripts (`scripts/seed-p1508-*.mjs` keep accepting the old keys; a
point seeded into a dropped box simply does not show), panel, cards, Compare, header, visibility,
routes, P1515 sharing work.

## Surfaces in Scope

**In scope:** `src/lib/canvas-boxes.ts`, `src/app/pages/canvas-page.tsx` (icons, grid, spacing,
comment header), `src/tests/p1508-clarity-canvas.test.tsx`, `e2e/p1508-clarity-canvas.spec.ts`
(layer and order tests).

**Out of scope:** seed scripts (P1515 edits them in w11), migrations, point cards outside the
canvas, feed and `/stake`, playground files.

## Acceptance Criteria

- [ ] The canvas shows nine titled boxes under three numbered layers, in this order: Customer
      Segments, Problem, Solution / Go-to-market strategy, Offers & Pricing, How I'll know it's
      working / My values, My biggest challenge, Who else wins when I win? (founder renames
      2026-10-23: "Values" → "My values"; "My biggest challenge" replaces "When my strengths
      become weaknesses", same tag)
- [ ] No Unfair Advantage, Cost Structure or Unique Value Proposition box; points tagged with those
      keys appear nowhere on the canvas and show no `canvas:` pill.
- [ ] At 1440x900, a canvas with one card in every box fits without vertical page scroll.
- [ ] Three columns at 1024px and wider, two from 640px, one below; reading order is visual order;
      Previous / Next follow it.
- [ ] No overflow at 320px, including the longest titles in box and panel headers.
- [ ] Surfaces not in scope are visually unchanged (feed, point page).
- [ ] All other P1508 unit and e2e tests still pass.

## Next Steps

Scope is clear and targeted: `/dev` in a worktree, then an adversarial visual and technical review
with the Gemini review model; tensions go to the founder via `/slava:build:simplify`.
