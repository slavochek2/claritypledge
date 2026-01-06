# Tech-Spec: P35 Test Coverage for Landing Page Refactor Components

**Created:** 2026-01-06
**Status:** Ready for Development
**Related Feature:** [features/p35_test_coverage_landing_refactor.md](../features/p35_test_coverage_landing_refactor.md)

## Overview

### Problem Statement

During the landing page refactor (champions → pledgers rebrand), 4 new components were added totaling 328+ lines of code with zero test coverage:
- `user-journey-section.tsx` - 3-step journey visualization
- `dual-cta.tsx` - Reusable dual CTA with size/hierarchy variants
- `pledger-card.tsx` - Individual pledger card with Mixpanel tracking
- `clarity-pledgers-page.tsx` - Full page with mobile carousel + desktop grid

**Risk:** These components include complex mobile carousel logic, Mixpanel analytics integration, and conditional rendering that could break during future changes. Without tests, regressions will go undetected.

### Solution

Add pragmatic test coverage focused on stability and regression prevention:
- **Unit tests (Vitest)** for rendering logic, props handling, and analytics tracking
- **E2E test (Playwright)** for mobile carousel interactions and navigation flows
- **Target:** 70-80% coverage of critical paths (not 100%)

### Scope

**In Scope:**
- Unit tests for all 4 components (happy path + analytics)
- Mock Mixpanel analytics tracking verification
- Mobile carousel scroll/dot navigation logic
- Responsive behavior (mobile vs desktop conditional rendering)
- One comprehensive E2E test for pledgers page

**Out of Scope:**
- Testing every possible prop combination (diminishing returns)
- Styling/CSS class testing (fragile, low value)
- Third-party library internals (React Router, Radix UI tooltips)
- Performance/load testing

## Context for Development

### Codebase Patterns

**Existing Test Patterns:**
- Test setup: [src/tests/setup.tsx](../../src/tests/setup.tsx) - Mocks Helmet, IntersectionObserver, matchMedia
- Gold standard: [src/tests/critical-auth-flow.test.tsx](../../src/tests/critical-auth-flow.test.tsx) - Comprehensive mocking, clear describe blocks
- Landing page example: [src/app/pages/clarity-pledge-landing.test.tsx](../../src/app/pages/clarity-pledge-landing.test.tsx) - Mocking useAuth, routing tests

**Testing Philosophy:**
```tsx
// Mock approach (from critical-auth-flow.test.tsx)
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
  },
}));

// Wrapper pattern for providers
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);

// Assertion style
await waitFor(() => {
  expect(mockTrack).toHaveBeenCalledWith('event_name', { key: 'value' });
});
```

### Files to Reference

**Components Under Test:**
- [src/app/components/landing/user-journey-section.tsx](../../src/app/components/landing/user-journey-section.tsx) - 82 lines
- [src/app/components/landing/dual-cta.tsx](../../src/app/components/landing/dual-cta.tsx) - 65 lines
- [src/app/components/social/pledger-card.tsx](../../src/app/components/social/pledger-card.tsx) - 143 lines
- [src/app/pages/clarity-pledgers-page.tsx](../../src/app/pages/clarity-pledgers-page.tsx) - 223 lines

**Dependencies to Mock:**
- `@/lib/mixpanel` - Analytics tracking
- `@/app/data/api` - `getVerifiedProfiles()` function
- `react-router-dom` - `Link` and routing (use `MemoryRouter`)

**Test Infrastructure:**
- [src/tests/setup.tsx](../../src/tests/setup.tsx) - Global test setup
- [vitest.config.ts](../../vitest.config.ts) - Vitest configuration
- [playwright.config.ts](../../playwright.config.ts) - E2E configuration

### Technical Decisions

**Decision 1: Inline Mocks vs Shared Setup**
- **Choice:** Inline mocks in each test file
- **Rationale:** Only 4 test files need Mixpanel mocks - shared setup is premature abstraction
- **Pattern:** Copy mock block from file to file for now

**Decision 2: Coverage Target**
- **Choice:** 70-80% coverage (not 100%)
- **Rationale:** Focus on critical paths and regression prevention. Diminishing returns on edge case testing
- **What to skip:** Styling classes, every prop permutation, error states that don't happen in production

**Decision 3: E2E Test Scope**
- **Choice:** ONE comprehensive test for pledgers page (not separate tests per feature)
- **Rationale:** Carousel behavior is tightly coupled to the page. Integration test catches issues unit tests miss
- **Coverage:** Mobile carousel scroll, dot clicks, card navigation, responsive behavior

**Decision 4: Tooltip Testing**
- **Choice:** Verify tooltip triggers render, skip tooltip content testing
- **Rationale:** Radix UI tooltip is third-party library (already tested). We test our integration, not their implementation

## Implementation Plan

### Tasks

**Phase 1: Unit Tests (Vitest)**

- [ ] **Task 1:** Create `src/app/components/landing/user-journey-section.test.tsx`
  - Test: Renders all 3 steps with correct titles
  - Test: "Coming soon" badge appears only on step 2
  - Test: All icons render (VideoIcon, UsersIcon, BadgeCheckIcon)
  - Mock: None needed (pure presentational component)

- [ ] **Task 2:** Create `src/app/components/landing/dual-cta.test.tsx`
  - Test: Default mode - "Try Meeting" is primary, "Take Pledge" is secondary
  - Test: Reversed mode - "Take Pledge" is primary, "Try Meeting" is secondary
  - Test: size="hero" applies larger button classes
  - Test: size="section" applies smaller button classes
  - Test: Links route to `/live` and `/sign-pledge`
  - Mock: None needed (uses MemoryRouter for routing)

- [ ] **Task 3:** Create `src/app/components/social/pledger-card.test.tsx`
  - Test: Renders pledger name, role, reason correctly
  - Test: showStats=true renders witness count and reciprocations
  - Test: showStats=false hides stats section
  - Test: showDate=true renders formatted date
  - Test: showDate=false hides date section
  - Test: Clicking card fires `analytics.track('pledger_card_clicked', { pledger_slug: 'slug' })`
  - Test: Card links to `/p/{slug}`
  - Test: Tooltip triggers render (skip content testing)
  - Mock: `@/lib/mixpanel` analytics

- [ ] **Task 4:** Create `src/app/pages/clarity-pledgers-page.test.tsx`
  - Test: Shows loading spinner while fetching profiles
  - Test: Fetches verified profiles on mount
  - Test: Shows empty state when no profiles exist
  - Test: Desktop - renders profiles in grid layout (hidden on mobile)
  - Test: Mobile - renders profiles in carousel (hidden on desktop)
  - Test: Mobile carousel limits to MAX_MOBILE_CAROUSEL (20 profiles)
  - Test: Desktop grid shows all profiles (no limit)
  - Test: Mixpanel `pledgers_page_viewed` fires once with profile count
  - Test: Dot indicators render (one per mobile profile, max 20)
  - Test: "Ready to Commit" CTA section appears after loading
  - Mock: `@/lib/mixpanel` analytics, `@/app/data/api` getVerifiedProfiles

**Phase 2: E2E Test (Playwright)**

- [ ] **Task 5:** Create `e2e/pledgers-page.spec.ts`
  - Test: Mobile viewport - carousel scrolls horizontally
  - Test: Clicking dot navigates to corresponding profile card
  - Test: Scroll position updates currentIndex (dot indicator highlights)
  - Test: Clicking pledger card navigates to `/p/{slug}`
  - Test: Desktop viewport - profiles render in grid (no carousel)
  - Test: Mobile shows "Showing 20 of X" when profiles exceed limit
  - Setup: Use test-user helper to create 25+ profiles for testing

**Phase 3: Verification**

- [ ] **Task 6:** Run all tests and verify coverage
  - Run: `npm test` - all unit tests pass
  - Run: `npm run test:e2e` - E2E test passes
  - Check: Coverage report shows 70-80% for new components
  - Verify: No regressions in existing tests

### Acceptance Criteria

**AC1: user-journey-section.tsx has unit tests**
- [ ] GIVEN the component renders
- [ ] WHEN I check the DOM
- [ ] THEN all 3 steps are present with correct titles and icons
- [ ] AND "Coming soon" badge appears only on step 2

**AC2: dual-cta.tsx has unit tests**
- [ ] GIVEN default mode (reversed=false)
- [ ] WHEN component renders
- [ ] THEN "Try Meeting" is the primary blue button
- [ ] AND "Take Pledge" is the secondary link
- [ ] GIVEN reversed mode (reversed=true)
- [ ] WHEN component renders
- [ ] THEN "Take Pledge" is the primary blue button
- [ ] AND "Try Meeting" is the secondary link
- [ ] GIVEN size variants
- [ ] WHEN size="hero" vs size="section"
- [ ] THEN correct CSS classes are applied (larger vs smaller buttons)

**AC3: pledger-card.tsx has unit tests**
- [ ] GIVEN pledger data with showStats=true
- [ ] WHEN card renders
- [ ] THEN witness count and reciprocations are visible
- [ ] GIVEN showStats=false
- [ ] WHEN card renders
- [ ] THEN stats section is hidden
- [ ] GIVEN user clicks the card
- [ ] WHEN onClick fires
- [ ] THEN `analytics.track('pledger_card_clicked', { pledger_slug })` is called
- [ ] AND navigation to `/p/{slug}` occurs

**AC4: clarity-pledgers-page.tsx has unit tests**
- [ ] GIVEN page loads
- [ ] WHEN profiles are being fetched
- [ ] THEN loading spinner is visible
- [ ] WHEN profiles are loaded
- [ ] THEN `analytics.track('pledgers_page_viewed', { pledger_count })` fires once
- [ ] GIVEN 30 profiles exist
- [ ] WHEN mobile view
- [ ] THEN only 20 profiles render in carousel (MAX_MOBILE_CAROUSEL)
- [ ] AND 20 dot indicators render
- [ ] WHEN desktop view
- [ ] THEN all 30 profiles render in grid layout
- [ ] GIVEN no profiles exist
- [ ] WHEN page loads
- [ ] THEN empty state message is visible

**AC5: E2E test for mobile carousel**
- [ ] GIVEN mobile viewport (375px width)
- [ ] WHEN user scrolls carousel horizontally
- [ ] THEN dot indicator updates to show current position
- [ ] GIVEN user clicks dot indicator
- [ ] WHEN click event fires
- [ ] THEN carousel scrolls to corresponding profile card
- [ ] GIVEN user clicks a pledger card
- [ ] WHEN navigation occurs
- [ ] THEN browser navigates to `/p/{slug}` profile page

## Additional Context

### Dependencies

**Vitest + React Testing Library:**
```bash
npm test                     # Run all unit tests
npm test -- user-journey     # Run specific test file
npm test -- --watch          # Watch mode
```

**Playwright:**
```bash
npm run test:e2e             # Run all E2E tests
npm run test:e2e:ui          # Run with Playwright UI
npm run test:e2e:headed      # Run in headed browser
```

**Test Data:**
- Use existing `e2e/helpers/test-user.ts` for profile creation in E2E tests
- Mock data inline for unit tests (no shared fixtures needed)

### Testing Strategy

**Unit Tests:**
- Focus on component behavior and integration (not implementation details)
- Mock external dependencies (Mixpanel, API calls)
- Use `@testing-library/react` queries (getByRole, getByText)
- Avoid testing CSS classes directly (use semantic queries)

**E2E Tests:**
- Test real user flows (scroll, click, navigate)
- Verify mobile vs desktop responsive behavior
- Use Playwright's built-in viewport/device emulation
- Clean up test data after runs (use teardown)

**Carousel Logic to Test:**
The scroll calculation in clarity-pledgers-page.tsx is fragile:
```tsx
const cardWidth = carousel.offsetWidth * 0.85 + 16;
const newIndex = Math.round(scrollLeft / cardWidth);
```
This magic number logic (85% width + 16px gap) needs explicit validation in E2E test.

**Mixpanel Events to Verify:**
- `pledger_card_clicked` with `{ pledger_slug: string }`
- `pledgers_page_viewed` with `{ pledger_count: number }`

### Notes

**Mock Template (Copy to each test file):**
```tsx
import { vi } from 'vitest';

// Mock Mixpanel
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
  },
}));

// Mock API
vi.mock('@/app/data/api', () => ({
  getVerifiedProfiles: vi.fn(),
}));
```

**Responsive Testing Pattern:**
```tsx
// Use matchMedia mock from setup.tsx
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: query.includes('min-width: 768px'), // Desktop
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));
```

**Why Not Test Everything:**
- **Skip:** Testing every button color, hover state, transition
- **Skip:** Testing Radix UI tooltip content (third-party library)
- **Skip:** Testing all edge cases (e.g., 1000+ profiles in carousel)
- **Focus:** Happy path + analytics + critical interactions

**When Tests Are Done:**
- All new tests pass (`npm test`)
- E2E test passes (`npm run test:e2e`)
- No regressions in existing tests
- Coverage is 70-80% for new components
- Mixpanel tracking verified in tests
- Mobile carousel behavior validated end-to-end

---

## Ready for Implementation

This spec contains everything needed to implement test coverage:
- Clear task breakdown (6 tasks)
- Component details with line numbers
- Mock patterns from existing tests
- Acceptance criteria for verification
- Testing philosophy aligned with codebase

**Next Step:** Run `/quick-dev` with this spec in a fresh context for best results.
