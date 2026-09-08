---
status: week
type: comment
rank: 1000081
workstream: infrastructure
created_date: '2026-09-08'
tags: [security, adversarial-review, clarity-sessions, rls]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1274: The three P1053 review lenses that still have not run

## Problem

**Situation:** P1053 closed a transcript-disclosure hole. Of five planned adversarial lenses over
that diff, **one completed** — three were interrupted and one died on an API error. That single
lens found three real, reproducible holes. A fourth was found by accident during unrelated
verification, and a fifth (F4) was reproduced and fixed under P1058 on 2026-09-08.

**Complication:** P1058 was the spec that was supposed to run the missing three. It ran Phase 1
(reproduce and fix F4) and Phase 2 (the fail-open audit) and stopped there. Its own Done-When
still carries *"All three unrun lenses have been run"* unticked. Splitting them out is what lets
P1058's finished, tested security fix ship instead of aging on a branch behind an open-ended
review — which is exactly how it got stranded the first time.

**The hit rate is the argument.** Roughly one lens's worth of review produced five confirmed
defects on this surface, two of them found by luck rather than by looking. That is not evidence
the surface is clean; it is evidence it is under-reviewed.

**Question:** What do the fail-open, race/TOCTOU, and evasion lenses find on the P1053 diff plus
P1058's two new migrations?

> Founder framing, verbatim: *"lets do all we need to resovle what needs to be done with w2 and do
> it and then anlaze root cause and fix."*

## Appetite

Blast radius: zero until it recommends something — an audit changes nothing by itself.
Reversibility: n/a. Decision density: potentially high, since a finding here may reopen an accepted
trade-off, and those are founder calls.

## Approach

Per `/slava:think:adversarial-review`, artifact = the P1053 diff (migrations `20260812150000`–
`20260812210000` plus the `api.ts` cutover) **and** P1058's two additions
(`20260908114500_p1058_release_seat_requires_code`,
`20260908120000_p1058_per_seat_capability_token`). The second half matters: those shipped after the
only lens that ever ran, so no adversarial pass has ever looked at them.

1. **Fail-open / operational.** Beyond NULL: what happens when a dependency is missing, slow, or
   returns empty? Is the wrong default the dangerous one? P1058's Phase 2 audit is this lens's
   opening move, not its substitute — it classified NULL-reachability by construct and stopped
   there. It also left one condition **OPEN BY DESIGN** in `complete_clarity_session`, closed only
   by the ACL; test that claim rather than inheriting it.
2. **Race / TOCTOU.** The `SELECT … FOR UPDATE` row lock has a canary, but that canary asserts an
   invariant which holds whether or not the two requests ever overlapped inside the database. The
   lock has never been *proven* to engage under contention. If PostgREST makes that unprovable,
   say so plainly rather than reporting the canary as evidence.
3. **Evasion / blast radius.** How do you get the wrong outcome *past* these guards — alternate
   code paths, interaction with `patch_live_state`, enumeration, hostile input, and the new
   per-seat capability token specifically.

Give each lens the reassurances to attack **by name**, and require reproduction on test before any
finding is written up as real.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Review fatigue produces rubber-stamping | MITIGATE | Each lens must report at least one concrete attempted attack **and its outcome, including failures** |
| A finding reopens an accepted trade-off | ACCEPT | Route to the founder as a `[FOUNDER DECISION]`; do not decide it inside the review |
| An unreproduced reviewer claim is promoted as fact | MITIGATE | Epistemic gate 9 — nothing is a finding until a command confirms it; forward the rest labelled as a claim |
| A silent lens is read as a clean lens | MITIGATE | Gate 9b — report `<received> of <spawned>` and name any lens that did not report |

**Non-Goals**
- Do NOT re-litigate the room `code` as bearer token — that is P1057.
- Do NOT re-open the `joiner_profile_id` single-slot design.
- Do NOT fix findings here. Route them to P1059, which is the hardening backlog for exactly this.

## Done-When

- [ ] All three lenses have run, each reporting concrete attempted attacks and outcomes, failures included
- [ ] Every finding is reproduced on test before being written up as real; unreproduced claims are forwarded labelled as claims
- [ ] The `complete_clarity_session` "OPEN BY DESIGN, closed only by the ACL" claim is tested, not inherited
- [ ] The `FOR UPDATE` lock is either demonstrated to engage under contention, or recorded as not demonstrable through PostgREST with the reason
- [ ] P1058's two migrations have had an adversarial pass — no lens has ever seen them
- [ ] `<reports received> of <lenses spawned>` is stated, with any uncovered lens named
- [ ] Findings routed to P1059; `.private/docs/security-log.md` updated with anything found
- [ ] P1053's Group F canaries and both integration suites still green

## Related

- P1058 — parent; Phases 1 and 2 done, this is its unfinished Phase 3
- P1059 — where findings from this review land
- P1057 — code confidentiality, explicitly out of scope here
