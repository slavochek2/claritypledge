---
status: qa
type: bug
rank: 1000979.0
created_date: '2026-08-13'
tags: [security, rpc, authz, anon]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
driver: anomaly
---

# P1066: an authorization-guard idiom used across several SECURITY DEFINER RPCs does not hold for unauthenticated callers

## Problem

**Situation:** The P1064 audit read live EXECUTE privileges for every `public` function on prod
rather than trusting migration text, and then read the current body of each anon-executable
SECURITY DEFINER function from the live catalog.

**Complication:** A guard idiom that appears throughout these functions does not do what it reads
like it does when the caller is unauthenticated. Three instances were found. Two are reachable on
prod today — one leaks data, one performs a write that damages another user's record. Both were
reproduced end-to-end against test; prod carries byte-identical bodies (md5-matched) and the same
grants. The third is inert only because a later, unrelated check happens to stop it.

This is the **same class** as P1053 F5 and P1063 — the third recurrence. Fixing three call sites
without addressing the idiom leaves the next instance to be found by luck again.

**The affected function list, the mechanism, the reproduction transcripts, and the severity
assessment are deliberately NOT in this file.** They are in
`.private/docs/security-log.md` § "2026-08-13 — P1064 audit", findings F1–F5.

**Why the detail is withheld:** this repo is public. P1063's fix migration carried the exploit
mechanics in its header and reached public GitHub *before* prod was fixed, opening a disclosure
window — recorded as a process failure in the same log. That is not repeated here. Nothing in this
spec, in the fix migration header, or in any commit message on this branch may describe the
mechanism or name the reachable functions.

**Status update (2026-08-13, after the fact): prod is now patched** — verified against the live
catalog and by an unauthenticated probe that is refused where it previously returned data. The
ordering constraint this section exists to enforce has therefore been met, and pushing this branch
no longer opens a window. The withholding rule stays as written because it is what produced that
outcome, not because the risk is still live.

**Question:** Close the reachable instances, and make the idiom itself non-recurring.

## Appetite

Blast radius: the guards sit in functions on live user paths — a wrong fix locks out legitimate
users (the sender viewing their own letter, the recipient claiming a delivery). Reversible via
migration. Decision density: low — the correct guard form is already established in this codebase;
one of the audited functions uses it correctly and is the model.

## Root Cause

Recorded in `.private/docs/security-log.md` (F1–F3). One sentence that is safe to state publicly:
the guards were written to compare against the caller's identity, and were never exercised by a
test in which that identity is absent.

## Approach

1. **Fix the reachable instances** (F1, F2). Harden F3 in the same pass — it is one edit from
   reachable.

   **Use the form that explicitly requires a non-NULL identity.** The reference implementation in
   this repo is P1053's:
   `AND NOT (auth.uid() IS NOT NULL AND <owner> = auth.uid())`
   (`20260812150000_p1053_joiner_seat_claim_rpcs.sql:173`). Prefer an explicit
   `IF auth.uid() IS NULL THEN RAISE EXCEPTION ...; END IF;` preamble — it refuses anonymous
   callers on its own line rather than asking the reader to evaluate three-valued logic.

   **Do NOT reach for `IS DISTINCT FROM` as "the NULL-safe form."** An earlier draft of this spec
   said exactly that, and it was wrong in a way that would have produced a fix that still does not
   refuse anonymous callers: `NULL IS DISTINCT FROM NULL` is FALSE (measured on the live DB), so
   a guard of the shape `IF p_user_id IS DISTINCT FROM auth.uid() THEN RAISE` **proceeds** for an
   anon caller passing NULL. At least six migrations already carry that shape and are safe only
   by downstream filtering.
> **CORRECTION (2026-08-13, at implementation time) — N5's prescription below is wrong.**
> "Derive the identity from `auth.uid()`" would have **broken production**. The inline sign-up path
> runs server-side under `service_role`: it creates the partner account and accepts on its behalf
> *before* that account has a session, so `auth.uid()` is legitimately NULL there. Six existing
> integration tests call the same function the same way. The earlier review that produced this
> prescription enumerated browser call sites only and never checked edge-function callers.
>
> **What actually shipped:** the caller-supplied partner id is still used for the write, but is
> trusted *only* for `service_role`; every other caller must present a non-NULL `auth.uid()` that
> equals it. That closes both the anonymous case and authenticated forgery. `service_role` already
> bypasses RLS wholesale, so trusting it inside a SECURITY DEFINER body grants nothing it did not
> already hold, and the role claim is part of the signed JWT so a browser client cannot forge it.
> Positive coverage for the trusted path is test A5b; the forgery case is A5.
>
> Read the rest of 1b as historical context, not as instructions.

1b. **FOLDED IN 2026-08-13 (founder decision): P1067's N4 and N5.** Both are single-guard fixes —
   N4 is the same NULL-degenerate class as F1–F3 (its guard compares against a *nullable* column,
   so an anon caller matches every unclaimed row); N5 needs the identity derived from `auth.uid()`
   instead of trusted from a caller-supplied parameter. Carrying them in their own spec would buy a
   second migration, a second prod deploy and a second disclosure window for two lines. See P1067's
   Non-Goals scope change for the reasoning, and split them back out if this migration starts
   growing a third concern.

   Both were **reproduced against test** during P1064's classification pass — transactional and
   rolled back, each with a role control confirming `auth.uid()` was NULL and a discriminating
   negative control. N4 is reachable on prod today; N5 has no live target at this instant but
   acquires one with the next invitation sent. N5 also carries an **orphaned overload** to drop
   alongside F4's: it is live on **both** prod and test (F4's was prod-only) and makes one whole
   argument arity fail `42725: function is not unique`. Evidence:
   `.private/docs/p1064-anon-execute-classification.md`.

2. **Revoke anon EXECUTE where no anonymous path exists.** P1064's classification is the input;
   for the functions in this spec the call sites are all authenticated (verified — see the private
   log's review section for the file:line trace). Defense in depth: a correct guard and no grant,
   not either alone.

   The grant-shape arithmetic behind the next paragraph is now measured across the whole surface:
   26 of 32 carry both grants, 6 carry the role-direct grant only, none carry PUBLIC only
   ([docs/decisions.md](../docs/decisions.md) 2026-08-13 [technical]).

   **Both revoke forms are required — verified against live ACLs, not migration text.** These
   functions carry a PUBLIC grant *and* a role-direct anon grant simultaneously. `REVOKE … FROM
   anon` alone leaves PUBLIC (of which anon is a member); `REVOKE … FROM PUBLIC` alone leaves the
   role-direct grant. Issue both. `authenticated` and `service_role` hold role-direct grants and
   survive a PUBLIC revoke — re-assert their GRANTs in the same migration anyway.

3. **Drop the orphaned overload** (F4) — dead, prod-only, separately granted. **A `DROP FUNCTION
   IF EXISTS` for this exact signature already shipped and is recorded as applied on prod, and the
   function is still there** (private log F6). Writing the identical statement again is writing
   the statement that already failed. Verify against live `pg_proc` after applying; a green
   migration run is not evidence.
4. **Make the idiom non-recurring — NOT here, and NOT with a grep.** An earlier draft proposed
   "a grep-level check that flags the unsafe comparison form in any new migration." That was
   red-teamed and withdrawn. It fails against defects this repo has *already suffered*, and the
   checkbox would have been worse than nothing because it stops anyone looking again. Measured
   reasons:

   - The unsafe form and P1053's **sanctioned fix** are both `NOT (... = auth.uid())`, differing
     only by a conjunct *inside* the negated expression. Separating them is a parse, not a match.
   - The dominant house idiom routes identity through a variable — 22 `:= auth.uid()` assignments
     across 18 migration files — so an author writing recurrence #4 in the repo's own style evades
     a text match without trying.
   - Two of the three known instances never touched new migration text at all: an out-of-band
     function created directly against prod, and an orphaned overload left live by
     `CREATE OR REPLACE` on a changed signature (130 migration files use `CREATE OR REPLACE
     FUNCTION`; only 16 contain any `DROP FUNCTION`).
   - `pre-commit-checks.sh` is staged-file-scoped throughout, so such a check has an empty scope
     on day one; run over the whole corpus it fires on 27 files and forces an allowlist, which is
     indistinguishable from switching it off.
   - Nothing in `scripts/` reads `pg_proc` / `proacl` / `has_function_privilege` today (verified),
     so no text-level check can evaluate the grant half at all — and a finding only exists in the
     **conjunction** of a bad guard and a live anon grant.

   **Instead: fold the recurrence check into P1065**, which already reads the live catalog and
   already depends on the same P1064 allowlist. Make it *behavioral* rather than textual —
   enumerate anon-executable functions from the catalog, subtract the allowlist, and for each
   remainder invoke it unauthenticated and assert a refusal rather than a success. That observes
   whether the refusal happened instead of reading the guard, so every evasion above collapses
   into one signal. Guard-shape findings should report and baseline, never gate; grant drift keeps
   the gating exit code (`rls-drift-check.py` already has that split in `FAILING_DIRECTIONS`).

   If an authoring-time nudge is still wanted, it belongs in `.claude/rules/database.md` as
   guidance in the shape `.claude/rules/pii.md` uses for the other defect class that resisted
   pattern-detection — stating plainly that a green gate is not evidence the rule was followed.

## Risks / Non-Goals

### Risks

- **Over-tightening breaks live paths.** MITIGATE: each revoke needs a named call site or proven
  absence of one, per P1064's evidence. Both fixed functions have authenticated call sites in
  `src/app/data/letters-service.ts` — verify before and after.
- **A test that passes for the wrong reason.** The regression test must fail on the CURRENT code
  and pass after. MITIGATE: run it before the fix and paste the failure. (Epistemic gate 7.)
- **Fixture cannot emit the attacker's input.** The reproduction ran unauthenticated over the REST
  API; the test must do the same, not merely call the function as a privileged role with a NULL
  argument. Those are different inputs and only one is the real one. (Gate 7b.)
- **Disclosure window.** MITIGATE: mechanics stay in `.private/`. Prod fix should not lag the
  public push. If ordering forces a choice, patch prod first.

### Non-Goals

- Do **NOT** widen this into the full P1064 classification — that spec owns the remaining ~34
  functions and its allowlist.
- Do **NOT** rotate the secret found in F5 here — separate concern, separate change.
- Do **NOT** put the function names or mechanism in any public file, migration header, or commit
  message.

## Done-When

- [x] **Baseline established FIRST, before any edit**, recorded on the pre-fix commit.
      *Baseline 1* (the `get_inbox_items(UUID)` call sites): **12 failed / 15 passed** — 10 ×
      `PGRST202` (signature already dropped on test), 1 × a `receiver_email` redaction contract
      that was never implemented (now **P1071**), 1 × a Supabase auth rate-limit flake. Post-fix
      **11 / 16**: the flake passed, the other 11 are unchanged pre-existing failures.
      *Baseline 2* (the five affected functions): **5 failed / 20 passed** — 1 × the
      `seal_and_send_letter` overload ambiguity (now **P1070**), 4 × `accept_agreement`.
      Post-fix **3 / 22**. That is not "2 fixed": all **4** `accept_agreement` failures were fixed
      by the overload drop, and 2 *different* rate-limit flakes appeared in their place. Confirmed
      by re-running the affected file alone — 5/5 pass in isolation.
      **Net across both: 5 failures fixed, 0 introduced.**
- [x] Regression test exercises the affected functions as a caller with no identity —
      `e2e/integration/20260813170000_p1066_null_identity_authz_guards.spec.ts`. **11/11 failed
      before the migration, 11/11 pass after**, with no edit to the test between runs. Pre-fix
      output pasted in the session and summarised in the private log.
- [x] `src/tests/sd-guard-completeness.test.ts` still passes (2/2). Every body was rebuilt from the
      live `pg_get_functiondef`, md5-matched prod↔test, not from an older migration.
- [x] F1 and F2 no longer return data / perform the write when unauthenticated, verified on test
- [x] F3 hardened to the same guard form
- [x] F4 orphaned overload dropped from prod — **verified after the prod deploy** against live
      `pg_proc`: the overload is gone. Worth recording that the byte-identical `DROP` had been
      recorded as applied once before without taking effect (F6); this time it did.
- [x] anon EXECUTE revoked on the affected functions; authenticated paths re-verified working.
      Live test ACLs after apply show `anon=false` on all five with both the PUBLIC (`=X/`) and
      role-direct (`anon=X/`) entries gone, and `authenticated`/`service_role` retained.
- [x] Recurrence prevention is recorded as a P1065 Done-When, NOT built here as a grep gate —
      already present at `features/p1065_function_grant_drift_check.md` (the "Absorbed from P1066"
      items plus the report-and-baseline split). Nothing further was needed here.
- [x] Verified on prod after deploy by querying live `pg_proc` / `has_function_privilege()` — all
      five carry the refusal and `anon=false`, with `authenticated`/`service_role` retained, and
      both orphaned overloads are absent. Confirmed end-to-end by an unauthenticated REST probe
      returning `401 / 42501` where the original reproduction returned `200` with payload.
      Applied out-of-band (not via `migrate.sh --env prod`, which would have swept in seven
      undeployed migrations from an unrelated workstream), so prod's migration ledger is **not
      stamped** for this version — re-run `migrate.sh --env prod` once those land.
- [~] Both `claimLetterDelivery` call sites stop discarding the result — **partially.** What
      changed: the service now *classifies* a refusal and reports the anomalous ones to Sentry, and
      both call sites report a thrown error instead of swallowing it. What did not: the returned
      boolean is still never branched on. Surfacing a refusal to the *user* needs copy, which is a
      founder decision — filed as **P1072** rather than invented here.
      Classification matters more than it sounds: reporting *every* refusal (the first revision of
      this fix) would have emitted a warning on essentially every 1-to-1 letter open, because the
      sign-up path expires the invitation in the same write that claims the delivery, so the
      ordinary follow-up claim is refused by design. Guarded by
      `src/tests/p1066-claim-refusal-sentry-classification.test.ts`, which was confirmed to fail on
      the pre-fix logic and only on the case that regressed.
- [~] No mechanism or function name in any public file, migration header, or commit message —
      **partially met; part of the residue is unavoidable and part was self-inflicted.**
      Mechanism prose was stripped from the migration header, the canary header, and the canary's
      assertion messages. Two things were caught only at review: the first commit message named a
      function and described its new authorization rule — the exact surface this line calls out,
      and the one `.claude/rules/pii.md` says no automated gate can reach — since amended before
      any push; and the migration header enumerated all five signatures with per-function hashes,
      which was avoidable commentary, since trimmed to the method with the hashes moved to the
      private log.
      What genuinely cannot be removed: a migration that redefines these functions and a
      regression test that calls them must name them. **The control is therefore ordering, not
      redaction: prod must be patched before this branch reaches public GitHub** (the P1063
      sequence, not the P1057 one).
- [x] `.private/docs/security-log.md` updated with the fix, both corrections to the earlier
      analysis, the new overload finding, and the live-catalog verification output
