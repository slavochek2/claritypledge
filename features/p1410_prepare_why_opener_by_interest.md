---
status: backlog
type: story
rank: 313
workstream: events
created_date: '2026-10-04'
tags: [prepare, onboarding, content]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1410: /prepare opens with a "why" the visitor picks — scenario clips by interest

## Problem

`/prepare` (P1402) opens with one line of "why" and goes straight to the understanding story. The
founder wants the visitor to see why it matters to *them* first.

> Founder, verbatim (2026-10-04): *"in Manifesto we described multiple scenarios … we can try to
> one-shot like 30, 50 seconds clips … or maybe they select what they're interested, you know,
> they're interested to improve their personal relationships, their professional relationships …
> the idea is they need to know why before, and it's important to know why."*

## Appetite

Blast radius: low (an opening step on one page). Reversibility: high. Decision density: many
(which interests, which scenarios, clip vs text, who makes the clips).

## Solution

An optional first step: "What do you want to improve?" with a few interests (for example personal
relationships, work). Each choice shows one short scenario, as text first and a 30-50 s clip later,
drawn from the manifesto's §II scenarios (`src/app/content/full-article.md`: families,
friendships, intimate relationships, the bridge example). Then the steps continue as today.

[FOUNDER DECISION: the interests offered, and which scenario goes with each.]
[FOUNDER DECISION: text-only first, or wait for clips.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An extra step before the story lowers completion | MITIGATE | Make it skippable; measure starts vs story completions |

**Non-Goals**
- Do NOT change the four existing steps.

## Acceptance Criteria

- [ ] A visitor on `/prepare` can pick an interest and sees a scenario for it before the story, or skips it

## Related

- [P1402](p1402_standalone_prepare_page.md) · [P1025](p1025_self_serve_protocol_onboarding.md)
