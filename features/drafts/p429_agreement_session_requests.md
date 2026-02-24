---
status: backlog
type: story
rank: 6.0
milestone: M2
tags: [clarity-partner, session-requests, compliance, fulfillment]
prepped_date: '2026-02-24'
depends_on: [p422]
delivery_stage: draft
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-02-24
---

# P429: Agreement Session Requests & Compliance

Deferred from P422.

## Problem Statement

Once a Clarity Partner Agreement is active (P422), partners need a mechanism to formally request sessions from each other, and the system needs to track whether requests are honored within the agreed response window.

**Current state:** P422 establishes the agreement and signing flow only. No mechanism exists to file session requests, track response time, or record whether sessions fulfill open requests.

**In scope:**
- Either partner can file a session request under an active agreement
- Requests delivered via in-app notification + email (Mailgun, already built)
- /live session between the two parties auto-fulfills an open request if ≥1 complete paraphrase round occurred (listener estimate + speaker rating both submitted)
- Compliance history view: requests filed, fulfilled, late, missed
- "Late" state on open requests when response deadline passes (both parties notified)
- Observer notifications on breach (if P430 is live)

**Fulfillment threshold (decided in P422):** A /live session counts as fulfilled if at least one complete paraphrase round occurred — same logic as calibration counting. Sessions that start but never reach a completed paraphrase exchange do not count.

**Session tracking readiness (confirmed via codebase analysis):**
- clarity_sessions already stores creator_profile_id + joiner_profile_id
- clarity_demo_rounds stores speaker_rating + listener_self_rating — both submitted = completed round
- New tables needed: agreement_session_requests, agreement_fulfillments
- RPC needed for auto-fulfillment detection

## Next Steps
Run /create-prd then /ux then /architect when prioritized.
