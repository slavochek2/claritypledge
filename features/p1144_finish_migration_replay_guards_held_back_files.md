---
status: backlog
type: task
rank: 103
created_date: '2026-08-21'
tags: [migrations, rls, security, idempotency]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
severity: medium
feature_type: backend
---

# P1144: Finish the migration replay guards P1132 held back

## Problem

**Situation:** [P1132](p1132_migration_chain_cannot_replay_from_empty.md) added idempotency
guards to 6 migration files so a from-empty database build doesn't error out. 4 of 6 are
committed and verified. The remaining 2 — `supabase/migrations/20251218_p19_3_idea_feed.sql`
and `supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql` — have their
guard SQL already written and verified working live (via `supabase start` from an empty
database, this session), but committing them requires an `-- intentionally-public:` RLS
annotation to pass the P1039 pre-commit gate, and that determination is a security call
outside P1132's guard-only scope. P1132 tried to make that call anyway on 2026-08-21, got it
wrong (cited the wrong precedent — an adversarial review caught it before it shipped), and
reverted.

**Complication:** The correct answer to "is this policy intentionally public" now depends on
work that hasn't happened yet, tracked by two separate items — not this spec's to resolve,
only to wait on and then finish.

**Question:** Once those two things resolve, commit the already-written guard SQL and confirm
the full from-empty chain — P1132's original goal — actually works end to end.

## Appetite

Low blast radius (2 files, guard-only, same inert-on-live-DB argument as P1132's Appetite).
High reversibility (`git revert`). Zero decision density for THIS spec — the only open
questions belong to the two blocking items below, not here.

## Solution

1. Wait on [P1139](p1139_idea_feed_insert_policies_unconditional.md)'s `/reproduce` to
   determine, per policy, whether each of the 7 RLS policies in
   `20251218_p19_3_idea_feed.sql` is genuinely anonymous-by-design or needs scoping. Once
   settled, write the `-- intentionally-public:` (or scoped) annotation truthfully and commit
   the already-written publication-membership guards.
2. File and run `/reproduce` on the untriaged finding logged at
   `.private/docs/security-log.md` 2026-08-21 ("clarity_sessions_creator_update grants
   broader access than its documented intent") — not yet a P-number. Once settled, annotate
   and commit the already-written guards in `20260223_p396_host_rls_and_session_constraints.sql`.
3. Re-run the full from-empty `supabase start` verification P1132 did for the other 4 files,
   confirming the complete 6-file guard set (P1132's original scope) works together.

## Risks / Non-Goals

### Risks

- **Re-deciding the security question here instead of waiting for it.** Mitigation: this
  spec's Done-When is gated on the other two items actually resolving first — do not write an
  `intentionally-public` annotation from inference or precedent-matching; only from what
  `/reproduce` or the private-log item's own triage actually establishes.

### Non-Goals

- Do NOT re-litigate P1132's own guard SQL — it is already written and verified; this spec
  only unblocks committing it.
- Do NOT perform the RLS security triage inside this spec. That belongs to P1139 (already
  filed) and a new bug spec for the `clarity_sessions_creator_update` finding (not yet filed
  — file it via `/create-bug` when picking this up, referencing
  `.private/docs/security-log.md` 2026-08-21).

## Done-When

- [ ] `20251218_p19_3_idea_feed.sql`'s publication-membership guards are committed with a
      truthful annotation, sourced from P1139's `/reproduce` outcome
- [ ] `20260223_p396_host_rls_and_session_constraints.sql`'s guards are committed with a
      truthful annotation, sourced from a proper `/reproduce` on the `clarity_sessions_creator_update`
      finding
- [ ] `supabase start` applies the full from-empty chain including all 6 P1132-scope guarded
      files with zero errors (subject to P1132's own remaining P1054 dependency for
      `ml_training_sessions`), wall-clock recorded here
