---
id: P549
title: 1-to-many /live verification for events
status: backlog
type: story
rank: 19
tags:
  - live
  - events
  - workshop
created_date: 2026-03-18T00:00:00.000Z
---

# P549: 1-to-Many /Live Verification for Events

## Why

Current /live is dyadic — two people verify each other. At events and workshops, Slava presents calibration points to a room and each participant should be able to verify their understanding against the speaker. Today this requires N separate 1-on-1 sessions, which is impractical for a 10+ person workshop.

**Pre-event blocker:** The next Calibration Workshop needs participants to calibrate against Slava's points simultaneously. Without 1-to-many, the workshop is Slava talking + manual show-of-hands, losing the measurement advantage that makes ClarityPledge credible.

**Strategic context:** Workshops are the PRIMARY acquisition channel (lean-canvas). The "holy shit" moment happens when participants discover their own comprehension gap in real-time. 1-to-many /live makes this scalable — one presenter, many verifiers, all gaps visible instantly.

## Concept

**Speaker (presenter):** Shares a point/story. One person holds the floor.

**Listeners (room):** Each participant independently:
1. Rates their confidence ("How well do I think I understood?")
2. Explains back (text or verbal, depending on format)
3. Speaker rates each explanation (or AI-assisted batch rating for large groups)

**Result:** Room sees distribution of understanding gaps — not just their own score, but the spread. "80% of the room thinks they understood, but only 30% actually did" is the workshop "holy shit" moment.

## Scope

- Speaker creates/selects a point in the event context
- All event participants see the point and can take positions + rate confidence
- Speaker sees aggregate confidence distribution in real-time
- After explain-back phase, speaker rates accuracy (or marks "verified" / "gap found")
- Gap distribution visible to room (anonymized or named, facilitator's choice)

## Out of Scope

- AI-assisted batch rating of explanations (V2)
- Peer-to-peer verification within the event (existing 1-on-1 /live handles this)
- Recording/transcription of verbal explain-backs

## Depends On

- P517 (polished /live UX — sliders, turn-taking, action feedback) should ship first

## User Stories

- As a workshop facilitator, I want to present a point to the room and see who thinks they understood vs who actually did
- As a participant, I want to rate my confidence and explain back, just like in 1-on-1 /live but in a group context
- As both, I want to see the gap distribution — the room's collective calibration error

## Done When

- [ ] Speaker can broadcast a point to all event participants
- [ ] Each participant can rate confidence and submit explain-back
- [ ] Speaker can rate/verify explanations
- [ ] Gap distribution visible to room
- [ ] Works on mobile (event participants are on phones)
