---
status: today
type: task
rank: 1000978.0
created_date: '2026-08-13'
tags: [security, grants, ci, drift]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1065: no gate can see function-grant drift — the entire P1063 class was invisible

## Problem

**Situation:** P1063 found four RPCs executable by unauthenticated callers on prod. Every one
already carried a lockdown in its migration. The lockdown had never taken effect.

**Complication:** Nothing in this repo could have detected that. `scripts/rls-drift-check.py`
compares **policies** between live prod, live test and migration files. Nothing reads
`pg_proc.proacl` or `has_function_privilege()`. Grepping the migrations is actively misleading: the
ineffective form and the working form are textually near-identical, and the ineffective one raises
no error. The defect was found by accident, while verifying something else.

**Question:** Make this class detectable, so the next instance is caught by a gate rather than by luck.

## Appetite

Low blast radius (a read-only check). Reversible. Decision density: zero — this detects, it does
not change behaviour.

## Approach

Extend the existing drift check, or add a sibling, that reads actual EXECUTE privileges for `anon`
and `authenticated` on every `public` function on both live databases and diffs them against
P1064's committed allowlist. Fail on any function anon-executable but not allowlisted; fail on
prod/test divergence. Wire into `/day` alongside the RLS drift check.

## Risks / Non-Goals

### Risks

- **A gate nobody has watched fail is not protection** (epistemic gate 7). MITIGATE: exercise the
  failure path — grant anon on a throwaway function, confirm non-zero exit, revoke — and paste the
  exit code. P1063's own regression test was validated exactly this way.
- **Noise causing the check to be ignored.** MITIGATE: allowlist-driven, so a correct state is
  silent.

### Non-Goals

- Do **NOT** auto-revoke anything. Detect and report; revoking is a human decision.
- Do **NOT** ship before P1064's allowlist exists — without it there is no baseline and the check
  can only flag everything or nothing.

## Done-When

- [ ] Check reads live EXECUTE privileges for anon/authenticated on both prod and test
- [ ] Diffs against P1064's allowlist; fails on unlisted anon-executable functions
- [ ] Fails on prod/test divergence
- [ ] **Watched to fail**: failure path exercised, non-zero exit pasted into the spec
- [ ] Wired into `/day` next to the RLS drift check
