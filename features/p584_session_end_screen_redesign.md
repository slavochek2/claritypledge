---
status: in-progress
delivery_stage: dev
type: feature
rank: 1000026.0
workstream: E
created_date: 2026-03-24
tags: [ux, live-session, upload]
---

# P584: Session End Screen Redesign

## Problem

The current session end screen (`PartnerLeftScreen`) has multiple issues:

1. **Button inconsistency**: Host gets blue "Start New Session", participant gets differently-colored "Back to Home" — different labels, different visual treatment
2. **False transcript promise**: Screen always shows "Transcribing your session... It will be available shortly in Session History" — but sessions with 0 completed rounds AND pending transcription are filtered OUT of Session History (`sessions-service.ts:70`). Users click through and find nothing.
3. **No upload navigation guard**: If user taps bottom nav during audio upload, they navigate away and the upload dies — losing the recording
4. **Unclear product goal**: Screen doesn't drive any specific behavior (no consistent CTA)

## Solution

Redesign the end screen to be an **upload gate + single CTA**. Upload protection via three layers: (1) CTA suppression during upload, (2) `useBlocker` for in-app navigation, (3) existing `beforeunload` for tab/browser close. Honest, conditional transcript messaging. Role-unified buttons.

**Scope note (challenge-prd Q2):** This includes both bug fixes (upload guard, honest messaging) and visual redesign (CTA unification, layout cleanup). Doing all in one pass — the components are intertwined and the scope is small.

### Design — Logged-in Users (Host AND Participant, identical)

```
┌──────────────────────────────────────┐
│              ✓                        │  CheckCircle, blue-500
│                                      │
│   {title from Option A}              │
│   "Session ended" / "Alex has left"  │
│                                      │
│  IF uploading:                       │
│  Uploading session audio...          │
│  ████████████░░░░░░░  73%            │
│  Don't close this tab yet.           │
│  (CTA hidden, nav blocked)          │
│                                      │
│  IF upload done + rounds > 0:        │
│  ✓ Your transcript is being          │
│  generated. Check                    │
│  Session History in a few minutes. → │
│                                      │
│  IF rounds = 0 or no upload:         │
│  (nothing)                           │
│                                      │
│  ── CTA (shown after upload) ─────── │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Start a Clarity Session      │  │  bg-blue-500, full width
│  └────────────────────────────────┘  │
│                                      │
│  [Home] [Start] [Events] [Profile]   │
└──────────────────────────────────────┘
```

### Design — Guest Users

```
┌──────────────────────────────────────┐
│              ✓                        │
│                                      │
│   {title from Option A}              │
│                                      │
│  (same upload states as logged-in)   │
│                                      │
│  IF upload done + rounds > 0:        │
│  Your session was recorded.          │
│  Create an account to access your    │
│  transcript and AI insights.         │
│                                      │
│  ── CTA (shown after upload) ─────── │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Create Free Account          │  │
│  └────────────────────────────────┘  │
│  Already have an account? Log in →   │
└──────────────────────────────────────┘
```

### Navigation Guard During Upload

When upload is in progress and user attempts to navigate away (bottom nav click):

```
┌──────────────────────────────────┐
│                                  │
│   Audio is still uploading.      │
│   Leaving may lose your          │
│   recording.                     │
│                                  │
│  ┌────────────────────────────┐  │
│  │  Stay on this page        │  │  primary, blue
│  └────────────────────────────┘  │
│                                  │
│  Leave anyway                    │  text link, de-emphasized
│                                  │
└──────────────────────────────────┘
```

### Title Logic (Option A — keep existing distinction)

| Condition | Title |
|---|---|
| Host ended session (I'm host) | "Session ended" |
| Host ended session (I'm participant) | "{Name} ended the Clarity Session." / "The host ended the Clarity Session." |
| Partner left (has name) | "{Name} has left" |
| Partner left (no name) | "Your partner has left" |

### State Matrix

| State | Logged-in | Guest |
|---|---|---|
| Uploading | Progress bar + "Don't close this tab yet." CTA hidden. Nav blocked via `useBlocker`. | Same |
| Upload done, rounds > 0 | "Transcript being generated. Check Session History in a few minutes." + CTA | "Session recorded. Create account to access transcript." + signup CTA |
| Upload done, rounds = 0 | CTA only | Signup CTA only |
| No upload | CTA only | Signup CTA only |
| Upload failed | "Recording could not be saved" (subtle, text-muted) + CTA | Same |

## Technical Notes

### Files to Change

- `src/app/components/partners/live-mode-view.tsx` — `PartnerLeftScreen` component: remove role-differentiated button, add conditional transcript messaging, add upload state awareness for CTA visibility
- `src/app/pages/clarity-live-page.tsx` — add popstate+pushState nav guard (NOT `useBlocker` — app uses `BrowserRouter`, not data router; see P427 pattern in `story-detail-page.tsx:878`). Pass new `completedRounds` prop to PartnerLeftScreen. Upload progress is already passed for all users including guests (verified: line 2856).

### Key Implementation Details

- **CTA button**: Hidden (not disabled) while `uploadProgress.status === 'uploading'`. Shown for all other states.
- **Navigation guard**: Popstate+pushState pattern (proven in P427/story-detail-page) + bottom nav click interception. NOT `useBlocker` (requires data router, app uses `BrowserRouter`). Show Dialog with "Stay on this page" (primary) / "Leave anyway" (text link). Dialog uses `hideCloseButton` + `onPointerDownOutside` prevented.
- **`beforeunload`**: Already exists in `chunk-upload-queue.ts:281` for tab close — no change needed.
- **Transcript message**: Only show when `rounds > 0`. New `completedRounds: number` prop added to `PartnerLeftScreenProps` (passed from parent which already computes `sessionHistory` length).
- **"Session History" link**: Direct link to `/sessions` — only rendered when rounds > 0.
- **Upload failed**: Show subtle "Recording could not be saved" (text-sm text-muted-foreground). No action required from user. Log details to console. Show CTA immediately.
- **Button label**: Always "Start a Clarity Session" (matches language used in nav and elsewhere in the app).
- **No "Home" link**: Bottom nav already provides this. Remove the dedicated link.

### What Gets Removed

- Role-differentiated button labels ("Start New Session" vs "Back to Home")
- "Safe to leave" messaging (confusing, removed)
- Round count stats ("3 rounds practiced" — user doesn't care, they just lived it)
- Verbose upload failure message (replaced with subtle one-liner: "Recording could not be saved")
- Dedicated "Home" text link

### Upload Protection Scope (challenge-prd BLOCK-2 resolution)

Three layers, explicitly named:
1. **CTA suppression** — primary action button hidden during upload (passive — removes the obvious "leave" action)
2. **Popstate + bottom nav interception** — popstate+pushState pattern (proven in P427) catches browser back button; bottom nav click interception catches the primary in-app navigation vector. Built with Dialog primitives directly (not ConfirmDialog — inverted emphasis needed).
3. **`beforeunload`** — intercepts tab close, browser close, URL bar navigation (already exists in `chunk-upload-queue.ts:281`)

**Not covered (accepted risk):** PWA swipe-to-go-back on mobile Safari. These are edge cases — the three layers cover the primary vectors.

### Guest Upload Verification (challenge-prd BLOCK-3 resolution)

**Verified:** Guests DO record and upload audio. Recording starts for all users when `view === 'live' && micStatus === 'granted'` (no guest gate in `clarity-live-page.tsx:648`). `uploadProgress` is already passed to `PartnerLeftScreen` for guests (`line 2856`). The current `PartnerLeftScreen` shows upload UI only for `!isGuest` — this spec changes it to show for ALL users.

**Transcript linkage post-signup:** Out of scope. Guest sessions are associated via anonymous Supabase auth session ID. Whether transcript retroactively links on signup is existing behavior, not changed here.

### Persistence

End screen is React state only (`partnerLeft`/`sessionEnded` flags in `clarity-live-page.tsx`). Navigating away and returning to `/live` remounts the component → flags reset → normal start view. This is correct and unchanged.

## Acceptance Criteria

- [ ] Host and participant see identical CTA button: "Start a Clarity Session" (bg-blue-500)
- [ ] CTA button is hidden while audio upload is in progress
- [ ] Upload progress bar + "Don't close this tab yet" shown for ALL users (host, participant, guest) during upload
- [ ] Navigation guard (popstate + bottom nav interception) shows confirm dialog during upload
- [ ] Transcript message ("Check Session History in a few minutes") only appears when rounds > 0
- [ ] No transcript/history mention when rounds = 0
- [ ] Upload failure: shows subtle "Recording could not be saved", CTA shown normally
- [ ] Guest variant: "Your session was recorded. Create an account..." when rounds > 0
- [ ] Guest variant: upload progress shown same as logged-in users
- [ ] Title logic preserved: "Session ended" / "{Name} has left" (Option A)
- [ ] No "Home" text link (bottom nav suffices)
- [ ] Navigating away from `/live` and returning shows normal start view (existing behavior preserved)

## Testing

- Test all upload states (uploading, complete, failed) × user types (host, participant, guest)
- Test navigation guard fires during upload and does NOT fire after upload completes
- Test transcript message conditional on round count
- Test navigation away and back resets to start view
- Visual QA on mobile viewport

## Component Strategy

### Step 1 — Component Inventory

**Design system primitives available (`src/components/ui/`):**
- `Button` — cva-based, variants: default/destructive/outline/secondary/ghost/link; sizes: default/sm/lg/icon
- `Dialog` — Radix-based, supports `hideCloseButton`, has Header/Footer/Title/Description
- `Drawer` — Radix-based (vaul), bottom sheet pattern
- No `Progress` bar component exists in the design system
- No `AlertDialog` component exists (only `Dialog`)

**Existing patterns in PartnerLeftScreen (`live-mode-view.tsx:132-226`):**
- Upload progress bar: hand-rolled `div` with `bg-blue-500 rounded-full h-2` inside `bg-muted rounded-full h-2` (lines 163-171)
- Upload status messages: three conditional blocks for uploading/complete/failed
- DoorOpen icon in muted circle as session-end indicator
- Loader2Icon spinner for "Transcribing..." message (always shown, never conditional)
- `PwaSessionEndBanner` — renders above content for non-guests

**Shared patterns:**
- `ConfirmDialog` (`shared/confirm-dialog.tsx`) — wraps Dialog with confirm/cancel buttons, supports `variant` and `isLoading`
- `CheckCircle2` from lucide-react — used in 20+ places across the codebase, standard success indicator
- `Link` from react-router-dom — used for navigation throughout

### Step 2 — Component Map

| # | UI Element | Decision | Component | Notes |
|---|---|---|---|---|
| 1 | CheckCircle icon | **Reuse** | `CheckCircle2` from `lucide-react` | Already used in 20+ places. Spec says `blue-500`. Use `w-12 h-12 text-blue-500` (larger than typical 4/6, smaller than login-form's w-16). Replaces current `DoorOpen` in muted circle. |
| 2 | Title text | **Reuse** | Existing `h2` + title logic | Title derivation logic (lines 134-138) already matches spec Option A exactly. Keep as-is. Remove `subtitle` — spec drops the secondary line. |
| 3 | Upload progress bar | **Extend** | Existing hand-rolled progress bar (lines 161-177) | No shadcn Progress primitive exists. Reuse the existing `bg-blue-500 rounded-full h-2` pattern. Change percentage display from "X of Y chunks" to "73%" format. Add transition on width for smooth animation: `transition-all duration-300`. |
| 4 | "Don't close this tab yet" | **Reuse** | `<p className="text-sm text-muted-foreground">` | Already exists at line 176 with slightly different wording. Update text to match spec exactly. |
| 5 | Transcript notification | **Extend** | Existing "Transcribing..." block (lines 189-198) | Currently always shown + uses spinner. Replace with: conditional on `rounds > 0` + upload complete, show checkmark prefix instead of spinner, link to `/sessions`. Remove Loader2Icon spinner entirely. |
| 6 | Upload failure message | **Reuse** | `<p className="text-sm text-muted-foreground">` | Simplify existing 2-line failure block (lines 182-187) to single line: "Recording could not be saved". |
| 7 | Primary CTA button | **Extend** | `Button` from `@/components/ui/button` | Already used (line 156). Unify label to "Start a Clarity Session" for all logged-in users. Add conditional hide when uploading. Make full-width: `w-full`. Use `asChild` wrapping `Link to="/live"` for SPA navigation. |
| 8 | Secondary login link | **Reuse** | Existing `Link` pattern (lines 215-219) | Already exists in guest block. Keep styling: `text-xs text-muted-foreground`. |
| 9 | Navigation guard dialog | **Extend** | `ConfirmDialog` from `shared/confirm-dialog.tsx` | Almost fits but needs visual inversion: spec wants primary="Stay" + text link="Leave", while ConfirmDialog has primary=Confirm + outline=Cancel. **See challenge note below** — may need a slim wrapper or direct Dialog usage instead. |
| 10 | Guest signup block | **Extend** | Existing guest block (lines 202-222) | Restructure: move upload states above (shared with logged-in), make signup CTA conditional on upload complete, update copy per spec. |

### Step 3 — Composition Tree

#### 3a. Logged-in user, uploading

```
PartnerLeftScreen
  div.flex.flex-col.items-center (container)
    PwaSessionEndBanner (non-guest only, existing)
    div.p-8.text-center.max-w-sm (content card)
      CheckCircle2 (icon, blue-500, w-12 h-12)
      h2 (title — "Session ended" / "{Name} has left")
      div.upload-progress (uploading block)
        p "Uploading session audio..."
        div.progress-track > div.progress-fill (bg-blue-500, width=%)
        p "{percent}%"
        p "Don't close this tab yet."
      {CTA hidden}
      {transcript hidden}
```

#### 3b. Logged-in user, upload done, rounds > 0

```
PartnerLeftScreen
  div.flex.flex-col.items-center
    PwaSessionEndBanner
    div.p-8.text-center.max-w-sm
      CheckCircle2 (blue-500)
      h2 (title)
      p.transcript-notice
        "Your transcript is being generated. Check "
        Link[to=/sessions] "Session History"
        " in a few minutes."
      Button[w-full, bg-blue-500]
        Link[to=/live] "Start a Clarity Session"
```

#### 3c. Guest user, upload done, rounds > 0

```
PartnerLeftScreen
  div.flex.flex-col.items-center
    div.p-8.text-center.max-w-sm
      CheckCircle2 (blue-500)
      h2 (title)
      div.guest-conversion
        p "Your session was recorded."
        p "Create an account to access your transcript and AI insights."
      Button[w-full, bg-blue-500]
        Link[to=/signup] "Create Free Account"
      Link[to=/login] "Already have an account? Log in"
```

#### 3d. Navigation guard dialog

```
Dialog[open=blocker.state==='blocked']
  DialogContent[hideCloseButton, max-w-sm]
    DialogHeader
      DialogTitle (visually-hidden, for a11y)
    DialogDescription
      "Audio is still uploading. Leaving may lose your recording."
    div.flex.flex-col.gap-3
      Button[default, w-full, bg-blue-500] "Stay on this page"
      button[ghost, text-sm, text-muted-foreground] "Leave anyway"
```

### Step 4 — Visual Refinements

**Transitions:**
- Upload progress bar width: `transition-all duration-300 ease-out` on the fill div for smooth progression.
- Upload complete to transcript notice: No animation needed — the state change is instant and the content swap is small. Adding fade would over-engineer for a one-time transition.
- CTA appearance after upload: Simple conditional render. The button appearing is noticeable enough without animation.

**Icon:**
- `CheckCircle2` at `w-12 h-12 text-blue-500` — matches spec's "blue-500" note. Renders directly without the current muted circle wrapper (cleaner, more modern). The `DoorOpen` icon and its `bg-muted` circle wrapper are removed.

**Progress bar styling:**
- Reuse existing pattern: `bg-muted rounded-full h-2` track + `bg-blue-500 rounded-full h-2` fill. This is already established in the component; no reason to deviate.
- Add `transition-all duration-300` to the fill for smooth width changes.
- Change chunk count display to simple percentage: `Math.round(((total - pending) / total) * 100)%`.

**Navigation guard dialog:**
- Uses Dialog (not AlertDialog — none exists in the design system). `hideCloseButton` prevents dismissal via X. Close on overlay click should be disabled (`onPointerDownOutside={e => e.preventDefault()}`).
- "Stay on this page" as full-width primary blue button. "Leave anyway" as a centered ghost/link button below — deliberately de-emphasized per spec wireframe.

### Step 5 — Extraction Plan

**No extraction needed.** The PartnerLeftScreen is the only consumer of this end-screen pattern. The upload progress bar is hand-rolled but only used here — extracting to a shared Progress component would be premature (single consumer). If a second consumer appears, extract then.

**PwaSessionEndBanner stays.** It's a thin wrapper around `InstallBanner` with session-end-specific dismiss logic. Still relevant for non-guest users post-redesign.

**`ConfirmDialog` reuse consideration:** The navigation guard has inverted emphasis (primary = "stay" = safe action, secondary = "leave" = destructive action) which is opposite to ConfirmDialog's pattern (primary = confirm = destructive action). Building the nav guard dialog inline using Dialog primitives directly is cleaner than contorting ConfirmDialog.

### Step 6 — Challenge Notes

**BLOCK: `useBlocker` does not work with `BrowserRouter`.**
The spec calls for `useBlocker` from React Router to intercept in-app navigation. However, this app uses `BrowserRouter` (`src/App.tsx:1`), and `useBlocker` requires `createBrowserRouter` / data router. This is explicitly documented in `story-detail-page.tsx:878`: _"BrowserRouter doesn't support useBlocker; use popstate + history.pushState instead."_

**Resolution options:**
1. **Popstate + pushState pattern** (like P427 in story-detail-page) — intercept `popstate` events, push a dummy history entry, show dialog on back. Proven pattern in this codebase.
2. **Intercept bottom nav clicks directly** — since the primary navigation vector is the bottom nav bar, intercept clicks at that level (event handler or wrapper) when upload is active. Simpler but less complete (misses programmatic `navigate()`).
3. **Migrate to `createBrowserRouter`** — correct long-term fix but massive scope creep for this feature.

**Recommendation:** Option 1 (popstate pattern) for browser back + Option 2 (bottom nav interception) for tap navigation. This covers both vectors without router migration. The spec's acceptance criterion "useBlocker intercepts bottom nav clicks" should be updated to reflect the actual mechanism.

**Note: `rounds` derivation.** The spec says "Round count derived from `liveState.sessionHistory`." PartnerLeftScreen currently does NOT receive `liveState` or round count. The `PartnerLeftScreenProps` interface will need a new `completedRounds: number` prop passed from `clarity-live-page.tsx`. This is straightforward — `sessionHistory` length is already computed in the parent.

**Note: `subtitle` removal.** The spec wireframe shows only the title line (no subtitle). The current component renders a subtitle ("You ended the Clarity Session." / "The host ended..."). The spec should confirm this removal. The title alone ("Session ended" / "{Name} has left") is sufficient and cleaner.

**Note: Guest upload visibility expansion.** Current code gates upload UI behind `!isGuest` (line 154). The spec explicitly changes this to show upload for ALL users including guests (verified in spec's "Guest Upload Verification" section). This is a straightforward conditional removal.
