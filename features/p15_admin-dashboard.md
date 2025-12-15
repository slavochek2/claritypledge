# P15: Admin Dashboard

## Summary

Internal tool for Slava to see user comprehension check responses, identify misconceptions, and prioritize manual follow-ups.

**Status:** Defined, ready to build after p12.

## Problem Statement

**Current State:**
- No visibility into whether users understand the pledge
- No way to identify who has misconceptions
- Manual follow-up requires guessing who needs help

**Impact on North Star:**
- LOW direct impact — doesn't cause users to paraphrase
- But enables efficient manual intervention during early growth phase

## Priority

**LOW** — Internal tooling. Build after user-facing features (P1, P3).

## User

**Admin only** (Slava) — not visible to regular users.

## MVP Scope

### Dashboard View

```
┌─────────────────────────────────────────────────────────┐
│  Comprehension Check Responses                          │
│                                                         │
│  Filter: [All] [Has Disagree] [Incomplete]             │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Sarah Chen                        Dec 10, 2024  │   │
│  │ ✓✓✓✓✓✓✓  Complete (7/7 Agree)                  │   │
│  │ No follow-up needed                             │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Marcus Williams                   Dec 9, 2024   │   │
│  │ ✓✓✗?✓✓✓  Has disagreement (1 Disagree, 1 ?)    │   │
│  │ ⚠️ NEEDS FOLLOW-UP                              │   │
│  │ [View details] [Mark as contacted]              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Alex Johnson                      Dec 8, 2024   │   │
│  │ ✓✓✓--  Incomplete (3/7)                        │   │
│  │ Abandoned at statement 4                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Detail View (Click on user)

```
┌─────────────────────────────────────────────────────────┐
│  Marcus Williams — Comprehension Check                  │
│                                                         │
│  1. Trigger is any paraphrase request     ✓ Agree      │
│  2. Only live conversation can trigger    ✓ Agree      │
│  3. Intention > perfection                ✗ Disagree   │
│     Comment: "I think you should try to get it right"  │
│  4. Breaking = walking away               ? Don't Know │
│  5. Backdoor explanation                  ✓ Agree      │
│  6. NOT about honesty                     ✓ Agree      │
│  7. Accepting = valuing understanding     ✓ Agree      │
│                                                         │
│  [Send follow-up email] [Mark as resolved]             │
└─────────────────────────────────────────────────────────┘
```

## Features

1. **List all comprehension check responses** with summary status
2. **Filter by:** All / Has Disagree / Has Don't Know / Incomplete
3. **Sort by:** Date / Needs attention
4. **View details:** See each statement + user's response + comment
5. **Admin actions:** Mark as contacted, mark as resolved

## Data Model

Uses existing tables from p12:
- `ideas` — the 7 statements
- `idea_reactions` — user responses (agree/disagree/dont_know + comment)

**Additional field needed:**
- `idea_reactions.admin_status` ('needs_followup' | 'contacted' | 'resolved' | null)

Or separate table:
```sql
comprehension_followups
- id (uuid)
- user_id (uuid)
- status ('needs_followup' | 'contacted' | 'resolved')
- notes (text, nullable)
- updated_at
```

## Technical Implementation

### Route

- `/admin/comprehension` — Admin dashboard (protected route)

### Files to Create

- `src/app/pages/admin/comprehension-dashboard.tsx`
- `src/app/components/admin/comprehension-response-card.tsx`
- `src/app/components/admin/comprehension-detail-modal.tsx`
- `src/app/data/admin-api.ts` — Admin-only API functions

### Access Control

- Check if user is admin before rendering
- Simple approach: hardcode admin user IDs or add `is_admin` flag to profiles

## Open Questions

1. **Who is admin?** Just Slava? Multiple people? Role-based?
2. **Email integration:** Send follow-up from dashboard or just mark?
3. **Notification:** Alert when new disagreement comes in?

## Success Metrics

- Time from user completing check → admin seeing response
- % of users with misconceptions who get follow-up
- Conversion: follow-up → understanding (measured by re-check or conversation)

## Implementation Priority

Build AFTER:
1. p12 (Comprehension Check) — needs data to display
2. Optionally after p14 (Clarity Partners) if resources are limited

## Related Documents

- [p12_onboarding-comprehension-check.md](./p12_onboarding-comprehension-check.md) — Creates the data this dashboard displays
