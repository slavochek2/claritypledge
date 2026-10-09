---
status: week
type: task
rank: 27
workstream: security
created_date: '2026-10-09'
tags: [security, migrations, p1321]
disclosure: embargo
delivery_stage: create-spec
pipeline_ran: [create-spec, inline]
flow: inline
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1448: Ship four definer-function guard fixes from P1321 to production

## Problem

**Situation:** P1321's security review produced four database fixes (one grant revoke, three
definer-function guards). They are applied to the test database and committed on P1321's branch,
which is parked: its broader design review returned No.

**Complication:** Production still runs the unfixed functions. The function-grant drift check
reports nine functions callable by signed-out visitors on prod and not on test, and it raises the
same alarm every morning. The fixes do not depend on the parked design — P1321's own assumption log
(§20) records that these four carry no frontend coupling and can be applied on their own, unlike a
fifth migration that stays held. A hand-run prod apply was refused by the agent harness, correctly:
the repo's path for prod migrations is `/push` step 2.5.

**Question:** Move exactly these four fixes, with their tests, onto main so the normal `/push` path
applies them to production.

> Founder framing, verbatim (2026-10-09, on approving the prod apply): *"yes apply it"* — and,
> after the hand-run apply was refused: *"you are in charge what they mean by blocked check
> yourself how how you're supposed to deal with this and reflect why do I need to be in the loop"*

## Appetite

Blast radius: signed-in and signed-out callers of the affected functions. Reversibility: each fix
is a revoke or a guard; a re-grant or the prior function body restores it. Decision density: zero —
decided above.

## Invariants

- **Schema before code** (P1211): the four migrations reach prod through `/push` step 2.5, which
  applies exactly the migrations the pushed SHA carries — never by a hand-run `migrate.sh`.
- **Both revoke forms** (P1066): a revoke covers the role-direct grant and PUBLIC.
- The held fifth migration (`20261008220000`) is NOT part of this spec.

## Solution

Bring the four migration files and their tests from P1321's branch, byte-identical (verified by
blob hash), plus the allowlist line and test updates the first one carried. Record them in the test
section of the deploy manifest. Commit subjects describe the work in roles, not the defects
(embargo). Ship to main; `/push` applies them to prod.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A fix refuses a legitimate prod caller | MITIGATE | Each migration's header records its client-safety reasoning; prod smoke runs after the apply |
| Commit text discloses a live hole before prod is fixed | MITIGATE | Neutral subjects; `/push` applies migrations before the push, so prod is fixed before publication |

**Non-Goals**
- Do NOT bring any other P1321 work (design docs, audit scripts, the held migration).
- Do NOT apply anything to prod from this branch by hand.

## Done-When

- [x] The four migration files are byte-identical to P1321's branch copies (blob hashes compared against the w5 branch copy: all four identical)
- [x] Their integration suites pass on **test** (79/79 expected, 0 unexpected, 0 flaky; JSON reporter). `[post-deploy]` the grant drift check shows the nine functions no longer anon-executable on prod.
- [x] Pre-commit checks pass on the branch (the commit carrying this tick ran them)

## Related

- P1321 (parent, parked) — assumption log §20 is the source of the split
