# UX Patterns

> Living reference for Clarity Pledge interaction conventions.
> Written by: UX analysis on 2026-02-27. Updated by: /kdd when patterns shift.
> Last updated: 2026-02-27

---

## Navigation Architecture

**Pattern:** Two-tier navigation split based on page type.

- **Browse pages** (/, /events, /sessions, /p/:slug, /me, /pledgers): Show bottom nav, no back button
- **Focus pages** (/chat, /story/:id, /point/:id, /agreement/:id): Hide bottom nav, show FocusHeader (← Back)

**Rationale:** Browse pages let users explore; focus pages isolate single artifacts for deep engagement. Bottom nav clutter would distract from content. Back buttons on focus pages provide obvious escape.

**Inconsistencies / TBD:** None — pattern is decided and consistently applied.

**Examples:**
- Browse: `/clarity-pledgers-page.tsx` (no BottomNav visible, no back button)
- Focus: `/story-detail-page.tsx` (FocusHeader at top, no BottomNav)

**Implementation:** `FocusHeader` component (`src/app/components/layout/focus-header.tsx`). Bottom nav exclusion list in `bottom-nav.tsx`.

---

## Back Navigation

**Pattern:** Use `<FocusHeader onBack={handleBack} />` on all focus/detail pages. Do NOT define inline BackButton components.

**Shared component:** `src/app/components/layout/focus-header.tsx`

**Rationale:** Ghost button with ArrowLeft icon, min-h-[44px] touch target, -ml-2 optical alignment. Single source of truth eliminates duplication across pages.

**Back target logic:**
- Story detail: navigate to author profile, fallback `/events`
- Point detail: `navigate(-1)`, fallback `/events`
- Agreement: `navigate(-1)`
- Chat: navigate to source point (`/point/:pointId`) if URL has `?pointId=`, fallback `navigate(-1)`

**Examples:** `/story-detail-page.tsx`, `/point-detail-page.tsx`, `/agreement-page.tsx`, `/create-story-page.tsx` (removed by P803: `/story-guide-chat-page.tsx`, dead code)

---

## Page Type Taxonomy

**Pattern:** Three page categories:

1. **Utility pages** (login, signup, verify email): ClarityLandingLayout (full-width, light), no nav
2. **Browse pages** (home, events list, sessions, profile, pledgers): BottomNav visible, centered max-w, fluid content
3. **Focus pages** (detail views): BottomNav hidden, centered max-w (~lg), FocusHeader at top

**Rationale:** Utility pages are conversion-focused (landing layout). Browse pages serve discovery. Focus pages isolate single artifacts.

**Examples:**
- Utility: `/clarity-pledge-landing.tsx`, `/signup-page.tsx`
- Browse: `/clarity-pledgers-page.tsx` (grid + carousel mobile), `/me-page.tsx`
- Focus: `/story-detail-page.tsx`, `/point-detail-page.tsx`

---

## Loading States

**Pattern:** Skeleton UI for main content areas (never spinners overlaid on text).

**Skeleton format:** Gray pulsing placeholder boxes matching expected content shape.

```tsx
{loading ? (
  <div className="max-w-lg mx-auto px-4 py-8">
    <div className="h-4 bg-muted rounded w-20 mb-6 animate-pulse" /> {/* back button */}
    <div className="bg-card border...animate-pulse">
      {/* structured placeholders matching card layout */}
    </div>
  </div>
) : null}
```

**Rationale:** Skeletons show structure; spinners show activity. Skeletons feel faster because users see the layout forming.

**Examples:** `/story-detail-page.tsx`, `/point-detail-page.tsx`

---

## Empty States

**Pattern:** Icon + heading + description + optional CTA.

```tsx
<div className="text-center py-16">
  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
    <UsersIcon className="w-8 h-8 text-muted-foreground" />
  </div>
  <h3 className="text-xl font-semibold mb-2">No Verified Pledgers Yet</h3>
  <p className="text-muted-foreground">
    Be the first to sign the pledge and verify your commitment!
  </p>
</div>
```

**Rationale:** Icon draws attention. Heading explains. Description contextualizes. CTA (optional) guides next action.

**Examples:** `/clarity-pledgers-page.tsx`, `/story-detail-page.tsx` (empty points state)

---

## Error States

**Pattern:** Three-tier error display:

1. **Network/server errors:** Back button + centered message + "Try Again" CTA (if retryable)
2. **Validation errors:** Inline error text below field, red border on input, `role="alert"`
3. **Transient errors:** Toast (sonner library), auto-dismiss after 3s

**Examples:**
- Network: `/point-detail-page.tsx` (lines 253–281)
- Validation: `/create-story-page.tsx` (content error)
- Transient: `/story-detail-page.tsx` (toast.error calls throughout)

**Rationale:** Network errors are critical (shows UI). Validation is form-local (stays inline). Transient errors are informational (toast sufficient).

---

## CTA Placement

**Pattern:** Primary CTAs appear at bottom of content, full-width or inline depending on context.

- **Forms:** Full-width primary button at bottom, secondary (cancel) to the left
- **Detail pages:** Float CTAs inline with related content
- **Cards:** Footer slot or bottom of card content

**Inconsistencies / TBD:** Micro-interactions on position buttons vary slightly (compact vs full). Non-critical.

---

## Modal vs Page Decision

**Pattern:**

- **Dialog/Modal:** Confirmation (delete, decline, unsaved changes), short forms (≤3 fields), warnings with explicit accept/cancel
- **Page/Route:** Anything requiring scroll, multi-step workflows, content-heavy views

**Examples:**
- Modal: `/story-detail-page.tsx` DeleteStoryDialog, unsaved changes prompt
- Page: `/create-story-page.tsx` (AI-assisted story creation workflow) — removed by P803: `/story-guide-chat-page.tsx`, dead code

---

## Form Patterns

**Pattern:** Inline edit when field count ≤ 3. Form pages for richer workflows.

**Rationale:** Inline edits reduce navigation fatigue. Full form pages are for complex flows needing separate context.

**Examples:**
- Inline: `/story-detail-page.tsx` EditStoryCard
- Page form: `/create-story-page.tsx`, `/create-agreement-page.tsx`

---

## Mobile-Specific Patterns

**Pattern:** Three responsive approaches:

1. **Horizontal carousel (mobile only):** Pledgers page — swipe carousel on mobile, grid on desktop
2. **Stacked form (all devices):** Textarea + buttons stack vertically on mobile
3. **Bottom nav (mobile-first):** Fixed bar, `lg:hidden`, `pb-[env(safe-area-inset-bottom)]`

**Examples:**
- Carousel: `/clarity-pledgers-page.tsx`
- Bottom nav: `/bottom-nav.tsx`

---

## Character Limits & Soft Markers

**Pattern:** Hard max enforced; soft marker (visual nudge, not a block) for ideal length.

```tsx
const CHAR_SOFT = 140;  // nudge, show encouragement
const CHAR_MAX = 500;   // hard limit, prevent submit
```

**Examples:** `/story-detail-page.tsx` (point: soft=140, max=500), `/create-story-page.tsx` (story: soft=280, max=10000)

---

## Auth Gating & Redirects

**Pattern:** Three-tier auth checks:

1. **Session required:** Redirect unauthenticated to `/signup` (not `/login`)
2. **Verification required:** `checkVerified('action')` before sensitive operations
3. **Slug required:** Redirect slug-less users to `/me` for verification

---

## Toast Usage

**Pattern:** Sonner toasts for non-critical feedback (success, info, warning). Never for blocking errors.

```tsx
import { toast } from 'sonner';
toast.success('Story saved!');
toast.error('Failed to save. Try again.');
```

---

## Skeleton vs Spinner Philosophy

**Pattern:**
- **Skeleton UI:** Loading initial page content (shows structure)
- **Spinner:** Loading state in dialog/modal (short duration)
- **Loading text:** "Saving...", "Loading..." inline in button (very short operations)

---

## Verification Gate Pattern

**Pattern:** `useVerificationGate()` hook wraps auth + verification check. Shows toast if unverified, returns early.

```tsx
const { checkVerified } = useVerificationGate();
const handleSubmit = () => {
  if (!checkVerified('create a story')) return;
  // proceed
};
```

---

## Analytics Tracking

**Pattern:** Track on page view (mounted) and on significant user actions.

```tsx
const hasTrackedPageView = useRef(false);
useEffect(() => {
  if (!hasTrackedPageView.current) {
    hasTrackedPageView.current = true;
    analytics.track('page_viewed', { /* context */ });
  }
}, []);
```

---

## Unsaved Changes Guard

**Pattern:** `beforeunload` event + `popstate` handler for browser back. Show confirmation dialog.

**Example:** `/story-detail-page.tsx` (unsaved changes prompt)

---

## Activity Indicators During Network Calls

**Pattern:** Disable button + show spinner + loading text during async operations.

```tsx
<Button disabled={isSaving} onClick={handleSave}>
  {isSaving ? <><Loader2Icon className="animate-spin" /> Saving...</> : 'Save'}
</Button>
```
