---
status: week
type: bug
rank: 2
severity: medium
workstream: C2
date_reported: '2026-09-09'
created_date: '2026-09-09'
tags: [embed, points, stories, blog]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1287: In an embedded point, the first expand click is lost; `?expanded=true` hides it

## Summary

Split out of P1282, which fixed a different defect on the same control and is **necessary but not
sufficient**. With P1282's gate fix in place, an embedded point still ignores the reader's first
click on "N stories" when the card loaded collapsed. The same card toggles correctly once it has
rendered its stories at least once, so `?embed=true&expanded=true` works and masks the defect.

## Root Cause

Under investigation. The best-supported explanation is that the card **remounts** shortly after the
first expansion, re-initialising `const [storiesExpanded, setStoriesExpanded] = useState(isExpanded)`
(`point-card-with-links.tsx:173`). With `expanded=true` that re-initialises to `true`, so the remount
is invisible; without it, to `false`, which presents as a dead control.

**Two hypotheses tested and eliminated — do not re-try these:**

1. *The click bubbles to `handleCardClick`, which calls `window.open` in embed mode.* **False.** The
   toggle sits inside a `role="presentation"` wrapper carrying `onClick={(e) => e.stopPropagation()}`
   (`point-card-with-links.tsx:538`).
2. *A `useEffect` resyncs `storiesExpanded` from a prop.* **False.** `setStoriesExpanded` has exactly
   one call site — the toggle handler at `:176`.

**Leading untested suspect:** the embed branch of `point-detail-page.tsx` attaches its
`ResizeObserver` **and** a body-wide `MutationObserver` inside an **inline** ref callback
(`:438-470`), with no `disconnect()`. React re-runs an inline ref callback on every render (detach
with `null`, re-attach), so both observers are recreated unboundedly, and the body observer fires on
any DOM mutation — including the story cards and YouTube iframe that the first expansion mounts.
That is a plausible render/remount loop and is where to look first.

## Invariants

1. **P1282's gate stays.** `(liveSessionMode || profileOwner || isEmbed)` is what makes the block
   reachable at all; this spec must not revert it.
2. **The feed must not start expanding stories inline.** Guarded by the control test in
   `src/tests/p1282-point-embed-expands-stories.test.tsx`; that test must keep passing.
3. **Do not "fix" this by defaulting `expanded` to true.** That hides the remount rather than
   removing it, and a remount that silently discards component state will resurface elsewhere.

## Reproduction Steps

1. Serve a build containing P1282's fix.
2. Open `/point/{id}?embed=true` for a point with linked public stories — no `expanded` param.
3. Wait for the card to settle (10s observed; the position counts and story count are rendered).
4. Click "N stories".
5. Observe: nothing renders and the chevron returns to collapsed.

**Reproduction rate:** 100% on a cold collapsed load. **Does not reproduce** once the card has
rendered its stories: from `?embed=true&expanded=true`, collapse-then-expand works repeatedly.

**Evidence, local dev against test DB, point `709b0a25` (4 linked video stories), 2026-09-09:**

| URL | Action | Result |
|---|---|---|
| `?embed=true&expanded=true` | none | stories render — agent byline, mounted player, body text |
| `?embed=true&expanded=true` | collapse, then expand | works both ways |
| `?embed=true` | settle 10s, click | renders nothing, returns to collapsed |

## Expected Behavior

A reader's first click on "N stories" expands them, on a cold load, with no `expanded` parameter.

## Actual Behavior

The click is silently discarded. No console error, no failed request.

## Affected Files

- `src/app/components/social/point-card-with-links.tsx:173` — the state that is being re-initialised.
- `src/app/pages/point-detail-page.tsx:438-470` — inline ref callback, two undisconnected observers.

## Severity

**medium** — a workaround exists and is the better artifact anyway (`&expanded=true` shows the
evidence on load rather than behind a click), so this does not block the AI-safety event article.
It is a dead control on a public surface, which is why it is not `low`.

## Fix Approach

Confirm the remount first — instrument a mount counter, or log in a `useEffect(() => {...}, [])` in
`PointCardWithLinks` — before changing anything. A diagnosis here without that measurement is a guess
(epistemic gate 2). If confirmed, the likely fix is hoisting the ref callback out of the render path
(`useCallback`) and disconnecting both observers on detach.

## Acceptance Criteria

- [ ] A mount counter proves whether the card remounts after the first expansion — recorded either
      way, including if it disproves the leading hypothesis.
- [ ] On `/point/{id}?embed=true` with no `expanded` param, one click on "N stories" renders them.
- [ ] Collapse-then-expand still works repeatedly after that first click.
- [ ] The feed control test in `p1282-point-embed-expands-stories.test.tsx` still passes unchanged.
- [ ] A test covers the cold-load click path and was seen to FAIL before the fix, exit code recorded.
- [ ] Verified signed-out on prod, not only in an authenticated session — the check P1282 could not
      run because it was never deployed.

## Related

- `features/p1282_point_embed_never_renders_its_linked_stories.md` — the gate fix this depends on.
- `features/p1285_csp_blocks_story_video_player_hosts.md` — in flight; also affects whether an
  embedded story's player renders for a reader.
- `features/p1280_article_container_dedups_sources_on_render.md` — the container that consumes this
  surface.
