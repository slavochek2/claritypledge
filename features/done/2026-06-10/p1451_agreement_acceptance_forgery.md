---
status: all-done
type: bug
rank: 30
severity: medium
workstream: infrastructure
date_reported: '2026-10-09'
created_date: '2026-10-09'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, agreements]
disclosure: public
pipeline_ran: [create-bug, dev]
related: [p1446, p1230, p1321]
completed_at: 2026-10-12
---

# P1451: An agreement's creator can mark it accepted without the partner

> **Embargoed.** Authored branch-born on `feature/p1451-agreement-acceptance-forgery`. Not published
> until `./scripts/git-ops.sh publish-spec p1451` confirms the fix is live on prod. Commit subjects
> use roles, not mechanics. Source: `.private/docs/security-log.md`, P1446 Codex findings, "F5".

## Summary

A party to a pending agreement (the creator, or a partner it is addressed to) could change its
status to `active` with an ordinary client UPDATE, without the partner going through acceptance.
The agreement then showed as active on the creator's public profile — and, for a partner-addressed
invitation, on the named person's too — a public claim that a named person agreed, when they did
not. Review widened it: after a genuine acceptance either party could still rewrite what was
accepted (terms, visibility, signature time), make status changes the app never makes (mark an
invitation declined, move an accepted agreement to expired), and fire notification emails
announcing states the agreement was not in.

## Root Cause

`trg_agreements_lock_party_ids` (latest: `20260902001600_p1230_b_lock_status_and_token.sql`) locks,
for `anon`/`authenticated`: the party ids, a return to `pending`, and the invitation token. It
deliberately left forward transitions open (`pending -> expired`, `* -> terminated`), and so also
left `pending -> active` — and every other column and transition — open. The UPDATE policy admits
both parties. The notification function checked the agreement's state only for internal callers,
and only for `accepted`. Only `accept_agreement`
(SECURITY DEFINER) should ever produce `active`.

## Scope as verified before the fix (2026-10-09, code + prod catalog + prod data, read-only)

- `partner_profile_id` cannot be set by a client (trigger), and since P1446 a client INSERT must
  leave it NULL. So a self-activated agreement has **no partner account**: it is not shown on the
  named person's profile, does not enter `p878_relationship_scope`, and exposes no data.
- Visible effect: `get_public_agreements_for_profile` returns it (public visibility) on the
  creator's profile, status `active`, with `partner_display_name` as typed and
  `partner_signed_at` NULL.
- Prod has 0 active agreements with a NULL partner (no sign of use). 2 terminated ones exist
  (legitimate cancellations).

**Correction (2026-10-09, during /dev):** the first bullet understates the reach.
`create_agreement_with_profile` (SECURITY DEFINER, `20260605150000_p878_search_profiles_rpc.sql`)
inserts a **pending row with `partner_profile_id` already set** to a profile in the creator's
relationship scope. Self-activating that row shows it, as active, on the **named person's** public
profile too, and it then counts in `p878_relationship_scope`. The fix is the same trigger guard and
closes both paths; the test covers both (the app's insert, and the partner-addressed pending row).
Severity stays **medium**, but the "no partner account" mitigation holds only for the email path.
Prod data check (below) found no row of either shape.

## Invariants

- **Only the partner-authorised accept path makes an agreement `active`.** No client role may set
  `status = 'active'` on INSERT (closed by P1446) or UPDATE (this spec).
- **What the partner accepted is fixed.** After creation a client may change only an agreement's
  status (with `terminated_at` / `terminated_by`); terms, visibility, signature time and the
  displayed partner name are not client-writable (added after the Codex review).
- **A party moves an agreement only along the app's paths** (pending → expired, pending →
  terminated, active → terminated) and records only itself as the one who ended it.
- **A notification is sent only when the agreement is in the state it announces**, whoever asks.
- P1446's rule stands: who an agreement belongs to, and whether it was accepted, is decided by the
  server.

## Reproduction Steps (test project only)

1. A user creates an agreement the way the app does (pending, no partner).
2. The same user, as `authenticated`, updates that row's `status` to `active`.
3. Expected after fix: refused (42501, the guard's message). Before the fix the update landed (red run, 2026-10-09).

## Expected Behavior

Step 2 is refused. Legitimate transitions still work: `accept_agreement` → `active`; lazy
`pending -> expired`; cancel/terminate → `terminated`.

## Fix Approach

1. **Failing test first** (`e2e/integration/p1451-agreement-self-accept.spec.ts`, test project):
   creator self-activation lands today (red). Controls that must stay green: the app's
   create → `accept_agreement` path ends `active` with the partner set; expiry and termination by
   a party still work; a non-party cannot update at all.
2. **Migration**: extend `trg_agreements_lock_party_ids` so client roles cannot move a row
   **to** `active` (reject `NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active'` for
   `anon`/`authenticated`). Grep every client `.update(` on `clarity_agreements`
   (`src/app/data/agreements-service-real.ts`) first and confirm none sets `active`. Mark it
   `-- client-safe:` with that evidence.
3. Green, then the agreements regression lane on test.
4. Data check on prod (read-only): count of active agreements whose partner never signed — expected
   0; if not 0, list them privately for the founder before any change.
5. Codex review (`--effort high --sandbox read-only`), then prod apply on the founder's go, then a
   read-only re-probe with a control.

## Severity

**Medium** — a public false claim of a named person's consent; no data exposure; no evidence of use.

## Acceptance Criteria

- [x] Failing-then-passing integration test: a client cannot move an agreement to `active`; controls (accept path, expiry, termination, non-party refusal) green
  - **Evidence (2026-10-09, test project):** `e2e/integration/p1451-agreement-self-accept.spec.ts`.
    Before the migration: 4 failed (each self-activation returned no error), 5 passed (all controls).
    After `20261009180000`: 9/9 passed (JSON reporter: expected 9, unexpected 0, flaky 0). Defect tests
    cover the app's own insert, a partner-addressed pending row, the addressed partner skipping
    `accept_agreement`, and terminated/expired → active; each also reads the row back as service role
    and checks the public profile RPC.
- [x] Migration applied to test; agreements regression lane shows no failure caused by it
  - **Evidence (2026-10-09, test project, both migrations + the function change):** lane = 37 files
    that touch agreements (23 integration, 13 browser, plus this spec). Integration: the two guards'
    error text appears 0 times; every failure is an auth rate limit, an edge function absent or
    misconfigured on test, or a known teardown bug (`p857` signs a user in on the shared admin
    client). The rate-limited specs re-run alone: `p1451` + `p466` + `p1230`, 53/53. Browser (video
    off: the playwright ffmpeg binary is not installed): the 13 files with failures re-run with the
    trigger reverted to its P1230 body on test (15:19-15:55 UTC, re-applied and verified by a
    read-only catalog probe): 64 of 151 fail without the guards, 66 with; 0 fail only without; the
    2 that fail only with (`p483` TC-09, `p527` TC-05) were 30 s timeouts under load and pass alone
    with the guards in place (2/2).
- [x] Prod read-only data check recorded (active-without-partner count)
  - **Evidence (2026-10-09, prod, `scripts/supabase-readonly-sql.py`):** active 4 · active with
    `partner_signed_at` NULL **0** · active with no partner **0** · active and signed (control) 4 ·
    pending with a partner set 0 · all rows 6. Live trigger before apply: P1451 guard absent, P1230
    guard present (control).
- [x] Codex review at high effort, findings dispositioned
  - **Evidence (2026-10-09):** `~/.agents/bin/codex-review --effort high --sandbox read-only`, model
    `gpt-6.1-sol` (accepted-only), 1 of 1 reports received; raw output kept privately. Verdict: the
    activation guard is sound; REQUEST CHANGES for the wider invariant. Each finding was re-checked
    here before acting (failing tests on test, not the reviewer's word):
    1. **High — a party could rewrite what the partner accepted** (terms, visibility, signature time,
       displayed partner name) on an active row. **Fixed** in `20261009181000`: client roles may
       change only `status`, `terminated_at`, `terminated_by`. Red 8/8 + pending-terms case, then
       green; controls: terminate with its columns, an unchanged re-send.
    2. **Medium — the "co-signed" email could be triggered by a party for an agreement never
       accepted.** **Fixed** in `send-agreement-emails`: `accepted` requires `status = 'active'` for
       every caller, not only internal ones. Red (pending and terminated returned 200), then 403;
       control: active returns 200. The client's only `accepted` call follows a successful
       `accept_agreement` (`accept-agreement-page.tsx` ~L205).
    3. **Low — an unsigned, cancelled partner-addressed invitation counts as a past relationship**
       in `p878_relationship_scope`. **Not fixed here**: a different function (scope inference, not
       acceptance); creation already requires scope, so it retains rather than grants reach.
       Recorded in the private security log for a follow-up decision.
    4. **Low — the migration's assertions did not check the trigger's column list or WHEN clause.**
       **Fixed** in `20261009181000` (plus SECURITY INVOKER). That assertion first failed closed on a
       correct trigger (an empty `int2vector` casts to length 0, not NULL) and was corrected.
  - Full spec after both migrations: 23/23 on test.
  - **`/finish` review (2026-10-12)**, 1 reviewer (Sonnet) covering code, migrations and spec, 1 of
    1 reports; 10 findings, each re-checked against the code before acting. Founder chose to fix 1–5
    and 8 here:
    1. **Medium — status changes the app never makes were open** (creator marks an invitation
       declined; active → expired/declined; rewrite how an ended agreement ended; name the other
       party as having ended it; stamp an end time without ending). **Fixed** in `20261009182000`:
       client roles move only pending → expired, pending → terminated, active → terminated, and
       `terminated_by` / `terminated_at` change only when ending and only to the caller. Red 6/6,
       then green; controls: partner ends as themselves, `decline_agreement` still declines.
    2. **Medium — the other notification actions ignored state.** **Fixed**: one gate in
       `send-agreement-emails` — invitation/resend need pending, accepted active, declined declined,
       terminated terminated — placed after the party check so a non-party learns nothing. It answers
       `{"error":"Forbidden","reason":"state"}` (the P1178 test's `Forbidden` kept). Red 4/6 (the two
       `accepted` cases were already 403 under the old wording), then green; controls: accepted on
       active and terminated on terminated return 200.
    3. **Medium — the P857 version pin was relied on but not asserted.** **Fixed**: the migration
       asserts both triggers are enabled, unconditional BEFORE UPDATE row triggers on every column;
       a test confirms a party's `agreement_version` write stays pinned.
    4. **Low — refusals asserted only the error code** (RLS also returns 42501). **Fixed**: every
       refusal also matches its guard's message.
    5. **Low — one sign-in per test hit the auth rate limit.** **Fixed**: one cached session per user.
    6–7, 9–10 **Low — not changed**: the 200 controls depend on the mail provider (accepted);
       definer RPCs through the trigger are covered by the regression lane plus the new decline
       control; the reservation stub's deletion lands with the real spec (checked at ship); the
       migrations' mechanism text is public once shipped, after the prod fix.
    8. **Low — stale Summary / Root Cause.** **Fixed** above.
  - Full spec after the third migration and function change: 37/37 on test (with `p1230` and the
    edge-function authz spec: 77 passed; the 2 failures there are other functions' 401 checks,
    failing since before any change in this branch).
- [x] Prod apply on the founder's go; read-only re-probe with a control
  - **Second apply (2026-10-12, founder go after a clean browser control run):** `migrate.sh --env
    prod --only 20261009182000_…` from the committed blob (`--expect-sha HEAD`), prod smoke 8/8;
    `send-agreement-emails` (per-state gate) deployed, function smoke 1/1. Re-probe
    (`supabase-readonly-sql.py --env prod`): ledger latest `20261009182000`, all 3 P1451 versions
    present; all 8 guard strings in the trigger function; SECURITY INVOKER; both
    `agreements_lock_party_ids` and `pin_agreement_version` bound as enabled BEFORE UPDATE row
    triggers with no column list and no WHEN. Controls: `authenticated` keeps UPDATE,
    `accept_agreement` keeps EXECUTE. Same limit as below for the function: behaviour verified on
    test, deploy only on prod. Manifest `[prod]` hand-stamped (migration + function hash).
  - **Evidence (2026-10-12):** founder go in session. `migrate.sh --env prod --only` both migrations
    from committed blobs (`--expect-sha HEAD`); prod smoke 8/8. `send-agreement-emails` deployed to
    prod. Re-probe (`supabase-readonly-sql.py --env prod`): both new guards present, function is
    SECURITY INVOKER, trigger binding unconditional on every UPDATE; controls — both P1230 guards
    present, P857 pin trigger present, `authenticated` keeps UPDATE, `accept_agreement` keeps
    EXECUTE; ledger holds exactly `20261009180000`, `20261009181000` after 20261009170000. Before the
    apply the same probe showed both guards absent. **Limit:** the edge function's behaviour is
    verified on test (red, then 403; control 200); on prod only its deploy is confirmed, since a
    behavioural probe there needs a prod write.
  - Manifest `[prod]` stamped by hand on this branch (the worktree cannot run the stamp script).
