# P63_UX: Google OAuth UX Flows (Prerequisite)

**Status:** Planning (blocks P63 implementation)
**Priority:** High (prerequisite for P63)
**Complexity:** Medium
**Owner:** UX Designer agent

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

**Next Step:** Activate UX Designer agent to complete this spec
