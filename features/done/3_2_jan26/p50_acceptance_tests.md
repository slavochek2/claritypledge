# P50: User Acceptance Tests

**Purpose:** Comprehensive acceptance criteria for P50 Profile/Pledge Separation.
**Usage:** Ralph Loop iterates until ALL tests pass (score 100%).
**Sources:** P50 spec, P50_1 implementation gaps, manual QA findings.

---

## Test Scoring

```
Score = (passed_tests / total_tests) * 10
Total tests: 20
Pass threshold: 10/10 (all tests must pass)
```

---

## Category 1: Routes & Navigation (5 tests)

### UAT-1.1: Profile route exists
**Given:** User navigates to `/p/:slug`
**Then:** ProfilePage component renders (not 404)
**Verify:** `npm run build` succeeds, route defined in App.tsx

### UAT-1.2: Pledge/Certificate route exists
**Given:** User navigates to `/p/:slug/pledge`
**Then:** PledgePage (certificate) component renders
**Verify:** Route defined in App.tsx as `/p/:id/pledge`

### UAT-1.3: /me smart redirect works
**Given:** Authenticated user with slug visits `/me`
**Then:** Redirects to `/p/:slug`
**Given:** Authenticated user WITHOUT slug visits `/me`
**Then:** Shows "Complete Your Registration" prompt

### UAT-1.4: Navigation menu for pledgers
**Given:** Logged in user with `has_pledged: true`
**When:** Opens hamburger menu
**Then:** Sees: "View My Profile", "View My Pledge", "Settings", "Log Out"
**And:** "View My Profile" links to `/me`
**And:** "View My Pledge" links to `/p/:slug/pledge`

### UAT-1.5: Navigation menu for non-pledgers
**Given:** Logged in user with `has_pledged: false` AND `is_verified: true`
**When:** Opens hamburger menu
**Then:** Sees: "View My Profile", "Take the Pledge", "Settings", "Log Out"
**And:** "Take the Pledge" links to `/sign-pledge?prefill=true`

---

## Category 2: Profile Page (4 tests)

### UAT-2.1: Owner sees correct CTA based on pledge status
**Given:** Owner viewing own profile with `has_pledged: true`
**Then:** Shows "View My Pledge" button linking to `/p/:slug/pledge`

**Given:** Owner viewing own profile with `has_pledged: false`
**Then:** Shows "Take the Pledge" CTA button linking to `/sign-pledge?prefill=true`

### UAT-2.2: Visitor sees correct info based on target's pledge status
**Given:** Visitor viewing profile where target `has_pledged: true`
**Then:** Shows "View their pledge →" link to `/p/:slug/pledge`

**Given:** Visitor viewing profile where target `has_pledged: false`
**Then:** Shows "Member of the Clarity community" (no pledge link)

### UAT-2.3: Avatar shows pledge indicator
**Given:** Profile with `has_pledged: true`
**Then:** Avatar has blue circle/ring border

**Given:** Profile with `has_pledged: false`
**Then:** Avatar has NO blue circle

### UAT-2.4: Unverified owner sees verification prompt
**Given:** Owner viewing own profile with `is_verified: false`
**Then:** Shows "Verify Your Email" prompt with resend button
**And:** Does NOT show profile content

---

## Category 3: Pledge Page / Certificate (3 tests)

### UAT-3.1: Certificate shows for pledgers only
**Given:** User navigates to `/p/:slug/pledge` where target `has_pledged: true`
**Then:** Certificate renders with pledge text, witnesses, QR code

**Given:** User navigates to `/p/:slug/pledge` where target `has_pledged: false`
**Then:** Shows 404 or "Profile Not Found"

### UAT-3.2: QR code links to certificate (not profile)
**Given:** Certificate page renders
**Then:** QR code URL is `/p/:slug/pledge` (certificate canonical URL)

### UAT-3.3: Name/avatar on certificate links to profile
**Given:** Certificate page renders
**Then:** Name and/or avatar links to `/p/:slug` (profile page)

---

## Category 4: Sign Pledge Form - New Users (3 tests)

### UAT-4.1: New user standard flow
**Given:** Anonymous user visits `/sign-pledge`
**When:** Fills name, email, reason, clicks "Sign the Pledge"
**Then:** Magic link is sent to email
**And:** Redirects to `/sign-pledge/confirm` confirmation page

### UAT-4.2: New user after magic link verification
**Given:** User clicks magic link from UAT-4.1
**Then:** AuthCallbackPage creates profile with `has_pledged: true`, `is_verified: true`
**And:** Redirects to `/p/:slug/pledge` (certificate)

### UAT-4.3: Email in sessionStorage for confirmation page
**Given:** User completes UAT-4.1 form submission
**Then:** `sessionStorage.getItem('pendingVerificationEmail')` returns submitted email

---

## Category 5: Sign Pledge Form - Upgrade Flow (4 tests)

### UAT-5.1: Verified non-pledger upgrade (no magic link)
**Given:** User with `has_pledged: false` AND `is_verified: true`
**When:** Visits `/sign-pledge?prefill=true`
**Then:** Name field is prefilled and read-only
**And:** Email field is hidden
**When:** Fills reason, clicks "Sign the Pledge"
**Then:** Profile updated directly (NO magic link sent)
**And:** Redirects to `/p/:slug/pledge` (certificate)

### UAT-5.2: Unverified user CANNOT use upgrade flow
**Given:** User with `is_verified: false` (e.g., /live user)
**When:** Visits `/sign-pledge?prefill=true`
**Then:** Form should NOT be in upgrade mode
**And:** Email field is visible
**When:** Submits form
**Then:** Magic link is sent (standard flow, not direct upgrade)

### UAT-5.3: Prefill detects authenticated user
**Given:** User is logged in with profile
**When:** Visits `/sign-pledge?prefill=true`
**Then:** Form prefills name from `currentUser.name`
**And:** Form prefills role from `currentUser.role` (if exists)
**And:** Form prefills LinkedIn from `currentUser.linkedinUrl` (if exists)

### UAT-5.4: Upgrade updates has_pledged flag
**Given:** User completes UAT-5.1 successfully
**When:** Profile is fetched from database
**Then:** `has_pledged` is `true`
**And:** `role`, `linkedin_url`, `reason` are updated with form values

---

## Category 6: Filters & Lists (1 test)

### UAT-6.1: Pledgers directory only shows pledgers
**Given:** User visits `/pledgers`
**Then:** Only profiles with `has_pledged: true` AND `is_verified: true` appear
**And:** Profiles with `has_pledged: false` do NOT appear

---

## Verification Commands

```bash
# Pre-checks (must pass before UAT)
npm run lint          # No errors
npm run build         # Compiles successfully
npm test -- --run     # All unit tests pass

# Visual verification (use Playwright MCP)
# Navigate to each route and verify UI matches acceptance criteria
```

---

## Test Execution Log

Use this section to track test results during Ralph Loop:

| Test | Status | Notes |
|------|--------|-------|
| UAT-1.1 | ⬜ | |
| UAT-1.2 | ⬜ | |
| UAT-1.3 | ⬜ | |
| UAT-1.4 | ⬜ | |
| UAT-1.5 | ⬜ | |
| UAT-2.1 | ⬜ | |
| UAT-2.2 | ⬜ | |
| UAT-2.3 | ⬜ | |
| UAT-2.4 | ⬜ | |
| UAT-3.1 | ⬜ | |
| UAT-3.2 | ⬜ | |
| UAT-3.3 | ⬜ | |
| UAT-4.1 | ⬜ | |
| UAT-4.2 | ⬜ | |
| UAT-4.3 | ⬜ | |
| UAT-5.1 | ⬜ | |
| UAT-5.2 | ⬜ | |
| UAT-5.3 | ⬜ | |
| UAT-5.4 | ⬜ | |
| UAT-6.1 | ⬜ | |

**Legend:** ⬜ Not tested | ✅ Pass | ❌ Fail

---

## Known Issues to Fix

From code review:
1. `sign-pledge-form.tsx:31` - Missing `&& currentUser.isVerified` check (UAT-5.2 will fail)
2. `about-page.tsx` - Unused `Link` import (lint error)

---

## Success Criteria

Ralph Loop completes when:
1. All 20 UAT tests show ✅
2. `./scripts/pre-commit-checks.sh` passes
3. No console errors during Playwright verification

Output `<promise>P50 UAT COMPLETE</promise>` when done.
