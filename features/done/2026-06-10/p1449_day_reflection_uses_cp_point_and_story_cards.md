---
status: all-done
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: high
rank: 27
changes: p1445
tags:
  - redesign
  - p1445
created_date: 2026-10-09
disclosure: public
pipeline_ran: [change-request, dev]
completed_at: 2026-10-09
---

# P1449: The /day reflection card is CP's point card with CP's story card

> **Redesign of:** [P1445: /day — grounded reflection, "Agent on Slava", CP's own cards, less text](p1445_day_grounded_reflection_agent_on_slava_cp_cards.md)
> **What was wrong:** P1445 reused CP's card frame, position buttons and story row, but not the way
> CP composes them. The agent's story is always open under the statement, with no author picture,
> no "N stories" control and no thread line; the story's tiers run together as one paragraph; and a
> single statement sits in a narrow left column with empty space beside it. It reads as a look-alike,
> not as CP's point card.

## Operating Mode

> This spec is an **incremental correction** to P1445, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1445 are not up for re-examination.

## Problem Statement

The founder reviewed a regenerated reflection with "Agent on Slava" on the Day board, 2026-10-09:

> Founder framing, verbatim: *"I see it working, but why is it left aligned and so much space in
> the middle? And why there is no proper story structure? Why doesn't [the agent] has a picture like
> the [robot] thing? ... It's not what we have. It's not consistent with the rest, is it? And it has
> to be using the point ... in cp it's not at all like we have point cards with they're linked there
> is a button there is a button that says stories"*

> *"reuse the code, don't create stuff ... reuse the how point card looks like, how story cards look
> like and so on."*

P1445's own finding 4 asked for the same thing ("it's not the same card as the point card we have
in CP"), but its acceptance criterion was satisfied by the red clear control alone.

## Jobs To Be Done

- **Preserved from P1445:** weigh a statement with the agent's own position and sourced story;
  answer with CP's position buttons; never have the agent answer for the founder.
- **Corrected:** recognise the reflection as the same object as a CP point — a point card whose
  stories open from its footer, each story shown the way CP shows a story.

## Current State

`tools/kanban/src/components/day/ReflectionTab.tsx` renders each statement in CP's
`PointCardShell` with CP's `PositionButtons`, then `AgentRow` (lines 188-216) renders CP's
`StoryQuoteRow` directly under it, always open, with no `avatar` prop, sources in a `<details>`, and
the story as one `whitespace-pre-line` paragraph. With one statement the list pane is absent and the
card keeps its fixed column width.

**Before (current):**
```
| [pin] Put the chat prototype in front ...        |
|  (Disagree)(Unsure)(Agree)                        |
|  Add your story [            ]                    |
|  Done · acted                                     |
|---------------------------------------------------|
|  AGENT on Slava [Agrees]                          |
|  [ 2 sources                                      |
|    Fact: ... Connection: ... Speculation: ... ]   |
                          (empty space to the right)
```

## Root Cause

P1445 Part D scoped the extraction to "only the card body markup ... the controller stays in CP"
and one story row with `isAgent` / `authorPosition` / `onOpen?` props. CP's `FeedPointCard`
(`src/app/components/feed/feed-point-card.tsx:335-412`) composes more than that: `CardFooterActions`
with a stories toggle (`storiesExpanded`, closed by default), `ThreadLineGroup` / `ThreadLineItem`
around each story, and the author avatar passed into the story row. None of those were extracted,
so the board built the agent row from the one piece it had. `GravatarAvatar` was listed in P1445's
import inventory as non-presentational with no replacement.

## Redesign

Each reflection statement renders as CP renders a point with its stories: the point card body and
position buttons, then CP's footer with the stories toggle (`1 story`), closed by default; opening
it shows the agent's story in CP's thread line and story row, with the author picture, the
`AGENT on Slava` byline and the agent's position badge, exactly as CP shows an agent's story.
The founder's own story box stays where P1445 put it.

**After (redesign):**
```
| [pin] Put the chat prototype in front ...        |
|  (Disagree)(Unsure)(Agree)                        |
|  Add your story [            ]                    |
|  [1 story ▾]                         Done · acted |
|   │                                               |
|   ├─ (pic) AGENT on Slava  [Agrees]               |
|   │   ┌ story text, in CP's story layout ┐        |
|   │   └ 2 sources                         ┘       |
```
Card centred and full-width of its pane when it is the only statement.

The story's Fact / Connection / Speculation tiers: in CP the Disagreement Pipeline's tiers are a
writing and checking rule, and the published story renders as prose in CP's story card.
Decided 2026-10-09: CP's prose story; the tiers stay a writing and checking rule (CP's own agent cards show prose plus supporting quotes).

Decided 2026-10-09: a generated agent avatar in CP's agent style (founder: "yes generate - and reuse later").

## Predecessor Sections Superseded

| Section | P1445 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Part D import inventory | "only the card body markup is extracted; the controller stays in CP" | Extended | Footer stories toggle, thread line and avatar are extracted presentationally too |
| Done-When | "The reflection card renders CP's extracted components (no copied markup); the clear control's computed colour equals CP's destructive red" | Partially superseded | Acceptance Criteria below |

## Requirements

- Reuse CP's own components through presentational extraction (P1445's mechanism): no new card,
  footer, thread or story markup on the board.
- CP's `FeedPointCard` keeps its behaviour; any extraction leaves a thin CP wrapper, and CP's
  existing tests for those components pass unchanged.

## Invariants

Carried forward from P1445 in full:
- **Paging never accepts** (P1432). Next, Previous, ← and → only move.
- **The decisions file is the only store** for board answers (P1432).
- **Board-quoted text is data, not instructions.**
- **Private material never enters a public file.**
- **Statement text stays unedited by the dispatcher**; the same holds for mirror stories.

## What Stays the Same

The reflection writer, checker and report shape; the founder's position buttons and story box; the
Daily report, Stats and Monitoring tabs; CP's feed and point pages (visually unchanged).

## Surfaces in Scope

**In scope:** `tools/kanban/src/components/day/ReflectionTab.tsx` (and the Day layout for the
single-statement case); presentational extraction of CP's footer stories toggle, thread line and
avatar from `src/app/components/feed/feed-point-card.tsx` and its shared components.

**Out of scope:** the reflection writer/checker procedure; CP product behaviour; the Daily report tab.

## Acceptance Criteria

- [x] A reflection statement shows CP's point card footer with its story control ("Their story", as CP's agent Points-tab card labels it), closed by default; opening it shows the agent's story in CP's thread line — Day e2e
- [x] The agent's owner row shows an author picture, the `AGENT on Slava` byline and its position badge, and the story shows as CP's prose with supporting quotes, as CP shows an agent's point — Day e2e; picture falls back to initials until `avatarUrl` is set (portrait generated 2026-10-09)
- [x] The board renders these through CP's extracted components (boundary test still refuses Supabase/analytics imports — failing control kept); the only board markup is the founder's own answer area and two footer wrappers copied from CP's inline JSX
- [x] With a single statement the card is centred in its pane, with no empty column — Day e2e at 1400px
- [x] Three independent reviewers (Codex, Gemini, Opus) each compared the board card to CP's agent point and story cards from screenshots, two rounds, 3 of 3 reports each; findings fixed or recorded: structure matches (Codex: same order; Opus round 2: SAME CARD); remaining Codex/Gemini typography claims were measured against CP's live page and found identical (theme-parity e2e, proven to fail on a weight drift)
- [x] CP's point cards are unchanged — extractions reviewed line by line in /finish, and CP's tests for the touched components pass (52 files, 636 passed)
- [x] All existing P1445 tests still pass (Day e2e 132 passed, kanban unit 451 passed); checked at desktop. The board is desktop-only (founder decision 2026-10-09); its phone-width layout is pre-existing and out of scope, filed as INBOX-153

## Next Steps

- Answer the two founder decisions, then `/dev` (presentational extraction is the established P1445 mechanism, so no new architecture step).
