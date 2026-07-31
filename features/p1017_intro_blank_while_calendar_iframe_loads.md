---
status: in-progress
type: bug
rank: 1000956.0
severity: high
date_reported: '2026-07-30'
created_date: '2026-07-30'
tags: [intro, booking, calendar, iframe, loading-state]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p1017-reproduce.spec.ts
  root_cause: "Suspense fallback unmounts when the lazy chunk resolves; the cross-origin calendar iframe is the page's only content and has no load state, so nobody owns the window between the two"
  confidence: high
  surfaces_in_scope: [intro-page]
  surfaces_deferred: [P1019, P1020]
  reproduced_at: 2026-07-31
---

# P1017: /intro renders a fully blank page while the calendar iframe loads

## Summary

`/intro` — the destination of the homepage's primary "Book your free alignment audit" CTA — shows zero pixels of content for the seconds between the lazy chunk resolving and the cross-origin Google Calendar embed painting, so the page reads as broken or hung.

## Root Cause

Confirmed by reading the render path; three facts compose into the gap.

1. `IntroPage` (`src/app/pages/intro-page.tsx:32`) renders exactly one visible element: a cross-origin `<iframe>` pointing at `calendar.google.com`, reserving `min-h-[1000px]` on mobile / `580px` at `sm:` and up.
2. `LazyRoute` (`src/App.tsx:233-242`) wraps the route in `<Suspense fallback={<ClarityPageLoader />}>`. That fallback is bound to the **lazy chunk fetch only** — it unmounts the instant the chunk resolves and `IntroPage` mounts. It knows nothing about the iframe's network request, which has not started yet.
3. The page's own heading was **deliberately removed** (comment at `intro-page.tsx:18-22`; decisions.md 2026-07-16 `[product]`) because the embed carries its own title. That removal was correct on its own terms, but it eliminated the only first-party text on the route.

Net effect: after step 2, the DOM contains a 1000px-tall empty iframe and nothing else. Browsers paint an unloaded iframe as blank, so the viewport is empty until Google's embed finishes. Nobody owns that window.

Aggravating factor: `ClarityPageLoader` carries a 300ms CSS anti-flash delay plus a 200ms fade-in (`src/index.css:195-198`), so on a warm chunk the loader may never become visible at all — the transition is blank-to-blank, with no indication anything is in flight.

## Reproduction Steps

**Deterministic (preferred — this is what the canary does).** Intercept the embed's request and hold the response open, then assert on the state rather than racing the network: `page.route('**calendar.google.com/**', ...)` + `page.goto('/intro', { waitUntil: 'domcontentloaded' })`. See `e2e/p1017-reproduce.spec.ts`.

> `waitUntil: 'domcontentloaded'` is required, not incidental. A held iframe blocks the window `load` event by design, so Playwright's default `waitUntil: 'load'` hangs until the test timeout — which looks like a broken test, not a held embed. This cost one full run to diagnose.

**Manual (what the founder saw):**

1. Open a fresh browser profile (or hard-reload with cache disabled) — the iframe must not be warm.
2. Throttle the network to Fast 3G in DevTools, to widen the window that exists at all speeds.
3. Navigate to `/intro` directly, or click "Book your free alignment audit" on `/`.
4. Observe the viewport between the moment the route commits and the moment the Google embed paints.

**Reproduction rate:** 100% on a cold iframe; the blank window's duration scales with connection speed and is briefly present even on fast connections.

## Expected Behavior

From the moment the route commits until the embed paints, the visitor sees an unambiguous in-progress signal — a centered `ClarityLoader` — so the page reads as loading, never as empty or broken. When the embed paints, the placeholder disappears with no layout shift.

## Actual Behavior

The content area is blank — no heading, no loader, no skeleton, no text. A visitor at the highest-intent moment in the funnel has no evidence the page is working, and the reporting founder's own read was "there is nothing on the page and it feels like nothing will appear."

**Correction (reproduce, 2026-07-31):** an earlier draft of this spec said the *viewport* is entirely blank. It is not — the route is wrapped in `ClarityLandingLayout logoOnly`, whose `SimpleNavigation` branch (`simple-navigation.tsx:272-286`) renders a fixed logo bar at `h-16` / `lg:h-20`. What is blank is everything below it.

That correction narrows the claim without softening it. Measured at 375×800 with the embed held open: `document.body.innerText` is the empty string and **zero** elements below y=80 have visible text. The only pixels on screen are a 28px logo icon in the top-left corner. A page whose sole content is a small icon in a corner reads as broken more, not less, than one that is uniformly white.

## Affected Files

- `src/app/pages/intro-page.tsx:32-38` — the iframe with no accompanying load state; the whole of the page body
- `src/App.tsx:233-242` — `LazyRoute`; establishes that the Suspense fallback covers the chunk only (context, not a defect — do not change)
- `src/index.css:195-198` — `.clarity-page-loader` anti-flash delay (context, explains why no loader is seen on warm chunks)

## Severity

**High** — this is the destination of the site's primary conversion CTA. The page does eventually work, but a visitor who reads a blank screen as broken bounces before the embed paints and never books; the failure is concentrated at the single highest-intent moment in the funnel.

## Fix Approach

Overlay a `ClarityLoader` on the iframe inside a `relative` wrapper, and remove it when the iframe's `onLoad` fires.

- **`onLoad` is the only available signal.** The iframe is cross-origin, so its internal state is unreadable; `onLoad` fires on document load regardless of origin and is sufficient here.
- **Use `ClarityLoader size="lg"`, not `ClarityPageLoader`.** decisions.md 2026-04-11 `[technical]` establishes `ClarityPageLoader` as a page-level gate only — its `min-h-screen` would push the spinner far down inside an already-rendered layout. Wrap in a centering div per that entry.
- **Overlay, not swap.** Absolute positioning inside a `relative` parent leaves the existing responsive `min-h-[1000px] sm:min-h-[580px]` + `calc(100dvh - 15rem)` height math untouched, so there is no layout shift when the placeholder leaves. That height split is load-bearing and was itself a prior fix (`db54449e` — phones could not book); do not refactor it here.
- The placeholder needs its own `data-testid` — `ClarityLoader`/`ClarityPageLoader` carry **no** testid in the component (verified: `data-testid="loader"` appears only in `src/tests/*` mocks, never in `src/components/ui/clarity-loader.tsx`, contra decisions.md 2026-05-xx line ~8809 which describes it as being on the component).

**Alternatives rejected:**

- **Re-adding a heading / copy block so the page isn't empty.** Explicitly rejected in decisions.md 2026-07-16 `[product]`, which removed exactly that block because the embed's own title duplicates it back-to-back at the highest-intent moment. That entry's own "Alternatives rejected" also disposes of the trim-to-one-line variant. A loader is the right answer precisely because it is transient — it fills the gap without reintroducing permanent redundancy.
- **A fixed timer or delay-based placeholder.** Guesses at a third-party's load time; either flashes on fast loads or clears while still blank on slow ones. `onLoad` is an actual signal.
- **Skeleton mimicking the calendar layout.** The embed's internal layout is a third-party surface that has already drifted once (decisions.md 2026-07-16 records the "bare embed" comment going stale). A skeleton shaped to it becomes a lie on the next Google change.

## Acceptance Criteria

- [ ] On a cold, network-throttled load of `/intro`, a visible loader is on screen continuously from route commit until the calendar embed paints — at no point is the viewport empty
- [ ] Once the embed paints, the loader is gone and no calendar content is covered or dimmed by it
- [ ] The embed's own position and size are unchanged from current behavior — no layout shift when the loader disappears, at 320px, 375px, and desktop
- [ ] A bookable time slot is still selectable at 320px (guards the `db54449e` regression this fix touches the container of)
- [ ] No heading or body copy is added to the page (decisions.md 2026-07-16)
- [ ] No console errors during the flow
- [ ] Regression test passes: `e2e/p1017-*.spec.ts`

**Verification note for `/verify` and any visual QA:** capture `/intro` **per-viewport, never `fullPage`** — `fullPage` capture blanks cross-origin iframes and will produce a false "renders nothing" finding on this exact page. This already happened once and nearly caused a good QA run to be dismissed (decisions.md, P987 visual-QA capture entry).
