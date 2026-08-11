---
status: all-done
type: bug
rank: 1000963.0
severity: critical
date_reported: '2026-08-11'
created_date: '2026-08-11'
tags: [security, rls, ownership, content-integrity]
driver: anomaly
feature_type: backend
completed_at: 2026-08-11
---

# P1047: `clarity_sessions` UPDATE policy does not bind ownership for null-target rows

## Summary

The P1038 fix bound the INSERT policy's owner column. The UPDATE policy on the same table
still does not, for the majority of rows — so the same attribution forgery is reachable in
one UPDATE instead of one INSERT, and appears to need no authentication at all.

Exploit mechanics, live policy text, grants and row counts are in
`.private/docs/security-log.md` (2026-08-10). Per CLAUDE.md this public spec carries the
problem class only, because the gap is unfixed.

## Problem

The policy's `USING` clause leads with a branch that is true for any row whose target is
unset. Postgres short-circuits the OR, so no `auth.uid()` comparison is ever reached for
those rows, and the `WITH CHECK` in the same branch reduces to a not-null test on the owner
column rather than an equality test against the caller. The policy is granted to `public`
and contains no authenticated-caller conjunct; the anon role holds the table and
column-level UPDATE privilege.

The overwhelming majority of live production rows are in that shape.

This is **pre-existing**, not introduced by P1038 — the policy has been unchanged since
April. But P1038's fix interacts with it: the fix deliberately permits rows to be created
with a null owner, and those are precisely the rows anyone can subsequently claim.

Verification status: established from live policy text and live grants on both environments.
**Not empirically executed** — proving it requires a write, which is ALWAYS-ASK. Do not
upgrade the language to "exploited" without that run.

## Appetite

Low blast radius (one policy, `DROP` + recreate, matching the P1032/P1035/P1038 idiom) but
higher decision density than P1038: the null-target branch exists to serve anonymous
practice rooms, so tightening it must not break guest flows. That trade-off is a real design
question, not a mechanical predicate addition.

## Solution

1. Re-read the live policy on both environments first — migration files and the deploy
   manifest were both proven unreliable during P1046.
2. Establish what the null-target branch legitimately serves. Grep every UPDATE caller in
   `src/` and `supabase/functions/`. Anonymous practice rooms genuinely need guest writes;
   the question is which columns, not whether.
3. Prefer column-level restriction over row-level permissiveness: the caller needs to update
   session state, not `creator_profile_id`. Revoking the column grant may be a better fix
   than rewriting the predicate, and is harder to get subtly wrong.
4. Write the canary first, against the unfixed policy, and observe it fail (gate 7). It must
   cover the **anonymous** caller shape — P1038's canary only exercised an authenticated
   attacker, which is why this was invisible to it.
5. Fix, verify live on test, then prod as a separate approved step.

## Risks / Non-Goals

### Risks
- **Breaking anonymous practice rooms.** MITIGATE — the null-target branch is load-bearing
  for guest flows. Enumerate callers before touching the predicate.
- **Fixing the predicate while the column grant stays open.** MITIGATE — check
  `information_schema.column_privileges`, not just `pg_policies`. A tightened policy with an
  open grant is a false fix.

### Non-Goals
- Do NOT redesign the anonymous-session model.
- Do NOT fold in the separate unauthenticated-write finding on the ML training table.

## Done-When

- [ ] Live policy re-read on both environments before any change
- [ ] Every legitimate UPDATE caller enumerated, with the columns each needs
- [ ] Canary observed FAILING against the unfixed policy, covering an anonymous caller
- [ ] Fix applied to test, canary green, guest practice-room writes confirmed still working
- [ ] Applied to prod under explicit approval, then re-verified live
- [ ] Private security log updated; public files stay problem-class only until the fix lands
