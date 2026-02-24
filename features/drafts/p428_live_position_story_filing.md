---
status: backlog
type: story
rank: 125472.0
workstream: C1
tags: [live, filing, stories, calibration, position]
created_date: '2026-02-24'
---

# P428: /live Position → Story Filing (Draft)

## Concept

During a /live paraphrasing round, a listener may reach a point of strong disagreement they feel unable to set aside in order to continue paraphrasing. Currently there is no outlet for this: they can give a poor paraphrase (which the speaker will rate low and the session stalls), or they can push through despite the disagreement.

The opportunity: if the listener can stake a position AND file a supporting story during or immediately after the /live session, they transform a calibration blocker into a calibration artifact. The disagreement becomes content.

## Why this is NOT in P425

P425's position → story prompt fires inline on the `point-detail-page`. In /live, the participant is inside the calibration session UI — not on a point-detail page. The trigger mechanism, UX, and flow context are all different.

## Open Questions (must resolve before spec-ing)

- **Timing**: during the paraphrasing round, or as a post-session summary step?
  - During: high friction, breaks session momentum
  - Post-session: lower friction, but disagreement context may be cold
- **UX**: side panel? full redirect? post-session queue?
- **Who triggers it**: the listener who disagrees? the facilitator? automatic if rating < threshold?
- **Does the /live session pause or continue** while the story is being filed?
- **Is this the right tool?** Strong disagreement during /live might be better handled by a mediation or "flag for discussion" mechanism rather than a solo filing flow.

## Prerequisite

- P425 must ship first (core loop exists)
- Run `/create-prd` when ready to move from concept to spec

## Related

- P425: AI Story Core Loop — the loop this would trigger
- P419: Filing Chat V1 — standalone entry (post-session equivalent)
