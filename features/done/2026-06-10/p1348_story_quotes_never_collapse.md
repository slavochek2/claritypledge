---
status: all-done
type: task
rank: 10
workstream: disagreement-pipeline
created_date: '2026-09-22'
tags: [stories, quotes, embeds, disagreement-pipeline]
disclosure: public
flow: inline
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
completed_at: 2026-09-22
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
- [x] Story detail, profile and feed show quotes with no fold control at 375px and 1280px (headless, test DB: story 7 timecodes, profile 4, tagged feed 31; 0 fold buttons). Founder asked to ship 2026-09-22
- [x] Pipeline rule: `story-draft.md` says one sentence, two at most (`rule-present story-unit` RESOLVE)
- [x] Tests: unit 400 files pass; e2e p1141 + p1296 quote tests pass. 2 p1296 "Go back → /feed" tests fail identically on main (pre-existing)

## Resolved Decisions

**Adversarial review 2026-09-22, 3 of 3 reported** (Opus, Gemini 3.8 Flash, Codex Sol). Fixed:
- Rule wording could read as "put the quote in prose" (Gemini, Codex BLOCK): now "attach as the quote block, never inside the prose".
- Stake e2e lost its "a click inside the card does not navigate" guard (Gemini BLOCK): restored on a timecode.
- Profile and feed not browser-checked (Codex BLOCK): checked, see Done-When.
- Two tests became empty after the heading replaced the toggle (all three): removed.
- Stale comments, a dead wrapper, `aria-labelledby` on the list, the story-craft restatement, the p1141 e2e now waits for a timecode, and a third copy of the old rule in `docs/points-process.md`.
Accepted: taller feed cards and more tab stops (product choice). Deferred: the compact embed shows no video or quotes (unchanged behaviour).
