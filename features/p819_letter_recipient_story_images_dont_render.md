---
status: qa
type: bug
rank: 1000819
severity: medium
workstream: letters
tags: [letters, images, recipient, p591, p751, p777]
created_date: '2026-04-25'
date_reported: '2026-04-25'
flow: fix
delivery_stage: fix
pipeline_ran: [reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p819-seal-rpc-imageurl-canary.test.ts
  root_cause: "P749, P757, and fix_p757 each ran CREATE OR REPLACE on seal_and_send_letter without preserving the 'imageUrl' key that P751 added. Letters sealed after 2026-04-18 14:45 UTC therefore have no imageUrl key in letter_story_snapshots.point_config. Mapper's `config.imageUrl || undefined` returns undefined, render skips the <img> tag. P777 backfill cannot help because it only updates rows missing the key at backfill time — new sealed letters keep regenerating the bug."
  confidence: high
  surfaces_in_scope: [logged-in-private, logged-in-public, anonymous-public-link, email-click-through]
  surfaces_deferred: []
  reproduced_at: '2026-04-25'
---

# P819: Letter recipient flows don't render story images (all 4 recipient surfaces)

## Problem

Story images render correctly in the **sender's letter preview** (`letter-preview-page.tsx` → `LetterFlowContent` → `<LiveStoryCardExpanded story.imageUrl />`), but do NOT render for any **recipient** surface.

Affected surfaces (confirmed empirically by user on `main`, not introduced by P817):
1. **Logged-in recipient** opening a private letter from `/letters` inbox (`LetterReadingFlowPublic`)
2. **Logged-in recipient** opening a public letter via shared URL
3. **Anonymous public link** (someone shared the URL, no auth)
4. **Email click-through** for token-gated private letter

The infrastructure to deliver this was explicitly built:
- **P591** (`20260326142007`) — added `stories.image_url` column
- **P751** (`20260418120000`) — `seal_and_send_letter` writes `imageUrl` into `letter_story_snapshots.point_config`
- **P777** (`20260421112414`) — backfilled `imageUrl` into pre-P751 snapshots
- `letter-snapshot-mapper.ts:156` — `snapshotToStoryWithPoints` reads `config.imageUrl`
- `live-story-card-expanded.tsx:127` — renders `{story.imageUrl && <img src=... />}`

Both P751 and P777 migrations appear in `supabase/deploy-manifest.json` for prod and test. Yet recipients see no image. Sender preview works because it uses `docStoryToSnapshot` (live-doc → in-memory snapshot path), bypassing the DB-stored snapshot entirely.

## Appetite

Investigation-first bug. Root cause unknown — could be data, query, or render. Estimated 1-3 small edits once isolated, possibly +1 migration if the seal RPC has a coalesce-to-empty-string bug. Single-concern; routes through `/reproduce` then `/fix`.

## Approach

**Step 1 — `/reproduce p819`:** Confirm symptom on each of the 4 surfaces using a sealed letter known to have a story with `image_url`. Stamp `reproduce_artifact` with confirmed root cause.

**Step 2 — Hypothesis ranking** (to be falsified during reproduce, ranked by my prior on which is most likely):

1. **Seal RPC writes `imageUrl: ''` instead of `imageUrl: <url>`** — `COALESCE(s.image_url, '')` in P751's `jsonb_build_object` would emit empty string when source is non-null but happens to be falsy in some join condition. Reader treats `'' || undefined` as undefined, no render. Check: pull `point_config` for a recently-sealed letter known to have an image, inspect `imageUrl` value.

2. **Read query strips `point_config` keys** — `letters-service.ts` snapshot fetcher might project specific keys (`storyText`, `points`) and drop `imageUrl` silently. Check: `grep -n "point_config" src/app/data/letters-service.ts` and inspect the SELECT shape.

3. **`<LiveStoryCardExpanded>` prop divergence per call site** — preview path may pass a different prop set than reading path; some prop transforms `story.imageUrl` into nothing for recipients. Less likely (same component, same `storyWithPoints` shape from same mapper), but worth verifying.

4. **P777 backfill never ran on test DB** — manifest lists the migration but it could have failed silently. Check: `mcp__supabase__execute_sql` (test) — `SELECT count(*) FROM letter_story_snapshots WHERE NOT (point_config ? 'imageUrl')` and compare to count where source `stories.image_url` is non-null.

5. **Recipient flows use a stripped snapshot variant** — there could be a sanitize/anonymize step in the recipient-data path that drops `imageUrl` (privacy concern? avatar leak guard?). Less likely — image_url is a public URL by design — but worth a grep.

**Step 3 — `/fix p819`** with reproduce_artifact in hand.

## Risks / Non-Goals

- **Non-goal:** New image rendering capabilities beyond what `<LiveStoryCardExpanded>` already does. Just make existing rendering land for recipients.
- **Non-goal:** Touching draft preview behavior — that's the working baseline and the reference for "correct."
- **Risk:** If root cause is a seal RPC bug, fixing it requires a new migration + re-deploy + possibly a re-backfill for letters sealed between P751 and the fix. Migration scope expands the appetite.

## Acceptance Criteria

- [x] `/reproduce p819` runs and confirms image-not-rendering on each of the 4 surfaces (or documents which surfaces are actually affected if scope narrows)
- [x] Root cause identified and stamped in `reproduce_artifact`
- [ ] [post-deploy] Sealed letter with image story renders the image at the story-rate phase for: logged-in recipient (private), logged-in recipient (public URL), anonymous public link, email click-through — DB confirmed: point_config.imageUrl present after backfill; render path proven by letter-snapshot-mapper.test.ts (no *.tsx changed)
- [x] Sender preview continues to render images correctly (no regression) — full test suite 170 passed, sender path uses in-memory docStoryToSnapshot (unchanged)
- [x] If a migration is required: deployed to test, manifest stamped, prod-deploy plan in spec
- [x] Canary test or e2e covers at least one recipient surface to prevent silent re-regression

## Done-When

All 4 recipient surfaces visibly render the story image at story-rate phase, verified via screenshots. Sender preview unchanged. Canary green.

## Root Cause (confirmed via /reproduce 2026-04-25)

Three migrations after P751 redefine `seal_and_send_letter` and silently drop the `imageUrl` key:

| Migration | Filename | Wrote imageUrl? |
|---|---|---|
| `20260418120000` | `p751_letter_snapshot_image_url.sql` | YES (added) |
| `20260418144500` | `p749_seal_rpc_hidden_per_point.sql` | NO (dropped) |
| `20260418210000` | `p757_set_receiver_profile_id_on_seal.sql` | NO (dropped) |
| `20260418220000` | `fix_p757_svtitle_regression.sql` | NO (dropped — currently active on test + prod per deploy-manifest.json) |

The active `seal_and_send_letter` body on test DB (verified via `pg_get_functiondef`) writes only `storyText`, `points`, `order`, `hidden` — no `imageUrl`. P777 backfill ran 2026-04-21 and patched then-existing rows, but new letters sealed afterward (e.g., `4ef6c971-121c-4916-80dc-094d2c79a630` sealed `2026-04-25 10:40 UTC`) regenerate the bug because the RPC itself never writes the key.

Code path downstream of the RPC is correct:
- `letters-service.ts:216,264` reads `point_config` via `select('*')` — passes through unchanged
- `letter-snapshot-mapper.ts:156` reads `config.imageUrl || undefined` — empty/missing → undefined
- `live-story-card-expanded.tsx:127` `{story.imageUrl && <img />}` — undefined skips render
- Existing unit test `letter-snapshot-mapper.test.ts:192-201` already proves passthrough works when key IS present

This is the classic CREATE OR REPLACE override anti-pattern. Fix scope:
1. New migration that re-adds `'imageUrl', COALESCE(s.image_url, '')` to `jsonb_build_object` (rebase off `fix_p757` body)
2. Re-run P777-style backfill for letters sealed between 2026-04-21 and the new migration
3. Deploy to test, then prod; stamp deploy-manifest.json

## Related

- **P817** — drawer clearance fix; visual UAT for P817 deferred behind this fix landing (long-story scenarios become testable once images return).
- **P591, P751, P777** — predecessors that built the infrastructure this bug indicates is incomplete.
