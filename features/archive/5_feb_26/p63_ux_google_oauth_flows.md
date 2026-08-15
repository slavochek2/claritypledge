---
status: all-done
type: comment
tags: []
rank: 125408.0
created_date: 2026-01-15
completed_at: '2026-02-09'
---

# P63_UX: Google OAuth UX Flows (Prerequisite)

**Status:** ✅ Complete
**Priority:** High (prerequisite for P63)
**Complexity:** Medium
**Owner:** UX Designer agent (Sally)
**Completed:** 2026-01-15

## Purpose

Design the user experience for Google OAuth across all authentication entry points in the Clarity Pledge app. This spec must be completed BEFORE P63 implementation begins.

## Entry Points Requiring UX Design

### 1. Sign Pledge Flow (`/sign-pledge`)

**Current experience:**
- User fills out form: Name, Role, LinkedIn, Reason (optional)
- Submits email
- Waits for magic link
- Clicks magic link
- Redirected to profile

**Questions for UX:**
- Should Google OAuth appear here? If yes, where in the form?
- If user clicks "Continue with Google":
  - Do we pre-fill Name from Google profile?
  - Do we still ask for Role, LinkedIn, Reason?
  - Or do we skip form entirely and create profile with just Google data?
- Does this harm conversion (too many choices) or help (faster signup)?

**Trade-offs:**
- **Pro Google here:** Faster signup, less friction
- **Con Google here:** Pledges might be less thoughtful (no reason provided)

### 2. Live Meeting First-Time Signup

**Current experience:**
- User clicks "Join Live" without account
- Redirected to auth flow
- Must enter email + wait for magic link
- Creates significant friction during live session

**Questions for UX:**
- Google OAuth would dramatically reduce friction here (critical!)
- But: Do we have enough context to create a proper pledge profile?
- Should live meeting signup create a "partial" profile (no pledge yet)?
- Or should first-time live users complete pledge separately later?

**Trade-offs:**
- **Pro Google here:** HUGE win for live UX, reduces bounce rate
- **Con Google here:** User might not understand they're "signing the pledge"

### 3. Login Page (Returning Users)

**Current experience:**
- User enters email
- Waits for magic link
- Clicks link
- Logs in

**Questions for UX:**
- Should show both "Continue with Google" + "Continue with Email"
- Straightforward case, but needs design

**Trade-offs:**
- No cons here - clear win for UX

### 4. Account Linking (Existing Users)

**Scenario:** User signed up with email, later tries to login with Google (same email)

**Questions for UX:**
- Supabase automatically links accounts
- Should we:
  - Silently update their avatar to Google photo?
  - Ask permission first?
  - Show a "Connected with Google" confirmation?
- What if they prefer their generated avatar?

## Key Design Decisions Needed

### Decision 1: Where to Show Google OAuth?

Options:
- **A. Everywhere** - Sign pledge, live signup, login (consistent but potentially overwhelming)
- **B. Login only** - Keep pledge signup "thoughtful" (email), fast login with Google
- **C. Login + Live** - Optimize for returning users and live friction, keep pledge signup focused
- **D. Everywhere except pledge** - Fast auth everywhere, but pledge signup remains email-only

**Recommendation needed from UX**

### Decision 2: Form Handling with Google OAuth

For Sign Pledge flow, if we show Google OAuth:

Options:
- **A. Skip form entirely** - Google → instant profile (name from Google, no role/reason)
- **B. Pre-fill + collect missing** - Google → pre-fill name → ask for Role/LinkedIn/Reason
- **C. Full form after Google** - Google → still show entire form (defeats purpose?)

**Recommendation needed from UX**

### Decision 3: Live Meeting Profile Creation

Options:
- **A. Partial profile** - Google → minimal profile → complete pledge later
- **B. Full pledge required** - Google → must fill out pledge form before joining live
- **C. Post-meeting pledge** - Join live first → prompted to complete pledge after meeting

**Recommendation needed from UX**

### Decision 4: Visual Placement

For each entry point where Google OAuth appears:
- Button placement (above form, below form, side-by-side)
- Visual hierarchy (primary vs secondary)
- Divider text ("or continue with email")
- Button styling (follow landing page design system)

**Wireframes needed from UX**

## Success Criteria for This Spec

This P63_UX spec is complete when it provides:

1. **Clear decision** on where Google OAuth should appear (Decision 1)
2. **Form handling logic** for each entry point (Decision 2, 3)
3. **Wireframes** showing visual design for each flow (Decision 4)
4. **Copy/messaging** for buttons, dividers, confirmation messages
5. **Edge case handling:**
   - Account linking messaging
   - Google auth failure fallback
   - "Why we need this" explanations (if any)

## Deliverables

**Required outputs:**
1. **Flow diagrams** (Excalidraw) for each entry point
2. **Wireframes** (Excalidraw) showing button placement and form interactions
3. **Copy doc** with all button labels, divider text, error messages
4. **Decision log** documenting choices made and reasoning

**Format:** Can be single comprehensive document or multiple files in `features/p63_ux/`

## Dependencies

**Blocks:**
- P63 implementation (cannot proceed without UX decisions)

**Requires:**
- Understanding of current auth flow (see `docs/technical/authentication.md`)
- Understanding of live meeting flow (see P60 features)
- Design system (see `docs/bmad/ux-design-specification.md`)

## Questions for UX Designer Agent

When activated, the UX designer should:

1. **Explore** current auth flows:
   - Read `src/auth/AuthCallbackPage.tsx`
   - Read sign pledge form component
   - Read live meeting auth flow
   - Check existing login UI

2. **Research** best practices:
   - Google OAuth UX patterns
   - Multi-step form interruption (when to show OAuth)
   - Social login conversion impact

3. **Design** the flows:
   - Create decision matrix
   - Design wireframes
   - Write copy
   - Document reasoning

4. **Validate** against principles:
   - Does this align with "Clarity Pledge" brand (thoughtful, intentional)?
   - Does this reduce friction without sacrificing quality?
   - Is this consistent across entry points?

## Timeline

**Target:** Complete before P63 implementation begins
**Estimated effort:** 2-3 hours (exploration + design + documentation)

## Notes

- This is NOT a technical spec - focus on user experience and design
- P63 technical implementation will follow whatever this spec decides
- Live meeting friction is a known pain point - prioritize solving that
- Pledge signup is high-value conversion - be careful not to harm it

---

## ✅ FINAL UX DECISIONS (Completed 2026-01-15)

### Decision 1: Where to Show Google OAuth

**APPROVED APPROACH: Option D - "Everywhere except pledge"**

| Entry Point | Google OAuth? | Rationale |
|-------------|---------------|-----------|
| **Sign Pledge** (`/sign-pledge`) | ❌ NO | Form is thoughtful conversion moment - adding Google creates decision fatigue and risks skipping "reason" field (social proof gold). Current form is perfect. |
| **Live Meeting** (`/live`) | ✅ YES | Biggest pain point - reduces friction dramatically for first-time users trying the product. Critical UX win. |
| **Login** (`/login`) | ✅ YES | Clear win for returning users. No downside, faster access. |
| **Main page** | ❌ NO | Already have 2 clear CTAs ("Try Meeting" + "Take Pledge"). Third "Sign Up" would confuse. |
| **Settings page** | ❌ NO | Skip for MVP - Supabase auto-links accounts. KISS approach. |

### Decision 2: Form Handling - Sign Pledge Flow

**N/A** - Google OAuth will NOT appear on sign pledge page (see Decision 1)

### Decision 3: Form Handling - Live Meeting Flow

**APPROVED APPROACH: Option B - Pre-fill + progressive disclosure**

**User flow:**
1. User sees "Continue with Google" button (primary, blue)
2. Below: "or enter manually" divider (clickable link)
3. Below: Consent checkbox (ALWAYS visible - non-negotiable)
4. Clicking "or enter manually" expands to show:
   - Name field
   - Email field
5. Action buttons: "New meeting" + "Join"

**Why this works:**
- Default state: ONE button (simplest UX)
- Manual entry available but not cluttering UI
- Consent always visible (legal requirement)
- Progressive disclosure pattern (industry standard)

**Google OAuth behavior:**
- Clicking Google button → OAuth flow
- After auth: Name pre-filled from Google profile
- Creates session immediately
- Redirected to meeting creation

### Decision 4: Visual Design

**Wireframes:** [docs/bmad/diagrams/p63-google-oauth-wireframes-1737027727609.excalidraw](../../../docs/bmad/diagrams/p63-google-oauth-wireframes-1737027727609.excalidraw)

**Key visual decisions:**

1. **Button styling:**
   - Google button: Primary blue (#1976d2), white text, Google icon
   - Height: 50px (touch-friendly)
   - Width: Full-width within form container
   - Border radius: 6px (matches design system)

2. **Divider treatment:**
   - `/live`: "────── or enter manually ──────" (clickable, gray text)
   - `/login`: "────── or use magic link ──────" (static, gray text)

3. **Form layout - /live page:**
   ```
   [Continue with Google] ← Primary button
   ────── or enter manually ────── ← Clickable divider
   (collapsed state shown)

   ☐ I agree session recorded, accept Terms ← Always visible

   [New meeting] [Join] ← Action buttons
   ```

4. **Form layout - /login page:**
   ```
   [Continue with Google] ← Primary button
   ────── or use magic link ────── ← Static divider

   Email Address
   [your@email.com]

   [Send Me a Magic Link] ← Secondary button (same blue)
   ```

5. **Responsive behavior:**
   - Mobile: Full-width buttons, same layout
   - Desktop: Centered form, max-width 400px

### Copy Documentation

| Element | Copy | Notes |
|---------|------|-------|
| Google button | "Continue with Google" | Works for both new + returning users |
| Divider (/live) | "or enter manually" | Clickable, expands form |
| Divider (/login) | "or use magic link" | Static text |
| Consent checkbox | "I agree session will be recorded and accept Terms and Privacy Policy" | Existing copy, keep as-is |
| Login link (/live) | "Already have an account? Log in" | Existing, no change |
| Signup link (/login) | "Don't have a pledge? Sign now" | Existing, no change |

### Edge Case Handling

| Scenario | UX Approach (MVP) |
|----------|-------------------|
| **Google without profile photo** | Keep avatar_color system (already built), show initials |
| **Google name differs from professional name** | Use Google name by default, user can edit in settings later |
| **Corporate Google account** | Treat same as any email, no special handling |
| **Multiple Google accounts** | Supabase handles, not our problem |
| **Google auth revoked** | Email fallback works automatically, no special UI needed |
| **Account linking** (email → Google) | Supabase auto-links by email, silent operation, no UI for MVP |
| **Google auth failure** | Show generic error toast: "Sign in failed. Please try again or use email." |

### Post-Meeting CTA

**APPROVED:** After user completes their first live meeting, show prompt:

```
┌─────────────────────────────────┐
│  Great session! 🎉              │
│                                 │
│  Want to make your commitment   │
│  official?                      │
│                                 │
│  [Take the Clarity Pledge]      │
│                                 │
│  (Earn your certificate and     │
│  join our verified pledgers)    │
└─────────────────────────────────┘
```

**Trigger:** First meeting completion (track via `localStorage` or profile flag)
**Frequency:** Once per user
**Dismiss:** Allow closing, don't force action

### Technical Notes for Dev Implementation

1. **Supabase OAuth config:**
   - Provider: Google
   - Scopes: `email`, `profile` (for name + avatar)
   - Redirect URL: `/auth/callback` (existing handler)

2. **Profile creation logic** (in `AuthCallbackPage.tsx`):
   - Check `user.app_metadata.provider === 'google'`
   - Extract `user.user_metadata.avatar_url`
   - Extract `user.user_metadata.full_name`
   - Create profile with Google data

3. **No changes needed to:**
   - `useAuth` hook (read-only, stays unchanged)
   - Database RLS policies
   - Existing magic link flow

4. **Visual reference:**
   - Wireframes show exact layout
   - Use existing design system colors (blue #1976d2 for CTAs)
   - Follow existing button component patterns

## Deliverables Summary

✅ **Decision Matrix** - Where Google OAuth appears (above)
✅ **Wireframes** - Visual design for `/live` and `/login` ([view file](../../../docs/bmad/diagrams/p63-google-oauth-wireframes-1737027727609.excalidraw))
✅ **Copy Documentation** - All button labels and messaging (above)
✅ **Edge Case Handling** - MVP approach for all scenarios (above)
✅ **Technical Guidance** - Notes for dev implementation (above)

## Validation Against Brand Principles

**"Thoughtful, intentional communication":**
- ✅ Kept pledge signup email-only (prevents rushed signups)
- ✅ Google OAuth only where it reduces friction without harm
- ✅ Consent checkbox always visible (respects user agency)

**"Reduce friction without sacrificing quality":**
- ✅ Live meeting signup MUCH faster with Google
- ✅ Login faster for returning users
- ✅ Pledge quality protected by keeping form unchanged

**"Consistency across entry points":**
- ✅ Google button looks identical on `/live` and `/login`
- ✅ Same copy ("Continue with Google")
- ✅ Clear "or" dividers on both pages

---

**Status:** P63_UX spec complete ✅
**Next Step:** P63 implementation can proceed using this spec
**Dev Agent:** Reference wireframes and decisions above for implementation
