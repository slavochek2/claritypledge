---
status: qa
type: story
rank: 311
workstream: events
created_date: '2026-10-01'
tags: [events, host, preparation]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

Small: UI on two existing lists plus a narrower read. No new tables. One founder decision already made.

## Solution

- **Event page, Participants card (host viewing only):** after each name, **✓** (prepared, tooltip
  "Prepared for the event") and **🎙** (volunteer: tooltip "Needs a USB-C mic" or "Brings own mic").
  One line above the list only when at least one USB-C mic is needed: "Bring {n} USB-C mic(s)".
  The separate Preparation card is removed. Non-hosts see the list exactly as today.
- **Room (/meet) roster:** the same ✓ and 🎙, **host only** (today ✓ shows to everyone in the room).
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

Non-Goals: do NOT change what non-hosts see on the event page; do NOT move opt-in answers onto the
event page (the room shows them); handing out mics on the night is P1337.

## Acceptance Criteria

- [x] Host on the event page: one Participants list with ✓ / 🎙 icons and their hints; no separate Preparation card; the mic line appears only when a USB-C mic is needed
- [x] Non-host on the event page sees no ✓ / 🎙 and cannot read who prepared (DB check)
- [x] Room (/meet): ✓ / 🎙 shown to the host only; a non-host in the room sees neither
