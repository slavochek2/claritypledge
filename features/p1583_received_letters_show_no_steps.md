---
status: week
type: bug
rank: 82
workstream: letters
created_date: '2026-10-27'
tags: [letters, artifacts, p1545, rpc]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: anomaly
---

# P1583: Letters sent to me never show "N of M steps" on Artifacts

## Problem

> Founder framing, verbatim: *"whatever you do, better act as orchestrator and spin up sub-agents
> for directing them with Sonnet and so on, and then review with Gemini Argon, Opus and if needed,
> Codex"* (found while repairing the P1545-stale browser tests, P1580).

**Situation:** P1545 (shipped and live 2026-10-27) specifies that a letter sent to me shows its
progress on the Artifacts card: "<name> sent you this letter", **"N of M steps"**, unread dot, Open
(`features/done/2026-06-10/p1545_menu_and_artifacts.md:231`, and `:266` "From Tom · 2 of 5 steps").

**Complication:** The client maps `steps_completed` and `total_steps` from the received-letters
page (`src/app/data/letters-received.ts:25-26`), but the latest definition of
`get_received_letters_page` (`supabase/migrations/20261023110000_p1545_chat_letter_delivery_id.sql`)
returns neither column, so both are always `undefined` and the steps never render. The guarding e2e
test (`e2e/p699-inbox-progress.spec.ts`, received-side step count) fails on main for this reason.

**Question:** Return the step counts from the RPC so the card shows what P1545 specified.

## Appetite

Blast radius: low-medium (one RPC's return shape; additive columns, existing clients ignore them).
Reversibility: high. Decision density: none.

## Solution

A new migration redefining `get_received_letters_page` byte-for-byte from its latest definition,
adding `steps_completed` and `total_steps` computed the same way the sent side computes a
recipient's "N of M steps" (reuse that expression; do not invent a second definition of a step).
Every existing guard, filter, ordering and grant stays. Annotate `-- client-safe:` (additive columns).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The redefinition drops a guard from a stale base (P952 class) | MITIGATE | Copy from the latest definition; diff old vs new body; the SD-guard canary must stay green |
| Changing RETURNS TABLE needs DROP FUNCTION | MITIGATE | Drop and recreate in one migration with grants restored; client-safe because columns are only added |
| "Step" counted differently from the sent side | MITIGATE | Reuse the sent side's expression; a test compares both for one delivery |

Non-goal: any UI change; the card already renders the counts when present.

## Done-When

- [x] Migration applied on TEST; `get_received_letters_page` returns `steps_completed` and `total_steps` — both TEST databases (self-hosted via `migrate.sh --env selfhosted`; plain `migrate.sh` reports it already applied on hosted)
- [x] A test proves a received in-progress letter returns the same N and M the sender sees for that delivery — the e2e below asserts the receiver's "1 of 3 steps" for the delivery whose sender view the P699 canary asserts as "1 of 3 steps"; Opus confirmed the expression is token-identical to the sender side
- [x] `e2e/p699-inbox-progress.spec.ts` received-step test passes, and fails with the new columns removed — self-hosted TEST 2026-10-28: fixed 1 passed; keys forced to NULL 1 failed; restored 1 passed
- [x] SD-guard canary and unit suite green — sd-guard 2 passed; full unit suite green in pre-commit
- [x] Reviewed by Gemini, Codex and an Opus adversary (migration); findings resolved or recorded — 3 of 3; Opus MEDIUM (malformed snapshot errors the page) and LOW (provenance) fixed; LOW "0 of 0 steps" for a letter with no stories set aside (needs a sealed letter with no snapshots); Gemini confirmation of the final file clean; receipt written
