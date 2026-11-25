---
status: week
type: story
rank: 358
workstream: strategy
created_date: '2026-11-25'
tags: [high-stakes, prototype, tree]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1721: Meeting-stakes prototype on /tree, shipped and paused

## Problem

**Situation:** A DEV-only prototype at `/tree/meeting-stakes` asks a host to pick their next high-stakes meeting (or type one), set the five dimensions from P1727 on a 1–5 bar, and see the impact: High, Some or Low stakes, with a "Try a check in this meeting" link to /live.
**Complication:** On trying it, the founder doubted it does its job:

> "whatever is selected shown to me back. What's the point of this and why does it have three steps? ... the idea was originally to say kind of inspire people to realize what is high stakes and what meetings and why so ... they are motivated to go a bit deeper, but is it fulfilling this role or not"

It does not. The result only restates what the host entered, so it tells them nothing new.
**Question:** Keep the work on main as a /tree prototype and pause until the purpose is tested with real people.

## Appetite

Low blast radius: a DEV-only route under /tree, not on prod. Reversible with git revert. No decisions are needed to ship. The open decisions below only matter if the work resumes.

## Solution

Ship the built prototype to main as is, linked from /tree, DEV-gated. Then pause.

If resumed, in this order:
1. Show the current page to 2–3 real people and watch whether anything changes how they see their meeting.
2. Likely direction: a mirror with a surprise. The person picks a meeting and gets a short real failure story for that kind of meeting plus the dimensions that usually make it risky. No sliders.

[FOUNDER DECISION: the high-stakes threshold. The placeholder is serious damage high plus one more dimension high.]
[FOUNDER DECISION: the hint under each dimension, all copy, and the CTA wording and target.]
[FOUNDER DECISION: one true short story per meeting type, if direction 2 is taken.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A prototype that does not inspire sits on main | ACCEPT | DEV-only, not on prod; it is the record of what was tried |
| Placeholder threshold read as a decided rule | MITIGATE | Marked as a founder decision here and in `model.ts` |

**Non-Goals**
- Do NOT expose the route on prod.
- Do NOT iterate on the form before the people test in step 1.

## Done-When

- [x] /tree links to /tree/meeting-stakes in DEV; three steps: meeting, five bars, impact — 88 unit tests pass, browser-checked on :5210
- [x] No money, ROI, Clear or meeting list; Continue says what is missing — reviewed by Gemini and Codex over 5 rounds, visual QA 1 of 1
- [x] The pause and the lesson are recorded in this spec

## Lesson

Five review rounds went into button states, focus and screen-reader details before anyone checked that the page does its job. Next time, show the rough version to one real person first.

## Related

- P1727: the five dimensions this page uses
