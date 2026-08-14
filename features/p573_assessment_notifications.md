---
status: backlog
type: story
rank: 23
tags:
  - epic-story-first
  - notifications
  - email
  - comprehension
created_date: 2026-03-22T00:00:00.000Z
---

# P573: Assessment Notifications (Email)

**Epic:** P523 (Story-First Content Model)
**Related:** P561 (comprehension slider), existing SMTP infrastructure (slava@claritypledge.com)

---

## Problem

When a user files a story about someone's point (P560) and takes the comprehension assessment (P561), the point author has no way to know. Without a return trigger, the author never sees the assessment result or the gap it may reveal. The async feedback loop — the core mechanism for scaling gap revelations without Slava — is broken at the notification step.

## Intention

Notify point authors when someone completes a comprehension assessment on a story related to their point. This is the return trigger that makes the async flywheel work: gap → /live → transcript → story → points → assessment → **notification** → engagement.

## Scope

- Email notification to point author when a comprehension assessment is completed on a related story
- Include: assessor name, story title, assessment result summary (gap revealed or not)
- Respect notification preferences (opt-out)
- Use existing SMTP infrastructure (ops@claritypledge.com / slava@claritypledge.com)

## Dependencies

- P561 (comprehension slider) — assessments must exist first
- P564 (point-story attribution) — need to know which author to notify
- User email collection (already in auth flow)

## Open Questions

1. What's the right notification frequency? Per-assessment or daily digest?
2. Should the email include the assessment score or just "someone assessed your point"?
3. How to handle the author's counter-assessment prompt — CTA in email or just link to the card?
