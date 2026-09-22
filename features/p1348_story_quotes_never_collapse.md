---
status: week
type: task
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [stories, quotes, embeds, disagreement-pipeline]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1348: Story quotes never collapse, and pipeline stories shrink to 1–2 sentences

## Problem

**Situation:** Linked points (the quotes with timestamps) are collapsed by default on story cards
(`story-card-with-links.tsx:110`, `feed-story-card.tsx:88`, `profile-page-v2.tsx:1331`,
`StoryCardDetail.tsx:159` via `defaultCollapsed`). The code comment says the position badge makes them
redundant; git history shows the collapse actually came from fixed-height blog embeds
(`49da73984`, `dfa9879f5`).
**Complication:** A reader asked why they're collapsed at all. Agent stories are also becoming 1–2
sentences, so a story with its quotes hidden is a claim with no evidence.
**Question:** Remove the collapse everywhere, and change the pipeline's story-length rule.

> Founder, verbatim: "if we want uncollapsed .. so be it everywhere! including embeds.."
> Founder, verbatim: "only one sentence summary of story (experience/reasoning why the agent
> predicts the protagonist to hold a specific position) or max two sentences"

## Appetite

Blast radius: medium. Every story surface, including third-party blog embeds. Reversibility: git
revert. Decision density: zero, founder decided both halves above.

## Invariants

- **Mirror surfaces change together** (decisions.md, point-card embed gate ruling): if linked points
  render uncollapsed under a story, check that stories-under-a-point in `point-card-with-links.tsx`
  follow the same rule, or state why they differ.
- Quotes and timestamps are never behind a toggle on any surface (matches P1280 "Timestamps never collapse").

## Solution

1. Remove the expand/collapse state and toggle for linked points on every story surface. Points always render.
2. Embeds: let the iframe grow to fit the content. The founder accepts taller embeds.
3. `story-draft.md:51`: replace "Three or four sentences" with **one sentence, at most two**, saying
   why the agent predicts this person holds this position (their experience or reasoning). Then the
   point's quote. Visibility needs no pipeline change.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Fixed-height blog iframes clip the now-visible quotes | MITIGATE | Check embed resize behaviour; clip = auto-height or post height via postMessage |
| Stories with many linked points get long | ACCEPT | Pipeline is now one point per story (P1210 §7) |
| 1-sentence stories break story-craft rules (e.g. "first sentence must earn the second") | MITIGATE | Update `docs/story-craft.md` wording where it assumes ≥3 sentences |

**Non-Goals:** do NOT change the story text collapse (`textExpanded`); do NOT touch how quotes are verified.

## Done-When

- [ ] Story card, story detail, feed card, profile card and blog embed all show quotes + timestamps with no toggle (screenshots at 375/320/desktop)
- [ ] A blog embed with 3 linked points shows all of them without clipping or an inner scrollbar
- [ ] `story-draft.md` states 1 sentence (max 2); `docs/story-craft.md` doesn't contradict it
- [ ] Existing tests for the toggle updated to assert always-visible (a spec change, not a test weakened)
