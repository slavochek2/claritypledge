# Feature: User Settings Page

**Date:** 2025-12-03
**Scope:** Allow users to edit their profile information after signing the pledge

---

## Problem Statement

Users currently cannot update their profile information after signing the pledge. If someone:
- Forgot to add their LinkedIn URL during signup
- Changed roles/positions
- Wants to update their "reason" for taking the pledge
- Made a typo in their name

...they have no way to fix it. This creates friction and reduces profile completeness.

## User Story

> As a **signed pledge user**, I want to **edit my profile information**, so that I can **keep my public profile accurate and complete**.

## Design Solution: Settings Page

Add a `/settings` route accessible only to authenticated users. This page allows editing of profile fields that were captured during signup.

### Editable Fields

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Cannot be empty |
| Role/Position | No | Job title |
| LinkedIn URL | No | Must be valid LinkedIn URL if provided |
| Reason | No | Why they took the pledge |

### Non-Editable Fields (Out of Scope)

| Field | Reason |
|-------|--------|
| Email | Tied to authentication |
| Slug | Decided to keep simple, no changes |
| Avatar Color | Minor, could be future enhancement |

## Technical Specification

### New Files

**1. Settings Page:** `src/app/pages/settings-page.tsx`
- Protected route (redirect to `/sign-pledge` if not authenticated)
- Form pre-populated with current profile data
- Save button updates profile via API

**2. Update Profile API:** Add to `src/app/data/api.ts`
```typescript
export async function updateProfile(
  userId: string,
  updates: {
    name?: string;
    role?: string;
    linkedin_url?: string;
    reason?: string;
  }
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  return { error };
}
```

### Route Addition

**File:** `src/App.tsx`
```typescript
<Route path="/settings" element={<SettingsPage />} />
```

### Navigation

Add "Settings" link to user dropdown/nav when authenticated:
- Desktop: In header dropdown next to "Sign Out"
- Mobile: In mobile menu

## UI Wireframe

```
┌─────────────────────────────────────┐
│  ← Back to Profile    Settings      │
├─────────────────────────────────────┤
│                                     │
│  Name *                             │
│  ┌─────────────────────────────┐   │
│  │ John Doe                    │   │
│  └─────────────────────────────┘   │
│                                     │
│  Role / Position                    │
│  ┌─────────────────────────────┐   │
│  │ Product Manager             │   │
│  └─────────────────────────────┘   │
│                                     │
│  LinkedIn URL                       │
│  ┌─────────────────────────────┐   │
│  │ https://linkedin.com/in/... │   │
│  └─────────────────────────────┘   │
│                                     │
│  Why I took the pledge              │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  │ Clear communication is...   │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────┐                   │
│  │ Save Changes│                   │
│  └─────────────┘                   │
│                                     │
└─────────────────────────────────────┘
```

## Acceptance Criteria

- [x] Settings page accessible at `/settings` route
- [x] Unauthenticated users redirected to sign-pledge page
- [x] Form pre-populated with current profile data
- [x] Name field required, cannot be empty
- [x] LinkedIn URL validated if provided (must contain `linkedin.com`)
- [x] Save button disabled while no changes made
- [x] Success message shown after save
- [x] Profile data refreshed in auth context after save
- [x] Navigation link added for authenticated users

## Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| User clears name field | Show validation error, don't save |
| Invalid LinkedIn URL | Show validation error |
| Network error on save | Show error message, keep form data |
| User navigates away with unsaved changes | Allow (no confirmation modal needed) |

## Security Considerations

- RLS policies already restrict profile updates to profile owner (`auth.uid() = id`)
- No additional security changes needed

## Future Considerations (Not In Scope)

- Slug changes (decided against for simplicity)
- Email changes (requires re-verification flow)
- Avatar color picker
- Profile picture upload
- Account deletion

---

## Dev Agent Record

### Status
**Done** - All acceptance criteria implemented and tested.

### File List

| File | Action | Description |
|------|--------|-------------|
| `src/app/pages/settings-page.tsx` | Created | Protected settings page with form validation |
| `src/app/pages/settings-page.test.tsx` | Created | Comprehensive unit tests (route protection, validation, submission) |
| `src/App.tsx` | Modified | Added `/settings` route |
| `src/app/components/layout/simple-navigation.tsx` | Modified | Added Settings link to desktop dropdown and mobile menu |
| `src/app/data/api.ts` | Modified | Added `updateProfile()` function |

### Change Log

- **2025-12-03**: Initial implementation of settings page
- **2025-12-03**: Code review fixes:
  - Strengthened LinkedIn URL validation (require HTTPS, proper domain check)
  - Added `aria-describedby` and `aria-invalid` for form accessibility
  - Added comprehensive unit tests for all acceptance criteria
