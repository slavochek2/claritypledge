---
status: today
type: bug
rank: 1000979.0
created_date: '2026-08-13'
tags: [security, rpc, authz, anon]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

**Why the detail is withheld:** this repo is public and prod is unpatched. P1063's fix migration
carried the exploit mechanics in its header and reached public GitHub *before* prod was fixed,
opening a disclosure window — recorded as a process failure in the same log. That is not repeated
here. Nothing in this spec, in the fix migration header, or in any commit message on this branch
may describe the mechanism or name the reachable functions.

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

1. **Fix the reachable instances** (F1, F2) using the NULL-safe comparison form already used
   correctly elsewhere in this codebase. Harden F3 in the same pass — it is one edit from
   reachable.
2. **Revoke anon EXECUTE where no anonymous path exists.** P1064's classification is the input;
   for the functions in this spec the call sites are all authenticated. Defense in depth: a
   correct guard and no grant, not either alone.
3. **Drop the orphaned overload** (F4) — dead, prod-only, separately granted.
4. **Make the idiom non-recurring.** A grep-level check that flags the unsafe comparison form
   against the caller identity in any new migration. This is the part that stops recurrence #4.

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

- [ ] Regression test exercises the affected functions as a genuinely unauthenticated caller,
      fails on current code (failure output pasted), passes after the fix
- [ ] F1 and F2 no longer return data / perform the write when unauthenticated, verified on test
- [ ] F3 hardened to the same guard form
- [ ] F4 orphaned overload dropped from prod
- [ ] anon EXECUTE revoked on the affected functions; authenticated paths re-verified working
- [ ] Recurrence check added and **watched to fail** — non-zero exit pasted
- [ ] Verified on prod after deploy
- [ ] No mechanism or function name in any public file, migration header, or commit message
- [ ] `.private/docs/security-log.md` updated with the fix and the verification
