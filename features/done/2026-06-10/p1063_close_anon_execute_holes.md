---
status: all-done
type: bug
rank: 1000976.0
created_date: '2026-08-13'
tags: [security, rls, grants, letters, clarity-sessions]
pipeline_ran: [create-spec, dev]
driver: anomaly
completed_at: 2026-08-13
---

# P1063: four SECURITY DEFINER RPCs are executable by unauthenticated callers

## Problem

**Situation:** P1058's fail-open audit of the P1053 join path checked whether the *code* of three
functions could be skipped on NULL. It also asked a question the audit did not need but the answer
turned out to matter: are the grants on those functions what the migrations say they are?

**Complication:** They are not. Four SECURITY DEFINER functions intended for signed-in users only
are executable by `anon` on **test and production**. Two were reproduced end-to-end on test:

- `seal_and_send_letter` — an unauthenticated caller sealed **another user's draft letter**.
  HTTP 200, returned `true`, `draft` -> `sealed` with `sealed_at` stamped. There is no unseal path
  in the product, so this is irreversible destruction of another person's work in progress.
- `complete_clarity_session` — an unauthenticated caller ended a live session by id. `ended_at`
  stamped, `status` set to `completed`. `ended_at` is what `claim_joiner_seat` gates on, so the
  room becomes permanently unjoinable by **either** participant.

Their internal authorization is written `IF v_owner_id != auth.uid() THEN RAISE`. For an anon
caller `auth.uid()` is NULL, the condition is NULL, and plpgsql **skips** an `IF` whose condition
is NULL. The refusal does not fail to match — it never runs. Same class as P1053's F5.

**Question:** Close the four, and prove the closure with something that reads the live database
rather than the migration text.

## Appetite

Low blast radius — removes a privilege no legitimate client path uses; every caller in `src/` is
authenticated (verified by grep, listed in the migration header). Fully reversible (a GRANT).
**Decision density: zero.** Nothing here is a product trade-off: no user journey depends on an
anonymous stranger sealing someone else's letter or ending someone else's session.

## Solution

One migration, `20260813080000`, revoking EXECUTE from both `anon` and `PUBLIC` on all five
signatures (both `seal_and_send_letter` overloads), then re-asserting `GRANT ... TO authenticated`.

## Risks / Non-Goals

### Risks

- **Over-tightening** — P1047's failure mode: a fix that closes the hole and breaks the guest
  journey with it. MITIGATE: `claim_joiner_seat` / `release_joiner_seat` must stay anon-reachable;
  two positive controls in the regression test assert exactly this and fail loudly if a future
  change removes them.
- **A revoke that silently does nothing.** MITIGATE: verified by `has_function_privilege()` on the
  live database, and by re-running the real exploit — not by the migration applying cleanly.

### Non-Goals

- Do **NOT** revoke anon from the token-based letter RPCs or the seat RPCs. Those are deliberately
  anon-reachable; that is the product working.
- Do **NOT** fix the duplicate `seal_and_send_letter` overloads here. Recorded below.
- Do **NOT** treat this as closing the wider surface — see Follow-ups.

## Done-When

- [x] All five signatures report `anon=false`, `authenticated=true` via `has_function_privilege()`
- [x] The reproduced exploits (anon sealing a stranger's draft; anon ending a session) return 42501
- [x] `claim_joiner_seat` / `release_joiner_seat` still report `anon=true`
- [x] A regression test calls each RPC as a real anon client over HTTP and requires refusal
- [x] That test was **watched to fail**: hole reopened on test -> exit 1; re-closed -> exit 0
- [x] The 6 failing `seal_and_send_letter` tests proven **pre-existing** by restoring the pre-fix
      ACL and re-running — same failures, same PostgREST overload-ambiguity error

## Follow-ups (NOT done here)

1. **The wider sweep is unfinished.** A background audit classifying every remaining function as
   intentionally-anon vs accidentally-anon **died on an API error before reporting**. 45 of 63
   SECURITY DEFINER functions on prod are anon-executable and most are legitimate, but there is no
   written record of which. Until that exists, this class cannot be declared closed.
2. **No drift detection for function grants.** `scripts/rls-drift-check.py` covers policies;
   nothing in `scripts/` reads `pg_proc.proacl`. This defect was invisible to every existing gate.
3. **Duplicate `seal_and_send_letter` overloads** (3-arg legacy + 4-arg current) make PostgREST
   fail with "could not choose the best candidate function" for 3-arg callers. Pre-existing, and
   the cause of 6 currently-failing integration tests.
4. **P1058's F4** — anon can evict a seated guest, and release-then-claim walks around the
   occupancy guard. Canaries committed here; the fix (guest ticket + host "remove guest" control)
   is decided but not built.