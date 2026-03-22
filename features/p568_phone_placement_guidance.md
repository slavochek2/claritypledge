---
status: week
type: story
rank: 5
tags:
  - recording
  - ux
  - live
created_date: 2026-03-22
---

# P568: Phone Placement Guidance for /live Sessions

## Problem Statement

Multi-phone /live session recordings capture both speakers on both phones (crosstalk). Speaker attribution accuracy depends on the energy difference between phones — the closer the phone is to its owner, the clearer their voice is on that recording. Currently no guidance is given to users about phone placement, leading to inconsistent recording quality.

P556 benchmarking showed that phone positioning directly affects attribution quality. Users placing phones centrally between them (shared table) get worse separation than phones placed on each person's side.

## Intention

Give users a brief, non-intrusive placement hint at recording start. Optionally collect a 5-second voice calibration sample per person for future voice-based attribution improvements.

## Business Requirements

1. **Placement tooltip at recording start.** When /live recording begins, show a brief dismissible overlay: "For best recording, place your phone on your side of the table, facing you." With a simple illustration.
2. **One-time per user.** Show once, remember dismissal. Don't show again unless user resets.
3. **Optional voice calibration (Phase 2).** After joining a session and before the first round, prompt: "Quick mic check — say your name when the circle pulses." Record 3-5 seconds of each person speaking alone. Tag samples to recorder identity for future use.
4. **No blocking.** Placement hint is dismissible. Calibration is skippable. Neither blocks session start.

## Acceptance Criteria

- [ ] Placement tooltip appears once at recording start in /live
- [ ] Tooltip is dismissible and remembers dismissal (localStorage)
- [ ] Tooltip includes a simple visual (icon or illustration showing phone placement)
- [ ] Mobile-friendly (this is a phone-held experience)
- [ ] Phase 2: Voice calibration UI (3-5s recording per person, sequential)
- [ ] Phase 2: Calibration audio uploaded to GCS alongside session chunks

## Files to Change

- `src/app/components/live/` — new PlacementGuide component
- `src/app/pages/live-meeting-page.tsx` — show guide at recording start

## Done When

- [ ] Users see placement guidance on first /live recording
- [ ] Guidance is non-intrusive and dismissible
