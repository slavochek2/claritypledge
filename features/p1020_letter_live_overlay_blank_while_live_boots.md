---
status: backlog
type: bug
rank: 85
severity: medium
date_reported: '2026-07-31'
created_date: '2026-07-31'
tags: [letters, live, iframe, loading-state, overlay]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1020: Letter live overlay is a full-screen white sheet while /live boots

## Summary

`LetterLiveOverlay` opens a `fixed inset-0 bg-white` modal containing an iframe pointed at `/live/{code}`, with no loading state — so the visitor gets an opaque full-screen white sheet for as long as the live route takes to boot.

## Root Cause

Same missing-load-state pattern as P1017, with two differences that make it its own ticket rather than a surface of that one:

1. **The iframe is same-origin** (`/live/{code}`, not a third party), so `onLoad` is not the only signal available — `postMessage` from the live route is also on the table. The right fix may differ from P1017's.
2. **The container is opaque and full-screen** (`letter-live-overlay.tsx:8-13`), so the blank state covers the whole viewport with no logo, no chrome, no escape affordance visible. `/intro` at least leaves the site's logo nav on screen.

`/live` is a lazy-loaded, auth-gated route that also negotiates microphone permission, so its boot window is materially longer than a static embed's.

Surfaced by P1017's surface audit, not by a user report. **Not confirmed against a live session** — the reproduction below is derived from reading the component, and the actual duration of the white window has not been measured.

## Reproduction Steps

1. Open a letter that has an associated live session code, as the recipient.
2. Trigger the live overlay.
3. Observe the viewport between the overlay mounting and the `/live` route painting.

**Reproduction rate:** unconfirmed — reproduce before fixing.

## Expected Behavior

The overlay shows a loading state (and ideally a way out) until the live route paints.

## Actual Behavior

Expected to be an opaque white full-screen sheet with no content. **Unverified — see Root Cause.**

## Affected Files

- `src/app/components/letters/letter-live-overlay.tsx:8-21` — opaque overlay, iframe with no load state and no visible dismiss control

## Severity

**Medium** — pending reproduction. A full-viewport opaque blank with no affordance is worse per-occurrence than P1017, but this is a narrower path (letter recipients with a live session) than the site's primary CTA, and the duration is unmeasured. Re-rate after `/reproduce`.

## Fix Approach

Run `/reproduce` first — measure the actual window before choosing a fix. Then, likely: a `ClarityLoader` inside the overlay behind the iframe, cleared on `onLoad`.

Worth deciding at fix time, not now: whether the overlay should also expose a dismiss control during load. That is a **[FOUNDER DECISION]** — it changes what a visitor can do mid-boot, not just what they see.

## Acceptance Criteria

- [ ] Reproduction confirms (or disproves) the blank window, with a measured duration
- [ ] If confirmed: a loading state is visible from overlay mount until `/live` paints
- [ ] No layout shift or flash when the live route takes over
- [ ] No console errors during the flow
