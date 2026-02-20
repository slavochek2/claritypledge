---
status: week
type: story
rank: 406.0
tags: [live, events, ux, session-start]
created_date: 2026-02-20
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
  tea: null
---

# P406: Event-Native Live Session Start (No QR/Link Required)

## Problem Statement

**Current state:** When two people at an event want to start a /live clarity session together, one person creates a session and must share a link or QR code out-of-band — via text, copy-paste, or physical scan. This is true even when both people are already on the event page and the system knows exactly who's attending.

**Pain points:**
- In a room full of known participants, you still need to copy a URL and somehow deliver it to another person
- QR scanning requires phones at the right angle, good lighting, correct app open
- Link sharing breaks the in-room social flow ("hold on, let me text you the link")
- The waiting screen (QR + share link) is designed for strangers — not for an event where both parties are already identified
- Coaches running group events lose credibility fumbling through link-sharing mechanics in front of clients

**Who's affected:**
- Event attendees who want to pair up for a live session during the event
- Event hosts/coaches facilitating group clarity practice
- New users at events (high friction → drop-off before ever experiencing the session)

---

## Intention (Why This Matters)

**Strategic importance:** Events are the highest-leverage distribution channel for Clarity Pledge. A coach runs an event, gets 10 people in a room, and wants them to pair up and experience /live. If pairing takes 2 minutes of logistics per pair, the coach loses the room. If it's one tap, every session starts on time.

This is specifically blocking the C2 coach market: coaches won't bring clients into a product that creates social friction in front of those clients.

**Why now:** The event infrastructure is built (participant lists, RSVP, event detail page). The /live page already knows about events (`isFromEvent`, `returnTo`). The missing piece is closing the loop: letting the event page be the rendezvous point instead of an external link exchange.

**Impact if not solved:**
- Coaches avoid using /live in facilitated group settings
- Event-to-session conversion stays low
- The product's most powerful social proof moment (watching someone pair up and do a live session in real time) is undermined by logistics

---

## Business Requirements

**Must-haves:**
- From the event detail page, a participant can initiate a /live session directly with another named participant — no link or QR required
- The invited participant sees the incoming request on the event page itself (no push notification, no email — the event page is the signal)
- The invitee can accept (join immediately) or decline
- If the invitee accepts, they land directly in the /live session — no intermediate steps
- Pending invites expire automatically if not accepted (no abandoned sessions floating indefinitely)
- A participant who is already in a session appears as unavailable (can't be double-invited)

**Success conditions:**
- Two people at the same event can go from "let's try this" to active /live session in under 10 seconds, touching only the event page
- No out-of-band communication needed at any point in the flow

**Constraints:**
- Must not require push notification infrastructure (no OS-level permissions)
- Must work within the existing DB polling pattern (no new realtime channel required)
- Must degrade gracefully: if partner is not on the event page, fall back to the existing link/QR flow (don't break existing behaviour)
- Must respect existing consent and privacy model (no forced session starts)

---

## User Stories

**As an event participant initiating a session:**
- I want to tap a "Practice" button next to a specific person's name on the event page, so I can invite them to a /live session without sharing a link
- I want to see when someone I invited has accepted or declined, so I know whether to wait or try someone else
- I want pending invites to automatically cancel if ignored, so I'm not left waiting indefinitely

**As an event participant receiving an invitation:**
- I want to see a clear incoming invite banner on the event page ("X wants to practice with you"), so I don't miss it
- I want to tap [Join] and land directly in the /live session, so I don't need to navigate anywhere else
- I want to be able to decline an invite, so I'm not forced into a session I'm not ready for

**As an event host/coach:**
- I want participants to pair up in seconds from the event page, so the facilitated practice flow isn't interrupted by logistics
- I want unavailable participants (already in session) to appear as such, so I can direct the pairing process without confusion

**As a participant not currently on the event page:**
- I want the system to fall back to the standard link/QR flow if my partner isn't on the event page, so sessions can still start even without both parties present in the app

---

## Jobs to Be Done

**When I'm at a clarity event and someone says "want to practice?":**
- I want to initiate a session directly from the app, so I can start immediately without breaking the social moment to exchange links (motivation: preserve social flow)

**When I'm facilitating a group event and asking pairs to start sessions:**
- I want pairing to happen in one tap per pair, so the whole room is in sessions within 60 seconds (motivation: professional facilitation credibility)

**When I receive an incoming practice request at an event:**
- I want to see it clearly without leaving the event page, so I can accept without losing context (motivation: minimal disruption)

**When my invited partner isn't looking at their phone:**
- I want the invite to wait patiently for a moment and then auto-cancel, so I know when to try someone else (motivation: no awkward hanging invitations)

---

## Outcomes (Success Metrics)

**Conversion:**
- Increase event-page-to-live-session conversion rate (baseline: unknown, target: >50% of pairing attempts result in a session within 60s)
- Reduce median time from "tap Practice" to active /live session (target: <15 seconds when both parties are on event page)

**Facilitation quality:**
- Coaches can pair up a room of 10 in under 2 minutes (vs. current estimated 10+ min with link sharing)

**Drop-off:**
- Reduce abandonment at the waiting/sharing screen for event-originated sessions (baseline: unknown, target: <10% abandonment when invite model is used)

**Adoption:**
- % of event-originated sessions that use the invite model vs. link/QR fallback (target: >70% after feature is visible to participants)

---

## Acceptance Criteria

- [ ] Participant sees a "Practice" action on each other participant's row in EventDetail
- [ ] Tapping "Practice" creates a /live session and shows a "Waiting for [Name]..." state on the event page (no redirect to /live waiting screen)
- [ ] The invited participant sees an incoming invite banner on their event page: "[Name] wants to practice with you" + [Join] and [Decline] buttons
- [ ] Tapping [Join] navigates invitee directly to the /live session (already active)
- [ ] Tapping [Decline] dismisses the banner and cancels the pending session; inviter is notified inline (e.g., "[Name] declined")
- [ ] Pending invites expire after ~60 seconds if not accepted; inviter sees timeout message
- [ ] A participant already in a session appears as "In a session" on the event page (Practice button disabled or hidden)
- [ ] If invitee is not currently on the event page, the system falls back to the existing link/QR waiting screen — no broken state
- [ ] The flow requires no OS-level push notification permissions
- [ ] The flow works on mobile and desktop browsers

---

## Open Questions

1. **Presence detection:** How do we know if a participant is currently on the event page? Options: lightweight heartbeat ping to DB, or optimistic (show "Practice" for all, let invite polling detect acceptance). Lean toward optimistic — fewer moving parts.

2. **Multiple pending invites:** What if Alice sends invites to both Bob and Carol simultaneously? Should simultaneous outbound invites be allowed? Simplest: one pending outbound invite at a time per user per event.

3. **Invite visibility scope:** Should the inviter's "Waiting for [Name]..." state appear on the event page inline, or does it navigate to a minimal overlay/modal? Inline is lower friction.

4. **Fallback trigger:** How does the system know the invitee is "not on the event page"? If invite isn't accepted in 60s, we consider them absent → show link/QR fallback at that point.

---

## Next Steps

1. Run `/ux features/p406_event-native-session-start.md` — design the invite flow, participant list states, banner UX, fallback behaviour
2. Run `/architect features/p406_event-native-session-start.md` — design DB schema for pending invites, polling approach, expiry mechanism
3. Run `/generate-tests` → `/dev` to implement
