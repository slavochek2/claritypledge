---
status: done
type: story
tags: []
rank: 125448.0
created_date: 2026-01-17
---

# P67: Avatar Replaces Hamburger for Signed-In Users

## Problem

When users are signed in, there's no visual confirmation in the header. The hamburger menu looks identical whether logged in or out. Users have to open the menu to see their auth state.

## Solution

Replace the hamburger icon with the user's avatar for signed-in verified users. The avatar triggers the same dropdown menu — just a visual swap of the trigger icon.

**Key insight:** One menu is better UX. Don't add a second trigger.

## Key Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Mobile menu open state | X replaces avatar (matches current hamburger behavior) |
| 2 | Avatar size | 40px (`sm` size) — good touch target, no new code |
| 3 | Initials format | Two initials via `getInitials()` — more distinctive |
| 4 | Component | Reuse existing `GravatarAvatar` — supports photos + initials fallback |

## Architecture Overview

### Two Navigation Components

| Component | Used Where | Current Trigger |
|-----------|-----------|-----------------|
| `SimpleNavigation` | All pages except `/live` | Hamburger (desktop dropdown + mobile slide) |
| `LiveSessionBanner` | `/live` page only | Hamburger (always dropdown) |

Both use `NavigationMenuItems` for shared menu content.

### Auth States (from `useNavAuthState`)

| State | `showUserMenu` | `showPublicCTAs` | Description |
|-------|----------------|------------------|-------------|
| Loading | `false` | `true` | Auth resolving |
| Signed out | `false` | `true` | No session |
| Unverified | `false` | `true` | Has session, not verified |
| Verified | `true` | `false` | Full user menu |

**Avatar shows only when `showUserMenu === true`** (verified users with loaded profile).

## Complete State Matrix

### SimpleNavigation (All Pages Except /live)

#### Desktop

| Auth State | Menu Trigger | CTA Buttons | Dropdown Contents |
|------------|--------------|-------------|-------------------|
| Loading | Hamburger | Hidden | Nav links, Log In |
| Signed out | Hamburger | Take Pledge, Start Meeting | Nav links, Log In |
| Unverified | Hamburger | Take Pledge, Start Meeting | Nav links, Log In |
| **Verified (not pledged)** | **Avatar** | Take Pledge, Start Meeting | Nav links, Take Pledge, My Profile, Settings, Log Out |
| **Verified (pledged)** | **Avatar** | Start Meeting | Nav links, View My Pledge, My Profile, Settings, Log Out |

#### Mobile

| Auth State | Menu Trigger | Menu Contents |
|------------|--------------|---------------|
| Loading | Hamburger | Start Meeting, Take Pledge, Nav links, Log In |
| Signed out | Hamburger | Start Meeting, Take Pledge, Nav links, Log In |
| Unverified | Hamburger | Start Meeting, Take Pledge, Nav links, Log In |
| **Verified (not pledged)** | **Avatar** | Start Meeting, Take Pledge, Nav links, Take Pledge, My Profile, Settings, Log Out |
| **Verified (pledged)** | **Avatar** | Start Meeting, Nav links, View My Pledge, My Profile, Settings, Log Out |

### LiveSessionBanner (/live Page)

| Auth State | Menu Trigger | Dropdown Contents |
|------------|--------------|-------------------|
| Loading | Hamburger | Sound toggle, Leave Meeting, Home, Log In |
| Signed out | Hamburger | Sound toggle, Leave Meeting, Home, Log In |
| Unverified | Hamburger | Sound toggle, Leave Meeting, Home, Log In |
| **Verified (not pledged)** | **Avatar** | Sound toggle, Leave Meeting, Home, Take Pledge, My Profile, Settings, Log Out |
| **Verified (pledged)** | **Avatar** | Sound toggle, Leave Meeting, Home, View My Pledge, My Profile, Settings, Log Out |

## UI Specification

### Avatar Component

Reuse existing `GravatarAvatar` component (`src/components/ui/gravatar-avatar.tsx`):

```
   ┌────┐
   │ JD │   ← Two initials via getInitials(), white text
   └────┘      OR photo if user.avatarUrl exists
     ↑
  40x40px circle (size="sm")
  Background: user's avatarColor (or #0044CC fallback)
```

- 40x40 touch target (existing `sm` size)
- Supports photo URLs (P63 Google OAuth avatars) with fallback to initials
- Hover: ring or subtle highlight (added via wrapper button)
- Focus: visible focus ring (accessibility)

### Visual Change

**Before (signed in):**
```
[Logo]                    [Take Pledge] [Start Meeting] [☰]
```

**After (signed in):**
```
[Logo]                    [Take Pledge] [Start Meeting] [S]
                                                         ↑
                                                      Avatar
```

**Signed out (unchanged):**
```
[Logo]                    [Take Pledge] [Start Meeting] [☰]
```

## Implementation Plan

### Files to Modify

1. **`src/app/components/layout/simple-navigation.tsx`**
   - Import `GravatarAvatar`
   - Swap hamburger icon for avatar when `showUserMenu === true`
   - Desktop: swap `<MenuIcon>` for `<GravatarAvatar>`
   - Mobile: swap `<MenuIcon>` for `<GravatarAvatar>` (X icon still shows when open)

2. **`src/app/components/partners/live-session-banner.tsx`**
   - Same pattern: swap trigger icon based on auth state

### No Changes Needed

- `GravatarAvatar` — already exists with all needed functionality
- `NavigationMenuItems` — already handles all menu content correctly
- `useNavAuthState` — already provides all needed state
- `nav-links.ts` — static, no changes

### Implementation Details

#### simple-navigation.tsx changes

```tsx
import { GravatarAvatar } from "@/components/ui/gravatar-avatar";

// In desktop menu trigger:
<DropdownMenuTrigger asChild>
  <button className="..." aria-label="Menu">
    {showUserMenu && user ? (
      <GravatarAvatar
        name={user.name}
        avatarColor={user.avatarColor}
        photoUrl={user.avatarUrl}
        size="sm"
      />
    ) : (
      <MenuIcon className="w-5 h-5" />
    )}
  </button>
</DropdownMenuTrigger>

// In mobile menu button:
<button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} ...>
  {isMobileMenuOpen ? (
    <XIcon className="w-6 h-6" />
  ) : showUserMenu && user ? (
    <GravatarAvatar
      name={user.name}
      avatarColor={user.avatarColor}
      photoUrl={user.avatarUrl}
      size="sm"
    />
  ) : (
    <MenuIcon className="w-6 h-6" />
  )}
</button>
```

#### live-session-banner.tsx changes

Same pattern — swap `<MenuIcon>` for `<GravatarAvatar>` when `showUserMenu && user`.

## Edge Cases

| Case | Behavior |
|------|----------|
| Auth loading | Show hamburger (prevents flicker) |
| Unverified user | Show hamburger (treated as signed out for menu) |
| No `avatarColor` | Fallback to `#0044CC` (GravatarAvatar default) |
| Has `avatarUrl` | Show photo, fall back to initials on error |
| No name | Show "?" as initial (via `getInitials`) |

## Test Updates Required

### Unit Tests

- `navigation-acceptance-full.test.tsx` — add tests for avatar trigger
- `live-session-banner.test.tsx` — add tests for avatar trigger
- `header-consistency.test.tsx` — verify avatar styling matches between components

### Test Cases to Add

```tsx
// Verified user sees avatar instead of hamburger
it('shows avatar trigger for verified user', () => {
  mockAuthState({ showUserMenu: true, user: { name: 'Slava Kuzmich', avatarColor: '#10b981' } });
  render(<SimpleNavigation />);
  expect(screen.getByText('SK')).toBeInTheDocument(); // Two initials
});

// Verified user with photo sees photo avatar
it('shows photo avatar for user with avatarUrl', () => {
  mockAuthState({ showUserMenu: true, user: { name: 'Slava', avatarUrl: 'https://example.com/photo.jpg' } });
  render(<SimpleNavigation />);
  expect(screen.getByAltText("Slava's avatar")).toBeInTheDocument();
});

// Signed out user sees hamburger
it('shows hamburger for signed out user', () => {
  mockAuthState({ showUserMenu: false });
  render(<SimpleNavigation />);
  expect(screen.getByLabelText('Menu')).toBeInTheDocument();
});
```

## Success Criteria

- [x] Verified users see avatar (initials or photo) instead of hamburger
- [x] Clicking avatar opens same dropdown menu
- [x] Signed out/unverified users still see hamburger
- [x] Mobile menu works with avatar trigger (X icon when open)
- [x] `/live` page shows avatar for verified users
- [x] Photo avatars display correctly (P63 Google OAuth users)
- [x] No flicker during auth loading (hamburger shown until resolved)
- [x] All existing tests pass
- [x] New tests cover avatar states

## Analytics

Track trigger type for menu opens:
- `nav_menu_opened` — `{ trigger: 'hamburger' | 'avatar', device: 'desktop' | 'mobile' }`

## Out of Scope (Future)

- Custom photo upload (requires Supabase Storage) — currently only Google OAuth photos supported
- Tooltip on avatar hover
- Avatar in other locations (footer, etc.)
