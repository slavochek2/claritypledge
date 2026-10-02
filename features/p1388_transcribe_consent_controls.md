---
status: week
type: story
rank: 16
workstream: events
created_date: '2026-10-02'
tags:
  - transcribe
  - consent
  - recording
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
related:
  - p1337
  - p1307
  - p1022
---

# P1388: The person recording can pause, can tell the recording is working, and the bar says what it actually does

## Problem

> Founder framing, verbatim: *"I don't think that every person for themselves can decide if they
> record. It's up to them if people around them consent or not. I mean, if I want to start recording,
> I just start. And it's up to me to tell others that I started recording, that I'm recording … a
> person who records, he's responsible for getting consent from people around him, not us. We don't
> need to manage that."*

> And on the interface, verbatim: *"I don't think we need to clutter our interface with more stuff
> like you're responsible and so on … no other event, no other recording app does it like why would
> we — it is legally their duty so they know anyway."*

**Situation:** At a Clarity Night, two or three people wear a lavalier and record their own
conversation from their own phone. The capture bar's only control is labelled **"End session"**
(`src/app/components/session/room-capture-bar.tsx:83`) and calls `endMyCapture` — it ends *your*
capture, not the session, so the label overstates what it does.

**Complication:** Three things changed at once.

1. **Consent moved onto the recorder**, per the framing above. This **overrules**
   [decisions.md](../docs/decisions.md) 2026-09-16, which required pair unanimity ("lavalier wearers
   pair only with each other"). That earlier entry rejected the recorder-responsibility model for one
   reason that still holds: *"everything before they object is already captured."* A pause control is
   what closes that gap — so it moves from "not worth building before the event" to the thing the new
   consent model rests on.
2. **Capture fails silently.** iOS Safari mutes the capture track when the screen locks or the tab
   backgrounds; `MediaRecorder` keeps running and writes **silence**, with no error. Android survives
   backgrounding only when OEM battery optimisation is off, which a web page cannot set. Researched
   2026-10-01 against WebKit/Chromium trackers; `docs/events/clarity-practice-event.md` had
   independently warned on 2026-09-10 that the speech path *"dies on backgrounding or screen lock."*
3. **A USB-C mic unplugged mid-round ends the track.** Per the Media Capture spec a
   `MediaStreamTrack` **ends** when its source disconnects, with no automatic fallback to the built-in
   mic, and re-requesting with the stale `deviceId` fails.

All three failures look identical to the person holding the phone: nothing.

**Question:** What does the capture bar need so that a recorder can honour a request to pause, and
can tell at a glance that words are actually being recorded?

## Appetite

Blast radius: medium — the bar is app-wide (`/transcribe` and anywhere room capture is live), not
event-only, which is why this is not inside P1337. Reversibility: high, UI plus existing context
methods. Decision density: one founder call on the info affordance's wording.

## Solution

**Pause / Resume, exposed.** `pauseMedia` and `resumeMedia` already exist
(`src/app/contexts/room-capture-context.tsx:435-457`), driven today only by an automatic effect that
pauses on `/live` and immersive screens. Expose them as the bar's primary control, with the state
visible — recording vs paused must be readable without interpretation.

**Rename "End session" → "Stop transcribing".** It ends only the caller's capture.

**A live level meter.** The single highest-value element here: every failure mode above produces
*silence*, not an error, so without a meter the recorder discovers at minute 15 that they captured
nothing. The meter is the only thing in this spec that turns an invisible failure into a visible one.

**Unplug handling.** Listen for the track's `ended` event, re-request `{ audio: true }` without the
stale `deviceId`, and tell the recorder. Android behaviour is not uniform, so also treat sustained
silence as a signal rather than relying on `ended` alone.

**An info affordance, not a sentence** — a small ⓘ opening what is captured, where it goes, and the
recorder's responsibility. Read by the people who care, invisible to everyone else.
`[FOUNDER DECISION: the wording inside the info sheet]`

## Invariants

- **Pause must stop capture, not merely hide it.** The control exists so that a request to pause is
  honoured; a pause that keeps writing bytes is worse than no control at all.
- **The room is never asked who does not want to be recorded.** Refusal must not become a public
  declaration ([decisions.md](../docs/decisions.md) 2026-09-16 — the one part of that entry this work
  does not overrule).
- The bar stays **one bar, never stacked** — when offline it becomes that bar's offline state
  (P1369, P1307 D7).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The meter shows level but the upload is failing | MITIGATE | Meter reflects the captured stream; surface upload failure separately rather than implying success |
| A recorder pauses and forgets to resume | ACCEPT | Preferable to the opposite failure; the paused state is visible on the bar |
| Re-requesting the mic after unplug prompts for permission again | ACCEPT | Rare, and the alternative is silent silence |
| iOS lock still kills capture despite everything here | ACCEPT | Not fixable from a web page; handled by instruction in `docs/events/facilitator-checklist.md` |

**Non-Goals**
- Do NOT build device selection — there is no `enumerateDevices` anywhere in `src/`, and a USB-C
  lavalier becomes the OS default input without one.
- Do NOT change who may start a capture, or the room-joining model (P1236 collapses everyone into one
  room on purpose).
- Do NOT add a publishing or media release here — that is P1022.

## Acceptance Criteria

- [ ] A recorder can pause and resume their own capture from the bar, and the paused state is visible without tapping anything
- [ ] Audio written while paused is zero — verified by inspecting the stored capture, not by the UI's claim
- [ ] The bar's stop control reads "Stop transcribing" and ends only the caller's capture
- [ ] The level meter moves with speech and sits flat in silence, verified on a real phone
- [ ] Unplugging a USB-C mic mid-capture surfaces a visible state within a few seconds rather than recording silence
- [ ] The info affordance opens the explanation and the bar carries no added sentence

## Open Questions

1. Should pause be available to anyone at the table, or only the recorder? Today only the recorder holds the phone, so this is theoretical — until a second person asks.
2. Does the existing automatic pause (on `/live`, immersive screens) conflict with a manual resume? UNVERIFIED — read the effect at `room-capture-context.tsx:673-699` before wiring.

## Related

- [p1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md) — the event flow this was carved out of
- [p1307](done/2026-06-10/p1307_event_transcription_from_ready_across_pages_into_sessions.md) — the app-level capture provider and its bar
- [p1022](p1022_recording_consent_page.md) — the publishing release, a different consent from this one
