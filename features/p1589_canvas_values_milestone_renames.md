---
status: qa
type: task
rank: 70
workstream: clarity-canvas
created_date: '2026-10-28'
tags: [canvas, sales-mastermind]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1589: Rename "My values" and "How I'll know it's working"

## Problem

> "We're talking about guiding value for the business, for example, intellectual honesty for my business... it's not the personal value, it's the values for the business... It's the culture." (founder, 2026-10-28)
> "The test is also if other people can interiorly live it together with you or not. and if it advices where to sacrifize and why?" (founder, 2026-10-28)
> "my next milestone is probably better." (founder, 2026-10-28)

"My values" invites personal life choices, which nobody else can live with you. "How I'll know it's working" invites vague signals instead of a concrete next step.

## Appetite

Low blast radius: two display titles. Reversible by git revert. Zero open decisions (founder approved both titles and both shapes 2026-10-28).

## Solution

Titles only, tags unchanged (as in P1535, P1581):
- `canvas:love` → "Guiding values"
- `canvas:metrics` → "My next milestone"

## Handoff to P1536 (draft canvas from owner material)

P1536 keeps its own per-box meaning/good/not/question rows (`supabase/functions/_shared/canvas-draft.ts` on its branch). When it takes these titles, update three rows to the founder-approved shapes:

- **Guiding values** (`canvas:love`): a guiding value for the business, one the team and partners can live by with you, that says what to give up when two good things conflict, and why. Shape: **"X over Y, because Z."** Good: "Intellectual honesty over winning the argument, because decisions built on hidden misunderstandings fail later." Not: a personal life choice, or a word with no cost ("integrity"). Question: "What does your business choose over something else it cares about, and why? Write it as 'X over Y, because Z'."
- **Problem** (`canvas:problem`): problemify shape, where the customer is, where they want to be, and the obstacle. Shape: **"[Customer] wants [B], but [obstacle]."** Not: a fix in disguise ("there's no app for X"); if the material names a solution, ask what the customer is trying to reach.
- **My next milestone** (`canvas:metrics`): the next concrete step that shows you're on the right path, with a number and a date where possible.

Material rarely states values; the draft leaves the box empty and asks the question rather than inventing one.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Existing points under the two boxes no longer match the new wording | ACCEPT | TEST canvases only; the founder's and the two example canvases are being rewritten in the new shapes |

- Do NOT change tag keys, box order or layers.
- Do NOT edit the P1536 branch from here (another session owns it).

## Done-When

- [x] `CANVAS_BOXES` carries "Guiding values" and "My next milestone"; tags unchanged.
- [x] Unit and e2e title assertions updated; unit tests pass.
