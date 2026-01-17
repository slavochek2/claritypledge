with claude--chrome extension you have can you run please:

# P50 + P63 User Acceptance Test

**Target:** Main branch (`localhost:5001`)
**Features:** P50 (Profile/Pledge Separation) + P63 (Google OAuth)

## Prerequisites

- Dev server running on port 5001: `npm run dev`
- Access to a Google account for OAuth tests
- Access to an email for magic link tests

---

## Test 1: Landing Page & Navigation

**Steps:**
1. Navigate to `http://localhost:5001`
2. Verify landing page loads without errors
3. Check navigation shows "Log In" link (not "Sign Up")
4. Click "Log In" link

**Expected:**
- Landing page renders with Clarity Pledge branding
- Navigation is visible with "Log In" option
- Clicking "Log In" navigates to `/login`

**Result:** [ ] PASS / [ ] FAIL

---

## Test 2: Login Page - Google OAuth Button Present

**Steps:**
1. Navigate to `http://localhost:5001/login`
2. Verify Google OAuth button is visible
3. Verify "or use magic link" divider is present
4. Verify email input field is present

**Expected:**
- "Continue with Google" button with Google logo
- Divider text "or use magic link"
- Email input for magic link option

**Result:** [ ] PASS / [ ] FAIL

---

## Test 3: Sign Pledge Page - Google OAuth Button Present

**Steps:**
1. Navigate to `http://localhost:5001/sign-pledge`
2. Verify Google OAuth button is visible at top
3. Verify "or fill out the form" divider is present
4. Verify pledge form is visible below

**Expected:**
- "Continue with Google" button above the pledge form
- Divider separating OAuth from form
- Full pledge form with name, email, reason fields

**Result:** [ ] PASS / [ ] FAIL

---

## Test 4: Google OAuth Flow - New User via /sign-pledge

**Steps:**
1. Navigate to `http://localhost:5001/sign-pledge`
2. Click "Continue with Google"
3. Complete Google OAuth (select account, authorize)
4. Wait for redirect back to app

**Expected:**
- Redirects to Google OAuth consent screen
- After authorization, returns to `/auth/callback?source=pledge`
- Creates profile with `has_pledged=true`
- Redirects to `/p/{slug}/pledge` (certificate page)
- Profile shows Google avatar (if available)

**Result:** [ ] PASS / [ ] FAIL

**Notes:** (record slug, any errors)

---

## Test 5: Google OAuth Flow - Returning User via /login

**Steps:**
1. Log out if logged in (clear session or use `/settings`)
2. Navigate to `http://localhost:5001/login`
3. Click "Continue with Google"
4. Select same Google account used in Test 4

**Expected:**
- Redirects to Google OAuth
- After authorization, returns to `/auth/callback?source=login`
- Recognizes existing profile
- Redirects to `/p/{slug}/pledge` (existing pledger) or `/p/{slug}` (non-pledger)
- Does NOT create duplicate profile

**Result:** [ ] PASS / [ ] FAIL

---

## Test 6: Profile Page Structure (P50)

**Steps:**
1. Navigate to profile page from Test 4/5 redirect (or `/p/{slug}`)
2. Examine page structure

**Expected:**
- Profile shows name, avatar, role (if set)
- "View Pledge Certificate" button/link visible for pledgers
- LinkedIn link visible if set
- Endorsement section visible

**Result:** [ ] PASS / [ ] FAIL

---

## Test 7: Pledge Certificate Page (P50)

**Steps:**
1. Click "View Pledge Certificate" or navigate to `/p/{slug}/pledge`
2. Examine certificate page

**Expected:**
- Certificate renders with formal styling
- Shows pledger name
- Shows pledge text (Your Right, My Promise, Exception)
- Shows signed date
- Share button visible

**Result:** [ ] PASS / [ ] FAIL

---

## Test 8: /me Redirect (P50)

**Steps:**
1. While logged in, navigate to `http://localhost:5001/me`

**Expected:**
- Redirects to `/p/{your-slug}` (your profile page)
- Shows your own profile

**Result:** [ ] PASS / [ ] FAIL

---

## Test 9: Pledgers Directory

**Steps:**
1. Navigate to `http://localhost:5001/pledgers`
2. Verify your profile appears in the list

**Expected:**
- Directory page loads
- Shows list of verified pledgers
- Your profile card is visible (may need to scroll)
- Cards show avatar, name, role

**Result:** [ ] PASS / [ ] FAIL

---

## Test 10: Magic Link Login (Existing User)

**Steps:**
1. Log out
2. Navigate to `/login`
3. Enter email of existing account
4. Click "Send Magic Link"
5. Check email and click magic link

**Expected:**
- "Check your email" confirmation shows
- Email arrives with magic link
- Clicking link logs you in
- Redirects to profile page

**Result:** [ ] PASS / [ ] FAIL

---

## Test 11: Console Errors Check

**Steps:**
1. Open browser DevTools (F12)
2. Navigate through the flows above
3. Check Console tab for errors

**Expected:**
- No JavaScript errors in console
- No failed network requests (except expected 404s for missing optional resources)
- No React warnings about key props, etc.

**Result:** [ ] PASS / [ ] FAIL

**Errors found:** (list any)

---

## Summary

| Test | Status |
|------|--------|
| 1. Landing & Navigation | |
| 2. Login - Google Button | |
| 3. Sign Pledge - Google Button | |
| 4. Google OAuth - New User | |
| 5. Google OAuth - Returning User | |
| 6. Profile Page Structure | |
| 7. Pledge Certificate Page | |
| 8. /me Redirect | |
| 9. Pledgers Directory | |
| 10. Magic Link Login | |
| 11. Console Errors | |

**Overall:** [ ] ALL PASS / [ ] ISSUES FOUND

**Issues to fix:**

---

**Tested by:** _______________
**Date:** _______________
