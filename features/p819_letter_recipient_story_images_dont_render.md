---
status: today
type: bug
rank: 1000819
severity: medium
workstream: letters
tags: [letters, images, recipient, p591, p751, p777]
created_date: '2026-04-25'
date_reported: '2026-04-25'
flow: fix
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

- [ ] `/reproduce p819` runs and confirms image-not-rendering on each of the 4 surfaces (or documents which surfaces are actually affected if scope narrows)
- [ ] Root cause identified and stamped in `reproduce_artifact`
- [ ] Sealed letter with image story renders the image at the story-rate phase for: logged-in recipient (private), logged-in recipient (public URL), anonymous public link, email click-through
- [ ] Sender preview continues to render images correctly (no regression)
- [ ] If a migration is required: deployed to test, manifest stamped, prod-deploy plan in spec
- [ ] Canary test or e2e covers at least one recipient surface to prevent silent re-regression

## Done-When

All 4 recipient surfaces visibly render the story image at story-rate phase, verified via screenshots. Sender preview unchanged. Canary green.

## Related

- **P817** — drawer clearance fix; visual UAT for P817 deferred behind this fix landing (long-story scenarios become testable once images return).
- **P591, P751, P777** — predecessors that built the infrastructure this bug indicates is incomplete.
