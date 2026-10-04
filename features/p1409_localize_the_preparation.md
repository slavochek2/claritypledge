---
status: backlog
type: story
rank: 312
workstream: events
created_date: '2026-10-04'
tags: [prepare, localization, video]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1409: Localize the preparation — language switcher, translated text, dubbed clips

## Problem

**Situation:** The preparation runs in two places, the event room's `/events/:slug/prepare`
(P1336) and the standalone `/prepare` (P1402). Both are English only: step copy, the statements
(cmp7, misunderstanding, the event's tag), the clips' audio, and their transcripts, which P1402
makes always visible under each clip. The app has no i18n layer (no library in `package.json`).

**Complication:** Attendees and visitors who do not read English comfortably cannot follow the
explainer. Some people already need to read the transcript rather than listen (founder UAT,
2026-10-04), and an always-visible transcript is the natural place for a language switcher.

**Question:** What does a localized preparation contain, and in what order do we build it: text,
transcripts, then audio?

> Founder, verbatim (2026-10-04): *"maybe you file a separate localization task for specifically
> prepare because prepare in the within event room and here because it might include also when
> they switch and making audio of the video into different languages."*

## Appetite

Blast radius: medium. Both preparation surfaces and the shared clip and statements pieces.
Reversibility: high (additive: English stays the default). Decision density: many (which
languages, who translates, dubbing method and voice, whether statements are translated).

## Solution

A language switcher on the preparation, shared by both surfaces, that changes:
1. the step copy;
2. each clip's transcript;
3. each clip's audio, via a dubbed track or file per language;
4. optionally the statements' text.

[FOUNDER DECISION: which languages first.]
[FOUNDER DECISION: whether statements (points) are translated, since a position is taken on the
exact wording, or stay in their original language.]
[FOUNDER DECISION: dubbing method, e.g. the founder's own voice cloned vs a neutral voice vs
subtitles only.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A translated statement changes its meaning, so positions on two wordings get pooled | DEFER | Needs the statements decision above |
| A dubbed clip is served from a host the production CSP blocks | MITIGATE | Upload to the media bucket and build URLs with `publicMediaUrl()` (see Invariants) |
| Machine translation of the founder's words reads wrong | ACCEPT | Founder reviews each language before it is switchable |

**Non-Goals**
- Do NOT localize the rest of the app; this is the preparation only.
- Do NOT change the English content or the step order.

## Invariants

- Public media (dubbed audio or video, translated posters) lives in `gs://claritypledge-story-images`
  and is addressed through `publicMediaUrl()`; production CSP allows no other media origin
  (decisions.md 2026-10-01, P1336/P1385).

## Acceptance Criteria

- [ ] On both `/prepare` and an event's preparation, a visitor can switch language, and the step copy and transcripts change
- [ ] With a dubbed language chosen, each clip plays its dubbed audio
- [ ] English stays the default, and nothing changes for someone who never switches

## Open Questions

1. Founder, 2026-10-04: should the transcript be a reading-optimized summary rather than the
   verbatim transcript? *"Should it be optimized for reading or you want a proper transcript?"* —
   answer this before translating, so the same text is translated once.

## Related

- [P1402](p1402_standalone_prepare_page.md): standalone `/prepare`, always-visible transcripts
- [P1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md): event preparation
