# P50 Chrome Extension Acceptance Tests

**Purpose:** Manual verification tests for `claude --chrome` to validate P50 Profile & Pledge Separation.

**How to use:** Run `claude --chrome` and paste this document, or reference specific sections.

**Test URL:** http://localhost:5200 (or production URL)

---

## Test Matrix Overview

| User State | Has Session | is_verified | has_pledged | slug | Profile Page |
|------------|-------------|-------------|-------------|------|--------------|
| Anonymous | no | - | - | - | no |
| Unverified /live | yes | false | false | null | no |
| Verified Non-Pledger | yes | true | false | yes | yes |
| Verified Pledger | yes | true | true | yes | yes |

---

## 1. ANONYMOUS USER TESTS

### Test 1.1: Landing Page Navigation Menu
**Steps:**
1. Open http://localhost:5200 in incognito/fresh browser
2. Click hamburger menu (top right)

**Expected Menu Items:**
- [ ] Home
- [ ] Log In
- [ ] NO "Log Out"
- [ ] NO "View My Profile"
- [ ] NO "Verify Email"
- [ ] NO "Settings"

**Expected CTAs (visible on page):**
- [ ] "Take the Pledge" button visible
- [ ] "Try a Clarity Meeting" button visible

### Test 1.2: /live Page for Anonymous User
**Steps:**
1. Navigate to http://localhost:5200/live
2. Verify entry form is shown

**Expected:**
- [ ] Name field visible
- [ ] Email field visible
- [ ] Terms checkbox visible
- [ ] "New meeting" button (disabled until form filled)
- [ ] "Already have an account? Log in" link visible

### Test 1.3: /me Redirect for Anonymous User
**Steps:**
1. Navigate to http://localhost:5200/me

**Expected:**
- [ ] Redirects to /login
- [ ] Does NOT show "Profile Not Found" error

### Test 1.4: /sign-pledge for Anonymous User
**Steps:**
1. Navigate to http://localhost:5200/sign-pledge

**Expected:**
- [ ] Full pledge form shown
- [ ] Name field editable
- [ ] Email field editable
- [ ] Reason field visible
- [ ] Role/LinkedIn fields visible
- [ ] Submit button says "Sign the Pledge"

---

## 2. UNVERIFIED /LIVE USER TESTS

### Setup: Create Unverified User
**Steps:**
1. Go to http://localhost:5200/live
2. Enter name: "Test Unverified"
3. Enter email: "test-unverified-[timestamp]@example.com" (use unique email)
4. Check terms checkbox
5. Click "New meeting"
6. Wait for meeting to be created (ignore mic permission dialog, click Cancel)

### Test 2.1: Menu Items for Unverified User (CRITICAL)
**Steps:**
1. After creating meeting, click hamburger menu

**Expected Menu Items:**
- [ ] Sound: On/Off toggle
- [ ] Home
- [ ] **"Verify Email"** (NOT "View My Profile") - CRITICAL
- [ ] "Take the Pledge"
- [ ] "Log Out"
- [ ] NO "Settings"
- [ ] NO "View My Pledge"

### Test 2.2: Verify Email Flow
**Steps:**
1. Click "Verify Email" in menu

**Expected:**
- [ ] Navigates to /me
- [ ] Shows "Complete Your Registration" heading
- [ ] Shows email address (the one entered)
- [ ] Shows "Verify My Email" button
- [ ] Shows message about creating public profile

### Test 2.3: /me Page for Unverified User
**Steps:**
1. Navigate to http://localhost:5200/me directly

**Expected:**
- [ ] Shows "Complete Your Registration" (NOT redirect to /login)
- [ ] Shows user's email
- [ ] Shows "Verify My Email" button
- [ ] Does NOT redirect to /p/:slug (user has no slug)

### Test 2.4: Take the Pledge for Unverified User
**Steps:**
1. Click "Take the Pledge" in menu

**Expected:**
- [ ] Navigates to /sign-pledge (NOT /sign-pledge?prefill=true)
- [ ] Form fields are EDITABLE (not prefilled/locked)
- [ ] Name field is editable
- [ ] Email field is editable
- [ ] Submit requires magic link (user is unverified)

### Test 2.5: Returning Unverified User (Session Persistence)
**Steps:**
1. After test 2.1-2.4, close the meeting
2. Go back to http://localhost:5200/live
3. Click hamburger menu

**Expected:**
- [ ] User is still logged in (has session)
- [ ] Menu still shows "Verify Email" (not "View My Profile")
- [ ] Menu shows "Log Out"
- [ ] Can start new meeting without re-entering name/email

### Test 2.6: Navigation Consistency - Landing Page
**Steps:**
1. As unverified user, navigate to http://localhost:5200
2. Click hamburger menu

**Expected (SAME as on /live):**
- [ ] Home
- [ ] "Verify Email" (NOT "View My Profile")
- [ ] "Take the Pledge"
- [ ] "Log Out"
- [ ] NO "Settings"

---

## 3. VERIFIED NON-PLEDGER TESTS

### Setup: Create Verified Non-Pledger
**Note:** This requires completing email verification via magic link. For testing:
1. Use a real email or check Supabase logs for magic link
2. Or manually update database: `UPDATE profiles SET is_verified = true, slug = 'test-verified' WHERE email = 'your-test-email'`

### Test 3.1: Menu Items for Verified Non-Pledger
**Steps:**
1. Log in as verified user who has NOT pledged
2. Click hamburger menu (on landing or /live)

**Expected Menu Items:**
- [ ] Home
- [ ] "View My Profile" (NOT "Verify Email")
- [ ] "Take the Pledge"
- [ ] "Settings"
- [ ] "Log Out"
- [ ] NO "View My Pledge" (hasn't pledged)
- [ ] NO "Verify Email" (already verified)

### Test 3.2: /me Redirect for Verified User
**Steps:**
1. Navigate to http://localhost:5200/me

**Expected:**
- [ ] Redirects to /p/:slug (user's profile page)
- [ ] Does NOT show "Complete Your Registration"

### Test 3.3: Profile Page for Non-Pledger
**Steps:**
1. Navigate to /p/:slug (user's profile)

**Expected:**
- [ ] Shows user's name
- [ ] Shows user's role (if set)
- [ ] NO blue circle around avatar (not a pledger)
- [ ] Shows "Take the Pledge" CTA button (owner view)
- [ ] Does NOT show "View My Pledge" button

### Test 3.4: Take the Pledge (Upgrade Flow)
**Steps:**
1. Click "Take the Pledge" in menu or profile CTA

**Expected:**
- [ ] Navigates to /sign-pledge?prefill=true
- [ ] Name field is READ-ONLY (prefilled)
- [ ] Email field is HIDDEN (already verified)
- [ ] Role/LinkedIn/Reason fields are editable
- [ ] Submit does NOT send magic link (direct update)

---

## 4. VERIFIED PLEDGER TESTS

### Setup: Create Verified Pledger
**Note:** Complete the pledge flow from Test 3.4, or manually update: `UPDATE profiles SET has_pledged = true WHERE slug = 'your-slug'`

### Test 4.1: Menu Items for Verified Pledger
**Steps:**
1. Log in as verified pledger
2. Click hamburger menu

**Expected Menu Items:**
- [ ] Home
- [ ] "View My Profile"
- [ ] "View My Pledge" (NOT "Take the Pledge")
- [ ] "Settings"
- [ ] "Log Out"
- [ ] NO "Take the Pledge" (already pledged)
- [ ] NO "Verify Email"

### Test 4.2: Profile Page for Pledger
**Steps:**
1. Navigate to /p/:slug

**Expected:**
- [ ] Shows blue circle around avatar (pledger indicator)
- [ ] Shows "View My Pledge" button (owner view)
- [ ] Does NOT show "Take the Pledge" CTA

### Test 4.3: Pledge Certificate Page
**Steps:**
1. Navigate to /p/:slug/pledge

**Expected:**
- [ ] Shows pledge certificate
- [ ] Shows pledge text
- [ ] Shows signed date
- [ ] Shows QR code
- [ ] Shows witnesses (if any)
- [ ] Name links back to /p/:slug

### Test 4.4: CTAs Hidden for Pledger
**Steps:**
1. Navigate to landing page (/)
2. Check top navigation CTAs

**Expected:**
- [ ] "Take the Pledge" CTA is HIDDEN (already pledged)
- [ ] "Try a Clarity Meeting" CTA is still visible

---

## 5. NAVIGATION CONSISTENCY TESTS

### Test 5.1: Same Menu on /live and Landing (Unverified)
**Steps:**
1. As unverified user, note menu items on /live
2. Navigate to landing page (/)
3. Compare menu items

**Expected:**
- [ ] Menu items are IDENTICAL on both pages
- [ ] Both show "Verify Email" (not "View My Profile")

### Test 5.2: Same Menu on /live and Landing (Verified)
**Steps:**
1. As verified user, note menu items on /live
2. Navigate to landing page (/)
3. Compare menu items

**Expected:**
- [ ] Menu items are IDENTICAL on both pages
- [ ] Both show "View My Profile" (not "Verify Email")

### Test 5.3: LiveSessionBanner Menu
**Steps:**
1. As any logged-in user, start a meeting
2. Wait for partner screen (with QR code)
3. Click hamburger menu in LiveSessionBanner

**Expected (in addition to standard menu):**
- [ ] Sound: On/Off toggle at top
- [ ] "Leave Meeting" option (if in live meeting)
- [ ] Same auth menu items as landing page for same user state

---

## 6. EDGE CASE TESTS

### Test 6.1: /p/:slug/pledge for Non-Pledger
**Steps:**
1. Navigate to /p/:slug/pledge where user has NOT pledged

**Expected:**
- [ ] Shows 404 or "Pledge not found" error
- [ ] Does NOT show empty certificate

### Test 6.2: Invalid Slug
**Steps:**
1. Navigate to /p/this-slug-does-not-exist

**Expected:**
- [ ] Shows "Profile Not Found" error
- [ ] Does NOT show blank page or crash

### Test 6.3: Session Persistence After Page Reload
**Steps:**
1. Log in (any user type)
2. Refresh the page
3. Check menu

**Expected:**
- [ ] User is still logged in
- [ ] Menu shows correct items for user state
- [ ] No flicker between states

### Test 6.4: Log Out Flow
**Steps:**
1. As any logged-in user, click "Log Out" in menu

**Expected:**
- [ ] Redirects to landing page (/)
- [ ] Menu now shows "Log In" (anonymous state)
- [ ] No "Log Out" in menu

---

## Quick Reference: Menu Items by State

| Menu Item | Anonymous | Unverified | Verified Non-Pledger | Verified Pledger |
|-----------|:---------:|:----------:|:--------------------:|:----------------:|
| Home | yes | yes | yes | yes |
| Log In | **yes** | no | no | no |
| Log Out | no | **yes** | **yes** | **yes** |
| Verify Email | no | **yes** | no | no |
| View My Profile | no | no | **yes** | **yes** |
| Take the Pledge | CTA | yes | yes | no |
| View My Pledge | no | no | no | **yes** |
| Settings | no | no | **yes** | **yes** |

---

## Test Results Summary

| Section | Pass | Fail | Notes |
|---------|------|------|-------|
| 1. Anonymous User | | | |
| 2. Unverified User | | | |
| 3. Verified Non-Pledger | | | |
| 4. Verified Pledger | | | |
| 5. Navigation Consistency | | | |
| 6. Edge Cases | | | |

**Tested by:** _______________
**Date:** _______________
**Environment:** localhost:5200 / production
**Browser:** _______________
