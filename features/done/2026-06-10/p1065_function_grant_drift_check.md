---
status: all-done
type: task
rank: 2
created_date: '2026-08-13'
tags: [security, grants, ci, drift]
pipeline_ran: [create-spec, dev, ship]
driver: anomaly
completed_at: 2026-08-18
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

- [x] Check reads live EXECUTE privileges for anon/authenticated on both prod and test
      — `scripts/function-grant-drift-check.py`, `has_function_privilege()` on both projects.
      First live run: prod 59 callable public functions / 30 anon-executable, test 62 / 32.
- [x] Diffs against P1064's allowlist; fails on unlisted anon-executable functions
      — 20 allowlist entries, **13 gating findings on prod**, exit 1.
- [x] Fails on prod/test divergence — direction `grant-differs`, gating. Zero live instances
      today (prod and test agree on every shared function); proven by fixture instead, which
      replays P1063's exact shape (revoked on test, still open on prod).
- [x] **Watched to fail**: failure path exercised, non-zero exit pasted into the spec.
      Full cycle against the **live catalog**, not fixtures:

      | step | command | exit |
      |------|---------|------|
      | real state, no baseline | `--no-probe` | **1** (13 gating findings) |
      | backlog recorded | `--update-baseline` | 0 |
      | re-run, unchanged | `--summary` | **0** (`13 known-open`) |
      | one locked-down function flipped anon-executable | `--self-test-fail-injection` | **1** (named as NEW) |

      The green step in the middle is load-bearing: it proves the check is not simply
      always-red. The injection mutates the in-memory snapshot only and issues no GRANT, so
      exercising the failure path never widens a live surface.

      The `/day` wiring's own failure path was exercised separately from the main checkout:
      with the script absent it printed `FUNCTION-GRANT-CHECK-DID-NOT-RUN (exit 2)` rather
      than reporting clean.

      The guard probe's blindness controls were exercised too — a transport that fails every
      request and one that succeeds at every request both report **blind**, not clean.
      Offline suite: `scripts/test-function-grant-drift-check.py`, **45/45**, exit 0 (31 at first review,
      +14 binding the two review fixes).
- [x] Wired into `/day` next to the RLS drift check — Wave 3, same main-checkout pinning and
      the same three-way exit contract, plus a reading guide. **Committed to `main`**, not to
      this branch: a skill edited in a worktree is not the skill that runs.
- [x] **Absorbed from P1066:** reports, per function, the *conjunction* of anon-executability and
      whether the function's identity guard actually refuses a genuinely unauthenticated call —
      verified **behaviorally** (invoke it unauthenticated on test, assert a refusal rather than a
      success), not by reading the guard text. A finding only exists in the conjunction: a
      degenerate guard on a function with no anon grant is not a vulnerability, and an anon grant
      on a correctly-guarded function is the product working. Two half-signals in two scripts
      force a human to perform that join every morning, which is how a signal gets tuned out.

      Implemented as direction `guard-permits-anon`. **First live run: of the 13 gating
      findings, 6 also failed the probe** — invoked with no identity on test, they returned
      instead of refusing. That is the conjunction, computed rather than left to a human.
      Signatures are in `.private/docs/security-log.md` 2026-08-17, not here (P1066's
      disclosure rule: this repo is public and these are unpatched live surfaces).

      **Probe shape, and why it is not a REST call.** Each probe runs
      `BEGIN; SET LOCAL ROLE anon; SET LOCAL "request.jwt.claims" TO ''; SELECT fn(NULL::…); ROLLBACK;`
      against test. `auth.uid()` reads that GUC, so it returns NULL exactly as for a real
      anonymous REST call — verified live, not assumed. A faithful REST probe was rejected
      for one reason: the function whose guard is degenerate is precisely the function whose
      body then runs, and over REST there is no undo. A daily monitor that writes damage into
      test on exactly the days it finds something is not a monitor. P1064's classification
      pass made the same call.

      **What the probe therefore cannot see** (gate 7b, stated rather than glossed): PostgREST's
      own layer; guards keyed on non-JWT headers; anything that only fails with *real*
      arguments, since every parameter is NULL — so the leg **under-reports** and its silence
      is not evidence a guard is correct; and side effects that escape the transaction
      (outbound HTTP, advisory locks).
- [x] Guard-shape findings **report and baseline only**; grant drift keeps the gating exit code.
      `rls-drift-check.py` already has this split (`FAILING_DIRECTIONS` is a subset of all
      directions) — reuse it rather than letting a noisier heuristic drag the whole check into
      suppression.

      Done: `FAILING_DIRECTIONS = (anon-unlisted, grant-differs)`. `guard-permits-anon`,
      `fn-env-only` and `allowlist-stale` report without gating. Consequence the `/day` guide
      calls out explicitly: **exit 0 does not mean the guard half found nothing** — the six
      findings above sit alongside `function_grant_exit=0`, so an agent reading only the exit
      code would report clean on the day the check earns its keep.

## Implementation Notes

**Scope filter is load-bearing.** `public` alone is 211 functions on test, 118 of them owned by
the `vector` extension. Gating on the raw set would emit ~162 findings on day one against a
20-entry allowlist — the "flag everything" outcome this spec's own Non-Goals name. Excluding
extension-owned, trigger-returning (not client-callable at all) and non-`prokind='f'` entries
leaves 62 callable functions / 32 anon-executable on test — the same 32 P1064 classified. That
arithmetic matching is the check that the filter has not drifted.

**A baseline was recorded** (`.private/function-grant-baseline.json`, gitignored — it names live
unpatched functions), so `/day` reports `13 known-open` rather than alarming every morning. It is
a backlog, not an allowlist: all 13 still print on every full run. **The 13 still need triage** —
each is either an allowlist entry citing a real anon call site, or a revoke. Baselining records
them; it does not resolve them, and the 6 that also fail the guard probe are the ones to take
first.

**A half-revoke will leave this check green.** These functions typically carry a PUBLIC grant
*and* a role-direct grant, and `has_function_privilege()` cannot tell them apart (P1066). Both
forms are required. Recorded in the script's `NOT_COVERED` constant, which prints on every run.

> **Why this landed here rather than in P1066** (adversarial review, 2026-08-13): P1066 originally
> proposed a grep over migration text to stop the recurrence. That was withdrawn — the unsafe form
> and P1053's sanctioned fix are textual siblings, the house idiom routes identity through a
> variable (22 assignments across 18 files), and two of the three known instances never appeared in
> migration text at all. This check already reads the live catalog and already blocks on P1064's
> allowlist; the guard question needs the same query and the same allowlist. Two specs blocked on
> one artifact reading one catalog are one spec.
