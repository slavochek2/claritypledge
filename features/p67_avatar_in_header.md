# P67: Avatar Replaces Hamburger for Signed-In Users

## Problem

When users are signed in, there's no visual confirmation in the header. The hamburger menu looks identical whether logged in or out. Users have to open the menu to see their auth state.

## Solution

Replace the hamburger icon with a colored initials avatar for signed-in verified users. The avatar triggers the same dropdown menu — just a visual swap of the trigger icon.

**Key insight:** One menu is better UX. Don't add a second trigger.

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

```
   ┌───┐
   │ S │   ← First letter of name, white text
   └───┘
     ↑
  32x32px circle
  Background: user's avatar_color (or #3b82f6 fallback)
```

- Same size as hamburger button (~40x40 touch target with padding)
- Hover: ring or subtle highlight
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
   - Import avatar component
   - Swap hamburger icon for avatar when `showUserMenu === true`
   - Desktop: swap `<MenuIcon>` for `<UserAvatar>`
   - Mobile: swap `<MenuIcon>` / `<XIcon>` for `<UserAvatar>` / `<XIcon>`

2. **`src/app/components/partners/live-session-banner.tsx`**
   - Same pattern: swap trigger icon based on auth state
   - Keep all existing menu items (Sound, Leave Meeting, etc.)

3. **Create `src/app/components/layout/user-avatar.tsx`** (new)
   - Simple presentational component
   - Props: `name`, `avatarColor`, `size`
   - Returns circular div with first letter

### No Changes Needed

- `NavigationMenuItems` — already handles all menu content correctly
- `useNavAuthState` — already provides all needed state
- `nav-links.ts` — static, no changes

### Implementation Details

#### user-avatar.tsx (new file)

```tsx
interface UserAvatarProps {
  name: string;
  avatarColor?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function UserAvatar({ name, avatarColor, size = 'sm', className }: UserAvatarProps) {
  const initial = name?.charAt(0)?.toUpperCase() || '?';
  const bgColor = avatarColor || '#3b82f6'; // blue-500 fallback

  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base';

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center text-white font-medium',
        sizeClasses,
        className
      )}
      style={{ backgroundColor: bgColor }}
    >
      {initial}
    </div>
  );
}
```

#### simple-navigation.tsx changes

```tsx
// In desktop menu trigger:
<DropdownMenuTrigger asChild>
  <button className="..." aria-label="Menu">
    {showUserMenu && user ? (
      <UserAvatar name={user.name} avatarColor={user.avatarColor} />
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
    <UserAvatar name={user.name} avatarColor={user.avatarColor} />
  ) : (
    <MenuIcon className="w-6 h-6" />
  )}
</button>
```

#### live-session-banner.tsx changes

Same pattern — swap `<MenuIcon>` for `<UserAvatar>` when `showUserMenu && user`.

## Edge Cases

| Case | Behavior |
|------|----------|
| Auth loading | Show hamburger (prevents flicker) |
| Unverified user | Show hamburger (treated as signed out for menu) |
| No `avatar_color` | Fallback to `#3b82f6` (blue-500) |
| No name | Show "?" as initial |
| Name starts with emoji/number | Show first character as-is |

## Test Updates Required

### Unit Tests

- `navigation-acceptance-full.test.tsx` — add tests for avatar trigger
- `live-session-banner.test.tsx` — add tests for avatar trigger
- `header-consistency.test.tsx` — verify avatar styling matches between components

### Test Cases to Add

```tsx
// Verified user sees avatar instead of hamburger
it('shows avatar trigger for verified user', () => {
  mockAuthState({ showUserMenu: true, user: { name: 'Slava', avatarColor: '#10b981' } });
  render(<SimpleNavigation />);
  expect(screen.getByText('S')).toBeInTheDocument(); // Avatar initial
  expect(screen.queryByLabelText('Menu')).not.toHaveClass('lucide-menu'); // No hamburger icon
});

// Signed out user sees hamburger
it('shows hamburger for signed out user', () => {
  mockAuthState({ showUserMenu: false });
  render(<SimpleNavigation />);
  expect(screen.getByLabelText('Menu')).toBeInTheDocument();
});
```

## Success Criteria

- [ ] Verified users see avatar (with correct color) instead of hamburger
- [ ] Clicking avatar opens same dropdown menu
- [ ] Signed out/unverified users still see hamburger
- [ ] Mobile menu works with avatar trigger
- [ ] `/live` page shows avatar for verified users
- [ ] No flicker during auth loading (hamburger shown until resolved)
- [ ] All existing tests pass
- [ ] New tests cover avatar states

## Analytics

Track trigger type for menu opens:
- `nav_menu_opened` — `{ trigger: 'hamburger' | 'avatar', device: 'desktop' | 'mobile' }`

## Out of Scope (Future)

- Photo upload support (requires Supabase Storage)
- Tooltip on avatar hover
- Avatar in other locations (footer, etc.)
