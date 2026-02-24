---
status: backlog
type: story
rank: 5.0
milestone: M2
tags: [clarity-partner, observers, witnesses, accountability]
prepped_date: '2026-02-24'
depends_on: [p422, p429]
delivery_stage: draft
reviews:
  ux: null
  architect: null
  alignment: null
---

# P430: Agreement Observers (Witnesses)

Deferred from P422.

## Problem Statement

Once session requests and compliance tracking exist (P429), observers (witnesses) can be added to agreements to create external accountability and drive user acquisition.

**Current state:** P422 signs the agreement, P429 tracks compliance. No third-party visibility into compliance exists.

**In scope:**
- Creator adds observer emails when creating or after signing an agreement
- Observers receive email invitation, must explicitly accept observer role (register if not yet a user → user acquisition path)
- Observers are read-only: cannot file requests, cannot modify agreement
- Observers see: agreement existence, status, "late" flags — NOT individual session content
- Observers notified on: deadline breach, "late" request state, termination, expiry
- Observers named on agreement certificate (witnesses)
- Private agreements = both parties + confirmed observers only
- Public agreements = anyone can see

**Growth mechanic:** Each agreement can onboard 1–2 new users as observers. Non-registered observers prompted to sign up on acceptance.

## Next Steps
Run /create-prd then /ux then /architect when prioritized.
