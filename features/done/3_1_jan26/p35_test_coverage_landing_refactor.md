---
status: all-done
type: task
tags: []
rank: 125432.0
created_date: 2026-01-06
completed_at: '2026-02-09'
---

# P35: Add Test Coverage for Landing Page Refactor Components

**Priority:** High
**Status:** pending
**Created:** 2025-01-06
**Epic:** Landing Page Refactor

## Story

As a developer maintaining the codebase, I need comprehensive test coverage for the new landing page components (user-journey-section, dual-cta, pledger-card, clarity-pledgers-page) so that I can confidently make changes without breaking functionality and ensure analytics tracking works correctly.

## Context

During the landing page refactor, 4 new components were added (328+ lines of code) with zero test coverage:
- `user-journey-section.tsx` - 3-step user journey section
- `dual-cta.tsx` - Reusable dual CTA component with size variants
- `pledger-card.tsx` - Individual pledger card with analytics tracking
- `clarity-pledgers-page.tsx` - Full page with mobile carousel and desktop grid

These components include:
- Complex mobile carousel logic with scroll tracking
- Mixpanel analytics integration
- Conditional rendering based on props
- Responsive layouts (mobile vs desktop)

## Acceptance Criteria

- [ ] **AC1:** `user-journey-section.tsx` has unit tests covering:
  - Renders all 3 steps correctly
  - Shows "Coming soon" badge only for step 2
  - All icons render correctly

- [ ] **AC2:** `dual-cta.tsx` has unit tests covering:
  - Default mode: "Try Meeting" is primary, "Take Pledge" is secondary
  - Reversed mode: "Take Pledge" is primary, "Try Meeting" is secondary
  - Size variants: "hero" vs "section" apply correct CSS classes
  - Routes link to correct paths (/live and /sign-pledge)

- [ ] **AC3:** `pledger-card.tsx` has unit tests covering:
  - Renders pledger information correctly (name, role, reason)
  - Shows/hides stats based on `showStats` prop
  - Shows/hides date based on `showDate` prop
  - Mixpanel tracking fires on card click with correct slug
  - Links to correct profile URL (`/p/${slug}`)
  - Tooltips work for "Accepted By" and "Inspired" stats

- [ ] **AC4:** `clarity-pledgers-page.tsx` has unit tests covering:
  - Fetches verified profiles on mount
  - Shows loading spinner while fetching
  - Shows empty state when no profiles exist
  - Desktop: Renders profiles in grid layout
  - Mobile: Renders profiles in carousel (limited to MAX_MOBILE_CAROUSEL)
  - Mixpanel page view tracking fires once with profile count
  - Dot indicators render correctly (one per mobile profile)
  - "Ready to Commit" CTA section appears after loading

- [ ] **AC5:** Integration test for mobile carousel:
  - Scroll tracking updates currentIndex correctly
  - Clicking dots scrolls carousel to correct position
  - Carousel limits to 20 profiles on mobile
  - All profiles shown on desktop (no limit)

## Tasks / Subtasks

- [ ] Create `user-journey-section.test.tsx`
  - [ ] Test default render with all steps
  - [ ] Test "Coming soon" badge on step 2
  - [ ] Test responsive styling

- [ ] Create `dual-cta.test.tsx`
  - [ ] Test default hierarchy (Try Meeting primary)
  - [ ] Test reversed hierarchy (Take Pledge primary)
  - [ ] Test size="hero" vs size="section" classes
  - [ ] Test link routing

- [ ] Create `pledger-card.test.tsx`
  - [ ] Test basic render with required props
  - [ ] Test showStats=true/false
  - [ ] Test showDate=true/false
  - [ ] Test Mixpanel click tracking (mock analytics)
  - [ ] Test tooltip content

- [ ] Create `clarity-pledgers-page.test.tsx`
  - [ ] Test loading state
  - [ ] Test empty state
  - [ ] Test successful profile load
  - [ ] Test desktop grid render
  - [ ] Test mobile carousel render
  - [ ] Test Mixpanel page view tracking
  - [ ] Test dot indicator generation
  - [ ] Test scroll position calculation

- [ ] Add Playwright E2E test for pledgers page
  - [ ] Test mobile carousel swipe behavior
  - [ ] Test dot navigation clicks
  - [ ] Test card click navigation to profile

## Technical Notes

### Testing Setup Required

```tsx
// Mock Mixpanel analytics
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
  },
}));

// Mock API calls
vi.mock('@/app/data/api', () => ({
  getVerifiedProfiles: vi.fn(),
}));
```

### Carousel Logic to Test

The scroll calculation is fragile and needs explicit test coverage:

```tsx
const cardWidth = carousel.offsetWidth * 0.85 + 16;
const newIndex = Math.round(scrollLeft / cardWidth);
```

This magic number logic should be validated in tests.

### Mixpanel Events to Verify

- `pledger_card_clicked` with `{ pledger_slug: string }`
- `pledgers_page_viewed` with `{ pledger_count: number }`

## Definition of Done

- [ ] All unit tests written and passing
- [ ] Test coverage for new components is >80%
- [ ] Mixpanel tracking verified in tests
- [ ] E2E test for mobile carousel passes
- [ ] No regressions in existing tests
- [ ] Tests run in CI/CD pipeline

## Related Issues

- Code Review Finding #1: Missing tests for new components
- Part of landing page refactor that deleted alternative-hero-section, alternative-navigation, champion-card

## File List

New test files to create:
- `src/app/components/landing/user-journey-section.test.tsx`
- `src/app/components/landing/dual-cta.test.tsx`
- `src/app/components/social/pledger-card.test.tsx`
- `src/app/pages/clarity-pledgers-page.test.tsx`
- `e2e/pledgers-page.spec.ts`

Components under test:
- `src/app/components/landing/user-journey-section.tsx`
- `src/app/components/landing/dual-cta.tsx`
- `src/app/components/social/pledger-card.tsx`
- `src/app/pages/clarity-pledgers-page.tsx`
