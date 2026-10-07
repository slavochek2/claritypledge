---
status: qa
type: story
rank: 21
workstream: events
created_date: '2026-10-06'
tags: [events, rounds, host]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1430: Clarity Night host flow — group preview, Demo round, step bar, Host tab

## Problem

After the first live use of rounds (P1337), the founder's walkthrough 9 and three UX reviews (Opus,
Codex, Gemini) agreed on the next host and attendee changes. They were held back to ship on the
event day.

> Founder: "choose who sits is a very specific function … this is like group size level"; "should
> they be like reviewing and saying yes or not"; "this run event maybe … should be like another tab"

## Founder decisions (walkthrough 9, 2026-10-06, recorded in this conversation; not in the P1337 spec)

- **Presets:** "Choose who sits" on → tables 30s (stepping in 30s), speaker 3 min, observer 1 min.
  Standard → tables 1 min, speaker 6 min, observer 3 min.
- **Who sits:** volunteers first, plus a "Suggest pair (biggest gap)" among the chosen (agent
  recommendation; the founder replied "ok" to the batch).
- **The host-picked round is called "Demo"**, followed by Round 1 (agent recommendation, approved
  with "ok").
- **Settings in three groups:**
  - *Who plays:* all tables, or one demo table.
  - *Format:* group size, swap or one talk, minutes.
  - *Matching:* checkboxes with hints, shown only for all tables.
- **Preview groups before starting** (recommended by all three reviewers; approved with "ok").
- **Host as its own event tab:** Details · Room · Host (founder's idea).
- **Step bar:** done steps get a check, the current step is bold and thicker, steps ahead are grey.

## Appetite

Blast radius: medium. It changes the host flow and round numbering. Reversibility: code, plus
possibly one migration (Demo flag). Decision density: low; decisions above. Two copy calls remain
open.

## Solution

1. **Demo = the existing showcase round, renamed and extended.**
   - `event_rounds.showcase` and the host's "choose who sits" already are the host-picked round
     (phones read "You watch").
   - **Numbering model:** `round_no` stays the storage order (CHECK 1..9, unique per event, start
     requires max+1). Every surface derives a display number as `round_no − demos before it`, and a
     Demo reads "Demo".
   - Surfaces that change:
     - RoundCard ("Round N · You watch", the waiting card).
     - EventHostPage: the title, "Round N started", the past rounds list, and the start labels.
     - The projector.
     - Partner planning (`historyBefore`, `sitsOutRound`, `totalRounds`).
   - The 9-round cap counts Demo and Reopen rounds; say so in the host UI when it is reached.
   - A Demo uses the event's own statement set ("Match on" is hidden for it).
2. **Settings regrouped** as above, with the presets switching when "one demo table" is chosen.
3. **Preview before Start:**
   - "Next round" (or Start) shows the proposed tables; the host can swap, shuffle or start.
   - Start publishes the previewed arrangement. If anyone in it has left, or someone new has arrived,
     the preview refreshes and says who changed.
   - If another host device starts first, this device's preview closes and shows the running round.
   - The time-left confirm comes before the preview.
4. **Step bar states:**
   - Done: a check plus a muted label.
   - Current: bold, a thicker bar, `aria-current`.
   - Ahead: grey.
   - Steps that cannot open are `aria-disabled` and look it.
   - At ≤360px only the current label shows.
5. **Small fixes:**
   - Names truncate at 320px only when there is truly no room. Test with the longest name in the
     test seed.
   - 44px targets for the back arrow and host steppers.
   - The full "Match on" name shows.
6. **Host tab:**
   - The Details / Room strip gains Host, visible to the host only. The strip is route links, not
     Radix tabs.
   - "Run this event" on the event page and in the room goes away.
   - Hiding the tab is display only; the /host route guard remains the real check.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A display-number bug shows the wrong round to the room | MITIGATE | One helper used by every surface listed; e2e per surface |
| A Demo plus Reopens hit the 9-round cap mid-evening | ACCEPT | 9 is far above a 2-hour evening's rounds; the UI says when reached |
| The preview adds a step every round | ACCEPT | Founder approved; Start stays one tap from the preview |

**Non-Goals**
- Do NOT add attendee history of past rounds.
- Do NOT change the 9-round database cap.

## Acceptance Criteria

- [x] The host sees the proposed tables before a round starts, and the round that starts matches them
- [x] If someone leaves between preview and Start, the preview updates and names them
- [x] A host-picked round reads "Demo" on the host page, the past rounds list and phones; the next
      round reads Round 1
- [x] Someone marked to sit out "Round 1" sits out the counted round, not the Demo
- [x] Choosing "one demo table" switches minutes to 30s / 3 / 1; switching back restores 1 / 6 / 3
- [x] Step bar: done steps show a check, the current one is bold and thicker, steps that cannot open
      are greyed and not tappable, at 320px, 375px and desktop
- [x] The event page shows a Host tab to the host only; a non-host opening /host is refused

## Open Questions — answered 2026-10-07

1. ~~Hint lines under each matching option~~ — **No hints.** Founder: "I know what those are … as far as I am the only person using it, doesn't matter."
2. Ear badge — **drop it from the host's grouped participant rows on the event page, keep the number** (founder: "yes do that"). Tracked separately from this spec, since it fixes names cut to "P14…" at 375px today.
3. "understood N/10" — **kept** on the host's rows; dropping the ear badge is what gives the name its room.

## Related

- P1337 (shipped): rounds; showcase round; walkthroughs 1–8
- P1429: the five review fixes (split from this spec)

## Dev notes (2026-10-07)

- Evidence: `e2e/p1430-host-preview.spec.ts` 5/5 green (preview = started round table-for-table; a
  leaver is named and not seated; Demo then Round 1 with the sit-out applied to Round 1; presets;
  another device's start closes the preview). Unit: `p1430-round-numbering`, `p1337-room-steps`.
- Re-run on a quieter machine (video off; ffmpeg missing locally): p1430 + p1337 rounds/walkthrough6/
  start-hang — 29 green in the full run (7 only on retry, after slow logins), then walkthrough6 8/8 alone after updating its Reopen step (Reopen now
  previews too). Screenshots: host desktop (Demo preview/running), host 375 (confirm → Round 1 preview),
  attendee 375 ("Demo · You watch", step bar with checks) and 320 (only the current step's label).
- Residual (Codex HIGH, narrowed not closed): Start re-reads presence just before saving, but
  `host_start_round` does not check `left_at` itself, so a mark-out from another device in the last
  milliseconds can still be seated. Closing it needs the RPC to reject seats for members who left
  (a migration) — not done here.

