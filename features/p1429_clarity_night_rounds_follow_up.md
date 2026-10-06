---
status: week
type: task
rank: 20
workstream: events
created_date: '2026-10-06'
tags: [events, rounds, privacy, review-findings]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1429: Clarity Night — the five review findings held back at ship

## Problem

**Situation:** P1337 (rounds) and P1389 (closing sequence) shipped for Clarity Night #2 on 2026-10-06.
A Codex code review that day found 1 HIGH and 6 MEDIUM issues. Two were fixed before shipping (the
Next-round confirm carrying over between rounds; the event-page groups never refreshing).
**Complication:** The other five were held back to ship on the event day. None breaks an evening;
one is a privacy defect.
**Question:** Fix the five, privacy first. The walkthrough-9 build items are P1430.

> Founder, on shipping: "we can bring everything to the prod and the rest can be fixed now … as follow-up"

## Appetite

Blast radius: medium. A1 touches topic-vote privacy. A2 changes a host-only database function that
/meet also reads. Reversibility: A1 and A2 are migrations, the rest is code. Decision density: zero.
Every item is a defect fix.

## Invariants

- A voter who hides their photo stays hidden. No vote written before or after the choice, from any
  device, re-exposes them (decisions.md, the topics privacy entry: "Voters can hide their photo").
- Host-only marks (prepared, mic, arrival, and the event page's In / Out / Undecided groups) never
  render for a non-host or on /meet. The room roster's own opted-in lists and N/10 are public on
  purpose and stay as they are.

## Solution

1. **A1. Topic-vote photo race (HIGH).**
   - `handleRate` sends the `showPhoto` value captured at tap time (`topic-parts.tsx` ~416), and
     `rate_topic` overwrites `is_public` on every vote (p1347 migration). A slow vote lands after
     "Hide my photo" and re-exposes the voter.
   - Two more paths reach the same write: the guest-votes flush after sign-in, and the `knownPublic`
     effect resetting `showPhoto` from an older load.
   - **Fix (server-side):** a per-user photo preference that `rate_topic` reads, ignoring the client's
     flag. A client-only fix cannot cover a second tab or device.
2. **A2. People who answered only in the room show as Undecided on the host's event page.**
   - The room→prep trigger (`p1336_room_opt_in_to_prep`) only updates existing prep rows, and the
     host view reads prep rows only.
   - **Fix:** `get_event_prep_host_view` also returns the room's `opted_in` / `comprehension_rating`
     for the person, and the client prefers it.
   - Do NOT make the trigger insert prep rows. That would mark people "prepared" who never were.
   - Room members without a profile cannot be matched to a participant; they stay out of the event
     page, as today.
3. **A3. Reopen does not reach phones after start + 12h.**
   - Past the grace window, RoundCard polls only while it has seen a live round (`!ended || liveSeen`),
     so a phone on Close never sees the new round.
   - **Fix:** after the evening ends, keep polling every 60s while the tab is visible, for up to 6
     hours after the last round ended.
4. **A4. The pinned room header ignores the offline strip and assumes a 49px capture bar.**
   - **Fix:** measure the nav, the offline strip and the capture bar, and offset from those
     measurements.
5. **A5. A lost response in the closing sequence traps retries.**
   - `answer_personal_ask` and `join_community_from_close` raise `23505 'already answered'` on a retry
     whose first call landed; the client shows "Could not save" and stays.
   - **Fix:** treat 23505 from those two calls as success and move on, after a re-read of the close
     state.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A2 changes a function /meet also reads (useHostPrepMarks) | MITIGATE | New fields only; AC checks /meet renders nothing new |
| A1 migration changes how existing votes read their photo setting | MITIGATE | Backfill the preference from each user's latest vote |
| A3 polls in tabs left open | ACCEPT | Visible tab only, 60s, capped at 6h |

**Non-Goals**
- Do NOT change the closing sequence's questions or order.
- Do NOT make the room→prep trigger create prep rows.

## Acceptance Criteria

- [ ] A1: a failing test first. Then a star vote still saving when "Hide my photo" is tapped leaves the
      photo hidden, and so does a vote from a second tab.
- [ ] A1: votes flushed after sign-in respect a photo already hidden.
- [ ] A2: someone who answered only in the room appears under Opted in or Opted out, with N/10, on the
      host's event page. /meet renders nothing new.
- [ ] A3: a phone on Close more than 12h after the start moves off Close within about 60s of Reopen.
- [ ] A4: with the offline strip showing, and while transcribing, the step bar stays fully visible
      while scrolling Compare at 375px.
- [ ] A5: when a "Not now" or "Join" lands but its response is lost, the retry moves on instead of
      showing "Could not save".

## Related

- P1430: walkthrough-9 build items (split from this spec on review)
- P1337, P1389 (shipped); P1336 / P1386 (prep and host marks); P1347 (signed-in votes)
