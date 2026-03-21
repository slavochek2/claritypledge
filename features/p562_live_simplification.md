---
status: today
type: story
rank: 0.021
tags:
  - epic-story-first
  - live
  - simplification
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-03-21T13:36:05.704Z'
---

# P562: /live Simplification — Strip to Orchestration

**Epic:** story-first (P523 vision)
**Priority:** 3 of 6 — responds to "too clunky, too interruptive" feedback
**Depends on:** P561 (comprehension slider — ratings move to story cards)

## Problem

User feedback: /live is too clunky, too many clicks, too interruptive. The rigid 3-click turn-based protocol (speaker speaks → listener clicks 3 times → switch) interrupts natural conversation flow. Comprehension RATINGS don't need to happen inside /live — they can happen on story cards (P561).

## Solution

Strip /live to orchestration only:
- Start/stop recording
- Present stories and points to discuss (agenda)
- Assign speaker/listener roles
- Track which stories were discussed

The comprehension RATINGS happen on story cards via sliders (P561), not through /live's click protocol. /live becomes the conversation facilitator, not the rating mechanism.

## Acceptance Criteria

- [ ] /live session shows stories/points as discussion agenda
- [ ] Speaker/listener roles assignable
- [ ] Recording start/stop preserved
- [ ] The rigid 3-click rating protocol is removed or made optional
- [ ] Participants rate comprehension via story card sliders (P561) during or after the session
- [ ] Session tracks which stories were discussed (for provenance)
- [ ] Existing /live sessions in history remain accessible

## Open Questions

- How much of current /live UI to keep vs remove? Needs /ux exploration.
- Should /live still show real-time gap during conversation? (Sliders update live?)
- Does removing the rigid protocol lose anything valuable about the structured turn-taking?

## Out of Scope
- Comprehension slider implementation (P561)
- Transcription pipeline changes (P546/P552)
