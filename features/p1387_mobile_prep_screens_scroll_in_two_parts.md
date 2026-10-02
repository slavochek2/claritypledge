---
status: in-progress
type: bug
rank: 16
severity: high
workstream: events
date_reported: '2026-10-02'
created_date: '2026-10-02'
drafted_by: opus
exec_model: opus
exec_effort: high
reproduce_artifact:
  test_file: e2e/p1387-mobile-prep-one-page.spec.ts
  observed_red: '6 failed — confirm pinned 0.44 (390) / 0.56 (320); blank scroll 80px on plan and room gate at both widths'
  confidence: high
tags: [events, preparation, mobile, layout]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
related: [p1336, p1386]
---

# P1387: On phones, the registration and preparation screens scroll in two parts

## Summary

On a phone, the Clarity Night confirm screen and the preparation steps behave like two parts: a
panel pinned to the bottom covers half the screen while the content scrolls behind it, and every
preparation step scrolls 80px of blank space.

> Founder, verbatim (2026-10-02): "the preparation screen i'm scrolling but i don't scroll it's not
> one page that's weird" … "there are multiple parts and I scroll only one part or whatever is that
> what we wanted really I don't know"

## Root Cause

Two independent causes, both found by an adversarial mobile review (Playwright, iPhone 13 emulation
390x664 and 320x568, test DB) and checked against the code:

1. **80px of blank scroll on every step.** `src/app/layouts/clarity-landing-layout.tsx` sets
   `needsBottomPadding = showUserMenu && !isLivePage && !logoOnly` → `pb-20 lg:pb-0` whenever the
   person is signed in. That padding reserves room for the phone BottomNav — but
   `src/app/components/layout/bottom-nav.tsx` hides the BottomNav on focus routes, including
   `/events/:slug/(ready|room|prepare)` and `/events/:slug/meet`. Measured: every step's document is
   exactly 80px taller than the viewport (744 vs 664, 648 vs 568). The two route rules diverged.
2. **Pinned panels cover the content.** The desktop decision "keep the action in view" pins whole
   panels, not a button:
   - Confirm screen: `PrepBlock` in `src/app/prototypes/events/prep/PrepPieces.tsx` (pinned mode,
     `useState(pinned)` + `resize` listener) pins "Our events are different … Prepare now / Remind me
     by email" when it would end below the fold — which is always on a phone. It covers ~50% at 390
     and 72% at 320; "You're Registered!", the event title and date sit behind it.
   - Principle rating step: the host line + question + 0–10 + Confirm panel is pinned, covering
     418/568px at 320; the certificate scrolls behind it, cut off.
   - Because the pin decision re-runs on `resize`, and iOS fires resize as its toolbar collapses
     mid-scroll, the panel can also jump while scrolling (code-only; untested on a real iPhone).

Why no test caught it: the e2e suite runs Desktop Chrome resized to 320px (no `isMobile`, no
`hasTouch`) and never asserts scroll height or how much fixed chrome covers.

## Invariants

- A pinned element on a phone is at most one action strip (a button row), never a panel of
  content. Content the person must read scrolls with the page.
- Bottom padding for the BottomNav follows the same route rule that shows the BottomNav — one
  source, not two copies.

## Reproduction Steps

1. Signed in, on a phone (or Playwright `devices['iPhone 13']`), register for a Clarity Night with
   Preparation on.
2. Land on `/events/:slug/confirm`: the prep panel covers the bottom half; swiping scrolls the event
   details behind it.
3. Tap **Prepare now** → `/events/:slug/prepare`: on a short step, swipe up — the page moves 80px into
   blank space.
4. Reach the principle rating step: the question panel covers most of the screen; the certificate
   scrolls behind it.

**Reproduction rate:** 100% signed in on a phone-width viewport.

## Expected Behavior

Each screen scrolls as one page. A step whose content fits does not scroll. At most a single
button row stays pinned at the bottom, and only when the content is longer than the screen.

## Actual Behavior

Two-part screens: a pinned panel covering 50–74% of the screen with content scrolling behind it;
80px of blank scroll on every preparation step and on the room gate.

## Affected Files

- `src/app/layouts/clarity-landing-layout.tsx` — `needsBottomPadding` (`pb-20`)
- `src/app/components/layout/bottom-nav.tsx` — the focus-route rule the padding must share
- `src/app/prototypes/events/prep/PrepPieces.tsx` — `PrepBlock` pinned mode
- `src/app/prototypes/events/prep/EventPrepPage.tsx` / `prep-content.tsx` — principle rating panel (suspected; pinned via `FixedBottomBar`)

## Severity

**High** — every registrant for the 6 Oct Clarity Night goes through these screens, mostly on a
phone.

## Fix Approach

1. Export the BottomNav visibility rule from `bottom-nav.tsx` and use it for `needsBottomPadding`.
2. On phones, render `PrepBlock` and the rating panel inline (the page scrolls as one); keep only a
   single action button pinned when the content is longer than the screen. Drop the resize-driven
   re-pin.
3. Add a mobile e2e (`isMobile` + `hasTouch`, 390 and 320): on each prep screen, assert
   `scrollHeight <= innerHeight` when the content fits, and that fixed/sticky bottom elements cover at
   most a strip (≤ 25% of the viewport).

## Acceptance Criteria

- [ ] On a 390 and a 320 phone viewport, signed in, a preparation step whose content fits does not scroll (no blank 80px)
- [ ] The confirm screen shows "You're Registered!" and the event details uncovered; the prep panel is part of the page, not pinned over it
- [ ] On the principle rating step, the certificate is readable and the question scrolls with the page; nothing pinned covers more than a button row
- [ ] Pages that DO show the BottomNav keep their bottom padding (no content hidden under it)
- [ ] Regression test passes: `e2e/p1387-mobile-prep-one-page.spec.ts` (mobile emulation, 390 and 320)
