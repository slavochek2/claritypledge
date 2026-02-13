---
status: done
completed_at: '2026-02-06'
type: story
priority: p1
tags: [stories]
milestone: C1
blockedBy: [p117]
prepped_date: '2026-02-06'
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed-with-notes
---

# P126: Create Story + View Story

> As a logged-in user, I want to write a Story (with visibility control) and view it at its own URL, so that others can verify their understanding of my perspective.

## Context

P117 built the backend (stories, points, positions, calibration). This feature lets users create Stories in the main app and view them — starting simple (manual text entry), with AI refinement and Points extraction added in later specs.

**Depends on:** P117 merged to main
**Unlocks:** Real data in `/story/:id`, profile stories, H-Stories validation ("do Stories solve cold start?")

**H-Stories success metric:** >20% of logged-in users create at least one story in first month. <10% = hypothesis fails, pivot needed.

## Scope (ships as one unit)

### Create Story (`/create`)

**Goal:** User writes a story with visibility control, saves it, gets redirected to view it.

**Route:** `/create` (auth-gated, standard layout)

**Form fields:**
- **Title** (required, text input)
- **Story text** (required, textarea, `rows={6}` minimum)
  - Soft character marker at 280 chars (visual indicator like Twitter's circle — not a hard limit)
  - DB column is TEXT (unlimited), but 280 is the "sweet spot" for verification
  - Reuse char counter pattern from `settings-page.tsx:261-278`
- **Visibility selector** (required, default: `public`)
  - Three options with icon + label + tooltip:
  - `public` — Globe icon — "Anyone can see this"
  - `shared` — Lock icon — "Private, visible only in /live sessions you share it in"
  - `private` — Lock icon — "Only you can see this"
  - Port `VisibilityBadge` + `MobileTooltip` from prototype (`src/app/prototypes/linkedin-like/components/shared/`)
  - On desktop: hover shows tooltip description
  - On mobile: tap shows tooltip (auto-dismiss after 2s, existing MobileTooltip pattern)

**Save behavior:**
- Save button: `bg-blue-500 hover:bg-blue-600` (design system primary CTA)
- Loading state: button shows spinner + "Saving...", disabled during save (reuse pattern from `settings-page.tsx:282-298`)
- Success → redirect to `/story/:id`
- Error → toast with "Save failed" + retry option

**Auth guard:**
- No session → redirect to `/login`
- `is_verified` check not needed (magic link flow guarantees verified status — see prep-spec notes)

**Nav wiring:**
- `simple-navigation.tsx:108-116` already has a disabled sparkles "Create" button with toast
- Replace toast `onClick` with `<Link to="/create">`

### View Story (`/story/:id`)

**Goal:** Story detail page in main app (not just prototype).

**Route:** `/story/:id` (public, no auth required for public stories; auth-gated for private/shared)

**Display:**
- Story title, content, author info (avatar, name, role)
- Visibility badge (port from prototype)
- Created date
- "X understood" count
- Link back to author's profile
- If author is viewing: edit/delete actions (future — not in P126, but leave space)

**Adapt from:** Prototype's `StoryDetail.tsx` (`src/app/prototypes/linkedin-like/components/StoryDetail.tsx`)

**Visibility enforcement:**
- `public` stories: visible to everyone
- `shared` stories: visible to author + participants of /live sessions where it was shared (for now, just show to author — /live integration comes later)
- `private` stories: visible to author only
- Non-author viewing private/shared → 404 or "This story is private" message

## Migration Required

Add `visibility` column to `stories` table:

```sql
-- Add visibility column
ALTER TABLE stories ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'shared', 'private'));

-- Update RLS SELECT policy to respect visibility
DROP POLICY IF EXISTS "Stories are publicly readable" ON stories;
CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
  );
-- Note: 'shared' visibility enforcement for /live sessions deferred to /live integration
```

## Files

| File | Purpose |
|------|---------|
| `src/app/pages/create-story-page.tsx` | Create form with visibility selector |
| `src/app/pages/story-detail-page.tsx` | Story detail view |
| `src/app/components/shared/visibility-badge.tsx` | Port from prototype (VisibilityBadge) |
| `src/app/components/shared/mobile-tooltip.tsx` | Port from prototype (MobileTooltip) |
| `src/App.tsx` | Add `/create` route, update `/story/:id` route |
| `src/app/components/layout/simple-navigation.tsx` | Wire "Create" nav button (replace toast with Link) |
| `supabase/migrations/YYYYMMDD_add_story_visibility.sql` | Add visibility column + update RLS |

## Mixpanel Events

- `story_creation_started` — page loaded
- `story_saved` — success, with `{ story_id, char_count, visibility }`
- `story_creation_abandoned` — exit without saving (if trackable via `beforeunload`)
- `story_viewed` — `/story/:id` loaded, with `{ story_id, is_own_story }`

## Acceptance Criteria

- [x] `/create` accessible to logged-in users only
- [x] Unauthenticated → redirect to `/login`
- [x] Form validates: title required, story content required
- [x] Visibility selector with 3 options (public/shared/private), default public
- [x] Visibility tooltip works on hover (desktop) and tap (mobile)
- [x] Character counter shows at 280 soft marker
- [x] Save button shows loading spinner, disabled during save
- [x] Save creates story with correct visibility in DB
- [x] Success → redirect to `/story/:id`
- [x] Error → toast with retry
- [x] `/story/:id` displays story, author, visibility badge, date
- [x] Private stories only visible to author
- [x] Story version trigger auto-creates v1 (no manual version creation needed)
- [x] Mixpanel events fire
- [x] `./scripts/pre-commit-checks.sh` passes

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Manual not AI for first version | Validates H-Stories without AI complexity | If Stories don't solve cold start, AI work is wasted |
| Manual not Sifter | Sifter = AI extraction (future spec). Manual validates demand first | 2026-01-26 "Sifter-first" assumed AI; KISS says manual validates faster |
| Points deferred | Build after OQ-7 resolved | "Holistic first" per 2026-02-02 decision |
| Ship create + view together | Complete user flow: create → see your story | Shipping create without view leaves redirect nowhere |
| Mixpanel from day one | Track adoption immediately | Can't validate H-Stories without data |
| Three visibility levels | Public, shared (/live-only), private | Matches prototype + definitions.md visibility model |
| Auth redirect to `/login` | Lower friction than `/sign-pledge` | Creating stories is for existing users, not onboarding |
| No deletion UI in P126 | Defer to future — add delete on `/story/:id` when needed | Keep scope tight |

## Reference Files

- **Prototype StoryCard:** `src/app/prototypes/linkedin-like/components/StoryCard.tsx`
- **Prototype StoryDetail:** `src/app/prototypes/linkedin-like/components/StoryDetail.tsx`
- **Prototype VisibilityBadge:** `src/app/prototypes/linkedin-like/components/shared/VisibilityBadge.tsx`
- **Prototype MobileTooltip:** `src/app/prototypes/linkedin-like/components/shared/MobileTooltip.tsx`
- **Services:** `src/app/data/stories-service*.ts` (from P117)
- **Types:** `src/app/types/index.ts`
- **Auth guard pattern:** `src/app/pages/settings-page.tsx` (lines 50-55)
- **Form pattern (char counter, loading):** `src/app/pages/settings-page.tsx` (lines 261-298)
- **Nav button (already exists):** `src/app/components/layout/simple-navigation.tsx` (lines 108-116)

## Future Phases (separate specs when needed)

### AI Story Refinement

"Help me refine" button → AI paraphrases to ~280 chars → user rates capture accuracy → iterative loop. See Sifter quality criteria in `.claude/commands/slava/content/sifter-story.md`.

### Points Extraction

AI extracts falsifiable Points from Story. Deferred until OQ-7 resolved ("do we need Points for verification?").

### Points Display Toggle

Feature flag to gate Points in main app UI. Default OFF until Points extraction ships.

### Parking Lot (not in P126 scope)

- **Real AI backend** — Supabase Edge Function / n8n / GCP. Decide when AI phases begin.
- **Story deletion UI** — Add to `/story/:id` when author is viewing.
- **Shared visibility enforcement** — Gate by /live session participation. Build with /live integration.

## Prep-Spec Notes

Reviewed 2026-02-06 with 3 agents (UX, Architect, Alignment).

**Key findings addressed:**
- Visibility added with 3 levels + migration + RLS update
- Phase 1+2 merged (create + view ship together)
- Loading state, char counter, auth redirect specified
- File renamed from `p126_sifter_create.md` (Sifter ≠ manual creation)
- H-Stories success metric added
- Nav button already exists — just swap toast for Link
- `is_verified` check not needed (magic link guarantees verified status)
- Story version trigger handles v1 automatically

**UX notes for future AI phases:**
- Add "Write manually" bypass for users who don't trust AI
- Define error states (AI timeout, network failure)
- Mobile keyboard handling (bottom sheet for rating UI)
- Handle "all points rejected" state

**Post-implementation:** Run `/kdd` to capture story creation rates, story lengths, H-Stories validation signal.
