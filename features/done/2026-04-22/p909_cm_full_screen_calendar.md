---
status: all-done
type: change-request
rank: 1000797.0
changes: p906
tags:
  - redesign
  - p906
  - cm
  - calendar
created_date: '2026-06-06'
pipeline_ran: [change-request, dev, ship]
completed_at: 2026-06-06
---

# P909: /cm Full-Screen Chrome-Free Calendar

> **Redesign of:** [P906: /cm calendar iframe blocked by CSP on prod](./p906_cm_calendar_csp_blocked.md)
> **What was wrong:** P906's approved layout kept the page inside `ClarityLandingLayout` — site navigation (~64px on mobile) plus a page header row (h1 title + subscribe link) plus container padding consume roughly a quarter of the mobile viewport before the calendar starts. The page's sole job is showing the calendar; the chrome competes with it for the scarcest resource (mobile vertical space).

## Operating Mode

> This spec is an **incremental correction** to P906, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P906 are not up for re-examination — specifically: the CSP `frame-src` fix, the single-iframe matchMedia mechanism, and WEEK-desktop / AGENDA-mobile mode selection.

## Problem Statement

P906's original problem (CSP blocking the iframe) is fixed and stays fixed — fully preserved. This correction targets the layout P906 shipped alongside the fix: "calendar-dominant" still meant calendar-inside-site-chrome. On a 375px-tall-constrained phone screen, visitors get site nav + title row + card padding before the first event is visible. Founder decision in this session: the calendar should BE the page.

**Verified constraint (this session, browser-tested):** the Google Calendar embed has NO day view — `mode=DAY` silently falls back to MONTH, and the `dates=X/X` single-day trick still renders the full week. AGENDA (which opens at today as a day-grouped list) is the best available mobile mode, so maximizing its viewport is the chosen path. Founder explicitly rejected linking out to Google instead of embedding (no logged-out Google Calendar destination exists for a public calendar other than this same embed).

## Jobs To Be Done

- **Preserved from P906:** visitor to `/cm` sees upcoming Chiang Mai events without auth and without leaving the site; visitor can subscribe ("Add this calendar to yours").
- **Corrected:** mobile visitor sees today's events immediately — the calendar fills the viewport instead of "most of the area below the chrome."
- **New:** none.

## Current State

`/cm` (route in `src/App.tsx:771`) is wrapped in `ClarityLandingLayout`, which renders `SimpleNavigation` (fixed, `pt-16 lg:pt-20` compensation), `LegalFooter` (logged-out) or `BottomNav` (logged-in mobile). Inside, `chiang-mai-page.tsx` adds `px-4 py-4`, a `max-w-6xl` container, a header row (h1 "Clarity Pledge — Chiang Mai" + subscribe link), and a bordered card holding the iframe at `h-[calc(100dvh-11rem)] min-h-[480px]`.

**Before (mobile 375px):**
```
┌───────────────────────────┐
│  ☰   ClarityPledge nav    │ ← SimpleNavigation ~64px
├───────────────────────────┤
│ Clarity Pledge — Chiang…  │ ← h1 + subscribe link row
│ Add this calendar to yours│
│ ┌───────────────────────┐ │ ← px-4 + bordered card
│ │ Google Calendar       │ │
│ │ (AGENDA)              │ │
│ │ calc(100dvh - 11rem)  │ │
│ └───────────────────────┘ │
│  Legal footer             │
└───────────────────────────┘
```

## Root Cause

P906's layout AC was "calendar fills **most of** the viewport" — it was written as a correction to the previous `max-w-2xl` / `h-[600px]` layout, so "most of" was the target, and keeping `ClarityLandingLayout` was never questioned. The `-11rem` in `h-[calc(100dvh-11rem)]` (`src/app/pages/chiang-mai-page.tsx:64`) exists solely to budget for nav + header row + padding — chrome that serves no job on this page. The layout already has chrome-stripping built in (`?embed=true` and `chromeFree` in `src/app/layouts/clarity-landing-layout.tsx:26-43`) but `/cm` doesn't use either.

## Redesign

`/cm` renders chrome-free: no `SimpleNavigation`, no footer, no `BottomNav`, no page padding, no bordered card, no h1 row. The iframe fills the full viewport minus one slim affordance row.

**The slim row** (~36-40px, single line) replaces both the nav and the header row:
- left: "Clarity Pledge" wordmark as a link to `/` (the only way back to the site once nav is gone)
- right: existing "Add this calendar to yours" link (unchanged text + `cid` URL)

No overlay on the iframe — the Google embed has its own header controls (month label, arrows, view switcher) that an overlay would obstruct.

**Mechanism:** render the route chrome-free (drop the `ClarityLandingLayout` wrapper in `App.tsx` or pass `chromeFree` — implementer's choice; `chromeFree` keeps `OfflineBanner`/`Toaster` and is the safer default). Keep the `SEO` component. Keep the single-iframe matchMedia WEEK/AGENDA mechanism exactly as is; only the height math changes to `calc(100dvh - <slim row height>)`.

**After (mobile 375px):**
```
┌───────────────────────────┐
│ Clarity Pledge   Add this │ ← slim row ~36-40px
│                  calendar │
├───────────────────────────┤
│ Google Calendar (AGENDA)  │
│                           │
│ fills the rest of 100dvh  │
│ edge-to-edge, no border   │
│                           │
│                           │
└───────────────────────────┘
```

**After (desktop 1440px):** same structure — slim row on top, WEEK-view iframe filling the rest. Full-width is acceptable; a max-width is NOT required (calendar grids use width well).

## Predecessor Sections Superseded

| Section | P906 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Fix Approach #2 | "compact header (small title + subscribe link, minimal padding), wide container" | Superseded | Slim affordance row (wordmark + subscribe link); no h1, no container, no padding |
| Fix Approach #2 | "iframe height near full viewport (`h-[calc(100dvh-…)]`)" | Superseded (intent kept) | Truly full viewport: `calc(100dvh - slim row)` |
| AC #3 | "calendar fills **most of** the viewport at desktop and mobile widths" | Superseded | AC below: calendar fills the **entire** viewport minus the slim row |
| AC #1, #2, #4, #5, #6 | CSP fix, regression test, WEEK/AGENDA matchMedia, CSP suite, post-deploy smoke | Still valid | Preserved unchanged — regression-checked below |

## Requirements

1. `/cm` renders without site chrome: no `SimpleNavigation`, no `LegalFooter`/`ClarityFooter`, no `BottomNav` (logged-in mobile included — accepted trade-off; the wordmark link is the way back).
2. One slim row (~36-40px): wordmark → `/`, "Add this calendar to yours" → existing `SUBSCRIBE_URL`. No other chrome.
3. Iframe is edge-to-edge (no border/rounded card), height `calc(100dvh - row)`, `min-h` guard retained.
4. matchMedia WEEK-desktop / AGENDA-mobile single-iframe mechanism unchanged (`DESKTOP_QUERY` 768px stays).
5. `SEO` component stays (title/description/url unchanged).
6. Dark mode: slim row uses standard `bg-background`/`text-foreground` tokens.

## What Stays the Same

- `vercel.json` CSP — untouched (P906 fix preserved)
- `CALENDAR_ID`, `SUBSCRIBE_URL`, embed URL params, `buildEmbedUrl()` — untouched
- WEEK/AGENDA mode selection + matchMedia listener — untouched
- All other routes/layouts — `ClarityLandingLayout` itself must not change behavior for any other page
- `/cm` entry in `PROD_HEALTH_ROUTES` — untouched

## Surfaces in Scope

**In scope:**
- `src/app/pages/chiang-mai-page.tsx` — strip header/container/card, add slim row, new height math
- `src/App.tsx:771` — `/cm` route wrapper (chrome-free rendering)

**Out of scope:**
- `src/app/layouts/clarity-landing-layout.tsx` — may be *used* (`chromeFree` prop) but NOT modified
- `vercel.json`, CSP tests, `PROD_HEALTH_ROUTES`
- Any other page or route
- Building a custom calendar UI / day view (separate future bet — embed verified to have no day mode)

## Acceptance Criteria

- [x] `/cm` shows no site nav, no footer, no bottom nav — at 320px, 375px, and 1440px (screenshots taken at all 3 widths; zero console errors)
- [x] Calendar iframe starts within ~40px of the top of the viewport and extends to the bottom (measured: header 40px exact, iframe top=40 → bottom=viewport bottom at 375 and 1440; page does not scroll)
- [x] Slim row present: "Clarity Pledge" links to `/` (ClarityLogo, icon-only below `sm`); "Add this calendar to yours" opens the Google `cid` subscribe URL in a new tab (unit-tested: href/target/rel unchanged)
- [x] Desktop shows WEEK view; mobile shows AGENDA view; live matchMedia mode-switch still works (regression: P906 AC #4 — unit test preserved + observed live WEEK→AGENDA swap on viewport resize)
- [x] CSP tests still pass: `p906-csp-frame-src-calendar`, `p805`, `p865` (regression: P906 AC #1/#2/#5 — 51 tests green)
- [x] Surfaces NOT in scope are visually unchanged — spot-checked `/` and `/events` at 375px (chrome intact, no layout change)
- [x] Full test suite passes (unit: 2326 passed / 19 skipped; e2e subset incl. logo-navigation green — 5 e2e failures reproduce identically on main without this change: pre-existing landing-scroll defects + hardcoded-port test bug, reported separately)
- [ ] [post-deploy] Prod `/cm` renders full-screen calendar with zero CSP violations in console (regression: P906 AC #6)
