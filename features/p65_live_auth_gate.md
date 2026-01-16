# P65: Live Meeting Auth Gate

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
| Not logged in | → Redirect to `/signup?redirect=/live`, then back to /live after auth |
| Logged in | → Creates meeting immediately (current behavior) |

### Joining with Code
- Works for everyone (no auth required to participate)
- No change needed

## Technical Implementation

1. In `/live` page, check `useAuth()` before creating meeting
2. If not authenticated, redirect to `/signup?redirect=/live`
3. Add `redirect` param support to signup/login pages
4. AuthCallbackPage respects `redirect` param after successful auth

## Decisions Made

1. **Non-pledged users (has_pledged=false) CAN start meetings** - they're still verified users with accounts

2. **Button text stays "Start New Meeting"** - no need for different text based on auth state

3. **Join with code remains public** - anyone can participate, only hosting requires auth

## Implementation Checklist

- [ ] Update /live page: check auth on "Start New Meeting" click
- [ ] If not logged in → redirect to `/signup?redirect=/live`
- [ ] Add `redirect` query param support to signup-page.tsx
- [ ] Add `redirect` query param support to login-page.tsx
- [ ] AuthCallbackPage: after success, check for `redirect` param and navigate there

## Out of Scope
- Rate limiting meeting creation
- Premium/paid meeting features
- Changing page layout based on auth state
