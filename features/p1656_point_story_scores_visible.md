---
status: backlog
type: story
rank: 326
workstream: points
created_date: '2026-11-10'
tags: [points, stories, quality-signals, feedback]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1656: Point-ness and story-ness shown on every point and story

## Problem

**Situation:** A point is something you take a position on, and a story is something you comprehend (`docs/story-point-model.md`, "The two axes"). Anyone can type a point or a story, and AI agents (the canvas mirror, Clarify, the points pipeline) write them too. Nothing shows anyone how well an item fits its kind.

**Complication:** At the Sales Mastermind UAT (2026-11-09/10) the founder could not take a position on the Clarity Canvas points in production: "It says customer segments, teams across sales, marketing, blah, blah, blah. I cannot disagree with that." A March audit found 7 of 9 production points failing the project's point-quality criteria (decisions.md 2026-03-18: falsifiable, counterfactual, hard-to-vary, stranger test). Low-point-ness points look exactly like good ones, so neither the author nor the reader can tell.

> Founder, 2026-11-10: "There is no feedback right now on pointiness and storyness. Maybe that is the thing that is missing."
> Founder, 2026-11-10: "a story should be ideally high on storiness and low on pointiness and otherwise too … I think this should be visible for all stories/points anywhere, not just at creation step … the info icon near score would explain how it works (explaining dimensions to be scored on and process/formula if needed with link to learn more page …)"

**Question:** Do we show two scores (point-ness, story-ness) on every point and story, as feedback that never blocks, with an explanation one tap away?

## Appetite

Blast radius: medium. It touches every point and story card, and a wrong score on someone's published words is visible to everyone. Reversibility: medium. Scores can be hidden, but a stored scoring history and any learned behaviour outlive the UI. Decision density: several founder calls (below).

## Prior rulings this reverses or builds on

- **P550 (2026-03-18, rejected 2026-03-21, superseded by P563):** the same idea ("visual quality indicators for points and stories") was rejected because quality should emerge from how people engage, not from an AI score; engagement depth ("4 verified · 6 unverified") was to replace AI quality scores (decisions.md 2026-03-21). P563 is also `status: rejected`; no engagement-depth display was found in the card components (searched 2026-11-10, UNVERIFIED as complete). **This spec reverses that 2026-03-21 ruling by founder request (2026-11-10).** The founder's reason is the 2026-11-09 UAT: without any signal, weak points reach people who then cannot take a position, and engagement only shows that after the fact. Founder confirmed the reversal, 2026-11-11.
- **The 2026-03-18 ruling** put scores in front of authors and "optionally" readers. Showing them to everyone goes beyond it (Open Question 1).
- **P618** (archived, "Operationalize point falsifiability") asked the same question; read before `/dev`.
- **P544 / decisions.md 2026-03-18:** "Quality criteria are feedback signals, not publication gates." "Gating contradicts the epistemology — Popper doesn't gate conjectures." This survives and is an Invariant here.
- **`docs/story-point-model.md`:** two independent axes, not one scale. High on both means decompose; low on both is an exit (phatic or a control move), not a verdict. The operational scoring is labelled UNTESTED.

## Invariants

- A score never blocks publishing, positions, sharing or anything else (P544).
- The two scores are two separate numbers, never collapsed into one "quality" value (story-point-model.md).
- A score is the system's estimate, labelled as such. It is never shown as someone's position or as a judgement by a person (P1631: "An agent's guess is never someone's position").

## Solution

1. **Two scores on every point and story card, everywhere they render, shown to the item's author only at launch** (founder, 2026-11-11). Readers see them only if Decision Criterion 1 is met and the founder then decides so. Initial inventory (UNVERIFIED as complete; `/dev` extends it and the extended list is added to this spec before building): the feed's point and story cards, point detail, story detail, Clarity Canvas boxes, point cards in chats (P1631), the event room's statements, profile Points and Stories tabs. A surface left out needs `[FOUNDER DECISION: scope]`.
   - **Unit:** a stored point or story is scored as one move. The model scores conversational moves, "not a whole speaking turn"; a long story may need its own treatment `[FOUNDER DECISION]`.
   - **Low on both** shows "Not scored: a question, greeting or request" rather than two low numbers (the model's exit, not a verdict).
   - **High on both** shows the model's own suggestion: split it into a point and a story.
   - **Pending or failed scoring** shows "Score pending" or nothing; publishing and reading never wait for it.
2. **An info icon beside the scores** explains the two dimensions in plain words, what a good point and a good story look like, how the score is made, and that it never blocks. It links to a learn-more page. `[FOUNDER DECISION: learn-more target — a page in the app, or the open-source docs/story-point-model.md on GitHub]`.
3. **Feedback at creation, points and stories alike:** once the author pauses typing (debounced, never per keystroke), the scores update and one suggestion appears `[FOUNDER DECISION: suggestion copy, e.g. "This reads like a description; what would someone disagree with?"]`. The author can publish anyway.
4. **Scoring:** one model call per item version, stored with the version so a reworded item is rescored and an old score never sits on new words. The rubric is the story-point model's axes; its exact form is `/dev`'s call, tested against a labelled sample before launch.
5. **Agents use the same scorer** on what they write (canvas mirror, Clarify, points pipeline), so their output is measured by the rule people see. Because agents can be tuned to the scorer, their items are reported separately in Decision Criterion 2.
6. **Existing items:** `[FOUNDER DECISION: score all existing points and stories once (backfill), or only new and edited ones]`; the backfill's cost goes in the Cost Budget.
7. **Privacy:** every scored item, private ones included, is sent to the scoring model. `src/app/content/privacy.md` says so before launch.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A visible low score on someone's words reads as public shaming | MITIGATE | Open Question 1; the info text says it describes the form of the words, not their truth or the person |
| The scorer is wrong or inconsistent, and the UI makes it look authoritative | MITIGATE | Labelled sample with founder-checked labels before launch; the info text says it is an estimate |
| Scoring cost on every item and every edit | MITIGATE | Cost Budget below; score on publish and on save, not per keystroke |
| People game the score instead of writing honest points | ACCEPT | Feedback, not a gate; watch it |
| The operational model is UNTESTED | ACCEPT | This spec is a test of it; Decision Criteria below |

**Non-Goals**
- Do NOT block or hide any item because of its score.
- Do NOT rewrite existing items automatically.
- Do NOT change positions, comprehension or letter flows.

## Cost Budget

Not yet filled, and required before `/dev` starts: `docs/technical/metered-services.md` wants arithmetic per user, per hour and per test run, the present limit and a 10× verdict. Inputs: one call per item version on save, the debounced creation calls, the backfill (if chosen), retries and agent calls. Production item counts and edit rates are to be measured, not guessed. `[UNVERIFIED: counts]`

## Decision Criteria

1. **Is the scorer good enough to show?** On a sample of at least 30 real items with at least 10 in each band (low, medium, high), so a scorer that always answers "low" cannot pass: it agrees with the founder's point-ness labels in at least 80% of cases. Story-ness is about the author's own experience, which only the author can confirm, so its labels come from the item's authors where they can be asked, and the founder's otherwise, marked as such. Below the bar, it stays author-only.
2. **Does it change writing?** A frozen copy of the scorer rates a random, human-labelled sample of people's (not agents') new points from the 4 weeks before and after launch. A rise of at least 15 percentage points in high point-ness counts as a change; less does not.

## Acceptance Criteria

- [ ] Every point card and every story card shows a point-ness and a story-ness score, on every surface listed in `/dev`'s enumeration.
- [ ] Tapping the info icon explains both dimensions, says the score is an estimate that never blocks, and links to the learn-more target.
- [ ] Writing a point, and writing a story, shows its scores and one suggestion before publishing; publishing works whatever the score.
- [ ] When scoring fails or is slow, the item publishes and reads normally and shows "Score pending" or no score.
- [ ] A greeting or a question shows "Not scored", not two low numbers.
- [ ] The privacy policy says items are sent to a model for scoring before the scores appear.
- [ ] Rewording an item shows new scores for the new words.
- [ ] A point and a story the founder labelled show scores matching the labels (Decision Criterion 1 met), evidence attached.

## Open Questions

1. ~~Who sees scores at launch?~~ Decided 2026-11-11: the author only.
2. Numbers, words ("strong point"), or a small two-axis marker?
3. ~~Confirm the reversal of the 2026-03-21 ruling.~~ Confirmed 2026-11-11.
4. Score existing items once, or only new ones?

## Priority

Founder, 2026-11-11: low urgency, medium importance, medium confidence. Not before the first Sales Mastermind session, and after P1658 (canvas points written as claims), since scoring descriptions would mostly label every canvas low.

## Related

P544, P550, P563, P564 (archived prior art) · `docs/story-point-model.md` · `.claude/commands/slava/content/sifter-point.md` · P1631 (points need a position to publish) · P1658 (canvas box rules) · P1657 (owner positions before canvas publish) · P1529 (the UAT where this came up).
