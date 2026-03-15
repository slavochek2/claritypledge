---
status: today
type: story
rank: 1
tags:
  - session
  - resilience
  - rejoin
  - mobile
delivery_stage: 1-prd-review
prepped_date: '2026-03-14'
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T08:11:18.296Z'
---

# P511: Session Resilience — Grace Period, Rejoin, and Active Session Banner

## Problem Statement

**Current state:** When a user accidentally refreshes, navigates away, experiences a network drop, or triggers pull-to-refresh on mobile, their live clarity session is immediately destroyed in the database. The remaining partner sees "Partner left" instantly. There is no grace period and no rejoin mechanism.

**Pain points:**
- Mobile pull-to-refresh kills sessions (app appears at bottom, users scroll up, accidentally trigger refresh)
- Navigating to any other page requires killing the session (confirmation dialog blocks navigation)
- Joiners have NO recovery path after tab close — only creators can restore via sessionStorage
- Network drops show "Partner left" immediately — no reconnection window
- The navigation confirmation dialog (P410) traps users: they can't browse the app while in a session
- Users observed struggling to come back to sessions repeatedly (multiple live events)

**Who's affected:** All live session participants, especially mobile users and non-technical users unfamiliar with the app.

**Predecessors:** P126 (departure detection — shipped, works but assumes pagehide = permanent departure), P410 (nav guard — shipped, but should be replaced by banner approach)

## Intention (Why This Matters)

**Strategic importance:** The /live session is the core product experience. Every lost session is a lost calibration opportunity and a frustrated pair of users. For co-founder pairs, losing a 30-minute session mid-conversation is extremely costly — they may not reschedule.

**Why now:** Observed repeatedly in live events (2026-03-14). Multiple participants struggled to return to sessions. Root cause analysis identified 7 session-killing paths, all tracing back to one architectural assumption. This is the single highest-impact UX fix.

**Impact if not solved:** Users lose trust in the app's reliability. "The app kicked me out" becomes the narrative. Co-founder pairs stop using /live for high-stakes conversations.

## Root Cause (5-Whys Analysis)

**Deepest root cause:** The `pagehide` handler assumes "page closing = permanent departure." Mobile pages are frequently *suspended* (not destroyed) — app backgrounding, pull-to-refresh, tab switching, memory pressure. The handler immediately patches the DB (`sessionEnded=true` for creator, `joiner_name=null` for joiner), destroying the session before the user has a chance to return.

**7 session-killing paths identified:**
1. **pagehide on tab close/navigate** — creator & joiner sessions immediately destroyed
2. **Joiner refresh** — restoration logic clears storage for joiners instead of restoring (line 550-552 in clarity-live-page.tsx)
3. **Mobile pull-to-refresh** — triggers pagehide, same as #1
4. **Network drop** — polling detects false departure from stale cached data
5. **bfcache restore** — doesn't re-establish realtime subscription (useEffect deps don't change)
6. **Polling/realtime race condition** — slow networks cause state divergence between partners
7. **Joiner has no rejoin mechanism** — no button, no recovery path, no code re-entry

**Single fix:** Don't destroy session on pagehide. Use `last_activity_timestamp` + grace period. Only the "End Session" button kills immediately.

## Business Requirements

**Must-haves:**
- Sessions survive page refresh, navigation away, mobile pull-to-refresh, and brief network drops
- Both creator AND joiner can rejoin an active session within the grace period
- Remaining partner sees "Reconnecting..." (not "Partner left") during grace period
- Grace period countdown visible to remaining partner (e.g., "Partner will be disconnected in 2:30")
- After grace period expires, session ends cleanly for both
- "Active session" banner visible on ALL app pages when user has an active session
- Banner includes: rejoin button + end session button
- Only the "End Session" button (explicit action) kills a session immediately
- Navigation confirmation dialog (P410) removed — sessions survive navigation

**Success conditions:**
- Accidental refresh does not end session for either participant
- User can navigate to /events, /profile, etc. and come back to session
- Joiner can rejoin by re-entering session code within grace period
- Zero "Partner left" false positives from network blips

**Constraints:**
- Must not create zombie sessions (grace period must auto-expire)
- Must work on mobile Safari (aggressive page lifecycle)
- Must not break intentional session exit flow
- Recording upload should still happen on intentional exit

## User Stories

**As a participant who accidentally refreshed:**
- I want my session to still be alive when the page reloads, so I don't lose 30 minutes of conversation

**As a participant who navigated away:**
- I want to see a banner on any page telling me I have an active session, so I can rejoin with one tap

**As the remaining partner:**
- I want to see "Reconnecting..." with a countdown, so I know my partner didn't intentionally leave and might come back

**As a joiner who closed their tab:**
- I want to rejoin by re-entering the session code within a few minutes, so I'm not permanently locked out

**As a mobile user:**
- I want pull-to-refresh to not kill my session, so I can use the app without fear on my phone

**As a participant who wants to leave:**
- I want the "End Session" button to immediately end the session, so my intentional exit is respected

## Jobs to Be Done

**When I accidentally refresh the page during a live session:**
- I want confidence the session is still running, so I can continue the conversation (motivation: protect time investment)

**When I need to check something else in the app mid-session:**
- I want to navigate freely and come back, so the session doesn't trap me on one page (motivation: flexibility)

**When my partner's connection drops:**
- I want to know they'll likely return, so I don't panic and leave too (motivation: trust in the system)

**When I want to intentionally end a session:**
- I want a clear, deliberate action that ends it, so accidental gestures can't mimic my intention (motivation: control)

## Outcomes (Success Metrics)

- **Reduce unintentional session exits by >80%** (measurable via new `exit_reason` Mixpanel property — track `pagehide` vs `button_click`)
- **Zero "Partner left" false positives from refresh/navigation** (measurable via partner_left events where partner rejoins within 60s)
- **Session completion rate increase** (measurable: sessions with checks_completed > 0 / total sessions started)
- **Rejoin success rate >90%** within grace period (new metric: rejoin events / departure events)

## Acceptance Criteria

- [ ] Page refresh (desktop and mobile) does not end the session
- [ ] Pull-to-refresh on mobile does not end the session
- [ ] Navigating to another page does not end the session
- [ ] "Active session" banner appears on all pages when session is active
- [ ] Banner has "Rejoin" button that returns to session
- [ ] Banner has "End Session" button that kills session immediately
- [ ] Remaining partner sees "Reconnecting..." with countdown during grace period
- [ ] After grace period (2-3 min), session ends cleanly for remaining partner
- [ ] Joiner can rejoin by re-entering session code within grace period
- [ ] Creator can rejoin via sessionStorage restoration within grace period
- [ ] Network drop does not show "Partner left" if partner reconnects within grace period
- [ ] "End Session" button immediately kills session (no grace period)
- [ ] P410 navigation confirmation dialog is removed
- [ ] Auto-close timer clearly communicates to user that session will expire
- [ ] No zombie sessions — grace period always expires and cleans up

## Telemetry Enhancement (Prerequisite)

Before implementing, add `exit_reason` to Mixpanel `live_session_exited` event:
- `button_click` — user clicked "End Session"
- `pagehide` — page unloaded (refresh, navigate, tab close)
- `grace_expired` — partner didn't return within grace period
- `error` — JS error during session

This provides the baseline data to measure success.

## Next Steps

1. Run `/ux features/p511_session_resilience.md` — design the banner, reconnecting state, and grace period UX
2. Run `/architect features/p511_session_resilience.md` — design DB changes (last_activity_at column), pagehide removal, grace period logic
3. Run `/generate-tests features/p511_session_resilience.md` — E2E tests for resilience scenarios
4. Run `/dev features/p511_session_resilience.md` — implement
