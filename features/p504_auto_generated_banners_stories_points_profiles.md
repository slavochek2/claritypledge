---
status: week
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
delivery_stage: 3-arch-review
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-13
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

**Profile page specifics:** The banner spans the full width of the content area (`max-w-2xl` on profile). On mobile, the banner touches the edges. On desktop, it respects the content max-width and has rounded top corners.

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
