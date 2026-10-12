---
status: in-progress
type: bug
rank: 28
severity: medium
workstream: infrastructure
date_reported: '2026-10-09'
created_date: '2026-10-12'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, banners]
disclosure: embargo
delivery_stage: ship
pipeline_ran: [create-bug, dev, ship]
related: [p1453, p1417]
---

# P1454: Banner regeneration can delete another entity's banner file

## Problem

When a banner is regenerated, `generate-banner` and `generate-event-banner` delete the entity's
previous banner from storage with the service role. They took the file to delete from the row's
`banner_url`, a column the client can write to any string. They checked only that the URL sat in
the right bucket, so a signed-in user could point their own `banner_url` at another profile's,
story's, event's or agent's banner file and then regenerate, and the function deleted the victim's file.

Found during the P1453 security review (2026-10-09). Verified by reading the code; not exercised
against a running system. Specifics are in `.private/docs/security-log.md` (2026-10-09).

## Appetite

Low blast radius (cleanup step of two edge functions; worst case after the fix is an orphaned
file). High reversibility (git revert + function redeploy, no migration). Zero founder decisions.

## Solution

Shared helper `supabase/functions/_shared/banner-path.ts` → `ownedBannerPath(url, bucketPrefix,
ownFolder)`: returns the storage path only when it is a single plain filename directly inside the
entity's own folder (`<type>/<id>/` in `banners`, `<eventId>/` in `event-banners`); anything else
returns null and cleanup is skipped. The folder is compared case-insensitively (UUIDs), and the
stored path is what gets deleted.

## Invariants

- The service role never deletes a storage object whose path was not proven to sit in the
  requesting entity's own folder.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Banners stored outside the entity folder (old layouts, hand uploads) are no longer cleaned up | ACCEPT | Orphaned file costs storage only; never deletes the wrong thing |
| `banner_url` can still be set to any URL (display only) | DEFER | Pinning client-written URLs is folded into P1453 |

Do NOT add a DB trigger or change client writes of `banner_url` here.

## Acceptance Criteria

- [x] Cleanup of a URL in another entity's folder is refused (unit test `banner-path.test.ts`, 7/7 pass; a mutation removing the folder check fails 2 tests).
- [x] Traversal, encoded, nested, query/fragment and foreign-host URLs are refused (same suite).
- [x] Own-folder banner is still cleaned up, including UUID case differences (same suite).
- [x] Both functions typecheck (`deno check`). Independent Codex review: no cross-entity bypass found. `[post-deploy]` regenerate a banner on prod and confirm the old file is removed.

## Pre-deploy Checklist

- [x] Deploy edge functions `generate-banner` and `generate-event-banner` to prod (2026-10-12, both healthy).
