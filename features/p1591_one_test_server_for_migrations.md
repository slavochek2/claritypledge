---
status: week
type: task
rank: 82
workstream: infrastructure
created_date: '2026-10-29'
tags: [testing, migrations, self-hosted]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1591: Database updates and tests follow the active TEST server

## Problem

**Situation:** Since P1557 the local dev server, `.env.test.local` and `.env.development.local` point
at the self-hosted TEST server (`flip-test-env.py status` reports `selfhosted`).
**Complication:** `migrate.sh` with no `--env` (or `--env test`) still applies to the old hosted TEST
project, and the P1576 integration and E2E runs used the hosted keys from `.env.local`. P1576's 8
migrations reached hosted TEST and prod but not self-hosted TEST, so every chat on localhost:5001
failed with "Could not load messages" (400 on `chat_messages`) until they were applied by hand
(2026-10-29). Nothing tells an agent which TEST is the active one.
**Question:** How do migrations and test runs reach the active TEST server by default, every time?

> Founder framing, verbatim: "future agents, current or future agents, should be applying things to new test server too, right?"
> Decision: option A, self-hosted TEST only ("ok yes lets do it", 2026-10-29).

## Appetite

Blast radius: every migration and every test run. Reversibility: git revert, plus `flip-test-env.py hosted`.
Decision density: one, made (A).

## Invariants

- The default TEST target is read from one place (the flip state), never typed per script.
- A migration run that cannot reach the active TEST fails loudly; it never falls back to another server.

## Solution

- `migrate.sh` with no env / `--env test` applies to whichever TEST the flip state names (today: self-hosted).
  Hosted TEST becomes an explicit opt-in only.
- Test helpers and the integration/E2E configs read TEST URL and keys from the same active source, not `.env.local` `TEST_*`.
- `/ship` and `/push` drift checks report a migration that prod has and active TEST lacks.
- The docs and rules that say "TEST" name the active-server lookup.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Self-hosted TEST lacks AI and storage keys (founder rule), so some voice and Mirror tests cannot pass there | ACCEPT | Already recorded (decisions 2026-10-28); those tests keep their known-skip, not a hosted fallback |
| A script still hard-codes hosted TEST | MITIGATE | Grep every `TEST_SUPABASE`/hosted URL reader; add a guard test that fails on new ones |

**Non-Goals**
- Do NOT retire or delete the hosted TEST project.
- Do NOT change prod migration flow.

## Done-When

- [ ] `./scripts/migrate.sh --list` (no env) lists the self-hosted TEST ledger
- [ ] An integration test run with no extra env vars hits the self-hosted URL (shown in its output)
- [ ] A migration on prod but missing on active TEST shows up in the ship drift check, proved with a control
- [ ] A guard fails when a new script reads hosted TEST keys directly

## Related

- P1557 (self-hosted TEST), P1584 (upkeep), P1576 (the incident).
