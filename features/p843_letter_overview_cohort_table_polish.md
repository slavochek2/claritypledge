---
status: in-progress
type: story
rank: 1000769.0
workstream: C2
created_date: '2026-05-17'
tags: [letter-overview, cohort-table, points-visibility, avatars]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
---

# P843: Letter overview cohort table — hide suppressed points, show avatars + full names

## Problem

**Situation:** The letter overview cohort table (P700/P836) renders one column per point in `letter_story_snapshots.point_config.points`, and one row per delivery showing only a handle-stripped first name with no avatar.

**Complication:** Stories that the sender intended to ship with point + antipoint only are surfacing 4+ point columns in the table, because:
  - Hidden points (`point_config.hidden` array AND per-point `hidden` boolean — P749) are not filtered.
  - Superseded points (`points.superseded_by IS NOT NULL` — P800) are not filtered.
  - Other RPCs and the recipient-facing mapper (`letter-snapshot-mapper.ts`) already filter these — the overview cohort table is the outlier.

  Separately, rows in the cohort table show first-name-only (handle suffix stripped) with no avatar, while the rest of the app uses `PersonAvatar`/`GravatarAvatar` with full display name throughout. The author identity (sender) on the letter overview header is also bare text — no avatar, no full name.

**Question:** Bring the cohort table to parity with the rest of the app: filter suppressed points out of columns, and render each recipient (and the letter author in the header) with avatar + full display name.

## Appetite

Low blast radius — touches one RPC (`get_letter_overview`), one component (`cohort-table.tsx`), and the letter overview header (`letter-overview-page.tsx`). No new tables, no schema migrations beyond the RPC body. Fully reversible (RPC is `CREATE OR REPLACE`; component is additive). Low decision density — filter semantics are already established by P749/P800; avatar pattern is already established by `src.md` rules.

## Solution

**Hidden/superseded filter — push to RPC.** Modify `get_letter_overview` to filter point_config.points where:
- The point's ID appears in `point_config.hidden` (top-level array of IDs), OR
- The per-point `hidden` boolean is true, OR
- `points.superseded_by IS NOT NULL` for that point ID (joined lookup).

Apply this filter inside the points subquery in the RPC, before `jsonb_agg`. Columns and per-point response cells reflect only visible, non-superseded points.

**Avatars + full names — extend RPC + use existing components.**
- RPC `get_letter_overview` extends the deliveries JSONB to include `avatar_url` (from profiles) and a clean `full_display_name` (raw display name without the auto-handle suffix; if profile exists, prefer profile's name).
- `cohort-table.tsx` switches the Recipient cell from `displayName` text to `<PersonAvatar>` (or `GravatarAvatar` with required `photoUrl` + `isPledger ?? false`) followed by the full name as a link to `/p/{slug}` when slug exists.
- `letter-overview-page.tsx` header: render letter author with `PersonAvatar` + full name link, replacing the bare text identity.

Mobile responsive: on narrow widths, avatar + truncated name in cell; full name on hover/expand.

## Risks / Non-Goals

### Risks
- **Filter semantics drift.** If `get_letter_overview` filter logic diverges from the recipient-facing mapper's filter logic, two views of the same letter could show different point sets. Mitigation: write one filter helper or comment the RPC body referencing the canonical filter rules in `letter-snapshot-mapper.ts`; regression test with a fixture that exercises hidden + superseded + visible points together.
- **Profile lookup adds latency to overview RPC.** Mitigation: deliveries already join profiles for `display_name`/`profile_slug` — adding `avatar_url` is one more column from the same row, no new join.
- **Long full names break mobile column layout.** Mitigation: truncate with title attribute (existing pattern in cohort-table.tsx), avatar always fully visible.
- **Author identity in header may show stale data if author's profile changed since letter was sent.** Mitigation: same trade-off P700 already accepted for recipient names (live profile lookups acceptable for decorative drift).

### Non-Goals
- Do NOT change which points are stored in the snapshot at seal time — filter at read time only.
- Do NOT add a "show hidden points" toggle to the overview — out of scope; if hidden points need to be visible somewhere, that's a separate spec.
- Do NOT refactor the snapshot mapper to share code with the RPC — keep the filter duplicated in SQL with a code comment pointing at the TS canonical filter.
- Do NOT extend filter to letter results page (`get_letter_results`) in this spec — verify whether that RPC already filters correctly; if it doesn't, file a follow-up. Scope here is overview only.
- Do NOT add pledger ring logic to RPC — `isPledger` can stay `false` for v1 unless trivially available; flag if pledger lookup is needed.
- Do NOT redesign the table layout — only swap the Recipient cell content and add the author block in the header.

## Done-When

- [ ] Cohort table column count matches visible-point count: hidden points (per `point_config.hidden` AND per-point `hidden: true`) are not rendered as columns.
- [ ] Cohort table column count excludes superseded points (`points.superseded_by IS NOT NULL`).
- [ ] Per-point response cells (Agree/Unsure/etc.) reflect only the filtered, visible points.
- [ ] Recipient cell renders avatar (Google photo when available) + full display name (no handle suffix), linked to `/p/{slug}` when slug exists.
- [ ] Letter overview header renders author identity with avatar + full name (matching the recipient cell pattern).
- [ ] E2E test fixture with mixed visible/hidden/superseded points asserts only visible-non-superseded columns appear.
- [ ] E2E test asserts avatar `<img>` is present in each recipient row when profile has avatar_url; falls back to initials otherwise.
- [ ] Mobile layout (≤640px) does not overflow: avatar + truncated name visible, no horizontal scroll on header content.
- [ ] No regression in existing P700/P836 e2e suite (all 27 tests still pass).
- [ ] Letter results page (`/letter/{id}/results`) not affected.

## UX Notes

- **Avatar size:** match recipient avatar size elsewhere in app (xs/sm — verify against existing `PersonAvatar` usages; e.g., P744).
- **Name display:** full name from profile if `profile_id` joined; else handle-stripped display_name from delivery; never raw `display_name` with suffix.
- **Author block in header:** avatar to the left of "Letter Overview" eyebrow + title, OR below the title — visual decision left to implementer; both must show clearly that the author is the person who sent the letter.
- **Empty state:** if recipient has no avatar_url and no profile slug, render initials in colored circle (existing `GravatarAvatar` fallback).

## Acceptance Criteria

- [ ] When opening a letter where stories have hidden or superseded points, the cohort table shows only point + antipoint (or visible-canonical set) — matching the recipient-facing view.
- [ ] Every recipient row in the cohort table shows an avatar + full name; first-name-only display is gone.
- [ ] The letter author is visually identifiable in the overview header with avatar + full name, not just bare text.
- [ ] Visual parity check against other pages that show the same recipients (e.g., `/p/{slug}`, results page).

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Recipient cell | `<PersonAvatar size="sm" />` + full name link | Cohort table, every row |
| Avatar fallback | Initials in colored circle | When `avatar_url` is null |
| Name link target | `/p/{profile_slug}` | When `profile_slug` is present |
| Name when no slug | Plain text, no link | Anonymous deliveries |
| Author block | Avatar + full name | Letter overview header, near title |
| Hidden points | Not rendered as columns | Cohort table head + body |
| Superseded points | Not rendered as columns | Cohort table head + body |

---

**Discovered:** During P836 visual review on `/letter/.../overview` (2026-05-17).
**Predecessor context:** P700 (overview shell), P836 (visual defects fix), P749 (per-point hidden), P800 (superseded_by backfill), P744 (avatar sizing). Not a redesign of P836 — additive scope discovered post-ship-attempt.
