# P50: Non-Pledger Experience (Live Meeting Users)

**Status:** Ready for Implementation
**Priority:** High (blocks worktree-1 merge)
**Est. Effort:** Phase 1: 0.5 day | Phase 2: 0.5 day
**Created:** 2026-01-09
**Revised:** 2026-01-09 (clarified source detection, file paths, Mixpanel properties)
**Depends On:** None

---

## Implementation Phases

```yaml
# P50 Implementation Status
# ========================
# Use this to track what's done vs what's deferred
#
# PARALLEL EXECUTION: Track A and Track B can run simultaneously
# - Track A: Database/Auth changes (requires careful sequencing)
# - Track B: UX improvements (SUBAGENT /loop friendly)
#
# MERGE STRATEGY:
# - Phase 1 (Track A + B) → Merge to main (unblocks worktree-1)
# - Phase 2 → Separate PR after Phase 1 merged (can be fresh agent)

track_a_database_auth:
  description: "Database schema and auth flow changes"
  status: pending  # pending | in_progress | done
  subagent_friendly: false  # Requires manual review due to DB/auth sensitivity
  tasks:
    - id: db_column
      task: "Add has_pledged column to profiles table"
      status: pending
    - id: type_update
      task: "Update Profile type and mapProfileFromDb()"
      status: pending
    - id: auth_callback
      task: "Set has_pledged=false for /live registrations (use URL param detection)"
      status: pending
    - id: mixpanel_props
      task: "Set Mixpanel user properties: has_pledged, registration_source"
      status: pending
    - id: filter_pledgers
      task: "Filter /pledgers to show only has_pledged=true"
      status: pending
    - id: filter_landing
      task: "Filter landing page pledger cards similarly"
      status: pending
    - id: menu_hide
      task: "Hide 'View My Pledge' if !hasPledged (no replacement yet)"
      status: pending

track_b_ux_improvements:
  description: "Consent checkbox and field label UX improvements"
  status: pending  # pending | in_progress | done
  subagent_friendly: true   # ✅ Can be executed by subagent with /loop
  loop_verification:
    - "Navigate to localhost:5100/live"
    - "Verify field labels match spec"
    - "Verify checkbox exists and blocks CTA"
    - "Verify no red styling on consent"
    - "Navigate to localhost:5100/live/join/TEST (use any code)"
    - "Verify same patterns on join screen"
  files_to_modify:
    - "src/app/pages/clarity-live-page.tsx"           # Main live page with forms
    - "src/app/components/legal/consent-notice.tsx"   # Current passive consent component
  spec_reference: "See 'UX Spec (YAML)' section below"
  wireframe: "docs/bmad/diagrams/p41-terms-consent-wireframes.excalidraw"
  tasks:
    - id: ux_field_labels
      task: "Update field labels: 'What should we call you?' + 'Your email (for session link)'"
      status: pending
    - id: ux_consent_checkbox
      task: "Replace passive ConsentNotice with checkbox: 'I agree to recording, Terms & Privacy Policy'"
      status: pending
    - id: ux_consent_position
      task: "Move consent between last field and CTA (consistent on both screens)"
      status: pending
    - id: ux_remove_red_styling
      task: "Remove red border from consent area, use neutral gray"
      status: pending
    - id: ux_disable_cta
      task: "Disable CTA button until consent checkbox is checked"
      status: pending
    - id: ux_links_new_tab
      task: "Terms and Privacy links open in _blank"
      status: pending
    - id: ux_accessibility
      task: "Checkbox has proper label association (htmlFor/id or aria-label)"
      status: pending

phase_2_full_experience:
  description: "Polished non-pledger UX with Coming Soon modal (SEPARATE PR)"
  status: pending  # pending | in_progress | done
  depends_on: "Phase 1 merged to main"
  note: "Can be implemented by fresh agent after Phase 1 merge"
  tasks:
    - id: coming_soon_component
      task: "Build ComingSoonTeaser component"
      status: pending
    - id: menu_modal
      task: "Add 'Take the Pledge' menu item with Coming Soon modal"
      status: pending
    - id: mixpanel_tracking
      task: "Track feature_requested event with feature: 'pledge_for_live_users'"
      status: pending
```

---

## Problem Statement

Users who register through `/live` (Clarity Meeting flow) are currently recorded the same as users who explicitly took the pledge via `/sign-pledge`. This causes:

1. Non-pledgers appear in `/pledgers` directory (misleading)
2. Non-pledgers see "View My Pledge" in menu (confusing - they never pledged)
3. Non-pledgers get a profile page `/p/slug` with a pledge certificate (incorrect)

## Goal

Differentiate between users who explicitly took the pledge and users who only registered for meetings. Non-pledgers should have a clean, honest experience without pledge-related features until they choose to pledge.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Do `/live` users get a profile slug? | **No** - no slug until they pledge |
| What if non-pledger visits `/p/their-name`? | **404** - they don't have a profile page |
| What shows in menu for non-pledgers? | "Take the Pledge" -> inline Coming Soon modal |
| Can non-pledgers see `/pledgers`? | **Yes** - it's public, they just won't appear in it |
| Profile creation for `/live` users? | Create profile with `has_pledged: false`, `slug: null` |

---

## User Experience

### Menu States

| User State | Menu Items |
|------------|------------|
| **Not logged in** | Sign the Pledge, About, Pledgers, Log In |
| **Logged in + Pledger** | View My Pledge, Settings, About, Pledgers, Log Out |
| **Logged in + Non-Pledger** | Take the Pledge (Coming Soon), Settings, About, Pledgers, Log Out |

### Non-Pledger Menu Item Behavior

When non-pledger clicks "Take the Pledge":
- Opens inline modal with `ComingSoonTeaser` component
- Shows interest capture form (optional reason textarea)
- Tracks via Mixpanel: `feature_requested` with `feature: 'pledge_for_live_users'`
- Does NOT navigate to `/sign-pledge` (that flow assumes new user)

### Wireframe: Non-Pledger Menu Click

```
┌────────────────────────────────────────┐
│  Take the Clarity Pledge               │
│  Coming Soon                           │
│                                        │
│  We're working on letting meeting      │
│  participants join the pledge.         │
│                                        │
│  Interested? Tell us why (optional):   │
│  ┌──────────────────────────────────┐  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [Request Early Access]                │
│                                        │
│  Meanwhile, try another meeting →      │
└────────────────────────────────────────┘
```

---

## Technical Implementation

### 1. Database Changes

Add `has_pledged` column to profiles table:

```sql
ALTER TABLE profiles
ADD COLUMN has_pledged BOOLEAN NOT NULL DEFAULT true;

-- Existing users are pledgers (they signed up via /sign-pledge)
-- No migration needed for existing data - default handles it
```

### 2. Update Profile Type

In `src/app/types/index.ts`:

```typescript
interface Profile {
  // ... existing fields
  hasPledged: boolean;  // New field
}
```

Update `mapProfileFromDb()` in `src/app/data/api.ts` to map `has_pledged` -> `hasPledged`.

### 3. Auth Callback Changes

In `src/auth/AuthCallbackPage.tsx`, detect registration source:

- If user came from `/sign-pledge` flow: `has_pledged: true`, generate slug
- If user came from `/live` flow: `has_pledged: false`, `slug: null`

**Detection method:** Use URL params (NOT localStorage - survives cross-device/browser).

When sending magic link from `/sign-pledge`, include `?source=pledge` in redirect URL.
When sending magic link from `/live`, include `?source=live` in redirect URL.

```typescript
// In AuthCallbackPage.tsx
const source = new URLSearchParams(window.location.search).get('source');
const isLiveRegistration = source === 'live';

const upsertData = {
  // ... existing fields
  has_pledged: !isLiveRegistration,  // false for /live, true otherwise
  slug: isLiveRegistration ? null : slug,  // null for /live users
};

// Mixpanel user properties
analytics.setUserProperties({
  // ... existing properties
  has_pledged: !isLiveRegistration,
  registration_source: source || 'pledge',  // 'pledge' | 'live'
});
```

**Note:** The magic link redirect URL is configured when calling `supabase.auth.signInWithOtp()`. Each flow must pass the appropriate `?source=` param.

### 4. Navigation Changes

In `src/app/components/layout/simple-navigation.tsx`:

```typescript
// Add new state
const showNonPledgerMenu = sessionChecked && !isLoading && !!session && !!currentUser && !currentUser.hasPledged;
const showPledgerMenu = sessionChecked && !isLoading && !!session && !!currentUser && currentUser.hasPledged;

// Update menu items
{showPledgerMenu && (
  // Existing "View My Pledge" menu items
)}
{showNonPledgerMenu && (
  // New "Take the Pledge" -> Coming Soon modal
)}
```

### 5. Filter Pledgers Directory

In `src/app/pages/clarity-pledgers-page.tsx`, update query:

```typescript
// Only show users who have pledged
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('has_pledged', true)
  .eq('is_verified', true);
```

### 6. Filter Landing Page Pledger Cards

Same filter in any component showing "recent pledgers" on landing page.

### 7. ComingSoonTeaser Component

Create reusable component at `src/app/components/coming-soon-teaser.tsx`:

```typescript
interface ComingSoonTeaserProps {
  feature: string;           // For Mixpanel tracking
  title: string;
  description: string;
  secondaryCta?: {
    label: string;
    href: string;
  };
  onClose?: () => void;      // For modal usage
}
```

This component will be reused by:
- P50: Non-pledger "Take the Pledge" menu item
- P41: `/coaching` page (AI Coaching Teaser)

---

## MVP Scope

### In Scope
- [ ] Add `has_pledged` column to profiles table
- [ ] Update Profile type and mapper
- [ ] Modify auth callback to set `has_pledged: false` for `/live` registrations
- [ ] Update navigation to show different menu for non-pledgers
- [ ] Create `ComingSoonTeaser` component
- [ ] Filter `/pledgers` page to only show `has_pledged: true`
- [ ] Filter landing page pledger cards similarly
- [ ] Mixpanel event: `feature_requested` with `feature: 'pledge_for_live_users'`

### Out of Scope (Future)
- Full pledge flow for logged-in users (P51)
- Profile page for non-pledgers
- Email prompts to convert meeting users to pledgers
- Conversion funnel optimization

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Non-pledger visits `/p/anything` | Normal 404 (they have no slug) |
| Non-pledger visits `/pledgers` | Page loads, they're just not listed |
| Non-pledger clicks "Take the Pledge" | Modal with Coming Soon + interest capture (Phase 2) |
| User pledged via `/sign-pledge`, later uses `/live` | Already a pledger, no change needed |
| Non-pledger tries to access `/settings` | Settings page works - show all fields (KISS) |
| Non-pledger visits `/sign-pledge` | **P51 scope** - need upgrade flow (not this story) |
| Magic link opened in different browser | Works - source is in URL params, not localStorage |
| User clicks magic link twice | Second click is idempotent (upsert) |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Interest rate | 30%+ of non-pledgers click "Take the Pledge" | Mixpanel |
| Reason provided | 50%+ include reason | Events with non-null reason |

---

## Testing Checklist

- [ ] New `/live` user registers -> `has_pledged: false` in DB
- [ ] New `/sign-pledge` user registers -> `has_pledged: true` in DB
- [ ] Non-pledger sees "Take the Pledge" in menu (not "View My Pledge")
- [ ] Non-pledger does NOT appear in `/pledgers`
- [ ] Non-pledger does NOT appear in landing page pledger cards
- [ ] Existing users unaffected (all have `has_pledged: true` by default)
- [ ] Coming Soon modal tracks Mixpanel event correctly

---

## Related Documents

- [P41: AI Coaching Teaser](./p41_coaching_teaser.md) - Email + page flow, shares `ComingSoonTeaser` component
- [P51: Pledge Upgrade Flow](./p51_pledge_upgrade.md) - Non-pledger → Pledger conversion (future)
- [P37.2a: Recording Consent](./p37_2a_consent_mechanism.md) - Guest registration flow
- [Terms Consent Wireframes](../docs/bmad/diagrams/p41-terms-consent-wireframes.excalidraw) - Visual spec for consent UX

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **URL params for source detection** | Survives cross-device/browser magic link clicks. localStorage is fragile. |
| **`slug: null` for non-pledgers** | PostgreSQL allows multiple NULLs in UNIQUE columns. Clean separation. |
| **Settings shows all fields** | KISS - no conditional UI. Fields pre-filled for when user converts. |
| **Phase 2 as separate PR** | Phase 1 unblocks merge. Phase 2 can be fresh agent with full context. |
| **Mixpanel user properties** | `has_pledged` + `registration_source` enable cohort analysis and conversion tracking. |

---

## UX Improvements (Part of This Story)

The Create Session and Join Session screens need UX polish alongside the non-pledger logic. These changes should be implemented together since they touch the same files.

### Wireframe Reference

See: [p41-terms-consent-wireframes.excalidraw](../docs/bmad/diagrams/p41-terms-consent-wireframes.excalidraw)

### What Changed

| Element | Before | After |
|---------|--------|-------|
| Name field label | "Your Name" | "What should we call you?" |
| Email field label | "Your Email" | "Your email (for session link)" |
| Consent mechanism | Passive red-boxed statement | Active checkbox consent |
| Consent copy | Variable wording | "I agree to recording, Terms & Privacy Policy" |
| Consent position | Inconsistent between screens | Always between last field and CTA |
| Consent styling | Red border (alarming) | Neutral gray border |

### UX Spec (YAML)

```yaml
# P50 UX Specification
# ====================
# Use this for implementation reference

screens:
  create_session:
    name: "Create Session"
    context: "Non-logged-in user starting a new meeting"
    url: "/live"

    header:
      title: "Clarity Meeting"
      subtitle: "Verify understanding in real-time"

    fields:
      - id: name
        label: "What should we call you?"
        type: text
        required: true
        placeholder: ""

      - id: email
        label: "Your email (for session link)"
        type: email
        required: true
        placeholder: ""

    consent:
      type: checkbox
      required: true
      position: "between_last_field_and_cta"
      copy: "I agree to recording, Terms & Privacy Policy"
      links:
        - text: "Terms"
          href: "/terms"
          color: "#3b82f6"  # blue-500
        - text: "Privacy Policy"
          href: "/privacy"
          color: "#3b82f6"  # blue-500
      styling:
        checkbox_border: "#e0e0e0"
        text_color: "#1e1e1e"
        font_size: "13px"

    primary_cta:
      label: "New Meeting"
      style: "primary"  # bg-blue-500, text-white
      disabled_until: "consent_checked"

    secondary_action:
      type: "input_with_button"
      input_placeholder: "Enter a code or link"
      button_label: "Join"

    footer:
      text: "Already have an account?"
      link_text: "Log in"
      link_href: "/login"

  join_session:
    name: "Join Session"
    context: "Non-logged-in user joining via invite link"
    url: "/live/join/:code"

    header:
      logo: true
      brand_name: "Clarity Pledge"
      context_text: "Join {host_name}'s Meeting"  # Dynamic

    fields:
      - id: name
        label: "What should we call you?"
        type: text
        required: true
        placeholder: ""

      - id: email
        label: "Your email (for session link)"
        type: email
        required: true
        placeholder: ""

    consent:
      # Same as create_session
      type: checkbox
      required: true
      position: "between_last_field_and_cta"
      copy: "I agree to recording, Terms & Privacy Policy"
      links:
        - text: "Terms"
          href: "/terms"
          color: "#3b82f6"
        - text: "Privacy Policy"
          href: "/privacy"
          color: "#3b82f6"
      styling:
        checkbox_border: "#e0e0e0"
        text_color: "#1e1e1e"
        font_size: "13px"

    primary_cta:
      label: "Join Meeting"
      style: "primary"
      disabled_until: "consent_checked"

    back_action:
      label: "Back"
      style: "text_link"
      color: "#757575"

# Design Tokens (from CLAUDE.md design system)
design_tokens:
  colors:
    primary_button_bg: "#3b82f6"      # blue-500
    primary_button_text: "#ffffff"
    input_border: "#e0e0e0"
    input_bg: "#ffffff"
    text_primary: "#1e1e1e"
    text_secondary: "#757575"
    link_color: "#3b82f6"

  spacing:
    field_gap: "20px"
    checkbox_to_cta: "20px"

  border_radius:
    input: "6px"
    button: "6px"
    checkbox: "3px"
```

### Implementation Notes

1. **Checkbox must block CTA** - "New Meeting" and "Join Meeting" buttons should be disabled until checkbox is checked
2. **Links open in new tab** - Terms and Privacy Policy should open in `_blank` to not interrupt flow
3. **Consistent across screens** - Both Create and Join must use identical field labels and consent pattern
4. **No red styling** - Remove any alarming red borders/colors from consent area

---

## Notes for Worktree 1

### Parallel Execution Strategy

P50 can be split into two parallel tracks that run simultaneously:

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKTREE 1 MERGE BLOCKERS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Track A (Manual)              Track B (Subagent /loop)         │
│  ─────────────────             ────────────────────────         │
│  • DB: has_pledged column      • Field label updates            │
│  • Types: Profile mapper       • Consent checkbox               │
│  • Auth callback changes       • Consent positioning            │
│  • Filter pledgers/landing     • Remove red styling             │
│  • Menu hide logic             • Disable CTA until checked      │
│                                                                 │
│  WHY MANUAL:                   WHY SUBAGENT:                    │
│  - DB schema sensitive         - Pure UI changes                │
│  - Auth flow critical          - Clear visual spec              │
│  - Needs human review          - Playwright can verify          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                         MERGE TO MAIN
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 2 (After Merge)                        │
│  • ComingSoonTeaser component                                   │
│  • Menu modal for non-pledgers                                  │
│  • Mixpanel tracking                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Track A: Database/Auth (Manual Review Required)

Complete these with careful review:

1. **Database** - Add `has_pledged` column (default `true`)
2. **Types** - Update Profile type and mapper
3. **Auth callback** - Set `has_pledged: false` for `/live` registrations
4. **Filters** - Update `/pledgers` and landing page queries
5. **Menu** - Simply HIDE "View My Pledge" if `!hasPledged` (don't add replacement yet)

### Track B: UX Improvements (Subagent /loop Friendly)

**This track can be delegated to a subagent using `/loop`.**

```bash
# Example cloud agent command:
/c claude -w 1 Implement Track B UX improvements from P50. \
  Use /loop to verify. Spec in features/p50_non_pledger_experience.md \
  Wireframe in docs/bmad/diagrams/p41-terms-consent-wireframes.excalidraw
```

**Subagent /loop verification steps:**
1. Navigate to `localhost:5100/live`
2. Verify field labels: "What should we call you?" and "Your email (for session link)"
3. Verify checkbox exists with text: "I agree to recording, Terms & Privacy Policy"
4. Verify "New Meeting" button is disabled until checkbox checked
5. Verify no red borders on consent area
6. Navigate to `localhost:5100/live/join/test`
7. Verify same patterns on join screen

**Files to modify:** Look for `/live` page components (create session form, join session form)

### Phase 2: Full Experience (After Merge)

Polish the non-pledger UX:

1. **ComingSoonTeaser component** - Build reusable component
2. **Menu modal** - Add "Take the Pledge" item that opens Coming Soon modal
3. **Mixpanel tracking** - Track interest via `feature_requested` event

**Phase 2 Result:** Non-pledgers see "Take the Pledge" in menu, can express interest, we capture demand data.
