---
status: all-done
type: bug
rank: 26
severity: medium
workstream: events
date_reported: 2026-10-05
created_date: 2026-10-05
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, banner, performance, mobile]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1417-event-banner-small-copy.test.tsx
  root_cause: "EventCard and BannerDisplay put the stored original straight into <img src>; no small copy exists (render/image 403 FeatureNotEnabled); no onError on EventCard"
  confidence: high
  surfaces_in_scope: [event-card-home, event-card-events-list, event-detail-banner, event-detail-phone-banner]
  surfaces_deferred: [P1419]
  reproduced_at: 2026-10-05
date_resolved: 2026-10-05
root_cause: "Event banner <img>s requested the stored original (up to 2.1 MB) with no smaller copy available (Supabase transforms not enabled) and no failure path on the card"
resolution: "Derived small copy <original>.w800.webp (src/lib/banner-small.ts); BannerImage serves it to phones (no srcset), srcset to wide screens, falls back small to original to placeholder; producers: event-photo-prep.sh, both banner edge functions at save time (wasm WebP), scripts/event-banner-small.ts backfill; stale copies (older than their original) are replaced"
completed_at: 2026-10-05
---

# P1417: Event banner pictures often fail to load on phones (full-size originals, no placeholder)

## Summary

On the home page on a phone, the next-event card's banner picture often never appears on a weak
connection. The card loads the full-size original (Clarity Night 2: a 2400x1143 PNG, 358 KB) into a
card about 340 px wide, with no placeholder and no fallback when the load fails.

Founder report (2026-10-05): the Clarity Night 2 event banner picture often doesn't load on the
home page on mobile on a weak connection.

## Root Cause

Three things together:

1. **Every event banner `<img>` requests the stored original.** `EventCard` (rendered by the home
   page's `HomeTopBlock` / `HomeSideRail` and by `/events`) and `BannerDisplay` (event detail) put
   `banner_url` straight into `src`. Originals on prod measured on 2026-10-05 (HEAD, prod storage,
   read-only): 358 KB (Clarity Night 2 PNG), 630 KB, 944 KB (an AI-generated JPEG), 2.1 MB (a
   PNG). On a weak phone connection those often do not finish.
2. **No smaller copy exists, and the platform cannot make one on the fly.**
   `GET /storage/v1/render/image/public/...` returns `403 FeatureNotEnabled` ("feature not enabled
   for this tenant"), re-verified 2026-10-05. Prod objects are served `cache-control: no-cache`.
3. **No placeholder or failure path on the card.** `EventCard`'s `<img>` has no `onError`, so a
   failed load shows the browser's broken-image box, and nothing marks the space while loading.

The service worker deliberately never caches Supabase (`src/pwa/workbox-config.ts`, invariant 5),
so it cannot help and must not be changed for this.

## Invariants

- **Phones never fetch the original when a small copy exists.** Whatever chooses the image must be
  a viewport check, not `srcset` alone — a 3x phone with an honest `sizes` picks the original.
- **One `<img>` per viewport, never `<picture>`** — `docs/decisions.md` 2026-09-22 [technical]
  (P1354): `<picture>` breaks the banner height invariant and its `onError` is not source-scoped.
- **The small copy's URL is derived from the original's, never stored.** No migration; a missing
  copy falls back to the original.
- **Never a broken-image icon.** A failed load leaves the neutral placeholder (or the existing
  gradient fallback on `BannerDisplay`).
- The service worker keeps never caching Supabase (workbox-config invariant 5).

## Reproduction Steps

1. Phone viewport (375 px), network throttled (e.g. Chrome "Slow 3G"), signed out.
2. Open `https://claritypledge.com/`.
3. The "Next events" block at the top shows the Clarity Night 2 card.
4. Observe: the request for the banner is the full original
   (`event-banners/clarity-night-2-...-v5.png`, 358 KB); the banner area is empty while it loads and,
   when the load fails, shows a broken-image box.

**Reproduction rate:** depends on the connection; deterministic that the original is requested.

**Reproduced 2026-10-05** (prod home page, headless Chrome, 375x800 at 3x, mobile): the Clarity Night 2
card's `<img>` had `currentSrc` = the `-v5.png` original, natural size 2400x1143, rendered 287x161,
no `srcset`, no `loading`. The second card (a hike) loads a GCS-hosted 2880x512 JPEG (345 KB) —
same symptom, different storage (deferred, see frontmatter).

## Expected Behavior

Phones request a small copy (about 800 px wide WebP, tens of KB). Wide screens can still get the
sharp original where the image is shown large. While loading, the banner area shows a neutral grey
placeholder; if the picture fails, the placeholder stays. Banners with no small copy still show
(the original is used).

## Actual Behavior

The phone requests the full original; empty area while loading; broken-image box on failure.

## Affected Files

- `src/app/prototypes/events/components/EventCard.tsx` — banner `<img>` (~line 36)
- `src/app/components/shared/banner/BannerDisplay.tsx` — event detail banner `<img>`s
- `src/app/components/feed/home-side-rail.tsx` — renders `EventCard` above the fold
- `scripts/event-photo-prep.sh` — the CLI upload path for event photos (`event-banners/<slug>.jpg`)
- `supabase/functions/generate-event-banner`, `supabase/functions/generate-banner` — AI banner
  uploads (Deno edge runtime; no native image library)

## Severity

**Medium** — the card still shows date, title and place, but the event's picture, the strongest
promotion element on the home page, often fails for exactly the phone audience it targets.

## Fix Approach

1. **Small copy at a derived path:** `<original object path>.w800.webp` in the same bucket, for
   event banners only (`event-banners/` except `descriptions/`, and `banners/event/`). 800 px wide,
   WebP, never enlarged. One shared derivation in `src/lib/banner-small.ts`.
2. **One shared `BannerImage` component** used by `EventCard` and `BannerDisplay`: on phones
   (below 768 px wide or 500 px tall, `matchMedia`, per the P1354 decision) it requests only the small copy; on wider
   screens it gives `srcset` (small 800w, original) with a `sizes` per call site. Error chain:
   small fails → original → original fails → nothing (the parent's placeholder/fallback stays).
   `loading`/`fetchPriority` by position: the home card and the detail banner are above the fold.
3. **Placeholder:** `bg-muted` behind the image while loading; kept on failure.
4. **Producers:** `event-photo-prep.sh` also encodes and uploads the small copy (same single key
   read). A TypeScript script (`scripts/event-banner-small.ts`, run with `npx tsx`) encodes with
   `sharp` (already a dev dependency) and backfills existing banners: `--env test|prod`, dry run,
   idempotent (skips existing copies).
5. **Every save path makes the copy** (review round 1): the in-app "New
   banner" (AI or keyword search) goes through `generate-banner`, which — like the legacy
   `generate-event-banner` — now encodes the copy at save time with the Squoosh codecs compiled
   to wasm (`supabase/functions/_shared/banner-small.ts`, `@jsquash/*`) and removes the old
   banner's copy with the old banner. Remaining: the skills' hand uploads outside
   `event-photo-prep.sh` (re-create-event abort cleanup, hand-set `banner_mobile_url`) — skill
   edits need approval; see Remaining Skill Edits below. GCS-hosted hike banners are not Supabase Storage — P1419.

## Acceptance Criteria

- [x] At 375 px, the home page's event card requests the `.w800.webp` copy, not the original, when
      the copy exists (network evidence) — local dev on TEST, 375x800 at 3x: the only event-banners
      request is `...-v5.png.w800.webp` [200], natural 800x381; the `.png` original is never requested
- [x] At desktop width, the event detail banner can still load the original (srcset offered) —
      1440 at 2x: `currentSrc` is the `.png` original, eager, fetchpriority high
- [x] When the small copy is missing, the card shows the original — component test (not exercised
      live: every TEST banner already has its copy)
- [x] When every source fails, the card shows a grey placeholder, never a broken-image icon —
      component test
- [x] Backfill run on TEST creates small copies for the test DB's event banners; a second run
      skips them all — made 6, then already there 6 (8 skipped: Unsplash, GCS)
- [x] Unit/component tests bind the derivation, the viewport choice and the error chain — three
      mutants (phones on the srcset path, no currentSrc check, no landscape guard) each turn red
- [x] A banner saved through the app's "New banner" (edge function) gets its small copy at save
      time, and replacing it removes the old banner's copy — deployed to TEST, called as an event
      host: 976,412 B JPEG with a 66,664 B WebP copy (no-cache); second save removed both old objects
- [x] A small copy older than its original (original replaced at the same path) is treated as
      missing — TEST: original re-uploaded at 08:31:03, copy from 08:28:51 reported `stale` and
      replaced; next run `exists`
- [x] [post-deploy] Edge functions `generate-banner` and `generate-event-banner` deployed to PROD
- [x] [post-deploy] Backfill on PROD — founder approval required, run BEFORE the frontend deploy — done 2026-10-05: both deployed to prod, health PASS; backfill made 20, failed 0, skipped 2 (GCS hike); CN2 copy 200 image/webp 8006 B

## Resolution

**Mechanism.** `src/lib/banner-small.ts` derives `<original object path>.w800.webp` (same bucket)
for `event-banners/` (except `descriptions/`) and `banners/event/`; null for anything else, for a
copy of a copy, and for paths containing `..`, `%2e` or `//`. `BannerImage` (shared) mounts one
`<img>`: phones — below 768px wide or under 500px tall, so a phone turned sideways counts —
get only the small copy, wider screens get `srcset` (small 800w, original). Error chain: small,
then original, then nothing (caller keeps `bg-muted` / BannerDisplay's gradient). `EventCard`
and `BannerDisplay` use it; the home rail passes `bannerLoading="eager"`; the detail banner is
eager + `fetchPriority="high"`.

**Producers.** `scripts/event-photo-prep.sh` encodes and uploads the copy on the same single
key read; a failed copy warns on stderr and still exits 0 (the original is up). The backfill
`scripts/event-banner-small.ts` (sharp, WebP q75) lists rows with the anon key, writes only
`*.w800.webp`, skips existing copies, reads the prod key only when it writes.

**Measured on prod originals (shipped encoder, q75):** 358,379 B to 8,006 B (Clarity Night 2
PNG), 2,139,589 B to 79,022 B, 943,740 B to 54,086 B.

**Save paths (review round 1).** `generate-banner` (event banners) and `generate-event-banner`
encode the copy at save time — Squoosh codecs compiled to wasm, measured ~200 ms CPU on 1376x768
Gemini output — and upload it through the storage REST API with `cache-control: no-cache`
(matching hand-uploaded originals; the JS client can only send `max-age`). The copy never delays
or kills the save (delta review): `scheduleSmallCopy` returns at once and hands the work to
`EdgeRuntime.waitUntil`, with a 25 s overall deadline (a dynamic import cannot be aborted), a 10 s
upload timeout, and no decoding above 10 megapixels (the backfill makes those). TEST, with a build
whose encode never settles: generate returned in 16.5 s (baseline 13.8-16.2 s, Gemini-bound) and
no copy was written; with the real build, 15.0 s and the copy present right after. Their cleanup removes
`[old, old.w800.webp]` together. `event-photo-prep.sh` deletes any old copy when a new one cannot
be made, and on its early-exit path reports a copy older than its original as STALE with the fix
command. The backfill reads dates from the storage INFO endpoint — the public HEAD is CDN-cached
and was measured on TEST to keep the old Last-Modified after an upsert — replaces stale copies,
and sends `x-upsert` only for `--force` or a stale copy (a conflict otherwise is a skip).

**Regression tests:** `src/tests/p1417-event-banner-small-copy.test.tsx`,
`src/tests/p1417-banner-small-encode.test.ts`, `src/tests/p1417-banner-backfill.test.ts`,
`src/tests/p1417-banner-small-parity.test.ts` (app and edge path rule in one; both functions wired),
`supabase/functions/_shared/banner-small.test.ts` (Deno), P1316 canary scenarios for the small
upload, the delete-on-failure and the STALE report.

## Accepted Limits

- **Stale window:** a banner replaced by hand at the same path shows its previous small copy on
  phones until `event-banner-small.ts one|backfill` runs (event-photo-prep's early exit prints
  STALE with the command). New uploads through the script and the edge functions never hit this.
- **Not derived, phones get the original:** Unsplash URLs (already 1080w from Unsplash), story and
  profile banners (`banners/story|profile`), GCS hike banners (P1419).
- **A missing copy costs one failed request** (HTTP 400, ~88 B) before the original loads — the
  price of deriving instead of storing the URL.
- **BannerDisplay changes for story/profile banners too:** `bg-muted` while loading, eager +
  `fetchPriority="high"` (hero position on every page that uses it); a phone turned sideways now
  gets the phone banner (one breakpoint rule for both components).
- **Edge functions fetch the wasm codecs from esm.sh at runtime**: exact versions
  `@jsquash/png@3.1.1`, `@jsquash/jpeg@1.6.0`, `@jsquash/webp@1.5.0`, `@jsquash/resize@2.1.1`
  (the same host the other functions import from; `npm:` cannot pass the pre-commit `deno check`,
  which resolves against the app's node_modules). Each module loads its `.wasm` from esm.sh next to
  itself, and esm.sh resolves transitive dependencies (e.g. `wasm-feature-detect`) at build time,
  so those are pinned by esm.sh, not by us. If esm.sh is slow or down, the copy is skipped by the
  deadline and the save is unaffected. Vendoring the wasm into the function (Supabase
  `static_files`) is the hardening step if this ever matters; not done here.
- **Above 10 megapixels the edge functions make no copy**, to stay inside the edge CPU limit; the
  backfill (sharp, no limit) makes it later. Gemini 4K output is 9.4 MP, under the budget.
- **Backfill vs. a concurrent replace:** the backfill re-reads the original's `last_modified` after
  encoding and skips the upload if it changed. A replace landing between that check and the
  upload can still slip through; accepted, event banners have a single operator, and the next
  run reports the copy as stale.
- **A network failure looks like a missing copy:** on a weak connection a small copy that fails
  for network reasons (not 404) falls back to the full original — `<img>` onError cannot tell
  them apart. No worse than before; "phones never fetch the original" is not absolute.
- **Soft detail banner on landscape phones and small tablets:** a phone turned sideways (844x390)
  and an iPad mini in portrait (744px) get only the 800px copy for the full-width detail banner,
  about 3x and 1.9x upscaled, slightly soft. Deliberate; a 1200w copy is a possible follow-up.
- **Pre-existing, follow-up:** BannerDisplay's `imgError` / `mobileImgError` never reset when
  `bannerUrl` changes, so BannerImage's "a new banner restarts the chain" has no effect inside
  BannerDisplay (a banner that failed stays on the fallback until remount).

## Pre-deploy Checklist

Order matters: the backfill only writes keys nothing reads yet, so run it before the frontend
that starts requesting them — then no phone ever pays the fallback round trip for an existing banner.

- [x] Edge functions to prod: `./scripts/deploy-functions.sh generate-banner --env prod` and
      `./scripts/deploy-functions.sh generate-event-banner --env prod` (from the main checkout,
      so the manifest stamp runs)
- [x] Backfill prod: `npx tsx scripts/event-banner-small.ts backfill --env prod --dry-run`, then — done 2026-10-05: both deployed to prod, health PASS; backfill made 20, failed 0, skipped 2 (GCS hike); CN2 copy 200 image/webp 8006 B
      without `--dry-run` (one keychain dialog — Allow, never Always Allow)
- Frontend deploy
- Post-deploy: 375px home page requests `.w800.webp` for the next event; detail page at
      desktop loads the original

## Remaining Skill Edits

The code save paths all make the copy (`event-photo-prep.sh`, used by publish-run 8b and
re-create-event step 9, and both banner edge functions). Two skill-text gaps remain and need
founder approval, so they are tracked here rather than edited:

- [post-deploy] `.claude/commands/slava/events/re-create-event.md` abort block: also
      `curl -s -X DELETE .../storage/v1/object/event-banners/$SLUG.jpg.w800.webp` with the same
      header-file pattern, in the same shell (one dialog); "both DELETEs are harmless 404s" when
      the photo was skipped. Without it an aborted event leaves an orphan small copy.
- [post-deploy] `.claude/commands/slava/events/publish-run.md` 8b: after PATCHing a hand-set
      `banner_mobile_url`, run `npx tsx scripts/event-banner-small.ts one --env prod <banner_mobile_url>`;
      note that event-photo-prep.sh's WARNING / STALE lines print the command to run. Without it a
      hand-set phone banner has no small copy until the next backfill.
