---
status: week
type: task
rank: 53
workstream: analytics
created_date: '2026-08-20'
tags: [analytics, mixpanel, instrumentation]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1133: Internal accounts pollute Mixpanel funnel numbers

## Problem

**Situation:** In a 30-day analytics review, `login_complete` showed 14 events and looked like
real signup-funnel activity worth investigating further.

**Complication:** Breaking that number down by `$distinct_id` showed all 14 events traced to one
account — the founder's own (personal email) — not 14 distinct returning users.
Cross-checking `auth.users` for all sign-in/signup activity in the same 30-day window found
exactly three accounts touched the site at all: the founder's own account, the automated e2e test
account (`test-agent@claritypledge.com`, `profiles.is_test_account = true`), and an internal
ops/agent service account (`ops@claritypledge.com`, slug `clarity-agent`, created 2026-08-10, not
flagged `is_test_account`). Zero real external customers signed up or logged in in that window,
despite 252 unique visitors viewing `/signup`. None of this was visible from the Mixpanel
aggregate — it required a DB cross-check to catch, and it already produced one wrong conclusion
mid-analysis this session ("1 new customer, 0.4% conversion") that had to be corrected after the
fact.

**Question:** How do we make Mixpanel funnel numbers (signup, login, pledge) exclude known
non-customer accounts by default, so this doesn't require a manual DB cross-check every time
someone reads the funnel?

## Appetite

**Blast radius:** low — adds a Mixpanel user property at `analytics.identify()` time; does not
change any user-facing behavior, auth flow, or database schema. Read-only with respect to existing
tables (`is_test_account` already exists; this reads it, doesn't add a column for it).

**Reversibility:** fully reversible — a Mixpanel property is additive metadata. Removing the
tagging code or the property stops affecting new events; historical events are unaffected either
way (Mixpanel doesn't retroactively delete data on a revert).

**Decision density:** one open decision — see Non-Goals: whether `ops@claritypledge.com` gets a
durable schema flag (a real `is_internal`-style column) or a hardcoded allowlist by email/id in the
analytics code. Recommend the latter for this pass (see Solution) since it's the account we know
about today; a schema-level flag is a larger, separate decision if more internal/service accounts
accumulate. **Note:** `ops@claritypledge.com` may be a legitimate system/agent-operator account
(see `features/p1124_agent_operator_is_a_real_profile.md` for related agent-account
infrastructure) rather than disposable test data — this spec does not judge whether the account
should exist, only that its activity should not count as customer funnel activity.

## Solution

At every `analytics.identify()` call site (currently `src/auth/AuthCallbackPage.tsx:515`), also
call `analytics.setUserProperties()` with a boolean `is_internal` property, computed as:
`upsertData.is_test_account === true` (existing DB flag) **OR** the authenticated user's email
matches a small, explicit internal-accounts allowlist (founder's own email + known service account
emails) defined once in `src/lib/mixpanel.ts` or a sibling constants file. Future Mixpanel queries
filter `is_internal != true` to see customer-only activity; existing/historical events are
unaffected (this only tags going forward).

## Risks / Non-Goals

### Risks
- **[ACCEPT] Historical events (including the 14 `login_complete` already recorded) stay
  untagged.** Mixpanel doesn't support retroactive property backfill on already-sent events. Future
  funnel reads still need a manual mental note for anything before this ships. Acceptable — the
  goal is to stop the problem recurring, not rewrite history.
- **[MITIGATE] A hardcoded email allowlist silently misses a new internal account added later**
  (e.g. a second service account). Mitigation: the allowlist lives in one small, obviously-named
  constant, and this spec's Done-When requires a code comment pointing future internal-account
  creators back to it.
- **[ACCEPT] This does not fix or investigate why zero real customers converted** — that's a
  separate, larger question (tracked elsewhere in this session's conversation, not this spec).
  This spec only stops internal activity from masquerading as customer activity in the numbers.

### Non-Goals
- Do NOT add a new database column (e.g. `profiles.is_internal`) — use the existing
  `is_test_account` flag plus a code-level email allowlist for the one known non-test internal
  account. A schema-level flag is future work if more accounts accumulate.
- Do NOT change any auth flow, RLS policy, or user-facing behavior.
- Do NOT attempt to retroactively tag or delete historical Mixpanel events.
- Do NOT investigate or fix the underlying signup-conversion problem (why 252→11→0) — that is
  separate, ongoing work.
- Do NOT touch `features/p1124_agent_operator_is_a_real_profile.md` or any P1104 agent-account
  code — this spec is about analytics tagging only, unrelated to that schema work.

### Alternatives Considered
- **Filter internal accounts inside Mixpanel dashboards/saved reports instead of at the
  instrumentation layer.** Rejected as the sole fix: it only protects reports someone remembers to
  add the filter to — the exact failure mode that caused this session's wrong conclusion (an
  ad-hoc query with no filter). Tagging at write time makes the correct default the easy path.
- **New `profiles.is_internal` database column.** Rejected for this pass — one known non-test
  account doesn't justify a migration; revisit if a second or third internal/service account shows
  up.

## Done-When

- [ ] `analytics.setUserProperties()` includes `is_internal: true|false` for every identified user,
      computed from `is_test_account` OR the internal-email allowlist
- [ ] The internal-email allowlist is a single named constant with a comment explaining what
      qualifies for inclusion and pointing future internal/service-account creators back to it
- [ ] Verified in Mixpanel live view: a fresh login from the founder's own account shows
      `is_internal: true` on the identified user profile
- [ ] `docs/technical/analytics.md` (or equivalent) notes the `is_internal` property and that
      historical events predate it
