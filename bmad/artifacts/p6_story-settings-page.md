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

- [ ] Settings page accessible at `/settings` route
- [ ] Unauthenticated users redirected to sign-pledge page
- [ ] Form pre-populated with current profile data
- [ ] Name field required, cannot be empty
- [ ] LinkedIn URL validated if provided (must contain `linkedin.com`)
- [ ] Save button disabled while no changes made
- [ ] Success message shown after save
- [ ] Profile data refreshed in auth context after save
- [ ] Navigation link added for authenticated users

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
