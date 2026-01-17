# P66: Live Meeting Auth Gate

## Problem
Currently anyone can start a Clarity Live meeting without an account. We want registered/verified users only to ensure accountability and quality.

## Solution
Gate the "Start New Meeting" button behind authentication. Page layout stays the same.

## User Flows

### Page Layout (same for everyone)
```
/live page shows:
- "Start New Meeting" button
- "Join with Code" input field
```

### Clicking "Start New Meeting"

| User State | Action |
|------------|--------|
| Not logged in | → Redirect to `/signup` (user returns to /live via nav after signup) |
| Logged in | → Creates meeting immediately (current behavior) |

### Joining with Code
- Works for everyone (no auth required to participate)
- No change needed

## Technical Implementation

1. In `/live` page, check `useAuth()` before creating meeting
2. If not authenticated, `navigate('/signup')`

No changes needed to signup page, login page, or AuthCallbackPage.

## Decisions Made

1. **Non-pledged users (has_pledged=false) CAN start meetings** - they're still verified users with accounts

2. **Button text stays "Start New Meeting"** on `/live` page - no need for different text based on auth state

3. **Join with code remains public** - anyone can participate, only hosting requires auth

4. **Rename "Try a Clarity Meeting" → "Start a Clarity Meeting"** everywhere - "Try" implies instant access without signup, which is misleading now that we gate hosting

## Copy Updates (All Locations)

Rename all instances of "Try a Clarity Meeting" to **"Start a Clarity Meeting"**:

| File | Line | Change |
|------|------|--------|
| `src/app/components/layout/simple-navigation.tsx` | 103, 163 | Nav CTA button (desktop + mobile) |
| `src/app/components/landing/user-journey-section.tsx` | 8 | Journey step title |
| `src/app/components/landing/dual-cta.tsx` | 38, 51 | CTA buttons |
| `src/app/pages/full-article-page.tsx` | 382 | Article CTA |

Analytics event: Keep `try_meeting` as-is (changing event names breaks historical data).

## Implementation Checklist

### Auth Gate
- [ ] Update /live page: check auth on "Start New Meeting" click, redirect to `/signup` if not logged in

### Copy Updates
- [ ] simple-navigation.tsx: "Try a Clarity Meeting" → "Start a Clarity Meeting" (2 places)
- [ ] user-journey-section.tsx: "Try a Clarity Meeting" → "Start a Clarity Meeting"
- [ ] dual-cta.tsx: "Try a Clarity Meeting" → "Start a Clarity Meeting" (2 places)
- [ ] full-article-page.tsx: "Try a Clarity Meeting" → "Start a Clarity Meeting"

## Out of Scope
- Rate limiting meeting creation
- Premium/paid meeting features
- Changing page layout based on auth state
- Renaming analytics events (would break historical data)
- Auto-redirect back to /live after signup (KISS: user returns via nav)
