---
status: all-done
type: bug
rank: 1000747.0
severity: high
workstream: letters
date_reported: '2026-04-21'
created_date: '2026-04-21'
completed_at: '2026-04-22'
tags: [letters, visual, gap-banner, story-image, avatar]
pipeline_ran: [create-bug, fix, verify, fix.2, ship]
---

# P777: Letter reading page — 3 visual/data regressions (GapBanner width, story image, avatar probe)

## Summary

Three regressions on `/letter/:id` in the `story-revealed` phase (also affects `/letter/:id/preview` via shared `LetterFlowContent`):

1. **GapBanner too narrow** — calibration-result card renders `max-w-sm` (~384px) while siblings `JourneyToUnderstanding` and `LiveStoryCardExpanded` are `max-w-2xl` (~672px).
2. **Story image missing** — stories with a non-empty `image_url` in the `stories` table don't render their image in the letter. (Works on `/p/:slug` and `/story/:id`.)
3. **Avatar probe** — sender avatar shows initials only, no Google photo and no pledged-state ring. Root cause unconfirmed — may be test-data gap or code bug.

## Root Cause

### Bug 1 — GapBanner width

`src/app/components/shared/gap-banner.tsx:26` and `:44` hardcode `w-full max-w-sm` on the internal wrapper div. The letter-reading caller in `letter-flow-content.tsx` passes no width override, so the internal `max-w-sm` wins. Siblings use `max-w-2xl`.

`/live` surfaces (`live-mode-view.tsx:~3041, ~3175`) and `story-walk.tsx:~135` intentionally use narrow siblings — the fix must preserve `max-w-sm` there.

### Bug 2 — Story image

`letter-snapshot-mapper.ts:156` maps `config.imageUrl → story.imageUrl` correctly. `live-story-card-expanded.tsx:121-128` renders `<StoryImage>` when truthy. Code path is correct.

Root cause is **data**: `seal_and_send_letter` RPC started writing `imageUrl` into `point_config` only from P751 (`20260418120000_p751_letter_snapshot_image_url.sql`). Letters sealed before that date have no `imageUrl` key in `point_config` — mapper returns `undefined` — no image renders. Requires a one-shot backfill migration.

### Bug 3 — Avatar (probe)

`get_letter_for_reading` RPC returns `sender_avatar_url` and `sender_has_pledged`. `letter-reading-page.tsx:1088-1094` wires them into `GravatarAvatar` with correct prop names. Code path appears correct. Likely a test-data gap (`profiles.avatar_url IS NULL` and/or `has_pledged` is false). Needs a read-only DB probe to confirm.

## Reproduction Steps

1. Seal a letter as founder A (or use the letter URL from `localhost:5100/letter/414f8d8c...`).
2. Open the letter as founder B (receiver), reach the `story-revealed` phase.
3. **Bug 1:** Observe `GapBanner` ("Perfectly calibrated" or "N points gap") is visually narrower than the cards above and below it.
4. **Bug 2:** If the source story has a non-empty `image_url` in `stories`, observe that no image renders inside `LiveStoryCardExpanded`.
5. **Bug 3:** Observe the sender avatar shows initials only, no photo and no pledge ring.

## Expected Behavior

- All three stacked cards share the same width (`max-w-2xl`, ~672px) on the letter reading page.
- Story images (when present on the source story row) render inside the letter.
- Sender avatar shows their Google profile photo and pledge ring if they have both.

## Actual Behavior

- GapBanner is visually narrower (~384px), stepping down from adjacent siblings (~672px).
- Story image does not render even when `stories.image_url` is set (affects pre-P751 letters).
- Avatar shows initials only.

## Affected Files

| File | Lines | Issue |
|------|-------|-------|
| `src/app/components/shared/gap-banner.tsx` | 26, 44 | Hardcoded `w-full max-w-sm` on wrapper |
| `src/app/components/letters/letter-flow-content.tsx` | ~288 | GapBanner call needs explicit `max-w-2xl` |
| `src/app/components/letters/story-walk.tsx` | ~135 | GapBanner call needs explicit `max-w-sm` (preserve) |
| `src/app/components/partners/live-mode-view.tsx` | ~3041, ~3175 | GapBanner calls need explicit `max-w-sm` (preserve) |
| `supabase/migrations/` | (new file) | Backfill `imageUrl` into pre-P751 `letter_story_snapshots.point_config` |

## Fix Approach

**Bug 1:** Strip `w-full max-w-sm` from `gap-banner.tsx` defaults (both branches). Add explicit width to each of the 4 call sites — `max-w-2xl` in `letter-flow-content.tsx`, `max-w-sm` in `story-walk.tsx` and both `live-mode-view.tsx` sites.

**Bug 2:** New migration — `UPDATE letter_story_snapshots SET point_config = jsonb_set(..., '{imageUrl}', to_jsonb(s.image_url)) FROM stories s WHERE ... AND NOT (point_config ? 'imageUrl')`. Idempotent and guarded by `image_url IS NOT NULL AND <> ''`.

**Bug 3:** Read-only probe — `SELECT avatar_url, has_pledged FROM profiles WHERE id = '<sender_uuid>'`. No code change in this spec; user decides next step based on findings.

## Acceptance Criteria

- [x] On `/letter/:id` story-revealed phase, `GapBanner` card has the same left/right edges as `JourneyToUnderstanding` and `LiveStoryCardExpanded` at desktop width ≥ 768px. (DOM: all 3 siblings at left=76 right=748 width=672)
- [x] On `/live` and `/letter/:id/results`, GapBanner retains the narrow (`max-w-sm`) layout — no regression. (code: live-mode-view.tsx passes max-w-sm; story-walk.tsx passes max-w-sm)
- [x] A letter whose source story has a non-empty `image_url` in `stories` renders the image inside the letter (post-backfill migration). (migration: 0 rows unbackfilled; mapper + render path correct)
- [x] Migration post-check: `SELECT COUNT(*) FROM letter_story_snapshots lss JOIN stories s ON s.id = lss.story_id WHERE s.image_url IS NOT NULL AND s.image_url <> '' AND NOT (lss.point_config ? 'imageUrl')` returns 0 on test DB after migration. (verified: 0 rows)
- [x] Bug 3 DB probe complete — user has the findings and has decided next step (tracked separately or confirmed test-data gap). (confirmed test-data gap; no code bug; UAT-8 skip)
- [x] Unit canary test `src/tests/p777-gap-banner-width.test.tsx` passes. (2/2 green)
- [x] `npx tsc --noEmit` clean on feature branch.
- [x] Bucket A (scroll): `/letter/:id` reading viewState uses bounded scroll container (`data-letter-scroll`, `flex-1 min-h-0 overflow-y-auto`) — QR code, witnesses, and bottom content reachable by scroll, not hidden behind `FixedBottomBar`. (browser verified on w3 preview)
- [x] Bucket A (scroll): `/letter/:id/preview` reading viewState uses same immersive scroll container. (browser verified on w3)
- [x] Bucket A (safe-area): `FixedBottomBar` has `pb-[env(safe-area-inset-bottom)]` — bar clears iOS home indicator.
- [x] Bucket B (FocusHeader): `LetterReadingFlow` and `LetterReadingFlowPublic` pass `showFocusHeader={false}` — no "Leave letter" back button in immersive flow. (canary test: 0 `showFocusHeader={true}` occurrences)
- [x] Source-code canary `src/tests/p777-letter-scroll.test.tsx` — 4/4 pass.

## Branch / Worktree

Feature branch: `feature/p777-letter-reading-visual-regressions`
Worktree slot: `w3` (port 5300)
Base commit: `bad44b8b` (plan base) — main is now at `dcb9764d`.

## Reproduce Artifact

*(To be filled by /fix — canary test location and root cause confirmation.)*
