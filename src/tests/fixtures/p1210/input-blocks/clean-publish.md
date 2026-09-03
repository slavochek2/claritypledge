# Fixture — publish.md shape with every input in Stage 0 (P1210 DW-16 must-pass)

## Stage 0 — Pre-flight

<!-- input-block:start -->
- **The event tag** — one per run. Ask if not supplied; never invent one.
- **The filing identity** — the account that owns `points.first_validator_id`.
<!-- input-block:end -->

## Stage 1 — Resolve

Resolve `subject_key` to `agent_accounts.profile_id`, exact match. Any miss halts.

## Stage 5 — Write

Print the payload as a dry run and write only after an explicit founder affirmative. <!-- must-stay-gate -->
