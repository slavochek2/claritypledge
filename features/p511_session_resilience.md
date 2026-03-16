---
status: today
type: story
rank: 1
tags:
  - session
  - resilience
  - rejoin
  - mobile
delivery_stage: 4-tests-ready
prepped_date: '2026-03-14'
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T08:11:18.296Z'
uat_file: features/uat/p511.md
test_files:
  - src/tests/sessionResilience.test.ts
  - e2e/integration/p511-session-resilience-migration.spec.ts
  - e2e/p511-session-resilience.spec.ts
  - e2e/a11y/p511-accessibility.spec.ts
  - e2e/p511-smoke.spec.ts
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

**Why now:** Observed across multiple live events, most recently 2026-03-14. Participants struggled to return to sessions repeatedly. Root cause analysis identified 7 session-killing paths, all tracing back to one architectural assumption. Critical for post-C1 when pairs use /live independently without Slava present to verbally recover from failures. This is the single highest-impact UX fix.

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

**Two fix categories:**
- **Paths 1, 2, 3, 5, 7 (reconnection window):** Don't destroy session on pagehide. Use `last_activity_timestamp` + grace period. Only the "End Session" button kills immediately.
- **Paths 4, 6 (detection accuracy):** Polling falsely detects departure from stale data or race conditions. Grace period delays the symptom but doesn't fix the detection. `/architect` must address polling reliability separately.

## Business Requirements

**Must-haves:**
- Sessions survive page refresh, navigation away, mobile pull-to-refresh, and brief network drops
- Both creator AND joiner can rejoin an active session within the grace period
- Remaining partner sees "Reconnecting..." (not "Partner left") during grace period
- Grace period (2 minutes) countdown visible to remaining partner (e.g., "Partner will be disconnected in 1:45")
- After grace period expires, session ends cleanly for both
- "Active session" banner visible on ALL app pages when user has an active session
- Banner includes: rejoin button + end session button
- Only the "End Session" button (explicit action) kills a session immediately
- Navigation confirmation dialog (P410) removed entirely — sessions silently survive navigation. No dialog, no prompt. The grace period is the decision mechanism: if the user returns within 2 min, the session resumes; if not, it expires. The banner on other pages is the only reminder.
- Guest (unverified) user's display name persists in localStorage; on rejoin within grace period, name is restored without re-entry
- Joiner rejoin flow: joiner navigates to /live → sees "You have an active session" prompt with session code pre-filled (from localStorage or URL) → one-tap rejoin. If localStorage is cleared, joiner can manually re-enter the code on the /live landing page.

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
- **P495 dependency:** Recording/transcription behavior during grace period (mic re-acquisition, recording pause/resume on navigate-away) must be addressed in `/architect`

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
- [ ] After grace period (2 min), session ends cleanly for remaining partner
- [ ] Joiner can rejoin via /live landing page (session code pre-filled from localStorage or manual re-entry) within grace period
- [ ] Creator can rejoin via sessionStorage restoration within grace period
- [ ] Network drop does not show "Partner left" if partner reconnects within grace period
- [ ] "End Session" button immediately kills session (no grace period)
- [ ] P410 navigation confirmation dialog is removed entirely (no replacement dialog — silent survival)
- [ ] All navigation menu items always visible regardless of session state (remove `inActiveSession` hiding)
- [ ] Auto-close timer clearly communicates to user that session will expire
- [ ] No zombie sessions — grace period always expires and cleans up
- [ ] Guest (unverified) user's display name restored automatically on rejoin within grace period
- [ ] Attempting to create a new session while an active session exists shows rejoin prompt (prevents zombie sessions from second-session creation)

## Telemetry Enhancement (Prerequisite)

Before implementing, add `exit_reason` to Mixpanel `live_session_exited` event:
- `button_click` — user clicked "End Session"
- `pagehide` — page unloaded (refresh, navigate, tab close)
- `grace_expired` — partner didn't return within grace period
- `error` — JS error during session

This provides the baseline data to measure success.

## Next Steps

1. ~~Run `/ux features/p511_session_resilience.md` — design the banner, reconnecting state, and grace period UX~~ DONE
2. Run `/architect features/p511_session_resilience.md` — design DB changes (last_activity_at column), pagehide removal, grace period logic
3. Run `/generate-tests features/p511_session_resilience.md` — E2E tests for resilience scenarios
4. Run `/dev features/p511_session_resilience.md` — implement

---

## UX Design

### Lean Challenge

**No violations found.** This feature removes friction (navigation dialog, accidental session loss) rather than adding it. The grace period and banner serve all users equally — no one-user overhead. The scope is tight: survive disconnects, show a banner, enable rejoin. Recording interaction is correctly deferred to /architect.

---

### 1. User Flows

#### Flow 1: Creator Disconnects (refresh/navigate) and Rejoins

1. Creator is on /live in an active session
2. Creator refreshes the page or navigates to another page (e.g., /events)
3. Session stays alive in the database — no DB writes on pagehide
4. If navigated away: creator sees the active session banner at the top of whatever page they land on (see Screen Design A)
5. If refreshed: /live page reloads, detects active session via sessionStorage (session code + role), immediately reconnects to the same session — no banner needed, no intermediate state
6. Creator taps "Rejoin Session" (banner or page)
7. Creator is back in /live with full session state restored
8. Partner's "Reconnecting..." countdown disappears; session continues normally

#### Flow 2: Joiner Disconnects and Rejoins

1. Joiner is on /live in an active session
2. Joiner refreshes, closes tab, or navigates away
3. Session stays alive in the database
4. If tab closed: joiner opens the app again, navigates to /live
5. /live landing page detects an active session code in localStorage
6. Landing page shows a rejoin prompt (see Screen Design C): "Your session is still running" with session code pre-filled, one-tap "Rejoin" button
7. Joiner taps "Rejoin" — reconnects to session within grace period
8. If localStorage was cleared: joiner manually types the session code on /live landing — same rejoin flow

#### Flow 3: Guest (Unverified) Disconnects and Rejoins

1. Guest entered a display name when joining the session
2. Display name is persisted in localStorage alongside the session code
3. Guest disconnects (refresh, navigate, tab close)
4. Guest returns to /live within grace period
5. /live landing shows rejoin prompt with session code pre-filled AND display name shown: "Rejoin as [Name]"
6. Guest taps "Rejoin" — reconnects without re-entering name
7. If localStorage cleared: guest re-enters session code AND display name manually

#### Flow 4: Partner Sees "Reconnecting..." Countdown

1. One participant disconnects (any cause except "End Session" button)
2. Remaining partner's session UI transitions: partner's name area shows "Waiting for [Name] to return... 1:58 remaining"
3. Below the countdown, a reassurance line: "They may be refreshing or switching apps. You can keep reviewing your notes."
4. Countdown starts at 2:00, ticks down every second
5. During countdown, the remaining partner can still see all session content (stories, positions, ratings) — nothing is hidden or disabled
6. The session controls remain interactive (the remaining partner can still review their own content)
6. If partner reconnects before timer reaches 0:00 — countdown disappears, "[Partner name]" is restored, session continues
7. Brief success feedback: partner name area briefly shows a subtle pulse/highlight to confirm reconnection

#### Flow 5: Grace Period Expires

1. Countdown reaches 0:00
2. Remaining partner sees a final state: "Session timed out. Your partner may have lost connection."
3. This replaces the countdown text — no modal, no dialog
4. After 5 seconds, the page transitions to the normal session-ended view (summary/results screen, same as intentional end). "View Session Summary" link available immediately for users who want to skip the wait.
5. Session is marked as ended in the database
6. If the disconnected user returns to /live after expiry, they see the normal /live landing page — no rejoin prompt (session no longer exists)

#### Flow 6: User Intentionally Ends Session

1. User taps "End Session" button (in the /live session header)
2. Session ends immediately — no grace period
3. Both participants see the session-ended view
4. The active session banner (if visible on other pages) disappears
5. localStorage session code is cleared for the joiner
6. sessionStorage session data is cleared for the creator
7. Recording upload triggers normally (P495 dependency — behavior unchanged)

#### Flow 7: User Navigates Away — Silent Survival

1. User is on /live in an active session
2. User clicks any navigation link (logo, Events, Profile, bottom nav)
3. Navigation happens immediately — NO dialog, NO confirmation prompt, NO interception
4. The P410 navigation guard (pendingNavTo + confirm dialog) is removed entirely
5. Session stays alive in the background
6. Active session banner appears on the destination page (see Screen Design A)
7. User can browse freely — /events, /profile, /feed — banner persists on every page

#### Flow 8: User Tries to Create New Session While Active Session Exists

1. User has an active session (as creator or joiner)
2. User navigates to /live (via nav link, URL, or deep link)
3. Instead of the normal "Create/Join" landing, they see a rejoin prompt (see Screen Design C)
4. Prompt shows: "Your session is still running" with partner name (if known), session code de-emphasized
5. Two actions: "Rejoin Session" (primary) and "End Session" (secondary, destructive text link)
6. "End Session" ends the existing session (triggers grace period expiry for the partner), then shows the normal landing
7. "Rejoin Session" returns to the active /live session

#### Flow 9: Banner Interaction on Non-/live Pages

1. User is on any page (e.g., /events, /profile, /feed)
2. Active session banner is visible at the top of the page, below the main navigation
3. User taps "Rejoin" on the banner — navigates to /live, reconnects to session
4. User taps "End Session" on the banner — session ends immediately, banner disappears, user stays on current page
5. Banner does not interfere with page content — it pushes content down (not overlay)

---

### 2. Screen Designs

#### Screen Design A: Active Session Banner (non-/live pages)

**Placement:** Fixed position, directly below the main navigation bar (both desktop and mobile). Pushes page content down — not an overlay. Appears on every page except /live itself.

**Layout (single row, full width):**
```
[pulse dot] In session with [Partner Name]    [Rejoin Session]     End Session
```

- **Left:** Small blue pulsing dot (animation: 2s ease-in-out infinite, `text-blue-500`) + text "In session with [Partner Name]" in 14px/medium weight
- **Right:** Two buttons with deliberate spacing (gap-4 on desktop) to prevent accidental End Session taps
  - "Rejoin Session" — primary style (blue-500 background, white text, rounded-md, h-8, px-4)
  - "End Session" — ghost/text style (text-destructive, no background, underline on hover, h-8, px-3)
- **Background:** `bg-blue-50 border-b border-blue-200` (matches existing owner-preview-banner and install-banner pattern)
- **Text color:** `text-blue-900`
- **If partner name is unknown** (e.g., partner also disconnected): "In session — code [XXXX]"
- **Z-index:** Same as the navigation bar (z-50), positioned below it in DOM order

**Mobile adaptation:**
```
[pulse dot] In session with [Partner Name]
[Rejoin Session full-width]  End Session
```
- On screens < 640px: text and buttons stack into two rows
- "Rejoin" button becomes full width
- "End Session" becomes a text link aligned right on the button row

#### Screen Design B: "Reconnecting..." State with Countdown

**Placement:** Within the /live session page, replacing the partner name/status area in the session header.

**Layout:**
```
[spinner icon] Waiting for Alex to return...  1:45 remaining
               They may be refreshing or switching apps. You can keep reviewing your notes.
```

- **Spinner:** Small animated spinner (16px, `animate-spin`, `text-amber-500`)
- **Text:** "Waiting for [Name] to return..." in `text-amber-700`, 14px
- **Countdown:** "M:SS remaining" in `font-tabular-nums text-amber-600`, same line, right-aligned or after an em-dash
- **Reassurance line:** "They may be refreshing or switching apps. You can keep reviewing your notes." in `text-muted-foreground text-sm`, below the countdown line
- **Background change:** The session header area gets a subtle `bg-amber-50/50` tint to distinguish from normal state
- **No overlay, no modal** — the session content below remains fully visible and interactive
- **Below 0:30:** countdown text changes to `text-orange-600`, urgency signal (not red — red is reserved for destructive/error states)
- **At 0:00:** text changes to "Session timed out. Your partner may have lost connection." in `text-muted-foreground`

#### Screen Design C: Rejoin Prompt on /live Landing

**Placement:** Replaces the normal Create/Join form on the /live landing page when an active session is detected.

**Layout (card-style, centered):**
```
+------------------------------------------+
|                                          |
|  Your session is still running           |
|                                          |
|  In session with [Name]                  |
|  ABCD                     (muted, small) |
|  [For guest: "Rejoin as [Your Name]"]    |
|                                          |
|  [       Rejoin Session       ]          |
|                                          |
|           End Session                    |
+------------------------------------------+
```

- **Card:** `max-w-md mx-auto p-6 rounded-lg border border-border bg-card shadow-sm`
- **Heading:** "Your session is still running" — h3 size, `font-semibold`
- **Session details:** Partner name leads ("In session with Alex"), session code de-emphasized below in `text-muted-foreground font-mono text-sm`
- **Guest variant:** Adds "Rejoin as [Name]" (statement, not question) using the localStorage display name
- **"Rejoin Session"** button: Full width, primary style (blue-500), large (h-12)
- **"End Session"** link: Centered below, `text-destructive text-sm`, requires confirmation tap (inline "Are you sure?" toggle, not a dialog)

#### Screen Design D: Grace Period Expiry State

**Placement:** Within the /live session page, replaces the reconnecting countdown.

**Layout:**
```
Session timed out. Your partner may have lost connection.

[View Session Summary]
```

- **Text:** "Session timed out. Your partner may have lost connection." — centered, `text-muted-foreground`, 16px
- **After 5 seconds:** Automatically transitions to the session-ended/summary view
- **No manual action required** — but "View Session Summary" link is available immediately for users who want to skip the wait

---

### 3. Edge Cases

#### Error States
- **Session not found on rejoin attempt (grace expired):** "This session timed out — your partner waited but you didn't return in time." Show normal /live landing. Clear stale localStorage/sessionStorage.
- **Session not found on rejoin attempt (partner ended):** "[Name] ended the session while you were away." Show normal /live landing. Clear stored data.
- **Network error during rejoin:** "We couldn't reach the session. Make sure you're online, then tap Retry." Retry button visible.
- **Both partners disconnect simultaneously:** Grace period runs independently for each. First to return sees "Reconnecting..." for the other. If neither returns within 2 min, session expires via server-side cleanup.
- **Session code in localStorage but session already ended by partner:** Rejoin attempt fails gracefully — show "[Name] ended the session while you were away." message, clear stored code, show normal landing.

#### Loading States
- **Banner loading:** Banner shows immediately from localStorage data (session code, partner name). Session validity is confirmed async — if invalid, banner disappears without error.
- **Rejoin in progress:** "Rejoin" button shows spinner + "Rejoining..." text, disabled state. Timeout after 10 seconds — show "Could not rejoin. Try again."
- **Countdown rendering:** Countdown initializes from server-side `last_activity_at` timestamp, not client-side timer start. This prevents clock drift between partners.

#### Empty/Null States
- **No partner name available:** Banner shows "In session — code [XXXX]" without partner name. Rejoin prompt shows session code only.
- **Guest display name missing from localStorage:** Rejoin prompt shows session code but asks for name re-entry (single text field + rejoin button).
- **SessionStorage cleared (creator):** Creator arriving at /live without sessionStorage but with an active session in DB (detectable via auth + session query) — show rejoin prompt similar to joiner flow.

#### Validation
- **Stale session detection:** On app load or route change, validate session existence before showing banner. If session is expired/ended, silently remove banner and clear stored data.
- **Duplicate session prevention:** If user somehow has two session codes stored, use the most recent one (by timestamp if stored, otherwise the one that validates against DB).

---

### 4. Accessibility

#### Screen Reader Support
- **Active session banner:** `role="status"` with `aria-live="polite"` — announces "In session with [Partner Name]" when it appears
- **Reconnecting countdown:** `aria-live="assertive"` on the countdown region — announces at 30-second intervals via a visually-hidden summary (matching the visual countdown cadence for dual-channel users): "Waiting for [Name] to return, about 1 minute 30 seconds remaining", "about 1 minute remaining", "about 30 seconds remaining"
- **Grace period expiry:** Announced immediately: "Session timed out. Your partner may have lost connection."
- **Rejoin prompt:** Dialog-like focus management — focus moves to the rejoin prompt when it appears on /live landing

#### Keyboard Navigation
- **Banner buttons:** Fully focusable with Tab, activatable with Enter/Space
- **Tab order:** Banner comes after main navigation in tab order (natural DOM position)
- **Rejoin prompt:** Focus trapped within the prompt card until user takes an action (rejoin or dismiss)
- **"End Session" confirmation (rejoin prompt):** Inline confirmation is keyboard accessible — first Enter shows "Are you sure?", second Enter confirms

#### ARIA Attributes
- Banner container: `role="status"`, `aria-label="Active session notification"`
- Countdown timer: `role="timer"`, `aria-label="Time remaining for partner to reconnect"`
- Rejoin button: `aria-label="Rejoin active session"`
- End Session button (banner): `aria-label="End active session"`
- Pulsing dot: `aria-hidden="true"` (decorative)

#### Motion/Animation
- Pulsing dot respects `prefers-reduced-motion` — static blue dot instead of animated pulse
- Countdown timer uses `font-variant-numeric: tabular-nums` to prevent layout shift as digits change
- Reconnecting spinner respects `prefers-reduced-motion` — replaced with static icon

---

### 5. Responsive Design

#### Mobile (< 640px)
- **Active session banner:** Stacks into two rows — text on top, buttons below. "Rejoin" is full width, "End Session" is a text link right-aligned next to it. Banner sits below the top nav and above the page content. Does NOT overlap bottom nav.
- **Reconnecting state:** Countdown is inline with text, same row. Font sizes remain readable at mobile scale.
- **Rejoin prompt on /live:** Full-width card with generous padding (p-6). "Rejoin Session" button is full width (h-12, large tap target). Session code is large and readable.
- **Bottom nav interaction:** Bottom nav remains visible while banner is shown. No conflict — banner is at top, bottom nav is at bottom. Bottom nav "Start Session" icon navigates to /live, which shows the rejoin prompt if a session is active.
- **Safe areas:** Banner respects `safe-area-inset-top` on notched devices. Bottom nav already handles `safe-area-inset-bottom`.

#### Tablet (640px - 1024px)
- **Active session banner:** Single row layout (same as desktop). Buttons remain inline.
- **Rejoin prompt:** Card is constrained to `max-w-md`, centered.

#### Desktop (> 1024px)
- **Active session banner:** Full-width bar below navigation. Content centered within `container mx-auto` (matching existing banner patterns).
- **All elements in single row.** No stacking.
- **Reconnecting state:** Inline in the session header, which is wider — more breathing room around countdown.

#### Orientation Changes
- Banner adapts fluidly via Tailwind responsive breakpoints — no special orientation handling needed.
- Session state is preserved across orientation changes (no re-render triggers session loss).

---

### 6. Component Analysis

| Component | Classification | Notes |
|-----------|---------------|-------|
| `src/app/components/offline-banner.tsx` | **Reuse pattern** | Active session banner follows the same structural pattern: full-width bar, `bg-*-50 border-b border-*-200`, centered content. Use as template for banner layout. |
| `src/app/components/pwa/install-banner.tsx` | **Reuse pattern** | Same thin banner pattern with dismiss action. Reference for button placement and spacing. |
| `src/app/components/profile/owner-preview-banner.tsx` | **Reuse pattern** | Identical visual pattern (`bg-blue-50 border-b border-blue-200`). Active session banner should match this exact color scheme for consistency. |
| `src/app/components/partners/live-session-banner.tsx` | **Extend** | This is the /live session header. Must be extended to show "Reconnecting..." countdown state when partner disconnects. The "End Session" button already exists here — no new button needed on /live. |
| `src/app/contexts/live-session-context.tsx` | **Extend** | Currently tracks `isLive` and `pendingNavTo`. Must be extended to hold: active session code, partner name, session role (creator/joiner), and grace period state. `pendingNavTo` and its navigation-guard usage in SimpleNavigation/BottomNav will be removed. |
| `src/app/components/shared/confirm-dialog.tsx` | **Reuse** | Use for "End Session" confirmation in the rejoin prompt (Flow 8). Already supports destructive variant. |
| `src/app/components/layout/simple-navigation.tsx` | **Modify** | Remove all `isLive` / `setPendingNavTo` navigation interception logic. Links should navigate freely when session is active. The active session banner (new component, rendered in layout) replaces this guard entirely. |
| `src/app/components/layout/bottom-nav.tsx` | **Modify** | Remove the `isLive` guard that converts Links to buttons with `setPendingNavTo`. All nav items become normal Links regardless of session state. |
| `src/app/pages/clarity-live-page.tsx` | **Modify** | Remove `pagehide` handler that destroys sessions. Add rejoin detection logic (check sessionStorage/localStorage for active session on mount). Add reconnecting countdown UI within the live view. |
| `src/app/components/layout/navigation-menu-items.tsx` | **Review** | Currently receives `inActiveSession` prop. With P410 removal, this prop may no longer be needed (no navigation interception). Verify if it controls any other behavior. |
| **NEW: `src/app/components/session/active-session-banner.tsx`** | **Create** | New component for the global active session banner shown on non-/live pages. Rendered in the app layout (above page content, below nav). |
| **NEW: `src/app/components/session/rejoin-prompt.tsx`** | **Create** | New component for the rejoin card shown on /live landing when active session exists. |
| **NEW: `src/app/components/session/reconnecting-countdown.tsx`** | **Create** | New component for the "Partner reconnecting... M:SS" display within the /live session header. |

### P495 Dependency Note

Recording/transcription behavior during grace period (mic release on navigate-away, re-acquisition on rejoin, recording pause/resume) is out of scope for UX design. Flagged for `/architect` to address the interaction between P511 grace period and P495 recording state machine.

---

## Technical Design

### Technical Analysis

#### Current Code State

**Session lifecycle (DB layer):**
- `clarity_sessions` table has columns: `id`, `code`, `creator_name`, `joiner_name`, `live_state` (JSONB), `creator_profile_id`, `joiner_profile_id`, `mode`, `created_at`, `expires_at`. No `last_activity_at` column exists.
- Session "end" is signaled via `live_state.sessionEnded = true` (creator leaving) or `joiner_name = null` (joiner leaving). There is no `ended_at` column on the table itself.
- The `patch_live_state` RPC (SECURITY DEFINER) does atomic `jsonb || p_patch` merges on `live_state`, used by both normal state sync and the pagehide handler.

**Pagehide handler (lines 348-429 in `clarity-live-page.tsx`):**
- Fires on `pagehide` event. Skips if `e.persisted` (bfcache).
- If `!e.persisted` and user is in `view === 'live'`: immediately sends a `fetch({keepalive: true})` to DB:
  - Creator: calls `patch_live_state` with `{sessionEnded: true, sessionEndedAt: <ISO>}`
  - Joiner: PATCHes `joiner_name = null` on `clarity_sessions`
- This is the **core problem**: any non-bfcache page unload (refresh, navigate, tab close) permanently kills the session.
- The `pageshow` handler only resets `iAmLeavingRef` on `e.persisted` (bfcache restore). Does not handle non-bfcache page reloads.

**Session restoration (lines 530-589):**
- On mount, reads `sessionStorage` for `SESSION_CODE`, `USER_NAME`, `IS_CREATOR`.
- Fetches session from DB via `getClaritySession(savedCode)`.
- Creator with active session: restores into `waiting` or `live` view.
- Joiner: if `savedIsCreator !== 'true'` and no `joinerName` on session, clears storage (line 572-573). This is the **joiner restoration bug** — by the time the joiner refreshes, the pagehide handler has already nulled `joiner_name`, so the joiner is always treated as "joiner without session."
- Uses `sessionStorage` (per-tab), so tab close = data lost. Joiners have zero recovery path after tab close.

**Departure detection (subscription + polling, lines 630-858):**
- Supabase Realtime subscription on `clarity_sessions` by session ID.
- Polling fallback every 1000ms via `getClaritySession(code)`.
- Both check: (a) `live_state.sessionEnded` for creator departure, (b) `joinerName === null` for joiner departure.
- Detection is instant — no grace period. `partnerLeftRef.current = true` immediately triggers `PartnerLeftScreen`.
- Drift detection compares ~15 fields between server state and `confirmedLiveStateRef`.

**Navigation guard (P410):**
- `LiveSessionContext` exposes `isLive` and `pendingNavTo`.
- `simple-navigation.tsx` (lines 90-93, 149, 162): intercepts logo click and nav links with `setPendingNavTo(destination)` when `isLive === true`.
- `bottom-nav.tsx` (lines 107-117): converts `Link` to `button` with `setPendingNavTo` when `isLive`.
- `live-session-banner.tsx` (line 55): logo click intercepted with `setPendingNavTo('/')`.
- `navigation-menu-items.tsx`: `inActiveSession` prop hides navigation items during live session.
- `clarity-live-page.tsx` (lines 160-165): when `pendingNavTo` is set, shows exit confirmation dialog.
- Exit confirmation dialog (lines 2902-2927): "End session?" with Cancel/End Session buttons.

**AuthContext session cleanup (lines 174-191 in `AuthContext.tsx`):**
- On sign-out, reads `sessionStorage` for active session and patches DB (same as pagehide — sets `sessionEnded` or clears `joiner_name`).

**Layout structure (`clarity-landing-layout.tsx`):**
- Renders: `OfflineBanner` → `SimpleNavigation` → `<main>{children}</main>` → Footer → `BottomNav`.
- `LiveSessionProvider` wraps everything.
- Active session banner would slot between `SimpleNavigation` and `<main>`.

**Recording integration (P495/P28.1):**
- `useAudioRecorder` hook manages `MediaRecorder` with chunked upload mode (30s intervals).
- Recording starts on session join (after mic permission grant).
- `stopAndUploadRecording()` called on intentional exit and partner-left handlers.
- MediaRecorder holds a reference to the mic `MediaStream` — navigating away releases it (browser tears down stream on page unload). Resuming requires re-acquiring the mic.

#### Dependencies

- **P126** (departure detection) — pagehide handler. Will be gutted (no longer destroys session).
- **P410** (nav guard) — pendingNavTo + exit confirm dialog. Will be removed entirely.
- **P495** (transcription) — in-progress, depends on audio recording lifecycle. P511 changes when recording stops/starts.
- **P516** (telemetry) — `exit_reason` tracking in pagehide. Will be extended with `grace_expired` reason.

---

### Architecture Decisions

#### Decision 1: Grace Period Mechanism — Server-Side `last_activity_at` Column

**Chosen:** Add `last_activity_at TIMESTAMPTZ` column to `clarity_sessions`. Clients update it on every significant action (state change, heartbeat). Grace period = `now() - last_activity_at > 120s`.

**Rationale:** Server-side timestamp is the single source of truth for both partners. Client-side timers drift between devices and can't survive tab close. The remaining partner's countdown initializes from the server timestamp, preventing clock disagreement. The DB column also enables a future server-side cleanup job (cron to end zombie sessions where `last_activity_at` is stale).

**Trade-off:** Adds write traffic — every state change plus a periodic heartbeat (~30s interval) touches this column. Acceptable: `clarity_sessions` is already updated on every action via `patch_live_state`, so heartbeat adds ~2 extra writes/minute per participant.

**Alternative rejected:** Client-side-only timer (start 2-min countdown when partner disappears). Problem: if both partners disconnect, no one runs the timer, creating zombie sessions. Also, countdown start time disagrees between partners if one detects departure later than the other.

#### Decision 2: Reconnection Detection — Hybrid (Realtime + Polling)

**Chosen:** Keep existing dual-channel approach (Realtime subscription + 1s polling). Add a new detection path: when polling detects `joiner_name` was restored or `live_state.sessionEnded` was removed, transition from "reconnecting" back to "live."

**Rationale:** The existing hybrid approach handles mobile WebSocket dropout (common, well-documented in codebase comments). No new detection mechanism needed — the same polling that detects departure can detect reconnection by checking the inverse conditions. Adding a third channel (e.g., Supabase Presence) increases complexity without improving reliability over the existing battle-tested dual approach.

**Trade-off:** 1s polling is aggressive for a feature where reconnection windows are 2 minutes. Could reduce to 3s during grace period to cut DB reads by 2/3. Decision: keep 1s for now — the consistency with existing code outweighs the marginal cost, and faster detection improves perceived reliability.

**Alternative rejected:** Supabase Presence (tracks online/offline per user). Would require auth for both participants (guests can't use Presence easily). Also adds a third sync channel alongside Realtime + polling, increasing the surface area for race conditions.

#### Decision 3: Active Session Info Storage — Context + localStorage

**Chosen:** Extend `LiveSessionContext` to hold session metadata (code, partner name, role, grace state). Persist session info in `localStorage` (not just `sessionStorage`) so it survives tab close.

**Rationale:**
- **Context** provides reactive state for banner rendering across all pages (banner shows/hides as session state changes).
- **localStorage** provides persistence across tab close (required for joiner rejoin flow — joiner closes tab, reopens app, needs to know they have an active session).
- **sessionStorage** remains for creator's per-tab state (session ID, live state details) — but is supplemented by localStorage for the cross-tab "active session exists" signal.

**Trade-off:** Dual storage (localStorage + sessionStorage) adds complexity. Stale localStorage entries must be validated against DB on app load and cleared if session is expired. Mitigated by: validation on every banner render (async DB check, banner disappears if invalid).

**Alternative rejected:** Context only (no localStorage). Problem: tab close loses all state. Joiners could never rejoin after closing their tab. Context alone also doesn't persist across page refreshes for guest users without auth.

#### Decision 4: P495 Recording Interaction During Grace Period

**Chosen:** On navigate-away (pagehide without session destruction), recording pauses (MediaRecorder `pause()`). On rejoin, re-acquire mic and resume recording as a new MediaRecorder instance (browser releases mic stream on page unload). If grace period expires without rejoin, finalize the recording with the chunks captured so far.

**Rationale:** MediaRecorder's `pause()` is supported cross-browser and preserves the accumulated data. However, the mic `MediaStream` is released by the browser on page teardown — so on rejoin, we must `getUserMedia()` again and create a new MediaRecorder. The chunks from pre-disconnect are already uploaded (30s chunked mode), so no audio data is lost. The new recorder continues with the next chunk number.

**Trade-off:** There will be a gap in the recording corresponding to the disconnect duration. This is acceptable — the alternative (keeping mic stream alive during navigation) is impossible because browser page lifecycle releases media streams. The gap is accurately represented in chunk timestamps.

**Interaction with P495 transcription:** Transcription processes chunks independently. A missing chunk (the gap) results in a gap in the transcript, which is the correct representation of what happened. No special handling needed in the transcription pipeline.

#### Decision 5: Fixing Detection Accuracy (Paths 4 and 6 from Root Cause)

**Chosen:** Replace the binary departure signal (`joiner_name = null` / `sessionEnded = true`) with a heartbeat-based liveness check. Partner is "disconnected" when `last_activity_at` is older than a threshold (e.g., 10s). Partner is "departed" only when grace period (120s) expires OR "End Session" button is clicked.

**Rationale:** The current system has two false-positive paths:
- **Path 4 (network drop):** Polling reads stale data → detects `joiner_name = null` (set by the other client's pagehide) or sees stale state. With P511, pagehide no longer writes to DB, so a network drop just means `last_activity_at` stops updating. The remaining partner sees the gap and starts the grace timer.
- **Path 6 (polling/realtime race):** Slow networks cause divergent state between subscription and polling. With the grace period, a momentary divergence no longer triggers "Partner left" — it just pauses the heartbeat, which recovers when the next poll succeeds.

**Trade-off:** The 10s "disconnected" threshold means the remaining partner waits 10s before seeing "Reconnecting..." instead of the current instant detection. This is acceptable — 10s is short enough to feel responsive, long enough to absorb network blips. The threshold is a constant that can be tuned.

**Alternative rejected:** Keep instant detection but suppress the UI for 10s (debounce). Problem: the debounce happens client-side, so if both partners' clients disagree on timing, one partner sees "Reconnecting" while the other doesn't.

#### Decision 5b: Anonymous Joiner Heartbeat

**Chosen:** Only the creator sends heartbeats. Anonymous joiners (guests without `auth.uid()`) do NOT call `update_last_activity`. The creator's heartbeat alone keeps the session alive for both participants.

**Rationale:** Adding authorization to `update_last_activity` (required per security review) means the RPC checks `creator_profile_id = auth.uid()`. Anonymous joiners have no `auth.uid()` and cannot pass this check. Rather than creating a second auth path (session token, separate RPC), we accept that the creator's heartbeat is the session's liveness signal. If the creator disconnects, the grace period starts for the joiner. If the joiner disconnects, the creator's heartbeat keeps running — the creator detects joiner absence via stale `joiner_name` or polling.

**Trade-off:** If the creator disconnects but the joiner stays, the session expires after 2 min even though the joiner is still present. This is acceptable: (a) the joiner sees "Reconnecting..." and knows what's happening, (b) the creator likely returns if they accidentally refreshed, (c) if the creator truly left, the session should end.

#### Decision 6: Pagehide Handler Transformation

**Chosen:** Remove all DB-writing logic from the pagehide handler. Replace with: (a) analytics tracking only (keep `exit_reason: 'pagehide'` telemetry), (b) set a localStorage flag `session_disconnected_at` with current timestamp so the remaining partner's polling can detect the disconnect via stale `last_activity_at`.

**Rationale:** The spec requires that ONLY the "End Session" button kills a session. Pagehide must become a no-op for session state. The heartbeat mechanism (`last_activity_at`) handles departure detection — when heartbeats stop, the remaining partner starts the grace timer.

**Trade-off:** Intentional tab close (user closes browser tab, never returns) now takes up to 2 minutes to resolve instead of being instant. This is the correct trade-off per the spec — the 2-minute wait is the grace period working as designed. The remaining partner sees "Reconnecting..." with countdown.

**AuthContext sign-out:** The sign-out handler in `AuthContext.tsx` (lines 174-191) DOES still need to end the session immediately (sign-out is an intentional action, equivalent to "End Session"). This path is preserved.

---

### Security Review

**RLS Policies:**

- ⚠️ **HIGH: `patch_live_state` RPC is SECURITY DEFINER with no authorization check.** Accepts any `p_session_id` and any `p_patch` JSONB, runs as postgres (bypasses RLS). Any caller can patch `live_state` on ANY session. P511 relies on `last_activity_at` for grace period — without authorization, an attacker can keep any session alive forever or kill any session instantly. **Required fix:** Add caller validation inside the function (verify `auth.uid()` matches `creator_profile_id`, or that caller is a known participant).

- ⚠️ **LOW: UPDATE policy allows any caller to update any session** (as long as `creator_profile_id IS NOT NULL`). By design for anonymous joiner flow (`joiner_name` set). P511's grace period doesn't make this worse IF `patch_live_state` authorization is fixed (item above).

- ✅ SELECT policy is `USING(true)` — all sessions readable. Intentional for join-by-code. P511 extends session lifetime by 2 min (marginal exposure increase).

- ✅ INSERT requires verified host (`auth.uid() IS NOT NULL AND is_verified = true`).

**Authentication:**

- ⚠️ **MEDIUM: Joiner rejoin relies on name matching, not a session token.** The join flow checks `joiner_name === joinerName` — a string comparison on user-supplied name. A different person who knows the session code AND joiner's display name can impersonate the joiner. P511 widens the window to 2 minutes. **Required fix:** Store a `joiner_session_token` (random UUID) in localStorage on first join, validate on rejoin. Prevents name-based impersonation.

- ⚠️ **LOW: No rate limiting on session code lookups.** Session codes are 6 chars from 32-char alphabet (~1.07B possibilities). `Math.random()` (not crypto, but adequate for room codes). P511's longer session lifetime marginally increases brute-force window. Consider app-level rate limiting for join attempts at scale.

- ✅ Creator authentication is sound — `auth.uid()` + `is_verified`.

**Authorization:**

- ⚠️ **Covered by `patch_live_state` fix above.** Anyone with a session code can currently call `endClaritySession()` → `patch_live_state({sessionEnded: true})`. Fix authorization in the RPC to restrict to participants.

- ✅ Banner visibility is client-side only (localStorage). A crafted entry only affects the attacker's own browser. No server-side risk.

**Input Validation:**

- ✅ Session code normalized (`toUpperCase().trim()`) before parameterized DB queries. No SQL injection risk.
- ✅ Joiner name has DB constraint (`length(joiner_name) <= 100`) + client-side `MAX_NAME_LENGTH = 100`.
- ✅ React auto-escapes all text content (no XSS from localStorage display names).
- ✅ `patch_live_state` accepts JSONB stored in column, not executed. No injection risk.

**Data Protection:**

- ✅ Partner names in localStorage are limited PII (display names only, same-origin access).
- ✅ sessionStorage (creator) is tab-scoped. P511 adds localStorage for cross-tab signal — acceptable for display names and session codes.
- ✅ Grace period extends queryable window by 2 min. Marginal increase, not a new vulnerability class.

**Summary — Required Pre-Ship Fixes:**

1. **HIGH:** Add authorization to `patch_live_state` RPC (and new `update_last_activity` RPC) — validate caller is session participant
2. **MEDIUM:** Add `joiner_session_token` to prevent rejoin impersonation during grace period

---

### Implementation Approach

**Worktree recommended:** 13+ files to create/modify across DB schema, context, layout, page logic, and 3 new components.

#### Files to Create

1. **`supabase/migrations/YYYYMMDDHHMMSS_p511_session_resilience.sql`** — Add `last_activity_at TIMESTAMPTZ` column to `clarity_sessions`. Add `update_last_activity` RPC (SECURITY DEFINER, updates `last_activity_at = now()` for a given session ID). Add index on `last_activity_at` for efficient zombie cleanup queries.

2. **`src/app/components/session/active-session-banner.tsx`** — Global banner component. Reads session state from extended `LiveSessionContext`. Renders "In session with [Name]" + Rejoin/End buttons. Follows `owner-preview-banner.tsx` pattern (`bg-blue-50 border-b border-blue-200`). Responsive: stacks on mobile.

3. **`src/app/components/session/rejoin-prompt.tsx`** — Card component for /live landing page. Shows when localStorage has active session code. "Your session is still running" + Rejoin/End. Validates session against DB before rendering.

4. **`src/app/components/session/reconnecting-countdown.tsx`** — Countdown timer component for /live session view. Shows "Waiting for [Name] to return... M:SS remaining". Initializes from server `last_activity_at`. Handles expiry transition.

5. **`src/hooks/use-session-heartbeat.ts`** — Hook that calls `update_last_activity` RPC every 30s while session is active. Starts when view === 'live', stops on unmount or session end.

6. **`src/hooks/use-active-session.ts`** — Hook for detecting active session from localStorage on app load. Used by layout to show/hide banner. Validates against DB async.

#### Files to Modify

1. **`src/app/contexts/live-session-context.tsx`** — Extend interface: add `activeSessionCode`, `activeSessionPartnerName`, `activeSessionRole`, `isGracePeriod`, `gracePeriodPartnerName`. Remove `pendingNavTo` and `setPendingNavTo`. Add methods: `setActiveSession()`, `clearActiveSession()`.

2. **`src/app/pages/clarity-live-page.tsx`** — (a) Remove pagehide DB writes (keep analytics only). (b) Remove exit confirmation dialog and `showExitConfirm` state. (c) Remove `pendingNavTo` usage. (d) Add heartbeat hook. (e) Replace instant departure detection with grace-period-aware detection (start countdown instead of showing PartnerLeftScreen). (f) Add rejoin detection (poll detects partner returned → cancel countdown). (g) Persist session info to localStorage on join. (h) Add rejoin prompt rendering on /live landing when active session detected.

3. **`src/app/layouts/clarity-landing-layout.tsx`** — Add `ActiveSessionBanner` between `SimpleNavigation` and `<main>`. Conditionally render when `activeSessionCode` is set in context and current path is not `/live`.

4. **`src/app/components/layout/simple-navigation.tsx`** — Remove all `isLive` / `setPendingNavTo` interception logic (lines 90-93, 128-139, 149, 162). Logo and nav links navigate freely regardless of session state.

5. **`src/app/components/layout/bottom-nav.tsx`** — Remove the `isLive` guard (lines 107-117). All nav items become normal `Link` elements regardless of session state.

6. **`src/app/components/partners/live-session-banner.tsx`** — Remove `setPendingNavTo` usage on logo click. Logo navigates freely. Keep "End Session" button (direct session end, no grace period).

7. **`src/app/components/layout/navigation-menu-items.tsx`** — Remove `inActiveSession` prop and the conditional hiding of nav items. All menu items always visible.

8. **`src/auth/AuthContext.tsx`** — Keep sign-out session cleanup (intentional action). Update to also clear localStorage session info.

9. **`src/app/data/api.ts`** — Add `updateSessionLastActivity(sessionId)` function calling the new RPC. Add `getActiveSessionByCode(code)` that returns session only if not expired (grace period check). Modify `clearSessionJoiner` — no longer called from pagehide (only from "End Session" button path).

#### Build Sequence

**Phase 1: Database + Heartbeat (foundation)**
1. Create migration: `last_activity_at` column + `update_last_activity` RPC
2. Run `./scripts/migrate.sh`
3. Add `updateSessionLastActivity()` to `api.ts`
4. Create `use-session-heartbeat.ts` hook
5. Wire heartbeat into `clarity-live-page.tsx` (fires every 30s during live view)
6. **Checkpoint: heartbeat writes to DB, existing behavior unchanged.**

**Phase 2: Remove Session Destruction on Pagehide**
7. Gut pagehide handler in `clarity-live-page.tsx` — remove fetch calls, keep analytics
8. Remove pagehide session cleanup from `AuthContext.tsx` sign-out? No — keep sign-out cleanup (intentional).
9. **Checkpoint: pagehide no longer kills sessions. Sessions now persist through refresh/navigate.**

**Phase 3: Grace Period Detection**
10. Modify subscription/polling handlers: instead of immediately setting `partnerLeft = true`, check `last_activity_at` age. If < 10s stale, ignore (normal latency). If 10-120s stale, enter "reconnecting" state. If > 120s, end session.
11. Create `reconnecting-countdown.tsx` component
12. Wire countdown into live view (replaces instant PartnerLeftScreen during grace period)
13. Add reconnection detection: if `last_activity_at` becomes fresh again, cancel countdown
14. **Checkpoint: remaining partner sees "Reconnecting..." countdown instead of "Partner left."**

**Phase 4: Navigation Freedom + Active Session Banner**
15. Remove P410 nav guard from `simple-navigation.tsx`, `bottom-nav.tsx`, `live-session-banner.tsx`, `navigation-menu-items.tsx`
16. Remove `pendingNavTo`/`setPendingNavTo` from `LiveSessionContext`
17. Remove exit confirmation dialog from `clarity-live-page.tsx`
18. Extend `LiveSessionContext` with active session metadata
19. Create `active-session-banner.tsx`
20. Add banner to `clarity-landing-layout.tsx`
21. Persist session info to localStorage on session join/create
22. Create `use-active-session.ts` hook for banner data
23. **Checkpoint: users can navigate freely, banner shows on all pages.**

**Phase 5: Rejoin Flow**
24. Create `rejoin-prompt.tsx` component
25. Modify /live landing in `clarity-live-page.tsx`: detect active session (localStorage + DB validation), show rejoin prompt instead of create/join form
26. Implement joiner rejoin: re-set `joiner_name` on session row, re-enter live view
27. Implement creator rejoin: restore from sessionStorage + localStorage, re-enter live view
28. Handle guest display name persistence in localStorage
29. **Checkpoint: both creator and joiner can rejoin within grace period.**

**Phase 6: P495 Recording Integration**
30. On navigate-away (view unmount without "End Session"): pause recording, upload pending chunks
31. On rejoin: re-acquire mic, create new MediaRecorder, continue chunk numbering
32. On grace period expiry: finalize recording with chunks captured so far

**Phase 7: Cleanup + Telemetry**
33. Add `exit_reason: 'grace_expired'` to Mixpanel tracking
34. Clean up stale localStorage on app load (validate against DB)
35. Add zombie session detection: sessions where `last_activity_at` > 10 minutes old → auto-end (can be a simple client-side check on polling, or future cron)

#### Migration

```sql
-- P511: Session resilience — grace period support
-- Adds last_activity_at for heartbeat-based liveness detection

ALTER TABLE public.clarity_sessions
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- Backfill existing sessions (use created_at as initial value)
UPDATE public.clarity_sessions
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

-- Index for efficient stale-session queries
CREATE INDEX IF NOT EXISTS idx_clarity_sessions_last_activity
  ON public.clarity_sessions(last_activity_at)
  WHERE last_activity_at IS NOT NULL;

-- RPC to update last_activity_at atomically
-- SECURITY DEFINER with participant authorization check
-- Only the session creator (authenticated) can send heartbeats.
-- Anonymous joiners do NOT heartbeat — the creator's heartbeat keeps the session alive.
-- Joiners rejoin by re-entering the session code within the grace period.
CREATE OR REPLACE FUNCTION update_last_activity(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE clarity_sessions
  SET last_activity_at = now()
  WHERE id = p_session_id
    AND creator_profile_id = auth.uid();
  -- No-op if caller is not the creator (anonymous joiners, non-participants)
END;
$$;
```

---

## Test Coverage Strategy

### What's Tested and Why

| Layer | File | What | Why |
|-------|------|------|-----|
| **Unit** | `src/tests/sessionResilience.test.ts` | Grace period timer (countdown, expiry, cancel), localStorage persistence (save/restore/clear/stale), heartbeat interval (start/stop/error), disconnect detection thresholds | Core logic that determines session survival. Bugs here = false "Partner left" or zombie sessions. Pure logic, no DOM — fast, deterministic. |
| **Integration** | `e2e/integration/p511-session-resilience-migration.spec.ts` | `last_activity_at` column exists, `update_last_activity` RPC works, RLS (participant vs non-participant), backfill verification | DB schema is the foundation. If migration fails, nothing works. Two-client pattern validates RLS. |
| **E2E** | `e2e/p511-session-resilience.spec.ts` | Navigation without dialog (P410 removal), active session banner, rejoin prompt on /live, stale localStorage cleanup | User-facing flows. Single-party tests fully automated. Two-party tests (refresh survival, countdown, reconnection) marked TODO with detailed plans — require two simultaneous browser contexts. |
| **Accessibility** | `e2e/a11y/p511-accessibility.spec.ts` | Banner ARIA (role="status", aria-live), countdown ARIA (role="timer"), keyboard nav, pulsing dot aria-hidden, prefers-reduced-motion | Three new visible components (banner, countdown, rejoin prompt) each need ARIA. Screen reader users must know about active sessions. |
| **Smoke** | `e2e/p511-smoke.spec.ts` | /live loads without errors (auth + anon), no banner when no session, stale localStorage doesn't crash | Fast regression gate. Catches "page doesn't load" immediately. |
| **UAT** | `features/uat/p511.md` | 17 scenarios covering all acceptance criteria | Manual validation by user. Given/When/Then with verification method. |

### What's NOT Tested and Why

| Area | Reason |
|------|--------|
| **Two-party live session flows** | Marked as TODO in E2E file. Requires two simultaneous browser contexts with independent auth, both connected to the same session. The test plan is documented in detail — implement when the components exist and a test harness for multi-context sessions is available. |
| **P495 recording interaction** | Out of scope per spec ("addressed in /architect"). Recording pause/resume during grace period depends on P495 implementation details not yet finalized. |
| **Mobile-specific gestures** | Pull-to-refresh, bfcache behavior, and iOS Safari page lifecycle are platform behaviors that cannot be reliably simulated in Playwright. Covered by UAT-2 (manual mobile testing). |
| **Server-side zombie cleanup** | Future cron job. Client-side zombie detection (stale `last_activity_at` > 10 min) is tested via unit tests. Server-side cron not yet implemented. |
| **Rate limiting on session code lookups** | LOW security concern per spec. Not testable at this layer — would need API-level rate limit middleware. |
| **Joiner session token (security fix)** | MEDIUM security fix not yet implemented. Integration test placeholder exists for non-participant authorization. |

### Test Pyramid Breakdown

```
         /\
        /  \  UAT: 17 manual scenarios
       /    \  (user validation)
      /------\
     /  E2E   \  9 automated + 6 TODO two-party
    /  + A11y  \  (browser flows)
   /  + Smoke   \
  /--------------\
 / Integration    \  7 tests (DB schema + RPC + RLS)
/------------------\
/      Unit         \  20+ test cases (timer, storage, heartbeat, detection)
\____________________/
```

**Confidence:** Unit + Integration cover the critical logic paths (grace period math, DB schema, RLS). E2E single-party tests cover navigation and banner. The gap is two-party real-time flows — these are the hardest to automate and are covered by UAT manual testing until a multi-context test harness is built.

### Files Generated

- `src/tests/sessionResilience.test.ts` — Unit tests
- `e2e/integration/p511-session-resilience-migration.spec.ts` — Integration tests
- `e2e/p511-session-resilience.spec.ts` — E2E tests
- `e2e/a11y/p511-accessibility.spec.ts` — Accessibility tests
- `e2e/p511-smoke.spec.ts` — Smoke tests
- `features/uat/p511.md` — UAT scenarios

---

## Consistency Check Results

✅ AC coverage: all 18 criteria map to build steps
✅ UX–Arch drift: no conflicts found
⚠️ Security blocker: `patch_live_state` RPC authorization (HIGH) has no build step — deferred as separate task (not blocking P511 MVP, but must ship before unattended pair sessions)

Proceeding to task manifest.

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: DB migration — `last_activity_at` column + `update_last_activity` RPC
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p511_session_resilience.sql` (create)
- **Spec refs:** "Technical Design > Migration (lines ~750-787)"
- **Tests:** `e2e/integration/p511-session-resilience-migration.spec.ts`
- **Depends on:** None
- **Verify:** `./scripts/migrate.sh` succeeds; integration tests pass (column exists, RPC works, authorization check blocks non-creators)
- [ ] Complete

### Task 2: API layer — heartbeat + active session query
- **Files:** `src/app/data/api.ts` (modify)
- **Spec refs:** "Implementation Approach > Files to Modify > api.ts (line ~697)"
- **Tests:** `src/tests/sessionResilience.test.ts` (heartbeat interval tests)
- **Depends on:** Task 1
- **Verify:** `updateSessionLastActivity()` and `getActiveSessionByCode()` functions exist; TypeScript compiles
- [ ] Complete

### Task 3: Heartbeat hook
- **Files:** `src/hooks/use-session-heartbeat.ts` (create)
- **Spec refs:** "Architecture Decisions > Decision 1 (lines ~538-546)", "Implementation Approach > Files to Create > use-session-heartbeat (line ~675)"
- **Tests:** `src/tests/sessionResilience.test.ts` (heartbeat start/stop/error tests)
- **Depends on:** Task 2
- **Verify:** Hook calls `updateSessionLastActivity` every 30s; stops on unmount
- [ ] Complete

### Task 4: Gut pagehide handler — remove DB writes
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** "Architecture Decisions > Decision 6 (lines ~594-612)", "Technical Analysis > Pagehide handler (lines ~476-482)"
- **Tests:** `e2e/p511-session-resilience.spec.ts` (page refresh doesn't kill session)
- **Depends on:** Task 3 (heartbeat must be running before pagehide stops writing)
- **Verify:** Page refresh does not set `sessionEnded=true` or null `joiner_name`; analytics still fire; heartbeat keeps session alive
- [ ] Complete

### Task 5: Wire heartbeat into live page
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** "Build Sequence > Phase 1 step 5 (line ~706)"
- **Depends on:** Task 3, Task 4
- **Verify:** During live session, `last_activity_at` updates every ~30s in DB
- [ ] Complete

### Task 6: Grace period detection — replace instant departure with countdown
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify), `src/app/components/session/reconnecting-countdown.tsx` (create)
- **Spec refs:** "Architecture Decisions > Decision 5 (lines ~577-592)", "UX Design > Screen Design B (lines ~310-320)", "UX Design > Flow 4 (lines ~214-221)"
- **Tests:** `src/tests/sessionResilience.test.ts` (disconnect detection thresholds), `e2e/a11y/p511-accessibility.spec.ts` (countdown ARIA)
- **Depends on:** Task 5
- **Verify:** When partner's `last_activity_at` goes stale >10s, "Waiting for [Name] to return... M:SS remaining" appears with reassurance line; at 0:00, shows "Session timed out" message; 5s transition to summary
- [ ] Complete

### Task 7: Remove P410 nav guard from layout components
- **Files:** `src/app/components/layout/simple-navigation.tsx` (modify), `src/app/components/layout/bottom-nav.tsx` (modify), `src/app/components/partners/live-session-banner.tsx` (modify), `src/app/components/layout/navigation-menu-items.tsx` (modify)
- **Spec refs:** "Build Sequence > Phase 4 steps 15-17 (lines ~722-724)", "UX Design > Flow 7 (lines ~241-249)"
- **Tests:** `e2e/p511-session-resilience.spec.ts` (navigation without dialog)
- **Depends on:** None (can run in parallel with Tasks 1-6)
- **Verify:** All nav links work during active session; no confirmation dialog; no `pendingNavTo` references remain; all menu items visible regardless of session state
- [ ] Complete

### Task 8: Extend LiveSessionContext + active session hook
- **Files:** `src/app/contexts/live-session-context.tsx` (modify), `src/hooks/use-active-session.ts` (create)
- **Spec refs:** "Implementation Approach > Files to Modify > LiveSessionContext (line ~681)", "Files to Create > use-active-session (line ~677)"
- **Depends on:** Task 7 (pendingNavTo must be removed first)
- **Verify:** Context provides `activeSessionCode`, `activeSessionPartnerName`, `activeSessionRole`, `isGracePeriod`; `pendingNavTo`/`setPendingNavTo` removed; `useActiveSession` hook validates localStorage against DB
- [ ] Complete

### Task 9: Active session banner component + layout wiring
- **Files:** `src/app/components/session/active-session-banner.tsx` (create), `src/app/layouts/clarity-landing-layout.tsx` (modify)
- **Spec refs:** "UX Design > Screen Design A (lines ~278-299)", "UX Design > Flow 9 (lines ~261-267)"
- **Tests:** `e2e/p511-session-resilience.spec.ts` (banner rendering), `e2e/a11y/p511-accessibility.spec.ts` (banner ARIA), `e2e/p511-smoke.spec.ts`
- **Depends on:** Task 8
- **Verify:** Banner appears on non-/live pages when session active; "In session with [Name]" + blue pulsing dot; Rejoin navigates to /live; End Session kills immediately; responsive stacking on mobile; `role="status"` + `aria-live="polite"`
- [ ] Complete

### Task 10: Rejoin prompt + localStorage persistence
- **Files:** `src/app/components/session/rejoin-prompt.tsx` (create), `src/app/pages/clarity-live-page.tsx` (modify)
- **Spec refs:** "UX Design > Screen Design C (lines ~322-344)", "UX Design > Flow 2 (lines ~193-200)", "UX Design > Flow 3 (lines ~202-210)", "UX Design > Flow 8 (lines ~251-259)"
- **Tests:** `e2e/p511-session-resilience.spec.ts` (rejoin prompt on /live), `e2e/a11y/p511-accessibility.spec.ts` (rejoin prompt focus)
- **Depends on:** Task 8, Task 6
- **Verify:** Navigating to /live with active session shows "Your session is still running" card; session code pre-filled; guest variant shows "Rejoin as [Name]"; "End Session" link with confirmation; joiner rejoin re-sets `joiner_name`; creator rejoin restores from sessionStorage; guest display name persists in localStorage
- [ ] Complete

### Task 11: AuthContext sign-out cleanup
- **Files:** `src/auth/AuthContext.tsx` (modify)
- **Spec refs:** "Implementation Approach > Files to Modify > AuthContext (line ~695)"
- **Depends on:** Task 8
- **Verify:** Sign-out ends session immediately AND clears localStorage session info
- [ ] Complete

### Task 12: P495 recording integration
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — recording hooks)
- **Spec refs:** "Architecture Decisions > Decision 4 (lines ~567-573)", "Build Sequence > Phase 6 (lines ~740-743)"
- **Depends on:** Task 6, Task 10
- **Verify:** Navigate away pauses recording + uploads pending chunks; rejoin re-acquires mic + continues chunk numbering; grace expiry finalizes recording
- [ ] Complete

### Task 13: Telemetry + zombie cleanup
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — telemetry), `src/hooks/use-active-session.ts` (modify — stale cleanup)
- **Spec refs:** "Telemetry Enhancement (lines ~159-162)", "Build Sequence > Phase 7 (lines ~745-748)"
- **Tests:** `e2e/p511-smoke.spec.ts` (stale localStorage doesn't crash)
- **Depends on:** Task 10
- **Verify:** `exit_reason: 'grace_expired'` fires in Mixpanel; stale localStorage entries cleared on app load; sessions with `last_activity_at` > 10 min detected as zombies
- [ ] Complete

**Total tasks:** 13 | **Can parallelize:** Task 7 with Tasks 1-6 (no shared dependencies) | **Must be sequential:** Task 1 → 2 → 3 → 4 → 5 → 6; Task 7 → 8 → 9, 10, 11; Task 10 + 6 → 12 → 13
