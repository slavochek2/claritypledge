---
status: all-done
type: bug
rank: 30
severity: low
workstream: infrastructure
date_reported: '2026-10-12'
created_date: '2026-10-14'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, agreements, people-picker]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
related: [p878, p1446, p1451]
completed_at: 2026-10-14
---

# P1486: An agreement the partner never accepted still counts as a relationship

> **Embargoed.** Authored branch-born on `feature/p1486-relationship-scope-residuals`. Not published
> until `./scripts/git-ops.sh publish-spec p1486` confirms the fix is live on prod. Commit subjects
> use roles, not mechanics. Source: `.private/docs/security-log.md`, "Codex F3 from P1451 review"
> (founder decision 2026-10-12: fix under a separate embargoed spec).

## Summary

The people picker and the scope-gated agreement and letter RPCs only reach people the caller
already shares a relationship with (P878). For agreements that was meant to be "accepted at some
point". An invitation addressed to a registered person and then ended before they answered also
counted, in both directions: the person who never accepted entered the creator's scope, and the
creator entered theirs.

## Root Cause

`p878_relationship_scope` (latest: `20260605150000_p878_search_profiles_rpc.sql`) approximated
"accepted at some point" with a status list. One of those statuses is also where an unanswered
invitation goes when a party cancels it, and `create_agreement_with_profile` writes invitations
already addressed to a profile. Nothing in the agreement arms checked that the partner had taken
part.

## Scope as verified before the fix (2026-10-14, code + prod catalog + prod data, read-only)

- Prod and test function bodies identical (same `md5(pg_get_functiondef)`); the defect is live.
- Consumers (prod catalog): `search_profiles`, `create_agreement_with_profile`,
  `seal_and_send_letter`, `add_recipient_to_sealed_letter`, all SECURITY DEFINER; no policy and no
  client or edge-function caller.
- **Retains, does not grant, reach for the creator**: addressing someone by profile already
  requires scope. **Grants reach to the invitee**, who never acted.
- Prod data: active 4 (all partner-set and signed), terminated 2 (no partner). **0 rows of the
  defect shape**, so no existing user loses a contact.

## Invariants

- **P1446 invariant 3 holds for agreements: every input to the relationship scope is a fact the
  other party took part in.** An agreement counts only once the partner accepted it.
- Accepted agreements count whether still active or later ended (unchanged P878 intent).
- Letter and witness arms unchanged (see Founder decision below for the letter arm).

## Reproduction Steps (test project only)

1. A creates an invitation addressed to B's profile, the shape `create_agreement_with_profile`
   writes; A then cancels it the way the app does.
2. Read both parties' scope, search each other by name, and have A address B by profile again.
3. Before the fix: B is in A's scope and A in B's; search finds each; A may address B again.
   After: none of these.

## Fix Approach

1. Failing test first: `e2e/integration/p1486-scope-accepted-agreements-only.spec.ts`.
2. Migration `20261014120200_p1486_scope_accepted_agreements_only.sql`: both agreement arms count a
   row only if it is active (reachable only through `accept_agreement`, P1451) or ended with the
   partner's signature (written only by `accept_agreement`; client UPDATE cannot change it, P1451).
   Post-condition DO block asserts the rule, invoker rights, empty search_path, and that client
   roles still cannot execute the helper.
3. Considered and not chosen: requiring the signature on active rows too. Equivalent on prod data
   (0 active unsigned), but existing P878 fixtures seed active rows without a signature and would
   need changing; active is already accept-only since P1451.

## Severity

**Low** — reach to display-safe profile columns and to addressing an invitation by profile. In the
invitee's direction that last step returns the original creator's address in the invitee's own
new row (the call succeeded in the red run; the address is resolved in-DB by that RPC). Requires the creator to have invited and then
cancelled; no prod rows of this shape.

## Acceptance Criteria

- [x] Failing-then-passing integration test: an invitation ended before acceptance puts neither
  party in the other's scope (helper, people search, agreement RPC)
  - **Red (2026-10-14, test, before the migration, JSON reporter, `--retries=0`):** expected 5,
    unexpected 4 — all 4 defect tests failed (each party in the other's scope; search found both;
    the RPC created an agreement), all 5 controls passed.
  - **Green (after applying the migration to test):** expected 9, unexpected 0, flaky 0.
- [x] The scope-gated RPCs, called as the signed-in user (review finding, 2026-10-14):
  `seal_and_send_letter` and `add_recipient_to_sealed_letter` refuse the other party of an
  unaccepted agreement; from the invitee's side, `create_agreement_with_profile` and
  `seal_and_send_letter` refuse the creator. Controls: sealing to an accepted-then-ended partner by
  profile, and adding a past correspondent to a sealed letter by profile, both still work.
  - **Red against the pre-fix body** (temporarily restored on test from the prod definition,
    07:09:55–07:13:50 UTC 2026-10-14, then restored from the migration file; catalog read after
    restore: live body byte-equal to the file's, rule present, invoker, empty search_path, ACL
    unchanged, ledger row present): whole file, `--retries=0 --workers=1`: expected 7, unexpected 8
    — all 8 defect tests failed (the 4 RPC refusals all returned success), all 7 controls passed.
  - **Green after restore:** expected 15, unexpected 0, flaky 0. (An earlier green run passed every
    test body but hit the 30 s cleanup budget; the hook timeout was raised and the 4 fixture users it
    left were removed.)
- [x] Controls green before and after: accepted-then-ended and active agreements (both directions,
  search, and re-addressing after an ended agreement), letter correspondents both directions,
  witnesses both directions, pending invitation still excluded
- [x] Migration applied to test and verified by catalog read: ledger row present, rule present,
  SECURITY INVOKER, empty search_path; anon/authenticated EXECUTE false, service_role true (control)
- [x] Post-condition logic exercised against both bodies: on the old body (prod) it would refuse
  (rule count 0, old predicate present); on the new body (test) it passes (rule count 2)
- [x] Regression lane on test (scope consumers): `p878-search-profiles-migration`,
  `p975-letter-scope-gate`, `p914-db-schema`, `p1321-witness-forgery`, `p1446-ownership-columns`,
  `p1451-agreement-self-accept` — 80 distinct tests; first run 69 passed / 9 failed / 2 skipped,
  every failure the test project's auth rate limit at sign-in. Re-runs with one worker: 79 of 80
  passed at least once after the migration; the 80th is a pre-existing `test.skip` (P878 witness
  stub). Unit: `sd-guard-completeness`, `p975-letter-scope-gate` 3/3.

## Founder decision (not taken here)

Sealing a letter to a registered address puts the recipient in the sender's scope with no action
by the recipient. P878's product decision says exactly this ("after the first send, that person
enters the user's relationship scope"); P1446 invariant 3, written later, says every input must be
a fact the other party took part in. The two records conflict and no decision reconciles them, so
this spec does not change the letter arm.

`[FOUNDER DECISION: keep the letter arm as P878 designed, or require the recipient to have opened the letter?]`
Recommendation: keep it (the sender already holds the address, the reach is display-safe columns,
and the F5 chain it enabled is closed), and reword P1446 invariant 3 to name the sender's own
outbound letter as the one deliberate exception.

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- `[post-deploy]` Prod apply on the founder's go; read-only re-probe of the rule with a control
- `[post-deploy]` `publish-spec p1486`
