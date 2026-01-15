# P50: Profile & Pledge Separation

**Status:** Ready for Implementation
**Priority:** High (Required before P61 Events MVP)
**Est. Effort:** 1-2 days
**Created:** 2026-01-09
**Revised:** 2026-01-15 (Complete rewrite - profile/pledge separation, two pledge flows)
**Depends On:** None

---

## Problem Statement

The app currently conflates **profiles** and **pledge certificates**. This causes confusion:

1. `/p/:slug` shows the pledge certificate (not a profile page)
2. Users who join via `/live` have no public identity (no slug, no profile)
3. Event RSVPs (P61) need profile pages to exist for attendee lists
4. Story Sifter (P58) needs profile pages to display Stories/Points

**Root cause:** We designed for "pledge-only" users. Now we need profiles for everyone.

---

## Goal

**Separate profile pages from pledge certificates.** Every user with a confirmed email gets a public profile at `/p/:slug`. Pledgers also get a certificate at `/p/:slug/pledge`.

---

## Key Decisions

| Question | Decision |
|----------|----------|
| **Route structure** | `/p/:slug` → Profile (all users)<br>`/p/:slug/pledge` → Certificate (pledgers only) |
| **Who gets slug?** | All users with confirmed emails (pledge, event, /live after P61) |
| **Who gets profile?** | All users with confirmed emails |
| **Who gets certificate?** | Only users with `has_pledged: true` |
| **/live users in P50** | Keep instant access (no magic link yet - P61 adds it) |
| **Existing pledgers** | Hard cutover: `/p/:slug` now shows profile, not certificate |
| **QR code on certificate** | Links to `/p/:slug/pledge` (certificate, not profile) |
| **Name/avatar on certificate** | Links to `/p/:slug` (profile) |

---

## User Flows

### Flow 1: New User Takes Pledge (Magic Link)

```
1. User visits /sign-pledge
2. Enters name + email + details
3. Clicks "Sign the Pledge" → Magic link sent
4. Clicks magic link → AuthCallbackPage
   - Creates profile: has_pledged=true, slug generated
   - Redirects to /p/:slug/pledge (certificate)
```

### Flow 2: Existing User Upgrades to Pledger (No Magic Link)

```
1. Non-pledger clicks "Take the Pledge" (menu or profile CTA)
2. Redirects to /sign-pledge?prefill=true
3. Form prefilled:
   - Name: Read-only (from profile)
   - Email: Hidden (already have it)
   - Role, LinkedIn, reason: Editable
4. Clicks "Sign the Pledge" → NO magic link (already authenticated)
5. Updates profile: has_pledged=true
6. Redirects to /p/:slug/pledge (certificate)
```

### Flow 3: /live User (Instant Access - P50 only)

```
1. User enters name + email on /live
2. Instant meeting access (no magic link)
3. Profile NOT created
4. After meeting ends: No follow-up (KISS for P50)

Note: P61 will add magic link verification for /live users
```

### Flow 4: Event RSVP (P61 - Future)

```
1. User clicks RSVP on event
2. Magic link sent with ?source=event
3. Clicks link → AuthCallbackPage
   - Creates profile: has_pledged=false, slug generated
   - Redirects back to event, auto-RSVP
```

---

## Routes

### Profile Page: `/p/:slug`

**Access:** Public
**Who has it:** All users with confirmed emails
**Shows:**
- Name, role, avatar (placeholder for MVP)
- Blue circle around avatar if `has_pledged: true`
- **If viewing own profile:**
  - `has_pledged: true` → "View My Pledge" button (links to `/p/:slug/pledge`)
  - `has_pledged: false` → "Take the Pledge" CTA button (links to `/sign-pledge?prefill=true`)
- **If viewing other's profile:**
  - `has_pledged: true` → "View their pledge" link (links to `/p/:slug/pledge`)
  - `has_pledged: false` → No pledge link
- Future: Events attended, Stories/Points (P58)

### Pledge Page: `/p/:slug/pledge`

**Access:** Public
**Who has it:** Only users with `has_pledged: true`
**Shows:**
- Pledge certificate (full-page design)
- Pledge text, signed date, version
- Witnesses list
- QR code (links to `/p/:slug/pledge` - canonical certificate URL)
- Name/avatar (links to `/p/:slug` - profile)

**Edge case:** If user has `has_pledged: false`, show 404.

---

## Navigation Changes

### Menu Items (Authenticated Users)

| User State | Menu Items |
|------------|------------|
| **Not logged in** | Sign the Pledge, About, Pledgers, Log In |
| **Pledger** | View My Profile, View My Pledge, Settings, About, Pledgers, Log Out |
| **Non-Pledger** | View My Profile, Take the Pledge, Settings, About, Pledgers, Log Out |

**Implementation:**
- "View My Profile" → Links to `/p/:slug`
- "View My Pledge" → Links to `/p/:slug/pledge`
- "Take the Pledge" → Links to `/sign-pledge?prefill=true`

---

## Database

### Existing Schema (No Changes Needed)

```sql
-- profiles table already has:
has_pledged BOOLEAN NOT NULL DEFAULT true  -- ✅ Already exists
slug TEXT UNIQUE                            -- ✅ Already exists
```

**Note:** `has_pledged` column already exists in DB (schema.sql line 16). No migration needed.

---

## Auth Callback Logic

### In `src/auth/AuthCallbackPage.tsx`

```typescript
const source = new URLSearchParams(window.location.search).get('source');

// Determine if user is pledging
const isPledging = source === 'pledge' || !source; // Default to pledge for legacy flows

// Profile data
const profileData = {
  // ... existing fields
  has_pledged: isPledging,
  slug: slug, // Always generate slug for confirmed emails
};

// Mixpanel user properties
analytics.setUserProperties({
  has_pledged: isPledging,
  registration_source: source || 'pledge', // 'pledge' | 'live' | 'event'
});

// Redirect
if (isPledging) {
  navigate(`/p/${slug}/pledge`); // Show certificate
} else {
  navigate(`/events/${eventSlug}`); // Event RSVP (P61)
}
```

**Source detection:**
- `?source=pledge` → New pledge signup OR upgrade
- `?source=event` → Event RSVP (P61)
- `?source=live` → /live signup (P61 - future)
- No source → Default to pledge (legacy)

---

## Sign Pledge Form Changes

### Current: `/sign-pledge`

All users (new + existing) use this form.

**Form behavior:**

```typescript
// Detect if user is logged in
const { user } = useAuth();
const isPrefilled = searchParams.get('prefill') === 'true';

if (user && isPrefilled) {
  // Existing user upgrading to pledger
  // Form prefills:
  formData = {
    name: user.name,        // Read-only (grayed out, not editable)
    email: user.email,      // Hidden (don't show at all)
    role: user.role || '',  // Editable
    linkedin_url: user.linkedinUrl || '', // Editable
    reason: '',             // Empty (new for pledge)
  };

  // On submit: NO magic link
  // Update profile directly: has_pledged = true
  // Redirect to /p/:slug/pledge

} else {
  // New user signing pledge
  // Empty form, all fields editable
  // On submit: Send magic link with ?source=pledge
}
```

**UI Changes:**

1. **Name field:**
   - If prefilled: Grayed out, not editable, add hint text "(from your profile)"
   - If new user: Editable

2. **Email field:**
   - If prefilled: Don't show at all (we already have it)
   - If new user: Editable

3. **Submit button:**
   - If prefilled: "Sign the Pledge" (instant, no magic link)
   - If new user: "Send Magic Link"

---

## Profile Page Component

### `src/app/pages/ProfilePage.tsx` (NEW)

```typescript
export function ProfilePage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getProfileBySlug(slug).then(setProfile);
  }, [slug]);

  if (!profile) return <div>Profile not found</div>;

  const isOwnProfile = user?.id === profile.id;
  const hasPledged = profile.hasPledged;

  return (
    <div>
      {/* Avatar with blue circle if pledged */}
      <Avatar hasPledge={hasPledged}>
        {profile.name[0]}
      </Avatar>

      <h1>{profile.name}</h1>
      {profile.role && <p>{profile.role}</p>}

      {/* Pledge CTA / Link */}
      {isOwnProfile && (
        hasPledged ? (
          <Button href={`/p/${slug}/pledge`}>View My Pledge</Button>
        ) : (
          <Button href="/sign-pledge?prefill=true" variant="primary">
            Take the Pledge
          </Button>
        )
      )}

      {!isOwnProfile && hasPledged && (
        <a href={`/p/${slug}/pledge`}>View their pledge →</a>
      )}

      {/* Future: Events attended, Stories/Points */}
    </div>
  );
}
```

---

## Pledge Page Component

### `src/app/pages/PledgePage.tsx` (Rename existing ProfilePage)

```typescript
export function PledgePage() {
  const { slug } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getProfileBySlug(slug).then(setProfile);
  }, [slug]);

  // 404 if user hasn't pledged
  if (profile && !profile.hasPledged) {
    return <Navigate to="/404" />;
  }

  return (
    <div>
      {/* Existing certificate design */}
      {/* QR code links to /p/:slug/pledge */}
      {/* Name/avatar links to /p/:slug */}
    </div>
  );
}
```

---

## Migration Notes

### Breaking Change

**Before P50:**
- `/p/:slug` → Pledge certificate

**After P50:**
- `/p/:slug` → Profile page
- `/p/:slug/pledge` → Pledge certificate

**Impact on existing users:**
- All existing users have `has_pledged: true` (DB default)
- Their `/p/:slug` route will now show profile, not certificate
- QR codes on printed certificates still work (they link to `/p/:slug/pledge`)

**Mitigation:**
- Update all internal links to use `/p/:slug/pledge` for certificates
- Add redirect from `/p/:slug?view=pledge` to `/p/:slug/pledge` (optional)

---

## Filter Changes

### Pledgers Directory: `/pledgers`

```typescript
// Only show users who have pledged
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('has_pledged', true)
  .eq('is_verified', true)
  .order('created_at', { ascending: false });
```

### Landing Page Pledger Cards

Same filter as above.

---

## Testing Checklist

- [ ] New pledge signup → Magic link → Profile created with `has_pledged: true`
- [ ] Non-pledger clicks "Take the Pledge" → Form prefilled → No magic link → `has_pledged: true`
- [ ] Non-pledger profile shows "Take the Pledge" CTA
- [ ] Pledger profile shows "View My Pledge" button
- [ ] `/p/:slug/pledge` shows 404 for non-pledgers
- [ ] QR code on certificate links to `/p/:slug/pledge`
- [ ] Name/avatar on certificate links to `/p/:slug`
- [ ] Menu shows "View My Profile" + "View My Pledge" for pledgers
- [ ] Menu shows "View My Profile" + "Take the Pledge" for non-pledgers
- [ ] `/pledgers` only shows `has_pledged: true` users
- [ ] Landing page pledger cards only show `has_pledged: true` users

---

## Implementation Order

```
1. Create ProfilePage component (new route)
2. Rename existing ProfilePage → PledgePage
3. Update routes in App.tsx:
   - /p/:slug → ProfilePage
   - /p/:slug/pledge → PledgePage
4. Update Navigation menu items
5. Update /sign-pledge form (prefill logic)
6. Update certificate QR code URL
7. Update certificate name/avatar link
8. Update filters (/pledgers, landing page)
9. Test all flows
10. Deploy
```

---

## Related Documents

- [P61: Events MVP](./p61_events_mvp.md) - Requires profiles for attendee lists
- [P58: Story Sifter MVP](./p58_sifter_mvp.md) - Displays Stories/Points on profile pages

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Pledge upgrade rate | 30%+ of non-pledgers take pledge | Mixpanel funnel |
| Profile views | 2x certificate views | Mixpanel page views |

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Separate routes** | Cleaner UX, easier to share ("here's my profile" vs "here's my pledge") |
| **Slug for all confirmed emails** | Event attendee lists need profile links (P61) |
| **Hard cutover (no redirect)** | Simpler implementation, fewer edge cases |
| **Prefilled form for upgrades** | Reduces friction, no duplicate data entry |
| **No magic link for upgrades** | User is already authenticated, why verify email twice? |
| **/live keeps instant access** | P50 doesn't change /live flow (P61 will add verification) |
