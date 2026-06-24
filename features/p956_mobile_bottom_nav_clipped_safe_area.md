---
status: qa
type: bug
rank: 1000933
severity: high
workstream: C1
date_reported: '2026-06-23'
created_date: '2026-06-23'
tags: [mobile, pwa, safe-area, bottom-nav, viewport]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P956: Mobile bottom nav clipped behind Android system bar (safe-area insets inert)

## Summary

On mobile (especially the installed PWA on Android), the fixed bottom navigation is clipped behind the system navigation bar — its text labels and active-tab dot are hidden, and the user must scroll or zoom to reach the bottom buttons. The same dead safe-area padding affects Clarity Live controls, fixed-bottom-bar CTAs, letter reading, and EventDetail.

## Root Cause

`index.html` viewport meta is `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` — it lacks `viewport-fit=cover`. Per the CSS Environment Variables spec, `env(safe-area-inset-*)` only resolves to non-zero values when `viewport-fit=cover` is set; otherwise every `env(safe-area-inset-*)` evaluates to `0`.

The bottom nav relies on `pb-[env(safe-area-inset-bottom)]` (`bottom-nav.tsx:108`) to clear the system bar, so that padding is currently a no-op. `vite.config.ts:163` sets `display: 'standalone'`, so the installed PWA runs edge-to-edge on Android 15 — the transparent system nav bar overlays the web content and clips the bottom nav.

The same inert `env(safe-area-inset-bottom)` is depended on in five other surfaces (all currently getting 0 clearance): `fixed-bottom-bar.tsx:29`, `live-mode-view.tsx:105` and `:2331`, `letter-reading-page.tsx`, `EventDetail.tsx:657`, `sonner.tsx:10`.

**Verification status:** root cause confirmed by reading the code. The on-device rendering consequence is a spec-backed inference, not yet confirmed on a physical Android device — see Reproduction. Secondary browser-tab symptom (fixed nav anchored below the fold until the URL bar retracts) is a related but distinct dynamic-viewport mechanism, tracked as Out of scope below.

## Reproduction Steps

1. On an Android phone, install the app as a PWA ("Add to Home Screen") and open it from the home-screen icon (standalone, no browser URL bar).
2. Sign in (the bottom nav only renders for logged-in users — `showUserMenu`).
3. Navigate to a browse route with the bottom nav, e.g. `/letters` (Clarity Docs) or the feed.
4. Observe: the bottom nav icons are clipped at the bottom edge; the per-item text labels and the active-tab dot are hidden behind the Android 3-button / gesture system bar.

**Decisive on-device diagnostic** (desktop `chrome://inspect` → inspect the page → console):
```js
const d = document.createElement('div');
d.style.paddingBottom = 'env(safe-area-inset-bottom)';
document.body.appendChild(d);
console.log({
  standalone: matchMedia('(display-mode: standalone)').matches,
  safeAreaBottom: getComputedStyle(d).paddingBottom, // "0px" while standalone:true => confirms bug
});
d.remove();
```

**Reproduction rate:** 100% on installed PWA / edge-to-edge Android contexts where the system bar overlays web content.

## Expected Behavior

The bottom nav (and other fixed-bottom UI) clears the system navigation bar: the full nav — icons, labels, and active dot — is visible above the Android system bar without scrolling or zooming.

## Actual Behavior

The bottom nav's lower portion (labels + active dot) is drawn behind the system navigation bar and clipped. `env(safe-area-inset-bottom)` evaluates to `0`, so the intended clearance padding does nothing.

## Affected Files

- `index.html` — line 6, viewport meta missing `viewport-fit=cover` (the fix)
- `src/app/components/layout/bottom-nav.tsx` — line 108, `pb-[env(safe-area-inset-bottom)]` (primary symptom; benefits from fix)
- `src/app/components/shared/fixed-bottom-bar.tsx` — line 29 (benefits)
- `src/app/components/partners/live-mode-view.tsx` — lines 105, 2331 (Clarity Live; benefits)
- `src/app/pages/letter-reading-page.tsx` — `env(safe-area-inset-bottom)` calc padding (benefits)
- `src/app/prototypes/events/components/EventDetail.tsx` — line 657 (benefits)
- `src/components/ui/sonner.tsx` — line 10 (toast top inset; benefits)
- `vite.config.ts` — line 163, `display: 'standalone'` (context, not changed)

## Severity

**High** — affects all logged-in mobile/PWA users on a core navigation surface; the primary way to move between sections is partially hidden.

## Fix Approach

Add `viewport-fit=cover` to the viewport meta in `index.html`:
`<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`.

This single change activates every existing `env(safe-area-inset-*)` usage across the app at once. A regression guard (unit test) asserts the `index.html` viewport meta contains `viewport-fit=cover`, so the prerequisite cannot be silently dropped again.

**Scope expansion (top inset):** because `viewport-fit=cover` also activates `env(safe-area-inset-top)` on notched iOS, the top nav (`simple-navigation.tsx`) gains `pt-[env(safe-area-inset-top)]` and the shared content offset (`clarity-landing-layout.tsx`) grows by the same inset, so the nav and content below it clear the iOS status bar. Two dependent surfaces that pinned to the old 4rem/5rem nav height were also corrected: the article progress bar + mobile TOC button (`full-article-page.tsx`) and the chat context header (`ChatContextHeader.tsx`). All resolve to the prior 4rem/5rem on Android/desktop (inset = 0).

## Out of Scope

- **/live RecordingIndicator top offset** on notched iOS — deferred to **P961** (carries a two-party E2E coverage requirement and a distinct `/live` layout context).
- **Browser-tab dynamic-toolbar symptom** ("scroll/zoom to reveal the bottom nav" in a non-installed Chrome tab): a distinct mechanism (`position: fixed; bottom:0` + `min-h-screen` `100vh` vs visual viewport), not addressed by `viewport-fit=cover`. On-device verification item — if it still reproduces after this fix ships, it gets its own `100vh`→`dvh` spec.

## Acceptance Criteria

- [x] `index.html` viewport meta contains `viewport-fit=cover` — verified by canary (fails when removed)
- [x] Regression test passes asserting the viewport meta contains `viewport-fit=cover` — `src/tests/p956-viewport-fit-cover.test.ts`, 3/3 green
- [x] Top nav + content offset and the two dependent surfaces compile and render unchanged at inset = 0 (Android/desktop) — tsc clean, browser-verified at desktop + 375px
- [ ] On the installed Android PWA, the bottom nav (icons + labels + active dot) is fully visible above the system navigation bar without scrolling or zooming — [on-device]
- [ ] On-device diagnostic reports `safeAreaBottom` > `0px` when `standalone: true` — [on-device]
- [ ] Clarity Live bottom controls and fixed-bottom-bar CTAs clear the system bar on the same device — [on-device]
- [ ] Top nav clears the iOS status bar on a notched iPhone PWA (no content under the status bar) — [on-device]
- [ ] No console errors during the affected flows — [on-device]
