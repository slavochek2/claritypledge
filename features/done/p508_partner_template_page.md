---
status: all-done
type: feature
rank: 250005.75
workstream: C1
created_date: 2026-03-14
tags: []
flow: quick-feature
delivery_stage: done
completed_at: 2026-03-15
uat_file: features/uat/p508.md
test_files:
  - e2e/p508-partner-template.spec.ts
  - e2e/a11y/p508-accessibility.spec.ts
---

# P508: Public Partner Agreement Template Page

## Problem

No way to share what a Clarity Partner Agreement looks like with people who aren't registered. The creation page (`/agreements/new/create`) requires authentication, so potential partners can't preview the format before signing up.

## Solution

Static public page at `/partner-template` that renders the existing `AgreementCertificate` component in `active` variant with mock data ("Alex" and "Jordan"). No auth required. CTA drives to `/agreements/new/create` (which triggers auth if needed).

Key decisions from conversation:
- **Option A chosen** over sharing real agreements (privacy) or unauthenticated creation flow (too complex)
- Terms rewritten in plain human language (not contract jargon)
- Both signature slots show names only — no "Creator"/"Partner" role labels (they're both partners)
- "Customizable" hint and explanatory text rendered **below** the certificate (not inside it — no component modification needed)
- CTA: "Create Your Agreement →" + "Already have an account? Sign in"

## UX Design

```
┌─────────────────────────────────────────────────────────┐
│  ← claritypledge.com                                    │
│                                                         │
│  ╔═══════════════════════════════════════════════════╗   │
│  ║  ┌───────────────────────────────────────────┐   ║   │
│  ║  │                                           │   ║   │
│  ║  │      Clarity Partner Agreement            │   ║   │
│  ║  │    A  M U T U A L  C O M M I T M E N T   │   ║   │
│  ║  │            T O  C L A R I T Y             │   ║   │
│  ║  │  ─────────────────────────────────────    │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  We, Alex Walker and Jordan Rivera,       │   ║   │
│  ║  │  agree to:                                │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  YOUR RIGHT                               │   ║   │
│  ║  │  [static pledge text]                     │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  OUR PROMISE                              │   ║   │
│  ║  │  [static pledge text]                     │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  THE EXCEPTION                            │   ║   │
│  ║  │  [static pledge text]                     │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │   ║   │
│  ║  │  OUR TERMS                                │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  We'll focus on: our work conversations.  │   ║   │
│  ║  │  How to request a session: via email.     │   ║   │
│  ║  │  How often: at least once a month,        │   ║   │
│  ║  │    unless we both agree to skip.          │   ║   │
│  ║  │  How long: at least 15 minutes.           │   ║   │
│  ║  │  Response time: within 5 days.            │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  ═════════════════════════════════════    │   ║   │
│  ║  │                                           │   ║   │
│  ║  │  (AW)              ⦿              (JR)    │   ║   │
│  ║  │  Alex Walker     [seal]    Jordan Rivera   │   ║   │
│  ║  │                                           │   ║   │
│  ║  │        Active since March 1, 2026         │   ║   │
│  ║  │                                           │   ║   │
│  ║  └───────────────────────────────────────────┘   ║   │
│  ╚═══════════════════════════════════════════════════╝   │
│                                                         │
│     ✏️ The terms section is fully customizable.          │
│     This is a template — when you create your own,      │
│     you and your partner write the terms together.      │
│                                                         │
│           ┌───────────────────────────────┐             │
│           │  Create Your Agreement →      │             │
│           └───────────────────────────────┘             │
│                                                         │
│           Already have an account? Sign in              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Technical Notes

- Reuse `AgreementCertificate` component with `variant="active"` and mock props
- New route `/partner-template` — no auth guard
- New page component `partner-template-page.tsx`
- Uses `ClarityLandingLayout` (same as other public pages)
- "Customizable" hint + explanatory text rendered **below** certificate in page markup (not inside `AgreementCertificate` — no shared component changes)
- Mock data:
  - `creatorName="Alex Walker"`
  - `partnerName="Jordan Rivera"`
  - `creatorSignedAt="2026-03-01T00:00:00Z"`
  - `partnerSignedAt="2026-03-01T00:00:00Z"`
- Exact `termsText` string (whitespace-pre-wrap, newline-separated):
  ```
  We'll focus on: our work conversations.
  How to request a session: via email.
  How often: at least once a month, unless we both agree to skip.
  How long: at least 15 minutes per session.
  Response time: acknowledge requests within 5 days.
  ```

## Acceptance Criteria

- [x] `/partner-template` loads without authentication
- [x] Certificate renders identically to a real active agreement (same component)
- [x] Terms section shows human-readable example text
- [x] "Customizable" hint + explanatory text visible below certificate
- [x] CTA "Create Your Agreement →" links to `/agreements/new/create`
- [x] "Sign in" link goes to `/login`
- [x] No "Creator"/"Partner" role labels on signature slots
- [x] Page is responsive (mobile + desktop)

## Test Coverage Strategy

**What's Tested:**
- E2E: Page loads without auth, certificate content, CTA links, no role labels (8 tests)
- A11y: Keyboard focus, accessible names, landmark region (4 tests)
- Smoke: Added to `public-pages-smoke.spec.ts` (1 test)
- UAT: 9 manual scenarios covering content, CTAs, responsive

**What's NOT Tested (rationale):**
- Unit tests — no business logic, no utilities, no services
- Integration tests — no DB, no API, no auth
- Component internals — covered by E2E assertions on rendered content

**Test Pyramid:**
```
     /\
    /  \   8 E2E + 4 A11y
   /____\
  /  0 INT \
 /__________\
/ 0 UNIT     \
```

**Total:** 13 automated tests + 9 UAT scenarios

**Files:**
- `e2e/p508-partner-template.spec.ts` — E2E user flows
- `e2e/a11y/p508-accessibility.spec.ts` — Accessibility
- `e2e/public-pages-smoke.spec.ts` — Smoke (updated, not new)
- `features/uat/p508.md` — UAT scenarios
