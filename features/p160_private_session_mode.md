---
status: backlog
type: story
rank: 125235.0
workstream: C2
tags: [privacy, recording, live, consent]
prepped_date: '2026-02-17'
delivery_stage: arch-review
reviews:
  ux: null
  architect: null
created_date: 2026-02-17
---

# P160: Private Session Mode (No Recording)

## Problem Statement

**Current state:** Every clarity session on `/live` is always recorded — audio is captured, chunked, and uploaded to GCS for ML training. Users see a "Session recorded for AI Insights" banner but have no way to opt out.

**Pain points:**
- Users who want to practice with sensitive topics (personal relationships, work conflicts, health) can't do so without that content being recorded for ML training
- Users exploring the product for the first time may feel uncomfortable being recorded before they've built trust
- Coaches who want to demonstrate the product to clients face friction — clients may object to recording
- The binary "all or nothing" model creates a barrier for users who want the clarity check mechanics but not the data capture

**Who's affected:**
- New users evaluating the product (skeptical of recording before trust is established)
- Users practicing with personally sensitive content
- Coaches bringing clients into the product

---

## Intention (Why This Matters)

**Strategic importance:** The recording banner is a trust signal — but it's also a friction point for users who aren't ready to share their data. Giving users control over recording increases the pool of people willing to try the product, without compromising the ML training pipeline (private sessions simply don't contribute data).

**Why now:** As Clarity Pledge moves from early adopters to broader coach market (C2 milestone), the product will encounter users with higher privacy expectations. Removing this barrier now prevents it from becoming a recurring objection in coach sales conversations.

**Impact if not solved:** Users with sensitive content avoid the product entirely. Coaches lose deals when clients object to recording. The "recorded by default" model becomes a trust liability rather than a trust signal.

---

## Business Requirements

**Must-haves:**
- Creator can toggle recording off before starting the session (in waiting room)
- Toggle defaults to ON (recording enabled)
- When recording is OFF: no mic permission requested, no audio captured, no events uploaded to GCS, no entry in `ml_training_sessions`
- When recording is OFF: the session still saves to the database (session history preserved)
- Toggle is locked once the session begins — can't change mid-session
- Joiner inherits the creator's recording setting (they can't override it)
- Both participants see clear visual indication of the recording state during the session
- The consent checkbox for non-logged-in users should remain visible in private mode, but the label text changes — the recording sentence is removed, leaving only the T&C/Privacy acceptance (T&C acceptance is always required for guest users)

**Success conditions:**
- User can complete a full clarity check session with zero audio/event data captured
- The product's core mechanics (rating, explain-back, results) work identically in private mode
- Both participants always know the recording status of their session

**Constraints:**
- Session still persists in DB — private mode is about ML data, not session history
- Cannot change recording mode mid-session — set once at creation
- Only the creator controls the toggle — joiner doesn't get a separate choice

---

## User Stories

**As a session creator who wants privacy:**
- I want to turn off recording before I start a session, so I can practice with sensitive topics without that content being used for ML training
- I want the toggle to be visible in the waiting room, so I can make an informed choice before inviting my partner

**As a session joiner:**
- I want to see clearly whether the session I'm joining is being recorded, so I can decide whether I'm comfortable proceeding
- I want the recording status to be set by the creator, so I don't have to negotiate it with my partner before starting

**As a user in a private session:**
- I want the product to work exactly the same as a recorded session (ratings, explain-back, results), so I get full value without the recording
- I do NOT want to be asked for microphone permission, so the experience feels consistent with my privacy choice
- I want a clear visual indicator that this session is private, so I'm not confused by the absent recording banner

**As a coach demonstrating the product:**
- I want to show clients the product in private mode, so skeptical clients aren't blocked by recording concerns
- I want to be able to switch to recorded mode for regular sessions, so private mode doesn't become the permanent default

---

## Jobs to Be Done

**When I want to practice with vulnerable or sensitive content:**
- I want confidence that this conversation stays between me and my partner, so I can engage authentically without self-censoring (motivation: psychological safety)

**When I'm new to Clarity Pledge and evaluating whether to trust it:**
- I want to try a session without giving up my data first, so I can experience the value before committing to data sharing (motivation: trust before contribution)

**When I'm a coach introducing a client to the product:**
- I want to remove the recording barrier from the first demo, so clients focus on the clarity check mechanics rather than privacy concerns (motivation: reduce friction to adoption)

---

## Outcomes (Success Metrics)

**Adoption:**
- Reduction in session abandonment in the waiting room (users who see the recording banner and leave without completing setup)
- Private sessions created as % of total sessions — indicates demand for the feature

**Conversion:**
- Coaches report fewer client objections during demos (qualitative, tracked via user interviews)
- Reduction in "I don't want to be recorded" support messages

**Product integrity:**
- Zero audio/event data uploaded for sessions created in private mode (verifiable in GCS and `ml_training_sessions` table)
- Clarity check mechanics work identically in private vs recorded sessions

---

## Acceptance Criteria

- [ ] Recording toggle is visible in the waiting room before session starts, defaulting to ON
- [ ] When toggle is turned OFF, no microphone permission dialog is shown
- [ ] When toggle is turned OFF, no audio is recorded or uploaded
- [ ] When toggle is turned OFF, no events snapshot is uploaded to GCS
- [ ] When toggle is turned OFF, no entry is created in `ml_training_sessions`
- [ ] The session is still saved to the database regardless of toggle state
- [ ] The toggle is locked (non-editable) once the session transitions to active/live state
- [ ] Joiner sees the recording state clearly when they join (e.g., "This session is private — not recorded" or "This session is being recorded")
- [ ] The "Session recorded for AI Insights" banner is NOT shown in private mode
- [ ] A clear "Private session" indicator IS shown in private mode
- [ ] The consent checkbox for guest users changes label text in private mode (removes recording sentence, keeps T&C acceptance)
- [ ] All clarity check mechanics (rating, explain-back, results, scoring) work identically in private mode
- [ ] Private mode works on mobile and desktop

---

## Next Steps

1. ~~Run `/ux features/p393_private_session_mode.md`~~ ✅ UX complete
2. ~~Run `/architect features/p393_private_session_mode.md`~~ ✅ Architecture complete
3. ~~Run `/generate-tests features/p393_private_session_mode.md`~~ ✅ Tests generated
4. Run `/dev features/p393_private_session_mode.md` — implement

---

## Current State vs Changes

This section documents exactly what exists today and what P160 changes. Nothing else should be touched.

### `src/app/pages/clarity-live-page.tsx` — primary file

**Start view (create flow) — what exists today:**
- Name input + email input (guest only)
- Consent checkbox with label: `"I agree this session is recorded for AI Insights, and I accept the Terms & Privacy Policy"`
- `consentChecked` state; `guestCanProceed` requires it when not logged in
- "New Session" button

**Start view — what P160 adds:**
- Recording toggle (new `isPrivate` state, default `false` = recording ON)
- Toggle between: "Record for AI Insights" (ON) / "Private session — Not recorded" (OFF)
- Consent checkbox label changes based on toggle state:
  - When ON (default, unchanged): `"I agree this session is recorded for AI Insights, and I accept the Terms & Privacy Policy"`
  - When OFF: `"I accept the Terms & Privacy Policy"`
- `consentChecked` resets to `false` whenever toggle changes (user must re-agree to new label text)
- `isPrivate` flag passed to `createClaritySession()` call

---

**Waiting room — what exists today:**
- "Invite Your Partner" heading
- Share link row (URL + Share button)
- QR code
- Cancel button
- No recording status indicator

**Waiting room — what P160 adds:**
- Status badge inserted between share link row and QR code
- When private: gray badge (`bg-muted border`), shield icon, text "Private session — Not recorded"
- When recording (default): blue badge (`bg-blue-50 border-blue-200`), Sparkles icon, text "Recording enabled for AI Insights"
- Badge is display-only — no interaction, no toggle here

---

**Join via link (join flow, `urlCode` present) — what exists today:**
- Heading: "Join [hostName]'s Session"
- Name input + email input (guest only)
- Consent checkbox (same label as create flow)
- "Join Session" button disabled until `consentChecked`

**Join via link — what P160 adds:**
- Session status badge inserted between heading and name input
- Badge fetched from session data (already loaded to show `hostName`); no extra API call needed
- When private: gray badge, "Private session — Not recorded"
- When recorded: blue badge, "This session will be recorded for AI Insights"
- Consent checkbox label changes based on session's recording state (same logic as create flow)
- Loading: skeleton placeholder while session data loads; omit badge on error (fail silently)

---

**`guestCanProceed` / join button disabled state — what exists today:**
```
const guestCanProceed = isLoggedIn || (!validateName(name) && !validateEmail(email) && consentChecked);
```

**What P160 changes:**
- Logic unchanged — checkbox is always required for guests (label just changes)
- No change to disabled condition

---

### `src/app/components/partners/live-mode-view.tsx`

**What exists today:**
```tsx
function RecordingIndicator() {
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-50 border-b border-blue-200">
      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-xs text-blue-700">Session recorded for AI Insights</span>
    </div>
  );
}
// Used as: <RecordingIndicator /> — always rendered, unconditionally
```

**What P160 changes:**
- `RecordingIndicator` gains an `isPrivate: boolean` prop
- When `isPrivate=false` (default): renders current blue band, unchanged
- When `isPrivate=true`: renders gray band (`bg-muted border-b border-border`), shield icon, text "Private session"
- Call site passes `session.isPrivate` (or equivalent flag from session state)

---

### What is NOT changing

- All clarity check mechanics (rating, explain-back, results, scoring) — untouched
- `ConsentNotice` component (`src/app/components/legal/consent-notice.tsx`) — not used in live flow, not touched
- `TermsUpdateDialog` — not touched
- Session persistence to database — unchanged (private sessions still save)
- Logged-in user flow — no consent checkbox shown today; no change for P160
- The `recordSessionConsent()` / `recordTermsAcceptance()` calls — still fire in private mode (T&C acceptance is still recorded)
- Audio recording hooks — gated by `isPrivate` flag upstream; no changes to the hooks themselves

---

## UX Design

### Overview

The recording toggle is a session-level setting controlled exclusively by the creator. It is set once before the session starts (in the waiting room) and locked for the duration of the session. Both participants always know the recording state. The experience must be low-friction: one extra tap to go private, not a multi-step wizard.

---

### User Flow 1: Creator Turns Off Recording (Happy Path)

**Entry point:** Creator is on `/live` — Start view — about to click "New session"

**Steps:**

1. Creator fills in their name (and email if guest) on the Start view — same as today.
2. Below the name/email inputs and above the "New session" button, a recording toggle row is visible.
   - Default state: Toggle is ON. Label reads "Record for AI Insights".
3. Creator taps the toggle to turn it OFF.
   - Toggle switches to OFF state. Label updates to "Private session — not recorded".
   - The consent checkbox (for guest users) label changes to "I accept the Terms & Privacy Policy" (recording sentence removed). The checkbox is cleared and must be re-checked.
4. Creator clicks "New session".
5. Creator lands in the Waiting Room. The recording state is shown as a status badge below the share link row.
   - Private state: badge reads "Private session — not recorded" with a shield icon (muted gray styling, not blue/green).
   - The toggle is no longer interactive here — it is display-only.
6. Creator shares the link. Partner joins.
7. Both transition to the Live view.

**Exit:** Live view — no recording indicator banner shown; instead a "Private session" pill shown.

---

### User Flow 2: Creator Keeps Recording ON (Default Path — unchanged)

**Entry point:** Same Start view.

**Steps:**

1. Creator fills name/email. Toggle is ON (default).
2. No action needed — creator clicks "New session".
3. Waiting Room shows the recording badge: "Recording enabled for AI Insights" (blue styling, matching the current banner tone).
4. Partner joins. Both enter Live view.
5. Existing "Session recorded for AI Insights" banner shows as today.

**Exit:** No change to existing behavior.

---

### User Flow 3: Joiner Joins a Private Session (via Link)

**Entry point:** Joiner opens shared link `/live/{code}` — lands on "Join [Name]'s Session" screen.

**Steps:**

1. Joiner sees the session name in the heading (e.g. "Join Alex's Session").
2. Below the heading, a session status badge is visible before the joiner fills in their name:
   - Private: badge reads "Private session — not recorded" with a shield icon (muted gray).
   - Recorded: badge reads "This session will be recorded for AI Insights" (blue, informational).
3. The consent checkbox label changes when the session is private: "I accept the Terms & Privacy Policy" (no recording sentence).
4. Joiner fills in name (and email if guest).
5. Joiner clicks "Join Session".
6. Joiner enters Live view. Private session pill is visible in the session header area (below the nav bar).

**Exit:** Live view — private session pill visible throughout.

---

### User Flow 4: Joiner Joins a Private Session (via Code)

Same as Flow 3, but the joiner is on the Start view and types a code into the "Enter a code or link" input. After they enter a valid code, the session status badge (private or recorded) appears inline below the code input before they click Join. This requires a lightweight API call to check recording status once a valid code is detected.

**Decision branch:** If the code is invalid or not yet found, no badge is shown. Badge appears only after a valid code resolves.

---

### Screen Designs

#### Screen A: Start View — Recording Toggle

Location: Between the name/email fields and the "New session" / code join controls.

Layout (vertical stack, centered, max-w-[280px]):
```
[ Name input ]
[ Email input (guest only) ]

+------------------------------------------+
| [toggle switch]  Record for AI Insights  |
|                  (when ON)               |
+------------------------------------------+
  or
+------------------------------------------+
| [toggle switch]  Private session         |
|                  Not recorded            |
|                  (when OFF)              |
+------------------------------------------+

[ Consent checkbox — always shown; label changes when private ]

[ New session button ]    [ code input + Join ]
```

Toggle design:
- Uses a standard switch (left = off, right = on), consistent with the shadcn/ui Checkbox style already in the codebase. Because the Switch component is not yet installed, the toggle uses a styled `<button role="switch">` with aria-checked attribute.
- Toggle ON: muted blue styling (`bg-blue-100 border-blue-200`), label text in `text-muted-foreground`.
- Toggle OFF: muted gray styling (`bg-muted border`), label text in `text-muted-foreground`. A shield icon (lucide `ShieldOff` or `EyeOff`) sits to the left of the label text.
- Toggle width: 36px x 20px (standard switch proportions), thumb slides left/right.
- The label area is 2 lines tall when OFF (to accommodate the subtitle "Not recorded") and 1 line when ON.

Visual hierarchy:
- The toggle row is secondary — not a primary CTA. It sits between inputs and buttons, visually separated by 8px spacing on each side.
- It should NOT compete with the "New session" primary action.

---

#### Screen B: Waiting Room — Recording Status Badge

Location: Below the share link row (above the QR code).

Layout:
```
[ "Invite Your Partner" heading ]
[ "Share this link to start your clarity session:" ]

[ claritypledge.com/live/ABC123  |  Share button ]

+--------------------------------------+
| [icon]  Private session              |  ← when OFF
|         Not recorded                 |
+--------------------------------------+
  or
+--------------------------------------+
| [icon]  Recording enabled            |  ← when ON
|         Session recorded for AI Insights |
+--------------------------------------+

[ QR Code ]
[ Cancel button ]
```

Badge design:
- Private: rounded pill/card with muted gray background (`bg-muted`), gray border (`border`), `ShieldOff` icon in `text-muted-foreground`, text in `text-sm text-muted-foreground`. NOT interactive (display only).
- Recorded: rounded pill/card with blue-50 background (`bg-blue-50`), blue-200 border, `Sparkles` icon in `text-blue-500` (matches the existing `RecordingIndicator` component styling), text in `text-sm text-blue-700`.
- Width: full width within the `max-w-md` container, similar to the share link row.
- The badge is non-interactive (no click target). It is purely informational.

---

#### Screen C: Join via Link — Session Status Badge

Location: Below the heading ("Join Alex's Session") and above the name input.

Layout:
```
[ "Join Alex's Session" heading ]

+--------------------------------------+
| [icon]  Private session              |  ← when private
|         Not recorded                 |
+--------------------------------------+
  or
+--------------------------------------+
| [icon]  This session will be         |  ← when recorded
|         recorded for AI Insights     |
+--------------------------------------+

[ Name input ]
[ Email input (guest only) ]
[ Consent checkbox — always shown; label text shorter in private mode (T&C only) ]
[ Join Session button ]
```

Loading state: While the badge is resolving (awaiting API response), show a skeleton placeholder (same dimensions as the badge, `bg-muted animate-pulse`, rounded). This prevents layout shift.

Error state: If the API call fails to retrieve recording status, omit the badge entirely (fail silently) — the session will proceed normally. Do not block the joiner.

---

#### Screen D: Live View — Private Session Indicator

Location: Below the `LiveSessionBanner` nav bar, in the same horizontal band where the existing "Session recorded for AI Insights" blue banner currently lives.

Behavior:
- When recorded (existing): Show the existing `RecordingIndicator` blue banner as today.
- When private (new): Show a private session band with muted gray styling.

Private band layout:
```
+--------------------------------------------------+
| [ShieldOff icon, 14px]  Private session          |
+--------------------------------------------------+
```

Styling: `bg-muted border-b border-border`, icon `text-muted-foreground`, text `text-xs text-muted-foreground`. Full-width, same height as the existing `RecordingIndicator` (py-1.5).

This band is always visible during a live session — it never disappears — so both participants always know the recording state without having to look it up.

---

### Edge Cases

#### Toggle interaction before session starts
- The toggle is only interactive on the Start view, before "New session" is clicked.
- Once the session is created (creator enters Waiting Room), the toggle state is locked. The badge in the Waiting Room is display-only.
- If the user navigates back (cancels the waiting room), the toggle state resets to ON (default).

#### Guest user + private session — consent checkbox
- The consent checkbox is ALWAYS shown for guest (non-logged-in) users — T&C acceptance is required regardless of recording state.
- When toggle is OFF, the checkbox label changes to: "I accept the Terms & Privacy Policy" (recording sentence removed).
- When toggle is ON, the checkbox label reads as today: "I agree this session is recorded for AI Insights, and I accept the Terms & Privacy Policy".
- The checkbox must be re-checked when the label changes (toggling clears the checked state), because the user is agreeing to different text.
- The "New session" button disabled state: unchanged — guests must check the box in both recording and private modes.

#### Joiner sees recording badge before deciding to join
- The recording badge on the join screen is fetched from the API after a valid link is opened (link path) or after a valid code is entered (code path).
- If the session no longer exists (expired, ended), the badge is not shown and the existing "session not found" error flow handles it.
- If the session is private, the consent checkbox label shows "I accept the Terms & Privacy Policy" only (no recording sentence). Checkbox is still required.
- If the session is recorded, the checkbox label and behavior are unchanged from today.

#### Session recording state cannot be changed after creation
- The toggle in the Start view controls the `is_private` flag on the session record. Once created, this flag is never editable through the UI.
- There is no "edit" toggle in the Waiting Room or Live view — both show read-only status badges/bands.

#### Both participants in different recording-state expectations
- Since the joiner sees the recording status before joining (badge on join screen), there is no scenario where a joiner is surprised mid-session.
- If the badge failed to load (API error) and the joiner joins without knowing the state, the Live view Private Session band resolves any ambiguity immediately.

#### Loading state for badge on join screen
- Skeleton placeholder (same dimensions) shown while API resolves.
- Badge appears once resolved. No delay should exceed 1 second on normal connections.
- If timed out (>3 seconds), omit the badge and proceed without it.

#### Mobile: toggle tap target
- The entire toggle row (icon + label area) is tappable on mobile, not just the switch thumb. Minimum touch target: 44px height.
- On mobile, the label wraps to 2 lines when in the OFF state (icon + "Private session / Not recorded"). This is acceptable within the `max-w-[280px]` form width.

---

### Accessibility

#### Toggle (Screen A)

- Element: `<button role="switch" aria-checked="true|false" aria-label="Record session for AI Insights">`
- When OFF: `aria-checked="false"`, `aria-label="Private session — recording disabled"`
- When ON: `aria-checked="true"`, `aria-label="Record session for AI Insights"`
- Keyboard: Space or Enter toggles the switch. Tab moves to the next element in the form.
- Focus ring: `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2` (matches existing button patterns in the codebase).

#### Status badges (Screens B, C, D)

- Badges are non-interactive and read-only. They do not need `role="button"`.
- Add `aria-live="polite"` on the badge container so that screen readers announce the session status when the badge appears or changes.
- Screen B (Waiting Room badge): announced when the waiting room loads.
- Screen C (Join badge): announced when the badge resolves from loading state.
- Screen D (Live band): part of static layout, announced once on page load.

#### Consent checkbox visibility (Screen A — guest users)

- When the toggle turns OFF and the checkbox label changes, add a visually hidden announcement: `<span className="sr-only" aria-live="polite">Recording disabled. Only Terms &amp; Privacy acceptance is required.</span>`
- When the toggle turns ON and the label reverts, announce: `<span className="sr-only" aria-live="polite">Recording enabled. Please re-confirm your consent.</span>`

#### Color contrast

- All informational text uses `text-muted-foreground` (gray-500, #6b7280) on white or `bg-muted` backgrounds. WCAG AA requires 4.5:1 for text — `text-muted-foreground` at 14px bold achieves this.
- The blue badge (`text-blue-700` on `bg-blue-50`): blue-700 (#1d4ed8) on blue-50 (#eff6ff) achieves approximately 7:1 contrast ratio.
- The private session band (`text-muted-foreground` on `bg-muted`): meets AA at standard body font sizes.
- Toggle thumb: the active state must maintain 3:1 contrast ratio between the thumb and track (UI component contrast).

---

### Responsive Design

#### Mobile (320px – 767px)

- Start view: The toggle row sits at full width within the `w-[280px]` form constraint (same as name/email inputs today). Label wraps to 2 lines in the OFF state — this is acceptable.
- Touch target: The entire toggle row is tappable (minimum 44px height).
- Waiting Room badge: Full width within `max-w-md` container, same as share link row. Stacks vertically with icon above text if needed on very narrow screens (320px), but at 360px+ the icon and text fit on one row.
- Join screen badge: Same behavior as Waiting Room badge.
- Live band: Full width below the nav bar, same as the existing RecordingIndicator.

#### Tablet (768px – 1023px)

- Start view: The form is centered at `max-w-md`. Toggle row behavior is identical to mobile (same constrained width).
- No layout changes compared to mobile for the toggle, badges, or live band.

#### Desktop (1024px+)

- Start view: Form is centered at `max-w-md`. The toggle row sits within the form — no multi-column expansion.
- Waiting Room: `max-w-md` centered layout (same as today). Badge sits in the same column.
- Live view: The private session band is full-width (same as the existing recording indicator band).
- The toggle row does NOT appear in a sidebar or separate settings panel — it stays inline within the session creation form for discoverability.

#### Breakpoint summary

| Element | Mobile | Tablet | Desktop |
|---|---|---|---|
| Recording toggle | Inline form, full form width | Same | Same |
| Waiting Room badge | Full-width, single column | Same | Same |
| Join screen badge | Full-width, single column | Same | Same |
| Live session band | Full-width below nav | Same | Same |
| Consent checkbox visibility | Hidden when private | Same | Same |

---

## Technical Analysis

**Current State:**

**`src/app/types/index.ts`**
- `ClaritySession`: No `isPrivate` field. Needs `isPrivate?: boolean` added after `liveState`.
- `DbClaritySession`: No `is_private` field. Needs `is_private?: boolean` added after `live_state`.

**`src/app/data/api.ts`**
- `createClaritySession(creatorName, creatorProfileId?, creatorNote?)`: Three params today. Inserts to `clarity_sessions` table with no `is_private` column. Returns via `mapSessionFromDb()`.
- `mapSessionFromDb()`: Maps DB snake_case to camelCase. Does not map `is_private`. Needs `isPrivate: dbSession.is_private ?? false` added.
- `uploadAudioChunk()` / `uploadEventsSnapshot()`: Only reachable via `handleChunkReady` callback. Since `startRecording()` is never called in private mode (Gate C below), these are unreachable. No changes needed inside them.
- `stopAndUploadRecording()`: Guards with `!eventsCollectorRef.current.isStarted()`. In private mode, `eventsCollectorRef.current.start()` is never called (recording gate prevents it), so `isStarted()` returns `false` and the function exits early with no upload. No additional gate needed here.

**`src/app/pages/clarity-live-page.tsx`**
- `useAudioRecorder` hook: Provides `startRecording()`. Called in `useEffect` when `view === 'live' && session && !isRecording && micStatus === 'granted'` — unconditional today.
- Proactive mic request for host: `useEffect` fires when `view === 'waiting' && isCreator && micStatus === 'unknown'` — unconditional today. Must be gated on `!isPrivate`.
- `completeJoin()`: Always requests mic permission before writing joiner to DB. Must bypass when `isPrivate`.
- `gateMicAndGoLive()`: Always requests mic before transitioning creator to live view. Must bypass when `isPrivate`.
- `handleCreate()`: Calls `createClaritySession(trimmedName, user?.id)`. Must pass `isPrivate`.
- `fetchHostName` effect: Calls `getClaritySession(urlCode)`. Already fetches full session — needs to also extract `sessionInfo.isPrivate` into new `joinSessionIsPrivate` state. Zero additional API calls.

**`src/app/components/partners/live-mode-view.tsx`**
- `RecordingIndicator()`: Zero-prop component, always renders blue "Session recorded for AI Insights" band unconditionally.
- `LiveModeViewProps`: Does not have `isPrivate`. Needs new optional `isPrivate?: boolean` prop.

**Database:**
- `clarity_sessions` table: Does NOT have `is_private` column. A new migration is required.
- Previous P23 migration added columns via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — same pattern applies here.
- `clarity_sessions` RLS UPDATE policy is currently `USING (true)` with no `WITH CHECK` — any client can update any session. Critical security gap (see Security Review below).

**Dependencies:**
- `createClaritySession()` is called from `clarity-chat-page.tsx` and `clarity-demo-page.tsx` in addition to the live page. New `isPrivate` param is additive with `default false` — those callers are unaffected.
- `recordSessionConsent()` / `recordTermsAcceptance()` calls are unchanged. T&C acceptance still fires in private mode.
- The Cloud Function `gcs-signed-url` issues signed URLs without checking `is_private`. This is a server-side enforcement gap that must be addressed (see Security Review).

---

## Architecture Decisions

**Decision 1: Database schema — add `is_private` boolean to `clarity_sessions`**

- **Chosen:** Dedicated `BOOLEAN NOT NULL DEFAULT false` column (not a JSONB key).
- **Rationale:** Typed column enforces boolean constraint at the Postgres/PostgREST layer. JSONB key would allow arbitrary values with no server-side type checking.
- **Migration:**
  ```sql
  ALTER TABLE public.clarity_sessions
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;
  ```
- Default `false` — all existing sessions are unaffected.

**Decision 2: Session type propagation**

`is_private` flows in one direction: UI toggle → `createClaritySession()` → DB insert → `mapSessionFromDb()` → `ClaritySession.isPrivate` → all consumers.

Type chain:
- `DbClaritySession.is_private?: boolean` — new field
- `ClaritySession.isPrivate?: boolean` — new field, mapped as `isPrivate: dbSession.is_private ?? false`
- `createClaritySession(creatorName, creatorProfileId?, isPrivate = false, creatorNote?)` — new third param
- `clarity-live-page.tsx` `isPrivate` local state — locked after `createClaritySession()` resolves
- `joinSessionIsPrivate` local state — populated from existing `fetchHostName` effect (no extra API call)
- `LiveModeViewProps.isPrivate?: boolean` — new prop

**Decision 3: Audio recording gate — four gates in `clarity-live-page.tsx`**

Gate A — Proactive mic request in waiting room:
```typescript
if (view === 'waiting' && isCreator && micStatus === 'unknown' && !isPrivate)
```

Gate B — `completeJoin()` mic check:
```typescript
let hasMicPermission = isPrivate || micStatus === 'granted';
if (!hasMicPermission) { hasMicPermission = await requestMicPermission(); }
```

Gate C — Recording start `useEffect`:
```typescript
if (view === 'live' && session && !isRecording && micStatus === 'granted' && !session.isPrivate)
```
When `isPrivate=true`, `startRecording()` is never called → `handleChunkReady` never fires → no GCS upload → no `ml_training_sessions` insert.

Gate D — `gateMicAndGoLive()`:
```typescript
if (isPrivate) { setView('live'); return true; }
```

**Decision 4: ML training data — no additional gates needed**

`stopAndUploadRecording()` already exits early via `!eventsCollectorRef.current.isStarted()`. Since `eventsCollectorRef.current.start()` is only called inside the recording start effect (gated by Gate C), `isStarted()` is `false` in private mode. No changes to upload functions.

**Decision 5: UI state management**

Two new state variables in `clarity-live-page.tsx`:
```typescript
const [isPrivate, setIsPrivate] = useState(false);          // creator's toggle
const [joinSessionIsPrivate, setJoinSessionIsPrivate] = useState(false); // joiner's fetched state
```

`isPrivate` lifecycle: default `false`, toggled by recording switch, cleared to `false` when user cancels from Waiting Room. Consent checkbox clears when toggle changes (user must re-agree to new label text). Locked after session creation — display-only in Waiting Room and Live view.

**Decision 6: `RecordingIndicator` becomes mode-aware**

Add `isPrivate?: boolean` prop (default `false`). Renders conditional bands:
```tsx
function RecordingIndicator({ isPrivate = false }: { isPrivate?: boolean }) {
  if (isPrivate) {
    return (
      <div className="flex items-center justify-center gap-2 py-1.5 bg-muted border-b border-border">
        <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Private session</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 py-1.5 bg-blue-50 border-b border-blue-200">
      <Sparkles className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-xs text-blue-700">Session recorded for AI Insights</span>
    </div>
  );
}
```
Default `false` preserves backward compatibility. The unrelated inline `RecordingIndicator` in `src/app/prototypes/linkedin-like/components/Live.tsx` is not touched.

---

## Security Review

**RLS Policies:**

- ⚠️ **`clarity_sessions` UPDATE policy is fully open (`USING (true)`, no `WITH CHECK`).** Any client — joiner, anonymous user, or third party knowing the session code — can flip `is_private` at any time via a direct Supabase call. This undermines both "locked once session begins" and "joiner can't override." **Required fix:** Add `WITH CHECK (creator_profile_id = auth.uid())` to the UPDATE policy so only the creator can modify sessions. (Guest-created sessions where `creator_profile_id` is null: these already require a logged-in creator per `handleCreate()` — that redirect is the existing guard.)

- ⚠️ **`ml_training_sessions` INSERT policy is `WITH CHECK (true)` — no link to `is_private`.** A direct API call or replay could insert an ML training row for a private session. A DB-level constraint linking the INSERT to `clarity_sessions.is_private = false` would enforce the invariant server-side.

**Authentication & Authorization:**

- ✅ **Session creation already restricted to authenticated users.** `handleCreate()` redirects unauthenticated users to `/signup` before calling `createClaritySession`. Unauthenticated users cannot set `is_private`.

- ⚠️ **Joiner mic permission check is unconditional today.** `completeJoin()` always calls `requestMicPermission()`. Gate B (Decision 3 above) must be added to satisfy the "no mic permission requested in private mode" acceptance criterion.

**Input Validation:**

- ✅ **Boolean column type enforced at Postgres/PostgREST layer** (provided `is_private` is a typed `BOOLEAN NOT NULL` column, not a JSONB key — see Decision 1). PostgREST will reject non-boolean payloads automatically.

- ✅ **No free-text user input flows into `is_private`.** The value comes from a binary toggle state (`useState<boolean>`). No injection surface.

**Data Protection:**

- ⚠️ **GCS signed URL function has no server-side `is_private` check.** The `gcs-signed-url` Cloud Function issues signed URLs based on `{ sessionCode, fileName, contentType }` without querying `clarity_sessions.is_private`. A buggy client, JS injection, or replayed request could obtain a valid upload URL for a private session and upload audio. **Required fix:** The function must query `clarity_sessions.is_private` before issuing a signed URL and return HTTP 403 for private sessions.

- ✅ **Client-side gates (Gates A–D) prevent recording start in normal operation.** Since `startRecording()` is never called, `handleChunkReady` never fires, so the upload path is not reached under normal operation.

- ✅ **Private sessions are not hidden.** They remain visible via `SELECT` (RLS `USING (true)` on reads). This is intentional per the spec ("private mode is about ML data, not session history") and is not a regression.

**Trust Model:**

- ⚠️ **After session goes live, `is_private` can still be changed via direct Supabase call** (no DB-level lock). The UI-level toggle lock is a React-side constraint only. A `BEFORE UPDATE` trigger or status-based CHECK constraint preventing changes to `is_private` once `status = 'active'` would enforce the "cannot change mid-session" invariant at the data layer.

- ⚠️ **Joiner can currently flip `is_private` via direct API call** (same open UPDATE policy). Fixed by the RLS mitigation above.

**Summary of required fixes before implementation:**

| Issue | Severity | Where to fix |
|---|---|---|
| `clarity_sessions` UPDATE policy allows anyone to change `is_private` | Critical | Supabase migration — add `WITH CHECK (creator_profile_id = auth.uid())` |
| Cloud Function issues signed URLs without checking `is_private` | Critical | `gcs-signed-url` Cloud Function |
| No DB-level lock preventing `is_private` change after session goes live | High | Supabase migration — trigger or CHECK on status transition |
| `ml_training_sessions` INSERT has no link to `is_private` | Medium | Supabase migration — constraint or trigger |
| Joiner mic permission unconditional in `completeJoin()` | High | `clarity-live-page.tsx` — Gate B |

---

## Implementation Approach

**Files to Create:**

1. `supabase/migrations/20260217_p393_is_private_session.sql`
   - `ALTER TABLE public.clarity_sessions ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;`
   - Updated RLS UPDATE policy with `WITH CHECK (creator_profile_id = auth.uid())`
   - Optional: trigger to lock `is_private` after `status = 'active'`
   - Optional: CHECK on `ml_training_sessions` insert against `is_private`

**Files to Modify:**

2. `src/app/types/index.ts`
   - `ClaritySession`: add `isPrivate?: boolean;` after `liveState`
   - `DbClaritySession`: add `is_private?: boolean;` after `live_state`

3. `src/app/data/api.ts`
   - `mapSessionFromDb()`: add `isPrivate: dbSession.is_private ?? false,` after `liveState` mapping
   - `createClaritySession()` signature: add `isPrivate = false` as third param (before `creatorNote?`); add `is_private: isPrivate` to the `.insert()` payload

4. `src/app/components/partners/live-mode-view.tsx`
   - `RecordingIndicator`: add `isPrivate?: boolean` prop; render conditional bands (see Decision 6)
   - `LiveModeViewProps`: add `isPrivate?: boolean`
   - `LiveModeView`: destructure `isPrivate = false` from props
   - `<RecordingIndicator />` call site: pass `isPrivate={isPrivate}`

5. `src/app/pages/clarity-live-page.tsx`
   - Add `isPrivate` and `joinSessionIsPrivate` state declarations
   - Extend `fetchHostName` effect: add `setJoinSessionIsPrivate(sessionInfo.isPrivate ?? false)`
   - Start view: add recording toggle row (button role="switch") between inputs and consent checkbox
   - Consent checkbox labels: conditional based on `isPrivate` (create flow) and `joinSessionIsPrivate` (join flow)
   - Waiting Room: add display-only recording status badge between share link row and QR code
   - Join via link view: add recording status badge with loading skeleton below heading
   - Gate A: add `&& !isPrivate` to waiting-room mic request `useEffect`
   - Gate B: add `isPrivate ||` before `micStatus === 'granted'` in `completeJoin()`
   - Gate C: add `&& !session.isPrivate` to recording start `useEffect`
   - Gate D: add `if (isPrivate) { setView('live'); return true; }` at top of `gateMicAndGoLive()`
   - `handleCreate()`: pass `isPrivate` to `createClaritySession(trimmedName, user?.id, isPrivate)`
   - `<LiveModeView>` call site: add `isPrivate={session.isPrivate ?? false}` prop
   - Cancel handler from Waiting Room: add `setIsPrivate(false)` to reset toggle

**Build Sequence:**

1. Write and apply `supabase/migrations/20260217_p393_is_private_session.sql` — `is_private` column + RLS fix
2. Update `src/app/types/index.ts` — add `isPrivate` / `is_private` fields
3. Update `src/app/data/api.ts` — `mapSessionFromDb()` and `createClaritySession()` signature
4. Update `src/app/components/partners/live-mode-view.tsx` — `RecordingIndicator` conditional rendering
5. Update `src/app/pages/clarity-live-page.tsx`:
   - a. State declarations
   - b. `fetchHostName` effect extension
   - c. Recording toggle UI in Start view
   - d. Conditional consent labels
   - e. Waiting Room badge
   - f. Join view badge (with skeleton)
   - g. Gates A–D
   - h. `handleCreate()` — pass `isPrivate`
   - i. `<LiveModeView>` — pass `isPrivate`
   - j. Cancel handler — reset `isPrivate`
6. Address Cloud Function `gcs-signed-url` to check `is_private` before issuing signed URL (server-side enforcement)
7. Smoke test: toggle OFF → create session → confirm no mic dialog, no recording, private band visible, `is_private=true` in DB, no rows in `ml_training_sessions`
8. Regression test: default (toggle ON) → confirm mic dialog, recording starts, blue band visible — existing behavior unchanged

---

## Test Coverage Strategy

**Files generated:**
- ✅ Unit tests: `src/tests/private-session.test.ts` (15 tests)
- ✅ E2E tests: `e2e/p393-private-session.spec.ts` (13 tests)
- ✅ Accessibility tests: `e2e/a11y/p393-accessibility.spec.ts` (10 tests)
- ✅ Smoke tests: `e2e/p393-smoke.spec.ts` (6 tests)
- ✅ UAT scenarios: `features/uat/p393.md` (22 scenarios)

**What's tested:**

- ✅ `mapSessionFromDb` mapping (`is_private` → `isPrivate`, null/undefined default) — unit
- ✅ Consent label logic (changes based on `isPrivate`) — unit
- ✅ Recording gate logic (Gates A–D: all four conditions verified) — unit
- ✅ Recording toggle visible and defaults ON — E2E + smoke
- ✅ Toggle OFF → consent label changes + checkbox clears — E2E
- ✅ Toggle re-clicks → checkbox cleared each time — E2E
- ✅ `role="switch"` + `aria-checked` ARIA attributes — a11y
- ✅ Keyboard navigation (Tab reaches toggle, Space toggles) — a11y
- ✅ `aria-live="polite"` on badge containers — a11y
- ✅ Mobile touch target (44px minimum) — a11y
- ✅ Join page loads without errors for private/recorded sessions — E2E + smoke
- ✅ DB schema, RLS, session history, no-data-capture guarantee — UAT
- ✅ Waiting room badge (private/recorded states) — UAT
- ✅ Live view band (private/recorded states) — UAT
- ✅ Consent in private mode for guest users — UAT
- ✅ Cancel from Waiting Room resets toggle — UAT

**What's NOT tested (rationale):**

- ❌ Two-browser coordinated session (creator + joiner both in Live view) — requires complex multi-context setup; covered in UAT-5.x with manual + Playwright multi-context
- ❌ GCS signed URL 403 enforcement — Cloud Function server-side; not testable from browser E2E; verified via direct API call in UAT-6.2
- ❌ `ml_training_sessions` DB trigger/constraint — SQL-level; verified via Supabase dashboard in UAT-6.2
- ❌ `startRecording()` / `stopAndUploadRecording()` internals — covered by existing `session-events-collector.test.ts`; gates prevent their invocation in private mode (unit tested above)

**Test pyramid:**
```
        /\
       /  \   22 UAT scenarios
      /    \
     /  10  \  a11y tests
    /________\
   /   13     \  E2E tests
  /______________\
 /   15 unit      \
/__________________\
```

**Total:** 44 automated tests + 22 UAT scenarios
**Estimated automated run time:** ~30s (unit: ~2s, E2E: ~20s, a11y: ~8s)

**Next step:** Run `/dev features/p393_private_session_mode.md` to implement feature + run tests
