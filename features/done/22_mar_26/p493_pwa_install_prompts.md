---
status: all-done
type: feature
rank: 250004.75
workstream: E3
created_date: 2026-03-11
completed_at: "2026-03-12"
tags: [pwa, mobile, install]
---

# P493: PWA Install Prompts

## Problem

ClarityPledge has solid PWA infrastructure (vite-plugin-pwa, Workbox, manifest, icons, offline support) but zero install prompting. Users can install but are never invited to. No `beforeinstallprompt` listener, no install UI, no analytics tracking.

## Solution

Three contextual install surfaces, each matching existing UI patterns:

### Surface 1: Agreement Celebration Dialog
- Replace the dead "Start a /live session →" link with install CTA
- Inline text link style (matches dialog context)
- Users dwell here admiring the certificate — high attention moment

### Surface 2: Post-/live Session End Screen
- **Registered users**: install banner (top, AI Insights style: `blue-50`, `border-b`, `text-xs`)
- **Guests**: existing P396 sign-up CTA stays untouched — no install prompt for guests
- "Not now" → 30-day cooldown via localStorage

### Surface 3: Settings Page
- Permanent install card section — always visible, never hidden by dismiss
- Shows "Installed" state when detected

### Platform Handling
- **Android/Chrome**: trigger stored `beforeinstallprompt` event
- **iOS Safari**: bottom sheet with manual instructions (Share → Add to Home Screen)
- **Desktop Chrome/Edge**: settings card only, no contextual prompts
- **Unsupported browsers**: "Open in Chrome or Safari to install" text, no button
- **Already installed**: detect via `display-mode: standalone` media query, hide all prompts

### Dismiss Logic
- Celebration dialog: no dismiss (inline, non-intrusive)
- Session end: "Not now" sets `localStorage.pwa_dismissed_at` → 30-day cooldown
- Settings: always shown regardless of dismiss state

## UX Design

### Consistency Pattern

Reuse existing AI Insights banner style for session-end:
```
┌──────────────────────────────────────────────────┐
│ 📱 Install ClarityPledge for quick access    [→] │
└──────────────────────────────────────────────────┘
(blue-50 bg, border-b border-blue-200, text-xs)
```

### Celebration Dialog (replaces "Start /live →")
```
Before:                          After:
┌──────────────────────┐        ┌──────────────────────┐
│ ✦ Agreement Sealed ✦ │        │ ✦ Agreement Sealed ✦ │
│ [certificate]         │        │ [certificate]         │
│ 📅 Add to Calendar    │        │ 📅 Add to Calendar    │
│ Start a /live →  ←DEL │        │ Install app for      │
│ [Close] [View]        │        │ quick access →       │
└──────────────────────┘        │ [Close] [View]        │
                                └──────────────────────┘
```

### Session End — Registered User
```
┌──────────────────────────────────────────────────┐
│ 📱 Install ClarityPledge for quick access    [→] │  ← top banner
├──────────────────────────────────────────────────┤
│           Session ended                          │
│    [Start New Session]                           │
└──────────────────────────────────────────────────┘
```

### Session End — Guest (unchanged)
```
┌──────────────────────────────────────────────────┐
│           Session ended                          │
│    [Start New Session]                           │
│    ┌────────────────────────────────────┐         │
│    │ Save your calibration history     │         │
│    │ [Create Free Account]             │  ← P396 │
│    │ Already have an account? Log in   │         │
│    └────────────────────────────────────┘         │
└──────────────────────────────────────────────────┘
```

### iOS Instruction Sheet
```
┌──────────────────────────────────┐
│  Add ClarityPledge               │
│  to your Home Screen             │
│                                  │
│  1. Tap [↑] Share button         │
│  2. Scroll to "Add to Home Screen│
│  3. Tap "Add"                    │
│                                  │
│  [Got it]                        │
└──────────────────────────────────┘
```

### Settings Card
```
┌──────────────────────────────────────┐
│ App                                  │
│                                      │
│ Install ClarityPledge                │
│ Add to your home screen for quick    │
│ access and offline support.          │
│                        [Install]     │
└──────────────────────────────────────┘

[Installed state:]
│ ✓ ClarityPledge is installed         │

[Unsupported browser:]
│ Open in Chrome or Safari to install. │
```

## Technical Notes

### Architecture
```
src/hooks/use-pwa-install.ts           — core hook
  ├── captures beforeinstallprompt event
  ├── exposes: { isInstalled, canPrompt, isIOS, promptInstall, isDismissed, dismiss }
  ├── detects installed via matchMedia('(display-mode: standalone)')
  └── 30-day cooldown via localStorage

src/app/components/pwa/
  ├── install-banner.tsx               — thin blue banner (session end)
  ├── install-card.tsx                 — settings card
  ├── ios-install-sheet.tsx            — bottom sheet with manual steps
  └── install-provider.tsx             — context provider (stores beforeinstallprompt event ref)
```

### Integration Points
1. `src/app/components/agreements/celebration-dialog.tsx` — replace "Start /live →" link
2. `src/app/components/partners/live-mode-view.tsx` (PartnerLeftScreen) — add banner for registered users
3. Settings page — add install card section
4. `src/App.tsx` — wrap with InstallProvider

### Analytics (Mixpanel)
- `pwa_install_prompted` — banner/card shown (source: 'celebration' | 'session_end' | 'settings')
- `pwa_install_accepted` — user tapped install
- `pwa_install_dismissed` — user tapped "not now"
- `pwa_ios_instructions_shown` — iOS sheet displayed

## Acceptance Criteria

- [x] Android/Chrome: tapping Install triggers native browser prompt
- [x] iOS Safari: tapping Install shows step-by-step instruction sheet
- [x] Celebration dialog: "Start /live →" replaced with install CTA
- [x] Session end (registered): blue banner at top with install CTA
- [x] Session end (guest): existing P396 sign-up CTA unchanged, no install prompt
- [x] Settings: permanent install card visible
- [x] Already installed: all prompts hidden (display-mode: standalone)
- [x] Dismiss on session-end: 30-day cooldown, settings card unaffected
- [x] Unsupported browser: shows "Open in Chrome or Safari" text
- [x] Mixpanel events fire correctly for all interactions

## Testing

- Verify on Android Chrome (real device or emulator) — beforeinstallprompt fires
- Verify on iOS Safari — instruction sheet appears
- Verify dismiss cooldown — dismiss, check localStorage, verify 30-day behavior
- Verify installed detection — open as PWA, confirm all prompts hidden
- Check guest vs registered flow on session end screen
