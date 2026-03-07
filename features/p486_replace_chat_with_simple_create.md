---
status: in-progress
type: feature
rank: 500004.5
workstream: C1
created_date: 2026-03-06
flow: dev
delivery_stage: 4-tests-ready
tags: [simplification, story-creation]
uat_file: features/uat/p486.md
test_files:
  - e2e/p486-smoke.spec.ts
  - e2e/p486-create-with-point.spec.ts
  - e2e/p486-accessibility.spec.ts
---

# P486: Replace /chat "Add your story" with simple /create form

## Problem

All "Add your story" CTAs route to `/chat` which uses a broken/unpolished AI-guided flow (StoryGuideChat + Gemini API). C1 is focused on facilitated sessions, not self-service AI chat. First real pairs will hit this broken path. The working `/create` page already exists and does the job.

## Solution

Redirect all "Add your story" entry points from `/chat?pointId=X` to `/create?pointId=X`. Enhance `CreateStoryPage` to:
1. Read `pointId` from query params
2. Show point context using existing `ChatContextHeader` component (read-only: point text + position badge + link to point detail)
3. Call `linkPointToStory()` after `createStory()` on save

### Entry points to update (8 files)

| File | CTA text | Current target | Change |
|------|----------|---------------|--------|
| `src/app/components/social/point-card-with-links.tsx` | "Add your story" (4 instances) | `/chat?from=position&pointId=X` | → `/create?pointId=X` |
| `src/app/pages/point-detail-page.tsx` | "Add your story" | `/chat?from=position&pointId=X` | → `/create?pointId=X` |
| `src/app/components/social/story-card-with-links.tsx` | "+ add story" | `/chat?from=position&pointId=X` | → `/create?pointId=X` |
| `src/app/components/social/StoryCardDetail.tsx` | "+ add story" | `/chat?from=position&pointId=X` | → `/create?pointId=X` |
| `src/app/pages/idea-detail-page.tsx` | link | `/chat?ideaId=X` | → `/create?ideaId=X` |
| `src/app/components/layout/bottom-nav.tsx` | focus route detection (line 33) | `'/chat'` in focusRoutes array | → replace with `'/create'` |
| `src/app/pages/TreePage.tsx` | dev nav link (line 10) | `path: '/chat'` | → `path: '/create'` |
| `src/app/pages/profile-page-v2.tsx` | "Create a Story" | `/create` (already correct) | No change |

### Component reuse (zero new components)

| Component / pattern | Status |
|---|---|
| `CreateStoryPage` layout, textarea, visibility, auth gate | REUSE as-is |
| `ChatContextHeader` (P467, slim read-only banner) | REUSE in new context |
| `storiesService.createStory()` | REUSE |
| `storiesService.linkPointToStory()` | ADD to save handler (~3 lines) |
| `useVerificationGate` | REUSE |
| Analytics (`story_created`) | REUSE, add `linked_point_id` |

### Flow (with pointId)

```
"Add your story" click
       |
       v
/create?pointId=X
       |
       v
CreateStoryPage
  +-- fetch point text + user position (1 query)
  +-- ChatContextHeader (pin + text + "You agree" + link)
  +-- Textarea (existing)
  +-- Visibility selector (existing)
  +-- [Publish Story] button (existing)
       |
       v
on save:
  1. createStory()
  2. linkPointToStory(storyId, pointId, userId)
  3. navigate(/story/:id)
```

### Flow (without pointId) — unchanged

```
/create (no params)
  = current CreateStoryPage behavior, no context banner
```

### Consolidation: /chat route

Architect to decide: redirect `/chat` to `/create` (preserve bookmarks) vs remove entirely. StoryGuideChat and related components may be candidates for removal or archival.

## UX Design

### 1. User Flows

#### Flow 1: Happy Path — "Add your story" from point card (with pointId)

```
User sees point card with "Add your story →" CTA
       |
       v
Click → navigates to /create?pointId=X
       |
       v
Page loads:
  - Auth check (existing) — if unauthenticated → /signup
  - Context banner area: skeleton pulse (1 line, 48px height)
  - Textarea: disabled, placeholder grayed
  - Focus: nowhere (wait for point load)
       |
       v
Point loaded successfully:
  - Skeleton → ChatContextHeader (pin icon + point text + position chip + link)
  - Textarea: enabled
  - Focus: auto-set to textarea
  - Analytics: track('story_creation_started', { linked_point_id })
       |
       v
User types story text + selects visibility
  - Character counter updates live
  - Errors cleared inline on type
       |
       v
Click "Publish Story":
  - Button: spinner + "Saving..." + disabled
  - Textarea: disabled
       |
       v
Save completes:
  1. createStory() → storyId
  2. linkPointToStory(storyId, pointId, userId)
  3. Toast: "Story saved!"
  4. Redirect to /story/:id
```

**Micro-interactions:**
- Textarea auto-focus happens AFTER point loads (not on page mount) — prevents typing before context is visible
- Keyboard: Cmd+Enter / Ctrl+Enter submits the form (same as existing behavior if present; add if not)
- Back button navigates to previous page (existing `navigate(-1)`)

#### Flow 2: Direct /create (no pointId) — Unchanged

```
/create (no params)
  - No context banner area rendered at all
  - Textarea: enabled immediately, auto-focused on mount
  - All existing CreateStoryPage behavior preserved exactly
```

#### Flow 3: Error — pointId present but point not found

```
/create?pointId=INVALID
       |
       v
Page loads:
  - Skeleton pulse in banner area
  - Textarea: disabled
       |
       v
Point fetch returns null / error:
  - Skeleton removed, no banner rendered
  - Textarea: enabled, auto-focused
  - No toast, no error message (graceful degradation)
  - Save: only createStory() — no linkPointToStory()
```

#### Flow 4: /chat URL redirect (backward compatibility)

```
/chat?from=position&pointId=X  →  301 redirect to /create?pointId=X
/chat?ideaId=Y                 →  301 redirect to /create?ideaId=Y
/chat (bare)                   →  301 redirect to /create
/clarity-chat                  →  existing redirect to /chat → cascades to /create
```

All redirects use `replace` (no back-button loop).

#### Flow 5: Partial save failure — linkPointToStory fails after createStory succeeds

```
createStory() succeeds → storyId exists
linkPointToStory() fails:
  - Toast: "Story saved! (Point link could not be saved)"
  - Still redirect to /story/:id
  - Story exists, just not linked — user can re-link manually later
  - Never block the user from seeing their saved story
```

#### Flow 6: Unauthenticated user

```
/create?pointId=X (no session)
  - Existing auth gate: redirect to /signup
  - pointId preserved: after signup → back to /create?pointId=X
  - No point fetching until auth confirmed
```

### 2. Screen Designs

#### (a) Loading state — with pointId

```
┌─────────────────────────────────────────────┐
│  ← Back                                     │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │  ← skeleton pulse
│  │        (48px, full width, rounded)      │ │     context banner area
│  └─────────────────────────────────────────┘ │
│                                              │
│  Create a Story                              │
│  Write a perspective. Others verify what     │
│  they understood.                            │
│                                              │
│  Your story                                  │
│  ┌─────────────────────────────────────────┐ │
│  │                                         │ │  ← disabled, not focusable
│  │    (textarea — grayed out)              │ │
│  │                                         │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Visibility                                  │
│  [ Public ]  [ Connections ]  [ Private ]    │
│                                              │
│  [ Publish Story ]  ← disabled              │
│                                              │
└─────────────────────────────────────────────┘
```

#### (b) Loaded — with context banner

```
┌─────────────────────────────────────────────┐
│  ← Back                                     │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ 📌  "AI will replace most jobs in..."   │ │  ← ChatContextHeader
│  │     [You agree]              [↗]        │ │     (static, not sticky)
│  └─────────────────────────────────────────┘ │
│                                              │
│  Create a Story                              │
│  Write a perspective. Others verify what     │
│  they understood.                            │
│                                              │
│  Your story                                  │
│  ┌─────────────────────────────────────────┐ │
│  │ |                                       │ │  ← focused, cursor blinking
│  │                                         │ │
│  │  Share a moment, experience, or         │ │
│  │  perspective...                         │ │
│  └─────────────────────────────────────────┘ │
│  0 characters · aim for under 280            │
│                                              │
│  Visibility                                  │
│  [•Public ]  [ Connections ]  [ Private ]    │
│                                              │
│  [ Publish Story ]                           │
│                                              │
└─────────────────────────────────────────────┘
```

#### (c) Plain /create — no pointId

```
┌─────────────────────────────────────────────┐
│  ← Back                                     │
│                                              │
│  Create a Story                              │  ← no banner area at all
│  Write a perspective. Others verify what     │
│  they understood.                            │
│                                              │
│  Your story                                  │
│  ┌─────────────────────────────────────────┐ │
│  │ |                                       │ │  ← auto-focused
│  │                                         │ │
│  │  Share a moment, experience, or         │ │
│  │  perspective...                         │ │
│  └─────────────────────────────────────────┘ │
│  0 characters · aim for under 280            │
│                                              │
│  Visibility                                  │
│  [•Public ]  [ Connections ]  [ Private ]    │
│                                              │
│  [ Publish Story ]                           │
│                                              │
└─────────────────────────────────────────────┘
```

#### (d) Error fallback — pointId invalid

Identical to (c) — banner area removed entirely, form enabled. No error message shown. The user simply gets the plain create experience.

### 3. Edge Cases

| Scenario | Behavior |
|----------|----------|
| **pointId present, point not found** | Skeleton → removed. No banner. Plain create form. No error toast. |
| **pointId present, point deleted between click and load** | Same as "not found" — graceful fallback to plain create. |
| **linkPointToStory fails after createStory succeeds** | Toast: "Story saved! (Point link could not be saved)". Redirect to story. Story exists unlinked. |
| **createStory fails** | Toast: "Save failed. Please try again." Button re-enabled. No redirect. No linkPointToStory attempted. |
| **Network error during point fetch** | Treat as "point not found" — fallback to plain create. |
| **User not authenticated** | Redirect to /signup before any point fetch. pointId preserved in URL for return. |
| **User not verified (email)** | Existing useVerificationGate blocks on submit, not on page load. Banner still shows. |
| **Empty story content** | Existing validation: "Story content is required" error below textarea. |
| **pointId param is empty string** | Treat as no pointId — plain create, no fetch. |
| **Multiple rapid "Publish" clicks** | Button disabled on first click (existing isSaving state). |
| **Browser back after successful save** | navigate with replace — back goes to the page before /create, not back to /create. |
| **ideaId param (from idea-detail-page)** | Preserved in redirect. CreateStoryPage does not currently use ideaId — pass through as-is for future use. No banner for ideaId. |

### 4. Accessibility

**Screen reader support for context banner:**
- Banner container: `role="region"` with `aria-label="Point context"` — announces the section when navigating by landmark
- Point text: existing expandable text has `role="button"`, `aria-expanded`, `aria-label` — reused as-is
- Position chip: existing `aria-label="Your position: You agree"` — reused as-is
- External link: existing `aria-label="Open point detail"` — reused as-is

**Keyboard navigation:**
- Tab order: Back button → Banner (point text toggle → external link) → Textarea → Visibility radios → Publish button
- Point text: Enter/Space to expand/collapse (existing behavior)
- Visibility: arrow keys to move between radio options (existing radiogroup)
- Form submit: Cmd+Enter / Ctrl+Enter as keyboard shortcut

**Focus management:**
- With pointId: focus moves to textarea AFTER point loads (not before — prevents typing before context is visible)
- Without pointId: focus on textarea on mount (existing behavior, add if not present)
- After save error: focus returns to Publish button
- Loading state: textarea has `aria-disabled="true"` and `tabindex="-1"` (removed from tab order while loading)

**Loading state announcements:**
- Skeleton area: `aria-busy="true"` on the banner container during load
- When point loads: `aria-busy="false"` — screen reader picks up the new content
- Use `aria-live="polite"` on the banner container so the loaded context is announced

**Color contrast:**
- All existing — no new color values introduced. Muted foreground on background meets WCAG AA (verified in existing design system).

### 5. Responsive Design

**Mobile (320px — 768px):**
- Context banner: full-width, no horizontal padding change (existing px-4 matches page container)
- Point text truncation: single line by default, tap to expand (existing behavior works well on mobile)
- Position chip: wraps below point text if banner is too narrow — flexbox handles this (existing `flex items-center gap-2` with `flex-shrink-0` on chip)
- Textarea: full-width, min-height 150px (existing)
- Visibility buttons: horizontal scroll or wrap naturally (existing `flex gap-2` wraps on narrow screens)
- Publish button: full-width on mobile (`w-full` at `sm:` breakpoint or below)
- Touch targets: all interactive elements already 44px min (existing)

**Tablet (768px — 1024px):**
- Same as desktop — max-w-2xl container keeps form readable
- No layout changes needed

**Desktop (1024px+):**
- Centered in max-w-2xl container (existing)
- Context banner sits within the container, not full-bleed
- Comfortable reading width for point text

**Banner positioning:**
- Static (not sticky) — the banner scrolls with the form content
- No z-index needed in create page context (removed from sticky context)
- On mobile, banner is always visible above the fold since the form starts at the top

### 6. Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|-------------|-----------------|
| CreateStoryPage (form, auth gate, submit) | **Extend** | `src/app/pages/create-story-page.tsx` — add: pointId query param reading, point fetch with loading state, conditional banner rendering, linkPointToStory in submit handler, focus management after point load | No |
| ChatContextHeader (banner) | **Extend** | `src/app/components/story-guide/ChatContextHeader.tsx` — remove `sticky top-16 z-10` when used in create page context. Two options: (A) make sticky optional via prop `sticky?: boolean`, (B) override via parent wrapper class. Recommend (A) for clarity. | No |
| Skeleton loader (banner placeholder) | **Reuse** | If a skeleton/pulse component exists in the design system, reuse it. Otherwise a simple `div` with `animate-pulse bg-muted rounded h-[48px]` suffices — not a new component, just inline markup. | No |
| Textarea | **Reuse** | `src/components/ui/textarea.tsx` — no changes | No |
| Button (Publish, Back) | **Reuse** | `src/components/ui/button.tsx` — no changes | No |
| Visibility selector | **Reuse** | `src/app/data/story-visibility-options.ts` + inline radiogroup in CreateStoryPage — no changes | No |
| MobileTooltip | **Reuse** | `src/app/components/shared/mobile-tooltip.tsx` — no changes | No |
| useVerificationGate | **Reuse** | `src/app/hooks/useVerificationGate.ts` — no changes | No |
| storiesService.createStory | **Reuse** | `src/app/data/stories-service-real.ts` — no changes | No |
| storiesService.linkPointToStory | **Reuse** | `src/app/data/stories-service-real.ts` — already exists, call added in CreateStoryPage submit handler | No |
| /chat route redirect | **Extend** | `src/App.tsx` (line ~470) — replace StoryGuideChat route with `<Navigate to="/create" replace />` with query param forwarding | No |
| /clarity-chat route | **Reuse** | `src/App.tsx` (line ~482) — already redirects to /chat, which will cascade to /create | No |
| Point fetch hook/logic | **New** | No existing hook for fetching a single point + user position by pointId outside of StoryGuideChat. Inline in CreateStoryPage as a useEffect — not a standalone component or hook. ~15 lines. | No |
| "Add your story" CTA buttons (8 entry points) | **Extend** | `point-card-with-links.tsx` (4 instances), `point-detail-page.tsx`, `story-card-with-links.tsx`, `StoryCardDetail.tsx`, `idea-detail-page.tsx`, `bottom-nav.tsx`, `TreePage.tsx` — change navigation target from `/chat?...` to `/create?...`, drop `from=position` param | No |

**Decisions requiring founder input:** None — all elements are straightforward reuse or minimal extension.

## Technical Notes

### Technical Analysis

**CreateStoryPage** (`src/app/pages/create-story-page.tsx`, 255 lines)
- Auth-gated form with content textarea, visibility selector, submit handler.
- Uses `storiesService.createStory()`, `useVerificationGate`, `analytics.track`.
- No query param reading. No point context. Auth redirect does bare `navigate('/signup')` — does NOT preserve return URL or query params.
- Navigate on success uses `{ state: { justCreated: true } }` — not `replace`.

**ChatContextHeader** (`src/app/components/story-guide/ChatContextHeader.tsx`, 131 lines)
- Props: `{ pointId, pointText, userPosition }`. Renders pin icon + truncated/expandable text + position chip + external link to `/point/:id`.
- Has `sticky top-16 z-10 bg-background border-b` CSS. In /create context this is wrong — the page is a short form, not a scrolling chat. Needs to be static.
- No prop to control sticky behavior — hardcoded in className.

**StoryGuideChatPage** (`src/app/pages/story-guide-chat-page.tsx`, 127 lines)
- Reads `?from=position&pointId=X` from URL search params.
- Calls `pointsService.getPointWithUserPosition(pointId, userId)` — this makes 3 sequential Supabase calls internally: `getPoint` → `getPositionCounts` → `getMyPosition`. For P486 we only need point text + user position (no counts), so `getPoint` + `getMyPosition` in parallel is leaner.
- Also calls `storiesService.getStoryByUserAndPoint()` to detect edit mode. P486 does NOT need edit detection — always creates new. Skip this call.

**linkPointToStory position check** — StoryGuideChat (line 663-676) queries `supabase.from('positions')` to verify position ownership before linking. Two issues:
1. The table is actually `point_positions` (not `positions`) — this query likely fails silently via `.maybeSingle()` returning null, meaning the link is never created from /chat. Pre-existing bug, does not carry to P486.
2. For P486, the position check IS needed for security (prevents arbitrary user linking stories to points they haven't taken a position on). Use `pointsService.getMyPosition()` which queries the correct `point_positions` table.

**Entry points** — 8 files with actionable `/chat` references:
- `point-card-with-links.tsx`: 4 `navigate()` calls (lines 299, 327, 456, 516)
- `point-detail-page.tsx`: 1 `ctaHref` prop (line 421)
- `story-card-with-links.tsx`: 1 `chatUrl` variable (line 575)
- `StoryCardDetail.tsx`: 1 `chatUrl` variable (line 601)
- `idea-detail-page.tsx`: 1 `Link to` with `ideaId` param (line 542) — different param shape
- `bottom-nav.tsx`: `'/chat'` in `focusRoutes` array (line 33) — route detection for hiding bottom nav
- `TreePage.tsx`: `path: '/chat'` in dev nav list (line 10)

**Non-actionable references** (no code change needed):
- `tos.md`: 4 references to `/chat` in legal text — update separately as content task
- `stories-service.interface.ts`: JSDoc comment mentioning `/chat` — cosmetic, no behavior impact
- Prototype files (`premium/`, `linkedin-like/`): reference `/chat` in design docs — inactive prototypes

**Routing** (`src/App.tsx`):
- Line 28: lazy import of `StoryGuideChatPage`
- Line 470: `/chat` route renders `StoryGuideChatPage` inside `ClarityLandingLayout`
- Line 482: `/clarity-chat` redirects to `/chat`

**story-guide/ component tree** (6 files):
- `StoryGuideChat.tsx` — 700+ line AI chat component with Gemini streaming
- `ChatContextHeader.tsx` — reusable, needed by P486
- `DraftCard.tsx`, `SavedStoryChatCard.tsx`, `VisibilityAndSave.tsx`, `ThreadMessage.tsx` — chat-only, not needed

### Architecture Decisions

**Decision 1: /chat route — redirect to /create with param forwarding**

- **Chosen:** Replace the `StoryGuideChatPage` route with `<Navigate>` that forwards all query params to `/create`. The `/clarity-chat` redirect cascades through `/chat` → `/create` automatically.
- **Rationale:** Bookmarks and external links to `/chat?pointId=X` must not break. A redirect is one line of code and zero maintenance. The route component (`StoryGuideChatPage`) and its lazy import can be removed from `App.tsx`.
- **Trade-off:** `/chat` URL lives on as a redirect indefinitely. Acceptable — redirect routes have zero runtime cost.
- **Alternative rejected:** Remove `/chat` entirely (404). Breaks any shared links or browser history entries. No upside.

**Implementation:** In `App.tsx`, replace the `/chat` route element with a small wrapper component that uses `useSearchParams()` to forward query params:
```tsx
function ChatRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate to={`/create?${searchParams.toString()}`} replace />;
}
// Route: element={<ChatRedirect />}
```
Do NOT use `window.location.search` — it bypasses React Router and can be stale during client-side navigation.

**Decision 2: ChatContextHeader sticky — add optional `sticky` prop (default true)**

- **Chosen:** Add `sticky?: boolean` prop (default `true` for backward compat). When `false`, render without `sticky top-16 z-10` classes.
- **Rationale:** Clean, explicit, no CSS override hacks. One prop, one conditional class join. The component already has a clear props interface.
- **Trade-off:** Minimal API surface increase (one optional boolean).
- **Alternative rejected:** Override via parent wrapper CSS (`position: static !important`). Fragile — CSS specificity wars, harder to understand intent.

**Decision 3: Point + position fetch — two parallel service calls, no new hook**

- **Chosen:** Call `pointsService.getPoint(pointId)` and `pointsService.getMyPosition(pointId, userId)` in parallel via `Promise.all` inside a `useEffect` in `CreateStoryPage`. Inline, not a custom hook — this is a single-use pattern.
- **Rationale:** `getPointWithUserPosition` makes 3 sequential calls (getPoint → getPositionCounts → getMyPosition). P486 needs only statement text + user position — no counts. Two parallel calls = faster, leaner.
- **Trade-off:** Slightly more code than calling the single `getPointWithUserPosition` method. Saves one unnecessary DB round-trip.
- **Alternative rejected:** `getPointWithUserPosition` — includes position counts we don't need, adds latency from sequential internal calls.

**Decision 4: StoryGuideChat and related components — leave in place, do NOT archive**

- **Chosen:** Leave `StoryGuideChat.tsx` and the other 4 chat-specific components (`DraftCard`, `SavedStoryChatCard`, `VisibilityAndSave`, `ThreadMessage`) in `src/app/components/story-guide/`. Remove only the route and lazy import from `App.tsx`. Do NOT delete or move the components.
- **Rationale:** The AI chat flow may return post-C1 (it's deferred, not cancelled). Archiving adds git complexity for zero runtime benefit — tree-shaking already excludes unreferenced components from the production bundle. The lazy import removal in `App.tsx` ensures zero code-splitting cost.
- **Trade-off:** Dead code remains in repo. Acceptable — no runtime impact, and removal is a 1-minute `git rm` when confirmed unnecessary.
- **Alternative rejected:** Move to `archive/` or delete. Creates unnecessary git churn. Can't easily restore if AI chat is re-enabled.

**Decision 5: linkPointToStory position ownership check — DEFERRED for C1**

- **Chosen:** Call `linkPointToStory` if `getMyPosition` returned a position during page load (cached result — zero extra queries at save time). If no position cached, save story without link.
- **Rationale:** `/falsify` determined this is business logic, not a security concern. RLS on `story_points` INSERT already enforces `auth.uid() = story.author_id` — preventing cross-user linking. The ownership check prevents a user from linking their own story to a point they haven't positioned on, which is an edge case that doesn't arise in C1 facilitated sessions (Slava controls the flow). The page-load `getMyPosition` naturally provides the gate without an explicit check.
- **Trade-off:** Theoretical edge case: a user could craft a URL with someone else's pointId and link their story to it. Low risk for C1. Revisit if self-service story filing becomes a thing post-C1.

**Decision 6: Auth redirect — preserve pointId in signup redirect (P76 pattern)**

- **Chosen:** Change `navigate('/signup')` to `navigate('/signup?redirect=' + encodeURIComponent(location.pathname + location.search))`, matching the P76 `?redirect=PATH` query param pattern used by `AuthCallbackPage`.
- **Rationale:** The codebase uses `?redirect=PATH` query params (NOT router state). `AuthCallbackPage` (line 484) validates against `ALLOWED_REDIRECT_PREFIXES` and redirects after auth.
- **Required:** Add `'/create'` to `ALLOWED_REDIRECT_PREFIXES` array in `src/auth/AuthCallbackPage.tsx` (line 484). Without this, the redirect back to `/create?pointId=X` is rejected and defaults to `/events`.
- **Trade-off:** None — follows established pattern exactly.
- **Alternative rejected:** Do nothing (lose pointId). Violates spec acceptance criteria.

### Security Review

**RLS Policies:**
- ✅ `stories` INSERT requires `auth.uid() IS NOT NULL` AND `is_verified = true`. UPDATE/DELETE scoped to `author_id = auth.uid()`. SELECT respects visibility model.
- ✅ `story_points` INSERT requires authenticated user to be the story's author. Spoofed `authorId` param cannot bypass.
- ✅ `points` SELECT is public — fetching point text for banner is safe.
- ✅ `point_positions` SELECT is public — fetching user's own position needs no special policy.
- ✅ No new tables, no new RLS policies needed.

**Authentication:**
- ✅ `CreateStoryPage` auth gate redirects to `/signup` if `!session`. No point fetching until auth confirmed.
- ✅ `createStory()` independently verifies auth via `supabase.auth.getUser()` — double-gated.
- ✅ `useVerificationGate` blocks unverified users at submit time.

**Authorization:**
- ⚠️ **Position ownership check required.** `StoryGuideChat` checks position ownership before `linkPointToStory()`. P486 must replicate this — use cached `getMyPosition()` result from page load (Architecture Decision 5). If no position, save story without link. Low security impact (RLS still enforces story author = auth.uid()), but needed for application-level consistency.
- ✅ `linkPointToStory` handles duplicate links idempotently (23505 unique constraint → returns `true`).

**Input Validation:**
- ✅ `pointId` from URL: invalid/non-existent → fetch returns null → graceful fallback. No crash.
- ✅ Story content: max 10,000 chars client-side. Empty caught by `validate()`. Content `.trim()`-ed before save.
- ✅ Empty string `pointId` treated as no pointId per spec.
- ℹ️ No UUID format validation on `pointId` — non-UUID strings hit Supabase which returns no results (Postgres UUID column rejects). No XSS risk (React escapes). Zero impact.

**Data Protection:**
- ✅ `ChatContextHeader` displays only public data (point text, user's own position). No PII.
- ✅ Analytics events include `story_id`, `linked_point_id`, `word_count`, `visibility` — no PII, no story content.
- ✅ No new API endpoints, no edge functions, no AI/LLM calls.

### Implementation Approach

**Files to Modify (11 files):**

1. `src/app/pages/create-story-page.tsx` — Main work:
   - Read `pointId` from `useSearchParams()`
   - Add `useEffect` for parallel point + position fetch with loading/error states
   - Render `ChatContextHeader` conditionally (with `sticky={false}`)
   - Add skeleton loader for banner area during fetch
   - Disable textarea + publish button while point is loading
   - Auto-focus textarea after point loads (or on mount if no pointId)
   - Add `linkPointToStory` call in submit handler (with position ownership check, partial failure handling)
   - Add `linked_point_id` to analytics events
   - Fix auth redirect to preserve query params (P76 `?redirect=` pattern)
   - Navigate on success: add `{ replace: true }` to prevent back-button returning to /create after save

2. `src/app/components/story-guide/ChatContextHeader.tsx` — Add `sticky?: boolean` prop (default `true`), conditionally apply sticky classes.

3. `src/App.tsx` — Replace `/chat` route: remove `StoryGuideChatPage` lazy import + route element, replace with `ChatRedirect` wrapper using `useSearchParams()`. Add `'/create'` import if needed.

4. `src/auth/AuthCallbackPage.tsx` — Add `'/create'` to `ALLOWED_REDIRECT_PREFIXES` array (line 484). Required for auth redirect to return to `/create?pointId=X`.

5. `src/app/components/social/point-card-with-links.tsx` — Change 4 `navigate()` calls from `/chat?from=position&pointId=` to `/create?pointId=` (drop `from=position` — not used by /create).

6. `src/app/pages/point-detail-page.tsx` — Change `ctaHref` from `/chat?from=position&pointId=` to `/create?pointId=`.

7. `src/app/components/social/story-card-with-links.tsx` — Change `chatUrl` from `/chat?from=position&pointId=` to `/create?pointId=`.

8. `src/app/components/social/StoryCardDetail.tsx` — Change `chatUrl` from `/chat?from=position&pointId=` to `/create?pointId=`.

9. `src/app/pages/idea-detail-page.tsx` — Change `Link to` from `/chat?ideaId=` to `/create?ideaId=`.

10. `src/app/components/layout/bottom-nav.tsx` — Update `focusRoutes` array: replace `'/chat'` with `'/create'` (line 33). Remove `'/clarity-chat'` (redirect never reaches pathname).

11. `src/app/pages/TreePage.tsx` — Change dev nav `path: '/chat'` to `path: '/create'` (line 10).

**Files to Create:** None.

**Build Sequence:**

1. **ChatContextHeader prop** — Add `sticky` prop. 1 file, 3-line change. No dependencies.
2. **CreateStoryPage enhancement** — Core work: query param reading, point fetch, conditional banner, submit handler with linkPointToStory, loading states, focus management, auth redirect fix, navigate with replace. 1 file, ~60 lines added.
3. **Auth redirect allowlist** — Add `/create` to `ALLOWED_REDIRECT_PREFIXES`. 1 file, 1-line change.
4. **Entry point rewiring** — Change all CTA files from `/chat` to `/create`, drop `from=position` param. 7 files, mechanical string replacement. Can be done in parallel with step 2.
5. **Route redirect** — Replace `/chat` route in App.tsx with `ChatRedirect` wrapper using `useSearchParams()`. Remove `StoryGuideChatPage` lazy import. 1 file.
6. **Smoke test** — Verify: `/create?pointId=X` shows banner, save links point, `/create` alone works unchanged, `/chat?pointId=X` redirects correctly, `/clarity-chat` cascades through, auth redirect preserves pointId.

## Acceptance Criteria

- [ ] All "Add your story" CTAs navigate to `/create?pointId=X` instead of `/chat?...`
- [ ] `/create?pointId=X` shows ChatContextHeader with point text + user position
- [ ] `/create` (no pointId) works exactly as before — no banner
- [ ] Saving with pointId creates story AND links it to the point
- [ ] Loading state while fetching point data
- [ ] Error state if point not found (graceful fallback to plain create)
- [ ] `/chat` route handled (redirect or removal — per architect)
- [ ] No new components created

## Testing

### Test Coverage Strategy

**Feature type:** UI feature (form page enhancement + route changes)
**DB changes:** None
**New services:** None (reuses existing storiesService, pointsService)

#### Test Tiers

| Tier | Decision | Rationale |
|------|----------|-----------|
| Unit tests | SKIP | No new utility functions or business logic. All changes are wiring: reading query params, calling existing services, conditional rendering. |
| Integration tests | SKIP | No DB changes, no new API endpoints, no edge functions. Existing service methods are already tested. |
| E2E tests | YES | 3 files covering: smoke (page loads, redirects), feature (context banner, save+link, error fallback, focus management), accessibility (ARIA, keyboard, loading states). |
| Accessibility tests | YES | Dedicated file for ARIA attributes, aria-busy transitions, tab order, keyboard submit. |
| Smoke tests | YES | /create loads, /chat redirects to /create, query param preservation, no 404/500 on assets. |
| UAT scenarios | YES | 7 scenario groups, 17 individual scenarios in `features/uat/p486.md`. |

#### Test Files

| File | Tests | What it covers |
|------|-------|---------------|
| `e2e/p486-smoke.spec.ts` | 7 | Page loads (plain + with pointId), /chat redirect (bare, with params, /clarity-chat cascade), unauth redirect, no static asset failures |
| `e2e/p486-create-with-point.spec.ts` | 14 | Context banner rendering, loading skeleton, textarea disable/enable, error fallback (invalid + empty pointId), save with link, save without link, ChatContextHeader not sticky, focus management, /chat redirect with pointId/ideaId, no-position user |
| `e2e/p486-accessibility.spec.ts` | 7 | region role + aria-label, aria-live="polite", aria-busy transitions, textarea aria-disabled during loading, position chip aria-label, tab order, Cmd/Ctrl+Enter submit |

#### Acceptance Criteria Coverage

| Acceptance Criterion | Test Coverage |
|---------------------|---------------|
| All CTAs navigate to /create?pointId=X | UAT-6.1, UAT-6.2 (manual); smoke redirect tests verify /chat->create |
| /create?pointId=X shows ChatContextHeader | p486-create-with-point: "ChatContextHeader shows point text and position chip" |
| /create (no pointId) unchanged | p486-create-with-point: "No context banner when no pointId param"; p486-smoke: plain load |
| Save with pointId links story to point | p486-create-with-point: "Save with pointId creates story AND links it" (DB verified) |
| Loading state during fetch | p486-create-with-point: "Skeleton pulse visible", "Textarea is disabled while loading" |
| Error fallback (point not found) | p486-create-with-point: "Invalid pointId degrades gracefully", "Empty string pointId" |
| /chat route redirect | p486-smoke: 3 redirect tests (bare, with params, /clarity-chat cascade) |
| No new components | Structural — verified by file count in spec (0 new files) |
