---
status: rejected
type: story
rank: 1000702.0
tags: [letters, live, verification, dispatch, notifications]
created_date: '2026-04-13'
superseded_by: p703
---

# P702: Verify Live from Dispatch — Pre-loaded /live + Inbox Invite

> **Depends on:** [P700](../done/2026-04-22/p700_letter_results_aggregate_overview.md) (dispatch board — the entry point), [P699](p699_letter_results_story_walk.md) (RPC pattern)
> **Supersedes:** [P663](p663_letter_live_interleave.md) (rejected — pre-loaded /live concept from letter reading flow)

## Problem

P700 gives the facilitator a read-only dispatch board showing where all participants stand. But the facilitator can't act on it — there's no way to start /live pre-loaded with letter data, and no way for the selected listener to know they've been invited to verify.

## Appetite

Scoped after P700 ships. Two concerns: (1) pre-loaded /live session creation from letter data, (2) inbox notification for the listener to join.

## Solution

TBD — design after P700 ships. Key concepts from planning conversation:

**Pre-loaded /live:** Facilitator taps "Verify" on dispatch board for a specific listener + point. /live session starts with story selected, point selected, both parties' letter predictions pre-filled. Session begins at paraphrase step — listener paraphrases, speaker rates. Both enter free mode with sliders after.

**Inbox invite:** Temporary notification item appears at top of listener's letter inbox. Reuses existing notification badge counts (mobile + desktop menus, inbox tab). Invite disappears when /live session ends or facilitator cancels.

## Risks / Non-Goals

### Non-Goals
- Do NOT build until P700 is shipped and validated
- Do NOT add real-time push notifications — polling or page-load check is sufficient
- Do NOT build group /live (multiple listeners simultaneously)

## Done-When

- [ ] Facilitator can start /live from dispatch board for a specific listener + point
- [ ] /live session starts pre-loaded with story, point, and both parties' letter data
- [ ] Listener sees temporary invite in their letter inbox with join button
- [ ] Invite disappears when session ends
- [ ] Notification badge counts update to reflect pending invite
