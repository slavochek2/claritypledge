---
status: backlog
type: bug
rank: 7
severity: medium
workstream: analytics
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [mixpanel, analytics, auth-callback]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P895: `profile_created` fires for returning users — `isReturningUser` misclassification inflates signup metrics

## Summary

`AuthCallbackPage.tsx:446` fires `analytics.track(isReturningUser ? 'login_complete' : 'profile_created', ...)`. During the P881 reproduction session, a `profile_created` event was observed in prod Mixpanel for the founder's long-existing profile (event properties: `registration_source: login`, `has_pledged: true`, profile created far before the 30-day window). The `isReturningUser` flag evaluated false for an existing user, so a login was recorded as a signup.

## Impact

- `profile_created` over-counts: funnel/activation boards count returning logins as new signups.
- Compounds P881 (under-count): the two errors partially mask each other, making both harder to see.

## Reproduction Evidence

- Prod Mixpanel, Events feed, 30D window: 7 `profile_created` events vs 6 actual DB signups with a captured event; the 7th belongs to a profile created long before the window, with `registration_source: login`.

## Root Cause (hypothesis — not yet confirmed)

`isReturningUser` derivation in `AuthCallbackPage.tsx` misclassifies under some path (e.g., profile upsert returning "created" semantics on an existing row, or the flag computed from a stale/absent local signal). Needs `/reproduce`.

## Affected Files

- `src/auth/AuthCallbackPage.tsx` — line 446 and the `isReturningUser` derivation upstream of it

## Acceptance Criteria

- [ ] Root cause of the misclassification confirmed with a failing test
- [ ] A returning-user login fires `login_complete`, never `profile_created`
- [ ] A genuinely new signup still fires `profile_created`

## Related

- P881 — `profile_created` under-count (loss); discovered during its `/reproduce` session
