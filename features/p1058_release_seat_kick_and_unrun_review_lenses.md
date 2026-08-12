---
status: week
type: task
rank: 1000975.0
created_date: '2026-08-12'
tags: [security, clarity-sessions, rls, adversarial-review]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1058: `release_joiner_seat` is an unauthenticated global kick, and three P1053 review lenses never ran

## Problem

**Situation:** P1053 closed a critical hole where any signed-in user could write themselves into
`clarity_sessions.joiner_profile_id` on a stranger's room and read that pair's stored transcript.
It shipped `claim_joiner_seat` / `release_joiner_seat` (SECURITY DEFINER) plus a column REVOKE,
across migrations `20260812150000`–`20260812200000`.

**Complication:** The review that was supposed to validate that work did not finish. Of five
planned adversarial lenses, **one completed** — three were interrupted, one died on an API error.
That single lens found **three** real, reproducible transcript-disclosure holes (F1, F2, F3). A
**fourth** (F5) was then found *by accident*, during unrelated verification, not by any review:
the occupancy guard was failing **open** on every guest-held seat because plpgsql skips an `IF`
whose condition is NULL. Nothing was looking for that class. Separately, a **fifth** issue (F4)
was raised as a reviewer claim and has never been reproduced.

**Question:** Two things. Is F4 real? And what do the three unrun lenses find — particularly the
fail-open lens, given that the one fail-open defect that surfaced (F5) was found by luck?

The hit rate is the argument here. Four confirmed defects came out of roughly one lens's worth of
review. That is not evidence the surface is clean; it is evidence it is under-reviewed.

## Appetite

Medium blast radius — F4's fix would touch `release_joiner_seat`, which sits on the live guest
leave path (`clarity-live-page.tsx`, `AuthContext`). The audit itself has zero blast radius until
it recommends something. Reversible: any fix is a `CREATE OR REPLACE` in a new migration.
**Decision density: potentially high** — AD3 deliberately accepted that any anon id-holder may
release an anonymously-held seat ("the same exposure `patch_live_state` has accepted since P671").
Closing F4 may mean revisiting that acceptance, which is a founder call, not an implementation
detail.

## Approach

Three phases, in order. **Phase 1 gates the rest** — do not design a fix for a defect that has not
been reproduced.

### Phase 1 — Reproduce F4, or close it

**F4 as claimed (UNVERIFIED — this is a reviewer's claim, not a finding):**
`release_joiner_seat(p_session_id uuid)` is `GRANT EXECUTE` to `anon` and takes a session id. The
anon SELECT policy on `clarity_sessions` publishes ids. So an unauthenticated caller holding any
id can evict the seated guest — product-wide, by enumeration.

Write a canary on test that attempts exactly this from an anon client. Then classify honestly:

- **Reproduces** → denial of service, **no data disclosure** (the row's `joiner_profile_id` is
  untouched by a release, and a guest seat carries none anyway). Continue to a fix.
- **Does not reproduce** → say so plainly, record why the claim was wrong, and close this half of
  the spec. A retracted finding is a good outcome, not a failure.

Note the precedent for getting this wrong in the cheap direction: the same review's *top* finding
claimed a migration "exists nowhere in this repo" and inferred an unauthorized prod deploy. It was
a worktree artifact — the file was on `main`. Absence in a working tree is not absence in the repo.

### Phase 2 — The fail-open audit (highest priority, do this even if F4 evaporates)

Audit **every boolean condition** in `claim_joiner_seat`, `release_joiner_seat` and
`complete_clarity_session`, across all P1053 migrations, for operands that can be NULL. For each,
classify: does NULL make it fail **open** or fail **closed**?

**A blanket grep is not sufficient, and this is the crux.** The identical expression
`joiner_profile_id = auth.uid()` is:

- **fail-OPEN** inside an `IF` — NULL is not true, plpgsql skips the branch, and a skipped refusal
  guard is an allow. This was F5.
- **fail-CLOSED** inside a `WHERE` — NULL excludes the row, yielding zero updated rows and a
  raised exception. This is `release_joiner_seat` today, and it is correct there.

So the audit must classify by **construct**, not by predicate text. Deliverable: a table of every
condition, its NULL-reachable operands, the construct it sits in, and the fail direction.

### Phase 3 — Run the three lenses that never ran

Per `/slava:think:adversarial-review`, with the artifact being the full P1053 diff
(`feature/p1053-server-side-join-authorization`, migrations `20260812150000`–`20260812200000`,
plus the `api.ts` cutover):

1. **Fail-open / operational** — highest priority; Phase 2 is its opening move. Extend beyond
   NULL: what happens when a dependency is missing, slow, or returns empty? Is the wrong default
   the dangerous one?
2. **Race / TOCTOU** — the `SELECT … FOR UPDATE` row lock is implemented and has a canary, but
   that canary asserts an invariant that holds whether or not the two requests actually overlapped
   inside the database. The lock has never been *proven* to engage under contention.
3. **Evasion / blast-radius** — how do you get the wrong outcome *past* these guards? Alternate
   code paths, the RPCs' interaction with `patch_live_state`, enumeration, concurrency, hostile
   input.

Give each lens the P1053 reassurances to attack by name, and require reproduction on test before
any finding is reported as real.

## Risks / Non-Goals

### Risks

- **The AD3 acceptance may be load-bearing.** Requiring identity on `release_joiner_seat` breaks
  the anonymous guest leave path outright — a guest has no `auth.uid()`, so "the same guest
  leaving" and "an attacker" are indistinguishable. Mitigation: treat any change to AD3 as a
  `[FOUNDER DECISION]`, and cost the guest-flow breakage explicitly before proposing it.
- **A fix here can silently re-break guest rejoin**, which P1053 already broke once and restored
  in migration `20260812190000`. Mitigation: the Group F canaries in
  `e2e/integration/p1053-claim-joiner-seat.spec.ts` must stay green.
- **Review fatigue produces rubber-stamping.** This is the third review pass over the same diff;
  the temptation is to confirm rather than break. Mitigation: each lens must report at least one
  concrete attempted attack and its outcome, including failed attempts.

### Non-Goals

- Do **NOT** re-litigate the room `code` as bearer token, or code confidentiality — that is P1057.
- Do **NOT** re-open the `joiner_profile_id` single-slot design. It is a known, recorded limit and
  is no longer load-bearing for confidentiality (P1053 closed F1 by refusing the transfer).
- Do **NOT** change `claim_joiner_seat`'s guest-reclaim arm's name-forgeability. That is a
  deliberate founder decision, argued on the grounds that release-then-claim already bypasses any
  name check.
- Do **NOT** fix the LOW item below as separate work — record it and move on.
- Do **NOT** report a finding that has not been reproduced on test. Forward it labelled as a
  claim, exactly as F4 is labelled here.

## Done-When

- [ ] F4 is either **reproduced** with a canary showing an anon caller evicting a seated guest, or
      **closed** with a written explanation of why the claim does not hold
- [ ] If reproduced: fixed, with the AD3 trade-off decided explicitly by the founder and recorded
- [ ] The fail-open audit table exists — every boolean condition in the three functions, its
      NULL-reachable operands, its construct (`IF` vs `WHERE` vs policy), and its fail direction
- [ ] Every fail-OPEN condition found is either fixed or recorded as accepted with a reason
- [ ] All three unrun lenses have been run, each reporting concrete attempted attacks and outcomes
- [ ] Every new finding is reproduced on test before being written up as real
- [ ] `.private/docs/security-log.md` updated with anything found
- [ ] P1053's Group F canaries and both integration suites still green

## Research Questions

1. Does F4 reproduce? Which grant and which policy actually make it reachable — `GRANT EXECUTE …
   TO anon` on the function, or the anon SELECT policy that publishes session ids, or both?
2. Is there any *other* SECURITY DEFINER function in the codebase whose refusal logic sits in an
   `IF` over a nullable column? F5's class is not specific to P1053.
3. Does the `FOR UPDATE` lock actually engage under contention, and can that be demonstrated at
   all through PostgREST — which offers no way to hold a transaction open across two requests?
4. Does `patch_live_state` interact with the new seat columns in any way that re-opens a closed
   session or forges a vacancy signal?

## Notes

**LOW, recorded not fixed (from the P1053 code review).** `clearSessionJoiner`'s stricter WHERE
turns a double-release from a silent no-op into a thrown-then-caught error. Both call sites
(`clarity-live-page.tsx`, `src/auth/AuthContext.tsx`) already catch and swallow it, so the
functional impact is nil and the cost is log noise. Do not fix separately; fold it in only if
Phase 1 or 3 touches `release_joiner_seat` anyway.

**Context and exploit detail:** `.private/docs/security-log.md`, the two `2026-08-12` P1053
entries — the first covers F1/F2/F3, the second covers F5 and why four rounds of canaries missed
it. P1053's spec carries the founder decisions (Reconciliation items 3 and 4) and the AD5
stale-marker.
