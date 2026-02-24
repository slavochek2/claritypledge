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

## Decisions Made (2026-02-24)

- **Timing**: NOT during an active paraphrasing round — too disruptive. Trigger between rounds or from the session review screen (natural pause).
- **UX**: Bottom-sheet overlay over `/live`. NOT a redirect. User stays in the /live context. `StoryGuideChat` (P425) must be embeddable as an overlay — this is a hard constraint in P425's design.
- **Who triggers it**: The user who took a position (the listener who disagrees). Manual trigger — they tap a CTA.
- **Session behaviour**: /live session pauses (waiting room state) while user files. Partner sees a waiting state. After story is filed, user returns to /live. Their newly filed story is immediately available to propose to their partner for verification — this is the whole point of filing it mid-session.
- **Is this the right tool?** Yes for position-backed disagreement. "Flag for discussion" is a separate concern (no story needed). Filing = turning disagreement into calibratable content.

## Where in /live the trigger appears

- **NOT during a round** — position-taking and story-filing during an active paraphrase round is out of scope.
- **Between rounds / session review** — after a round completes, if the user staked a position with no linked story, a soft CTA appears: "You took a position on this point. Want to file a story before the next round?"
- **Starter screen** — before the session begins. User can file stories on any of the session's points.

## Exit dialog (current behaviour — keep as-is)

The current `/live` exit dialog reads:
> **Leave session?** — Are you sure you want to leave this session? Your progress will be lost.
> `[Cancel]` `[Leave]`

This is sufficient. Do not change until P428 ships — at that point the overlay removes the need to exit at all.

## Open Questions (remaining)

- Exact CTA placement in the session review screen (between rounds)
- What "waiting state" the partner sees while the other user is filing
- Whether the filed story auto-appears as a proposal in the current round or only in future rounds

## Prerequisite

- P425 must ship first (`StoryGuideChat` component with `onDismiss` prop and no page-navigation coupling)
- Run `/create-prd` when ready to move from concept to spec

## Related

- P425: AI Story Core Loop — the embeddable loop this triggers
- P419: Filing Chat V1 — standalone entry (post-session equivalent)
- `/live` exit dialog: `clarity-live-page.tsx:2778`
