---
status: qa
type: task
disclosure: public
rank: 82
workstream: keyring
created_date: '2026-09-14'
tags: [security, credentials, least-privilege, supabase]
related: [p1214, p1239, p1207, p1048]
delivery_stage: dev
pipeline_ran: [create-spec, dev, fix]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1313: The daily drift checks did read-only work on a token that can manage production

> Carved out of [P1214](p1214_credential_separation_and_privilege_reduction.md) on 2026-09-14.
> P1214 owns credential reach as a whole and stays open; this is the one slice that landed,
> so it gets its own closure rather than ticking a spec with twelve open items.

## Problem

**Situation:** Two checks run every morning inside `/day-cp` and ask a read-only question —
*has any policy or privilege drifted open?* Both authenticated with the platform management
token, which is **account-wide** and can manage the production project outright.

**Complication:** [decisions.md 2026-09-08](../docs/decisions.md) settled how to fix that. Putting
the daily path behind P1239's per-access prompt would cost ~14 confirmations a week against the
~10/week ceiling P1239 itself sets — and, more to the point, would be **compensating for the
over-permission instead of removing it**. The founder's decision: reduce what the checks can do.

> Founder framing, verbatim: *"reduce the daily checks' privilege rather than prompt for it"*

**Question:** Does the provider offer a read-only credential suitable for this, and what breaks
when the checks are moved onto it?

## Solution

Two independent layers, both verified live before use:

| Layer | What it does | State |
|---|---|---|
| `/database/query/read-only` endpoint | Executes as `supabase_read_only_user` in a read-only transaction; the server refuses DDL (SQLSTATE 25006) | **Landed** |
| Project-scoped `Database: Read` token | Removes the account-wide reach itself | **Open — dashboard step** |

Both scripts prefer `SUPABASE_READONLY_TOKEN` and fall back to the account-wide token
**visibly**, printing the over-permission on every run so a half-done reduction cannot go quiet.

### The finding that makes this spec worth reading

The switch silently blinded the detectors. `information_schema.table_privileges` and
`.column_privileges` are **role-filtered** — under the reduced role they return zero rows for
the grantees these checks ask about. Both checks **pass on an empty result**, so the reduction
would have made them report *"floor holds"* on a wide-open database. No error, no output diff,
exit 0.

It survived the obvious test: every real query returned 0 rows before and 0 after, scoring
IDENTICAL. Only a **known-bad control** exposed it — a query for SELECT, which `anon`
demonstrably holds, returned **100 rows as `postgres` and 0 as the read-only role**.

An independent review then found the first fix (raw `relacl`/`attacl`) was itself incomplete:
raw ACLs are not *effective* privileges. Final form uses `has_table_privilege` /
`has_any_column_privilege`, which resolve ownership, NULL ACLs and role inheritance in one call.

## Invariants

- **A check that cannot see must never report "all clear".** Both oracles prove liveness against
  a grant known to exist before any empty result is trusted; zero there is exit 2, never exit 0.
- **Never soften a detector to fit a weaker credential.** If the credential cannot answer the
  question, the check fails loudly — it does not narrow the question.
- **Reducing one consumer's credential must not silently change another's.** The resolver is
  shared by dynamic import; callers state in writing which credential they need.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The account-wide fallback becomes permanent | MITIGATE | Printed on every run; self-cancels when the scoped token is set |
| `function-grant-drift-check.py` breaks when the scoped token lands | **MITIGATED** | Pinned to the account-wide token explicitly; verified with a scoped token present |
| A future edit "simplifies" back to `information_schema` or raw ACLs | MITIGATE | Both traps documented at the query site with measured numbers |

**Non-Goals**
- Do NOT migrate `function-grant-drift-check.py` here — its guard leg runs `SET LOCAL ROLE anon`,
  which the read-only role cannot assume, and a read-only refusal would be indistinguishable from
  a guard refusal. Stays with P1214.
- Do NOT issue the scoped token here — dashboard step, founder-only. Stays with P1214.

## Done-When

- [x] Provider verified to offer a read-only credential suitable for policy inspection; the
      fallback recorded rather than silently chosen (decisions.md 2026-09-14)
- [x] Both checks run on `/database/query/read-only`; DDL refusal observed (SQLSTATE 25006)
- [x] Privilege queries no longer read role-filtered views; verdict output **byte-identical** to
      the pre-change version on test AND prod
- [x] Detection uses effective-privilege functions, covering ownership, NULL ACLs and inheritance
- [x] Both table and column oracles prove liveness before an empty result is trusted; blinded
      detector exits 2, observed
- [x] Real violation still exits 1, observed; operational failure exits 2, observed
- [x] `function-grant-drift-check.py` verified still running on the account-wide token with
      `SUPABASE_READONLY_TOKEN` set
- [x] Independent review run (Codex), findings verified by command, all fixed, re-reviewed
- [x] `core.bare` asserted false by a mechanical check (12-case matrix), wired where it can
      actually fire

## Related

- **Parent:** [P1214](p1214_credential_separation_and_privilege_reduction.md) — owns the scoped
  token and the third consumer; stays open.
- **Sibling:** [P1239](p1239_encrypt_the_critical_credential_half_with_per_access_unlock.md) —
  owns the per-access lock this deliberately does NOT apply to the daily path.
- **Subjects:** P1207 (privilege floor), P1048 (RLS drift) — the two checks moved.