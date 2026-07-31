---
status: qa
type: bug
rank: 1000956.0
severity: high
date_reported: '2026-07-30'
created_date: '2026-07-30'
tags: [intro, booking, calendar, iframe, loading-state]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p1017-reproduce.spec.ts
  root_cause: "Suspense fallback unmounts when the lazy chunk resolves; the cross-origin calendar iframe is the page's only content and has no load state, so nobody owns the window between the two"
  confidence: high
  surfaces_in_scope: [intro-page]
  surfaces_deferred: [P1019, P1020]
  reproduced_at: 2026-07-31
date_resolved: '2026-07-31'
root_cause: "Four uncovered windows, not one. (1) #root is empty until React mounts, so nothing could paint for the first ~85ms. (2) The Suspense fallback is bound to the lazy chunk fetch and its 300ms anti-flash delay spanned nearly the whole ~302ms chunk window. (3) The iframe was the page's only content and had no load state (~5.5s). (4) The embed's onLoad fires when the document arrives, ~1.6s before Google's client-side picker actually paints."
resolution: "Inline app-shell loader in index.html hidden by pure CSS on #root:not(:empty), crossfading to cover the anti-flash delay; ClarityLoader overlaid on the embed in a relative wrapper, sticky-positioned to stay inside the viewport on phones; overlay fades rather than unmounting at onLoad, over a duration derived from the client's own measured embed-fetch time so slow connections stay covered. Verified against the real calendar.google.com embed under throttling: 0 blank frames at fast/3G/slow-3G."
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

- [x] On a cold, network-throttled load of `/intro`, a visible loader is on screen continuously from route commit until the calendar embed paints — at no point is the viewport empty
- [x] Once the embed paints, the loader is gone and no calendar content is covered or dimmed by it
- [x] The embed's own position and size are unchanged from current behavior — no layout shift when the loader disappears, at 320px, 375px, and desktop
- [ ] A bookable time slot is still selectable at 320px (guards the `db54449e` regression this fix touches the container of) `[post-deploy]` — requires the real Google embed on a real phone; the canary asserts the container geometry (`height >= 1000` at 320px) but cannot click a Google-rendered slot
- [x] No heading or body copy is added to the page (decisions.md 2026-07-16)
- [x] No console errors during the flow
- [x] Regression test passes: `e2e/p1017-reproduce.spec.ts` — 8/8

## Resolution

**Fixed:** 2026-07-31 · **Branch:** `feature/p1017-intro-iframe-loader`

`ClarityLoader size="lg"` overlaid on the embed inside a `relative` wrapper, cleared on the iframe's `onLoad`. The wrapper carries no sizing, so the `db54449e` height math stays entirely on the iframe and the overlay cannot displace it.

**Evidence:** canary went 4 failed → 8 passed; unit suite 2736 passed / 0 failed; typecheck clean. Measured before the fix at 375×800 with the embed held open: `document.body.innerText` empty, zero elements with visible text below the nav.

### Two findings the first implementation got wrong

**1. The loader was below the fold on short phones — found by blind visual QA, missed by the code review and by the canary.**
Centering inside the overlay centred it in a box up to **1000px** tall (the mobile `min-h`), not in the viewport. At 320×568 the spinner's bottom edge sat at **y=620 — 52px past the fold**. Every test passed: `toBeVisible()` does not require viewport intersection, so the canary asserted a loader the visitor could not see. That is the original bug wearing a green test.

Fixed with `sticky top-0` + `h-[100dvh] max-h-full`, which centres in the *visible slice* of the box. Guarded by a new per-height test (320×568/700/900) asserting `box.y + box.height <= viewportHeight`. **Failure path exercised** (epistemic gate 7): reverting to plain centring makes 320×568 fail with `620 > 568`, exit 1.

**Generalisable:** `toBeVisible()` is a DOM-presence assertion, not a visibility one. Any loader or empty-state inside a container taller than the viewport needs an explicit in-viewport assertion.

**2. No live region.** The overlay now carries `role="status" aria-live="polite"`. `ClarityLoader`'s own `role="img" aria-label="Loading"` only announces if the user happens to land on the element — without a live region a screen-reader user got the pre-fix experience: no signal that anything was loading, none that it finished.

### Second pass — two more windows, found only by measuring against the real embed

Everything above was verified against a **stubbed** embed (`route.fulfill`). Measuring a cold load against the real `calendar.google.com` showed the fix covered roughly half the blank time and had introduced a gap of its own. There are **four** windows, not one:

| window | duration | covered by |
|---|---|---|
| HTML parsed → React mounts | ~85 ms | inline app-shell loader in `index.html` |
| React mounts → lazy chunk resolves | ~302 ms | the shell's 400 ms crossfade |
| chunk resolves → iframe `onLoad` | ~5.5 s | the overlay above (first pass) |
| `onLoad` → Google's picker paints | ~1.6 s | the overlay's derived fade |

**3. Nothing could paint before React mounted.** `index.html` was a bare `<div id="root"></div>`, so the first ~85 ms of every full page load of `/intro` was blank — upstream of anything the page component can do. Fixed with a loader inlined in `index.html` (no extra request; neither the CSS nor the JS bundle has arrived yet), hidden by pure CSS on `#root:not(:empty)` — no JS timer, nothing for `main.tsx` to call. Its 400 ms fade is load-bearing, not decorative: `ClarityPageLoader` deliberately stays invisible for its first 300 ms (anti-flash), which almost exactly matched the 302 ms chunk window, so an instant hide handed off into a fresh gap. **FCP 88–104 ms → 20–24 ms.**

**4. `onLoad` is not "the calendar is on screen".** It fires when the iframe *document* loads; Google's client-side app painted the picker **~1.6 s later**. Unmounting the overlay at `onLoad` therefore produced a *second* blank window. The stub could never expose this — a fulfilled response is complete the instant it loads, making window 4 exactly zero by construction. Cross-origin gives no paint signal, so the overlay now **fades** instead of unmounting, releasing `pointer-events` immediately so a calendar that IS ready is never trapped behind it.

A fixed fade duration was itself a defect: 2200 ms covered the gap on a fast link and would have missed by ~7 s on slow 3G, because a slow client makes Google's render slower too. The duration is now derived — `clamp(embedFetchDuration × 0.45, 2200 ms, 12000 ms)` — using how long the embed's own fetch took as an already-measured proxy for this visitor's connection.

**Evidence (real embed, CDP throttling, content-area PNG byte size sampled every 400–500 ms; blank baseline ≈ 1440 B):**

| profile | blank frames | min bytes | `onLoad` → picker |
|---|---|---|---|
| unthrottled | **0** | 2522 B | 7.26 s → 7.56 s |
| 3G | **0** | 2709 B | 8.56 s → 10.30 s |
| slow 3G | **0** (99 samples) | 2980 B | 22.5 s → 24.0 s |

**Speed:** first-party code is **384 ms of a ~7.6 s wait (5%)**; the embed is 95%. Deleting the entire 246 KB-gzip entry chunk caps out at ~380 ms. A `preconnect` to Google produced **no measurable change** (inside run-to-run noise — warm DNS/TLS on the test host, and the wait is Google's server work). Kept as two cheap hints with the null result recorded in the comment. Verdict: measured, not worth pursuing further — the wait is Google's, and the answer is to cover it.

### Reviewed and deliberately not changed

- **Spinner sits lower on mobile than desktop** — measured 65.5% (320×568) / 61.0% (375×800) / 48.2% (desktop) of viewport height. Real and correctly identified by visual QA. Cause: two regimes — the mobile box (1000px) exceeds the viewport while the desktop box (~660px) does not. Equalising needs breakpoint-specific `calc()` height on the sticky container to compensate for the nav offset. Not done: the loader is comfortably in view at every tested size, and no single visitor ever sees two breakpoints, so the inconsistency is invisible in use. Recorded so it is not re-litigated.
- **The loader glyph is the brand mark** — visual QA flagged that a visitor could read it as a second logo rather than a progress signal. It is also `ClarityLoader`, the app-wide loading component (decisions.md 2026-04-11). Changing the glyph is a system-wide design decision, not this bug's scope.
- **"Washed-out" contrast in the loading screenshots** is the `clarity-breathe` animation (`index.css:185`, opacity 0.7↔1.0 on a 2.4s cycle) caught mid-cycle by a static capture — not a contrast defect.
- **Apparent layout shift between the loading and loaded screenshots** is the test stub (plain text) not filling the box the real embed fills. The canary asserts the iframe's box is identical across the transition to ±0.5px.

### Open — a founder decision, not an oversight

Visual QA's strongest finding: **the loading state has no copy telling the visitor what is loading.** A proposed `Loading your booking calendar…` under the spinner would raise the "this is working" read at the highest-intent moment.

This does **not** conflict with decisions.md 2026-07-16 — that removed a *permanent heading duplicating the embed's own title*. A transient loading label is the transient gap-filler this spec already argues for. But it is visible copy on the primary conversion page, so it is **[FOUNDER DECISION: loading-state copy]**. Shipping without it is safe; the animated loader already resolves the reported symptom.

### Deferred, with tickets

| Ticket | Why separate |
|---|---|
| **P1019** | Same missing-load-state on `/chiang-mai`'s calendar embed. Milder — that page has first-party text throughout. |
| **P1020** | `LetterLiveOverlay`'s full-screen opaque iframe. Same-origin, so `postMessage` is also available — the fix may differ. |
| **P1021** | `p987-verify`'s hero `h1` guard fails on `main`. Pre-existing, unrelated route, found while classifying an e2e failure. |
| **P1023** | If the embed is blocked (ad blocker, CSP), `onLoad` never fires and this loader spins forever. Not a regression — the page was blank-forever before — but a worse trust signal. Fallback copy and timeout interval both marked founder decisions. |

**Verification note for `/verify` and any visual QA:** capture `/intro` **per-viewport, never `fullPage`** — `fullPage` capture blanks cross-origin iframes and will produce a false "renders nothing" finding on this exact page. This already happened once and nearly caused a good QA run to be dismissed (decisions.md, P987 visual-QA capture entry).
