---
status: backlog
type: story
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [stories, video, summary, disagreement-pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1349: One full-summary page per source video, linked from its stories

## Problem

**Situation:** Agent stories are 1–2 sentences plus quotes (P1348). The reader sees a thin slice of
a long video and can't tell if the slice is fair.
**Complication:** The founder already does this elsewhere ("read-first" project: video summary with
timestamps). UNVERIFIED: that project isn't in this repo; location to confirm.
**Question:** Give every source video one summary page, and link it from every story drawn from it.

> Founder, verbatim: "for each embedded video have such a page similar like read first where there
> is the full thing … at the end read the full summary … people click and can go to that page and go back"

## Appetite

Blast radius: medium. New public route, new generated text about named people. Reversibility: route
can be unpublished. Decision density: a few (below).

## Invariants

- One page per **video**, never per story. N stories from one video → one URL.
- Summary text meets the same accuracy bar as stories: every timestamped claim traces to transcript
  text (P1140 retention) and is checked by an agent that did not write it.
- Person-safety rules that bind stories (story-draft PS-1 etc.) bind the summary too.

## Solution

- Pipeline stage: generate the summary from the retained transcript, with timestamps, writer and checker kept separate.
- Route: `/video/<id>` (name TBD) renders summary + player; timestamps seek the player.
- Link placement: **directly under the video player, wherever a player renders.** Story lists
  already group by source video (`src/lib/group-by-source`, one shared `groupPlayer`, P1296), so
  the link appears **once per group, before the first story**, never repeated per story. A story
  shown alone (detail, embed) has its own player, and the link goes right under it. Founder,
  verbatim: "maybe below youtube video right there? even before story begins?" Back navigation
  returns to the story.

[FOUNDER DECISION: link copy. Working text "Read the full summary →"]
[FOUNDER DECISION: is the summary a neutral digest, or organised by the points/positions in the video?]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Summary misrepresents a named speaker; it becomes the most-trusted, least-checked text on the site | MITIGATE | Same writer/checker + transcript verification as stories |
| Near-duplicate pages hurt SEO / P1280 dedup | MITIGATE | One page per video, canonical URL |
| Copyright/fair use on long summaries of others' talks | DEFER | Founder call before public launch |

**Non-Goals:** do NOT host the video (embed only); do NOT change story generation beyond adding the link.

## Acceptance Criteria

- [ ] Under every video player on a story surface (grouped list, detail, embed) a reader sees "Read the full summary →" and lands on that video's page
- [ ] A group of N stories from one video shows the link exactly once, under the player, before the first story
- [ ] Two stories from the same video link to the same URL
- [ ] Clicking a timestamp on the summary page seeks the embedded player
- [ ] Browser back returns to the originating story
- [ ] Every timestamp on a sample summary matches the transcript at that time (checked by hand on ≥1 video)

## Open Questions

1. Where is the "read-first" project and what does its summary format look like? Reuse it.

## Resolved Decisions

**Falsify review 2026-09-22: BLOCKED before build.** Reports: 2 of 2 (Opus reviewer + Codex). Both
returned BLOCK, and they agreed. Load-bearing claims re-checked by command:

1. **No per-video identity.** No `videos`/`sources` table in `supabase/migrations/`. The only identity is
   `stories.video_url`, with the key normalised client-side in `src/lib/group-by-source.ts`. Needs a
   source entity (provider + video id, unique) that owns the summary, its provenance and its status.
2. **"Once under the player" isn't true everywhere.** `point-detail-page.tsx` has 0 `groupBySource`
   calls, and grouping needs ≥2 stories (`group-by-source.ts:58`). Point pages and single cards get
   one player per story, so the link would repeat. Depends on P1280 or on enumerating each surface.
3. **Link only when a summary exists.** Otherwise it's a dead link on every un-summarised video.
4. **Person-safety doesn't inherit from story-draft.** PS-1 forbids naming a position, but a digest
   organised by positions does exactly that. A multi-speaker summary needs its own rules:
   per-speaker attribution, a label saying the summary is generated, a way to correct or retract,
   and no positions that aren't in the transcript.
5. **The AC checks timestamps on one video and nothing about attribution or fidelity.** It contradicts
   the invariant.
6. **Embeds:** the link must open top-level or in a new tab. Inside an iframe, "back" can't work.
7. **Need is unproven now that P1348 has shipped.** Always-visible timestamped quotes may already answer "is this slice fair?".
8. **Copyright is a pre-publish gate, not a DEFER.**

Next: founder decides whether to proceed. If yes, rewrite the Solution around a source entity before `/architect`.
