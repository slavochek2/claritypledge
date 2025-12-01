# Phase 1: Move Future Features (REVISED)

**Goal:** Move Phase 2 features to `_future/` folder without breaking signup/login/profile/champions.

**Time:** 45 minutes

**What's Working in Phase 1:**
✅ Signup & Login (magic link auth)
✅ Public profiles with witness functionality
✅ Clarity Champions directory
✅ Basic navigation

**What's Moving to Future:**
🔮 Dashboard page
🔮 Settings page
🔮 Email verification flow
🔮 Endorsement invitation system
🔮 Old navigation components
🔮 Marketing page (old services page will be renamed)

---

## Steps

### 1. Create _future/ folder structure (2 min)

```bash
mkdir -p _future/pages
mkdir -p _future/components
mkdir -p _future/components/navigation
mkdir -p _future/tests
```

---

### 2. Move Phase 2 Pages (5 min)

```bash
# Dashboard & Settings (not needed in Phase 1)
mv src/polymet/pages/dashboard-page.tsx _future/pages/

# Settings
mv src/polymet/pages/settings-page.tsx _future/pages/

# Email verification flow (not using in Phase 1)
mv src/polymet/pages/verify-email-page.tsx _future/pages/
mv src/polymet/pages/verify-endorsement-page.tsx _future/pages/

# Pledge card standalone page (redundant with profile page)
mv src/polymet/pages/pledge-card-page.tsx _future/pages/

# Debug pages
rm src/polymet/pages/debug-page.tsx
rm src/polymet/pages/test-db-page.tsx
rm src/polymet/pages/profile-diagnostic-page.tsx
```

**DO NOT MOVE:**
- ✅ `profile-page.tsx` - KEEP (needs witnesses)
- ✅ `clarity-champions-page.tsx` - KEEP (public feature)
- ✅ `auth-callback-page.tsx` - KEEP (critical auth)
- ✅ `sign-pledge-page.tsx` - KEEP (signup)
- ✅ `login-page.tsx` - KEEP (login)
- ✅ `clarity-pledge-landing.tsx` - KEEP (landing)
- ✅ `full-article-page.tsx` - KEEP (manifesto)

---

### 3. Rename & Clean Services Page (3 min)

```bash
# Rename work-with-slava to services
mv src/polymet/pages/work-with-slava-page.tsx src/polymet/pages/services-page.tsx
```

Then update the file content:
- Change `export function WorkWithSlavaPage()` → `export function ServicesPage()`
- Update the `@file` comment to `services-page.tsx`

---

### 4. Move Phase 2 Components (5 min)

**Move these - NOT used by profile page:**

```bash
# Endorsement invitation system
mv src/polymet/components/invite-endorsers.tsx _future/components/

# Owner-specific views (profile page uses ProfileVisitorView for everyone)
mv src/polymet/components/profile-owner-view.tsx _future/components/

# Reciprocation tracking (not in Phase 1)
mv src/polymet/components/reciprocation-card.tsx _future/components/
```

**DO NOT MOVE - Profile page needs these:**
- ✅ `profile-visitor-view.tsx` - Used by profile-page.tsx
- ✅ `witness-card.tsx` - Used by witness-list
- ✅ `witness-list.tsx` - Used by profile-visitor-view
- ✅ `owner-preview-banner.tsx` - Used by profile-page.tsx
- ✅ `unverified-profile-banner.tsx` - Used by profile-page.tsx

---

### 5. Move Old Navigation Components (3 min)

```bash
# Move unused navigation files
mv src/polymet/components/clarity-navigation.tsx _future/components/navigation/
mv src/polymet/components/navigation/user-menu.tsx _future/components/navigation/
mv src/polymet/components/navigation/navigation-links.tsx _future/components/navigation/

# Note: simple-navigation.tsx stays (it's the active one)
```

---

### 6. Move Test Files (2 min)

```bash
# Tests for features we're moving
mv src/polymet/pages/clarity-champions-page.test.tsx _future/tests/
mv src/polymet/components/navigation.test.tsx _future/tests/
```

**DO NOT MOVE:**
- ✅ `profile-page.test.tsx` - KEEP (testing active feature)
- ✅ `clarity-pledge-landing.test.tsx` - KEEP (testing landing)

---

### 7. Update App.tsx Routes (7 min)

**File:** `src/App.tsx`

**Remove these imports:**
```typescript
// DELETE these lines:
import { DashboardPage } from "@/polymet/pages/dashboard-page";
import { SettingsPage } from "@/polymet/pages/settings-page";
import { VerifyEmailPage } from "@/polymet/pages/verify-email-page";
import { VerifyEndorsementPage } from "@/polymet/pages/verify-endorsement-page";
import { PledgeCardPage } from "@/polymet/pages/pledge-card-page";
import { WorkWithSlavaPage } from "@/polymet/pages/work-with-slava-page";
import { DebugPage } from "@/polymet/pages/debug-page";
import { TestDbPage } from "@/polymet/pages/test-db-page";
import { ProfileDiagnosticPage } from "@/polymet/pages/profile-diagnostic-page";
```

**Add this import:**
```typescript
import { ServicesPage } from "@/polymet/pages/services-page";
```

**Delete these routes:**
- `/pledge` → PledgeCardPage
- `/dashboard` → DashboardPage
- `/settings` → SettingsPage
- `/verify/:id` → VerifyEmailPage
- `/verify-endorsement/:profileId/:witnessId` → VerifyEndorsementPage
- `/debug` → DebugPage
- `/test-db` → TestDbPage
- `/diagnostic` → ProfileDiagnosticPage

**Update this route:**
```typescript
// CHANGE:
<Route path="/our-services" element={<ClarityLandingLayout><WorkWithSlavaPage /></ClarityLandingLayout>} />

// TO:
<Route path="/our-services" element={<ClarityLandingLayout><ServicesPage /></ClarityLandingLayout>} />
```

**Keep these routes:**
- ✅ `/` → Landing
- ✅ `/login` → LoginPage
- ✅ `/sign-pledge` → SignPledgePage
- ✅ `/auth/callback` → AuthCallbackPage
- ✅ `/p/:id` → ProfilePage
- ✅ `/clarity-champions` → ClarityChampionsPage
- ✅ `/manifesto` → FullArticlePage
- ✅ `/article` → FullArticlePage
- ✅ `/our-services` → ServicesPage

---

### 8. Update SimpleNavigation (5 min)

**File:** `src/polymet/components/simple-navigation.tsx`

**Remove from dropdown menu (user menu section):**
- Delete "Dashboard" link + icon (lines ~100-102, ~176-181)
- Delete "Settings" link + icon (lines ~119-125, ~194-199)

**Keep in dropdown:**
- ✅ "View My Pledge"
- ✅ "Log Out"

**Update Services link text:**
Change "Our Services" → "Services" (around line 71 and 222)

**Keep in main nav:**
- ✅ "Clarity Champions" link
- ✅ "Services" link
- ✅ Logo

---

### 9. Simplify Clarity Champions Page (3 min)

**File:** `src/polymet/pages/clarity-champions-page.tsx`

Review the page - if there are any admin/edit features, remove them.
Keep only: public directory view of verified profiles.

---

### 10. Clean Up API Functions (8 min)

**File:** `src/polymet/data/api.ts`

**DELETE these functions entirely:**
- `updateProfile()` - Used by settings page (moved)
- `verifyEndorsement()` - Used by verify-endorsement page (moved)
- `sendEndorsementInvitation()` - Used by invite-endorsers (moved)
- `ensureUniqueSlug()` - Not used anywhere

**KEEP these functions (Phase 1 needs them):**
1. ✅ `getProfile(id)` - Get profile by UUID
2. ✅ `getProfileBySlug(slug)` - Get profile by slug (used by routes)
3. ✅ `createProfile(...)` - Signup (sends magic link)
4. ✅ `signInWithEmail(email)` - Login (sends magic link)
5. ✅ `getCurrentUser()` - Get current user
6. ✅ `signOut()` - Sign out
7. ✅ `getVerifiedProfiles()` - **KEEP** (used by Clarity Champions)
8. ✅ `addWitness()` - **KEEP** (used by profile page)
9. ✅ `mapProfileFromDb()` - Helper
10. ✅ `generateSlug(name)` - Helper
11. ✅ `getRandomColor()` - Helper

**Note:** We're keeping MORE than originally planned because witnesses & champions are staying.

---

### 11. Test Everything (10 min)

```bash
# Start dev server
npm run dev

# Test checklist:
# [ ] Can view landing page (/)
# [ ] Can click "Sign Pledge" and submit form
# [ ] Magic link auth works (/auth/callback)
# [ ] Can view public profile (/p/slug)
# [ ] Witness functionality works on profiles
# [ ] Can view Clarity Champions page
# [ ] Navigation shows: Logo, Clarity Champions, Services
# [ ] User dropdown shows: View My Pledge, Log Out (NO Dashboard/Settings)
# [ ] Services page loads (/our-services)
# [ ] Manifesto page loads (/manifesto)
# [ ] Login page works (/login)
```



## Summary

**Before Phase 1:**
- 18 page files, 30+ components, cluttered navigation, 3 nav files

**After Phase 1:**
- 8 core pages, focused components, clean navigation, 1 nav file
- Working: Auth, Profiles, Witnesses, Champions
- Future: Dashboard, Settings, Endorsement invites

**Result:** Cleaner codebase, same user-facing features, ready for Phase 2 isolation.
