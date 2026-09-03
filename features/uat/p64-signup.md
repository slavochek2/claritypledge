with claude--chrome extension you have can you run please:

# P64 User Acceptance Test - Standalone Signup

**Target:** Worktree 2 (`localhost:5200`)
**Feature:** P64 (Standalone Signup - account without pledging)

## Prerequisites

- Dev server running on worktree 2, port 5200
- Access to a Google account for OAuth tests
- Access to an email that does NOT have an existing account (for new signup tests)
- P50/P63 tests should pass on main first

---

## Test 1: Signup Page Exists

**Steps:**
1. Navigate to `http://localhost:5200/signup`
2. Verify page loads

**Expected:**
- Page title: "Create Account"
- Subtitle: "Join the community and explore"
- Google OAuth button visible
- "or use email" divider
- Email input field
- "Create Account" button
- Link to "Sign the Clarity Pledge" at bottom
- Link to login page

**Result:** [ ] PASS / [ ] FAIL

---

## Test 2: Login Page Links to Signup

**Steps:**
1. Navigate to `http://localhost:5200/login`
2. Look for "Don't have an account? Sign up" link
3. Click it

**Expected:**
- Link is visible below the form
- Clicking navigates to `/signup`

**Result:** [ ] PASS / [ ] FAIL

---

## Test 3: Login with Non-Existent Email

**Steps:**
1. Navigate to `http://localhost:5200/login`
2. Enter an email that has no account (e.g., `nonexistent-test-12345@example.com`)
3. Click "Send Magic Link"

**Expected:**
- Error message: "No account found with this email. Sign up instead."
- Does NOT send a magic link
- Form stays on page (not redirected)

**Result:** [ ] PASS / [ ] FAIL

---

## Test 4: Google OAuth Signup - New User via /signup

**Steps:**
1. Navigate to `http://localhost:5200/signup`
2. Click "Continue with Google"
3. Select a Google account that does NOT have an existing profile
4. Complete OAuth flow

**Expected:**
- Redirects to Google OAuth with `source=signup` in callback URL
- After authorization, creates profile with:
  - `has_pledged = false`
  - `is_verified = true`
  - Name from Google
  - Avatar from Google (if available)
  - Slug generated from name
- Redirects to `/p/{slug}` (profile page, NOT certificate)

**Result:** [ ] PASS / [ ] FAIL

**Notes:** (record slug, verify has_pledged is false)

---

## Test 5: Email Magic Link Signup - New User via /signup

**Steps:**
1. Navigate to `http://localhost:5200/signup`
2. Enter a new email (one without existing account)
3. Click "Create Account"
4. Check email and click magic link

**Expected:**
- Shows "Check Your Email" confirmation
- Email arrives with magic link
- Clicking link goes to `/auth/callback?source=signup`
- Creates profile with `has_pledged = false`
- Redirects to `/p/{slug}` (profile, NOT certificate)

**Result:** [ ] PASS / [ ] FAIL

---

## Test 6: Non-Pledged User Profile Page

**Steps:**
1. Using the account from Test 4 or 5, view your profile
2. Examine what's shown/hidden

**Expected:**
- Profile page shows name, avatar
- Does NOT show "View Pledge Certificate" prominently (they haven't pledged)
- May show a CTA to "Take the Pledge" or similar
- Endorsement section may be hidden or show "Take pledge to receive endorsements"

**Result:** [ ] PASS / [ ] FAIL

---

## Test 7: Non-Pledged User Takes Pledge (Upgrade Flow)

**Steps:**
1. Using non-pledged account from Test 4/5, navigate to `/sign-pledge`
2. Form should work normally (may show Google button or email form)
3. Complete the pledge flow

**Expected:**
- Can complete pledge form
- After completing, `has_pledged` becomes `true`
- Redirects to `/p/{slug}/pledge` (certificate page)
- Profile now shows certificate access

**Result:** [ ] PASS / [ ] FAIL

---

## Test 8: Signup Page Message Parameter

**Steps:**
1. Navigate to `http://localhost:5200/signup?message=no-account`
2. Verify info banner appears

**Expected:**
- Blue info banner at top: "No account found with that email. Create one below."
- Rest of signup form works normally

**Result:** [ ] PASS / [ ] FAIL

---

## Test 9: Sign Pledge Page - Google OAuth

**Steps:**
1. Log out
2. Navigate to `http://localhost:5200/sign-pledge`
3. Verify Google OAuth button is present
4. Click it and complete OAuth with a new Google account

**Expected:**
- "Continue with Google" button visible above form
- "or fill out the form" divider
- After OAuth, creates profile with `has_pledged = true`
- Redirects to certificate page

**Result:** [ ] PASS / [ ] FAIL

---

## Test 10: Existing Pledger Logs In via /login

**Steps:**
1. Using the upgraded account from Test 7, log out
2. Go to `/login`
3. Use Google OAuth or magic link to log in

**Expected:**
- Login succeeds
- Redirects to `/p/{slug}/pledge` (certificate, because has_pledged=true)
- Does NOT change has_pledged status

**Result:** [ ] PASS / [ ] FAIL

---

## Test 11: Console Errors Check

**Steps:**
1. Open browser DevTools (F12)
2. Navigate through all the flows above
3. Check Console tab for errors

**Expected:**
- No JavaScript errors
- No failed network requests
- No React warnings

**Result:** [ ] PASS / [ ] FAIL

**Errors found:**

---

## Test 12: Database Verification (Optional - via Supabase MCP)

**Steps:**
1. Use Supabase MCP to query profiles table
2. Verify the test accounts created above

**SQL to run:**
```sql
SELECT slug, email, has_pledged, is_verified, avatar_url
FROM profiles
WHERE email LIKE '%test%' OR created_at > now() - interval '1 hour'
ORDER BY created_at DESC;
```

**Expected:**
- Signup accounts have `has_pledged = false`
- Pledge accounts have `has_pledged = true`
- All have `is_verified = true`
- Google accounts have `avatar_url` set

**Result:** [ ] PASS / [ ] FAIL

---

## Summary

| Test | Status |
|------|--------|
| 1. Signup Page Exists | |
| 2. Login Links to Signup | |
| 3. Login Non-Existent Email | |
| 4. Google OAuth Signup | |
| 5. Email Magic Link Signup | |
| 6. Non-Pledged User Profile | |
| 7. Non-Pledged User Upgrade | |
| 8. Signup Message Parameter | |
| 9. Sign Pledge - Google OAuth | |
| 10. Existing Pledger Login | |
| 11. Console Errors | |
| 12. Database Verification | |

**Overall:** [ ] ALL PASS / [ ] ISSUES FOUND

**Issues to fix:**

---

**Tested by:** _______________
**Date:** _______________
