---
status: qa
type: task
rank: 91
workstream: design
created_date: '2026-10-02'
tags: [design-system, ui, consistency, buttons]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, inline]
drafted_by: opus
exec_model: opus
exec_effort: low
driver: heuristic
related:
  - p1308
---

# P1393: Design-system sweep — private signal, one blue, button rules

Filed retroactively: the work was done inline on a prototype branch, each decision approved by the
founder from `/tree` A/B pages, then registered here so `/ship` can land it.

## Problem

A read-only sweep of `src/app/` against `docs/design-system.md` found ~15 clear violations: amber as
the "private" signal in six components, amber/orange/yellow/purple on live screens, a green clickable
Agree button, five different active-tab styles, a second brand blue (`#0044CC`) across ~50 files,
and no rule at all for button style or placement.

> Founder framing, verbatim: "did you reflect on how butotns should be where white where a link
> where to psotion and when filed when not .. i think there was many confusions also where to
> aligne d them.. how ot make decision of hierearchy etc"

## Appetite

Blast radius: medium (visual only, many screens). Reversibility: git revert. Decision density: four
founder calls, all made (below).

## Solution

Founder decisions, each made from a `/tree` comparison page:
- Private = gray tint + lock (option A on `/tree/design-private`).
- Certificates keep their paper palette (cream, navy frame, ink); heading accent becomes app blue.
- "Why not fix all" → the whole app uses one blue (`blue-600`); avatar palette and confetti excluded
  as per-user data.
- Seven button rules (`/tree/design-buttons`), including red for loss actions inside popups, written
  into `docs/design-system.md` § Button Decision Rules and applied.
- Settings account deletion sits in a "Danger zone".

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Colour-only edits on screens not visually re-checked (auth-gated) | ACCEPT | Class swaps only; full vitest green; founder reviewed in Chrome |
| `#002B5C` navy primary buttons (P1308) still differ | DEFER | Founder brief treated `#002B5C` as certificate navy; P1308 owns it |

**Non-Goals:** Do NOT change avatar colour data or the avatar palette. Do NOT delete `/tree` pages.

## Done-When

- [x] No amber/orange/yellow/purple on prod-reachable surfaces (grep, `/tree` and prototypes excluded)
- [x] Private stories, points and doc banners render gray + lock
- [x] `#0044CC`/`#0033AA` gone from UI code outside avatar data, confetti and test fixtures
- [x] Feed, Stake, Profile, Letters, Org tabs share one blue active style; bottom nav on `blue-600`
- [x] Button Decision Rules in `docs/design-system.md`; Cancel is ghost in 13 dialogs; View All
      Pledgers is a link; letter Overwrite is outline; point-page story toggles are action pills
- [x] Full vitest: 482 files / 5344 tests passed