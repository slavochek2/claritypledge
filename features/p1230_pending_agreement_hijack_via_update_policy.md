---
status: week
type: bug
rank: 1000066
severity: high
workstream: infrastructure
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: fable
exec_effort: high
tags: [security, rls, agreements, privilege-escalation]
delivery_stage: create-bug
pipeline_ran: [create-bug, inline]
driver: anomaly
---

# P1230: a pending agreement can be taken over through the table UPDATE policy

## Summary

The agreements table's UPDATE policy admits callers who are not a party to the row while it is
pending, and only checks that the row names the caller *after* the write. A signed-in stranger
who knows a pending agreement's id can therefore write themselves in as the partner — the
invitation token is never consulted. Separately, a legitimate party can reassign either party
id, which the acceptance flow never intended. Found while writing P1222's policy migration;
confirmed by the founder against the migration text.

## Root Cause

The P422 UPDATE policy (`supabase/migrations/20260225150000_p422_fix_update_rls_with_check.sql`,
re-issued by `20260225180000`) was written so that the invite-acceptance page could update the
row before the partner had a profile id. Acceptance later moved to the `accept_agreement`
SECURITY DEFINER RPC (P443/P453), which checks the token server-side — but the policy kept its
acceptance-era branch. Row-level security cannot compare NEW to OLD, so nothing stopped a party
from rewriting `creator_profile_id` / `partner_profile_id` either. Exact predicate, prod/test
divergence and the reproduction transcript: `.private/docs/security-log.md` § 2026-09-01 (P1230),
per the disclosure rule in CLAUDE.md.

**Drift, recorded:** the test project already carries a parties-only USING/CHECK for this policy —
out-of-band, in no migration. Prod has the P422 predicate. The migration here asserts the final
state so it is correct from either starting point.

## Reproduction Steps

1. On TEST, create a pending agreement as service_role (fixture helper), and two users: the
   creator and a stranger.
2. Sign in as the stranger; `PATCH /rest/v1/clarity_agreements?id=eq.<id>` with
   `{ partner_profile_id: <stranger> }`.
3. Against the prod-shaped policy the row changes; against test's out-of-band policy it does
   not (0 rows) — that half is not reproducible on test without writing the prod policy there.
4. What **does** reproduce on test today: sign in as the creator and `PATCH`
   `partner_profile_id` to any profile → 1 row written; sign in as the partner and `PATCH`
   `creator_profile_id` → 1 row written; anon `PATCH` → 0 rows, no error (anon holds the UPDATE
   grant; only the policy stops it).

**Reproduction rate:** 100% for step 4 on test (integration test, 2026-09-01: 3 failed / 6 passed
before the fix); step 2 is prod-only by policy text.

## Expected Behavior

Only the creator or partner can update an agreement row, the result must still name them, and
neither can change who the parties are. Becoming the partner happens only through
`accept_agreement()` with the token. Anonymous callers hold no UPDATE grant.

## Actual Behavior

See Reproduction. On prod any authenticated caller can claim any pending agreement by id; on
both environments a party can reassign either party id; anon writes fail only by policy.

## Affected Files

- `supabase/migrations/20260902001000_p1230_agreements_update_parties_only.sql` (new)
- `e2e/integration/p1230-pending-agreement-hijack.spec.ts` (new)
- No client change: every client UPDATE path (`agreements-service-real.ts` — lazy expiry,
  resend, cancel, terminate) is issued by a party; acceptance already uses the RPC;
  `send-agreement-emails` rotates the token as service_role.

## Severity

**High** — authenticated takeover of another user's pending agreement on prod without the
invitation token. Narrowed (not closed) by P1222, which stops pending agreement ids from being
publicly listable.

## Invariants

- Party ids on an agreement are written only by the acceptance RPC (SECURITY DEFINER, token
  checked) or by service_role — never by an RLS-subject role.
- The UPDATE policy on agreements carries no status- or token-based branch; token semantics
  live in `accept_agreement` / `decline_agreement` only.
- `anon` holds no UPDATE grant on the agreements table.

## Fix Approach

One migration, three layers (policies cannot see OLD):

1. Policy: `USING` and `WITH CHECK` both = creator or partner by `auth.uid()`, `TO authenticated`.
2. Trigger `agreements_lock_party_ids` (BEFORE UPDATE): when `current_user` is `anon` or
   `authenticated`, refuse any change to `creator_profile_id` / `partner_profile_id` with
   `42501`. SECURITY DEFINER RPCs run as their owner and service_role is not an RLS role, so
   `accept_agreement` and the edge functions are unaffected.
3. `REVOKE UPDATE ON clarity_agreements FROM anon` — client-safe: the policy already yielded
   zero rows for anon (`auth.uid()` is NULL).
4. A `DO` block asserts the final predicate, role list, trigger and grant, so the file is a fix
   on prod and an idempotent no-op-plus-guard on test.

**Enumerated legitimate UPDATE paths** (all still pass — controls in the test): creator cancels
(`status=terminated`), creator resends (rotates token/expiry), partner terminates, party lazily
expires an overdue pending row, invitee accepts via `accept_agreement()`.

**Rejected:** moving acceptance back to a client PATCH with a token branch in the policy — that is
the bug. Also rejected: a column-level `REVOKE UPDATE (creator_profile_id, partner_profile_id)
FROM authenticated` instead of the trigger — PostgREST returns 42501 for the whole PATCH only when
those columns are named, which is the same effect, but it would also block a future definer-less
path and gives no error message naming the rule; the trigger is explicit. Either would do.

## Acceptance Criteria

- [x] `e2e/integration/p1230-pending-agreement-hijack.spec.ts`: 3 failed / 6 passed on TEST before
      the migration (anon silent 0-row update; creator reassigned `partner_profile_id`; partner
      reassigned `creator_profile_id`), 9 passed after (`d011deda`). The stranger-hijack test is
      green before on test only because of the out-of-band policy — red against the prod predicate
- [x] Controls pass: creator cancels, creator resends, partner terminates, invitee accepts via RPC,
      party lazily expires
- [x] `anon` UPDATE on the table returns 42501 (grant), not a silent 0-row update
- [x] Migration's `DO` block passed on TEST; `pre-commit-checks.sh` green on `d011deda`
      (TypeScript ✓ ESLint ✓ Build ✓ Tests ✓, client-safety + RLS scoping + migration-applied gates)
- [x] `.private/docs/security-log.md` carries the exact predicate (§ 2026-09-01 "P1230 built in w21")
- [x] The prod apply is fully specified as an ordered founder procedure — see
      § Prod apply (founder procedure, post-ship). **Reclassified, not waived** (2026-09-03):
      every step requires the branch to have shipped and `main` to have been pushed, so it
      cannot be satisfied on the branch. Left as a completion criterion it blocks its own ship
      forever. The step itself is unchanged and unskippable; prod still carries the P422
      predicate until it is run.

## Part B — the composed bypass (codex review, 2026-09-03)

Part A locked `creator_profile_id` / `partner_profile_id` with a BEFORE UPDATE trigger and exempted
`accept_agreement` because a SECURITY DEFINER body runs as the function owner. `status` and
`invitation_token` were left party-writable, so a party could reach the same outcome in five steps:
revert the row to `pending`; set an `invitation_token` of their choosing; hand it to any other
authenticated account; that account calls `accept_agreement`; the exempt RPC writes it in as the
partner. Codex also found part A's `DO` block asserted the *absence of substrings* in the policy
predicate, which `USING (true)` passes.

**Fix, in two migrations, because the release order matters.**

- `20260902001500` (**client-safe**, additive) — `accept_agreement` gains
  `AND (partner_profile_id IS NULL OR partner_profile_id = p_partner_id)`; body otherwise
  `20260813170000` § 5 verbatim. Plus `rotate_invitation_token(uuid)`: SECURITY DEFINER,
  creator-only, `pending`/`expired` only, EXECUTE to `authenticated` + `service_role`.
- Client (`2df58753`) — `resendInvitation()` calls that RPC, falling back to the old table PATCH on
  `PGRST202`.
- `20260902001600` (**`requires-frontend: 2df58753`**) — the trigger additionally refuses
  `NEW.status = 'pending' AND OLD.status <> 'pending'` and any change to `invitation_token`, for
  `anon`/`authenticated` only. Its `DO` block compares the deparsed policy predicate to the intended
  expression via `pg_get_expr` + whitespace-normalised equality, pins the trigger's `tgfoid`,
  row-level BEFORE UPDATE timing bits and `tgenabled`, joins `pg_namespace`, and asserts
  `authenticated` still holds UPDATE while `anon` does not.

A single migration was not possible: the trigger tightening breaks any bundle that still PATCHes the
token, and the RPC must exist before the bundle that calls it — the same A/B shape as P1222.

**Prod order:** apply `20260902001000` + `20260902001500` → deploy the client → apply
`20260902001600` (`migrate.sh` refuses it until `2df58753` is an ancestor of `origin/main`).

## Evidence (part B, 2026-09-03)

**Applied to TEST** from inside w21 via the Management API: `20260902001500`, `20260902001600`;
both `DO` blocks passed, both recorded in `supabase_migrations.schema_migrations`, both listed in
`supabase/deploy-manifest.json`. `pg_proc` confirms the accept guard text is live and
`rotate_invitation_token` is `prosecdef = true` with `anon` EXECUTE absent.

**Integration suite: 21 passed, 0 failed, 0 skipped** (`npx playwright test --project=integration
e2e/integration/p1230-pending-agreement-hijack.spec.ts`), up from 9. New coverage: the staged attack
step by step (a party cannot return an active *or* terminated row to `pending`; a party cannot write
`invitation_token`; `accept_agreement` refuses to displace an assigned partner even when handed a
valid rotated token, staged as `service_role`), the RPC's own authorization (non-creator → 42501,
active agreement → 42501, `anon` → 42501), and the false-positive group: an email-addressed accept,
a pre-assigned-partner accept, resend of a pending invitation, resend of an *expired* invitation,
cancel, terminate and lazy expiry.

**The guards were observed red, not only green** — each in a rolled-back Management API transaction
(no fixture leaked; verified by a follow-up count):

| Probe | With the old definition | With the shipped definition |
|---|---|---|
| creator PATCHes `status='pending'` + `invitation_token` on an active row | write succeeds | `42501` on both, row unchanged |
| a third party calls `accept_agreement` with a valid token on a row whose partner is set | returns `true`, partner replaced | returns `false`, partner unchanged |

**The `DO` block was observed failing** on the two shapes it exists to catch: replacing the policy
with `USING (true) WITH CHECK (true)` → `P1230-B2: UPDATE policy USING is true — expected
((creator_profile_id = auth.uid()) OR (partner_profile_id = auth.uid()))`; `DISABLE TRIGGER` →
`P1230-B2: trigger tgenabled=D — expected O`. Both inside rolled-back transactions.

**One test was rewritten, deliberately.** `control: the creator resends (rotates the token)` issued
the direct table PATCH that part B closes. It now calls `rotate_invitation_token`, and the PATCH it
used to make is asserted as refused in the new group. The spec changed; the test follows it.

### Browser check of the resend button (2026-09-03) — the gap this section used to name

Part B makes `invitation_token` unwritable from a table PATCH for `anon`/`authenticated`. The
resend button was the one legitimate caller that used to make exactly that write, so it is the
path most likely to have been broken by the fix — and the integration suite exercises the RPC,
never the button. `e2e/p1230-resend-invitation-render.spec.ts` drives it in a real browser:

```
npx playwright test --project=chromium e2e/p1230-resend-invitation-render.spec.ts --workers=1
  3 passed (16.8s)        exit 0
```

- the creator clicks **Resend Invitation**, gets the "Invitation resent" toast, and the row's
  `invitation_token` and `invitation_expires_at` have really changed — read back as
  `service_role`, because the DOM cannot show a rotated token;
- control: the invitee on the same agreement is offered Review & Sign and no resend button;
- control: the token does not change when nobody clicks, so the rotation above is the click.

**The gate was watched fail** (epistemic gate 7), and the failure is informative rather than
cosmetic. With the RPC name changed to one that does not exist — which forces the `PGRST202`
fallback into the old table PATCH — the click produces the failure toast and the token is not
rotated:

```
Locator: getByText(/invitation resent/i)   Expected: visible   element(s) not found
  1 failed
```

That is `20260902001600`'s trigger refusing the pre-P1230 write path from a real browser
session, which the integration suite could only assert through a raw PATCH. The source edit was
reverted immediately; `git status` shows `agreements-service-real.ts` unmodified.

**Not done here:** nothing applied to prod — see § Prod apply (founder procedure, post-ship).

## Prod apply (founder procedure, post-ship)

Prod still carries the P422 UPDATE predicate. This is the whole remaining work, and it is **not**
a branch completion criterion — every step needs the branch merged and `main` pushed first, which
is what made it unsatisfiable while it sat in § Acceptance Criteria. Run from the MAIN repo root
(`<cp-root>`), in this order, top to bottom. Do not reorder.

1. **Ship and deploy the client.**
   ```bash
   ./scripts/ship-gates.sh p1230      # expect exit 0 before shipping
   /ship p1230                        # merges feature/p1230-… into main; never pushes
   git push origin main               # founder action — the agent may not run this
   ```
   Wait for the Vercel production deploy of that commit to finish before step 2.
   **Why first:** `2df58753` moves resend onto `rotate_invitation_token`, and
   `20260902001600` turns the direct token PATCH the old client makes into a `42501`.
   Client live → then migrate.

   *Verify:* `git log origin/main --oneline -1` names the ship commit, `git merge-base --is-ancestor
   2df58753 origin/main` exits 0, and the Vercel deployment for that commit reads `Ready`.

2. **Apply all three migrations, one run.**
   ```bash
   ./scripts/migrate.sh --env prod    # review the pending list, answer y
   ```
   Applies in version order: `20260902001000` (parties-only UPDATE policy + party-id lock
   trigger + `REVOKE UPDATE … FROM anon`), `20260902001500` (`accept_agreement` partner guard +
   `rotate_invitation_token`), `20260902001600` (status-revert and token-write refusal).
   The gate is **all-or-nothing**: while `2df58753` is not an ancestor of `origin/main`,
   `20260902001600`'s `-- requires-frontend` marker exits the run 1 *before applying anything*,
   the two client-safe files included. Step 1 is what unblocks this; never delete the marker to
   force a partial apply (P886). If P1222 ships around the same time, its four migrations appear
   in the same pending list — that is fine, they are independent, but read the list before
   answering `y`.

   *Verify:* each migration's `DO` block asserts the final policy predicate, trigger identity and
   grant list at apply time, so a successful apply is itself the assertion. Re-run
   `./scripts/migrate.sh --env prod`; it should report no pending migrations.

3. **Verify the defect is closed on prod** — the reproduction from § Reproduction Steps step 2,
   with a pending fixture agreement and a signed-in account that is **not** a party to it:
   ```bash
   curl -s -X PATCH "$PROD_URL/rest/v1/clarity_agreements?id=eq.<pending id>" \
     -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer <stranger JWT>" \
     -H "Content-Type: application/json" -H "Prefer: return=representation" \
     -d '{"partner_profile_id":"<stranger profile id>"}'
   # expect: []   (no row matched the policy)
   ```
   Then repeat the same PATCH as the **creator** of that row — expect `42501` from
   `agreements_lock_party_ids`, not a silent success. A `200` with a row on either call means the
   policy or the trigger did not land; do not proceed, re-check step 2.

4. **Smoke the one legitimate write path in a browser:** as the creator of a pending agreement,
   click **Resend Invitation** and confirm the "Invitation resent" toast. A failure toast means
   the client fell back to the direct table PATCH — `20260902001500` did not apply, or the
   deployed client predates `2df58753`.

Paste steps 3 and 4's outputs into `.private/docs/security-log.md` § 2026-09-01 (P1230) when done.
