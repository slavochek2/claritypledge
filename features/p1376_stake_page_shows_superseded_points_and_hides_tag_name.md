---
status: week
type: bug
rank: 15
severity: medium
workstream: website
date_reported: '2026-09-30'
created_date: '2026-09-30'
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
tags: [stake, points, superseded, ux]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1376: /stake/:tag lists superseded point versions next to their heads and hides the tag name

## Summary

`/stake/:tag` renders every public point carrying the tag, including old versions whose `superseded_by` is set (so a v1 shows beside its v2 head), and the page shows only a "Back" button because the tag heading is `sr-only`.

## Root Cause

1. **Superseded rows leak.** `stake-page.tsx` `fetchData` calls `pointsService.getPublicPointsFeed(STAKE_LIMIT, 0, tag, viewerUserId, true, keepsUnstaked(tag))`. `getPublicPointsFeed` (`src/app/data/points-service-real.ts`) filters only `visibility = 'public'` plus the tag; it has no `superseded_by IS NULL` predicate. `mapPointFromDb` maps the column to `supersededBy`, but nothing on the stake path reads it.
2. **Prod evidence** (read-only query, 2026-09-30): 11 of 59 points have `superseded_by` set, all public. Of the 11 public points tagged `misunderstanding`, two are superseded (st1 v1, 8 holders; st5 v1, 6 holders) and both render on `/stake/misunderstanding` next to their v2 heads. `/stake/understanding` has the same shape (7 superseded points).
3. **Every chain's head carries the same tags and is public** (query over all 11 pointers), so a head-only filter cannot orphan a lineage on a tag.
4. **Hidden heading.** `stake-page.tsx` ~L388 renders `<h1 className="sr-only">{tag}</h1>`; sighted users see only the `FocusHeader` "Back".

Correction to the reporter's premise: `/feed` does not hide superseded points by default. `collapseToLatest` (`feed-page.tsx` ~L390) runs only when the URL carries `?version=latest`. That is a deliberate all/latest toggle and is not touched here.

**Precedent for the filter:** `stories-service-real.ts` (L324, L479, L916) and `docs-service.ts` L150 already drop superseded points from story-linked lists.

## Invariants

- `/feed` behaviour is unchanged: `getPublicPointsFeed` keeps returning superseded rows unless the caller opts in to heads-only.
- Sealed letters keep freezing superseded points (`letter-snapshot-mapper.ts` L180, P843; decisions.md 2026-05-17). No change to letter code.
- The head filter belongs in the query, not after it: `STAKE_LIMIT` is 50 and the list is oldest-first, so superseded rows are the oldest and would eat the window before a client-side filter runs.
- FocusHeader label stays "Back" (decided elsewhere).

## Reproduction Steps

1. Open `/stake/misunderstanding` (anon or signed in).
2. Scroll the list. The st1 v1 and st5 v1 statements appear, and the st1 v2 and st5 v2 heads also appear.
3. Observe the top of the page: only "Back" is visible, no tag name.

**Reproduction rate:** 100% on prod data as of 2026-09-30.

## Expected Behavior

Only head points (not superseded) are listed on every stake tag. The tag appears as a visible heading below the Back button, text = the tag verbatim (e.g. `misunderstanding`, `ikigai1`). (Heading text and placement were specified by the founder.)

## Actual Behavior

Old versions render beside heads; no visible tag name.

## Affected Files

- `src/app/data/points-service-real.ts` ~L751 `getPublicPointsFeed`: no `superseded_by` predicate.
- `src/app/data/points-service.interface.ts` ~L193 and `src/app/data/points-service-mock.ts` ~L354: signature must stay in step.
- `src/app/pages/stake-page.tsx` ~L171 (fetch call) and ~L388 (`sr-only` h1).
- `src/tests/p1179-stake-surface.test.tsx`: pins the exact argument list of the fetch call (contract changes by one argument).

## Severity

**Medium** — a statement and its own replacement are both shown and both stakeable on a projected instrument screen; no data loss, and a workaround (ignore the older wording) exists.

## Fix Approach

Add an opt-in `headsOnly?: boolean` 7th argument to `getPublicPointsFeed` that adds `.is('superseded_by', null)` to the query; `/stake` passes `true` for every tag, `/feed` passes nothing. Replace the `sr-only` h1 with a visible heading below `FocusHeader`, using the existing page heading styles.

### Audit of other point-listing surfaces (part of /reproduce; listed for the founder, not fixed here)

See the audit table in the P1376 reproduce report; each row carries evidence.

## Acceptance Criteria

- [ ] `/stake/misunderstanding` on a dataset with a superseded v1 and its v2 head renders only the head
- [ ] Every stake tag (standard and user tags) lists heads only; the query, not the client, drops superseded rows
- [ ] `/feed` still lists superseded points unless `?version=latest`
- [ ] The tag name is visible as a heading below the Back button, verbatim (`misunderstanding`, `ikigai1`), at 320px, 375px and desktop
- [ ] FocusHeader still reads "Back"
- [ ] Regression test `src/tests/p1376-reproduce.test.tsx` passes
- [ ] No console errors on `/stake/misunderstanding`
