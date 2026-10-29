---
status: qa
type: task
rank: 82
workstream: infrastructure
created_date: '2026-10-29'
tags: [testing, migrations, self-hosted]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, spec-review, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1591: Database updates and tests follow the active TEST server

## Problem

**Situation:** Since P1557 the local dev server and `.env.test.local` point at the self-hosted TEST
server (`flip-test-env.py status` reports `selfhosted`). Playwright already reads `.env.test.local`
(`playwright.config.ts:17`). Since `7b98c9e88` (2026-10-27) plain `migrate.sh` applies to **both**
TEST databases, hosted first.
**Complication (verified 2026-10-29 from the P1576 transcript and git):** the P1576 worktree's HEAD
`d30dad0c4` did not contain `7b98c9e88`, so its own copy of `migrate.sh` was the old hosted-only one.
Plain `./scripts/migrate.sh` there printed "applied to local" (hosted TEST) and never touched
self-hosted; the output was piped through `tail`, so nothing said so. Prod got the 8 migrations via
`--env prod --only`. Nothing downstream (ship, push) compares prod against the active TEST, so the gap
surfaced only as "Could not load messages" on localhost:5001. Separately, `supabase-readonly-sql.py
--env test` always reads hosted TEST (`resolve()` reads `.env.local`), and one integration test uses it.
**Question:** How do migrations and test-side SQL reach the active TEST server by default, and how is a
miss caught even when a stale script copy runs?

> Founder framing, verbatim: "future agents, current or future agents, should be applying things to new test server too, right?"
> Decision: option A, self-hosted TEST only ("ok yes lets do it", 2026-10-29).

## Appetite

Blast radius: every TEST migration and every test-side SQL read. Reversibility: git revert, plus
`flip-test-env.py hosted`. Decision density: one, made (A).

## Invariants

- The active TEST is read from one place: `flip-test-env.py active` (the flip state of the main
  checkout's `.env.test.local`). No script types its own default.
- **Fail closed:** missing file, `unknown` state, or an unreadable file is an error before any network
  call. Nothing falls back to hosted.
- Hosted TEST is reached only by the explicit `--env hosted-test` (migrate.sh, readonly SQL).
- Drift controls never write a ledger (epistemic gate 2b): the comparator is proved on injected lists.

## Solution

1. **Resolver.** `flip-test-env.py active` prints `selfhosted` or `hosted`, exit 0; anything else exit 2
   with the reason. `scripts/lib/active-test.sh` wraps it (`active_test_target`).
2. **`migrate.sh`.** No env / `--env test|local`: resolve the active TEST. `selfhosted` → hand over to
   `selfhosted/migrate.sh` only (hosted untouched). `hosted` → the hosted path. `--env hosted-test` →
   the hosted path, explicitly (the old dual-door is removed). `--only` on TEST while self-hosted is
   active → refused with the command to use (self-hosted has no `--only`). `--env selfhosted` unchanged.
   Running from a worktree whose `scripts/migrate.sh` differs from main's prints a loud WARNING (the
   P1576 cause) — warning, not refusal, so editing migrate.sh in a worktree stays possible.
3. **Readonly SQL.** `supabase-readonly-sql.py --env test` follows the active TEST: self-hosted →
   read-only psql on the VM (`default_transaction_read_only=on`, same IAP path as selfhosted/migrate.sh,
   SQL on stdin); `--env hosted-test` → the old hosted path. Output shape unchanged, so callers
   (e2e `p1532`) need no edit.
4. **Drift check.** `scripts/check-test-drift.sh`: versions in prod's ledger (`pl_fetch_prod_versions`)
   missing from the active TEST ledger (new `selfhosted/migrate.sh --applied` prints applied versions).
   Pure comparator mode `--prod-file A --test-file B` for controls. Called by `git-ops.sh` ship and
   push paths as a **non-fatal warning** with the fix command; these run from the main checkout, so a
   stale worktree copy cannot skip it.
5. **Guard.** A pre-commit-run test fails when a script outside a fixed allowlist (today's readers)
   newly contains the hosted TEST ref or reads `TEST_SUPABASE_*`/`HOSTED_TEST_*`.
6. **Docs.** `docs/technical/database.md` (and the migration section of any doc naming "TEST") name the
   resolver. `.claude/rules/` edits are out of scope here (they need the claude-md gate).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A test that needs a credential self-hosted TEST lacks | ACCEPT | Superseded in part: decisions 2026-10-29 gave self-hosted TEST its AI and storage keys. Any remaining gap keeps a known-skip, never a hosted fallback |
| Hosted TEST drifts behind once nothing applies to it by default | ACCEPT | Consequence of A; `--env hosted-test` catches it up |
| gcloud login expired → every TEST migrate fails | ACCEPT | Loud failure is the invariant; message names `gcloud auth login` |
| A script still hard-codes hosted TEST | MITIGATE | Guard (5) ratchets new readers; existing ones are allowlisted, not fixed here |
| CI has no `.env.test.local` | ACCEPT | CI never runs TEST migrations; resolver failing closed there is correct |

**Non-Goals**
- Do NOT retire or delete the hosted TEST project. Do NOT change prod migration flow.
- Do NOT migrate the ~50 existing hosted-ref readers; only stop new ones.

## Done-When

- [x] `./scripts/migrate.sh --list` (no env) lists the self-hosted TEST ledger, and hosted is not contacted (shown by a stub/trace)
- [x] Resolver fails closed: missing file, `unknown` state each exit non-zero before any network call (3 controls)
- [x] `--env hosted-test` reaches the hosted path; `--only` on TEST with self-hosted active is refused
- [x] `supabase-readonly-sql.py --env test "select current_setting('transaction_read_only')"` answers from the self-hosted server
- [x] Drift comparator flags a prod-only version and passes when equal (injected lists, both controls); live run against prod vs self-hosted prints its verdict
- [x] Guard fails on a new script containing the hosted ref, passes on the current tree
- [x] Docs name the resolver

## Related

- P1557 (self-hosted TEST), P1584 (upkeep), P1576 (the incident).
- Spec review 2026-10-29: Gemini 4 Argon + Codex, 6 blocking, all verified by command and folded.
