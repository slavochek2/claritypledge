# Plan: Fix Menu Blinking & Refactor Navigation

**Status**: PLANNING
**Priority**: Medium
**Estimated Time**: 25 minutes

---

## Problem Statement

1.  **Blinking Issue**: Logged-in users see the "Log In" button flash briefly before their avatar appears because the app doesn't wait for the profile data to load before rendering the guest menu.
2.  **Incoherent Navigation**:
    *   `SimpleNavigation` has inline code for the guest menu.
    *   There is a broken, unused file `src/app/components/navigation/guest-menu.tsx` that references a missing context (`pledge-modal-context`).
    *   This leads to confusion and potential code duplication.

---

## Proposed Solution

We will kill two birds with one stone: fix the race condition and clean up the component structure.

### 1. Fix the Logic (The Blink)

Derive a `showLoading` state in `SimpleNavigation`:
```typescript
// We are "loading" if:
// 1. The auth check is running (isLoading)
// 2. OR we have a session but no profile yet (fetching profile)
const showLoading = isLoading || (!!session && !currentUser);
```

### 2. Refactor Components (The Coherence)

We will standardize the navigation components:
1.  **Delete** the broken `src/app/components/navigation/guest-menu.tsx`.
2.  **Create** a NEW `src/app/components/navigation/guest-menu.tsx` that contains the *actual, working* guest buttons (using `Link` to `/login` and `/sign-pledge`) currently inline in `SimpleNavigation`.
3.  **Update** `SimpleNavigation` to use this new `GuestMenu` component.

This ensures that "Guest Menu" means one thing: the buttons we actually use.

---

## Implementation Details

### Step 1: Clean Up
- Delete `src/app/components/navigation/guest-menu.tsx`.

### Step 2: Create New GuestMenu
Create `src/app/components/navigation/guest-menu.tsx` with:
```typescript
import { Link } from "react-router-dom";

export function GuestMenu() {
  return (
    <>
      <Link
        to="/login"
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium hover:text-primary transition-colors h-9 px-4 py-2"
      >
        Log In
      </Link>
      <Link
        to="/sign-pledge"
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow h-10 rounded-md px-8 bg-blue-500 hover:bg-blue-600 text-white font-semibold"
      >
        Take the Pledge
      </Link>
    </>
  );
}
```

### Step 3: Update SimpleNavigation
Modify `src/app/components/simple-navigation.tsx`:
1.  Import `GuestMenu` and `useAuth` (with session).
2.  Implement `showLoading` logic.
3.  Replace inline buttons with `<GuestMenu />`.

```typescript
// ... imports
import { GuestMenu } from "./navigation/guest-menu";

export function SimpleNavigation() {
  // ... hooks
  const { user: currentUser, session, isLoading, signOut } = useAuth();
  
  // Derived state to prevent blinking
  const showLoading = isLoading || (!!session && !currentUser);

  // ... render
  {/* Desktop Navigation - Public Links */}
  {(!currentUser && !showLoading) && (
     // ... Links to Manifesto, Champions, Services
  )}

  {/* CTA Buttons / User Menu */}
  <div className="hidden md:flex items-center gap-4">
    {showLoading ? (
      <div className="w-24 h-10" />
    ) : currentUser ? (
      // User Menu (Dropdown)
    ) : (
      <GuestMenu />
    )}
  </div>
```

---

## Testing Checklist

- [ ] **Code Quality**: Ensure no dead code (`pledge-modal-context` refs) remains.
- [ ] **Logged Out**: Guest Menu appears correctly using the new component.
- [ ] **Logged In**: No blinking. Loading gap -> User Menu.
- [ ] **Mobile**: Ensure Mobile menu also uses the correct logic (though it might need its own inline links or a specific MobileGuestMenu if styles differ significantly). *Note: Mobile menu uses "w-full" on buttons, so we might leave mobile inline or pass a prop.*

## Time Estimate
- Implementation: 15 minutes
- Testing: 10 minutes
