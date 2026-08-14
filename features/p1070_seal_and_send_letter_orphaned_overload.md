---
status: week
type: bug
rank: 22
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [rpc, migrations, overload, letters]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1070: seal_and_send_letter carries an orphaned overload, so the three-argument call cannot resolve

## Summary

`seal_and_send_letter` exists as both a 3-argument and a 4-argument function on prod and test, so a
call that names only the three shared arguments is ambiguous and is rejected before it reaches
Postgres.

## Root Cause

P952 (`20260618120000_p952_responses_mode.sql`) added `p_responses_mode` by re-declaring the
function with a new signature. `CREATE OR REPLACE FUNCTION` keys on the signature, so it created a
second function rather than replacing the first. The 3-argument body from before P952 is still
live and still separately granted.

The 4-argument form declares `p_responses_mode` with a DEFAULT, so both candidates match a
three-named-argument call and PostgREST refuses to choose:

```
PGRST203  Could not choose the best candidate function between:
  public.seal_and_send_letter(p_letter_id => uuid, p_predictions => jsonb, p_deliveries => jsonb),
  public.seal_and_send_letter(p_letter_id => uuid, p_predictions => jsonb, p_deliveries => jsonb,
                              p_responses_mode => text)
```

**This directly falsifies P952's own client-safety annotation**, which reads: "existing clients omit
`p_responses_mode` and get default 'invite'" (`20260618120000_p952_responses_mode.sql:10`). An
existing client that omits it does not get the default — it gets a hard error and cannot seal a
letter at all.

Same class as the two orphaned overloads closed in P1066 (`get_inbox_items(uuid)`,
`accept_agreement(uuid,text,uuid)`). Unlike those, this one carries **no anon grant**, so it is a
correctness defect rather than a security one — which is why it was deliberately left out of
P1066's migration rather than folded in.

## Reproduction Steps

1. Call the RPC over REST naming only the three pre-P952 arguments — this is what any client bundle
   built before P952 does, and what `e2e/integration/20260412135402_fix_block_self_send.spec.ts:70`
   does today:
   ```ts
   await client.rpc('seal_and_send_letter', {
     p_letter_id: letterId,
     p_predictions: [],
     p_deliveries: [{ receiver_email: senderEmail, receiver_name: 'Myself' }],
   });
   ```
2. Observe the returned error.

**Reproduction rate:** 100% (both prod and test carry both overloads — verified against live
`pg_proc`, not migration text).

## Expected Behavior

The call resolves to the current function and returns its result — for the test above, the
self-send guard fires and the error message is "Cannot send a letter to yourself".

## Actual Behavior

`PGRST203 — Could not choose the best candidate function`. The self-send guard never runs, so the
test at `20260412135402_fix_block_self_send.spec.ts:80` fails on the assertion that the message
contains "Cannot send a letter to yourself". This failure is present on `main` today and is
unrelated to whatever branch is being worked on.

## Affected Files

- `supabase/migrations/20260618120000_p952_responses_mode.sql` — introduced the second signature;
  line 10 carries the now-false client-safety claim
- `e2e/integration/20260412135402_fix_block_self_send.spec.ts:70,80` — the failing three-argument
  caller
- `src/app/data/letters-service.ts:103-108` — the live client, which passes all four arguments and
  is therefore unaffected today

## Severity

**Medium** — the shipped client always sends four arguments, so no user hits this on the current
bundle. It is not lower than medium because a stale cached bundle cannot seal a letter at all
(a complete failure of the core send path, not a degraded one), and because it currently masks a
real self-send regression guard by making that test fail for an unrelated reason.

## Fix Approach

Drop the orphaned signature and verify against the live catalog afterwards rather than trusting the
migration run:

```sql
DROP FUNCTION IF EXISTS public.seal_and_send_letter(uuid, jsonb, jsonb);
```

Then confirm exactly one candidate remains on **both** environments:

```sql
SELECT oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'seal_and_send_letter';
```

That verification step is not optional here: P1066's F6 established that a `DROP FUNCTION IF EXISTS`
recorded as applied on prod can leave the function in place, so a green migration run is not
evidence. Check the ACL on the surviving function at the same time — the dropped overload held its
own grants.

**Do not** re-declare the function to "replace" it; that is the operation that created the problem.

## Acceptance Criteria

- [ ] `e2e/integration/20260412135402_fix_block_self_send.spec.ts` passes, with the self-send guard
      producing "Cannot send a letter to yourself"
- [ ] A three-named-argument REST call to `seal_and_send_letter` returns a normal result or a normal
      domain error — never `PGRST203`
- [ ] Live `pg_proc` on **both** prod and test shows exactly one `seal_and_send_letter` (query
      output pasted, not a green migration run)
- [ ] Sealing a letter from the app still works end to end, with the response-intensity choice
      preserved
- [ ] No console errors during the seal flow
