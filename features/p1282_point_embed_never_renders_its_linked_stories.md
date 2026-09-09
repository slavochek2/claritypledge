---
status: today
type: bug
rank: 1
severity: high
workstream: C2
date_reported: '2026-09-09'
created_date: '2026-09-09'
tags: [embed, points, stories, blog]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1282: The point embed toggles its story list open and renders nothing

## Summary

On `/point/{id}?embed=true` — the surface `/draft-blog` uses to place points in Ghost articles —
clicking "N stories" flips the disclosure to its expanded state and renders no stories. The data is
fetched successfully; only the render is gated away. Every quote, timestamp and video in the
article's evidence layer is unreachable as a result.

Incomplete half of `c5803784e` (2026-03-18, *"fix: allow inline expand of points/stories in blog
embeds"*), which removed the `!isEmbed` guard from the same JSX block and left a second condition
in place that is never satisfiable on the embed route.

## Root Cause

`src/app/components/social/point-card-with-links.tsx:643-646` gates the expanded story list on:

```
{!isDetailView &&
  storiesExpanded &&
  (liveSessionMode || profileOwner) &&
```

On the embed route `liveSessionMode` is false, and `profileOwner` is built at
`src/app/pages/point-detail-page.tsx:406` as `fromHolder ? {...} : undefined` — where `fromHolder`
resolves only when the URL carries a `?from={userId}` parameter (`:388-390`). A plain
`?embed=true` URL therefore always yields `profileOwner === undefined`, so the block never renders
however many times the button is pressed.

`storiesExpanded` itself flips correctly, which is why the chevron rotates and the accessible name
changes to "Collapse linked stories" — the control reports success while its content is
unreachable.

**Sibling surface is already correct**, which is the tell: `story-card-with-links.tsx:545` gates the
equivalent linked-*points* expansion on `pointsExpanded && linkedPoints.length > 0` and nothing
else. The story embed expands; the point embed does not. Same commit touched both files; only one
was finished.

## Invariants

1. **`storiesToShow` is not owner-derived.** It is `linkedStories.slice(0, 3)`
   (`point-card-with-links.tsx:219-220`), independent of `profileOwner`. Any fix must not
   reintroduce a coupling between "who owns this card" and "which stories it may render".
2. **The feed must not start expanding stories inline.** In the feed `profileOwner` is undefined and
   `isEmbed` is false; whatever condition is added must leave that combination unchanged.
3. **The disclosure markers travel.** Stories rendered here are agent stories, so every render
   branch remains bound by the census in
   `src/tests/p1259-disclosure-route-on-every-surface.test.tsx` — the unit of which is the render
   branch, not the component ([decisions.md](../docs/decisions.md) 2026-09-08, P1270).

## Reproduction Steps

1. Open `https://claritypledge.com/point/b0d05603-7975-4709-99f6-d88b1245fa62?embed=true`
   (a public `aisafety1` point with 2 linked public stories).
2. Wait for load. The card shows the statement, the `#aisafety1` tag, the Disagree/Unsure/Agree
   row, and a "2 stories" disclosure.
3. Click "2 stories".
4. Observe: the chevron rotates and the accessible name becomes "Collapse linked stories". No
   stories appear. The card does not grow.

**Reproduction rate:** 100% — three attempts on 2026-09-09, fresh loads, 3–6 second waits, using
both coordinate clicks and an element-reference click.

Network confirms the data is present, not missing: the `story_points` request returns **200**
carrying `content`, `video_url`, `video_quotes` and the joined author profile for both stories.
One attempt's accessibility tree additionally showed a `status "Loading"` node that never resolved.

**Not verified:** signed-out. All three attempts ran in an authenticated session. The gate does not
read auth state, so a signed-out reader is expected to see the same failure, but that expectation is
inference, not measurement.

## Expected Behavior

Clicking "N stories" in an embedded point expands up to three linked story cards inline, each with
its agent byline, content, quotes and timestamps, with a "+N more stories" affordance beyond three.
The iframe grows to fit — `ResizeObserver` at `point-detail-page.tsx:451-466` already reports height
to the parent, and the position dropdown proves that path works.

## Actual Behavior

The disclosure reports itself expanded and renders nothing. Silent: no console error, no failed
request, no empty-state message. A reader sees a claim, vote counts, and a control that appears
broken.

## Affected Files

- `src/app/components/social/point-card-with-links.tsx:643-646` — the gate.
- `src/app/pages/point-detail-page.tsx:388-390, 406-419` — where `profileOwner` is left undefined.
- `src/app/components/social/story-card-with-links.tsx:545` — the correct sibling, for reference.

## Severity

**high** — the embed is the only supported way to place a point in a published article
(`/draft-blog` step 2b), and the AI-safety event article depends on it. The evidence layer of the
product is unreachable on a public surface.

## Fix Approach

Add the embed case to the gate: `(liveSessionMode || profileOwner || isEmbed)`. `isEmbed` is already
in scope from `useEmbedNavigation()` at `:151`. This leaves the feed combination
(`!liveSessionMode && !profileOwner && !isEmbed`) untouched, satisfying Invariant 2, and does not
touch `storiesToShow`, satisfying Invariant 1.

Rejected: passing a synthetic `profileOwner` from the embed route. It would satisfy the existing
condition while asserting an owner that does not exist, and `profileOwner` also drives the
owner-attribution chrome above the fold — the card would claim a person owns the point.

**Rejected-alternatives grep run** against `docs/decisions.md` for embed/iframe/expand/blog: no
prior entry rejects inline expansion in embeds. The nearest entries concern iframe *height* and CSP
`frame-src`, both of which support the fix rather than contradict it.

## Acceptance Criteria

- [x] On `/point/{id}?embed=true` with linked public stories, clicking "N stories" renders those
      stories inline, and clicking again collapses them.
- [ ] The rendered stories carry their agent byline, quotes and timestamps.
- [x] A point with more than three linked stories renders three plus a "+N more stories" control.
- [x] The feed still does not expand stories inline — no change to that surface.
- [x] A test asserts the embed branch renders its stories, and was seen to FAIL against the current
      gate before the fix, with the non-zero exit recorded.
- [ ] Verified signed-out, not only in an authenticated session.