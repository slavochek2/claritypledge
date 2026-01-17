# Navigation Acceptance Criteria

**Last Updated:** 2026-01-16
**Test File:** `src/tests/navigation-acceptance-full.test.tsx`
**Total Tests:** 67

---

## User State Matrix

| State | session | user | isVerified | hasPledged | slug |
|-------|---------|------|------------|------------|------|
| **Anonymous** | null | null | - | - | - |
| **Unverified /live** | ✓ | ✓ | false | false | null |
| **Verified Non-Pledger** | ✓ | ✓ | true | false | "slug" |
| **Verified Pledger** | ✓ | ✓ | true | true | "slug" |

---

## Expected Menu Items by User State

**Key UX principle:** Unverified users ARE logged in (have session). They should see logged-in menu items, not public menu.

### SimpleNavigation (Landing, Profile pages)

| Menu Item | Anonymous | Unverified | Verified Non-Pledger | Verified Pledger |
|-----------|-----------|------------|----------------------|------------------|
| Log In | ✓ | ✗ | ✗ | ✗ |
| Log Out | ✗ | ✓ | ✓ | ✓ |
| View My Profile | ✗ | ✓ | ✓ | ✓ |
| Take the Pledge (CTA) | ✓ | ✓ | ✗ | ✗ |
| Take the Pledge (menu) | ✗ | ✓ | ✓ | ✗ |
| View My Pledge | ✗ | ✗ | ✗ | ✓ |
| Settings | ✗ | ✓ | ✓ | ✓ |

### LiveSessionBanner (/live pages)

| Menu Item | Anonymous | Unverified | Verified Non-Pledger | Verified Pledger |
|-----------|-----------|------------|----------------------|------------------|
| Log In | ✓ | ✗ | ✗ | ✗ |
| Log Out | ✗ | ✓ | ✓ | ✓ |
| View My Profile | ✗ | ✓ | ✓ | ✓ |
| Take the Pledge | ✗ | ✓ | ✓ | ✗ |
| View My Pledge | ✗ | ✗ | ✗ | ✓ |
| Settings | ✗ | ✓ | ✓ | ✓ |
| Sound Toggle | ✓ | ✓ | ✓ | ✓ |
| Leave Meeting | ✓* | ✓* | ✓* | ✓* |

*Only shown when `isLiveMeeting=true` and `onExit` is provided

---

## Menu Link Destinations

| Menu Item | Destination |
|-----------|-------------|
| Log In | `/login` |
| View My Profile | `/me` |
| Take the Pledge (menu) | `/sign-pledge?prefill=true` |
| View My Pledge | `/p/{slug}/pledge` |
| Settings | `/settings` |
| Home | `/` |

---

## User Journeys

### Journey 1: Anonymous → Unverified /live User
```
1. Anonymous user visits /live
2. Enters name and email
3. Creates meeting (anonymous auth)
4. User now has session but isVerified=false
5. Menu changes: "Log In" → "Log Out"
```

### Journey 2: Unverified → Verified User
```
1. Unverified user clicks "Verify Email" on /me
2. Receives magic link email
3. Clicks magic link
4. AuthCallback sets isVerified=true
5. Menu changes: Shows "View My Profile", "Settings"
```

### Journey 3: Verified Non-Pledger → Verified Pledger
```
1. Verified user clicks "Take the Pledge"
2. Fills out pledge form
3. Submits pledge
4. hasPledged=true
5. Menu changes: "Take the Pledge" → "View My Pledge"
```

### Journey 4: Any User → Sign Out
```
1. User clicks "Log Out"
2. signOut() called
3. Session cleared
4. User returns to Anonymous state
5. Menu changes to show "Log In"
```

---

## Consistency Rules

1. **Same menu on both navs:** For any user state, SimpleNavigation and LiveSessionBanner must show the same auth-related menu items (excluding /live-specific items like Sound toggle).

2. **No layout shift:** Both navigation headers use `h-16 lg:h-20` for consistent vertical positioning.

3. **Session = Log Out access:** ANY user with a session (even unverified) can log out.

4. **Session = logged-in menu:** ANY user with a session sees logged-in menu items (View My Profile, Settings, Log Out). Unverified users go to `/me` which shows verification prompt.

---

## Test Coverage

| Category | Tests |
|----------|-------|
| SimpleNavigation Desktop | 24 |
| SimpleNavigation Mobile | 8 |
| LiveSessionBanner | 24 |
| Consistency | 4 |
| Sign Out Flow | 4 |
| Link Destinations | 9 |
| Header Height | 2 |
| **Total** | **67** |

---

## How to Run Tests

```bash
# Run all navigation acceptance tests
npm test -- src/tests/navigation-acceptance-full.test.tsx

# Run specific section
npm test -- src/tests/navigation-acceptance-full.test.tsx -t "SimpleNavigation Desktop"

# Run all tests
npm test
```

---

## Adding New User States

If a new user state is added:

1. Add state constant in test file (e.g., `NEW_USER_STATE()`)
2. Add column to "Expected Menu Items" tables above
3. Add tests for all navigation components
4. Add consistency test
5. Update this document
