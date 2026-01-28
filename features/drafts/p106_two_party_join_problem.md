# P106: Two-Party Join Problem

## Problem Statement

Users create live sessions but partners never join. The funnel shows:
- 15 live page views → 5 sessions created (33%) → **0 joined** → 0 completed

The product requires two people, but we have no mechanism to get the second person into the room.

## Evidence (Mixpanel, Jan 2026)

| Metric | Value |
|--------|-------|
| Sessions created | 5 |
| Sessions joined | 0 |
| Completion rate | 0% |

## Hypotheses

1. **Invite friction** — User creates session, but sharing the code/link is awkward
2. **No partner available** — User is alone and has nobody to invite right now
3. **Partner doesn't understand** — Recipient gets link but doesn't know what to do
4. **Timing mismatch** — Creator and partner aren't available simultaneously

## Potential Solutions

### Option A: Invite Flow Optimization
- One-click share to WhatsApp/SMS/Email with pre-filled message
- QR code for in-person sharing
- Copy link with clear CTA text

### Option B: Async Matching (Waitlist)
- "Find me a partner" button
- Match users who want to practice with strangers
- Requires trust/safety considerations

### Option C: Scheduled Sessions
- Book a time with someone specific
- Calendar invite with join link
- Reminder notifications

### Option D: Demo/Solo Mode
- Practice with AI or recorded prompts
- Reduces barrier but loses the "real conversation" value

## Recommended Approach

TBD — needs user research to understand which hypothesis is true.

## Success Metrics

- `live_session_joined` / `live_session_created` > 50%
- `live_session_completed` / `live_session_joined` > 70%

## Events Needed

Current events may be missing:
- `live_invite_link_copied` — did creator try to share?
- `live_invite_link_clicked` — did recipient click?
- `live_invite_sent` — explicit share action (vs just creating)

## Status

- [ ] User research to validate hypothesis
- [ ] Design solution
- [ ] Implementation
- [ ] Measure improvement

## Related

- Report 2 in Mixpanel analytics review (Jan 2026)
