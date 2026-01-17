# P66.1: Live Page Redirect on Load

## Problem
P66 implemented auth gate on button click, but guests can still land on `/live` and see the hosting form. They should be redirected immediately.

## Solution
Redirect guests to `/signup` on page load unless they have a join code.

## Access Rules

| Visitor | URL | Action |
|---------|-----|--------|
| Guest | `/live` | → Redirect to `/signup` |
| Guest | `/live/ABC123` | → Can join (invited) |
| Logged-in user | `/live` | → Can host |
| Logged-in user | `/live/ABC123` | → Can join |

## Technical Implementation

Add useEffect in `clarity-live-page.tsx`:

```typescript
// P66.1: Auth gate - redirect guests without join code
useEffect(() => {
  if (isAuthLoading) return;
  if (user) return;
  if (isJoinViaLink) return;
  navigate('/signup');
}, [isAuthLoading, user, isJoinViaLink, navigate]);
```

## Implementation Checklist

- [x] Add redirect useEffect to clarity-live-page.tsx
- [x] Verify: guest on `/live` → redirected to `/signup`
- [x] Verify: guest on `/live/CODE` → can join
- [x] Verify: logged-in user on `/live` → can host (code review: `if (user) return;` exits early)
