---
status: qa
type: task
rank: 20
workstream: events
created_date: '2026-10-06'
tags: [events, rounds, privacy, review-findings]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

- [x] A1: a failing test first. Then a star vote still saving when "Hide my photo" is tapped leaves the
      photo hidden, and so does a vote from a second tab.
- [x] A1: votes flushed after sign-in respect a photo already hidden.
- [x] A2: someone who answered only in the room appears under Opted in or Opted out, with N/10, on the
      host's event page. /meet renders nothing new.
- [x] A3: a phone on Close more than 12h after the start moves off Close within about 60s of Reopen.
- [x] A4: with the offline strip showing, and while transcribing, the step bar stays fully visible
      while scrolling Compare at 375px.
- [x] A5: when a "Not now" or "Join" lands but its response is lost, the retry moves on instead of
      showing "Could not save".

**Evidence (dev, 2026-10-06, test DB):**
- A1 — `src/tests/integration/p1429-topic-photo-race.test.ts` failed first (`expected true to be false`:
  the late vote re-exposed the voter), then 5/5. Concurrency: `p1429-topic-photo-concurrent.test.ts`
  (a star and Hide sent together on two connections) exposed the voter in 13/40 and 6/40 races before
  the per-user lock, 0/120 after. Browser: `e2e/p1429-follow-up.spec.ts` holds the vote in flight,
  ticks Hide, releases it — `is_public=false`, box still ticked after reload; and hiding before any
  vote shows ticked on return (failed first).
- A2 — `p1429-host-view-room-answer.test.ts` (room-only answer returned with its 7, no prep row
  created, still host-only) and `p1337-host-opt-in-groups.test.ts` failed first, then pass. Browser:
  the host sees "P1429 Room Only" under Opted in with "understood 7/10"; an attendee sees no groups.
  /meet reads `useHostPrepMarks`, which never reads the new fields.
- A3 — `src/tests/p1429-reopen-reaches-phones.test.ts` (polling rule; a hidden tab skips reads; a
  Reopen is seen on the minute). Browser: event started 13h ago, phone on Close, a new round inserted,
  the page clock run 61s — Close is gone.
- A4 — `src/tests/p1429-room-head-offset.test.tsx`; browser `e2e/p1429-pinned-head.spec.ts`: seated
  in a round on Compare (14 statements), transcribing, offline, scrolled at 375, 320 and 1280px — the
  step bar is below the capture bar every time. Control: with the old measure the step bar sat at
  92px under a bar ending at 188px (fails).
- A5 — `src/tests/p1429-close-lost-response.test.ts`; `p1429-close-retry.test.ts` failed first (the
  server refused the retry with 22023), then 3/3. Browser: the first "Not now" response is dropped
  after reaching the server; the page moves to the end, no "Could not save", one row stored.
- Reviews: Codex, Opus and Gemini, then a Codex check of the fixes and a third Gemini pass on the SQL
  (Gemini timed out on the full diff twice; the halves went through). Every finding was either fixed
  with a test that failed first, or rejected with the reason in the session log.
- Suites: `npm test` 545 files passed (2 skipped); the P1429 + P1347 database tests 20/20; browser
  p1429 (both), p1389 close, p1337 rounds and table-compare, p1336 schema 61/62 — the one failure,
  p1347-topics "a signed-in vote saves…", fails identically on `main` (d292b71e1) and is not this work.
  Final re-run of rounds, close, p1336 schema and both p1429 browser files: 55/55, no flakes.

## Built — where it departs from the Solution above

- **A1 backfill is "hidden if ANY vote is hidden", not "the latest vote"** — the race this fixes leaves
  the latest vote public, so "latest" would have kept the very voters it exposed. The migration also
  re-hides any vote of a person whose stored choice is hidden.
- **A1 gained a per-user lock** shared by `rate_topic` and `set_my_topic_votes_public` (review, Codex +
  Opus): reading the stored choice was not enough while both calls were in flight.
- **A1 gained `get_my_topic_photo_choice()`** (review, Opus): the photo box now starts from the stored
  choice, so someone who hid it before voting sees it ticked; a saved choice replaces it at once, so
  the box no longer flips back after Hide (review round 2, Codex — reproduced in the browser first).
- **A1: the first vote stores the choice, and the switch refuses a missing value** (review round 3,
  Gemini): with nothing stored, a later vote sent with the default "show" re-exposed a hidden first
  vote; and a missing value used to mean "show". Both failed first on the test DB.
- **A5 is server-side, not "treat 23505 as success"**: a real retry is refused with 22023 "this ask is
  not offered" (an ask answered tonight leaves the offered list before the 23505 check), so a 23505
  rule would never have fired. A first client fix inferred success from the re-read; review (Codex +
  Opus) showed it reported "You've joined" when a "Not now" in another tab had ended the ask. Now
  the server answers a repeat of a write that already holds — the same answer stored; for Join, the
  membership present — with success, and the page retries once.
- **A4 measures the capture bar's slot**, not the bar: offline the bar is a different, two-line
  element with its own test id (found by the browser test, then by both reviewers).

## Related

- P1430: walkthrough-9 build items (split from this spec on review)
- P1337, P1389 (shipped); P1336 / P1386 (prep and host marks); P1347 (signed-in votes)
