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
- [ ] **Absorbed from P1066:** reports, per function, the *conjunction* of anon-executability and
      whether the function's identity guard actually refuses a genuinely unauthenticated call —
      verified **behaviorally** (invoke it unauthenticated on test, assert a refusal rather than a
      success), not by reading the guard text. A finding only exists in the conjunction: a
      degenerate guard on a function with no anon grant is not a vulnerability, and an anon grant
      on a correctly-guarded function is the product working. Two half-signals in two scripts
      force a human to perform that join every morning, which is how a signal gets tuned out.
- [ ] Guard-shape findings **report and baseline only**; grant drift keeps the gating exit code.
      `rls-drift-check.py` already has this split (`FAILING_DIRECTIONS` is a subset of all
      directions) — reuse it rather than letting a noisier heuristic drag the whole check into
      suppression.

> **Why this landed here rather than in P1066** (adversarial review, 2026-08-13): P1066 originally
> proposed a grep over migration text to stop the recurrence. That was withdrawn — the unsafe form
> and P1053's sanctioned fix are textual siblings, the house idiom routes identity through a
> variable (22 assignments across 18 files), and two of the three known instances never appeared in
> migration text at all. This check already reads the live catalog and already blocks on P1064's
> allowlist; the guard question needs the same query and the same allowlist. Two specs blocked on
> one artifact reading one catalog are one spec.
