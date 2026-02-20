---
status: week
type: story
rank: 6.0
milestone: C1
tags: [navigation, sessions, history, mobile, ux]
prepped_date: '2026-02-20'
delivery_stage: prd-review
reviews:
  ux: null
  architect: null
  alignment: null
---

# P405: My Sessions — Session History in Global Nav

## Problem Statement

**Current state:** The `/live` main screen shows a "THIS SESSION" block listing completed rounds from the current active session. This is the only place session history appears — there is no way to review past sessions anywhere in the app.

**Pain points:**
- The main `/live` screen is cluttered with round history that users don't need to act on — it competes visually with the primary actions (start a session, search stories)
- There is no way to look back at past sessions ("what did we do last time with Slava?")
- History is ephemeral — once a session ends, the data is gone from the UI entirely
- First-time visitors see history they have no context for

**Who's affected:** Logged-in users who have completed one or more live sessions, particularly repeat users returning for a second or third session.

---

## Intention (Why This Matters)

**Strategic importance:** Session continuity is a core value prop for coaches using the product with clients. "My Sessions" turns a series of disconnected live events into a visible practice history — reinforcing habit formation and making the tool feel like a real practice log.

**Why now:** The `/live` screen is accumulating UI debt. Cleaning it up is a prerequisite for making the flow feel polished enough to show to coaches (C1 milestone). The data is already there — this is a presentation problem, not a data problem.

**Impact if not solved:** The main screen stays cluttered. Past session data remains permanently invisible after sessions end. Coaches can't review what was practiced with a client.

---

## Business Requirements

**Must-haves:**
- Users can access a list of their past live sessions from global navigation (both mobile and desktop)
- Each session entry shows: date, partner name, number of rounds completed
- Sessions with zero completed rounds are not shown (filtered out)
- The `/live` main screen no longer shows the "THIS SESSION" history block
- Sessions are visible to both participants (creator and joiner, if both have accounts)
- Guest participants (no account) do not see history (nothing to query against)
- Bottom nav does not offer "Sessions" tab while user is mid-session on `/live` (prevents accidental navigation away from active session)

**Success conditions:**
- User can answer "what did we practice last time?" without asking their partner
- The `/live` main screen feels focused — only actionable content remains

**Constraints:**
- No new database columns required (data exists in `live_state.sessionHistory` and `clarity_sessions`)
- My Events tab stays — it is a separate concept (calendar events, not live sessions)

---

## User Stories

**As a returning user before starting a new session:**
- I want to see a list of my past sessions, so I can remind myself what we practiced last time
- I want to see who I practiced with and how many rounds we did, so I can gauge session depth at a glance

**As a coach reviewing client progress:**
- I want to see a chronological list of all sessions with a client, so I can track how consistently we're practicing

**As a user on the `/live` main screen:**
- I want the main screen to show only actionable content, so I'm not distracted by history I don't need right now

**As a mobile user:**
- I want "My Sessions" reachable from the bottom nav, so I don't have to dig through menus

**As a desktop user:**
- I want "My Sessions" accessible from the top navigation or avatar menu, so it's always reachable

---

## Jobs to Be Done

**When I'm about to start a new session with the same partner:**
- I want to quickly see what we practiced before, so I can pick up where we left off without asking

**When I'm on the `/live` screen ready to practice:**
- I want to focus on starting or joining, so I'm not distracted by past round data

**When I'm a coach reviewing a client's engagement:**
- I want to see session frequency and depth, so I can assess how committed they are to the practice

---

## Outcomes (Success Metrics)

**Clutter reduction:**
- `/live` main screen: "THIS SESSION" block removed — 0 history items visible by default

**New capability:**
- Users can access past session list (currently impossible)

**Engagement signal:**
- Returning users who visit "My Sessions" at least once per week → indicates habit formation (track via Mixpanel)

---

## Acceptance Criteria

- [ ] "THIS SESSION" history block is removed from the `/live` main screen
- [ ] "My Sessions" is accessible from mobile bottom nav (new tab alongside My Events, My Profile, Start a Session)
- [ ] "My Sessions" is accessible from desktop navigation (avatar dropdown or top nav link)
- [ ] Sessions list shows: date, partner name, round count — in reverse chronological order
- [ ] Sessions with 0 completed rounds are not shown
- [ ] Both participants (if logged in) see the session in their own "My Sessions" list
- [ ] Guest participants (no account) see nothing — "My Sessions" requires login
- [ ] Bottom nav "Sessions" tab is hidden or disabled while user is in an active live session
- [ ] Tapping a session row shows the rounds completed in that session (title + skipped/completed status)
- [ ] Private sessions are visible to both participants but not to anyone else

---

## Next Steps

1. Run `/ux features/p405_my-sessions-history.md` — design flows and screens (mobile + desktop)
2. Run `/architect features/p405_my-sessions-history.md` — technical approach (query, nav wiring, nav suppression during live)
3. Run `/generate-tests features/p405_my-sessions-history.md`
4. Run `/dev features/p405_my-sessions-history.md`
