---
status: all-done
type: bug
disclosure: public
rank: 1
severity: low
flow: inline
tags:
  - security
  - grants
created_date: '2026-11-23'
date_reported: '2026-11-18'
root_cause: >-
  P1700 (20261117171000_p1700_removal_notice.sql:85) granted EXECUTE on my_event_removed(uuid) to anon as well as
  authenticated, although no signed-out caller exists. The body returns false when auth.uid() is NULL, so nothing
  leaked, but the unjustified grant keeps function-grant-drift-check red (anon-unlisted) every day since 2026-11-18.
completed_at: 2026-11-24
---

# P1715: my_event_removed is callable only by signed-in users

## Problem

The daily grant check (`scripts/function-grant-drift-check.py`) reports `my_event_removed(uuid)` as executable by
anonymous callers on prod and not in `scripts/anon-execute-allowlist.txt`. It has been raised on every /day run since
2026-11-18. The founder chose "apply the fix to prod" on 2026-11-23.

## Appetite

One migration. No client change.

## Solution

Revoke the role-direct anon grant (PUBLIC was already revoked by P1700). Do not allowlist it: allowlist rule 2 needs a
real signed-out call site, and both callers run only with a session
(`src/app/prototypes/events/components/EventDetail.tsx:431` reads it when `isLoggedIn`; `:445` runs after a
registration refusal, which needs a session).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A caller whose session lapsed now gets a permission error instead of false | ACCEPT | `getMyEventRemoval` (`src/app/data/event-waitlist.ts:27-34`) already maps any error to false, the same answer anon got before. It calls `logDbError` first, so a lapsed session now logs one permission error per read (may reach Sentry). |
| `e2e/integration/p1700-removal-email-db.spec.ts:107` asserted anon gets false | MITIGATE | Now asserts anon is refused (error set, data null): the regression guard for this change. 5/5 on TEST |

Non-goal: the body of the function; it was already correct.

## Done-When

- [x] On test: `has_function_privilege('anon', 'public.my_event_removed(uuid)', 'EXECUTE')` is false and the
      authenticated grant is true, with an allowlisted anon function as the control (true).
(Evidence 2026-11-23, self-hosted TEST: anon false, authenticated true, control `get_event_by_slug(text)` anon true.)

The prod check is not a box here: prod migrations run from main only after ship. It is done right after ship as the
founder approved (2026-11-23, "yes to all"): `migrate.sh --env prod --only 20261123084234_p1715_revoke_anon_my_event_removed.sql`,
then the same three reads on prod and `function-grant-drift-check.py --no-probe` with no anon-unlisted function.
