---
status: in-progress
type: bug
rank: 1000932.0
severity: high
date_reported: '2026-06-15'
created_date: '2026-06-15'
tags: [navigation, routing, lazy-loading, suspense]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p938-reproduce.spec.ts
  root_cause: "React Router 7.13 wraps all navigations in startTransition. LazyRoute's Suspense boundary is at the same tree position for all routes, so React's 'don't hide already-revealed Suspense during a transition' rule keeps the old page committed and never mounts the PageLoader fallback."
  confidence: high
  surfaces_in_scope: [all-lazy-routes]
  surfaces_deferred: []
  reproduced_at: '2026-06-16'
---

# P938: Navigation freezes on the old page while the destination lazy chunk loads

## Summary

When a logged-in user lands on `/feed` and clicks a nav link (e.g. Letters) before the feed finishes loading, the URL changes but the page stays showing the feed until the destination route's lazy chunk finishes downloading — there is no loading feedback, so navigation feels blocked.

## Root Cause

A three-part interaction, not a bug in the feed page itself:

1. **Every page is `lazy()`-loaded** behind a per-route `<Suspense>` (`LazyRoute`, `src/App.tsx:220`). The nav lives *outside* that boundary, so the click registers — but the page content is gated by Suspense.
2. **React Router 7.13 wraps every navigation in `React.startTransition`** (verified in the installed package: `node_modules/react-router/dist/development/chunk-*.mjs` → `React.startTransition(() => setStateImpl(newState))`). This is the v7 default; the declarative `<BrowserRouter>` exposes no opt-out.
3. The feed's `<Suspense>` and the destination's `<Suspense>` occupy the **same position** in the tree (both are `LazyRoute` children of the same `<Routes>`), so React reconciles them as one already-revealed boundary. When the destination route suspends *inside a transition*, React's "don't hide already-revealed content" rule keeps the feed committed and holds the transition pending instead of showing the route's `PageLoader` fallback.

On a fresh page load the destination chunk download competes with the feed chunk + the feed's two data fetches (`storiesService` + `pointsService`), so the freeze lines up with "until feed loads I can't navigate away."

## Reproduction Steps

1. Sign in (verified user). Use a cold browser cache / throttled network so route chunks are not yet downloaded.
2. Hard-reload `/` (redirects to `/feed`) or load `/feed` directly. The feed skeleton is showing while data fetches.
3. While the feed is still loading, click **Letters** in the nav (desktop `StaticNavLinks` or mobile bottom nav — both `<Link to="/letters">`).
4. Observe: the URL bar changes to `/letters`, but the rendered content stays on the feed; no loader appears for the new route.
5. The page only switches to Letters once the `/letters` chunk has downloaded (subjectively "after the feed loads").

**Reproduction rate:** ~100% on cold cache / throttled network; not reproducible once the destination chunk is already cached (navigation commits instantly).

## Expected Behavior

Clicking a nav link gives immediate feedback and proceeds independently of the current page's load state: a loading indicator appears in the content area (nav bar stays mounted) and the destination renders as soon as its chunk is ready — the user is never visually stuck on the page they're leaving.

## Actual Behavior

The destination URL is set immediately, but the previously-committed UI (the feed, mid-load) stays on screen with no loading indicator until the destination lazy chunk finishes downloading. It reads as a frozen / unresponsive navigation.

## Affected Files

- `src/App.tsx:220` — `LazyRoute` wraps each route's page in a single `<Suspense fallback={<PageLoader/>}>`; the boundary is at a shared tree position across routes.
- `src/App.tsx:257` — `<BrowserRouter>` (declarative router); no `useNavigation()` pending state available here.
- `src/components/ui/clarity-loader.tsx:53` — `ClarityPageLoader` is `min-h-screen` (full-height); heavier than needed for an in-content route-switch loader.
- React Router 7.13 (`node_modules/react-router/dist/.../chunk-*.mjs`) — navigation `setStateImpl` wrapped in `React.startTransition` (root cause, not an editable file).

## Severity

**High** — affects every logged-in user on every navigation away from a page that is still loading; the symptom reads as the app being broken/frozen, eroding trust. Not critical: no data loss, login works, and it resolves once the chunk loads.

## Fix Approach

Force a navigation to mount a **fresh** route-level Suspense boundary instead of updating the already-revealed one — a newly-mounted boundary shows its fallback even inside React Router's `startTransition`. Concretely: key the `LazyRoute` Suspense by the (incoming) pathname so each route gets its own boundary, keeping the nav bar mounted and showing a content-area loader during the chunk download. Pair with a lighter inline loader than `min-h-screen` `ClarityPageLoader` for route switches.

**Unverified assumption to confirm in `/reproduce` (epistemic gate #7):** keying by `useLocation().pathname` only helps if React resolves the *new* location during the pending (discarded) transition render. Confirmed in principle, not yet in this codebase — `/reproduce` must show the previously-frozen click now renders a loader and lands on the destination.

Alternative (not recommended for this fix): migrate to a data router (`createBrowserRouter`) + `useNavigation()` for a top progress bar that keeps the old page visible — better polish but a router-architecture migration with many more failure modes. Optional complementary perf: prefetch common route chunks on idle to shrink the window.

## Acceptance Criteria

- [ ] Logged in on `/feed` with the feed still loading, clicking **Letters** shows a loading indicator and lands on `/letters` without waiting for the feed's data to finish
- [ ] Same holds for other lazy nav targets (Events, My Profile) clicked from a still-loading page
- [ ] The nav bar stays mounted and interactive throughout (no full-app flash)
- [ ] Already-cached navigations and browser back/forward still feel instant — no unnecessary loader flash once the chunk is cached (no regression)
- [ ] Regression test passes: `e2e/p938-*.spec.ts` (throttled network, logged-in)
- [ ] No console errors during the affected flow
