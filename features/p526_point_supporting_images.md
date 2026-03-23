---
status: blocked
type: story
rank: 0.438
blocked_by: p523
tags:
  - points
  - images
  - upload
  - gcs
delivery_stage: 5-decomposed
created_date: 2026-03-16T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-22T12:52:02.597Z'
---

# P526: Point Supporting Images

**Prior art:** P504 (Auto-Generated Banners), P519 (Remove On-Page Banners from Stories & Points)
**Blocked by:** P523 (Standalone Point Creation & Point Evolution)

> **2026-03-17 — Parked.** P523 establishes the immutability model: "never edit, always evolve via inspired-by." P526's editable image metadata contradicts this. After P523 ships, revisit P526 with simplified scope: image at creation only, no edit-after-creation, no RPC function, no author Change/Remove controls. This cuts ~4 tasks from the current decomposition.

---

## Problem Statement

**Current state:** Points are text-only. The only visual element points ever had — auto-generated banners from P504 — was removed in P519 because those banners were disconnected decorative blocks with no informational value. Points currently have no sharing surface either: no OG image, so sharing a point link on LinkedIn or Twitter produces a plain text card.

**Pain points:**
- **Some points need visual evidence.** Nejc and Jan flagged that certain points are hard to engage with as pure text. A point about a product's UX needs a screenshot. A point about a trend needs a chart. A point about a physical location needs a photo. Without images, the author must describe what they could simply show.
- **The P504/P519 lesson created a gap.** P519 correctly removed meaningless auto-generated banners from points. But "no image at all" is also wrong when the author has a meaningful image to share. The gap is author-chosen supporting visuals — images that carry meaning because the author selected them to illustrate their claim.

**Who's affected:**
- **Point creators** — anyone who wants to strengthen their point with visual evidence
- **Point readers** — viewers who would understand the point faster or more deeply with visual context
**Future (not in V1):**
- OG image for social sharing — add when point URL sharing is observed in practice

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge's core loop is "make a claim, stake a position, show your reasoning." Images are supporting evidence — a chart, a screenshot, a photo contextualizes a claim. Allowing authors to attach a supporting image closes the gap between what they can say and what they can show.

**Why now:**
1. Direct user feedback (Nejc and Jan) — real users asking for this, not speculative
2. Infrastructure already exists — the GCS signed-URL pattern from audio uploads is proven and reusable
3. P519 removed the only visual element from points, leaving them entirely text-based — this restores visual capability, but with author intent instead of AI generation
4. P523 (standalone point creation) is in review — if P526 ships around the same time, standalone points launch with image support from day one

**Impact if not solved:** Points remain text-only. Authors who need visual support either (a) describe images in words, (b) skip creating the point entirely, or (c) create a story instead (higher friction) just to get visual context.

---

## Business Requirements

**Must-haves:**
1. Point creator can optionally upload a single image when creating a point
2. Point creator can add, change, or remove the image after creation (image is metadata, not part of the immutable statement)
3. Image displays inline on the point detail page, below the statement text
4. Viewers can expand the image to see it at full resolution
5. Upload accepts JPEG, PNG, and WebP formats, max 5MB
6. Images are resized client-side to max 1200px on the longest edge before upload
7. Image upload works in both the existing inline point creation flow AND any future standalone creation form (P523)

**Success conditions:**
- A user can go from "I want to add an image to this point" to "image is visible on the point" in under 30 seconds
- Image adds to the point's meaning — it is the author's chosen visual, not a generated decoration

**Constraints:**
- Single image per point (not a gallery) — simplicity first, expand later if validated
- Image is optional — most points will remain text-only
- No moderation system in V1 (tiny user base; revisit when needed)
- Must not create a hard dependency on P523 — image upload should work with the current point creation flow regardless of P523's status
- Storage uses GCS (free via existing $25k GCP credits), not Supabase Storage (which would incur cost)

---

## User Stories

**As a point creator adding visual evidence:**
- I want to upload a supporting image when I create a point, so viewers can see the evidence behind my claim
- I want to add an image to a point I already created, so I can strengthen it with visual context I found later
- I want to change the image on my point, so I can replace it with a better visual if I find one
- I want to remove the image from my point, so I can revert to text-only if the image isn't adding value

**As a point viewer:**
- I want to see the author's image below the statement, so I can understand the visual context they intended
- I want to click/tap the image to see it full-size, so I can examine details (charts, screenshots, fine print)

**As a mobile user:**
- I want to upload a photo from my camera roll, so I can add visual evidence from my phone without resizing or converting manually

---

## Jobs to Be Done

**When my point needs visual evidence to be convincing:**
- I want to attach a screenshot, chart, or photo, so viewers see what I'm talking about instead of me having to describe it in words (motivation: making my argument stronger)

**When I find a better visual after creating my point:**
- I want to swap the image without recreating the point, so my point stays stable while the supporting visual improves (motivation: iteration without disruption)

**When an image doesn't actually help my point:**
- I want to remove it cleanly, so the point goes back to text-only without any residual broken state (motivation: keeping content clean)

---

## Outcomes (Success Metrics)

**Adoption metric:**
- What percentage of newly created points include an image? (Baseline: 0%. **Kill signal:** if <5% of points include images after 30 days of availability, the feature did not validate the need — revisit whether image support is worth maintaining.)

**Quality signal:**
- Do points with images receive more position-taking than text-only points? (Observe after sufficient volume, no A/B test needed at this scale.)

**Operational metrics (monitor, no targets):**
- Upload failure rate (should be near-zero; investigate if above 5%)
- Average image file size after client-side resize
- Orphaned GCS files (uploaded but not linked to a point in DB)

---

## Acceptance Criteria

- [ ] Point creation form includes an optional "Add image" action
- [ ] Supported formats: JPEG, PNG, WebP; max 5MB; clear error if wrong format or too large
- [ ] HEIC files from iPhone are either converted client-side or rejected with a clear message telling the user to use JPEG/PNG/WebP
- [ ] Image is resized client-side before upload so no image exceeds 1200px on its longest edge
- [ ] Upload shows progress indication — user knows the upload is happening and when it completes
- [ ] Upload failure (network drop, timeout) shows a clear error with a retry option — point creation is not blocked
- [ ] Point detail page displays the image below the statement text
- [ ] Image renders well regardless of aspect ratio (portrait, landscape, square) — no stretching, no cropping of content
- [ ] Clicking/tapping the image opens a full-resolution view (lightbox or equivalent)
- [ ] Point author can add an image to an existing point that has none
- [ ] Point author can replace the image on a point with a different one
- [ ] Point author can remove the image from a point, reverting to text-only
- [ ] Non-authors cannot add, change, or remove the image on someone else's point
- [ ] Image upload works in the current inline point creation flow
- [ ] If P523 standalone form ships, image upload works there too (no code that assumes inline-only context)
- [ ] If the point's DB save fails after the image was already uploaded, the user sees a clear error — the orphaned file does not cause visible problems

---

## Open Questions (for UX / Architect phases)

**UX questions:**
1. What is the image display layout on the point detail page? Full-width below statement? Constrained to card width? Thumbnail with expand? Needs a /ux pass.
2. What does the "Add image" affordance look like in the creation form? Icon button? Drag-and-drop zone? Photo icon in a toolbar?
3. How does the lightbox/expand interaction work on mobile vs. desktop?
4. Should the image have a caption field, or is the point statement sufficient context?
5. What loading state does the image show before it's fully loaded on the detail page (blur-up, skeleton, spinner)?

**Architect questions:**
6. GCS bucket setup: reuse `claritypledge-ml-training` or create dedicated `claritypledge-uploads`? Parameterize the existing `gcs-signed-url` cloud function for both.
7. New `image_url` column on `points` table vs. reusing existing `banner_url` — semantics, migration path, RLS implications (points currently have no UPDATE policy).
8. Client-side resize implementation: canvas API, a library like browser-image-compression, or something else?
9. Orphaned file cleanup strategy: lazy GCS TTL, periodic cleanup job, or acceptable to leave orphans given low volume?
10. Deletion cleanup: when an image is removed from a point, should the GCS file be deleted immediately (cloud function) or left for cleanup?
11. Signed URL expiry for reads: how long should read URLs be cached? CDN considerations?
12. HEIC handling: client-side conversion (e.g., heic2any) or reject and tell user to convert?

---

## UX Requirements

### Open Question Resolutions

| # | Question | Decision |
|---|----------|----------|
| 1 | Image display layout? | Constrained to card width, below statement, inside the card content area |
| 2 | "Add image" affordance? | Icon button (camera icon) in creation form, below textarea |
| 3 | Lightbox on mobile vs desktop? | Same pattern: Dialog overlay with close button. Pinch-to-zoom on mobile. |
| 4 | Caption field? | **No.** The point statement is the context. Skip caption — lean. |
| 5 | Loading state? | Skeleton rectangle matching image aspect ratio (from `naturalWidth`/`naturalHeight` if known, else 16:9 default) |

### User Flows

#### Flow 1: Upload image during point creation

1. User opens point creation form (inline on story detail page, or future P523 standalone form)
2. User types point statement in textarea
3. Below textarea, user sees a muted camera icon button labeled "Add image" (`text-muted-foreground`)
4. User clicks "Add image" → native file picker opens (accepts `.jpg, .jpeg, .png, .webp`)
5. **If file is invalid format or >5MB:** Toast error: "Please use a JPEG, PNG, or WebP image under 5MB." File picker closes, form unchanged.
6. **If file is HEIC:** Toast error: "HEIC format isn't supported. Please use JPEG, PNG, or WebP." (No client-side conversion — too heavy for V1.)
7. **If file is valid:** Image resized client-side to max 1200px longest edge. Thumbnail preview appears below the "Add image" button, replacing it.
8. Preview shows: thumbnail (rounded-md, max-h-32, object-cover) + small "×" remove button (top-right corner overlay)
9. User can click "×" to remove the image and restore the "Add image" button
10. User submits point → image uploads to GCS via signed URL → `image_url` saved to DB
11. **During upload:** Submit button shows spinner + "Creating..." (disabled). Upload happens before DB save.
12. **If upload fails:** Toast error: "Image upload failed. Your point was saved without the image." Point is created text-only. User can add image later from detail page.
13. User lands on point detail page with image visible

#### Flow 2: View image on point detail page

1. User navigates to point detail page
2. Point card renders:
   ```
   ┌─────────────────────────────────┐
   │ 📌  Point Statement Text        │
   │     #tags                        │
   │     Context (italic, if any)     │
   │                                  │
   │  ┌─────────────────────────┐     │
   │  │                         │     │
   │  │     Supporting Image    │     │
   │  │   (max-h-64, w-full,   │     │
   │  │    object-contain,      │     │
   │  │    rounded-md)          │     │
   │  └─────────────────────────┘     │
   │                                  │
   │  [Position Buttons Row]          │
   ├──────────────────────────────────┤
   │                      [Share] 🔗  │
   └──────────────────────────────────┘
   ```
3. Image sits between context/tags and position buttons — inside the card, not above it (P519 lesson: no disconnected blocks)
4. Image uses `object-contain` (never crops) with `max-h-64` (256px) on desktop, `max-h-48` (192px) on mobile
5. Image has `rounded-md` corners matching the card's inner elements
6. Clicking/tapping the image opens lightbox dialog

#### Flow 3: Expand image (lightbox)

1. User clicks/taps image on detail page
2. Dialog opens: full-viewport overlay with dark backdrop
3. Image displays at natural resolution, centered, with `max-w-full max-h-[90vh] object-contain`
4. Close: click backdrop, click "×" button (top-right), or press Escape
5. Mobile: pinch-to-zoom supported via native browser behavior on the `<img>` element
6. No prev/next navigation (single image per point)

#### Flow 4: Add/change/remove image on existing point (author only)

1. Point author visits their own point detail page
2. **If no image exists:** Small "Add image" text button appears below context/tags area (same muted camera icon style as creation form). Only visible to the point author.
3. **If image exists:** On hover (desktop) or always (mobile), a small action row appears below the image: "Change" and "Remove" text buttons, `text-xs text-muted-foreground`
4. **"Add image" / "Change":** Opens native file picker → same validation as Flow 1 → uploads → replaces current image
5. **"Remove":** Immediate removal (no confirmation dialog — this is low-stakes, reversible by re-uploading). Image disappears, GCS cleanup deferred to architect.
6. **During upload:** Image area shows skeleton with spinner overlay. Old image stays visible until new one loads (optimistic approach for "Change").

#### Flow 5: Point card in list/feed view

1. In feed and profile list views, point cards are compact
2. **No thumbnail in list view** — image lives on the detail page only. List cards look the same regardless of whether the point has an image. Avoids the P504 trap (decorative visual weight in compact views) and the unreadable-thumbnail problem (charts/screenshots at 64px are noise).
3. User discovers the image when they click through to the detail page

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Upload in progress, user navigates away** | Upload continues in background. If it completes, image is saved. If it fails, point exists without image. No orphan visible to user. |
| **Upload succeeds, DB save fails** | Toast: "Image upload failed. Your point was saved without the image." Orphaned GCS file — acceptable at low volume, cleanup deferred. |
| **Very tall image (1:5 portrait)** | `max-h-64` + `object-contain` prevents it from dominating the page. Full size available in lightbox. |
| **Very wide image (5:1 panorama)** | Constrained to card width, height auto-scales. Readable in lightbox. |
| **Tiny image (<100px)** | Displayed at natural size (no upscaling), centered in image area. |
| **Slow network** | Skeleton placeholder shown until image loads. Progressive JPEG renders incrementally if browser supports it. |
| **Two tabs, both uploading** | Last write wins. Both uploads proceed independently. Final `image_url` in DB is whichever completes last. Acceptable — single user, low stakes. |
| **Non-author views point** | No "Add image", "Change", or "Remove" controls visible. Image displays read-only. |
| **Point has no image** | No empty placeholder, no "add image" prompt for non-authors. Card looks exactly as it does today. |

### Accessibility

- **Image alt text:** `"Supporting image for point: {first 50 chars of statement}"` — auto-generated, not author-supplied (lean V1)
- **Lightbox dialog:** Uses `<Dialog>` with `role="dialog"`, `aria-label="Image viewer"`, focus trapped inside
- **Close lightbox:** Escape key, click backdrop, click close button — all three paths
- **Upload button:** `aria-label="Add supporting image"`, keyboard accessible (Tab + Enter)
- **Change/Remove buttons:** Standard button semantics, visible focus rings
- **Image in card:** `role="img"` with descriptive alt text
- **Upload progress:** `aria-live="polite"` status region announcing "Uploading image..." and "Image uploaded" or "Upload failed"
- **File picker:** Native `<input type="file" accept=".jpg,.jpeg,.png,.webp">` — fully accessible by default

### Responsive Design

**Mobile (320px–767px):**
- Image: `max-h-48` (192px), full card width minus padding
- "Add image" button: full width below textarea, larger touch target (`h-10`)
- Author controls (Change/Remove): always visible below image (no hover on touch)
- Lightbox: full screen, close button top-right, pinch-to-zoom

**Tablet (768px–1023px):**
- Same as mobile layout (cards are already `max-w-lg` centered)

**Desktop (1024px+):**
- Image: `max-h-64` (256px), constrained to card width
- Author controls: appear on hover, always visible on focus
- Lightbox: centered with dark backdrop, `max-w-4xl`

### Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Image display (detail page) | **New** | Inline `<img>` with Tailwind. Could extract to `<PointImage>` if reused elsewhere. | No — start inline, extract if needed |
| Lightbox dialog | **Reuse** | `src/app/components/ui/dialog.tsx` — existing Dialog component | No |
| Upload button (creation form) | **New** | `<ImageUpload>` — file input + preview + remove. Reusable for future story images. | No |
| List card | **No change** | `point-card-with-links.tsx` — no thumbnail, card unchanged | No |
| Toast notifications | **Reuse** | `sonner` toast — already used throughout | No |
| Skeleton loading | **New (inline)** | Use `animate-pulse` div pattern (existing pattern in point-detail-page.tsx) — no Skeleton component exists | No |
| Author controls (Change/Remove) | **New** | Small inline buttons, standard `<Button variant="ghost" size="sm">`. No new component needed — just buttons. | No |

**Decisions requiring founder input:** None — all patterns follow existing conventions.

---

## Pre-deploy Checklist

### Secrets to provision
- [ ] No new secrets required (GCS bucket uses existing GCP credentials, cloud function already deployed)

### Deploy commands
- [ ] `gsutil mb -l us-central1 gs://claritypledge-uploads` — create GCS bucket
- [ ] `gsutil iam ch allUsers:objectViewer gs://claritypledge-uploads` — set public-read
- [ ] `gsutil cors set cors.json gs://claritypledge-uploads` — set CORS (restrict to claritypledge.com + localhost)
- [ ] `gcloud functions deploy gcs-signed-url --runtime nodejs20 --trigger-http --allow-unauthenticated --source cloud-functions/gcs-signed-url` — redeploy cloud function with bucket param + JWT auth
- [ ] `./scripts/migrate.sh` — apply migration (image_url column + RPC function)
- [ ] `npm install browser-image-compression` — install dependency
- [ ] Trigger Vercel redeploy (new dependency requires rebuild)

### Post-deploy verification
- [ ] Create a point with image on prod — verify upload + display
- [ ] Verify existing points still load without errors (no image = no broken state)
- [ ] Check Sentry for new errors in first 10 minutes
- [ ] Verify cloud function rejects unauthenticated requests (JWT check)

---

## Next Steps

1. ~~**`/challenge-prd`**~~ — done. Verdict: RETHINK (strategic timing). Founder override: proceeding. OG demoted to future, "reasoning" → "evidence", kill signal added.
2. ~~**`/ux`**~~ — done. Image below statement inside card, camera icon upload button, Dialog lightbox, no caption field.
3. ~~**`/architect`**~~ — done. New `image_url` column, dedicated GCS bucket, parameterized cloud function, `browser-image-compression`, public-read GCS, accept orphans.
4. ~~**`/generate-tests`**~~ — done. 5 test files + UAT + coverage strategy.
5. ~~**`/spec-review`**~~ — done. 3 BLOCKs + 5 WARNs found, all fixed. Migration SQL → RPC, thumbnail refs removed, Skeleton → animate-pulse, pre-deploy checklist added.
6. ~~**`/decompose`**~~ — done. 8 tasks, 3 parallelizable at start.
7. **`/dev`** — dispatch subagents per task in dependency order

---

## Technical Architecture

### Technical Analysis

#### Current Points Schema

The `points` table (from `20260204_stories_points_calibration.sql`) has columns: `id`, `statement`, `context`, `first_validator_id`, `created_at`, `updated_at`, `tags`. P504 added `banner_url TEXT` via `20260313141528_p504_banner_columns.sql`. The table has RLS enabled with SELECT (public) and INSERT (verified users) policies. **There is no UPDATE policy on `points`** — the original migration explicitly notes "Points are not editable after creation (statement is immutable)."

TypeScript types: `Point` interface has `bannerUrl?: string`. `DbPoint` has `banner_url?: string | null`. `DbPointWithCreator` in `points-service-real.ts` includes `banner_url`. The mapper `mapPointFromDb` maps it to `bannerUrl`.

#### GCS Signed URL Function

`cloud-functions/gcs-signed-url/index.js` is a Cloud Function that:
- Hardcodes `BUCKET_NAME = 'claritypledge-ml-training'`
- Accepts `{ sessionCode, fileName, contentType }` via POST
- Sanitizes inputs (alphanumeric + `-_` for sessionCode, + `.` for fileName)
- Generates a write-only signed URL valid for 15 minutes
- Stores at path `sessions/{sessionCode}/{fileName}`

#### Audio Upload Pattern (Reusable)

`src/app/data/api.ts` contains the proven upload flow:
1. `getSignedUploadUrl(sessionCode, fileName, contentType)` — calls the cloud function
2. `uploadToGCS(uploadUrl, blob, contentType)` — PUTs the file with retry + exponential backoff
3. `withRetry()` — generic retry helper with jitter, respects 429 Retry-After headers

The client calls these functions from `uploadAudioChunk()` and `uploadSessionData()`. Same pattern applies to image uploads.

#### Point Detail Page

`point-detail-page.tsx` renders point card with: Pin icon + statement + tags + context + position buttons. Image would insert between context and position buttons (per UX spec). The page already uses `point.bannerUrl` for SEO/OG image via `<SEO image={point.bannerUrl}>`.

### Architecture Decisions

#### Decision 1: Storage Bucket

**Chosen:** Create a dedicated `claritypledge-uploads` GCS bucket. Parameterize the cloud function to accept a `bucket` field.

**Rationale:** `claritypledge-ml-training` contains session audio recordings — mixing user-uploaded images into it creates a messy namespace. A dedicated bucket allows independent lifecycle policies (TTL, public access, CORS).

**Trade-off:** One more bucket to manage. Acceptable — buckets are free, separation of concerns matters.

**Alternative rejected:** Reusing `claritypledge-ml-training` — would require careful path conventions to avoid collisions with session data, and would inherit ML bucket's access controls which differ from what images need.

#### Decision 2: Database Column

**Chosen:** Add a new `image_url TEXT` column on `points`. Do not reuse `banner_url`.

**Rationale:** `banner_url` was added by P504 for AI-generated decorative banners (removed in P519 but column remains). `image_url` is author-uploaded supporting evidence — different semantics, different lifecycle, different source. Using the same column would conflate AI-generated vs user-uploaded, making cleanup and migration ambiguous.

**Trade-off:** Two URL columns on `points` (`banner_url` and `image_url`). `banner_url` is effectively dead (P519 removed its usage). Could drop `banner_url` later as cleanup.

**Alternative rejected:** Reusing `banner_url` — would require repurposing a dead column with different semantics. `banner_url` is also used in SEO/OG metadata (`<SEO image={point.bannerUrl}>`), so repurposing would silently change OG image behavior.

#### Decision 3: RLS Policy for Image Updates

**Chosen:** ~~UPDATE policy with WITH CHECK guards~~ → **RPC function** (overridden by Security Review).

**Rationale:** Security review found that PostgreSQL UPDATE policies apply to the entire row — there is no column-level restriction. The original `WITH CHECK` subquery approach is fragile and could allow statement mutation in edge cases. An RPC function (`update_point_image`) provides a hard guarantee: the client never gets UPDATE permission on `points`.

**Implementation:** `SECURITY DEFINER` function:

```sql
CREATE OR REPLACE FUNCTION update_point_image(p_point_id UUID, p_image_url TEXT)
RETURNS void AS $$
BEGIN
  UPDATE points
  SET image_url = p_image_url, updated_at = now()
  WHERE id = p_point_id AND first_validator_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or point not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

No UPDATE RLS policy on `points` — immutability guarantee preserved.

**Trade-off:** RPC call instead of direct Supabase `.update()`. Slightly more code in the service layer, but the security guarantee is worth it.

**Alternative rejected:** (a) UPDATE policy with `WITH CHECK` — fragile, relies on subquery reading current state mid-transaction. (b) Separate `point_images` table — adds join complexity for a single optional URL.

#### Decision 4: Client-Side Resize

**Chosen:** Use `browser-image-compression` library.

**Rationale:** The canvas API approach requires manual code for: reading EXIF orientation, handling PNG transparency, dealing with browser differences in canvas max size, and memory management for large images. `browser-image-compression` handles all of this in ~15KB gzipped, is well-maintained (2.5M weekly downloads), and supports the exact API needed: `maxWidthOrHeight: 1200`, `maxSizeMB: 5`, `useWebWorker: true`.

**Trade-off:** Adds a dependency. Acceptable — the alternative is 100+ lines of brittle canvas code.

**Alternative rejected:** Raw canvas API — too many edge cases (EXIF rotation, iOS memory limits, PNG alpha handling). Not worth the maintenance burden for a solved problem.

#### Decision 5: GCS Object Access (Public vs Signed URLs for Reads)

**Chosen:** Public-read objects. Set bucket-level `allUsers` read access on `claritypledge-uploads`.

**Rationale:** Point images are displayed on publicly readable pages (no auth required to view a point). Signed read URLs would require: (a) a cloud function to generate read URLs, (b) URL expiry management, (c) cache invalidation complexity, (d) broken images when URLs expire. The content is inherently public.

**URL format:** `https://storage.googleapis.com/claritypledge-uploads/points/{point_id}/{filename}`

**Trade-off:** Files are publicly accessible if someone knows the URL. Acceptable — the content is displayed publicly anyway. No private images in V1.

**Alternative rejected:** Signed read URLs — unnecessary complexity for public content. Would also break CDN caching (signed URLs have unique query strings).

#### Decision 6: Orphan/Deletion Cleanup Strategy

**Chosen:** Accept orphans at low volume. No cleanup job in V1.

**Rationale:** Orphans occur in two scenarios: (1) image uploaded but point DB save fails, (2) image replaced/removed but old GCS file not deleted. At current volume (single-digit users), orphaned images cost fractions of a cent in storage. Building a cleanup job is premature.

**Deletion on remove/replace:** When a user removes or replaces an image, the old GCS file is NOT deleted. The `image_url` column is updated to the new URL (or NULL). The old file becomes an orphan.

**Future cleanup:** If orphans become a cost concern, add a GCS lifecycle rule (e.g., delete objects not referenced in any `image_url` column after 30 days). Or a weekly cloud function.

**Trade-off:** Some wasted storage. At ~200KB per resized image, even 1000 orphans = 200MB = negligible cost on GCP free credits.

**Alternative rejected:** Immediate GCS deletion on remove/replace — requires a cloud function with Supabase webhook or a server-side delete call. Complexity not justified at current scale.

#### Decision 7: Upload Flow

**Chosen:** Signed URL write -> client PUT -> save URL to DB. Same pattern as audio uploads.

**Flow:**

1. User selects image -> client validates format/size -> `browser-image-compression` resizes
2. Client calls `getSignedUploadUrl()` with `{ bucket: 'claritypledge-uploads', folder: 'points', entityId: pointId, fileName, contentType }`
3. Cloud function returns signed write URL (15min expiry)
4. Client PUTs resized image blob to signed URL (with retry/backoff)
5. Client constructs public URL: `https://storage.googleapis.com/claritypledge-uploads/points/{pointId}/{fileName}`
6. Client saves `image_url` to `points` table via Supabase update

**For new point creation:** Steps 1-4 happen after the point is created (need `pointId` for the path). If upload fails, point exists without image — user can add later.

**Cloud function changes:** Parameterize bucket name (accept `bucket` field, default to `claritypledge-ml-training` for backward compatibility). Add `folder` and `entityId` fields. New path pattern: `{folder}/{entityId}/{fileName}`.

### Security Review

### RLS Policies

- ⚠️ **CRITICAL: UPDATE policy exposes all columns.** PostgreSQL `CREATE POLICY FOR UPDATE` applies to the entire row. The architect's `WITH CHECK` subquery approach (verifying immutable fields unchanged) is clever but fragile — it relies on the subquery reading current DB state mid-transaction. **Safer alternative: RPC function.** Create a `SECURITY DEFINER` function `update_point_image(point_id UUID, new_image_url TEXT)` that verifies `auth.uid() = first_validator_id` and only touches `image_url`. No UPDATE policy needed. The client never gets UPDATE permission on points.
- **Decision: Use RPC function (Option A from security review).** This overrides architect Decision 3. The RPC approach provides a hard guarantee against statement mutation without fighting PostgreSQL's column-level permission model.
- ✅ Existing SELECT policy: public read — unchanged
- ✅ Existing INSERT policy: verified users — unchanged

### Authentication

- ⚠️ **CRITICAL: Existing cloud function (`gcs-signed-url`) has zero authentication.** No `Authorization` header check, no JWT validation, no API key. Anyone who knows the function URL can generate signed upload URLs. This is a pre-existing vulnerability — P526 must fix it.
- **Required:** Add Supabase JWT verification to cloud function. Client passes access token in `Authorization: Bearer` header. Function decodes and verifies against Supabase JWT secret.

### Input Validation

- ⚠️ **MEDIUM: No server-side content-type allowlist.** Cloud function accepts any `contentType` from the request. Must allowlist `image/jpeg`, `image/png`, `image/webp` only.
- ⚠️ **MEDIUM: No server-side file size enforcement.** Must add `X-Goog-Content-Length-Range: 0, 5242880` condition to signed URL to enforce 5MB server-side.
- ✅ Filename sanitization exists (regex strips non-alphanumeric). For P526: use `point-images/{pointId}/{uuid}.{ext}` — no user-controlled path segments.

### Data Protection

- ✅ Images are intentionally public content (user chose to upload). No PII concern.
- ⚠️ **LOW: CORS allows all origins (`*`).** Should restrict to `claritypledge.com` + `localhost` for dev.
- ✅ `image_url` exposes bucket name in URL — acceptable for V1 given public content.

### Upload Security

- ✅ Signed URL scope: `write` action, 15-minute expiry — correct.
- ⚠️ Add content-length restriction to signed URL (see Input Validation above).
- ✅ Public-read for stored images — appropriate for user-chosen public content.

### Security Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| 1 | **CRITICAL** | UPDATE policy would expose all point columns | Use RPC function — never grant UPDATE on points |
| 2 | **CRITICAL** | Cloud function has zero authentication | Add JWT verification |
| 3 | **MEDIUM** | No server-side content-type allowlist | Allowlist 3 MIME types in cloud function |
| 4 | **MEDIUM** | No server-side file size enforcement | Add content-length condition to signed URL |
| 5 | **LOW** | CORS allows all origins | Restrict to claritypledge.com + localhost |

### Implementation Approach

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/shared/image-upload.tsx` | `<ImageUpload>` component: file picker + validation + preview + remove |
| `src/lib/image-resize.ts` | Wrapper around `browser-image-compression` with P526 defaults |
| `src/lib/gcs-upload.ts` | Extracted GCS upload helpers (from `api.ts`) — `getSignedUploadUrl`, `uploadToGCS`, `withRetry` |
| `supabase/migrations/YYYYMMDDHHMMSS_p526_point_image_url.sql` | Add `image_url` column + `update_point_image()` RPC function |

#### Files to Modify

| File | Change |
|------|--------|
| `cloud-functions/gcs-signed-url/index.js` | Accept `bucket`, `folder`, `entityId` params; default bucket to `claritypledge-ml-training` |
| `src/app/types/index.ts` | Add `imageUrl?: string` to `Point`, `DbPoint`, and related interfaces |
| `src/app/data/points-service.interface.ts` | Add `updatePointImage(pointId: string, imageUrl: string \| null): Promise<boolean>` |
| `src/app/data/points-service-real.ts` | Implement `updatePointImage`; add `image_url` to `DbPointWithCreator`; update `mapPointFromDb` |
| `src/app/pages/point-detail-page.tsx` | Add image display, lightbox, author controls (add/change/remove) |
| `src/app/data/api.ts` | Update `getSignedUploadUrl` to accept bucket/folder/entityId (or extract to `gcs-upload.ts`) |
| `package.json` | Add `browser-image-compression` dependency |

#### Build Sequence

1. **Create GCS bucket** — `gsutil mb -l us-central1 gs://claritypledge-uploads` + set public-read IAM + CORS config
2. **Update cloud function** — parameterize bucket, deploy: `gcloud functions deploy gcs-signed-url ...`
3. **Database migration** — add `image_url TEXT` column + `update_point_image()` RPC function (no UPDATE policy)
4. **Install dependency** — `npm install browser-image-compression`
5. **Extract upload helpers** — create `src/lib/gcs-upload.ts` from `api.ts` upload code, update imports
6. **Create image resize module** — `src/lib/image-resize.ts` wrapping `browser-image-compression`
7. **Create ImageUpload component** — file input + validation + preview + remove button
8. **Update types** — add `imageUrl` to Point/DbPoint interfaces
9. **Update points service** — add `updatePointImage` method + interface
10. **Update point detail page** — image display + lightbox + author controls
11. **Update point creation flow** — wire `<ImageUpload>` into creation form, upload after point created
12. **Test end-to-end** — create point with image, view, change, remove

#### Migration SQL

See Security Review section for the canonical RPC function SQL (lines ~460-476). The migration file should contain both the `ALTER TABLE` and `CREATE FUNCTION` statements from there.

---

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.
> Consistency checks: ✅ AC coverage (16/16) · ✅ UX–Arch drift (none) · ✅ Security blockers (all addressed)

### Task 1: GCS bucket + cloud function (infra)
- **Files:** `cloud-functions/gcs-signed-url/index.js` (modify), `cloud-functions/gcs-signed-url/cors.json` (create)
- **Spec refs:** "Architecture Decisions > Decision 1 (lines ~373-385)", "Security Review > Authentication (lines ~480-493)"
- **Depends on:** None
- **Verify:** `gsutil ls gs://claritypledge-uploads` succeeds; cloud function accepts `bucket` param; rejects unauthed requests; existing audio uploads still work
- **What to do:** Create GCS bucket + public-read + CORS. Parameterize cloud function (bucket/folder/entityId). Add JWT auth + content-type allowlist + content-length condition. Deploy + verify backward compat.
- [ ] Complete

### Task 2: Database migration
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p526_point_image_url.sql` (create)
- **Spec refs:** "Security Review > RPC function SQL (lines ~460-476)"
- **Tests:** `e2e/integration/p526-point-image-migration.spec.ts`
- **Depends on:** None
- **Verify:** `image_url` column exists; `update_point_image()` RPC works for author, fails for non-author; statement unchanged after image update
- [ ] Complete

### Task 3: Install dependency + create utility modules
- **Files:** `package.json` (modify), `src/lib/image-resize.ts` (create), `src/lib/gcs-upload.ts` (create)
- **Spec refs:** "Architecture Decisions > Decision 4 (lines ~397-405)", "Files to Create (lines ~519-526)"
- **Tests:** `src/tests/imageUpload.test.ts`
- **Depends on:** None
- **Verify:** `npm run build` succeeds; unit tests pass for validation + resize + upload helpers
- [ ] Complete

### Task 4: Update types + service layer
- **Files:** `src/app/types/index.ts` (modify), `src/app/data/points-service.interface.ts` (modify), `src/app/data/points-service-real.ts` (modify)
- **Tests:** `e2e/integration/p526-point-image-migration.spec.ts`
- **Depends on:** Task 2
- **Verify:** `npm run build` succeeds; `Point` has `imageUrl`; `updatePointImage` calls RPC
- [ ] Complete

### Task 5: ImageUpload component
- **Files:** `src/app/components/shared/image-upload.tsx` (create)
- **Spec refs:** "UX Requirements > Flow 1 (lines ~181-195)", "Component Analysis (lines ~292-302)"
- **Tests:** `e2e/p526-point-image.spec.ts`, `e2e/a11y/p526-accessibility.spec.ts`
- **Depends on:** Task 3
- **Verify:** Renders "Add image" button; file picker opens; validates format/size; shows preview; HEIC rejected with toast
- [ ] Complete

### Task 6: Point detail page — image display + lightbox
- **Files:** `src/app/pages/point-detail-page.tsx` (modify)
- **Spec refs:** "UX Requirements > Flow 2 + Flow 3 (lines ~197-232)"
- **Tests:** `e2e/p526-point-image.spec.ts`, `e2e/a11y/p526-accessibility.spec.ts`, `e2e/p526-smoke.spec.ts`
- **Depends on:** Task 4
- **Verify:** Image below statement; click opens Dialog lightbox; Escape closes; no image = no broken state
- [ ] Complete

### Task 7: Point detail page — author controls
- **Files:** `src/app/pages/point-detail-page.tsx` (modify)
- **Spec refs:** "UX Requirements > Flow 4 (lines ~234-241)"
- **Tests:** `e2e/p526-point-image.spec.ts`
- **Depends on:** Tasks 4, 5, 6
- **Verify:** Author sees Add/Change/Remove; non-author sees nothing; remove sets null via RPC
- [ ] Complete

### Task 8: Wire into point creation flow
- **Files:** `src/app/pages/point-detail-page.tsx` (modify), `src/app/data/api.ts` (modify)
- **Spec refs:** "UX Requirements > Flow 1 (lines ~181-195)"
- **Tests:** `e2e/p526-point-image.spec.ts`
- **Depends on:** Tasks 3, 4, 5
- **Verify:** Create with image → visible on detail; without image → unchanged; upload failure → text-only with toast
- [ ] Complete

**Total tasks:** 8 | **Can parallelize:** Tasks 1, 2, 3 (no shared deps) | **Sequential:** 2→4→6→7, 3→5→7, 3→8
