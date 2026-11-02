---
status: qa
type: change-request
drafted_by: opus
exec_model: opus
exec_effort: medium
rank: 1000108
changes: p1542
tags:
  - redesign
  - p1542
disclosure: public
created_date: 2026-11-02
delivery_stage: ship
pipeline_ran: [change-request, dev, ship]
---

# P1598: A hike's host walks "Learn the principle" in the room

> **Redesign of:** [P1542: Prepare and close per series](done/2026-06-10/p1542_series_prepare_close_recipes_social_hike.md)
> **What was wrong:** The room's step bar hid "Learn the principle" when the viewer was the host, and the `event_preparations` INSERT policy refused a host's row because a host has no RSVP. The host saw only "Decide" and "Share feedback".

## Operating Mode

This spec is an incremental correction to P1542, not a greenfield design. P1542 is read-only shipped history.

## Problem Statement

> Founder, 2026-11-02: "if I as a host cannot show, learn it, what it looks for me differently, then I cannot show, by example, other people where to click, you know?"

The founder usually hosts, so the person who demonstrates the room could not see the step attendees are told to use.

## Jobs To Be Done

- **Preserved from P1542:** an attendee learns in the room, then decides.
- **Corrected:** the host is no longer excluded from the learning.
- **New:** the host can show people where to click.

## Current State

```
Host:      Decide | Share feedback
Attendee:  Learn the principle | Decide | Share feedback
```

## Root Cause

`EventRoomMeet.tsx` built the step only when `user?.id !== event.hostId`. Policy "Registrant creates own preparation" (`20261001120000_p1336_event_preparations.sql:106`) required an RSVP row, and the `EventPrepPage.tsx` guard redirected anyone unregistered ("the host has none of their own").

## Redesign

```
Host:      Learn the principle | Decide | Share feedback
```

The INSERT policy allows a registrant or the event's host, own row only. `/events/:slug/prepare` admits the host and loads the group-chat link for them.

## Predecessor Sections Superseded

No P1542 section specified the host exclusion: it arrived in the code with no spec line or decision found. This extends P1542. It narrows P1336's "the host has no preparation"; P1336's "the host is excluded from every count" stands.

## Requirements

See Redesign. Alternatives rejected are in decisions.md 2026-11-02 [product].

## Invariants

- The host is excluded from every count: social proof, research places, the host's attendee list.
- A person can only create their own preparation row.

## What Stays the Same

Clarity Night rooms (no Learn step), attendee behaviour, step labels, every count.

## Surfaces in Scope

**In scope:** `EventRoomMeet.tsx`, `EventPrepPage.tsx`, the `event_preparations` INSERT policy.

**Out of scope:** the first-time view for a host who already learned: they land on the end screen with finished steps reopenable (`use-auto-finish.ts`); a test attendee account shows the first-time steps.

## Acceptance Criteria

- [x] A hike's host sees "Learn the principle" in the room. *Evidence: `e2e/host-learns-in-room.spec.ts`, `src/tests/p1542-founder-uat-room.test.tsx` (fails with the old check).*
- [x] A host with no RSVP starts the learning and it saves. *Evidence: `e2e/host-learns-in-room.spec.ts`, row read back from the test DB.*
- [x] The host is not redirected off `/events/:slug/prepare`. *Evidence: same spec; fails with the old guard.*
- [x] A stranger and a host forging another person's row are refused. *Evidence: `e2e/integration/p1336-db-schema.spec.ts`, 15 passed.*
- [x] A host's finished row moves no count. *Evidence: same integration spec, social proof before and after.*
- [x] Surfaces not in scope unchanged; existing P1542 tests pass. *Evidence: vitest `src/tests/p1542`, 354 passed, 1 skipped.*

## Known limitations

The browser test stops after step one; a finished state is covered at the database level. Host tabs were viewed at desktop width only.

## Next Steps

`/push` applies the migration to prod.
