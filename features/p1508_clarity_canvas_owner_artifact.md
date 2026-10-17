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

Blast radius: one new surface plus the system-tag set, which the feed and `/stake` also read.
Writes: one definer function for box tags, a box-tag carry-forward on new versions, and a seed.
Reversibility: medium (system-tag set and a function; plus a record if `/architect` adds one).
Decision density: a few (marked below).

## Solution

- **A canvas is an owner's artifact with its own address**, not a `/stake` tag filter. It belongs
  to one owner and is identified by a project tag. Its contents are that owner's current-version
  points carrying the project tag, placed into boxes by box tags, per the 2026-05-19 ruling that the
  canvas is a tag-grouped view and the lean canvas is one layout.
- **Box tags are system tags, never parsed from hashtags** (review 2026-10-17). Typed hashtags
  cannot carry them: `extractHashtags` matches `#(\w+)` (`src/lib/utils.ts:185`). Today's system
  tags are a fixed set (`src/lib/feed-utils.ts:21-31`); extend it with one box-tag pattern
  (`/architect` names the nine keys) and check the feed and `/stake` still separate user and system
  tags. **Write path:** clients cannot write `system_tags` (insert hard-codes `[]`,
  `points-service-real.ts:215`; a trigger restores them on update, p630 migration). So: one
  SECURITY DEFINER function that lets a point's **own author** set its box tag (the later chat
  agent needs the same path); the founder seed runs as a service-role script. **Versions:** a new
  version of a point carries its box tag forward, so editing never drops a point off the canvas.
  The project tag is a plain user tag, typed as a hashtag as today. A point with the project tag
  and no box tag is not shown; a point with two box tags shows in both.
- **New read path.** No existing service fits: `getPublicPointsFeed` takes one tag and no owner
  (`points-service-real.ts:777`), `getPointsByValidator` has an owner and no tag (`:307`), and both
  filter to public (`:801`, `:327`). Add one read: owner + project tag + box tags, returning what
  the point card needs, linked stories batch-fetched (never per card).
- **Visibility.** The owner sees all their own points on their canvas, private included (owner SELECT
  policy, p586 migration lines 278-282). Anyone else sees public points only, until the follow-up
  sharing spec.
- **Reuse the real components.** Inside a box each point shows as a **compact** form of the
  production point card (statement + positions): a new prop on the same component (none exists
  today, `feed-point-card.tsx:67-73`), not a look-alike.
  Opening it shows the full production point card with its stories in a side panel on desktop and
  a full-screen sheet on mobile (v10's own depth model). The card gains a `'canvas'` value in its `surface` prop
  (`feed-point-card.tsx:67`, used for analytics); no other card behaviour changes.
- **Layout.** Desktop: the nine titled boxes as a grid within one screen; points stack inside a box
  and the box scrolls vertically. Mobile: boxes stacked with titles; a box with several points
  swipes sideways with snap and an "n / N" counter. No canvas/letter switcher.
- **Seed:** the founder's canvas from the playground decomposition (`data-v9.js`, an older canvas;
  freshness does not matter), inserted by a script under the founder's account.
- **Build order:** `/tree` prototype with the production components and seed data → founder
  review → production route.

[FOUNDER DECISION: the address shape (e.g. `/canvas/<id>`) and the canvas's display name.]
[FOUNDER DECISION: box titles (lean-canvas standard nine, or adapted wording).]
[FOUNDER DECISION: whether a canvas needs its own record (title, owner, project tag), or is fully
derived from owner + project tag until the artifacts spec. `/architect` recommends.]

## UX Notes

- Empty box: titled, subdued, no placeholder points.
- Unknown canvas or owner: not-found page.
- Signed-out viewer: reads public points; position buttons follow the card's existing signed-out
  behaviour.
- Superseded point versions are not shown.
- Loading: box skeletons. Read error: one error message for the page, no partial grid.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Owners don't want their canvas public | DEFER | Prerequisite for the event; owned by the follow-up artifacts + sharing spec. This spec shows the owner everything and others public points only. |
| Anyone can tag a point with someone else's project tag | MITIGATE | Only the owner's own points appear. |
| Full cards don't fit nine boxes on one screen | MITIGATE | Compact card in the box, full card in the side panel. |
| Sideways swipe fights page scroll on mobile | MITIGATE | Snap + counter; verify at 320px. |
| Prototype drifts from production cards | MITIGATE | Prototype imports the production components. |

**Non-Goals**
- Do NOT add sharing, group or event visibility, or inbox listing.
- Do NOT wire Clarity Chat, uploads or agents (P1500 and siblings).
- Do NOT build a canvas creation UI or let owners type box tags.
- Do NOT add a letter view or switcher; do NOT touch P1332.
- Do NOT change point or story card behaviour beyond the new compact prop and the `'canvas'` surface value.
- Do NOT build the v10 "viewing as" lens (follow-up).

## Acceptance Criteria

- [ ] The founder opens their canvas at its own address and sees their points in the nine titled boxes, private ones included.
- [ ] Signed out, the same address shows only the public points.
- [ ] Opening a point shows the production point card with its stories; a position taken there persists.
- [ ] At 1440x900 the page does not scroll (`document.documentElement.scrollHeight <= innerHeight`); a box with many points scrolls inside itself.
- [ ] At 375px and 320px boxes stack with titles; a box with 2+ points swipes sideways and shows "n / N".
- [ ] A point by another user with the same project tag does not appear; a point with no box tag does not appear.
- [ ] An empty box renders titled; an unknown canvas address shows not-found.
- [ ] Editing a point on the canvas (new version) keeps it in the same box.
- [ ] A signed-in user cannot set a box tag on someone else's point.
- [ ] The feed and `/stake` pages show the same tags as before for existing points.

## Related

- P1500 Clarity Canvas from event threads (chat follow-up) · P1332 canvas to letter (backlog) ·
  P611 renderer (rejected) · P1181 community-scoped visibility (branch, parked) · P1503 Clarity Chat prototype
- Rulings: `docs/decisions.md` 2026-05-19 [product] x3 (parked pending demand; tag-grouped schema
  view; four curation principles). This spec resumes the parked canvas on the event (closest to
  recovery signals 2 and 4) and makes it an owner artifact rather than `/d/<docId>?view=canvas`;
  record that in decisions.md when the spec is approved.
- Design reference: `~/Projects/public/superdesign-playground/clarity-canvas/` (v9-SPEC.md, v10-SPEC.md, v10-mvp.html)

## Open Questions

1. Founder: "practically it will live in drafts ... then it's a bit hidden somewhere buried which is
   fine for the beginning" — how owners find their canvas is left to the artifacts spec.
