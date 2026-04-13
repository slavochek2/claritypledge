---
status: done
completed_at: '2026-03-27'
type: story
rank: 2
tags:
  - stories
  - images
  - upload
  - gcs
delivery_stage: 5-decomposed
created_date: 2026-03-26T00:00:00.000Z
prepped_date: null
flow: dev
reviews:
  ux: null
  architect: done
  alignment: null
uat_file: features/uat/p591.md
test_files:
  - src/tests/image-upload.test.ts
  - e2e/integration/p591-story-image-migration.spec.ts
  - e2e/p591-story-supporting-images.spec.ts
  - e2e/a11y/p591-accessibility.spec.ts
locked_at: '2026-03-26T14:22:34.875Z'
---

# P623: Story Supporting Images

**Prior art:** P504 (Auto-Generated Banners), P519 (Remove On-Page Banners), P526 (Point Supporting Images — rejected)
**Supersedes:** P526 — rejected because P523's immutability model conflicts with editable image metadata on points. This spec moves the concept to stories, which are mutable and the natural container for rich media.

---

## Problem Statement

**Current state:** Stories are text-only. The only visual element stories ever had — AI-generated banners from P504 — was removed from on-page display by P519 because those banners were disconnected decorative blocks with no informational value. The `banner_url` column still exists and serves OG social sharing, but it's auto-generated and not author-chosen. Stories have no way for an author to include a meaningful visual.

**Pain points:**
- **Some stories need visual context to land.** Nejc and Jan flagged that certain narratives are hard to engage with as pure text. A story about a product's UX needs a screenshot. A story about a trend needs a chart. A story about a location needs a photo. Without images, the author must describe what they could simply show.
- **The P504/P519 lesson created a gap.** P519 correctly removed meaningless auto-generated banners. But "no image at all" is wrong when the author has a meaningful image to share. The gap is author-chosen supporting visuals — images that carry meaning because the author selected them to illustrate their narrative.
- **Points should stay lean.** P526 tried to add images to points but conflicted with P523's immutability model. Points are atomic claims — their power is in being comparable and lightweight. Stories are the reasoning layer where visual evidence belongs.

**Who's affected:**
- **Story creators** — anyone who wants to strengthen their story with visual context
- **Story readers** — viewers who would understand the story faster with visual evidence

---

## Intention (Why This Matters)

**Strategic importance:** ClarityPledge's core loop is "tell your story, make claims, stake positions." Stories are the narrative container — the place where an author builds context for their points. An author-chosen image (a chart, a screenshot, a photo) contextualizes the narrative in ways text alone cannot.

**Why now:**
1. **Workshop facilitation need.** Founder observes repeatedly in real interactions that participants need images to grasp stories — text alone doesn't land for visual concepts (charts, UX screenshots, diagrams). This directly serves the false-belief curriculum (P567) and H-WTP-Pain testing.
2. Direct user feedback (Nejc and Jan) — real users asking for visual support, not speculative
3. GCS infrastructure already exists — the signed-URL pattern from audio uploads is proven and reusable
4. P519 removed the only visual element from stories on-page, leaving them entirely text-based — this restores visual capability, but with author intent instead of AI generation
5. P526 was rejected, proving that images belong on stories (mutable, narrative container), not points (immutable, atomic claims)

**Impact if not solved:** Stories remain text-only. Authors who need visual context either (a) describe images in words, (b) skip creating the story entirely, or (c) link to external images in the text body (no preview, bad UX).

---

## Business Requirements

**Must-haves:**
1. Story creator can optionally upload a single image when creating a story
2. Story creator can add an image to an existing story that has none
3. Story creator can replace the image with a different one
4. Story creator can remove the image, reverting to text-only
5. Image displays inline on the story detail page, below the title/above the body text
6. Viewers can expand the image to see it at full resolution
7. Upload accepts JPEG, PNG, and WebP formats, max 5MB
8. Images are resized client-side to max 1200px on the longest edge before upload
9. Non-authors cannot add, change, or remove the image on someone else's story

**Success conditions:**
- A user can go from "I want to add an image to this story" to "image is visible on the story" in under 30 seconds
- Image adds to the story's meaning — it is the author's chosen visual, not a generated decoration

**Constraints:**
- Single image per story (not a gallery) — simplicity first, expand later if validated
- Image is optional — most stories will remain text-only
- No moderation system in V1 (tiny user base; revisit when needed)
- Storage uses GCS (free via existing $25k GCP credits), not Supabase Storage
- The existing `banner_url` column on stories (P504, used for OG sharing) is a separate concern — this feature adds a new author-chosen image, not a replacement for the auto-generated OG banner
- **Image is a story-level attribute, not a version-level one.** Adding/replacing/removing an image does NOT create a new story version. Versions track text content; image is supplementary metadata (same pattern as `banner_url`). Verifications reference text versions; the image is orthogonal.
- **HEIC strategy: client-side conversion.** Use `heic2any` (or equivalent) to convert HEIC → JPEG on upload. Rejecting the default iPhone format would fail the mobile user story.
- **GCS orphan cleanup: lifecycle policy.** Objects not linked to a story `image_url` after 24h are eligible for deletion via GCS lifecycle rule. No manual cleanup needed.
- **Image replacement is atomic.** Old image URL is not cleared until the new upload succeeds and the DB update completes. On failure, the old image remains.

---

## User Stories

**As a story creator adding visual context:**
- I want to upload a supporting image when I create a story, so readers can see the evidence behind my narrative
- I want to add an image to a story I already created, so I can strengthen it with visual context I found later
- I want to change the image on my story, so I can replace it with a better visual if I find one
- I want to remove the image from my story, so I can revert to text-only if the image isn't adding value

**As a story reader:**
- I want to see the author's image on the story page, so I can understand the visual context they intended
- I want to click/tap the image to see it full-size, so I can examine details (charts, screenshots, fine print)

**As a mobile user:**
- I want to upload a photo from my camera roll, so I can add visual evidence from my phone without resizing or converting manually

---

## Jobs to Be Done

**When my story needs visual evidence to be convincing:**
- I want to attach a screenshot, chart, or photo, so readers see what I'm talking about instead of me having to describe it in words (motivation: making my narrative stronger)

**When I find a better visual after creating my story:**
- I want to swap the image without recreating the story, so my story stays stable while the supporting visual improves (motivation: iteration without disruption)

**When an image doesn't actually help my story:**
- I want to remove it cleanly, so the story goes back to text-only without any residual broken state (motivation: keeping content clean)

---

## Outcomes (Success Metrics)

**Adoption metric:**
- What percentage of newly created stories include an image? (Baseline: 0%. **Kill signal:** if <5% of stories include images after 30 days of availability, the feature did not validate the need — revisit whether image support is worth maintaining.)

**Quality signal:**
- Do stories with images receive more engagement (position-taking on linked points, time-on-page) than text-only stories? (Observe after sufficient volume, no A/B test needed at this scale.)

**Operational metrics (monitor, no targets):**
- Upload failure rate (should be near-zero; investigate if above 5%)
- Average image file size after client-side resize
- Orphaned GCS files (uploaded but not linked to a story in DB)

---

## Acceptance Criteria

- [ ] Story creation form includes an optional "Add image" action
- [ ] Supported formats: JPEG, PNG, WebP; max 5MB; clear error if wrong format or too large
- [ ] HEIC files from iPhone are converted client-side to JPEG before upload (via heic2any or equivalent)
- [ ] Image is resized client-side before upload so no image exceeds 1200px on its longest edge
- [ ] Upload shows progress indication — user knows the upload is happening and when it completes
- [ ] Upload failure (network drop, timeout) shows a clear error with a retry option — story creation is not blocked
- [ ] Story detail page displays the image below the title, above the body text
- [ ] Image renders well regardless of aspect ratio (portrait, landscape, square) — no stretching, no cropping; max display height 400px, width constrained to content column; extreme ratios (>3:1 or <1:3) handled gracefully
- [ ] Clicking/tapping the image opens a full-resolution view (lightbox or equivalent)
- [ ] Story author can add an image to an existing story that has none
- [ ] Story author can replace the image on a story with a different one
- [ ] Story author can remove the image from a story, reverting to text-only
- [ ] Non-authors cannot add, change, or remove the image on someone else's story
- [ ] Image upload works in the current story creation flow
- [ ] If the story's DB save fails after the image was already uploaded, the user sees a clear error — the orphaned file does not cause visible problems
- [ ] Existing `banner_url` (OG sharing) continues to work independently of the new author-chosen image

---

## Out of Scope

- Image gallery (multiple images per story) — V1 is single image only
- Image moderation / content filtering — tiny user base, add when needed
- OG image from author-chosen image — the existing `banner_url` handles OG; consider swapping in a future iteration if validated
- Image support on points — rejected in P526; revisit only if story images validate the need
- AI-generated image suggestions — this feature is about author intent, not AI generation

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Upload button label | "Add image" | Story creation/edit form |
| Replace action | "Change image" | Visible to author on existing story with image |
| Remove action | "Remove image" | Visible to author on existing story with image |
| Upload error toast | "Upload failed. Please try again." | Network/timeout error |
| Format error | "Please use JPEG, PNG, or WebP format (max 5MB)" | Wrong format or size |
| HEIC conversion | Silent — converted to JPEG automatically | No user-facing message needed |
| Progress indicator | Spinner or progress bar during upload | Upload in progress |

---

## UX Design

### User Flow 1: Add Image During Story Creation

**Entry:** User navigates to `/create` (story creation page).

1. User writes story text in the existing textarea
2. Below the textarea, user sees an "Add image" button (ghost style, with image icon) — secondary action, does not compete with the primary "Publish Story" CTA
3. User taps "Add image" → native file picker opens (accepts `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`)
4. User selects a file from device
5. **Client-side processing** (invisible to user):
   - If HEIC → converted to JPEG silently via heic2any
   - If >5MB after conversion → error toast: "Please use JPEG, PNG, or WebP format (max 5MB)"
   - Image resized to max 1200px longest edge
6. **Upload begins** → "Add image" button replaced by inline image preview (thumbnail) with a progress spinner overlay
7. **Upload completes** → spinner disappears, preview shows the uploaded image with "Change image" and "Remove" (X) actions
8. User clicks "Publish Story" → story saved with `image_url` reference
9. Redirected to story detail page → image visible below title

**Abort path:** User can click "Remove" (X) on the preview at any time before publishing to revert to text-only.

### User Flow 2: Add/Change/Remove Image on Existing Story

**Entry:** Author views their own story on `/story/:id` detail page.

1. Author sees their story with an "Add image" action in the author controls area (near existing edit/delete actions)
2. If story has no image → "Add image" button shown
3. If story already has an image → image displayed with "Change image" and "Remove image" actions visible on hover/tap (author only)
4. **Add/Change:** Same file picker → processing → upload flow as creation (steps 3-7 above)
5. **Replace atomicity:** During replacement, the current image stays visible. New image preview appears only after upload succeeds. On success, old image is swapped out. On failure, old image remains unchanged.
6. **Remove:** Author clicks "Remove image" → confirmation via toast with undo (not a dialog — too heavy for this action). Image disappears immediately from UI; undo within 5 seconds restores it. After 5 seconds, DB update fires.

**Non-author view:** Visitors see the image (if present) but no add/change/remove controls.

### User Flow 3: View and Expand Image (Reader)

**Entry:** Any user views a story with an image on `/story/:id`.

1. Image renders below the title/metadata line, above the story body text
2. Image is displayed at content-column width (max ~672px on desktop, full-width on mobile), with `max-height: 400px` and `object-fit: contain` — no cropping, no stretching
3. Image has a subtle rounded border (`rounded-lg`) matching the card aesthetic
4. **Tap/click to expand:** Image is clickable → opens full-resolution lightbox overlay
5. **Lightbox:** Dark backdrop, image centered at native resolution (up to viewport bounds), close via X button, backdrop click, or Escape key. Pinch-to-zoom on mobile.
6. **Story cards** (feed, profile, point-detail): Image shown as a compact preview (max-height 200px) above the text snippet. Clickable — navigates to story detail (not lightbox).

### Screen Designs

**Story Creation Page (`/create`)**

```
┌──────────────────────────────────────┐
│ ← Back                               │
│                                       │
│ Share a Story                         │
│ Write a perspective. Others verify... │
│                                       │
│ ┌──────────────────────────────────┐  │
│ │ Your story                       │  │
│ │ [textarea - existing]            │  │
│ │                                  │  │
│ └──────────────────────────────────┘  │
│ 42 characters · aim for under 280...  │
│                                       │
│ ┌──────────────────────────────────┐  │
│ │ 🖼 Add image (optional)          │  │  ← ghost button, left-aligned
│ └──────────────────────────────────┘  │
│                                       │
│  — OR after image selected: —         │
│                                       │
│ ┌──────────────────────────────────┐  │
│ │ ┌────────────────────────────┐   │  │
│ │ │      [image preview]       │   │  │
│ │ │      max-h: 200px          │   │  │
│ │ └────────────────────────────┘   │  │
│ │  Change image · ✕ Remove         │  │  ← text links below preview
│ └──────────────────────────────────┘  │
│                                       │
│ [Publish Story]                       │  ← primary CTA unchanged
└──────────────────────────────────────┘
```

**Story Detail Page (`/story/:id`) — with image**

```
┌──────────────────────────────────────┐
│ ← Back                    [⋮ actions] │
│                                       │
│ 👤 Author Name · 2h ago 🌐            │
│                                       │
│ ┌──────────────────────────────────┐  │
│ │                                  │  │
│ │       [supporting image]         │  │  ← full content width
│ │       max-h: 400px               │  │     object-fit: contain
│ │       click → lightbox           │  │     rounded-lg border
│ │                                  │  │
│ └──────────────────────────────────┘  │
│                                       │
│ Story body text goes here. The image  │
│ sits between metadata and body text.  │
│                                       │
│ #tags                                 │
│ ──────────────────────────────────── │
│ Linked Points                         │
│ ...                                   │
└──────────────────────────────────────┘
```

**Author controls (on their own story with image):**

```
│ ┌──────────────────────────────────┐  │
│ │       [supporting image]         │  │
│ │                                  │  │
│ │     (hover/tap shows overlay)    │  │
│ │     [Change image] [Remove]      │  │  ← semi-transparent overlay
│ └──────────────────────────────────┘  │
```

**Story Card (feed/profile) — compact with image:**

```
┌────────────────────────────────┐
│ 👤 Author · 2h ago 🌐          │
│ ┌────────────────────────────┐ │
│ │    [image preview]         │ │  ← max-h: 200px, rounded
│ │    200px max               │ │
│ └────────────────────────────┘ │
│ Story text preview...          │  ← line-clamp-5
│ #tags                          │
│ 📌 2 points · 👂 3 understood  │
└────────────────────────────────┘
```

### Edge Cases

**Format/size errors:**
- Wrong format detected client-side → toast: "Please use JPEG, PNG, or WebP format (max 5MB)"
- File >5MB after HEIC conversion → same toast
- HEIC conversion failure (rare, corrupted file) → toast: "Could not process this image. Try a different file."

**Upload failure:**
- Network drop mid-upload → toast: "Upload failed. Please try again." Image preview reverts to "Add image" button. Story text is NOT lost.
- Story creation is never blocked by image upload failure — user can publish text-only and add image later.

**Loading states:**
- During upload: image preview area shows the selected image with a spinner overlay and subtle opacity reduction (0.6). User can still edit text while upload proceeds.
- During HEIC conversion: same spinner — conversion is fast (<2s for typical photos) but visible.

**Empty states:**
- No image on story → no image area rendered. No placeholder, no "add image" prompt to readers. The page is text-only, matching current behavior exactly.
- Author's own story without image → "Add image" appears in author controls area.

**Extreme aspect ratios:**
- Panoramic (>3:1): Renders at full content width, height determined by `object-fit: contain` within max-height. May appear as a thin strip — acceptable for charts/screenshots.
- Tall portrait (<1:3): Renders at max-height 400px (detail) or 200px (card), width determined by aspect ratio. Left-aligned within content column, not centered.
- Tiny images (<100px): Rendered at natural size, not upscaled. Left-aligned, not stretched to fill.

**Image replacement mid-flight:**
- User clicks "Change image" while previous image is displayed → file picker opens → new file selected → new upload begins with spinner on the new preview → old image still visible underneath until new upload completes → swap on success.
- If new upload fails → old image remains, toast: "Upload failed. Please try again."

**Story save failure after image upload:**
- Image already uploaded to GCS, but story DB save fails → toast: "Save failed. Please check your connection and try again." Orphaned GCS file handled by 24h lifecycle policy. User can retry — same image is re-uploaded (simple, no caching of GCS URL client-side).

### Accessibility

**Screen reader:**
- Image has `alt` attribute set to "Supporting image for [story author]'s story" (author name from data)
- "Add image" button: `aria-label="Add a supporting image to your story"`
- "Change image": `aria-label="Replace the current image"`
- "Remove image": `aria-label="Remove the image from this story"`
- Upload progress: `aria-live="polite"` region announces "Uploading image..." and "Image uploaded"
- Lightbox: `role="dialog"`, `aria-label="Full-size image view"`, focus trapped within

**Keyboard navigation:**
- "Add image" button is in natural tab order after the textarea
- Image preview: Tab reaches "Change image" and "Remove" links
- Lightbox: Opens on Enter/Space when image is focused, closes on Escape
- File picker: Triggered by Enter/Space on "Add image" button (native browser behavior)

**Color contrast:**
- All text actions ("Add image", "Change image", "Remove") use `text-muted-foreground` on `bg-background` — meets WCAG AA
- Upload spinner uses `blue-500` — visible against image preview with opacity overlay
- Error toasts use existing Sonner styling (already AA compliant)

**Focus indicators:**
- "Add image" button: standard shadcn/ui focus ring
- Image in detail view: `focus-visible:ring-2 ring-blue-500 ring-offset-2` (indicates clickable for lightbox)
- Lightbox close button: visible focus ring

### Responsive Design

**Mobile (320px–767px):**
- Image preview in creation form: full-width minus padding (100% of content column)
- Image in story detail: full-width, max-height 300px (reduced from 400px to preserve scroll context)
- Image in story cards: full-width, max-height 160px
- "Change image" and "Remove" actions: visible below image (not hover overlay — no hover on touch)
- Lightbox: full-screen with pinch-to-zoom
- File picker: opens native camera roll on iOS/Android
- Touch targets: all actions ≥44px height

**Tablet (768px–1023px):**
- Same as mobile layout — story pages are single-column at all breakpoints (max-w-2xl)
- Image max-height: 400px (same as desktop)

**Desktop (1024px+):**
- Content column maxes at ~672px (existing `max-w-2xl` constraint)
- Image max-height: 400px
- Author controls on image: hover overlay with "Change image" / "Remove image" buttons
- Lightbox: centered modal with backdrop, max image dimensions limited to viewport minus 48px padding

---

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Upload button label | "Add image" | Story creation/edit form, ghost style with ImagePlus icon |
| Upload button sublabel | "(optional)" | Muted text after button label |
| Replace action | "Change image" | Visible to author on existing story with image |
| Remove action | "Remove image" | Visible to author on existing story with image |
| Upload error toast | "Upload failed. Please try again." | Network/timeout error |
| Format error toast | "Please use JPEG, PNG, or WebP format (max 5MB)" | Wrong format or size |
| HEIC conversion | Silent — converted to JPEG automatically | No user-facing message needed |
| HEIC conversion failure toast | "Could not process this image. Try a different file." | Corrupted HEIC |
| Progress indicator | Spinner overlay on image preview, opacity 0.6 | Upload in progress |
| Upload progress screen reader | "Uploading image..." / "Image uploaded" | aria-live="polite" region |
| Image alt text | "Supporting image for [author name]'s story" | Detail page and cards |
| Lightbox aria-label | "Full-size image view" | Lightbox dialog |
| Remove undo toast | "Image removed" with "Undo" action, 5s timeout | After removing image |

---

## Technical Architecture

### Technical Analysis

**Database schema — stories table:**
- `stories` table (`supabase/migrations/20260204_stories_points_calibration.sql`) has `banner_url` column (added in `20260313141528_p504_banner_columns.sql`) for OG sharing. No `image_url` column exists yet.
- `Story` type (`src/app/types/index.ts:933`) has `bannerUrl?: string`. New `imageUrl?: string` field needed.
- `StoryWithAuthor` extends `Story` — inherits automatically.
- `StoryWithPoints` extends `StoryWithAuthor` — inherits automatically.
- `DbStoryWithAuthor` interface in `stories-service-real.ts:28` needs `image_url` added.
- `DbStory` type in `types/index.ts` needs `image_url` added.
- Prototype `Story` type (`prototype-types.ts:34`) uses `.text` not `.content` and lacks `imageUrl` — needs optional `imageUrl` for feed cards that consume it.

**Existing GCS infrastructure:**
- **Cloud Function:** `cloud-functions/gcs-signed-url/index.js` — deployed at `us-central1-gen-lang-client-0869694595.cloudfunctions.net/gcs-signed-url`. Generates v4 signed upload URLs for `claritypledge-ml-training` bucket. Currently scoped to `sessions/{code}/{fileName}` path pattern. Needs extension for story images.
- **Client upload pattern:** `src/app/data/api.ts:2681` — `getSignedUploadUrl()` calls the Cloud Function, `uploadToGCS()` PUTs to the signed URL. Both have retry with exponential backoff. Proven pattern, reusable.
- **GCP project:** `gen-lang-client-0869694595` with $25k credits on `slava@inguro.com`.

**Story creation flow (`create-story-page.tsx`):**
- Simple form: textarea + submit. No file upload infrastructure. Image upload widget needs to be added between textarea and submit button.
- `handleSubmit` calls `storiesService.createStory()` which returns `Story | null`. Image upload should happen before or in parallel with story creation, with the GCS URL passed to `createStory()`.

**Story detail page (`story-detail-page.tsx`):**
- Uses `StoryCardDetail` for display. Image would render inside StoryCardDetail between author row and text.
- Author controls (edit, delete) exist — image add/change/remove actions fit alongside these.
- SEO component already handles OG meta via `banner_url`.

**Story cards in feeds:**
- `feed-story-card.tsx` — used on `/` feed. Compact card, needs image preview (max-h 200px).
- `story-card-with-links.tsx` — used on profile pages and point-detail. Also needs image preview.
- `StoryCardDetail.tsx` — detail view card. Needs full image display (max-h 400px) with lightbox.

**Dependencies needed:**
- `heic2any` — HEIC-to-JPEG client-side conversion. ~45KB gzipped. Lazy-loaded (only when user selects an HEIC file).
- No lightbox library needed — a simple dialog/overlay component suffices (existing shadcn Dialog can be adapted, or a thin custom component for image-specific behavior like pinch-to-zoom).

### Architecture Decisions

**AD-1: New GCS bucket vs reuse `claritypledge-ml-training`**
- **Decision:** Create a new bucket `claritypledge-story-images` with 24h lifecycle rule for orphan cleanup.
- **Rationale:** Separation of concerns — ML training data and user-facing content have different access patterns, lifecycle policies, and security requirements. The ML bucket has no lifecycle rules; story images need aggressive orphan cleanup. Different CORS requirements (story images need public read access; ML data is private).
- **Rejected:** Reusing `claritypledge-ml-training` with a `story-images/` prefix — lifecycle rules are bucket-level, can't scope to prefix for the 24h cleanup without also affecting ML data.

**AD-2: Upload path — Cloud Function signed URL vs direct Supabase Storage**
- **Decision:** Extend existing GCS Cloud Function pattern. Add a `type` parameter to the signed URL function to support `story-image` uploads alongside `session` uploads.
- **Rationale:** Proven pattern already in production (audio uploads). Uses free GCP credits. Cloud Function provides server-side validation (content type, file size) before granting write access. Supabase Storage is an alternative but would use Supabase bandwidth/storage quotas instead of free GCP credits.
- **Rejected:** Supabase Storage — costs money, GCS is free with existing credits. Direct GCS upload without signed URL — requires exposing service account credentials to client.

**AD-3: Image upload timing — before vs after story creation**
- **Decision:** Upload to GCS first (get public URL), then pass URL with `createStory()` / `updateStory()`. Two-step: (1) upload → get URL, (2) save story with URL.
- **Rationale:** Simpler client logic. If upload fails, user retries upload without losing story text. If story save fails after upload, orphan is cleaned by 24h lifecycle. Atomic replacement on edit: new upload completes before old URL is cleared.
- **Rejected:** Single-step via edge function — adds complexity for no benefit. Background upload after story save — user can't see image on redirect, confusing UX.

**AD-4: Public read access pattern**
- **Decision:** GCS bucket with uniform public read access (allUsers:objectViewer). Images are public URLs, no signed read URLs needed.
- **Rationale:** Story images are on public stories — no access control needed for reads. Public URLs are faster (no signed URL expiry, CDN-cacheable). Signed read URLs would add latency and complexity for zero security benefit.
- **Rejected:** Signed read URLs — unnecessary overhead for public content. Supabase Storage public bucket — same outcome but uses Supabase quota.

**AD-5: Client-side image processing approach**
- **Decision:** Process entirely client-side: HEIC detection by MIME type or `.heic` extension → `heic2any` conversion → canvas resize to max 1200px → output as JPEG (quality 0.85). Lazy-load `heic2any` only when an HEIC file is selected.
- **Rationale:** No server-side processing needed. Canvas API is universally supported. JPEG output ensures smallest file size for photos. Lazy-loading `heic2any` (~45KB) avoids bundle bloat for users who never upload HEIC.
- **Rejected:** Server-side processing via edge function — adds latency, complexity, and server cost for something the browser handles natively.

**AD-6: Image URL storage — story-level, not version-level**
- **Decision:** `image_url` column on `stories` table directly (same pattern as `banner_url`). Image changes do NOT create story versions.
- **Rationale:** Per spec constraint. Versions track text content for verification integrity. Image is supplementary metadata — verifications reference text, not images.

**AD-7: Lightbox implementation**
- **Decision:** Thin custom component (no library). A full-screen overlay with `<img>` at native resolution, close on Escape/backdrop click, CSS `object-fit: contain` for sizing. No pinch-to-zoom library in V1 — native browser zoom on mobile handles this adequately.
- **Rationale:** A lightbox library (e.g., yet-another-react-lightbox) adds ~15KB for single-image display. A ~60-line component covers all requirements. Pinch-to-zoom can be added later if users request it.
- **Rejected:** react-medium-image-zoom — nice but another dependency for a simple need. Shadcn Dialog — close, but Dialog's padding and animation don't suit full-bleed image display.

**AD-8: Orphan cleanup mechanism**
- **Decision:** No automatic cleanup in V1. Orphans accumulate at negligible cost (free GCP credits, <5MB per orphan, low upload volume). Add cleanup script if storage exceeds 1GB.
- **Why not lifecycle:** GCS lifecycle rules are bucket-level — `age: 1` would delete active images too, not just orphans. Prefix-based separation adds complexity for negligible gain at current scale.

### Security Review

**RLS Policies:**
- ✅ The `stories` UPDATE policy (`"Authors can update own stories"`) restricts updates to `auth.uid() = author_id` on both USING and WITH CHECK clauses (P586 migration). The new `image_url` column inherits this protection — no additional column-level RLS needed.
- ✅ The `stories` SELECT policy is visibility-scoped: public stories readable by all, private by author only. `image_url` returned in SELECT results correctly — if you can read the story, you see its image.

**Authentication:**
- ⚠️ **The existing `gcs-signed-url` Cloud Function has NO authentication.** It accepts requests without JWT or API key validation. For story images, this is unacceptable — any caller could generate upload URLs.
- ✅ **Resolution:** Create a new **Supabase Edge Function** (`generate-story-image-url`) following the `generate-banner` pattern, which properly validates JWTs via `anonClient.auth.getUser(token)` and verifies story ownership. Do NOT extend the unauthenticated Cloud Function.

**Authorization:**
- ⚠️ **Signed URL generation must verify story ownership.** The edge function must accept `storyId`, verify the authenticated user is the `author_id` (query `stories` with `.eq('author_id', userId)`), then issue the signed URL. Pattern: `generate-banner/index.ts` lines 198-220.
- ✅ Image removal via `updateStory()` is protected by RLS (only author can UPDATE). Old GCS file becomes an orphan — acceptable per spec (no lifecycle rule in V1, revisit at 1GB).

**Input Validation:**
- ⚠️ **Server-side MIME type allowlist required.** Client controls `contentType` in signed URL requests. The edge function must validate against allowlist: `image/jpeg`, `image/png`, `image/webp` only. **SVG explicitly blocked** (can contain embedded JavaScript).
- ⚠️ **Server-side file size enforcement.** Signed URL must include `X-Goog-Content-Length-Range: 1,5242880` (1 byte to 5MB) in extension headers. Prevents oversized uploads even if client validation is bypassed.
- ⚠️ **GCS path generated server-side.** Path format: `story-images/{storyId}/{uuid}.{ext}` — client never controls the storage path. Prevents path traversal.

**Data Protection:**
- ⚠️ **Private story image URLs bypass visibility RLS.** GCS public-read bucket means image URLs are accessible to anyone who knows the URL. For private stories, the image URL (once obtained via browser cache, network logs) bypasses story visibility. **Accepted as V1 limitation** — tiny user base, private stories are rare, revisit with signed read URLs if privacy becomes critical.
- ✅ Image URLs use UUID-based paths — not guessable.
- ⚠️ **CORS must be restricted** to `claritypledge.com` and `localhost:5173` — not wildcard `*`. Configured on the GCS bucket, not in the edge function.

**Signed URL Security:**
- ✅ Upload-only signed URLs (`action: 'write'`) — cannot read or delete other objects.
- ⚠️ **Expiry tightened to 5 minutes** (not 15). Single image upload (<5MB) completes in seconds. Shorter window reduces URL reuse risk.
- ⚠️ **Content-Type locked in signed URL.** Edge function validates type against allowlist, then passes validated type to `getSignedUrl()`. Client cannot override.

**Critical Items Summary:**
1. **New Supabase Edge Function** (`generate-story-image-url`) — authenticated, ownership-verified. Do NOT reuse unauthenticated `gcs-signed-url` Cloud Function.
2. **Server-side MIME allowlist** — `image/jpeg`, `image/png`, `image/webp` only.
3. **Server-side size enforcement** — `X-Goog-Content-Length-Range` header.
4. **CORS restricted** to `claritypledge.com` + `localhost:5173`.
5. **Private image leakage** — accepted V1 limitation.

### Implementation Approach

#### Build Sequence

1. **DB migration** — Add `image_url TEXT` column to `stories` table (nullable, no default). Update RLS: existing policies already cover the column (row-level, not column-level).
2. **GCS setup** — Create `claritypledge-story-images` bucket with public read access, CORS configured for `claritypledge.com` + `localhost:5173`. No lifecycle rule.
3. **Supabase Edge Function** — New `generate-story-image-url` edge function (NOT extending existing unauthenticated `gcs-signed-url`). Pattern: `generate-banner/index.ts`. Validates JWT, verifies story ownership (`author_id`), server-side MIME allowlist (`image/jpeg`, `image/png`, `image/webp`), generates GCS path server-side (`story-images/{storyId}/{uuid}.{ext}`), returns V4 signed upload URL with 5-min expiry and `X-Goog-Content-Length-Range: 1,5242880`.
4. **Client image processing utility** — New `src/lib/image-upload.ts`: HEIC detection, lazy `heic2any` import, canvas resize, format validation, size validation. Returns processed `Blob` + metadata.
5. **Image upload service** — New `src/app/data/story-image-service.ts`: `uploadStoryImage(storyId, file)` → calls Cloud Function for signed URL → uploads processed blob → returns public GCS URL. Follows `api.ts` retry pattern.
6. **Type updates** — Add `imageUrl?: string` to `Story`, `DbStory`, `DbStoryWithAuthor` interfaces, prototype `Story` type. Update `mapStoryFromDb()` to include `image_url`.
7. **Service updates** — `StoriesService.createStory()` accepts optional `imageUrl`. `updateStory()` accepts `imageUrl` (string to set, null to remove). Update interface, real service, and mock service.
8. **ImageUploadWidget component** — Reusable component for create-story-page and story-detail-page. Handles file selection, processing, upload, preview, change, remove. Manages upload state (idle/processing/uploading/done/error).
9. **StoryImage component** — Display component used in StoryCardDetail, feed-story-card, story-card-with-links. Handles aspect ratio constraints, lightbox trigger, alt text.
10. **ImageLightbox component** — Full-screen overlay for expanded image view. Escape/backdrop close. Focus trap.
11. **Create story page integration** — Add ImageUploadWidget between textarea and submit button. Pass `imageUrl` to `createStory()`.
12. **Story detail page integration** — Show StoryImage in StoryCardDetail. Author controls for add/change/remove.
13. **Feed card integration** — Compact image preview in feed-story-card and story-card-with-links.
14. **Analytics events** — Track `story_image_uploaded`, `story_image_removed`, `story_image_viewed` (lightbox opened).

#### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDDHHMMSS_p591_story_image_url.sql` | Add `image_url TEXT` column to `stories` |
| `src/lib/image-upload.ts` | Client-side HEIC conversion, resize, validation |
| `src/app/data/story-image-service.ts` | GCS upload orchestration (signed URL + PUT) |
| `src/app/components/shared/image-upload-widget.tsx` | Upload widget with preview, progress, change/remove |
| `src/app/components/shared/story-image.tsx` | Image display with aspect ratio handling |
| `src/app/components/shared/image-lightbox.tsx` | Full-screen image viewer overlay |
| `supabase/functions/generate-story-image-url/index.ts` | Edge function: JWT auth, ownership check, MIME validation, GCS signed URL (pattern: `generate-banner`) |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/types/index.ts` | Add `imageUrl?: string` to `Story`, `DbStory` |
| `src/app/components/shared/prototype-types.ts` | Add `imageUrl?: string` to prototype `Story` |
| `src/app/data/stories-service.interface.ts` | Add `imageUrl` to `createStory()` params and `updateStory()` updates |
| `src/app/data/stories-service-real.ts` | Map `image_url` in `DbStoryWithAuthor`, `mapStoryFromDb()`, `createStory()`, `updateStory()` |
| `src/app/data/stories-service-mock.ts` | Mirror interface changes |
| `src/app/pages/create-story-page.tsx` | Add ImageUploadWidget, pass `imageUrl` to `createStory()` |
| `src/app/pages/story-detail-page.tsx` | Add StoryImage to detail view, author image controls |
| `src/app/components/social/StoryCardDetail.tsx` | Render StoryImage between author row and text |
| `src/app/components/social/story-card-with-links.tsx` | Render compact StoryImage in card body |
| `src/app/components/feed/feed-story-card.tsx` | Render compact StoryImage above text |
| `package.json` | Add `heic2any` dependency |

---

## Pre-deploy Checklist

### Secrets to provision
- GCS service account key needs to be available to the Supabase Edge Function. Check if existing `generate-banner` function's GCS credentials are reusable (likely — same GCP project).

### Deploy commands
- [ ] Deploy new Edge Function: `SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy generate-story-image-url --project-ref besjtuodziykmjidubzw --no-verify-jwt`
- [ ] Create GCS bucket: `gsutil mb -l us-central1 gs://claritypledge-story-images && gsutil iam ch allUsers:objectViewer gs://claritypledge-story-images`
- [ ] Set CORS on bucket: `gsutil cors set <cors-config.json> gs://claritypledge-story-images`
- [ ] Run DB migration: `./scripts/migrate.sh`
- [ ] Trigger Vercel redeploy (no new VITE_* vars, but new code)

### Post-deploy verification
- [ ] Upload a JPEG image on story creation — verify it appears on detail page
- [ ] Upload an HEIC image — verify silent conversion to JPEG
- [ ] Replace image on existing story — verify atomic swap
- [ ] Remove image — verify clean revert to text-only
- [ ] Check Sentry for new errors in first 10 minutes
- [ ] Verify existing `banner_url` OG sharing still works independently

---

## Component Strategy

### Step 1 — Component Inventory

**Design system primitives (`src/components/ui/`):**
- `button.tsx` — Button with `variant: "ghost"` (used for "Add image" button)
- `dialog.tsx` — Radix Dialog with overlay, close button, focus trap, Escape close (basis for lightbox)
- `sonner.tsx` — Toaster configured bottom-center, 3s duration, close button (handles all toast messages)

**Shared feature components (`src/app/components/shared/`):**
- `confirm-dialog.tsx` — Dialog wrapper (not needed — spec uses undo toast, not confirmation dialog for remove)
- `ShareDialog.tsx` — Dialog usage pattern reference

**Story/card components (`src/app/components/social/`):**
- `StoryCardDetail.tsx` — Detail view card: author row, story text, linked points. Image slot needed between author row and text.
- `story-card-with-links.tsx` — Profile/embed card: same structure as StoryCardDetail but uses prototype `Story` type (`.text` not `.content`). Image slot needed in same position.

**Feed components (`src/app/components/feed/`):**
- `feed-story-card.tsx` — Lightweight feed card using `StoryWithAuthor`. Image slot needed above story text.

**Existing patterns — no lightbox, image upload, or file picker components exist in the codebase.**

### Step 2 — Component Map

| # | UI Element | Classification | File Path | Justification |
|---|-----------|---------------|-----------|---------------|
| 1 | "Add image" button (ghost + ImagePlus icon) | **Reuse** `Button` | `src/components/ui/button.tsx` | `variant="ghost"` matches spec. Add `ImagePlus` icon from lucide-react, "(optional)" muted sublabel as children. No extension needed. |
| 2 | Image preview with progress spinner overlay | **New** (part of ImageUploadWidget) | `src/app/components/shared/image-upload-widget.tsx` | No existing preview/upload component. Spinner uses `Loader2` from lucide-react (already imported in create-story-page). Overlay: `absolute inset-0 bg-black/40 flex items-center justify-center` with `aria-live="polite"` region. |
| 3 | "Change image" / "Remove" action links | **New** (part of ImageUploadWidget) | `src/app/components/shared/image-upload-widget.tsx` | Text buttons below preview in creation form. Uses `text-muted-foreground` per UI Contract. Separator dot between them. |
| 4 | StoryImage display (detail: max-h 400px, cards: max-h 200px/160px) | **New** | `src/app/components/shared/story-image.tsx` | No existing image display component. Handles `object-fit: contain`, `rounded-lg`, responsive max-heights, alt text per UI Contract, cursor-pointer for lightbox trigger. |
| 5 | Author overlay controls on existing story images | **New** (part of StoryImage) | `src/app/components/shared/story-image.tsx` | `StoryImage` accepts optional `onChangeImage` and `onRemoveImage` callbacks. When present, renders semi-transparent overlay on hover (desktop) or static links below image (mobile, `md:` breakpoint). |
| 6 | ImageLightbox (full-screen overlay) | **New** | `src/app/components/shared/image-lightbox.tsx` | AD-7 decided against library (~60 lines). However, **extends** Radix Dialog primitives (`DialogPortal`, `DialogOverlay`, `DialogClose`) from `src/components/ui/dialog.tsx` for free focus trap, Escape close, and backdrop animation. Custom `DialogContent` styling: `p-0`, `bg-transparent`, `max-w-none`, `max-h-none` to override default card appearance. `role="dialog"`, `aria-label="Full-size image view"` per UI Contract. |
| 7 | ImageUploadWidget (orchestration) | **New** | `src/app/components/shared/image-upload-widget.tsx` | Manages state machine: `idle` → `processing` → `uploading` → `done` → `error`. Composes: hidden `<input type="file">`, Button (ghost), preview `<img>`, Loader2 spinner, action links. Calls `image-upload.ts` for processing, `story-image-service.ts` for upload. |
| 8 | Toast messages | **Reuse** `sonner` | `src/components/ui/sonner.tsx` + `import { toast } from 'sonner'` | All error/success/undo toasts use existing Sonner infrastructure. Undo toast uses `toast("Image removed", { action: { label: "Undo", onClick: restore } })` with 5s duration override. |

### Step 3 — Composition Tree

**Create Story Page (`/create` — `create-story-page.tsx`)**
```
CreateStoryPage
├── FocusHeader (existing)
├── Textarea (existing — story text)
├── ImageUploadWidget [NEW]              ← between textarea and submit
│   ├── Button variant="ghost" (reuse)   ← "Add image (optional)" with ImagePlus icon
│   ├── <input type="file" hidden>       ← native file picker
│   ├── <img> preview                    ← after file selected
│   ├── Loader2 spinner overlay          ← during processing/upload
│   ├── "Change image" · "Remove" links  ← below preview when done
│   └── aria-live="polite" region        ← "Uploading image..." / "Image uploaded"
└── Button variant="default" (reuse)     ← "Publish Story" CTA unchanged
```

**Story Detail Page (`/story/:id` — `story-detail-page.tsx`)**
```
StoryDetailPage
├── FocusHeader (existing)
├── SEO (existing)
├── StoryCardDetail (existing, modified)
│   ├── Author row (existing)
│   ├── StoryImage [NEW]                    ← between author row and text
│   │   ├── <img> with object-fit:contain   ← max-h-[400px] desktop, max-h-[300px] mobile
│   │   ├── Author overlay controls         ← hover: "Change image" / "Remove image"
│   │   │   └── (mobile: static links below image)
│   │   └── onClick → opens ImageLightbox
│   ├── Story text (existing)
│   └── Footer (existing)
├── ImageLightbox [NEW]                     ← portal, renders when open
│   ├── DialogOverlay (reuse from dialog.tsx) ← bg-black/80
│   ├── <img> native resolution             ← max viewport - 48px padding
│   └── DialogClose (reuse) X button        ← top-right
└── ImageUploadWidget [NEW]                 ← rendered when author adds image to imageless story
    └── (same composition as create page)
```

**Story Card in Feed (`/` — `feed-story-card.tsx`)**
```
FeedStoryCard (modified)
├── Author row (existing)
├── StoryImage [NEW]                    ← between author row and text
│   ├── <img> with object-fit:contain   ← max-h-[200px] desktop, max-h-[160px] mobile
│   ├── rounded-lg                      ← matches card aesthetic
│   └── onClick → navigates to story detail (NOT lightbox)
├── Story text (existing)
└── Footer (existing)
```

**story-card-with-links.tsx** follows the same pattern as FeedStoryCard — StoryImage inserted between author info and story text, max-h-[200px], click navigates to story detail.

### Step 4 — Visual Refinements

These are implementation-level details below UX wireframe resolution:

1. **Image preview in creation form:** `rounded-lg border border-border` to match the textarea's border treatment. Preview container uses `max-h-[200px] w-full object-fit:contain bg-muted/50` (subtle background for transparent PNGs and images that don't fill the box).

2. **Spinner overlay:** `absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center` — the 40% opacity (not 60% per spec's "0.6") ensures the preview image remains recognizable while clearly communicating "in progress." The spec's "opacity 0.6" refers to the image opacity reduction; the overlay achieves the equivalent visual effect. `Loader2` icon: `className="h-8 w-8 text-white animate-spin"`.

3. **"Change image" / "Remove" links in creation form:** `text-sm text-muted-foreground hover:text-foreground transition-colors` with a `·` separator. "Remove" uses `text-destructive` on hover only (not at rest — keeps visual weight low).

4. **StoryImage focus ring for lightbox trigger:** `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer` per spec. `tabIndex={0}` so keyboard users can reach it. `role="button"` with `aria-label="View full-size image"`.

5. **Author overlay on detail page:** Desktop: `group-hover:opacity-100 opacity-0 transition-opacity` overlay with `bg-gradient-to-t from-black/60 to-transparent` at bottom of image — buttons sit inside the gradient. Mobile (below `md:`): overlay hidden, "Change image" / "Remove image" rendered as text links below the image (same pattern as creation form actions).

6. **Lightbox close button:** Top-right, `fixed` position, white `X` icon on `bg-black/50 rounded-full p-2 hover:bg-black/70`. Outside the image bounds so it doesn't obscure content.

7. **Lightbox image sizing:** `max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)] object-contain` — 24px padding on each side per spec.

8. **Feed card image spacing:** `mt-2 mb-2` between author row and image, `mb-0` between image and text (image bottom border provides visual separation).

9. **Transparent PNG handling:** All image containers use `bg-muted/50` background so transparent images don't "float" against the card background.

10. **Extreme aspect ratios — tall portraits:** Left-aligned per spec (`items-start` not `items-center`) so they anchor to the content edge rather than floating in the center. This matches the left-aligned text below.

### Step 5 — Extraction Plan

**No consolidation needed.** The three card components (`StoryCardDetail`, `story-card-with-links`, `feed-story-card`) share a visual pattern (author row + text) but have meaningfully different type signatures (`StoryWithAuthor` vs prototype `Story`), different display contexts, and different interaction models. Extracting a shared "story card body" would require a complex adapter layer that adds more code than it saves.

**StoryImage is the consolidation.** Rather than duplicating image rendering logic across three card components, `StoryImage` encapsulates all display variants (detail vs card, author controls vs viewer-only) behind props: `maxHeight`, `onClick`, `onChangeImage?`, `onRemoveImage?`, `authorName`. Each card passes its context through these props.

### Step 6 — Challenge Notes

1. **`story-card-with-links.tsx` uses prototype `Story` type which lacks `imageUrl`.** The spec's Technical Architecture (Files to Modify) already identifies this: `prototype-types.ts` needs `imageUrl?: string` added. The `StoryCardWithLinks` component receives a `Story` object that production code converts from `StoryWithAuthor` — the conversion must map `imageUrl` through. No upstream change needed to the component strategy, but the type update is a prerequisite for integration.

2. **`StoryCardDetail.tsx` has `overflow-hidden` removed (noted in code comment) to prevent dropdown menus from being clipped.** The author overlay on `StoryImage` uses `absolute` positioning within the image container, not the card — no overflow conflict. Confirmed safe.

3. **Sonner Toaster is configured with `duration={3000}` (3 seconds) globally.** The "Image removed" undo toast needs 5 seconds per UI Contract. Use `toast("Image removed", { duration: 5000, action: { label: "Undo", onClick: restore } })` — Sonner supports per-toast duration override. No Toaster config change needed.

4. **Dialog component has `max-w-lg`, padding, and card styling baked into `DialogContent`.** For the lightbox, `DialogContent` needs `className` overrides: `max-w-none p-0 border-none bg-transparent shadow-none`. The component already supports `className` via `cn()` merge. Alternatively, compose directly from `DialogPortal` + `DialogOverlay` + `DialogPrimitive.Content` for full control — this avoids fighting the default styles and produces cleaner code for an image-only overlay.

---

## Test Coverage Strategy

### Test Files

| File | Type | Tests | Coverage Area |
|------|------|-------|---------------|
| `src/tests/image-upload.test.ts` | Unit (Vitest) | 28 | HEIC detection, format validation, size validation, resize logic, conversion integration |
| `e2e/integration/p591-story-image-migration.spec.ts` | Integration (Playwright) | 8 | P270 mandatory: schema check, default NULL, RLS author/non-author, remove, banner independence, service role |
| `e2e/p591-story-supporting-images.spec.ts` | E2E (Playwright) | 17 | Visitor view, lightbox, author controls, error handling, creation flow, feed cards |
| `e2e/a11y/p591-accessibility.spec.ts` | Accessibility (Playwright) | 14 | Alt text, keyboard nav, focus rings, dialog role/trap, aria-labels, screen reader |
| `e2e/p591-smoke.spec.ts` | Smoke (Playwright) | 7 | Page loads, image renders, no broken tags, creation page button, no layout shift |
| `features/uat/p591.md` | UAT (manual) | 23 | Full user journey: upload, HEIC, replace, remove, lightbox, errors, security, edge cases |

### Acceptance Criteria → Test Mapping

| AC | Test Coverage |
|----|---------------|
| Optional "Add image" on creation form | Smoke: creation page button; E2E: button position; A11y: keyboard accessible |
| Supported formats with error on wrong | Unit: format validation (7 tests); E2E: GIF rejection toast |
| HEIC conversion | Unit: HEIC detection (4 tests), conversion integration (3 tests); UAT-3 |
| Resize to 1200px | Unit: resize logic (9 tests); UAT-4 |
| Upload progress | A11y: aria-live region; UAT-2 |
| Upload failure error + retry | E2E: upload failure (skip, /dev); UAT-17 |
| Image displays below title | E2E: visitor view; Smoke: image renders; UAT-11 |
| Aspect ratio handling | Unit: resize preserves ratio; UAT-20 |
| Lightbox on click | E2E: 4 lightbox tests; A11y: dialog role, focus trap, Escape |
| Author add/change/remove | E2E: author controls (4 tests); UAT-7/8/9 |
| Non-author cannot modify | Integration: RLS non-author blocked; E2E: visitor no controls; UAT-18/19 |
| Existing banner_url independent | Integration: banner_url unaffected; UAT-22 |

### Tests Requiring /dev Implementation

3 E2E tests are marked `test.skip` — they require GCS upload mocking (route intercept or mock service). /dev decides strategy:
- Author can add image to existing story via file picker
- Author can change image on existing story
- Upload failure shows toast and story saves without image

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: DB migration — add image_url column
- **Files:** `supabase/migrations/YYYYMMDDHHMMSS_p591_story_image_url.sql` (create)
- **Spec refs:** "Technical Architecture > Build Sequence step 1 (lines ~533)"
- **Tests:** `e2e/integration/p591-story-image-migration.spec.ts`
- **Depends on:** None
- **Verify:** Migration applies cleanly via `./scripts/migrate.sh`; integration tests pass (schema check, RLS author/non-author, banner_url independence)
- [x] Complete

### Task 2: GCS bucket setup
- **Files:** Manual CLI commands (no code file)
- **Spec refs:** "Technical Architecture > Build Sequence step 2 (lines ~534)", "Pre-deploy Checklist (lines ~584-586)"
- **Depends on:** None
- **Verify:** `gsutil ls gs://claritypledge-story-images` succeeds; CORS config verified with `gsutil cors get`
- [x] Complete

### Task 3: Supabase Edge Function — generate-story-image-url
- **Files:** `supabase/functions/generate-story-image-url/index.ts` (create)
- **Spec refs:** "Technical Architecture > Build Sequence step 3 (lines ~535)", "Security Review (lines ~494-527)"
- **Depends on:** Task 2 (bucket must exist)
- **Verify:** Edge function deployed; returns signed URL for authenticated author; rejects non-author, invalid MIME types, and unauthenticated requests
- [x] Complete

### Task 4: Client image processing utility
- **Files:** `src/lib/image-upload.ts` (create), `package.json` (modify — add `heic2any`)
- **Spec refs:** "Technical Architecture > Build Sequence step 4 (lines ~536)", "Architecture Decisions AD-5 (lines ~478-481)"
- **Tests:** `src/tests/image-upload.test.ts`
- **Depends on:** None
- **Verify:** All 28 unit tests pass (HEIC detection, format validation, size validation, resize logic)
- [x] Complete

### Task 5: Type updates + stories service updates
- **Files:** `src/app/types/index.ts` (modify), `src/app/components/shared/prototype-types.ts` (modify), `src/app/data/stories-service.interface.ts` (modify), `src/app/data/stories-service-real.ts` (modify), `src/app/data/stories-service-mock.ts` (modify)
- **Spec refs:** "Technical Architecture > Build Sequence steps 6-7 (lines ~538-539)"
- **Depends on:** Task 1 (DB column must exist for real service to map)
- **Verify:** TypeScript compiles; `imageUrl` available on `Story` type; `createStory()` and `updateStory()` accept imageUrl param
- [x] Complete

### Task 6: Image upload service
- **Files:** `src/app/data/story-image-service.ts` (create)
- **Spec refs:** "Technical Architecture > Build Sequence step 5 (lines ~537)"
- **Depends on:** Task 3 (edge function must exist), Task 4 (image processing utility)
- **Verify:** `uploadStoryImage(storyId, file)` returns a public GCS URL when given a valid image file
- [x] Complete

### Task 7: ImageLightbox component
- **Files:** `src/app/components/shared/image-lightbox.tsx` (create)
- **Spec refs:** "Component Strategy > Composition Tree (lines ~666-671)", "UX Design > User Flow 3 step 5 (lines ~241)", "Architecture Decisions AD-7 (lines ~486-487)"
- **Tests:** `e2e/a11y/p591-accessibility.spec.ts` (dialog role, focus trap, Escape close)
- **Depends on:** None
- **Verify:** Lightbox opens on trigger, closes on Escape/backdrop click, focus trapped within, accessible
- [x] Complete

### Task 8: StoryImage display component
- **Files:** `src/app/components/shared/story-image.tsx` (create)
- **Spec refs:** "Component Strategy > Component Map #4-5 (lines ~649-650)", "UX Design > User Flow 3 (lines ~233-242)"
- **Tests:** `e2e/p591-story-supporting-images.spec.ts` (visitor view, lightbox), `e2e/a11y/p591-accessibility.spec.ts` (alt text, keyboard)
- **Depends on:** Task 7 (lightbox component)
- **Verify:** Renders image with correct aspect ratio constraints; click opens lightbox; author overlay shows when callbacks provided
- [x] Complete

### Task 9: ImageUploadWidget component
- **Files:** `src/app/components/shared/image-upload-widget.tsx` (create)
- **Spec refs:** "Component Strategy > Component Map #2-3,7 (lines ~647-652)", "UX Design > User Flow 1 steps 2-7 (lines ~206-214)"
- **Tests:** `e2e/p591-story-supporting-images.spec.ts` (author controls), `e2e/a11y/p591-accessibility.spec.ts` (keyboard nav)
- **Depends on:** Task 4 (image processing), Task 6 (upload service)
- **Verify:** File selection → preview → progress → done/error state machine works; "Change image" and "Remove" actions functional
- [x] Complete

### Task 10: Create story page integration
- **Files:** `src/app/pages/create-story-page.tsx` (modify)
- **Spec refs:** "UX Design > User Flow 1 (lines ~201-218)", "Component Strategy > Composition Tree — Create Story Page (lines ~657-669)"
- **Tests:** `e2e/p591-story-supporting-images.spec.ts` (creation flow), `e2e/p591-smoke.spec.ts` (creation page button)
- **Depends on:** Task 5 (service accepts imageUrl), Task 9 (upload widget)
- **Verify:** "Add image" button visible below textarea; upload → publish → image visible on detail page
- [x] Complete

### Task 11: Story detail page + StoryCardDetail integration
- **Files:** `src/app/pages/story-detail-page.tsx` (modify), `src/app/components/social/StoryCardDetail.tsx` (modify)
- **Spec refs:** "UX Design > User Flow 2 (lines ~220-231)", "UX Design > User Flow 3 (lines ~233-242)", "Component Strategy > Composition Tree — Story Detail Page (lines ~672-691)"
- **Tests:** `e2e/p591-story-supporting-images.spec.ts` (visitor view, author controls), `e2e/p591-smoke.spec.ts` (detail page image)
- **Depends on:** Task 5 (type has imageUrl), Task 8 (StoryImage), Task 9 (upload widget for author add)
- **Verify:** Image renders between author row and text; author sees add/change/remove controls; non-author sees image only
- [x] Complete

### Task 12: Feed card integration
- **Files:** `src/app/components/feed/feed-story-card.tsx` (modify), `src/app/components/social/story-card-with-links.tsx` (modify)
- **Spec refs:** "UX Design > User Flow 3 step 6 (lines ~242)", "Component Strategy > Composition Tree — Story Card in Feed (lines ~694-706)"
- **Tests:** `e2e/p591-story-supporting-images.spec.ts` (feed card rendering)
- **Depends on:** Task 5 (type has imageUrl), Task 8 (StoryImage component)
- **Verify:** Compact image preview (max-h 200px) appears above text in feed cards; click navigates to story detail
- [x] Complete

### Task 13: Analytics events
- **Files:** `src/app/pages/create-story-page.tsx` (modify — add to existing), `src/app/pages/story-detail-page.tsx` (modify — add to existing), `src/app/components/shared/image-lightbox.tsx` (modify — add to existing)
- **Spec refs:** "Technical Architecture > Build Sequence step 14 (lines ~546)"
- **Depends on:** Task 10, Task 11 (pages must have image integration)
- **Verify:** Mixpanel events fire: `story_image_uploaded`, `story_image_removed`, `story_image_viewed`
- [x] Complete

**Total tasks:** 13 | **Can parallelize:** Task 1, 2, 4, 7 (no shared dependencies) | **Must be sequential:** 2→3→6, 1→5, 4+6→9, 7→8, 5+8+9→10→11→12→13

## Next Steps

1. Run `/dev` to implement
2. Run `/verify` for visual QA
