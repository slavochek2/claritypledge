---
status: in-progress
type: story
rank: 1000940.0
created_date: '2026-06-28'
tags: [booking, intro, calendar, landing]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
---

# P974: /intro Booking Page (Google Calendar Embed)

## Problem

There is no dedicated, shareable URL for booking an intro call. The founder wants a
clean `/intro` route that surfaces a Google Calendar appointment scheduler so a single
link can be handed out (outreach, email signatures, profile links) and lands the
visitor straight on the booking widget.

## Appetite

Low blast radius — one new page and one new route, no existing flow changes. Fully
reversible (delete the page file + route line, `git revert`). Low decision density —
the iframe is fixed; the one open layout decision (calendar above the nav) is captured
below.

## Solution

Add a new `/intro` route rendering a page whose only content is the Google Calendar
appointment-scheduling iframe (no surrounding heading or marketing copy). Follow the
`/about` page pattern: a lazy-loaded page component in `src/app/pages/intro-page.tsx`,
registered in `src/App.tsx`, with `<SEO>` and a Mixpanel `intro_page_viewed` event on
mount.

**Embed source (fixed constant, not user/DB-derived):**
`https://calendar.google.com/calendar/appointments/schedules/AcZssZ0pH1jWUa8-Z3RDlKG7JdEf2S8ImaEpcFN1FJd362abEJ-7GC19kmOMexlThT4ardMD9NqzB0mm?gv=true`

**Layout (KISS — decided):** Use the standard page pattern, identical to `/about` —
calendar inside `ClarityLandingLayout`, below the top nav. The earlier "above the nav"
idea is dropped: no layout fork, no scroll-behavior risk. The page renders the iframe
in the standard centered container.

**Indexing (decided):** `/intro` is a direct-share link, not a discovery page — render
`<SEO noIndex ... />` so it stays out of search results (same pattern as
`blog-subscribed-page`).

## Risks / Non-Goals

### Risks
- Iframe height: a fixed 600px height may clip the scheduler or leave dead space on
  some viewports. Mitigation: full-width iframe, test height at 375px / 320px / desktop
  and pick a value (or min-height) that shows the full widget.
- Placing content above the nav can break the expected sticky/scroll behavior of the
  top menu. Mitigation: verify nav still works (links, mobile menu) with the embed above it.

### Non-Goals
- Do NOT add any heading, intro copy, or CTA around the calendar — embed only.
- Do NOT fork or modify `ClarityLandingLayout` for other routes.
- Do NOT build a custom booking UI or hit any calendar API — the Google iframe is the
  whole feature.
- Do NOT route the embed URL through `safeLinkHref` (it is a hardcoded constant, not a
  user/DB string) — but keep it a literal, never interpolate user input into it.

## Done-When

- [x] Visiting `/intro` renders the Google Calendar scheduler, full width.
- [x] The page uses the standard `/about` layout (calendar in container, below nav).
- [x] The full scheduler widget is visible (not clipped) at 375px, 320px, and desktop.
- [x] The top nav remains functional (links + mobile menu) with the embed above it.
- [x] `<SEO noIndex>` set — `/intro` carries `robots: noindex, nofollow`.
- [x] `intro_page_viewed` Mixpanel event fires on mount.

## Acceptance Criteria

- [x] `/intro` is a working, shareable URL landing directly on the booking widget.
- [x] No surrounding heading or marketing copy is rendered.
- [ ] Booking flow within the iframe completes (book a slot end-to-end in the embed).

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Route | `/intro` | New |
| Page content | Google Calendar iframe only | No heading/copy |
| Iframe width | `100%` | Full width |
| Iframe position | Standard container, below nav | KISS — `/about` pattern |
| SEO title | "Book an intro call" | `<SEO title>` (noIndex) |
| Robots | `noindex, nofollow` | `<SEO noIndex>` |
