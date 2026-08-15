---
status: rejected
type: story
rank: 18
tags:
  - ai-coach
  - post-session
  - onboarding
superseded_by: p547
created_date: 2026-02-17
---
# P41: AI Post-Session Coach — Transcript-Based Education Trigger

**Status:** Backlog — revised 2026-03-18 based on transcript corpus analysis
**Priority:** Medium (blocks self-serve quality)
**Created:** 2026-01-07
**Revised:** 2026-03-18 — reframed from "teaser/landing page" to "transcript-based coaching trigger"

## Revision Context (2026-03-18)

Transcript analysis of 28 sessions revealed that users consistently hit the same confusion patterns:
- **Agree/understand conflation** — users can't distinguish "do you agree?" from "do you understand?" (Jb session: "Is it about clarity or agreement?")
- **Surface paraphrase** — repeating words instead of interpreting meaning (~60% of sessions)
- **Premature agreement / "False 10"** — social pressure to rate high (~30% of sessions)

The original P41 was a demand-validation landing page. The revised concept: an AI coach that reads the session transcript, detects confusion patterns, and sends a **personalized education email** walking the user through the relevant ClarityPledge points (from the 8-point framework).

### Revised Concept

1. After a /live session ends, AI analyzes the transcript for confusion signals
2. If confusion detected → trigger a personalized email based on what went wrong
3. Email walks user through the relevant points (e.g., Point 1: agree ≠ understand, Point 2: calibration concept)
4. For deeper confusion → link to all 7 points as a guided walkthrough
5. Goal: users who complete the walkthrough produce deeper sessions next time

### Confusion Detection Signals

| Signal | Detection Method | Points to Teach |
|--------|-----------------|-----------------|
| Agree/understand conflation | Rating given when listener says "I agree" instead of explaining back | Point 1, Point 2 |
| Surface paraphrase | Listener repeats speaker's exact words (high text similarity) | Point 3 (explain-back protocol) |
| Premature 10 | Score of 10 given within first 30 seconds, or without explain-back | Point 3, Point 4 |
| Role confusion | Multiple role swaps, "who goes first?" patterns | Point 4 (PTS protocol) |

### Relationship to P518

P518 (Session Bookends) handles pre/post session UX within the app. P41 handles the **asynchronous education email** sent after the session. They complement each other:
- P518 post-session question → captures whether the session was meaningful
- P41 post-session email → educates when the session hit confusion

---

## Original Spec (January 2026) — preserved below for reference
**Depends On:** P50 Phase 1 (has_pledged infrastructure)

note to self: - [***https://www.assemblyai.com/pricing](https://www.assemblyai.com/pricing)***
- Whisper - cloud run for whisper on google cloud

---

## Goal

Validate demand for AI coaching feature by:
1. Sending post-session email to meeting guests
2. Landing them on `/coaching` Coming Soon page
3. Capturing interest via Mixpanel

**Key insight:** The coaching email IS the incentive for email verification. Magic link creates profile and lands on `/coaching`.

---

## User Flow

```
1. User joins /live meeting as guest (name + email, no verification yet)

2. Session ends

3. System sends email: "See your Clarity Meeting insights!"
   - Email contains magic link to /coaching?source=session
   - Magic link IS the verification step

4. User clicks link:
   - Profile created with has_pledged=false, slug=null (P50 infrastructure)
   - User now verified in system
   - Redirects to /coaching

5. /coaching page shows Coming Soon + interest capture:
   ┌────────────────────────────────────────┐
   │  AI Clarity Coaching                   │
   │  Coming Soon                           │
   │                                        │
   │  We're building personalized feedback  │
   │  based on your clarity sessions.       │
   │                                        │
   │  Want early access? Tell us why:       │
   │  ┌──────────────────────────────────┐  │
   │  │ (optional text field)            │  │
   │  │                           23/1000│  │
   │  └──────────────────────────────────┘  │
   │                                        │
   │  [Request Early Access]                │
   │                                        │
   │  Meanwhile, try another meeting →      │
   └────────────────────────────────────────┘

6. User clicks "Request Early Access"
   → Mixpanel event: feature_requested
   → Thank you state shown
```

---

## Technical Implementation

### Part 1: Post-Session Email

**Trigger:** Session ends (both participants leave or timeout)

**Email service:** Brevo (or similar transactional email)

**Email content:**
```
Subject: See your Clarity Meeting insights

Hi {name},

Thanks for your Clarity Meeting with {partner_name}!

We're building AI coaching to help you improve your communication.
Click below to see what's coming:

[See My Insights] → magic link to /coaching?source=session

---
Clarity Pledge
```

**Email template:** TODO - Slava to provide final copy

**Magic link generation:**
```typescript
// When sending post-session email
const magicLink = await supabase.auth.signInWithOtp({
  email: guestEmail,
  options: {
    emailRedirectTo: `${window.location.origin}/coaching?source=session`,
  },
});
```

### Part 2: /coaching Page

**Route:** Protected (auth required)

```typescript
// App.tsx
<Route
  path="/coaching"
  element={
    <ProtectedRoute>
      <CoachingPage />
    </ProtectedRoute>
  }
/>
```

**Component:** `src/app/pages/CoachingPage.tsx`

Uses `ComingSoonTeaser` component (shared with P50 Phase 2).

### Part 3: Mixpanel Events

```typescript
// Event: coaching_page_viewed (on page load)
{
  user_id: string,
  source: 'session' | 'direct' | null,
  referrer: string | null,
}

// Event: feature_requested (on button click)
{
  feature: 'ai_coaching',
  reason: string | null,
  user_id: string,
  source: 'session' | 'direct' | null,
}
```

---

## MVP Scope

### In Scope
- [ ] Post-session email trigger (when session ends)
- [ ] Email template with magic link to /coaching
- [ ] `/coaching` protected route
- [ ] `CoachingPage` component (or reuse `ComingSoonTeaser`)
- [ ] Mixpanel events: `coaching_page_viewed`, `feature_requested`
- [ ] Source param tracking (`?source=session`)

### Out of Scope (Future P41.x)
- Actual AI coaching logic
- Audio transcription
- LLM-generated feedback
- Full coaching report page

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User clicks magic link in different browser | Works - creates profile, lands on /coaching |
| User already verified (existing pledger) | Email still works, lands on /coaching |
| User clicks magic link twice | Second click is idempotent |
| User visits /coaching directly (not from email) | Redirects to login if not authenticated |
| Session ends but no guest email collected | No email sent (edge case in /live flow) |

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Email open rate | 40%+ | Brevo analytics |
| Click-through rate | 20%+ | Brevo + Mixpanel |
| Interest request rate | 30%+ of page visitors | Mixpanel |

**Validation signal:**
- If 40%+ click "Request Early Access" → Build full AI coaching
- If <10% click → Deprioritize or improve value prop

---

## Dependencies

- **P50 Phase 1** (required): `has_pledged` column, source param detection
- **P70_2** (required): Consent flow — coaching only sent for sessions where `ai_insights_enabled = true`
- **Brevo account** (required): Transactional email setup
- **Email template copy** (required): Slava to provide

---

## Related Documents

- [P50: Non-Pledger Experience](./p242_non_pledger_experience.md) - Provides `has_pledged` infrastructure, shares `ComingSoonTeaser`
- [P51: Pledge Upgrade Flow](../done/3_2_jan26/p51_pledge_upgrade.md) - Non-pledger → Pledger conversion (future)
- [P70_2: Consent Flow](../archive/5_feb_26/p70_2_consent_flow.md) - Users must consent for coaching to activate

---

## Implementation Order

```
P50 PR1 → P50 PR2 → P41 → P51
   ↓         ↓        ↓      ↓
has_pledged Coming   Email+  Pledge
+ UX       Soon     /coaching upgrade
           modal     page    flow
```

**P50 Phase 1 must ship first** because P41 needs the `has_pledged` + `source` param infrastructure for profile creation.
