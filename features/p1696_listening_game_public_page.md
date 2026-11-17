---
status: qa
type: story
rank: 342
workstream: events
created_date: '2026-11-17'
tags: [listening-game, video, public-page, mobile]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1696: A public Listening Game page at /game

## Problem

The Listening Game video only appears inside a preparation (P1685). There is no short address we can put on a card, say at a hike, or share. Someone who has not signed up for anything cannot watch it on our site.

> Founder, verbatim: "can we also link it to claritypledge.com/game ? btw. maybe claritypledge.com/game lands on our own page ?"
> "Game action start preparing and secondary action read manifesto. So it will go to slash prepare. Also I would add it to tools. You have tools and then under tools tools. So two times tools we can put listening game. That links to that page."
> "ok make sure its mobiel friendely too"

## Appetite

Blast radius: low, one new public page and one menu entry. Reversibility: git revert. Decision density: settled in conversation on 2026-11-17 (below).

## Solution

1. A public route `/game` that needs no sign-in. It shows the same content as the P1685 game step: the title, the two-sentence subtitle, our self-hosted video and "The roles", taken from the same copy source, so the two never drift apart.
2. At the end of the page, after "The roles" (the same order as the preparation step): primary button **"Learn the Clarity practice"** → `/prepare`, and secondary link **"Read the manifesto"** → `/manifesto` (founder, 2026-11-17; renamed from "Start preparing" the same day, which only made sense to someone already going to an event). A visitor who watched the video here and then opens /prepare sees it again there: deliberately left as is, because that step only asks for one press of Play and repeats "The roles" right before the principle.
3. A **"Listening Game"** entry in the Tools menu, under its Tools tab, linking to `/game` (founder, 2026-11-17).
4. Mobile-friendly: the layout works at 320px and 375px with no horizontal scroll, and the button and link are at least 44px tall.

## Invariants

- Our pages never load a YouTube player; YouTube (https://youtu.be/0FD3H7rwiIk) is for discovery and sharing only (decisions.md, P1682 manifesto film entry). No YouTube embed or link on /game (founder, 2026-11-17, kept the existing policy).
- One primary action per view (P955).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The page copy drifts from the preparation step | MITIGATE | Read from the same copy constant as P1685 |
| /game is unused | ACCEPT | It is cheap; measure with a page-view event if one exists by default |

**Non-Goals**
- Do NOT change the P1685 preparation step or its saved progress.
- Do NOT record any preparation state from /game.
- Do NOT add the page to landing pages or the main navigation beyond the Tools entry.

## Acceptance Criteria

- [x] Opening claritypledge.com/game while logged out shows the title, subtitle, video and "The roles" — verified on the worktree dev server, signed out (screenshot at 375px) and by p1696-game-page.test.tsx. `[post-deploy]` re-check on claritypledge.com/game.
- [x] "Learn the Clarity practice" opens /prepare; "Read the manifesto" opens /manifesto — p1696-game-page.test.tsx asserts both hrefs
- [x] The Tools menu → Tools tab lists "Listening Game", and it opens /game — p1696-game-page.test.tsx and p1179-links-menu.test.tsx
- [x] At 320px, 375px and desktop: no horizontal scroll, nothing clipped, the button and link at least 44px tall — measured at 320px: scrollWidth 320 = innerWidth, both actions 44px; screenshots at 320, 375 and 1280 reviewed by a separate visual QA agent (only blocker was the dev-only poster file, restored)
- [x] No YouTube player or link on the page — p1696-game-page.test.tsx

## Related

- P1685 (Listening Game in every preparation): the screen and copy reused here
- P1682 (manifesto film): the self-hosted video ruling
- P1351 / P1323: Tools menu structure
