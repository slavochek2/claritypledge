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

The "N supporting quotes" block under a video story (`StoryVideoQuotes`, the verbatim quotes with timecodes)
is folded by default on every surface (P1296 item 8). A reader asked why. Agent stories are also
becoming 1–2 sentences, so hiding the quotes leaves a claim with no visible evidence.

> Founder, verbatim: "if we want uncollapsed .. so be it everywhere! including embeds.."
> Founder, verbatim: "only one sentence summary of story (experience/reasoning why the agent
> predicts the protagonist to hold a specific position) or max two sentences"

**Correction 2026-09-22:** the first implementation uncollapsed the *linked points* below the story,
which was not the ask (founder screenshot). That was reverted. Linked-point collapse is unchanged.

## Appetite

Blast radius: one shared component, all story surfaces. Reversibility: git revert. Decision density: zero.

## Solution

1. `StoryVideoQuotes` is never folded; its heading is a plain "N supporting quotes" label. Reverses P1296 item 8.
2. `story-draft.md`: a story is one sentence, two at most. Then the quote.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Long quote lists make cards tall | ACCEPT | Founder chose always-visible |
| Compact embed shows no video or quotes | DEFER | Existing embed behaviour, unchanged; separate call |

**Non-Goals:** do NOT change linked-point or linked-story collapse; do NOT change quote verification.

## Done-When

- [x] Story detail shows all supporting quotes and timecodes with no click (browser, test DB: 7 quotes visible)
- [ ] Founder confirms on story detail, profile and feed
- [x] Pipeline rule: `story-draft.md` says one sentence, two at most (`rule-present story-unit` RESOLVE)
- [x] Tests: unit 400 files pass; e2e p1141 + p1296 quote tests pass. 2 p1296 "Go back → /feed" tests fail identically on main (pre-existing)
