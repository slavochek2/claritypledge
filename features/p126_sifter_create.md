---
status: today
type: story
tags: [sifter, p117, h-stories]
blockedBy: [p117]
---

# P126: Create Story

> As a logged-in user, I want to write a Story and save it to my profile, so that others can verify their understanding of my perspective.

## Context

P117 built the backend (stories, points, positions, calibration). This feature lets users create Stories in the main app — starting simple (manual text entry), with AI refinement and Points extraction added in later phases.

**Depends on:** P117 merged to main
**Unlocks:** Real data in `/story/:id`, profile stories, H-Stories validation ("do Stories solve cold start?")

## Phased Build

We're building incrementally. Each phase ships independently.

### Phase 1: Manual Story Creation ← START HERE

**Goal:** User writes a story, saves it, sees it on their profile.

**Scope:**
- `/create` route (auth-gated, standard layout)
- Simple form: title + story text (~280 chars, can be longer)
- Save button → `storiesService.createStory()`
- Success → redirect to `/story/:id` (or profile if story route not ready)
- Error → toast with retry

**Files:**
| File | Purpose |
|------|---------|
| `src/app/pages/create-story-page.tsx` | Page component |
| `src/App.tsx` | Add `/create` route |
| `src/app/components/layout/simple-navigation.tsx` | Wire "Create" in nav (if not already) |

**Mixpanel events:**
- `story_creation_started` — page loaded
- `story_saved` — success, with `{ story_id, char_count }`
- `story_creation_abandoned` — exit without saving (if trackable)

**Acceptance Criteria:**
- [ ] `/create` accessible to logged-in users
- [ ] Unauthenticated → redirect to `/login`
- [ ] Form validates (title required, story required)
- [ ] Save works, story appears on profile
- [ ] Mixpanel events fire
- [ ] `./scripts/pre-commit-checks.sh` passes

---

### Phase 2: Story Detail Route in Main App

**Goal:** `/story/:id` works in main app (not just prototype).

**Scope:**
- Add `/story/:id` route to `App.tsx`
- `StoryDetailPage` component (can adapt from prototype's `StoryDetail.tsx`)
- Display story, author, created date
- Link back to author's profile

**Prerequisite:** Phase 1 complete (need stories to view)

---

### Phase 3: AI Story Refinement (Optional Enhancement)

**Goal:** "Help me refine" button for users who want AI assistance.

**Scope:**
- User writes brain dump → clicks "✨ Refine"
- AI paraphrases to ~280 char first-person story
- User rates 0-10 how well AI captured meaning
- If <10 → show 3 interpretation options + "Add more details"
- Loop until 10 or escape hatch (3 attempts → "Save as-is")

**Files:**
| File | Purpose |
|------|---------|
| `src/app/data/sifter-ai-service.interface.ts` | AI service interface |
| `src/app/data/sifter-ai-service-mock.ts` | Mock implementation |
| `src/app/data/sifter-ai-service.ts` | Export (mock for now) |

**Note:** AI service interface can be built in parallel with Phase 1/2 since it has no dependencies.

**Prerequisite:** Phase 1 complete
**Blocked by:** None (can build interface in parallel)

---

### Phase 4: Points Extraction

**Goal:** AI extracts falsifiable Points from Story.

**Scope:**
- After story saved, offer "Extract points from this story"
- AI extracts 3 Points
- User rates each -3 to +3 (Likert)
- "More" → 3 additional points
- "Done" → approved points (+2/+3) saved and linked

**Prerequisite:**
- Phase 3 complete (AI service exists)
- OQ-7 resolved ("do we need Points for verification?" — currently answer is "holistic first")

**Note:** Per 2026-02-02 decision, Points are deferred until Phase 4a (holistic human verification) proves they're needed. Build this only after H-Stories validates and OQ-7 is answered.

---

### Phase 5: Points Display Toggle

**Goal:** Control when Points appear in main app UI.

**Scope:**
- Add `SHOW_POINTS` feature flag (env var or constant)
- Gate Points tab on profiles
- Gate linked Points display on Story cards
- Default: OFF until Phase 4 ships

**Prerequisite:** Phase 4 complete

---

### Parking Lot (not in P126 scope)

These came up in prep-spec but belong elsewhere:

- **Bottom nav for unverified users** — show nav, gate behind "confirm email" page. Separate feature.
- **Real AI backend** — Supabase Edge Function / n8n / GCP. Decide after mock UI validates.
- **Prompt iteration strategy** — where prompts live. Decide when iterating on AI quality.

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Start with manual, not AI | Validates H-Stories without AI complexity | If Stories don't solve cold start, AI work is wasted |
| Points deferred | Build after OQ-7 resolved | "Holistic first" per 2026-02-02 decision |
| One spec, phased checklist | Tracks sequence without feature sprawl | Each phase is small, ships independently |
| Mixpanel from Phase 1 | Track adoption from day one | Can't validate H-Stories without data |

## Reference Files

- **Prototype:** `src/app/prototypes/linkedin-like/components/Sift.tsx`
- **Services:** `src/app/data/stories-service*.ts`, `points-service*.ts` (from P117)
- **Types:** `src/app/types/index.ts`
- **Auth pattern:** `src/app/pages/settings-page.tsx`
- **Sifter quality criteria:** `.claude/commands/slava/content/sifter-story.md`, `sifter-point.md`, `sifter-definitions.md`

## Prep-Spec Notes

Reviewed 2026-02-06 with 4 agents (UX, Architect, Lean Coach, Alignment).

**Key findings addressed:**
- Build sequence aligned (Phase 1 = manual, not AI)
- Points deferred per OQ-7
- P117 merge as explicit blocker
- Mixpanel events added
- `/story/:id` route added as Phase 2

**UX notes for Phase 3 (when we get there):**
- Add "Write manually" bypass for users who don't trust AI
- Define error states (AI timeout, network failure)
- Mobile keyboard handling (bottom sheet for rating UI)
- Handle "all points rejected" state
