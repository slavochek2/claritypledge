---
status: in-progress
type: story
rank: 311
workstream: events
created_date: '2026-10-01'
tags: [events, host, preparation]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
related: [p1336, p1337, p1114]
---

# P1386: The host sees who prepared and who needs a mic as small icons in the people lists

## Problem

> Founder, verbatim (2026-10-01, after seeing the host Preparation card on prod): "in /meet we just put the check and there is a hint that says prepared, you can do that on the event page as well ... USB mic maybe we do multiple icons, same similar small thing, we don't need extra categories ... show there too for myself only, and the preparation as well is only for myself so we can hide it"

The event page shows each registrant twice to the host (Participants, then a Preparation card with
"0 volunteers · 0 USB-C mics needed" and per-person text). In the room (/meet), the "prepared" check
is visible to everyone in the room (P1336 UAT round 2); the founder now wants it host-only.

## Appetite

Part 1 (shipped to QA): UI on two lists plus a narrower read. Part 2 (amendment 2026-10-02): the mic question in the
preparation step and the mic marks. Blast radius: medium (the prep flow every registrant walks, one CHECK constraint
on `event_preparations.mic_setup`). Reversibility: medium (additive migration, old rows stay valid). Decision density:
three wording calls, all proposed below and marked.

## Solution

- **Event page, Participants card (host viewing only):** after each name, **✓** (prepared, tooltip
  "Prepared for the event") and **🎙** (volunteer: tooltip "Needs a USB-C mic" or "Brings own mic").
  One line above the list only when at least one USB-C mic is needed: "Bring {n} USB-C mic(s)".
  The separate Preparation card is removed. Non-hosts see the list exactly as today.
- **Room (/meet) roster:** NO marks for anyone, host included (founder, 2026-10-02: the room is projected on a
  wall, so the host's marks would show the whole room who did not prepare and who volunteered). Superseded the
  original "host only in the room".
- Tap opens the hint on phones, hover on desktop (the P1336 roster mark's Popover pattern).
- Data: the host-only reads already exist (`get_event_prep_host_view`); restrict
  `get_event_room_prepared` to the host, or replace it with the host view, so non-hosts can no
  longer read who prepared.

```
(S) Su Myat Noe  👂10 ✓ 🎙      ← host only; tap ✓ "Prepared for the event", tap 🎙 "Needs a USB-C mic"
```

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Host loses the step-level detail ("step 3 of 6") | ACCEPT | Prepared yes/no is what matters on the night; detail can return as a tooltip later |

Non-Goals: do NOT show prepared or mic marks in /meet; do NOT change what non-hosts see on the event page; do NOT move opt-in answers onto the
event page (the room shows them); handing out mics on the night is P1337.

## Acceptance Criteria

- [x] Host on the event page: one Participants list with ✓ / 🎙 icons and their hints; no separate Preparation card; the mic line appears only when a USB-C mic is needed
- [x] Non-host on the event page sees no ✓ / 🎙 and cannot read who prepared (DB check)
- [x] Room (/meet): ✓ / 🎙 shown to the host only; a non-host in the room sees neither

- [x] (amended) /meet shows no ✓ / 🎙 to anyone, host included; the event page keeps them for the host

## Amendment 2026-10-02: the mic question and the mic marks

> Founder, verbatim (2026-10-02): "we are mixing two things. First, what microphone they have, USB-C or
> lightning. And second, will they bring their own or they need one" … "we only need to know for those who
> need a mic, what kind of mic" … "one icon for the kind of microphone, and then a duplicate of them means
> they need one, and one of them means they get it from me" … "is there a third type" … "some a bit
> frustrated because they choose the version that they actually have, which is not USB-C nor Lightning".

**Problem.** The preparation step asks "Does your phone have a USB-C port?" with answers Yes USB-C / No, I'll
bring my own / No, and I don't have a microphone. That mixes two facts (do you have a mic; what does your phone
plug into). A person with a Lightning iPhone and no mic has no honest answer and is recorded as *declined*, so the
host cannot see Lightning demand (the founder owns no Lightning mics and may buy some).

**Solution.**
1. **Two questions in the existing mic screen** (same `research` step, same `mic-question` section):
   - Q1 "Do you have a microphone to bring?" — *Yes, I'll bring my own* (saves `own`, `confirmed`, continues; nothing
     more is asked: a mic they own is assumed to be a close-to-the-mouth mic) / *No, I need one* (local state only).
   - Q2, only after "No, I need one": "Which charging port does your phone have?" — *USB-C* saves `usbc` + `confirmed` /
     *Lightning* saves `lightning` + `eligible` / *Something else, or I'm not sure* saves `other` + `eligible`.
     **Why eligible:** `get_event_research_places_left` counts every `confirmed` row and shows "{n} of {places}
     volunteer places left" to everyone; a person the host cannot equip must not use up a recording place. They stay
     consented volunteers who named their mic need, so the host marks and counts still include them. If the host
     later owns Lightning mics, flipping those rows to `confirmed` is a data change, not a code change.
   - `lightning` and `other` show a short note and a Continue (the way `none` does today). The retired `none`
     answer is no longer written by the UI; existing `none` rows stay valid and read as declined.
   - Back: Q2 → Q1 → the opt-in screen (today Back from the mic screen goes straight to the opt-in screen).
     Reloading between Q1 and Q2 returns to the opt-in screen exactly as reloading before the mic answer does today
     (`micAsked` is not persisted; unchanged by this work).
   - `chooseMic` is left untouched (P1387 edits the lines beside it); the new answers use a new function.
2. **Data.** `mic_setup` accepts `usbc | own | lightning | other | none`. Additive migration; the constraint is
   found by definition (it is an unnamed inline CHECK), dropped and re-added; the column COMMENT is updated; no data
   rewrite. `get_event_prep_host_view` returns `mic_setup` text unchanged.
3. **Host marks (event page only).** A mark shows for anyone with a mic answer whose `research_state` is not
   `declined`. `own` = one grey mic. Every "needs one" = two overlapping dark mics (host hands one out) plus a tiny
   letter: **C** (USB-C), **L** (Lightning), **?** (other; the host cannot provide it but it is counted). Hints:
   "Brings own mic", "Needs a USB-C mic", "Needs a Lightning mic", "Needs a mic: other or unknown connector".
4. **Host line** above Participants, only when at least one person needs a mic: counts per kind joined with " · ",
   e.g. "Bring 2 USB-C mics, 1 Lightning mic · 1 needs another kind of mic"; with only "other" people: "1 needs
   another kind of mic". Counts only, no names (the marks carry names).
5. **Opt-in screen line** "We provide you with a USB-C lavalier microphone, or you can bring your own mic." becomes
   "We can lend you a USB-C lavalier microphone, or you can bring your own mic." so a Lightning person is not
   promised a mic before Q1.
6. **End screen** volunteer note covers all four mic outcomes (wording below).

**Proposed participant wording — [FOUNDER DECISION: approve or change in the browser before ship]:**
- Q1 title: "Do you have a microphone to bring?" Answers: "Yes, I'll bring my own" / "No, I need one".
- Q2 title: "Which charging port does your phone have?" Answers: "USB-C" with subline "iPhone 15 and newer, and most Android
  phones" / "Lightning" with subline "iPhone 14 and older" / "Something else, or I'm not sure".
- Note after Lightning: "Thanks. We don't have Lightning microphones yet, so we can't promise you one. We'll tell you
  if that changes. You can still take part in the discussion." After Something else: "Thanks. We may not be able to lend you a
  microphone for that. You can still take part in the discussion."
- End screen: usbc "You're a recording volunteer. We'll bring a USB-C mic for you." / own "You're a recording
  volunteer. Please bring your own microphone." / lightning and other (not a recording place, so not "a volunteer"):
  "Thanks for offering to record. We'll tell you if we can lend you a microphone."
- Opt-in line: "We can lend you a USB-C lavalier microphone, or you can bring your own mic."
- [FOUNDER DECISION: the C / L / ? letters on the marks, versus another distinction.]

## Amended Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Person with own mic that is not suitable (e.g. wired earbuds) | ACCEPT | Founder: "if they have a mic, then they have a mic"; host sees the one grey mic and can ask on the night |
| Lightning and other people are volunteers the host cannot equip | ACCEPT | Saved `eligible`, so they do not use up a recording place; counted for the host; the note sets the expectation up front |
| Host later buys Lightning mics: those rows are still `eligible` | DEFER | One data update to `confirmed`, done when the mics exist |
| A cached older client writes only the old three values | ACCEPT | The CHECK keeps `usbc/own/none` valid, so old writes still succeed |
| A cached older HOST client does not know `lightning` / `other` | ACCEPT | Those volunteers get no mark or count until the host reloads |
| Old `none` rows (said "no mic") read as declined, unlike new "I need one" | ACCEPT | No data rewrite; the host view already ignores `none` |
| Overlap with P1387 (mobile prep one page), which also edits `EventPrepPage.tsx` | MITIGATE | `chooseMic` untouched, new function for the new answers; no `FixedBottomBar` / `barRef` use; ship-time merge checked with `git merge-tree` against P1387's branch |

Non-Goals: do NOT ask the connector of people who bring their own mic; do NOT add a free-text "other" field; do
NOT change the research opt-in question or its consent text; do NOT rewrite existing `mic_setup` rows; do NOT edit
the `/tree` onboarding prototype page; handing out mics is still P1337.

## Amended Acceptance Criteria

- [x] Preparation step: "Do you have a microphone to bring?" — Yes saves `own` + `confirmed` and continues without a second question
- [x] "No, I need one" asks what the phone plugs into; USB-C saves `usbc` + `confirmed`; Lightning and Something else save `lightning` / `other` + `eligible`
- [x] Lightning and Something else show the note and a Continue; the page still scrolls as one page at 320px
- [x] Back: from Q2 to Q1, from Q1 to the opt-in screen; a returning person with a saved answer sees the matching answer highlighted; saying Yes again on the opt-in screen opens on Q1 and does not downgrade a USB-C or own-mic volunteer from confirmed — verified by e2e for Q2 → Q1 → opt-in and the Q1 highlight; the Q2 highlight was seen in a screenshot, not asserted.
- [x] A Lightning or Something else volunteer does not reduce "{n} of {places} volunteer places left"; a USB-C or own-mic volunteer does
- [x] Host, event page: `own` = one grey mic; USB-C / Lightning / other = two overlapping dark mics with C / L / ?; each has its hint (hover on desktop, tap on phone); readable at 320px and in dark mode — verified at 1280 / 390 / 320px; dark mode NOT verified (the app does not follow the browser colour scheme).
- [x] Host line counts each kind and reads right for mixed, only-USB-C and only-other cases; absent when nobody needs a mic
- [x] Non-host sees no marks and no line (DB still refuses them); /meet shows none to anyone
- [x] End screen volunteer note and the opt-in line read as in the wording block, for all four mic outcomes — e2e asserts the end note for USB-C, own and Something else; the Lightning end line and the changed opt-in line were not asserted (the Lightning e2e path ends as USB-C).
- [x] Migration applies on test; `usbc/own/none` writes still succeed; `lightning` / `other` are accepted; a value outside the set is rejected (new e2e DB test)
