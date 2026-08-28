---
status: backlog
type: bug
rank: 204
severity: medium
date_reported: '2026-07-31'
created_date: '2026-07-31'
tags: [intro, booking, calendar, iframe, loading-state, failure-path]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1023: /intro loader spins forever when the calendar embed can never load

## Summary

P1017 put a loader on `/intro` that clears on the iframe's `onLoad`. If that event never fires — ad blocker, corporate proxy, DNS block, CSP `frame-src` restriction — the loader animates indefinitely over a booking surface that will never appear.

## Root Cause

`src/app/pages/intro-page.tsx` flips `embedLoaded` only inside the iframe's `onLoad` handler. `<iframe>` has no reliable cross-browser error event for network-level failures: for `ERR_BLOCKED_BY_CLIENT`-class failures Chrome and Firefox fire neither a usable `error` nor `load`, unlike `<img onerror>`. So there is no signal that would let the component distinguish "still loading" from "will never load".

Surfaced by code review during P1017's fix, alongside a live-in-prod share of the same exposure.

## Not a regression — but a changed failure signature

Before P1017 this scenario rendered a permanently blank page. It now renders a permanently animating spinner. Neither is usable, so this is not a severity increase in capability terms.

It is arguably worse as a *trust* signal, and that is the reason to fix it: a blank page reads as "broken, I'll leave", while an animating branded spinner actively asserts "work is in progress" — a claim that is false and stays false. Making a confident false statement at the highest-intent moment in the funnel is worse than making none.

Note this also means **P1017's acceptance criterion** — "a visible loader is on screen continuously from route commit until the embed paints; at no point is the viewport empty" — is satisfied by the permanently-broken case. The AC did not anticipate this state. That is a lesson about writing ACs against the happy path, not a defect in P1017's implementation.

## Reproduction Steps

1. Block `calendar.google.com` — a hosts-file entry, an ad blocker with the Google domain in its list, or Playwright `page.route('**calendar.google.com/**', r => r.abort())`.
2. Navigate to `/intro`.
3. Observe indefinitely.

**Reproduction rate:** expected 100% under a hard block. **Not yet run** — the mechanism is established from the code path and the absence of an iframe error event, not from an observed failure. Confirm during `/reproduce`.

## Expected Behavior

After a bounded interval with no `onLoad`, the visitor gets an honest message and a way to proceed — most obviously a direct link to the same Google Calendar booking page, opened in a new tab, which routes around an in-page framing block.

## Actual Behavior

The loader animates indefinitely. No message, no timeout, no alternative route to booking.

## Affected Files

- `src/app/pages/intro-page.tsx` — the `onLoad`-only state flip and the loader overlay

## Severity

**Medium** — bounded to visitors whose network or browser blocks the embed (share unmeasured, but ad-blocker penetration makes it non-trivial), and it does not make a working case worse. It is on the primary conversion path, which is what keeps it above low.

## Fix Approach

A timeout is legitimate **as a failure backstop** here. Note this does *not* reopen the alternative P1017 rejected: that was a timer used as the *load signal* (clearing the loader on a guess at Google's load time). This is a timer used only to detect that no signal ever arrived. `onLoad` remains the success path.

1. Start a timer on mount; if `embedLoaded` is still false when it fires, render a fallback state instead of the spinner. Clear the timer on load and on unmount.
2. The fallback offers a direct link to `CALENDAR_URL` with `target="_blank" rel="noopener noreferrer"`.
3. Measure a realistic p99 embed load time before picking the interval — do not guess. Too short and a slow-but-working connection gets told it is broken.

**[FOUNDER DECISION: fallback copy]** — the message a visitor reads when booking is blocked is conversion copy at the highest-intent moment, and CLAUDE.md reserves that call. Do not let an agent invent it. It needs to admit the failure without blaming the visitor, and make the direct link the obvious next step.

**[FOUNDER DECISION: timeout interval]** — the trade-off between "tells a slow connection it is broken" and "lets a blocked visitor stare at a spinner" is a judgment about the audience, not a technical constant.

## Acceptance Criteria

- [ ] With the embed blocked, the spinner is replaced by the fallback within the chosen interval
- [ ] The fallback offers a working direct link to the booking calendar, opening in a new tab
- [ ] On a slow-but-working connection the fallback does NOT appear before the embed loads
- [ ] The timer is cleared on load and on unmount — no state update after unmount, no console warning
- [ ] Regression test covers both paths: aborted request → fallback; delayed-then-successful request → no fallback
- [ ] P1017's canary (`e2e/p1017-reproduce.spec.ts`) still passes unchanged
