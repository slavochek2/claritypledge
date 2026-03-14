---
status: done
completed_at: "2026-03-14"
type: story
rank: 100
tags:
  - banner
  - ai
  - stories
  - points
  - profiles
  - og-image
prepped_date: '2026-03-13'
flow: dev
delivery_stage: uat
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-13
superseded_by: p510, p519
uat_file: features/uat/p504.md
test_files:
  - e2e/integration/p504-banner-migration.spec.ts
  - e2e/p504-banners.spec.ts
  - e2e/p504-smoke.spec.ts
  - e2e/a11y/p504-banner-accessibility.spec.ts
  - src/tests/generateBanner.test.ts
---

# P504: Auto-Generated Banners for Stories, Points & Profiles

## Problem Statement

**Current state:** Events have AI-generated banners (P416 Unsplash, P489 Gemini) with host controls (regenerate/remove). Stories, points, and profile pages have no visual imagery — they're text-only. Social sharing links for stories and points return a generic default icon as the OG image.

**Pain points:**
- Story and point links shared on LinkedIn/Twitter/WhatsApp show a generic ClarityPledge icon — no visual hook to drive clicks
- Story and point detail pages are pure text with no visual identity — functional but bland
- Profile pages have no visual personality beyond an avatar — no banner to establish identity
- The app feels text-heavy across all surfaces except events, creating an inconsistent visual experience
- OG routing for `/story/:id`, `/point/:id`, `/p/:slug` already exists in `vercel.json` but returns default images

**Who's affected:**
- Users sharing story/point links externally (poor social previews = fewer clicks)
- Story and point authors (no visual identity for their content)
- Profile visitors (bare profile pages with no visual personality)
- The platform overall (inconsistent polish — events look rich, everything else looks plain)

---

## Intention (Why This Matters)

**Strategic importance:** Social sharing is the primary organic growth channel. When a user shares a story or point link, the preview card is the first impression. A contextual AI-generated banner converts browsers into visitors. Profile banners add personality and make the platform feel polished — a signal of product maturity.

**Why now:** The full banner pipeline exists (Gemini generation → Supabase storage → OG routing → host controls). Extending it to stories, points, and profiles is incremental — the architecture is proven, the GCP credits are available, and OG routing is already wired up waiting for real images.

**Impact if not solved:** Shared links continue to look generic. Profile pages remain bare. The visual gap between events (rich) and everything else (plain) persists, making the product feel unfinished.

---

## Business Requirements

**Must-haves:**
- Auto-generate a banner when a story, point, or profile is created/first visited
- Display banners on story detail pages, point detail pages, and profile pages
- Serve generated banners as OG images for social sharing previews
- Story authors can regenerate or remove their story's banner
- Profile owners can regenerate or remove their profile banner
- Point banners are system-managed — no user controls (points have no clear owner; first validator is not the author)
- Generation uses Gemini AI with gradient fallback (no Unsplash — stock photos don't fit abstract content like opinions and personal identity)
- Rate limiting shared with existing event banner rate limits

**Success conditions:**
- Shared story/point links show contextual banner previews on LinkedIn, Twitter, WhatsApp, Telegram
- Detail pages have visual banners that reflect the content
- Profile pages have a banner that reflects the user's identity
- Story authors and profile owners have full control (regenerate/remove) over their banners

**Constraints:**
- Must reuse existing Gemini GCP credits (no new API costs)
- Must not slow down page load (banners are pre-generated, not on-demand for visitors)
- Must respect existing rate limits (shared pool across all entity types)
- /live page excluded — no banners there (space-constrained)
- Feed cards excluded from initial scope — banners on detail pages and profiles only

---

## User Stories

**As a story author sharing my work:**
- I want my story link to show a contextual banner preview on social media, so that people are more likely to click through
- I want to regenerate the banner if it doesn't match my story's tone, so that my shared content looks intentional
- I want to remove the banner entirely if I prefer text-only, so that I have full control

**As a point visitor:**
- I want the point's detail page to have a visual banner, so that it looks polished when I visit the link
- I want the banner to reflect the point's content, so that the visual matches the message

**As a profile owner:**
- I want my profile page to have a banner that reflects my identity, so that visitors get a visual first impression
- I want to regenerate or remove my profile banner, so that I control how my profile looks

**As someone receiving a shared link:**
- I want to see a relevant preview image when someone shares a story or point link, so that I can decide if it's worth clicking

---

## Jobs to Be Done

**When I share a story link on LinkedIn:**
- I want the preview to look professional and relevant, so I can attract readers without manually creating graphics (motivation: effortless professional sharing)

**When someone visits my profile:**
- I want the page to feel visually complete, so I can make a good first impression (motivation: personal branding)

**When I publish a new point:**
- I want a banner to appear automatically, so I can focus on writing without worrying about visuals (motivation: zero-friction publishing)

**When I'm unhappy with an auto-generated banner:**
- I want to get a new one with one click, so I can iterate quickly without leaving the page (motivation: creative control without effort)

---

## Outcomes (Success Metrics)

**Social sharing impact:**
- Story/point links shared externally show contextual banners instead of generic icon (100% coverage for content with banners)
- Measure: Click-through rate on shared links (baseline: generic icon CTR vs banner CTR)

**Visual completeness:**
- Story detail pages, point detail pages, and profile pages all have visual banners by default
- Measure: % of stories/points/profiles with banners (target: >90% auto-generated on creation)

**User control:**
- Authors/owners can regenerate or remove banners
- Measure: Regenerate/remove usage rate (signals engagement with the feature)

**Platform consistency:**
- All content types (events, stories, points, profiles) have consistent visual treatment
- Qualitative: app no longer feels "text-heavy except events"

---

## Acceptance Criteria

- [ ] New story creation auto-generates a banner from the story title/content
- [ ] New point creation auto-generates a banner from the point statement
- [ ] Profile pages display an auto-generated banner (generated on first profile visit or profile creation)
- [ ] Story detail page displays the banner as a header image
- [ ] Point detail page displays the banner as a header image
- [ ] Profile page displays the banner as a header/cover image
- [ ] Story author sees regenerate/remove controls on their story's banner
- [ ] Profile owner sees regenerate/remove controls on their profile banner
- [ ] Point banners have NO user controls (system-managed, no clear owner)
- [ ] Non-owners do NOT see regenerate/remove controls on stories/profiles
- [ ] Social sharing preview (OG image) uses the generated banner for stories
- [ ] Social sharing preview (OG image) uses the generated banner for points
- [ ] Social sharing preview (OG image) uses the generated banner for profiles
- [ ] Generation follows Gemini AI → gradient fallback chain (no Unsplash for stories/points/profiles)
- [ ] Rate limiting applies across all entity types (shared pool)
- [ ] Banners do NOT appear on /live page
- [ ] Banners do NOT appear on feed cards (detail pages and profiles only)
- [ ] Failed generation does not block content creation (fire-and-forget)
- [ ] Gradient fallback displays when no banner exists

---

## Scope Boundaries

**In scope:**
- Story detail pages, point detail pages, profile pages
- OG image integration for social previews
- Regenerate/remove controls for owners
- Gemini AI → gradient fallback pipeline (no Unsplash — abstract content doesn't benefit from stock photos)

**Out of scope (future consideration):**
- Custom image uploads (requires moderation, crop UI, storage management)
- Banners on feed cards (evaluate after detail page rollout)
- Banners on /live page
- Banners in embed views

---

## Prior Art

- **P416** — Event auto-banner via Unsplash (keyword extraction, fallback, host controls)
- **P418** — Banner search fallback (manual keyword search when auto-gen fails)
- **P489** — AI-generated event banners via Gemini (primary generation path, storage bucket, rate limiting)

---

## Next Steps

1. Run `/ux` to design banner placement, sizing, and interaction patterns across story/point/profile surfaces
2. Run `/architect` to design schema changes, edge function generalization, storage strategy
3. Run `/generate-tests` for test automation
4. Run `/spec-review` to validate before implementation
5. Run `/decompose` if complexity warrants splitting
6. Run `/dev` to implement
7. Run `/verify` for visual QA

---

## UX Design

### Lean Challenge

**Scope check:** No lean violations found. This feature extends proven infrastructure (Gemini banner pipeline) to surfaces that already exist. No onboarding friction added — banners generate silently after content creation. No new UI surfaces to maintain — only additions to existing detail/profile pages. The "no controls on points" constraint correctly avoids taxing a one-user scope. Deferring feed card banners to a future iteration is the right call.

---

### 1. User Flows

#### Flow 1: Auto-Generation on Creation (Stories & Points)

1. User creates a story or point via the existing creation flow
2. After successful creation, the system fires a background banner generation request (fire-and-forget)
3. Generation uses Gemini AI with the entity title/statement as prompt context
4. If Gemini succeeds, the generated image is stored and the entity's `banner_url` is set
5. If Gemini fails, no banner is stored — the gradient fallback displays on next page visit
6. User is never blocked or notified about generation status — the banner simply appears when ready

#### Flow 2: Auto-Generation on First Visit (Profiles)

1. A profile page is loaded (by the owner or any visitor)
2. If the profile has no `banner_url`, the system checks whether generation was already attempted
3. If not attempted, the system fires a background generation request using the user's name and role as prompt context
4. If Gemini succeeds, the banner is stored; if it fails, gradient fallback displays
5. Subsequent visits show the stored banner or gradient — no repeated generation attempts on failure

#### Flow 3: Regenerate Banner (Story Authors & Profile Owners)

1. Owner visits their story detail page or their own profile page
2. Owner sees "New banner" pill button overlaid on the bottom-right of the banner area (identical to event pattern)
3. Owner clicks "New banner"
4. The refresh icon spins while generation is in progress
5. If Gemini succeeds, the new banner replaces the current one immediately
6. If Gemini fails, a keyword input field appears (matching event search fallback pattern) so the owner can describe what they want
7. Owner types keywords and presses Enter or clicks "Search"
8. If this also fails, an inline error message appears: "Couldn't generate a banner — try different keywords"
9. Rate limit hit: the button becomes disabled with a toast "Too many requests — try again in a minute"

#### Flow 4: Remove Banner (Story Authors & Profile Owners)

1. Owner visits their story detail page or their own profile page
2. When a banner image is present, a "Remove banner" pill button appears next to "New banner"
3. Owner clicks "Remove banner"
4. The banner image is removed and the gradient fallback takes its place immediately
5. The `banner_url` is set to null in the database
6. "Remove banner" button disappears (only shown when an image banner exists)

#### Flow 5: Point Banner — System-Managed (No Controls)

1. A point is created and banner is auto-generated in the background
2. On the point detail page, the banner displays at the top
3. No user sees regenerate or remove controls — the banner is system-managed
4. If generation failed, the gradient fallback displays permanently

#### Flow 6: Social Sharing Preview

1. A user copies a story, point, or profile URL and pastes it into LinkedIn/Twitter/WhatsApp/Telegram
2. The social platform's crawler hits the OG endpoint
3. The OG endpoint returns the stored `banner_url` as the `og:image`
4. If no banner exists, the OG endpoint returns the default ClarityPledge icon (existing behavior)
5. The social platform renders a rich preview card with the contextual banner

---

### 2. Screen Designs

#### 2a. Story Detail Page — With Banner

```
┌──────────────────────────────────────────────┐
│  ┌────────────────────────────────────────┐   │
│  │                                        │   │
│  │        BANNER IMAGE (or gradient)      │   │
│  │        h-48 mobile / h-64 desktop      │   │
│  │                                        │   │
│  │                    ┌────────┐┌────────┐│   │
│  │                    │⟳ New   ││✕ Remove││   │
│  │                    │banner  ││ banner ││   │
│  │                    └────────┘└────────┘│   │
│  └────────────────────────────────────────┘   │
│                                               │
│  ← Back                                      │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │ 🔵 Avatar  Author Name  👂 3          │   │
│  │                                        │   │
│  │ Story title                            │   │
│  │ Story content text...                  │   │
│  │                                        │   │
│  │ #tag1  #tag2                           │   │
│  │                                        │   │
│  │ ─────────────────────────────          │   │
│  │              🔗 Share                  │   │
│  └────────────────────────────────────────┘   │
│                                               │
│  Linked Points                                │
│  ┌──────────────────────────────────────┐     │
│  │ 📌 Point statement...                │     │
│  │ [Agree] [Disagree] [Unsure]          │     │
│  └──────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

**Owner controls** (bottom-right of banner area, only visible to story author):
- "New banner" — always visible
- "Remove banner" — only visible when banner image exists (not gradient)
- Keyword search fallback — appears below controls when generation fails

#### 2b. Point Detail Page — With Banner (No Controls)

```
┌──────────────────────────────────────────────┐
│  ┌────────────────────────────────────────┐   │
│  │                                        │   │
│  │        BANNER IMAGE (or gradient)      │   │
│  │        h-48 mobile / h-64 desktop      │   │
│  │                                        │   │
│  │               (no controls)            │   │
│  │                                        │   │
│  └────────────────────────────────────────┘   │
│                                               │
│  ← Back                                      │
│                                               │
│  ┌────────────────────────────────────────┐   │
│  │ 📌  Point statement text               │   │
│  │                                        │   │
│  │ #tag1  #tag2                           │   │
│  │                                        │   │
│  │ [Agree] [Disagree] [Unsure]            │   │
│  │ ─────────────────────────────          │   │
│  │              🔗 Share                  │   │
│  └────────────────────────────────────────┘   │
│                                               │
│  [All] [Agree] [Disagree] [Unsure]           │
│  ┌──────────────────────────────────────┐     │
│  │ Position holders list...              │     │
│  └──────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

**Key difference from stories:** No controls overlay. The banner is purely decorative/system-managed.

#### 2c. Profile Page — With Banner

```
┌────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────┐  │
│  │                                          │  │
│  │        BANNER IMAGE (or gradient)        │  │
│  │        h-48 mobile / h-64 desktop        │  │
│  │                                          │  │
│  │                  ┌────────┐┌────────┐    │  │
│  │                  │⟳ New   ││✕ Remove│    │  │
│  │   ┌──────┐      │banner  ││ banner │    │  │
│  │   │      │      └────────┘└────────┘    │  │
│  ├───│ 🔵   │──────────────────────────────┤  │
│  │   │ Avt  │  User Name  👂 5            │  │
│  │   └──────┘  Role / Company              │  │
│  │             🔗 LinkedIn  📜 Pledge      │  │
│  │             [Share]                      │  │
│  ├──────────────────────────────────────────┤  │
│  │  [Points] [Stories]                      │  │
│  │  Content cards...                        │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**LinkedIn-style layout (reference: linkedin.com/in/ladischenski).** One unified card. Avatar (lg, ~64px) anchored bottom-left of the banner, overlapping the banner edge. Name and info flow to the right of the avatar. The banner, avatar, and profile info are one visual block — not separate sections. Z-index: avatar > banner. White ring/border around avatar for separation against any banner color.

**Owner controls:** Same pill buttons as events/stories, visible only to the profile owner. Positioned bottom-right of banner area.

**Important:** Only use existing profile page elements. Do not invent new UI (e.g., "Edit Profile" does not exist).

#### 2d. Gradient Fallback (All Entities)

```
┌────────────────────────────────────────┐
│                                        │
│    Soft radial gradient using the      │
│    entity's accent color               │
│    (author avatar color for stories,   │
│     blue-100 for points,               │
│     profile avatar color for profiles) │
│                                        │
└────────────────────────────────────────┘
```

The gradient uses the same pattern as the existing event fallback: `radial-gradient(at 0% 0%, {color}50 0%, transparent 50%), radial-gradient(at 100% 100%, {color}30 0%, transparent 50%), linear-gradient(135deg, {color}15 0%, {color}08 100%)`

---

### 3. Edge Cases

| Scenario | Behavior |
|----------|----------|
| **Generation in progress** | Spinner on "New banner" button; button disabled. No skeleton/placeholder on the banner area itself — gradient shows until image is ready. |
| **Gemini generation fails** | Keyword search input appears (stories/profiles). For points: gradient stays permanently. No error toast — inline only. |
| **Rate limit exceeded** | Toast: "Too many requests — try again in a minute." Button re-enables after cooldown. Shared pool across all entity types (events, stories, profiles). |
| **Slow network / image loading** | The `<img>` tag loads progressively. No skeleton overlay — the gradient shows underneath via CSS background fallback until image paints. |
| **Banner URL becomes stale (404)** | The `<img>` `onError` handler falls back to the gradient. No automatic re-generation — owner can click "New banner" to get a fresh one. |
| **Removing banner** | Immediate optimistic removal — gradient shows instantly. Database update follows. If DB update fails, banner URL is restored and toast: "Couldn't remove banner. Try again." |
| **Page loads while generation is still running** | Gradient shows. Banner appears on next page visit after generation completes. No WebSocket/polling for real-time updates (fire-and-forget is sufficient). |
| **Profile with no name/role** | Generation uses "ClarityPledge member" as prompt fallback. Gradient is acceptable. |
| **Profile generation context** | Gemini prompt includes: display name, role/title, avatar color (hex). These are already stored in the profile. No external data scraping. Avatar color influences the visual tone/palette of the generated banner. |
| **Very long story/point text** | Prompt to Gemini is truncated to first 200 characters. The visual should represent the theme, not the full text. |
| **Content deletion** | When a story or point is deleted, the banner image in storage is orphaned. Acceptable — storage cleanup can be a separate concern. |
| **Non-owner visits story detail** | Banner displays, no controls visible. Same experience as viewing someone else's event. |
| **Non-owner visits profile** | Banner displays, no controls visible. |

---

### 4. Accessibility

| Element | Requirement |
|---------|-------------|
| **Banner image** | `alt` text: For stories: story title. For points: point statement (truncated to 100 chars). For profiles: "{Name}'s profile banner". |
| **Gradient fallback** | `role="img"` with `aria-label="Decorative banner"` (no meaningful content to convey). |
| **"New banner" button** | `aria-label="Generate new banner"`. When loading: `aria-busy="true"`, `aria-label="Generating new banner..."`. |
| **"Remove banner" button** | `aria-label="Remove banner image"`. |
| **Keyword search input** | `aria-label="Describe your banner"` (matches existing event pattern). |
| **Search submit button** | `aria-label="Generate banner from description"`. |
| **Error message** | `role="alert"` for the "Couldn't generate" and "No photos found" messages. |
| **Keyboard navigation** | Tab order: "New banner" -> "Remove banner" -> keyword input (when visible) -> "Search". All buttons focusable, Enter/Space to activate. Escape closes keyword search. |
| **Screen reader flow** | Banner area comes before page content in DOM order (matches event pattern). Screen readers read the alt text, then proceed to the back link and content. |
| **Reduced motion** | The spinner animation on "New banner" respects `prefers-reduced-motion: reduce` — degrades to a static icon. |

---

### 5. Responsive Design

| Breakpoint | Banner height | Banner aspect | Controls |
|------------|--------------|---------------|----------|
| **Mobile** (< 768px) | `h-48` (192px) | Full-width, fixed height | Pill buttons stay bottom-right, slightly smaller text (text-xs). Keyword input: `w-40`. |
| **Desktop** (>= 768px) | `h-64` (256px) | Full-width, fixed height | Same position, same sizing. No layout change needed — the pills are compact enough. |

**Banner rendering:** `object-cover` ensures the image fills the area without distortion at any viewport width. This matches the existing event detail pattern exactly.

**Profile page specifics:** The banner spans the full width of the content area (`max-w-lg` on profile, matching existing layout). On mobile, the banner touches the edges. On desktop, it respects the content max-width and has rounded top corners.

**OG images:** Generated at a fixed resolution (1200x630, matching existing event banner dimensions) regardless of display size. Social platforms handle their own cropping.

---

### 6. Component Analysis

| Element | Classification | Reference |
|---------|---------------|-----------|
| **Banner display container** (image + gradient fallback) | **Extract & Reuse** — Extract the banner display from `EventDetail.tsx` (lines 282-298) into a shared `BannerDisplay` component. Used by story detail, point detail, profile, and event detail. | `src/app/prototypes/events/components/EventDetail.tsx` |
| **Banner owner controls** (regenerate/remove/search) | **Extract & Reuse** — Extract the controls overlay from `EventDetail.tsx` (lines 301-355) into a shared `BannerControls` component. Props: `onRegenerate`, `onRemove`, `isLoading`, `showSearch`, `onSearch`. Used by event detail, story detail, and profile page. NOT used by point detail. | `src/app/prototypes/events/components/EventDetail.tsx` |
| **Banner generation utility** | **Extend** — Generalize `generateAIBanner()` in `banner-utils.ts` to accept an `entityType` param (`event` / `story` / `point` / `profile`) and `entityId`. Currently hardcoded to call `generate-event-banner` edge function. | `src/app/prototypes/events/banner-utils.ts` |
| **Story detail page** | **Extend** — Add banner display area above the existing content. Insert `BannerDisplay` + `BannerControls` (author-only) before the back link. | `src/app/pages/story-detail-page.tsx` |
| **Point detail page** | **Extend** — Add banner display area above the existing content. Insert `BannerDisplay` only (no controls). Currently uses a `max-w-lg` layout — banner spans full width within that container. | `src/app/pages/point-detail-page.tsx` |
| **Profile page** | **Extend** — Add banner display area above the profile header card. Insert `BannerDisplay` + `BannerControls` (owner-only) before the "Back" button. | `src/app/pages/profile-page-v2.tsx` |
| **SEO component** | **Extend** — The `image` prop already accepts a URL. Story/point/profile pages pass `banner_url` as the `image` prop when available. No structural change needed. | `src/app/components/seo.tsx` |
| **OG endpoint** | **Extend** — Add entity-type routing for stories, points, and profiles. The endpoint already handles events. Extend the lookup to fetch `banner_url` from the corresponding table. | `api/og.ts` |
| **Gradient fallback** | **Extract** — The gradient generation logic (color-based radial gradient) is inline in `EventDetail.tsx` (lines 293-296). Extract into a utility function `generateGradientStyle(color: string)` in the shared banner module. | `src/app/prototypes/events/components/EventDetail.tsx` |
| **Feed cards (story/point)** | **No change** — Explicitly out of scope. Feed cards do NOT display banners. | `src/app/components/social/story-card-with-links.tsx`, `src/app/components/social/point-card-with-links.tsx` |
| **ShareDialog** | **No change** — Already supports story, point, and profile types. No modification needed. | `src/app/prototypes/linkedin-like/components/shared/ShareDialog.tsx` |
| **Event banner display** | **Refactor** — After extracting the shared components, `EventDetail.tsx` consumes `BannerDisplay` + `BannerControls` instead of inline JSX. Functionality stays identical. | `src/app/prototypes/events/components/EventDetail.tsx` |

---

### 7. Founder Decisions (Resolved)

1. **Profile banner avatar overlap? → Yes, LinkedIn-style overlap.** Avatar sits partially over the banner bottom edge. Adds z-index complexity but looks more polished.

2. **Story detail page layout? → Full-width banner above the card (option A).** In-card banner is for feed embeds (deferred/maybe never).

3. **Profile banner generation context → Use existing profile data only.** Name, role/title, avatar color fed as Gemini prompt context. No LinkedIn scraping (over-engineering: rate limits, auth, legal, maintenance). The data we already store is sufficient to generate something fitting.

---

## Technical

### Technical Analysis

#### Current Banner Pipeline (Events Only)

The existing banner infrastructure is complete and production-proven:

1. **Edge function** (`supabase/functions/generate-event-banner/index.ts`): Accepts `eventId`, `title`, `location`, optional `keywords`. Validates JWT, checks rate limits via `ai_rate_limits` table, calls Gemini (`gemini-3.1-flash-image-preview` primary, `gemini-3-pro-image-preview` fallback), uploads to Supabase Storage `event-banners` bucket, cleans up old banner. Hardcoded to events: validates `eventId` against `events` table, checks `host_id` ownership, stores under `{eventId}/` path prefix.

2. **Client utility** (`src/app/prototypes/events/banner-utils.ts`): `generateAIBanner()` calls the edge function with event-specific params (`eventId`, `title`, `location`). Also has Unsplash utilities (`fetchUnsplashBanner`, `regenerateUnsplashBanner`) used as event fallback.

3. **Fire-and-forget pattern** (`src/app/data/events-service-real.ts`): After `createEvent()`, a `void (async () => {...})()` block tries AI generation then Unsplash fallback. Failures are silent.

4. **Display + controls** (`src/app/prototypes/events/components/EventDetail.tsx`): Banner image with `object-cover` at `h-48 md:h-64`. Gradient fallback uses radial gradient from `hostAvatarColor`. Host sees regenerate/remove pill buttons + keyword search fallback on failure. State: `bannerUrl`, `isBannerLoading`, `showBannerSearch`, `bannerSearchKeywords`, `bannerSearchError`.

5. **Storage** (`supabase/migrations/20260309000000_create_event_banners_bucket.sql`): Public bucket `event-banners`, 5MB limit, `image/png|jpeg|webp`. Policies: `service_role` insert/delete, `anon/authenticated` select.

6. **Rate limiting** (`supabase/migrations/20260225120000_p425_ai_rate_limits.sql`): `ai_rate_limits` table with `user_id` + `called_at`. Edge function enforces 5/5min burst, 20/24h daily. Already a shared pool (table is entity-agnostic).

7. **OG endpoint** (`api/og.ts`): Vercel serverless function. Routes: `/events/:slug`, `/story/:id`, `/point/:id`, `/p/:slug`. Events already return `banner_url`. Stories, points, profiles return `DEFAULT_IMAGE`. The routing and Supabase REST helper are ready -- just need to query `banner_url` from the right tables.

8. **SEO component** (`src/app/components/seo.tsx`): Accepts `image` prop. Currently story/point/profile pages don't pass banner URLs.

#### Schema State (Stories, Points, Profiles)

- **stories**: No `banner_url` column. Type `Story` (`src/app/types/index.ts:910`) has no banner field. `createStory()` in `stories-service-real.ts` inserts `author_id`, `content`, `tags`, `visibility` -- no banner.
- **points**: No `banner_url` column. Type `Point` (`src/app/types/index.ts:978`) has no banner field. `createPoint()` in `points-service-real.ts` inserts `statement`, `context`, `first_validator_id`, `tags`.
- **profiles**: No `banner_url` column. Type `Profile` (`src/app/types/index.ts:34`) has no banner field. Has `avatar_color`, `avatar_url`, `name`, `role` -- sufficient for generation prompt.

#### Page Layouts

- **Story detail** (`src/app/pages/story-detail-page.tsx`): `max-w-lg mx-auto px-4 py-6` -> `FocusHeader` -> `StoryCardDetail`. No banner area. Currently 1200+ lines.
- **Point detail** (`src/app/pages/point-detail-page.tsx`): `max-w-lg mx-auto px-4 py-6` -> `FocusHeader` -> point card. No banner area. ~637 lines.
- **Profile page** (`src/app/pages/profile-page-v2.tsx`): `max-w-lg mx-auto px-4 mt-3` -> back button -> profile header card with avatar/name/role. No banner area. Avatar is inside the card, not overlapping anything.

#### Dependencies

- Gemini API (existing GCP credits on `slava@inguro.com`)
- Supabase Storage (existing `event-banners` bucket -- will be generalized or a new bucket created)
- `ai_rate_limits` table (already shared/entity-agnostic)

---

### Architecture Decisions

#### Decision 1: Generalize the Edge Function vs. Create Separate Functions

**Chosen:** Generalize the existing `generate-event-banner` into a `generate-banner` function that accepts `entityType` (`event` | `story` | `point` | `profile`) and `entityId`.

**Rationale:** The core logic (Gemini call, image upload, rate limiting, cleanup) is identical across entity types. Only the prompt template, authorization check, and DB table differ. A single function with a type discriminator avoids 4x code duplication.

**Trade-off:** The function grows a routing layer (switch on `entityType`), but this is ~30 lines vs. duplicating 400 lines three times.

**Alternative rejected:** Separate edge functions per entity type (`generate-story-banner`, `generate-point-banner`, `generate-profile-banner`). Would duplicate rate limiting, Gemini call, upload, and cleanup logic. Maintenance burden for identical infrastructure.

#### Decision 2: Storage Bucket Strategy

**Chosen:** Rename/generalize to a single `banners` bucket (new migration). Keep `event-banners` bucket as-is (existing data stays), create `banners` bucket for all new entities. Path convention: `{entityType}/{entityId}/{uuid}.{ext}`.

**Rationale:** A single bucket simplifies RLS policies and cleanup. Separate directories per entity type keep files organized. Existing event banners stay in `event-banners` (no migration needed -- both buckets coexist, new event banners go to the new bucket going forward).

**Trade-off:** Two buckets coexist temporarily. Old event banner URLs still reference `event-banners/`. The edge function's cleanup logic already handles the bucket URL prefix check, so old URLs are cleaned correctly.

**Alternative rejected:** Reuse `event-banners` bucket as-is. Naming is misleading for story/point/profile banners. Would work technically but the name is confusing.

#### Decision 3: Prompt Construction Per Entity Type

**Chosen:** Entity-specific prompt builders in the edge function:
- **Events:** "Generate a banner for an event. Title: X. Location: Y." (existing, unchanged)
- **Stories:** "Generate a banner for a personal story. Title/content: X." (use `title` if present, otherwise first 200 chars of `content`)
- **Points:** "Generate a banner for an opinion statement: X." (the point statement)
- **Profiles:** "Generate a banner for a professional profile. Name: X. Role: Y." Avatar color as palette hint.

**Rationale:** Each entity type has different semantic content that produces better images when the prompt is tailored. Events are location-oriented, stories are narrative, points are conceptual, profiles are identity-focused.

**Trade-off:** More prompt-engineering surface area to maintain, but prompts are just strings -- low maintenance cost.

**Alternative rejected:** A single generic prompt template ("Generate a banner for: {text}"). Would work but produces less contextually relevant images.

#### Decision 4: Authorization Model in the Edge Function

**Chosen:** The edge function validates ownership per entity type:
- **Events:** `host_id = userId` (existing)
- **Stories:** `author_id = userId`
- **Points:** No ownership check -- system-generated only. User-triggered regeneration is not supported. The edge function rejects manual `point` requests from non-admin callers. Only fire-and-forget on creation triggers point banner generation.
- **Profiles:** `id = userId` (profile owner)

**Rationale:** Points have no clear owner (spec: "first validator is not the author"). System-managed banners mean no user can abuse the rate limit via point banner regeneration. Stories and profiles follow the event pattern -- only the owner can regenerate.

**Trade-off:** Point banners are permanently set on creation (or permanently gradient if generation fails). Acceptable per spec ("no controls on points"). If a point banner is bad, there's no user-facing way to fix it -- this matches the spec intent.

**Alternative rejected:** Allow any user to regenerate any point's banner. Creates abuse vector and contradicts spec.

#### Decision 5: Profile Banner Generation Trigger

**Chosen:** Generate on profile creation (in `AuthCallbackPage.tsx` flow) via fire-and-forget, not on first visit. A `banner_generation_attempted` boolean column on profiles tracks whether generation was tried.

**Rationale:** Generating on first visit adds latency concerns and race conditions (multiple visitors arriving simultaneously could all trigger generation). Profile creation is a single, well-defined moment. The `banner_generation_attempted` flag prevents retries on failure, matching the spec ("no repeated generation attempts on failure").

**Trade-off:** Existing profiles (created before this feature) won't get banners automatically. A backfill script can handle this as a follow-up task. Alternatively, the profile page can trigger generation on first visit for profiles where `banner_url IS NULL AND banner_generation_attempted = FALSE`.

**Compromise:** Use a dual trigger -- fire-and-forget on creation for new profiles AND lazy generation on first profile page load for existing profiles (guarded by the `banner_generation_attempted` flag). This covers both new and existing profiles without a backfill script.

#### Decision 6: Shared Components Extraction

**Chosen:** Extract two shared components from `EventDetail.tsx`:
1. `BannerDisplay` -- renders the banner image or gradient fallback. Props: `bannerUrl`, `fallbackColor`, `altText`, `isCancelled?`.
2. `BannerControls` -- renders regenerate/remove pills + keyword search. Props: `onRegenerate`, `onRemove`, `isLoading`, `showSearch`, `onSearch`, `searchError`, `defaultKeywords`.

Both placed in `src/app/components/shared/banner/`.

**Rationale:** The UX spec explicitly calls for extracting these (Component Analysis section). The event detail, story detail, and profile pages all use identical visual patterns. Point detail uses only `BannerDisplay` (no controls).

**Trade-off:** `EventDetail.tsx` needs refactoring to consume the shared components -- risk of visual regression. Mitigated by keeping the exact same CSS classes and structure.

**Alternative rejected:** Copy-paste the banner UI into each page. Faster to implement but creates 4x maintenance surface for identical UI.

#### Decision 7: No Unsplash Fallback for Stories/Points/Profiles

**Chosen:** Gemini AI -> gradient fallback only (no Unsplash in the chain).

**Rationale:** Spec explicitly states "no Unsplash -- stock photos don't fit abstract content like opinions and personal identity." The keyword search fallback on stories/profiles still uses Gemini (with user-provided keywords), not Unsplash.

**Trade-off:** If Gemini is down, users get gradient only. Acceptable -- gradient is a clean fallback.

#### Decision 8: Schema Additions -- Minimal Columns

**Chosen:** Add `banner_url TEXT` to `stories`, `points`, and `profiles`. Add `banner_generation_attempted BOOLEAN DEFAULT FALSE` to `profiles` only (stories/points generate on creation, so no retry guard needed).

**Rationale:** Matches the `events.banner_url` pattern. One column per table, nullable. No separate banner metadata table needed -- the URL is the only data we store.

**Trade-off:** No `banner_generation_attempted` on stories/points means if generation fails at creation time, the only way to get a banner is manual regeneration (stories) or never (points). For points, this is acceptable per spec. For stories, the author can always click "New banner."

---

### Security Review

**RLS Policies:**

- ✅ **Stories — `banner_url` update by author**: Existing policy `"Authors can update own stories"` uses `auth.uid() = author_id`. No new RLS policy needed.
- ✅ **Profiles — `banner_url` update by owner**: Existing policy `"Users can update own profile"` uses `auth.uid() = id`. No new RLS policy needed.
- ⚠️ **Points — NO UPDATE policy exists**: Points table has RLS with only SELECT and INSERT. Migration comment: "Points are not editable after creation (statement is immutable)." **Point `banner_url` must ONLY be written via the edge function (service_role), never from the client.** This aligns with the spec's "system-managed" design.
- ✅ **Storage bucket**: New `banners` bucket follows same RLS as `event-banners` — `service_role` insert/delete, `anon/authenticated` select.
- ⚠️ **Storage path convention**: Must include entity-type prefix (`stories/{id}/`, `profiles/{id}/`, `points/{id}/`) to prevent ID collisions and enable cleanup by entity type.

**Authentication:**

- ✅ **Edge function JWT validation**: Existing pattern validates JWT via `anonClient.auth.getUser(token)`. Preserved in generalized function.
- ✅ **OG endpoint unauthenticated (correct)**: Social crawlers can't authenticate. OG data exposes only public fields.
- ⚠️ **Profile banner generation on first visit**: If triggered by an unauthenticated visitor, the edge function (which requires JWT) would fail. **Resolution (Decision 5):** Profile banners generate on creation (authenticated) + lazy trigger on first visit by any authenticated user. Unauthenticated visitors see gradient only.

**Authorization:**

- ✅ **Stories**: Edge function checks `stories.author_id = userId` before allowing generation.
- ✅ **Profiles**: Edge function checks `profiles.id = userId` before allowing regeneration.
- ⚠️ **Points**: Edge function rejects manual `point` requests from non-service callers. Only fire-and-forget on creation triggers point banner generation (service_role call).

**Input Validation:**

- ✅ **Existing validation preserved**: UUID regex, length limits, control character stripping via `stripControlChars()`.
- ⚠️ **Entity-specific limits**: Story title (200 chars), point statement (200 chars), profile name + role (100 chars each). Generalized function uses different request body schema per entity type.
- ⚠️ **Profile data read server-side**: Edge function accepts only `entityType` + `entityId` (+ optional `keywords`). Prompt context (name, role, avatar color) fetched from DB, not passed by client. Prevents prompt injection via modified request body.

**Data Protection:**

- ✅ **OG endpoint exposes only public fields**: `banner_url`, `title`, `statement`, `name`, `role`.
- ✅ **No email in prompts**: Display name and role are publicly visible. Email is explicitly excluded from generation prompts.
- ✅ **No scraping**: Only data already in the database is used.

**AI Prompt Security:**

| Variable | Origin | Classification | Required handling |
|----------|--------|---------------|-------------------|
| `story.title` | User-authored, stored in DB | Untrusted (indirect) | Truncate 200 chars, strip control chars, wrap in `<entity_context>` with injection guard |
| `point.statement` | User-authored, stored in DB | Untrusted (indirect) | Truncate 200 chars, strip control chars, same delimiter + guard |
| `profile.name` | User-set display name | Untrusted (indirect) | Truncate 100 chars, strip control chars, same delimiter + guard |
| `profile.role` | User-set role/title | Untrusted (indirect) | Truncate 100 chars, strip control chars, same delimiter + guard |
| `profile.avatar_color` | System-generated hex | Trusted | Validate hex format (`/^#[0-9a-fA-F]{6}$/`), no injection risk |
| `keywords` | Direct user input | Untrusted (direct) | 100 char limit, control char strip, same delimiter + guard |

- [x] No sensitive user data (email, PII) in prompts — only publicly visible fields
- [x] System prompt extraction resistance — response is an image (not text), minimal risk. Existing `<event_context>` delimiter with "do not follow instructions" framing preserved
- [x] API key is server-side secret — `GEMINI_API_KEY` via `Deno.env.get()`, not `VITE_*`
- [x] Rate limiting — 5/5min burst, 20/24h daily, shared pool via `ai_rate_limits` table

**Additional findings:**

- ✅ **Story version trigger safe**: `create_story_version_on_update` only fires on `title`/`content` changes, not `banner_url`. No spurious versions.
- ⚠️ **OG cache (informational)**: `s-maxage=3600, stale-while-revalidate=86400`. After banner regeneration, social platforms may serve old image for up to 1h (CDN) or 24h (stale). Acceptable — document for users.
- ✅ **CORS restriction**: Edge function restricts to `ALLOWED_ORIGIN` (`https://claritypledge.com`). Maintained in generalized function.

---

### Implementation Approach

**Worktree recommended:** This feature touches 10+ files across edge functions, migrations, shared components, three page components, OG endpoint, types, and service layers.

#### Files to Create

1. **`supabase/migrations/YYYYMMDDHHMMSS_p504_banner_columns.sql`** -- Add `banner_url TEXT` to `stories`, `points`, `profiles`. Add `banner_generation_attempted BOOLEAN DEFAULT FALSE` to `profiles`.
2. **`supabase/migrations/YYYYMMDDHHMMSS_p504_banners_bucket.sql`** -- Create `banners` storage bucket (public read, service_role write, 5MB limit, image mime types).
3. **`src/app/components/shared/banner/BannerDisplay.tsx`** -- Shared banner image + gradient fallback component.
4. **`src/app/components/shared/banner/BannerControls.tsx`** -- Shared regenerate/remove controls + keyword search.
5. **`src/app/components/shared/banner/index.ts`** -- Barrel export.
6. **`src/app/components/shared/banner/use-banner.ts`** -- Shared hook encapsulating banner state management (loading, search, error, regenerate/remove handlers). Reduces duplication across consuming pages. **Entity-type-aware fallback chain:** The hook accepts `entityType` and adjusts behavior: events retain Gemini → Unsplash → keyword search → gradient; stories/profiles use Gemini → keyword search → gradient (no Unsplash); points use Gemini → gradient only (no keyword search, no user controls). The hook also accepts an `onSave(bannerUrl: string | null)` callback for persisting changes, since each entity type uses a different service method.

#### Files to Modify

1. **`supabase/functions/generate-event-banner/index.ts`** -- Generalize to `generate-banner`. Accept `entityType` + `entityId` instead of `eventId`. Add entity-specific prompt builders. Add entity-specific authorization checks. Update storage path to `{entityType}/{entityId}/`. Update `RequestBody` interface. Rename function directory to `generate-banner` (or add routing within existing function).
2. **`src/app/prototypes/events/banner-utils.ts`** -- Generalize `generateAIBanner()` to accept `entityType` and entity-specific fields. Update the edge function URL from `generate-event-banner` to `generate-banner`.
3. **`src/app/types/index.ts`** -- Add `bannerUrl?: string` to `Story`, `StoryWithAuthor`, `Point`, `PointWithCreator`, `PointWithCounts`, `Profile`, and their Db counterparts (`banner_url`).
4. **`src/app/data/stories-service-real.ts`** -- (a) Map `banner_url` in all query selects and return mappers. (b) Add fire-and-forget banner generation in `createStory()` after successful insert.
5. **`src/app/data/points-service-real.ts`** -- (a) Map `banner_url` in query selects. (b) Add fire-and-forget banner generation in `createPoint()` after successful insert.
6. **`src/app/data/api.ts`** -- Add `bannerUrl` to Profile mapping. Add `bannerGenerationAttempted` field.
7. **`src/app/data/events-service-real.ts`** -- Update `generateAIBanner()` call in `createEvent()` to use new generalized signature. Update `handleRegenerateBanner`/`handleBannerSearch` to pass `entityType: 'event'`.
8. **`src/app/prototypes/events/components/EventDetail.tsx`** -- Refactor to consume `BannerDisplay` + `BannerControls` shared components. Remove inline banner JSX (~70 lines). Functionality unchanged.
9. **`src/app/pages/story-detail-page.tsx`** -- Add `BannerDisplay` + `BannerControls` (author-only) above `FocusHeader`. Wire up `useBanner` hook. Add SEO component (currently missing — import and wire up with title, description, banner image).
10. **`src/app/pages/point-detail-page.tsx`** -- Add `BannerDisplay` (no controls) above `FocusHeader`. Add SEO component (currently missing — import and wire up with statement, description, banner image).
11. **`src/app/pages/profile-page-v2.tsx`** -- Add `BannerDisplay` + `BannerControls` (owner-only) above the profile header card. Restructure avatar to overlap the banner bottom edge (LinkedIn-style). Add lazy generation trigger for profiles without banners. Pass `bannerUrl` to existing SEO component.
12. **`api/og.ts`** -- Update `ogForStory()` to query `banner_url` from stories table and return it as `image`. Update `ogForPoint()` similarly. Update `ogForProfile()` to query `banner_url` from profiles table. **OG image fallback chain for profiles:** `banner_url` → `avatar_url` → `DEFAULT_IMAGE` (currently uses `avatar_url` → `DEFAULT_IMAGE`).
13. **`src/app/components/seo.tsx`** -- No structural changes needed. Pages will pass `bannerUrl` via the existing `image` prop. Update `og:image:width`/`og:image:height` to 1200/630 when a banner URL is present (not the default 512x512 icon).

#### Build Sequence

**Phase 1: Schema + Storage (no UI changes)**
1. Create migration for `banner_url` columns on stories, points, profiles + `banner_generation_attempted` on profiles.
2. Create migration for `banners` storage bucket.
3. Run `./scripts/migrate.sh`.

**Phase 2: Edge Function Generalization**
4. Generalize `generate-event-banner` -> `generate-banner` edge function. Add entity type routing, prompt builders, authorization per type.
5. Update `banner-utils.ts` client to call generalized function.
6. Deploy edge function: `supabase functions deploy generate-banner`.
7. Verify events still work (regression check).

**Phase 3: Shared Components**
8. Extract `BannerDisplay` and `BannerControls` from `EventDetail.tsx`.
9. Create `useBanner` hook.
10. Refactor `EventDetail.tsx` to use shared components. Verify no visual regression.

**Phase 4: Stories**
11. Add `bannerUrl` to Story types and `stories-service-real.ts` mappers.
12. Add fire-and-forget generation in `createStory()`.
13. Add `BannerDisplay` + `BannerControls` to `story-detail-page.tsx`.
14. Update `ogForStory()` in `api/og.ts` to return `banner_url`.

**Phase 5: Points**
15. Add `bannerUrl` to Point types and `points-service-real.ts` mappers.
16. Add fire-and-forget generation in `createPoint()`.
17. Add `BannerDisplay` (no controls) to `point-detail-page.tsx`.
18. Update `ogForPoint()` in `api/og.ts`.

**Phase 6: Profiles**
19. Add `bannerUrl` + `bannerGenerationAttempted` to Profile types and `api.ts` mappers.
20. Add lazy generation trigger in `profile-page-v2.tsx` for profiles with no banner.
21. Add `BannerDisplay` + `BannerControls` to `profile-page-v2.tsx` with LinkedIn-style avatar overlap.
22. Update `ogForProfile()` in `api/og.ts`.

**Phase 7: OG + SEO Polish**
23. Update `seo.tsx` to use 1200x630 dimensions when banner image is present.
24. Smoke test OG previews for all entity types.

## Pre-deploy Checklist

### Secrets to provision
- No new secrets needed. The edge function already uses `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` -- all provisioned. The new `generate-banner` function uses the same secrets.

### Deploy commands
- [ ] `supabase functions deploy generate-banner --project-ref <ref>` (after renaming/generalizing the edge function)
- [ ] If the function is renamed: delete the old function `supabase functions delete generate-event-banner --project-ref <ref>`
- [ ] Trigger Vercel redeploy for OG endpoint changes (serverless function)

### Post-deploy verification
- [ ] Create a story -> verify banner appears on detail page after refresh
- [ ] Create a point -> verify banner appears on detail page after refresh
- [ ] Visit a profile -> verify banner generates on first visit
- [ ] Test regenerate/remove on story and profile
- [ ] Verify event banners still work (regression)
- [ ] Test OG previews: share story/point/profile URLs in Telegram/LinkedIn preview tools
- [ ] Check Sentry for new errors in first 10 minutes

---

## Test Coverage Strategy

### Test Files

| File | Type | What it covers |
|------|------|----------------|
| `e2e/integration/p504-banner-migration.spec.ts` | Integration (DB) | Schema existence (banner_url on stories/points/profiles, banner_generation_attempted on profiles), storage bucket, RLS (author/owner write, non-author/non-owner blocked, points NO UPDATE policy, service_role bypass) |
| `src/tests/generateBanner.test.ts` | Unit (Vitest) | Prompt construction per entity type, input validation (truncation to 200/100 chars, control char stripping), request body validation (entityType routing, UUID format), edge cases (empty name fallback, invalid color) |
| `e2e/p504-banners.spec.ts` | E2E (Playwright) | Story/point/profile banner display, author/owner controls visibility, non-owner/anonymous no controls, remove banner + gradient fallback, regenerate after remove, LinkedIn-style avatar overlap on profiles |
| `e2e/a11y/p504-banner-accessibility.spec.ts` | Accessibility | Alt text (story title, point statement, profile name), gradient role="img" + aria-label, keyboard navigation (Tab/Enter/Space), aria-busy on loading, role="alert" on errors |
| `e2e/p504-smoke.spec.ts` | Smoke | All pages load without console errors (story/point/profile with and without banners), OG endpoint returns non-500 for all entity types |
| `features/uat/p504.md` | UAT (manual) | 10 scenario groups: story display, story controls, point display (no controls), profile display, profile controls, auto-generation on creation, profile lazy generation, OG social previews, edge cases (rate limit, 404, /live exclusion, feed exclusion), accessibility |

### Coverage Matrix

| Acceptance Criterion | Integration | Unit | E2E | A11y | Smoke | UAT |
|---------------------|:-----------:|:----:|:---:|:----:|:-----:|:---:|
| Story banner_url column exists | x | | | | | |
| Point banner_url column exists | x | | | | | |
| Profile banner_url + attempted columns | x | | | | | |
| Banners storage bucket | x | | | | | |
| RLS: author can update story banner | x | | | | | |
| RLS: non-author blocked on stories | x | | | | | |
| RLS: owner can update profile banner | x | | | | | |
| RLS: non-owner blocked on profiles | x | | | | | |
| RLS: no UPDATE on points | x | | | | | |
| Prompt construction per entity type | | x | | | | |
| Input truncation + sanitization | | x | | | | |
| Request body validation | | x | | | | |
| Story banner displays on detail | | | x | | x | x |
| Author sees controls on story | | | x | | | x |
| Non-author no controls on story | | | x | | | x |
| Remove story banner -> gradient | | | x | | | x |
| Regenerate story banner | | | x | | | x |
| Point banner displays on detail | | | x | | x | x |
| No controls on points for anyone | | | x | | | x |
| Profile banner displays | | | x | | x | x |
| Owner sees controls on profile | | | x | | | x |
| Non-owner no controls on profile | | | x | | | x |
| LinkedIn-style avatar overlap | | | x | | | x |
| Gradient fallback display | | | x | | x | x |
| Banner alt text (story/point/profile) | | | | x | | x |
| Gradient role="img" + aria-label | | | | x | | x |
| Keyboard accessible controls | | | | x | | x |
| aria-busy on loading | | | | x | | x |
| role="alert" on errors | | | | x | | |
| Pages load without errors | | | | | x | |
| OG endpoint responds for all types | | | | | x | x |
| Auto-generation on creation | | | | | | x |
| Profile lazy generation | | | | | | x |
| Rate limiting | | | | | | x |
| No banners on /live | | | | | | x |
| No banners on feed cards | | | | | | x |

---

## Implementation Tasks

### Consistency Check Results

**AC Coverage:** All 19 acceptance criteria map to at least one build step. No gaps.

**UX-Architecture Drift:** None. Profile dual-trigger (creation + lazy visit) is a superset of UX's "first visit" — no conflict. Keyword search fallback uses Gemini (not Unsplash) per both UX and architecture. Point "no controls" aligned across both sections.

**Security Blockers:** All addressed in correct build order. Points `banner_url` written via `service_role` only (no UPDATE RLS needed). Profile lazy generation guarded by auth check. Prompt injection mitigated by truncation + delimiter + server-side data fetch.

---

### Task Manifest

#### T1: Schema Migration — banner columns + storage bucket
- **Files:**
  - `supabase/migrations/20260313141528_p504_banner_columns.sql` (create)
  - `supabase/migrations/20260313141529_p504_banners_bucket.sql` (create)
- **Spec refs:** Implementation Approach > Phase 1 (lines 701-704), Architecture Decisions 2 + 8 (lines 533-538, 602-608), Security Review > RLS + Storage (lines 614-620)
- **Tests:** `e2e/integration/p504-banner-migration.spec.ts` — schema existence, bucket creation, RLS policies
- **Depends on:** nothing
- **Verify:** Migrations applied via Management API; columns confirmed on stories/points/profiles; banners bucket exists
- [x] Complete

#### T2: Edge Function Generalization — generate-event-banner → generate-banner
- **Files:**
  - `supabase/functions/generate-event-banner/index.ts` (modify — rename dir to `generate-banner`, add entity type routing, prompt builders, auth per type)
- **Spec refs:** Implementation Approach > Phase 2 (lines 706-711), Architecture Decisions 1 + 3 + 4 (lines 522-568), Security Review > Authorization + Input Validation + AI Prompt Security (lines 629-660)
- **Tests:** `src/tests/generateBanner.test.ts` — prompt construction, input validation, request body routing
- **Depends on:** T1 (needs banner columns + bucket to exist)
- **Verify:** Deploy to test project; call with `entityType: 'event'` and verify existing event banner flow still works (regression); call with `entityType: 'story'` and verify image stored in `banners/stories/{id}/`
- [x] Complete

#### T3: Client Banner Utils — generalize generateAIBanner
- **Files:**
  - `src/app/prototypes/events/banner-utils.ts` (modify — generalize signature to accept `entityType` + entity-specific fields, update edge function URL)
- **Spec refs:** Implementation Approach > Files to Modify #2 (lines 686-687), Phase 2 step 5 (line 708)
- **Tests:** (covered by E2E tests in T7-T10 when wired up)
- **Depends on:** T2 (edge function must accept new signature)
- **Verify:** TypeScript compiles; existing event banner generation call sites still work
- [x] Complete

#### T4: Shared Components — BannerDisplay + BannerControls + useBanner hook
- **Files:**
  - `src/app/components/shared/banner/BannerDisplay.tsx` (create)
  - `src/app/components/shared/banner/BannerControls.tsx` (create)
  - `src/app/components/shared/banner/use-banner.ts` (create)
  - `src/app/components/shared/banner/index.ts` (create — barrel export)
- **Spec refs:** Implementation Approach > Phase 3 (lines 712-715), Architecture Decision 6 (lines 580-592), UX > Component Analysis (lines 447-463), UX > Accessibility (lines 415-428)
- **Tests:** `e2e/a11y/p504-banner-accessibility.spec.ts` — alt text, gradient role="img", aria-busy, keyboard nav
- **Depends on:** T3 (useBanner calls generalized `generateAIBanner`)
- **Verify:** Components render in isolation; gradient fallback displays correctly; controls show/hide based on props
- [x] Complete

#### T5: EventDetail Refactor — consume shared banner components
- **Files:**
  - `src/app/prototypes/events/components/EventDetail.tsx` (modify — replace inline banner JSX with BannerDisplay + BannerControls)
  - `src/app/data/events-service-real.ts` (modify — update `generateAIBanner()` call to use new signature with `entityType: 'event'`)
- **Spec refs:** Implementation Approach > Phase 3 step 10 (line 715), Files to Modify #7 + #8 (lines 691-692)
- **Tests:** `e2e/p504-smoke.spec.ts` — event pages load without errors (regression)
- **Depends on:** T4 (shared components must exist)
- **Verify:** Event detail page looks identical before and after refactor; regenerate/remove still work; no console errors
- [x] Complete

#### T6: Story Types + Service — bannerUrl mapping + fire-and-forget generation
- **Files:**
  - `src/app/types/index.ts` (modify — add `bannerUrl` to Story/StoryWithAuthor types, `banner_url` to Db counterparts)
  - `src/app/data/stories-service-real.ts` (modify — map `banner_url` in selects/mappers, add fire-and-forget in `createStory()`)
- **Spec refs:** Implementation Approach > Phase 4 steps 11-12 (lines 718-719), Schema State > Stories (line 502)
- **Tests:** (covered by E2E in T7)
- **Depends on:** T1 (column must exist), T3 (generalized banner utils)
- **Verify:** Create a story; verify `banner_url` is populated after generation completes; query returns `bannerUrl` field
- [x] Complete

#### T7: Story Detail Page — banner display + controls + OG
- **Files:**
  - `src/app/pages/story-detail-page.tsx` (modify — add BannerDisplay + BannerControls above FocusHeader, wire useBanner hook)
  - `api/og.ts` (modify — update `ogForStory()` to query and return `banner_url`)
- **Spec refs:** Implementation Approach > Phase 4 steps 13-14 (lines 720-721), UX > Screen Design 2a (lines 270-311), UX > Edge Cases (lines 395-411)
- **Tests:** `e2e/p504-banners.spec.ts` — story banner display, author controls, non-author no controls, remove→gradient, regenerate; `e2e/p504-smoke.spec.ts` — story page loads
- **Depends on:** T4 (shared components), T6 (story types + service)
- **Verify:** Story detail page shows banner; author sees controls; non-author does not; OG preview returns banner URL
- [x] Complete

#### T8: Point Types + Service + Detail Page — bannerUrl mapping + fire-and-forget + display
- **Files:**
  - `src/app/types/index.ts` (modify — add `bannerUrl` to Point/PointWithCreator/PointWithCounts types)
  - `src/app/data/points-service-real.ts` (modify — map `banner_url`, add fire-and-forget in `createPoint()`)
  - `src/app/pages/point-detail-page.tsx` (modify — add BannerDisplay only, no controls)
  - `api/og.ts` (modify — update `ogForPoint()` to return `banner_url`)
- **Spec refs:** Implementation Approach > Phase 5 steps 15-18 (lines 724-728), UX > Screen Design 2b (lines 312-344)
- **Tests:** `e2e/p504-banners.spec.ts` — point banner display, no controls for anyone; `e2e/p504-smoke.spec.ts` — point page loads
- **Depends on:** T1 (column), T3 (banner utils), T4 (shared components)
- **Verify:** Point detail page shows banner; no controls visible for any user; OG preview returns banner URL
- [x] Complete

#### T9: Profile Types + Service — bannerUrl + bannerGenerationAttempted mapping
- **Files:**
  - `src/app/types/index.ts` (modify — add `bannerUrl`, `bannerGenerationAttempted` to Profile type)
  - `src/app/data/api.ts` (modify — map `banner_url`, `banner_generation_attempted` in Profile mapper)
- **Spec refs:** Implementation Approach > Phase 6 step 19 (line 730), Files to Modify #6 (line 690)
- **Tests:** (covered by E2E in T10)
- **Depends on:** T1 (columns must exist)
- **Verify:** Profile queries return `bannerUrl` and `bannerGenerationAttempted` fields
- [x] Complete

#### T10: Profile Page — banner display + controls + lazy generation + avatar overlap + OG
- **Files:**
  - `src/app/pages/profile-page-v2.tsx` (modify — add BannerDisplay + BannerControls, LinkedIn-style avatar overlap, lazy generation trigger)
  - `api/og.ts` (modify — update `ogForProfile()` to return `banner_url` with fallback chain: banner → avatar → default)
- **Spec refs:** Implementation Approach > Phase 6 steps 20-22 (lines 731-734), UX > Screen Design 2c (lines 346-375), Architecture Decision 5 (lines 570-578)
- **Tests:** `e2e/p504-banners.spec.ts` — profile banner display, owner controls, non-owner no controls, avatar overlap; `e2e/p504-smoke.spec.ts` — profile page loads
- **Depends on:** T4 (shared components), T9 (profile types + service)
- **Verify:** Profile page shows banner with avatar overlapping bottom edge; owner sees controls; lazy generation triggers for profiles without banners; OG returns banner_url
- [x] Complete

#### T11: SEO Polish — OG image dimensions
- **Files:**
  - `src/app/components/seo.tsx` (modify — set `og:image:width`/`og:image:height` to 1200/630 when banner URL present)
- **Spec refs:** Implementation Approach > Phase 7 step 23 (line 736), Files to Modify #13 (line 697)
- **Tests:** `e2e/p504-smoke.spec.ts` — OG endpoint responds for all entity types
- **Depends on:** T7, T8, T10 (pages must pass bannerUrl to SEO component)
- **Verify:** View page source; confirm `og:image:width` is 1200 and `og:image:height` is 630 when banner is present
- [x] Complete

### Dependency Graph

```
T1 (schema + bucket)
├── T2 (edge function) → T3 (client utils) → T4 (shared components)
│                                             ├── T5 (EventDetail refactor)
│                                             ├── T7 (story page) ← T6 (story types)
│                                             ├── T8 (point types + page)
│                                             └── T10 (profile page) ← T9 (profile types)
└── T6, T8, T9 (all need columns from T1)

T11 (SEO polish) ← T7, T8, T10
```

### Critical Path

T1 → T2 → T3 → T4 → T5 (regression gate) → T7/T8/T10 (parallel per entity) → T11

### Estimated Task Count: 11 tasks

| Phase | Tasks | Files | Concern |
|-------|-------|-------|---------|
| 1: Schema | T1 | 2 create | DB migration + storage |
| 2: Edge Function | T2, T3 | 2 modify | Server + client generalization |
| 3: Shared Components | T4, T5 | 4 create, 2 modify | UI extraction + regression |
| 4: Stories | T6, T7 | 3 modify | Types, service, page, OG |
| 5: Points | T8 | 4 modify | Types, service, page, OG |
| 6: Profiles | T9, T10 | 4 modify | Types, service, page, OG |
| 7: SEO | T11 | 1 modify | OG dimensions |
