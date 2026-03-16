---
status: today
type: story
rank: 1.0
tags:
  - points
  - images
  - upload
  - gcs
delivery_stage: 2-ux-review
created_date: 2026-03-16
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: null
  alignment: null
---

# P526: Point Supporting Images

**Prior art:** P504 (Auto-Generated Banners), P519 (Remove On-Page Banners from Stories & Points)
**Related:** P523 (Standalone Point Creation & Point Evolution) — coordinate, no hard dependency

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
- Thumbnail in list: `w-12 h-12` (48px) to save horizontal space
- "Add image" button: full width below textarea, larger touch target (`h-10`)
- Author controls (Change/Remove): always visible below image (no hover on touch)
- Lightbox: full screen, close button top-right, pinch-to-zoom

**Tablet (768px–1023px):**
- Same as mobile layout (cards are already `max-w-lg` centered)

**Desktop (1024px+):**
- Image: `max-h-64` (256px), constrained to card width
- Thumbnail in list: `w-16 h-16` (64px)
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
| Skeleton loading | **Reuse** | `src/app/components/ui/skeleton.tsx` — existing Skeleton component | No |
| Author controls (Change/Remove) | **New** | Small inline buttons, standard `<Button variant="ghost" size="sm">`. No new component needed — just buttons. | No |

**Decisions requiring founder input:** None — all patterns follow existing conventions.

---

## Next Steps

1. ~~**`/challenge-prd`**~~ — done. Verdict: RETHINK (strategic timing). Founder override: proceeding. OG demoted to future, "reasoning" → "evidence", kill signal added.
2. ~~**`/ux`**~~ — done. Image below statement inside card, camera icon upload button, Dialog lightbox, no caption field.
3. **`/architect`** — GCS bucket, signed URL parameterization, DB schema, RLS, client-side resize, cleanup strategy
4. **`/generate-tests`** → **`/spec-review`** → **`/decompose`** (if complex enough) → **`/dev`**
