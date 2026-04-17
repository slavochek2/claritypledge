---
status: week
type: story
rank: 1000745.0
workstream: C2
created_date: '2026-04-17'
tags: [letters, live, injection, author-trigger]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P745: Letter-hosted /live injection with pause/resume

## Problem

**Situation:** A registered receiver filling a Clarity Letter reaches /live only by completing the letter, going to their inbox, and acting on a `clarity_live_invite` sent by email (P703). The sender cannot initiate /live while the receiver is mid-letter.

**Complication:** The motivating workflow is "author is with the person, wants to start /live *now*" — whether that person is reading story 1 or rating point 3. Routing through inbox adds an email round-trip, breaks letter flow, and forces the receiver out of their reading state.

**Question:** How does the author trigger a /live session for a receiver who is currently reading a letter, without the receiver having to leave and return via inbox?

## Appetite

Medium blast radius (new banner surface in letter reader; letter reader gains a pause/resume state machine; author gains a new trigger affordance). Medium reversibility (feature-flaggable; new rows in `clarity_live_invites` but no schema change beyond what P703 already added). Medium decision density (realtime vs polling for banner arrival; banner placement; accept-vs-defer semantics).

## Solution

1. **Author trigger:** From the sender's letter-progress view (inbox row or results page for a specific recipient), add an action: *Start Clarity Live with this reader now*. Creates a `clarity_live_invite` row tied to the delivery.
2. **Receiver banner:** In the letter reader, poll (or subscribe) for pending invites for the current delivery. When present, render a banner below the current story/point: *"{senderName} wants to start Clarity Live now — Join / Later"*.
3. **Pause/resume:** When the receiver accepts, record the current story index + scroll position on the delivery, open /live (leveraging existing P703 / P733 preload for registered users). When /live completes, redirect back into the letter at the saved position.
4. **Decline/defer:** If the receiver chooses *Later*, dismiss the banner for N minutes but leave the invite open so they can still find it in inbox after the letter.
5. **Cancel:** Author can cancel an outstanding invite from the same surface that created it.

## Risks / Non-Goals

### Risks
- **Realtime vs polling tradeoff.** Realtime gives instant arrival but adds a new subscription surface (per P743 memory, Realtime today only lives on /live). **Mitigation:** ship v1 with 15-second polling on the letter reader; measure perceived lag; upgrade to Realtime only if the UX is visibly laggy.
- **Pause/resume correctness under edge cases.** Receiver closes the tab mid-/live, reloads mid-letter, or has multiple tabs open. **Mitigation:** persist saved-position on the delivery row, not in memory; reconciliation happens on letter-reader mount.
- **Invite spam.** Author re-triggers multiple times. **Mitigation:** one outstanding invite per delivery — re-trigger reuses / resets the existing row.

### Non-Goals
- **Do NOT** extend injection to unverified guests in this spec — F3 (P747) handles that path after this primitive is validated.
- **Do NOT** build pre-configured injection points (letter-template setting "force /live after story 3") — observe first, codify later.
- **Do NOT** change P703 or P733 behavior — letter-sourced /live preload is consumed as-is here.
- **Do NOT** ship a cohort / workshop / group-pacing surface — that is F2's territory (P746) and even there, not workshop orchestration.
- **Do NOT** remove or replace the inbox-based invite flow — this is an additive surface, not a replacement.

## Done-When

- [ ] Registered receiver reading a letter sees a banner within ~15s of the author triggering an invite for that delivery
- [ ] Accepting the banner opens /live preloaded from letter data (via existing P703/P733 path) without leaving the letter URL's logical flow
- [ ] Completing /live returns the receiver to the same letter at the same story index they were on when they accepted
- [ ] Deferring the banner dismisses it locally and the invite remains findable via inbox
- [ ] Author can cancel a pending invite; the banner disappears on the receiver side within ~15s
- [ ] Only one outstanding invite exists per delivery at any time
- [ ] Unverified guest on a public letter sees **no** injection banner (guest path is explicitly out of scope here)

## UX Notes

**Banner placement:** below the current story card / point card, above the continue-reading CTA. Sticky while visible. Dismissible.

**Banner states:**
- *Pending*: `{senderName} wants to start Clarity Live now` — primary *Join now*, secondary *Later*
- *Dismissed*: hidden, restored if the author re-triggers
- *Cancelled by author*: toast-level notice, no persistent UI

**Pause/resume UX:**
- Accepting transitions the letter reader into a *paused* state (not closed). On return from /live, the reader hydrates at `saved_story_index` with a brief *Welcome back* affordance.

**Author trigger:**
- Lives on the sender-side surface where a specific recipient is identifiable (inbox row for a `recipient_in_progress` delivery; letter results page drilled into one recipient).
- Disabled if the receiver has not yet opened the letter, or if a pending invite already exists for that delivery.

## Acceptance Criteria

- [ ] Author can start a /live session for an identified registered recipient from a per-recipient surface
- [ ] Receiver sees the banner while actively reading the letter
- [ ] Accept → /live runs with preloaded positions → return to letter at saved position
- [ ] Defer → banner dismisses locally; invite persists
- [ ] Cancel → banner disappears on receiver side
- [ ] Exactly one outstanding invite per delivery
- [ ] Regression: inbox-based invite flow (P703) continues to work unchanged for letters the receiver has already completed

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Banner title | `{senderName} wants to start Clarity Live now` | Letter reader, when invite pending |
| Primary button | `Join now` | Banner |
| Secondary button | `Later` | Banner |
| Author trigger label | `Start Clarity Live now` | Sender per-recipient surface |
| Author trigger disabled tooltip | `Invite already pending` | When invite exists |
| Return affordance on letter re-entry | `Welcome back — continuing your letter` | After /live completes |
| Poll interval | 15s | Letter reader while loaded |
