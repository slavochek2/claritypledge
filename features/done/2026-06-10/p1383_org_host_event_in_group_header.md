---
status: all-done
type: story
rank: 16
created_date: 2026-10-01
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [groups, events, organizer, discoverability]
disclosure: public
pipeline_ran: [dev]
completed_at: 2026-10-01
---

# P1383: Organizer Host event in the group header, on every tab

## Problem
> Founder framing, verbatim: *"as an organizer i don't have inside my group host event button but i should you know because i have only host event buttons we have in the slash events"* and *"So I guess organizers inside groups should have host events somewhere, button."*

An organizer (the founder, organizer of both prod groups) could not find how to host an event from their group, and hosted a standalone /events event that belonged to no group. Host Event existed (P1060 D4) but only inside the group's Events tab, so it was invisible from About/Members and easy to miss on mobile.

## Solution
- Organizer-only **Host event** in `org-header.tsx`, linking `/events/new?org=<slug>`, visible on every tab. Single primary (P955): Invite is outline for organizers; members keep a blue Invite.
- Group-scoped `EventsList` no longer renders host actions (one action, one place).
- Empty-state copy per audience: organizer "No events yet / Use Host event above…"; members no longer told to "Join"; visitors unchanged.
- Under 400px the three header actions stack full-width (320 overflow).
- `org-page` clears `myRole` on group change so a stale organizer role never shows another group's Host event.

## Non-Goals
Pre-existing EventsList defects surfaced in review (infinite loading on fetch reject, fetch race, stale RSVPs on logout, invite slug encoding, blocked-Leave menu a11y) — recorded in decisions.md 2026-10-01 P1383, not fixed here.

## Acceptance Criteria
- [x] Organizer sees Host event on the About and Members tabs, href `/events/new?org=<slug>` — e2e/p1383-org-host-event-header.spec.ts (pass, 2026-10-01)
- [x] Exactly one Host event on the page (Events tab no longer duplicates it) — same spec, `toHaveCount(1)`
- [x] Member and visitor see no Host event; member keeps primary Invite — src/tests/p1383-org-host-event-header.test.tsx 4/4; mutation (isOrganizer=false) fails 2/4
- [x] Organizer empty copy shown; nobody already a member is told "Join to hear" — e2e spec, both roles
- [x] No overflow at 320 / 375 / desktop — screenshots re-shot after fix, Opus visual review
- [x] Existing group suites still pass — p1060, p1193, p1010 e2e: 37/37 total

## Review
Opus (visual), Codex gpt-5.6-sol high, Gemini 3.8 flash — 3 of 3 reported. Fixed: 320 overflow, stale role on group switch, member "Join" copy, two weak tests.