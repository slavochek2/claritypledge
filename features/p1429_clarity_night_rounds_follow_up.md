---
status: week
type: story
rank: 20
workstream: events
created_date: '2026-10-06'
tags: [events, rounds, host, privacy]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1429: Clarity Night rounds — follow-up after the first live evening

## Problem

**Situation:** P1337 (rounds, step bar, host panel, closing link) and P1389 (closing sequence) shipped
for Clarity Night #2 on 2026-10-06. Before shipping, three UX reviewers (Opus, Codex, Gemini) and a
Codex code review looked at the work; the founder approved the plan from walkthrough 9.
**Complication:** To ship on the event day, five review findings and the larger walkthrough-9 build
items were held back. None breaks the evening; each is a known gap.
**Question:** Close those gaps before the next Clarity Night (#3).

> Founder, on shipping: "we can bring everything to the prod and the rest can be fixed now … as follow-up"

## Appetite

Blast radius: medium. Part A touches a privacy setting (topic votes) and the host's view of answers;
Part B changes the host flow before a round starts. Reversibility: high, code only, except A2, which
changes a host-only database function. Decision density: low. Part B's choices were made in
walkthrough 9 (P1337 spec, "Founder walkthrough 9"). The copy items below are marked as founder
decisions.

## Invariants

- A voter who hides their photo stays hidden. No vote written before the choice can re-expose them
  (decisions.md, the topics privacy entry: "Voters can hide their photo").
- Host-only data (principle answers, ratings, prep and mic marks) never renders for a non-host, and
  never in the event room, which is shown on the projector (founder, walkthrough 9).

## Solution

### A. Deferred review findings (Codex code review, 2026-10-06)

1. **Topic-vote photo race (HIGH).** A star vote still saving when "Hide my photo" is tapped can land
   after the hide and write `is_public=true` again (`topic-parts.tsx` ~418, reproduced by Codex).
   Serialize votes and visibility, or make visibility a server-side preference a vote cannot overwrite.
2. **People who answered only in the room show as Undecided on the host's event page.** The page reads
   the preparation answer; the room→prep sync updates only existing rows. The host view should prefer
   the room answer when a room row exists.
3. **Reopen after start + 12h does not reach phones.** Phones stop polling once the evening has ended
   past the grace window, so a new round is never seen. Keep a slow discovery poll while the room is
   open.
4. **The pinned room header ignores the offline strip and assumes a 49px capture bar.** Measure the
   bars instead of hard-coding the offset.
5. **A closing-sequence answer whose response is lost traps retries.** Re-read the close state after an
   ambiguous failure, and make the same retry idempotent.

### B. Walkthrough-9 build items (founder approved; details in P1337's walkthrough 9 section)

1. **Preview groups before starting.** "Next round" opens the proposed tables; the host can swap,
   shuffle or start. Starting publishes exactly what was previewed.
2. **Settings in three groups:**
   - *Who plays:* all tables, or one demo table.
   - *Format:* group size, swap or one talk, minutes.
   - *Matching:* shown only for all tables, each option with a one-line hint.

   The host-picked round is called **Demo** and is not counted, so the next round is Round 1. Picking
   is volunteers first, plus "Suggest pair (biggest gap)" among the chosen. Demo preset: tables 30s
   (stepping in 30s), speaker 3 min, observer 1 min. Standard: 1 / 6 / 3.
3. **Clearer step bar.** Done steps carry a check and a lighter look; the current step a bold, thicker
   bar; steps ahead are grey; steps that cannot open stop looking tappable; at ≤360px only the current
   label shows.
4. **Small fixes:**
   - Names no longer truncate at 320px while there is free space.
   - "understood 8/10" on the mobile roster (desktop already says it).
   - The ear badge is explained, or dropped.
   - 44px targets for the back arrow and the host steppers.
   - The full "Match on" name shows.
5. **Host as its own event tab:** Details · Room · Host, Host visible to the host only.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A2 changes a host-only RPC that P1336/P1386 also read | MITIGATE | Additive field or fallback only; run the P1386 tests |
| The preview adds a step to every round for the host | ACCEPT | Founder approved; Start stays one tap from the preview |
| A non-counted Demo shifts round numbers on phones | MITIGATE | Phones show "Demo" for that round; e2e covers it |

**Non-Goals**
- Do NOT change the closing sequence's questions or order (P1389).
- Do NOT add history of past rounds for attendees.
- Do NOT show host-only marks in the event room.

## Acceptance Criteria

- [ ] Tapping a star and then "Hide my photo" on a slow connection leaves the vote hidden (A1)
- [ ] Someone who answered only in the room appears under Opted in or Opted out on the host's event page (A2)
- [ ] After ending an evening more than 12h past its start, Reopen moves phones off Close (A3)
- [ ] With the offline strip showing, the step bar stays fully visible while scrolling Compare (A4)
- [ ] A closing answer whose response is lost can be retried and moves on (A5)
- [ ] The host sees the proposed tables before a round starts, and the round that starts matches them (B1)
- [ ] A host-picked round reads "Demo" on the host page, projector and phones; the next one reads Round 1 (B2)
- [ ] Done, current and ahead steps read differently at 320px, 375px and desktop (B3)
- [ ] At 320px no name truncates while space remains; the back arrow and steppers are ≥44px (B4)
- [ ] The event page shows a Host tab to the host only (B5)

## Open Questions

1. [FOUNDER DECISION: copy] Hint lines under each matching option (recorders together, disagreement
   gap, haven't met yet).
2. [FOUNDER DECISION: ear badge] Explain it with a tooltip, or drop it from the room roster?

## Related

- P1337 (shipped): the rounds, with walkthrough 9's decisions
- P1389 (shipped): the closing sequence (A5)
- P1336 / P1386: the preparation and host marks (A2)
