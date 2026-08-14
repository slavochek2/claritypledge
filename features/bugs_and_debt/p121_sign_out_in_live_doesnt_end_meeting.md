---
status: backlog
type: bug
rank: 31
workstream: C1
tags: []
created_date: 2026-01-15
---
# P121: Sign Out in Live Doesn't End Meeting

## Description

When a user signs out during an active `/live` meeting, the meeting session continues running instead of properly ending.

## Reproduction Steps

1. Join a `/live` verification session with another user
2. Click the user menu/profile icon
3. Select "Sign Out"
4. Observe: Meeting continues running

## Expected Behavior

- Meeting should be terminated for the user who signed out
- Other participant should receive notification that user left
- User should be redirected to landing page or sign-in page
- Meeting resources (WebRTC connections, listeners) should be cleaned up

## Actual Behavior

- Meeting continues in background
- User may be signed out but meeting state persists
- Other participant may not know user left
- Resources not cleaned up

## Impact

- Confusing UX - user thinks they left but meeting continues
- Potential resource leaks (connections, listeners)
- Other user waiting indefinitely
- Data inconsistency (meeting status vs auth status)

## Potential Root Causes

1. Sign out handler doesn't check for active meeting
2. Meeting cleanup not tied to auth state change
3. Missing listener for auth state in meeting component
4. Navigation happens before cleanup completes

## Related Code Locations

- `/src/auth/` - Authentication logic
- `/src/app/pages/live-meeting-page.tsx` - Meeting component
- `/src/app/components/navigation/` - Sign out button

## Suggested Fix

Add meeting cleanup to sign out flow:

```typescript
// In sign out handler
const handleSignOut = async () => {
  // 1. Check if in active meeting
  if (activeMeetingId) {
    await endMeeting(activeMeetingId);
  }

  // 2. Then sign out
  await signOut();

  // 3. Navigate
  navigate('/');
};
```

Or add auth listener to meeting component to auto-cleanup on sign out.

## Priority Justification

**High** because:
- Affects core feature (/live meetings)
- Causes resource leaks
- Poor user experience
- Data inconsistency risk

## Next Steps

- [ ] Investigate exact flow in live-meeting-page.tsx
- [ ] Determine best cleanup location (sign out handler vs meeting component)
- [ ] Add test case for sign out during meeting
- [ ] Implement fix
- [ ] Verify other participant gets proper notification
