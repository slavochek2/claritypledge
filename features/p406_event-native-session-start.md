---
status: week
type: story
rank: 4.5
tags:
  - live
  - events
  - session-start
created_date: 2026-02-20T00:00:00.000Z
delivery_stage: prd-approved
reviews:
  ux: null
  architect: null
  tea: null
---

# P406: Practice Rooms — Event-Native Session Start

## Problem Statement

**Current state:** Starting a /live session requires one person to share a link or QR code out-of-band — copy/paste, scan, or text. Even at an event where all participants are known and logged in, there is no way to discover or join someone's open session from the event page.

**Pain points:**
- Two people at the same event still need to exchange a link to start a session
- The waiting screen (QR + link) is designed for strangers — not for a room of known participants
- Coaches facilitating group events lose the room fumbling through link-sharing mechanics
- No visibility into who's waiting to practice at any given moment

**Who's affected:**
- Event participants who want to pair up without exchanging links
- Coaches/hosts facilitating group clarity practice at events

---

## Intention (Why This Matters)

**Strategic importance:** Events are the highest-leverage distribution channel for Clarity Pledge. A coach gets 10 people in a room and wants them to pair up for /live sessions. If pairing requires link exchange, the coach loses momentum. If it's one tap from the event page, every session starts immediately.

**Why now:** Event infrastructure is built (participant lists, RSVP, event detail page). The /live page already tracks sessions. The missing piece is surfacing open sessions on the event page so participants can discover and join each other without any out-of-band step.

**Impact if not solved:** Coaches avoid using /live in facilitated settings. Event-to-session conversion stays low. The product's most powerful social proof moment is undermined by logistics.

---

## The Model

A **Practice Rooms** section lives on the event page, below the Participants list. Always visible — no host setup, no event state required.

- **Open a room** → navigates to normal `/live` waiting screen (QR + link unchanged)
- **Others on the event page** see your open room → tap [Join →] → joins the session directly
- **QR and link still work** as fallback for anyone not on the event page
- **Zero changes to `/live`** — this is purely additive

---

## Business Requirements

**Must-haves:**
- Practice Rooms section visible on every event page, below Participants
- Section shows all currently waiting sessions for this event
- Anyone can open a room (navigates to normal /live waiting screen)
- Anyone can join an open room directly from the event page
- In-session rooms (2 people) visible but not joinable
- No host action required — section works from the moment the event exists

**States:**
- No open rooms → empty state + [+ Open a room]
- Someone waiting → their name + [Join →]
- Two people in session → names + locked indicator
- You have an open room → "You · waiting..." + [Leave]

**Success conditions:**
- Two people at the same event can go from intent to active /live session without exchanging anything out-of-band
- QR/link fallback still works for participants not on the event page

**Constraints:**
- Zero changes to /live page
- No push notification infrastructure required
- Must use existing session polling pattern

---

## User Stories

**As an event participant wanting to practice:**
- I want to open a room from the event page, so I can signal I'm ready without sending anyone a link
- I want to see who's waiting to practice, so I can join them in one tap
- I want to use the normal QR/link if my partner isn't on the event page, so I'm never stuck

**As an event participant receiving visibility:**
- I want to see open rooms on the event page, so I know who's available to practice right now
- I want joining to take me directly to the session, so there's no extra navigation

**As a coach/host:**
- I want participants to pair up from the event page without my involvement, so facilitated practice flows without interruption

---

## Jobs to Be Done

**When I'm at an event and want to start a session:**
- I want to signal readiness from the event page, so others can find and join me without needing a link (motivation: remove logistics from social moment)

**When I see someone waiting on the event page:**
- I want to join them in one tap, so the session starts immediately (motivation: zero friction)

**When my partner isn't looking at the event page:**
- I want QR/link to still work, so I'm never blocked (motivation: no dead ends)

---

## Outcomes (Success Metrics)

- Reduce median time from "want to practice" to active session at events (target: <10s when both on event page)
- Increase event-page-to-session conversion rate
- % of event-originated sessions using room join vs link/QR (target: >60% when both parties are on event page)

---

## Acceptance Criteria

- [ ] Practice Rooms section appears on event page below Participants
- [ ] Section visible regardless of event date or host action
- [ ] [+ Open a room] navigates to /live waiting screen with `returnTo=/events/[slug]`
- [ ] Waiting sessions for this event appear with participant name + [Join →]
- [ ] [Join →] navigates directly to /live/[code] join flow
- [ ] In-session rooms (2 people) show as locked — not joinable
- [ ] Section polls and updates without page refresh
- [ ] Empty state shown when no open rooms exist
- [ ] [Leave] removes your open room from the list
- [ ] QR/link on /live waiting screen still works as fallback
- [ ] Zero changes to /live page behaviour

---

## Next Steps

1. Run `/ux features/p406_event-native-session-start.md` — design the Practice Rooms section, all states, mobile + desktop
2. Run `/architect features/p406_event-native-session-start.md` — session-event linking, polling query, DB changes if any
3. Run `/generate-tests` → `/dev`
