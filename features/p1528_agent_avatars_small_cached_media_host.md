---
status: qa
type: task
rank: 52
workstream: infrastructure
created_date: '2026-10-21'
tags: [agents, storage, egress, performance]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1528: Agent avatars are icon-sized, long-cached, and served from the public media host

Promoted from the task inbox, 2026-10-21.

## Problem

**Situation:** A fresh `/feed` load on production downloads about 1 MB from the Supabase host. 958 KiB
of it is 9 agent-avatar PNGs in the public `agent-avatars` Supabase Storage bucket (P1135), up to
227 KiB each, rendered at most 96 CSS px (`gravatar-avatar.tsx` `xl` = `w-24 h-24`), served with
`cache-control: no-cache`.
**Complication:** Storage served through Supabase's CDN is billed as cached egress, the line most over
the free-plan quota; production is restricted from 2026-11-11. Separately, `.claude/rules/src.md`
"Public Media Host" (P1385, written after P1135) says curated public images belong in
`gs://claritypledge-story-images` via `publicMediaUrl()`, never a Supabase Storage bucket.
**Question:** Shrink, cache and re-home the agent avatars, and make provisioning produce them that way.

> Founder framing: "shrink the avatars to the size they are displayed at, let browsers cache them for a
> long time, and consider moving them to the public media host P1385 set up." Founder chose the move (option B), 2026-10-21.

## Appetite

Blast radius: one surface (agent portraits on feed, points, profiles). Reversibility: high — originals
stay in Supabase Storage untouched, the 9 old URLs can be written back. Decision density: zero remaining.

## Invariants

- No production database write without the founder's explicit yes in the turn (granted for the 9
  `profiles.avatar_url` rows of agent accounts, 2026-10-21). Snapshot the old values before writing.
- An agent's portrait must never silently fall to the initials fallback: every new URL is asserted
  `200` + `content-type: image/*` before the row is updated (P1135 Step-7 rule).
- URLs are built with `publicMediaUrl()` conventions (`storage.googleapis.com/claritypledge-story-images/...`),
  which prod CSP `img-src` already allows (verified in `vercel.json`).

## Solution

1. **Measure before** with `scripts/measure-idle-requests.mjs --base https://claritypledge.com --paths /feed --minutes 1 --settle 0 --from-navigation`.
2. **One-off backfill script** (`scripts/`), dry-run by default, TEST first:
   - Select agent profiles (joined to the agent registry) whose `avatar_url` host+path is exactly
     `<env supabase origin>/storage/v1/object/public/agent-avatars/`. On prod, the selected ID set must
     equal an explicit manifest of the 9 approved IDs; any other count aborts before any write.
   - Snapshot `(id, old avatar_url)` to `.private/` before writing.
   - Per avatar: download, resize to 256×256 (covers 96 CSS px at up to ~2.7× DPR), strip metadata,
     encode WebP (quality ~80); decode the result and assert WebP + 256×256 before upload.
   - Upload **create-only** (fail if object exists) to
     `agent-avatars/<slug>/<uuid>.webp` (prod) or `test/agent-avatars/<slug>/<uuid>.webp` (TEST) in the
     media bucket, `Cache-Control: public, max-age=31536000, immutable`. `.png` is replaced, not appended.
   - Assert the public URL returns 200 `image/webp` with that cache header, then
     `UPDATE profiles SET avatar_url = new WHERE id = X AND avatar_url = <snapshotted old>`; read back each row.
   - Rollback = same script writing snapshotted values back under the same guard.
3. **Skills:** `gen-agent-avatar` emits a 256px metadata-stripped WebP; `provision-agent` uploads it
   create-only to the media bucket with the long cache header (new uuid per generation) and passes that
   URL as `p_avatar_url`. The byte-type assertion becomes "is WebP". The "Regenerating an avatar for an
   EXISTING agent" branch moves to the media bucket too; old objects are left in place (no delete) so
   rollback and cached URLs keep working.
4. **Measure after**; record numbers in this spec.

## Alternatives Considered

- **A: resize in place in Supabase Storage** (no DB write). Rejected by founder: leaves curated images
  on the host the P1385 rule forbids and keeps them on the over-quota egress line.
- **Stop using Supabase Storage entirely.** Out of scope: `avatars`, `banners`, `event-banners` buckets
  include user uploads that rely on Supabase auth-scoped upload policies. Separate spec if wanted.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Something validates avatar host and rejects GCS URLs | MITIGATE | Verified 2026-10-21: no CHECK on `avatar_url`, registration RPC inserts it unvalidated, `author_avatar_url` is a read-time join (not a stored copy); still verify render on TEST before prod |
| WebP in link-preview images | ACCEPT | Agents carry no avatar off-platform (P1104, `api/og.ts:150`) |
| Measure script counts only `supabase.co` (line 68), so a broken move would also "pass" | MITIGATE | Done-When also requires GCS avatar bytes and decoded-image count |
| `immutable` cache on a path that later changes content | MITIGATE | Create-only uploads, new uuid per generation; TEST uses a `test/` prefix |
| GCS egress is paid | ACCEPT | ~9 × few KiB per fresh load, cached a year; cents |
| Old Supabase objects remain | DEFER | Delete after a week of clean prod; separate cleanup |

**Non-Goals**
- Do NOT touch human user avatars, banners, or event-banners buckets.
- Do NOT drop the `agent-avatars` bucket or its policies.
- Do NOT change `gravatar-avatar.tsx` rendering.

## Done-When

- [x] Before/after measurements recorded here from the measure script against prod `/feed`.
      Before: 27 requests, 1030.3 KiB, of which `storage:object` 9 req / 957.9 KiB. After: 18 requests, 73.0 KiB, `storage:object` absent.
- [x] Fresh prod `/feed` load downloads < 100 KiB of images from the Supabase host — 0 KiB (was 957.9 KiB).
- [x] On the same load, agent-avatar bytes from the media host total < 100 KiB and every agent `<img>` has `naturalWidth > 0`; a warm reload serves them from browser cache.
      9 avatars, 4.1–11.0 KB each (~62 KB on the wire); 16 agent `<img>` all 256 wide, 0 on Supabase; warm reload: all 9 `requestServedFromCache`, 0 bytes (CDP).
- [x] Every migrated agent avatar on prod (all 9, including agents absent from `/feed`) resolves `200 image/webp`, 256×256, with a 1-year cache header; rows read back with the new URL.
      Script asserted HEAD + PATCH-return + anon read-back per row: `done: 9 ok, 0 failed`.
- [x] Old `avatar_url` values snapshotted in `.private/` before the prod write (`.private/p1528/prod-<timestamp>.json`, rollback via `--rollback`).
- [x] `provision-agent` + `gen-agent-avatar` produce a 256px WebP on the media host with the cache header —
      commands verified on a real prod avatar (JPEG-named-.png in, 3.9 KB 256×256 WebP out; assertions pass/fail correctly) and the same upload path exercised by the backfill on TEST + prod. `[post-deploy]` the next real provisioning run is the end-to-end check.
- [x] `/feed` agent portraits render (screenshot) — no initials fallback for agents that had a portrait. Prod screenshot 2026-10-21 shows agent portraits; TEST `/p/agent-arthur-brooks` renders the migrated image.

## Known limitations

- `/finish` round 1 (Argon, Codex, Sonnet) found the script's recovery paths unsafe; fixed: `--apply` reuses an already-uploaded object that passes the public check, `--rollback` refuses an old URL that no longer serves an image, treats `current == old` as already restored and refuses any third value. Rollback branches proven with a stubbed `fetch` (rolled back / already old / foreign value refused / dead image refused). The `--apply` resume branch is not exercised: TEST storage and REST were returning 544/504 on 2026-10-21.
- No mocked-I/O test suite for the orchestration (one-off script, already run on TEST + prod); set aside in review round 1.

## Related

- P1135 (agent avatars in storage), P1385 (public media host), P1370 (avatar byte-type assertion).
