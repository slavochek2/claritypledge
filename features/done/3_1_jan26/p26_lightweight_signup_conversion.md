---
status: all-done
type: story
tags: []
rank: 125427.0
created_date: 2026-01-02
completed_at: '2026-02-09'
---

# P26: Lightweight Signup & Guest Conversion Flow

**Status:** SUPERSEDED by P37.2a + P41
**Archived:** 2026-01-07

> **Note:** This feature has been superseded by:
> - **P37.2a** - Collects name + email at session JOIN (not after)
> - **P41** - Post-session email converts guests to verified users
>
> The P37.2a approach is better because it:
> 1. Collects email earlier (at join, not after session)
> 2. Integrates with GDPR consent requirements
> 3. Enables post-session coaching email delivery
>
> Key concepts from P26 are preserved:
> - Guest soft registration (name + email = unverified user)
> - No pledge required to join sessions
> - Magic link verification converts to full user

---

## Problem (Original)

Currently, there's **no way to create an account without signing the full Clarity Pledge**. The only path is:

```
Sign Pledge Form → Magic Link → Account Created
```

This creates friction for converting guests who use Live Meeting:
- They've experienced value (had a clarity conversation)
- They might want to save their name / track progress
- But signing the full pledge feels like a big commitment

## Goal

Create a **lightweight signup path** that lets guests become users without the full pledge ceremony — then encourage them to sign the pledge later.

## Proposed User Journeys

### Journey A: Post-Meeting Conversion

Guest finishes a Live Meeting → sees accomplishments → offered lightweight signup

```
┌──────────────────────────────────────────────────────────┐
│  [C]           Session Complete                     [?]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                         🎉                               │
│                   Great session!                         │
│                                                          │
│       ┌────────────────────────────────────┐             │
│       │  You practiced clarity with        │             │
│       │  2 people today                    │             │
│       │                                    │             │
│       │  ✓ 3 explain-backs completed       │             │
│       │  ✓ 12 minutes of dialogue          │             │
│       └────────────────────────────────────┘             │
│                                                          │
│         Want to track your progress?                     │
│                                                          │
│       ┌────────────────────────────────────┐             │
│       │     Save with Email                │             │
│       └────────────────────────────────────┘             │
│                                                          │
│                    Maybe later                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Journey B: Pre-Meeting Quick Signup

Guest on entry page → clicks "Sign in" → offered quick signup option

```
┌──────────────────────────────────────────────────────────┐
│  [←]              Sign In                           [?]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                   Welcome back                           │
│                                                          │
│              Enter your email to sign in                 │
│                                                          │
│              [your@email.com________]                    │
│                                                          │
│              [    Send Magic Link    ]                   │
│                                                          │
│              ─────────── or ───────────                  │
│                                                          │
│              New here? Create account →                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Clicking "Create account" leads to:

```
┌──────────────────────────────────────────────────────────┐
│  [←]           Quick Signup                         [?]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│              Join the Clarity Community                  │
│                                                          │
│              Your Name                                   │
│              [____________________]                      │
│                                                          │
│              Email                                       │
│              [____________________]                      │
│                                                          │
│              [    Create Account     ]                   │
│                                                          │
│                                                          │
│              Want to make it official?                   │
│              Sign the Clarity Pledge →                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Technical Considerations

### Database Changes

Currently profiles require:
- `id` (from auth.users)
- `slug` (generated from name)
- `email`, `name`
- `signed_at` (pledge timestamp)

**Option A: Allow NULL signed_at**
- Users without `signed_at` = "community member" (not pledge signer)
- They can use Live Meeting, track stats
- Later they can "upgrade" by signing the pledge

**Option B: Separate user_accounts table**
- Keep profiles sacred (only pledge signers)
- New table for general accounts
- More complex but cleaner separation

### Auth Flow Changes

Current: Magic link → callback → create profile with pledge data

New: Magic link → callback → check if pledge data exists
- If yes: create full profile (existing flow)
- If no: create lightweight account (new flow)

## User States After P26

| State | Has Account | Signed Pledge | Can Use Live Meeting | Has Profile Page |
|-------|-------------|---------------|----------------------|------------------|
| Guest | No | No | Yes (with name) | No |
| Community Member | Yes | No | Yes | No (or minimal) |
| Pledge Signer | Yes | Yes | Yes | Yes (full) |

## Open Questions

1. **Do community members get a profile page?**
   - Option: Minimal page ("Join [Name] in signing the pledge")
   - Option: No public page until they sign

2. **How do we nudge community members to sign?**
   - Post-meeting prompts
   - Email sequences
   - In-app banners

3. **What metrics do we track for community members?**
   - Meeting count
   - Total clarity minutes
   - Explain-backs completed

## Success Criteria

- [ ] Guests can create account with just name + email
- [ ] Account creation doesn't require signing the pledge
- [ ] Post-meeting conversion prompt implemented
- [ ] Clear upgrade path from community member → pledge signer
- [ ] Mixpanel tracks conversion funnel

## Metrics to Track (Mixpanel)

| Event | Description |
|-------|-------------|
| `conversion_prompt_shown` | Post-meeting signup prompt displayed |
| `conversion_prompt_clicked` | User clicked "Save with Email" |
| `conversion_prompt_dismissed` | User clicked "Maybe later" |
| `quick_signup_started` | User began quick signup flow |
| `quick_signup_completed` | User completed quick signup |
| `community_member_pledge_upgrade` | Community member signed full pledge |

## Dependencies

- P25 (Live Meeting Entry UX) should be completed first
- Database migration for lightweight accounts
- Auth callback changes

## Out of Scope

- Email nurture sequences (separate story)
- Community member dashboard (separate story)
- Gamification / badges (separate story)
