---
status: in-progress
type: bug
rank: 1
tags: [navigation, stake]
disclosure: public
created_date: '2026-09-14'
delivery_stage: dev
pipeline_ran: [create-spec, dev]
---

# P1311: "Go back" on /stake drops a reader arriving from an outside page onto the feed

## Problem

Founder, UAT on `https://claritypledge.com/stake/aisafety1?tab=stories`:

> "if i come from event page /aisafety it doesnt go back to that page?"

The event write-up that links to a stake page lives outside the SPA. A reader following that
link arrives at the app's **first** history entry, which `handleBack` (P1296) reads as "arrived
cold — there is nowhere to go back to" and substitutes `/feed`. But the page they came from is
still one step back in the tab's history: the reader is sent somewhere they have never been,
and the page they were reading is lost from the button that promises to return to it.

Reproduced on production before the fix: `history.state.idx` = 0, `history.length` = 3, and
both the header button and the bottom CTA landed on `/feed`.

## Appetite

Low blast radius (one callback on one page, both tabs share it). Fully reversible (git revert).
Zero founder decisions beyond the one made in this session: leaving the app is the correct
outcome when that is where the reader came from.

## Solution

Distinguish *first entry in the app* from *first entry in the tab*. The substitution to `/feed`
now also requires `window.history.length <= 1` — true for a bookmark, a typed URL, or a link
opened in a fresh tab, and false when an outside page sits behind us. Otherwise pop normally.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Back can now leave claritypledge.com | ACCEPT | It is where the reader was; a "Go back" that does not go back is the worse surprise. |
| `history.length` counts unrelated earlier pages in a reused tab | ACCEPT | Identical to what the browser's own Back button does from the same page. |

Do NOT change the tab-switch `replace` behaviour, the cold-arrival fallback itself, or any
other page's back handling.

## Acceptance Criteria

- [x] Arriving from a page outside the app and pressing either "Go back" returns to that page
      rather than the feed — pinned by two tests that fail against the previous behaviour and
      pass with the fix.
- [x] A bookmark / typed URL / fresh-tab arrival still falls back to the feed — the four
      existing P1296 cold-arrival tests stay green.
- [x] Both the header button and the bottom CTA behave identically, on both tabs.

## Related

- P1296 — introduced `handleBack` and the history-index cold test this corrects.
