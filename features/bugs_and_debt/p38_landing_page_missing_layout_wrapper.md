---
status: backlog
type: bug
rank: 32
workstream: foundation
tags: []
created_date: 2026-01-06
---
# P38: Landing Page Missing Layout Wrapper

---

## Problem

The landing page route (`/`) renders `ClarityPledgeLanding` directly without the `ClarityLandingLayout` wrapper, while all other routes use the layout wrapper. This causes:

1. **Missing Components**: Landing page doesn't get `OfflineBanner` and `Toaster` that all other pages have
2. **Architectural Inconsistency**: One route breaks the pattern used by all others
3. **Maintenance Risk**: Layout changes won't apply to landing page

### Current State

**App.tsx:57-61** - Landing page has no wrapper:
```tsx
<Route
  path="/"
  element={<ClarityPledgeLanding />}
/>
```

**All other routes** - Have layout wrapper:
```tsx
<Route
  path="/login"
  element={
    <ClarityLandingLayout>
      <LoginPage />
    </ClarityLandingLayout>
  }
/>
```

### Why This Happens

The landing page component manually includes its own navigation and footer:
- `clarity-pledge-landing.tsx:85` - Renders `<SimpleNavigation />`
- `clarity-pledge-landing.tsx:154` - Renders `<ClarityFooter />`

The layout has logic to hide navigation on landing page (`isLandingPage` check at line 16), creating a circular dependency.

---

## Solution

Wrap landing page in `ClarityLandingLayout` and remove duplicate components from the landing page component itself. The layout already has logic to handle landing page specially.

### Files to Change

1. **src/App.tsx:57-61** - Add layout wrapper to landing route
2. **src/app/pages/clarity-pledge-landing.tsx** - Remove `SimpleNavigation` and `ClarityFooter` imports/usage
3. **src/app/layouts/clarity-landing-layout.tsx:30** - Update footer logic to use `ClarityFooter` for landing page

---

## Implementation Steps

1. Wrap landing route in `ClarityLandingLayout` in App.tsx
2. Remove `SimpleNavigation` import and usage from landing page component
3. Remove `ClarityFooter` import and usage from landing page component
4. Update layout to conditionally render `ClarityFooter` vs `LegalFooter` based on `isLandingPage`

---

## Previous Attempt

This was attempted earlier but reverted because it broke navigation visibility. The issue was that we need to:
- Keep the layout's `isLandingPage` check that hides navigation
- Use `ClarityFooter` for landing page, `LegalFooter` for others

---

## Testing

After fix, verify:
- [ ] Navigation visible on landing page (Work, Personal tabs visible in screenshot)
- [ ] Footer shows on landing page with full navigation sections
- [ ] `OfflineBanner` component present (check network offline)
- [ ] Toast notifications work on landing page
- [ ] Other pages still render correctly with their layouts

---

## Related

- P37.1 Legal Entity Update - Footer requirements mention all pages should have footer
- Previous fix attempt reverted at commit f23cc7d
