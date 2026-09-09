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
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
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


## Second defect found during verification — split to P1287, NOT fixed here

The gate fix is verified (below). A **separate** defect on the same surface survives it, and
`?expanded=true` masks it rather than fixing it.

**Observed, local dev against test DB, point `709b0a25` (4 linked video stories):**

| URL | Action | Result |
|---|---|---|
| `?embed=true&expanded=true` | none — loads pre-expanded | stories render: agent byline, player, body text |
| `?embed=true&expanded=true` | collapse, then expand | works both ways |
| `?embed=true` | wait 10s, click "4 stories" | renders nothing; card returns to collapsed |

**Best-supported explanation:** the card remounts shortly after the first expansion, so
`useState(isExpanded)` re-initialises. With `expanded=true` it re-initialises to `true` and the
remount is invisible; without it, to `false`, which presents as the click being ignored. This fits
all three rows; nothing else tried does.

**Two hypotheses tested and eliminated**, recorded so they are not re-tried:
1. *The click bubbles to `handleCardClick`, which calls `window.open` in embed mode.* False — the
   toggle sits inside a `role="presentation"` wrapper carrying `onClick={(e) => e.stopPropagation()}`
   (`point-card-with-links.tsx:538`).
2. *A `useEffect` resyncs `storiesExpanded`.* False — `setStoriesExpanded` has exactly one call site,
   the toggle handler itself (`:176`).

**Not chased further** per the two-failed-attempts rule. The remaining suspect, untested: the embed
branch of `point-detail-page.tsx` attaches its `ResizeObserver` and a body-wide `MutationObserver`
inside an **inline** ref callback (`:438-470`) with no disconnect, so both are recreated on every
render and the body observer fires on any DOM change — including the story cards and the YouTube
iframe that the first expansion mounts.

**Consequence for the article, and why this is not a blocker:** embed the points as
`?embed=true&expanded=true`. The evidence renders on load, which is what an article wants anyway —
the quotes and timestamps should not be behind a click for a reader who came to read.

## Acceptance Criteria

- [x] In an embedded point, linked public stories render inline and toggle both ways once the
      card has rendered them — verified in unit test and in the browser (`&expanded=true`).
      **The cold-load first click is a separate defect, split to P1287; this gate fix is necessary,
      not sufficient, and does not claim to close it.**
- [x] The rendered stories carry their agent byline, quotes and timestamps. (Browser-verified locally: `AGENT on Yann LeCun`, mounted player, body text.)
- [x] A point with more than three linked stories renders three plus a "+N more stories" control.
- [x] The feed still does not expand stories inline — no change to that surface.
- [x] A test asserts the embed branch renders its stories, and was seen to FAIL against the current
      gate before the fix, with the non-zero exit recorded.
- [x] The second defect found during verification is filed rather than buried — P1287, carrying
      the evidence table, the two eliminated hypotheses and the leading suspect. Signed-out prod
      verification moves there with it, since it cannot run before a deploy.
