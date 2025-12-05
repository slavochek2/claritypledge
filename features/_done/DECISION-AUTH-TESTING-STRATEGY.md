# Auth Testing & Isolation Strategy - Decision Document

**Date:** 2025-11-30
**Status:** PENDING YOUR APPROVAL

---

## 🎯 Your Goals (In Order of Priority)

1. **Never break authentication again** (HIGHEST PRIORITY)
2. Test the full flow: signup → magic link → redirect
3. Test re-login also works
4. Fix the menu blinking issue
5. Move fast but stably

---

## 🚨 Current Problems Identified

### Problem 1: Menu Blinking on Page Reload

**Root Cause:** Lines 56 and 114 in [simple-navigation.tsx](src/polymet/components/simple-navigation.tsx:56)

```typescript
// Line 56: Shows public nav when !currentUser
{(!currentUser) && ( ... )}

// Line 114: Shows login buttons when !currentUser
{currentUser ? ( ... ) : ( ... )}
```

**What happens:**
1. Page loads → `useAuth` starts with `isLoading: true`, `user: null`
2. Navigation sees `!currentUser` (because `user === null`) → Shows "Log In" / "Take the Pledge"
3. 200ms later → `useAuth` finishes loading → `user` is set
4. Navigation re-renders → Shows user menu
5. **User sees the menu "blink" from logged-out to logged-in**

**The Fix:**
```typescript
// BEFORE (causes blink):
{(!currentUser) && (<div>Public Links</div>)}

// AFTER (no blink):
{(!currentUser && !isLoading) && (<div>Public Links</div>)}
```

**This is a 5-minute fix.** Should I do it now?

---

## 🏗️ Architecture Assessment: Is Auth Isolated Well?

**Short Answer:** Yes, the Reader-Writer pattern is good. But there's a missing piece.

**What's Good:**
✅ Reader ([useAuth.ts](src/auth/useAuth.ts)) - Read-only, no side effects
✅ Writer ([AuthCallbackPage.tsx](src/auth/AuthCallbackPage.tsx)) - Single source of truth for profile creation
✅ Separation prevents race conditions

**What's Missing:**
❌ No "Auth Context Provider" wrapping your app
❌ Every component calling `useAuth()` creates a NEW subscription to Supabase
❌ This can cause:
  - Multiple database queries on page load
  - Inconsistent state between components
  - Performance issues as app grows

**Recommended Architecture:**

```
┌─────────────────────────────────────────┐
│  App.tsx (Root)                         │
│  ┌───────────────────────────────────┐  │
│  │ <AuthProvider>                    │  │
│  │   - ONE useAuth subscription      │  │
│  │   - React Context for state       │  │
│  │   ┌─────────────────────────────┐ │  │
│  │   │ <Router>                    │ │  │
│  │   │   SimpleNavigation          │ │  │
│  │   │   Pages                     │ │  │
│  │   └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

This would:
- Fix the blinking (single source of truth)
- Improve performance (one subscription)
- Make testing easier (mock the context)

**Time to implement:** 30 minutes

**Should we do this?** Not urgent, but recommended before you scale. Can do after E2E tests.

---

## 🧪 Testing Strategy Decision

### Your Environment Situation

You have:
- ✅ One Supabase project (currently serving "production")
- ❌ No separate test Supabase
- ❌ No staging environment

**This is actually FINE for your stage.** Here's why:

1. You don't have real users yet (or very few)
2. Setting up test Supabase adds complexity
3. The data created during tests is minimal

**Recommendation:** Use your current Supabase for now, but follow test isolation practices.

---

## 🔐 Magic Link vs Password Strategy

### Option A: Keep Magic Links (Recommended)

**Pros:**
- This is your real auth flow - test what users experience
- More secure (no passwords to manage)
- Modern UX

**Cons:**
- E2E tests can't click email links
- Need workaround for testing

**Testing Solution:**
Use Supabase's **`auth.admin.createUser()`** API to create test sessions directly.

```typescript
// Test helper
async function createTestSession(email: string) {
  const { data } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true, // Skip email verification
    user_metadata: {
      name: 'Test User',
      slug: 'test-user',
    }
  });

  return data.user; // Can now login as this user in tests
}
```

**Time to setup:** 1 hour (create admin client, write helpers)

---

### Option B: Add Password Auth (NOT Recommended)

**Pros:**
- Easier to test (just fill email + password)

**Cons:**
- **Changes your real auth flow** (introduces passwords you don't want)
- Adds security surface area
- Not testing what users actually use
- Defeats the purpose of magic links

**My strong recommendation:** Don't do this. It's like removing your car's seatbelt because it's easier to test without it.

---

## 📋 My Recommended Plan (Fast + Stable)

### Phase 3A: Quick Wins (30 minutes)

1. **Fix menu blinking** - Update navigation to check `isLoading`
2. **Delete outdated unit tests** - Your existing tests are mocking too much

### Phase 3B: E2E Test Setup (3-4 hours)

1. **Install Playwright** (5 min)
2. **Create Supabase Admin helper** (45 min)
   - Setup admin client with service role key
   - Write `createTestUser()` helper
   - Write `cleanupTestUser()` helper
3. **Write E2E tests** (2 hours)
   - Test 1: Signup flow (form → success page)
   - Test 2: Auth callback + profile creation (using admin helper)
   - Test 3: Re-login flow (existing user)
4. **Add test isolation** (30 min)
   - `beforeEach` / `afterEach` hooks
   - Cleanup test data
5. **Document & commit** (15 min)

### Phase 3C: Auth Context (Optional, 30 min)

- Wrap app in `<AuthProvider>`
- Convert `useAuth` to use context
- Further eliminates blinking

---

## 🎬 Concrete Next Steps (What I'll Do)

**If you approve, I will:**

1. ✅ Fix the menu blinking (5 min)
2. ✅ Create test helpers for Supabase admin (45 min)
3. ✅ Write E2E tests with proper isolation (2-3 hours)
4. ✅ Update Phase 3 plan with realistic steps
5. ✅ Delete outdated unit tests

**What I need from you:**

1. **Supabase Service Role Key** - This is your admin key (starts with `eyJ...`). I need it to create test users. Find it in Supabase Dashboard → Settings → API → `service_role` (secret).

2. **Approval on approach** - Are you okay with:
   - Using same Supabase for tests (with cleanup)
   - Test users like `test-1234567890@example.com`
   - Using admin API to bypass magic links

---

## 💡 Answers to Your Specific Questions

### 1. Test Supabase?
**Decision:** Use your current one. Add test Supabase later when you have real users.

### 2. Database State?
**Decision:** Use `beforeEach/afterEach` to cleanup. Create test users, use them, delete them.

### 3. Substitute magic links with passwords?
**Decision:** NO. Use Supabase admin API instead.

### 4. Test isolation?
**Decision:** YES. Each test creates and destroys its own data.

### 5. Menu blinking?
**Decision:** Missing `isLoading` check in navigation. Easy fix.

### 6. Is auth isolated enough?
**Decision:** Yes for now. AuthProvider would be better but not urgent.

### 7. CI/CD?
**Decision:** Skip for now. Get local tests working first. CI is Phase 4.

---

## ⏱️ Realistic Timeline

- **Quick wins:** 30 min (blinking fix, cleanup old tests)
- **E2E setup:** 3-4 hours (helpers, tests, isolation)
- **Total:** 4-5 hours (not 2 hours from original plan)

---

## ✋ What I Need From You RIGHT NOW

**Answer these:**

1. Should I fix the menu blinking now? (Yes/No)
2. Are you comfortable with me using your Supabase service role key for test helpers? (Yes/No)
3. Do you want to proceed with this plan? (Yes/No/Changes)

**Once you answer, I'll start immediately.**
