---
status: week
type: task
rank: 99
workstream: infrastructure
created_date: '2026-09-11'
tags: [ship-gates, closure, pipeline, process]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1309: A spec delivered under another spec's number can pass its own closure gates

## Problem

**Situation:** A spec closes only through `./scripts/git-ops.sh ship pN`, which runs `ship-gates.sh` against that spec. Gate 2.5 requires every completion box ticked **and** a `dev`/`fix`/`inline` entry in the spec's own `pipeline_ran`. Gate 2.7 requires a `.finish-reviewed` code-review entry naming the spec. The only other way out is the founder-typed override (`--override`, P1246).

**Complication:** P500 (March, backlog: feed card harmonization) had its whole scope delivered by P1296, and its six criteria are ticked with pointers to P1296. Its own gates still fail, correctly: the build and the three reviews were recorded under P1296's number, so gate 2.5 sees no implementation and gate 2.7 no review. The gate cannot see that link, so a legitimate close is routed to the override. The override was built for closing a spec **on a red gate** and is the wrong tool for a spec whose work is done and reviewed.

> Founder, verbatim: "Why you cannot close? I don't understand why we have this guardrail. This makes no sense in this specific scenario. You tell me to do things you can do. I guess the guardrail needs to be critically reviewed and changed."

**Question:** How can an absorbed spec pass its own gates on the evidence that actually exists, without reopening the auto-close hole that the pipeline deliberately removed?

## Appetite

- **Blast radius:** medium. Every spec close runs gate 2.5 (locally and in CI), but the new arm only runs for a spec that declares `absorbed_by`.
- **Reversibility:** high. It is a script change, revertible with git. A spec closed through the new arm can be reopened by hand.
- **Decision density:** low. The founder asked for this change (2026-09-11).

## Invariants

- **Closing stays an explicit act that names the spec** (`git-ops.sh ship p500`). Shipping the absorbing spec never closes the absorbed one as a side effect. The 2026-09-07 and 2026-08-31 rulings removed exactly that auto-close after it wrongly closed specs: 11 of 17 closed that way had not been delivered.
- **Every completion box on the absorbed spec must still be ticked.** The new arm replaces only the "implementation recorded" and "review recorded" evidence, never the box count.
- **The absorbing spec's evidence must be real and resolvable:** `dev`, `fix` or `inline` in its `pipeline_ran`, a review entry naming it, and its own text naming the absorbed spec. A dangling or one-sided `absorbed_by` fails.
- **The override (`--override`, TTY) is unchanged** for every other case.

## Solution

1. **The absorbed spec declares where its work went:** `absorbed_by: pN` in frontmatter. The value is one P-number.
2. **Gate 2.5:** when the spec's own `pipeline_ran` records no implementation and `absorbed_by: pN` is set, resolve the absorbing spec pN. Check its feature branch copy first, then `features/`, then `features/done/**`. PASS only if the absorbing spec exists, records `dev`, `fix` or `inline`, and names the absorbed spec's P-number in its own text. The PASS line says `implementation recorded on absorbing spec pN`, so the log shows which arm passed.
3. **Gate 2.7** (no-branch arm, since an absorbed spec has no branch): also accept a code-review entry whose `pn` is the absorbing spec.
4. **CI:** `closure-gate.yml` runs gate 2.5 from `origin/main`'s copy of `ship-gates.sh` on the pushed tree. The new arm resolves the absorbing spec from files in that tree, so it works on the runner as long as the absorbing spec is in the repo.

## Alternatives Considered

- **Let an agent pass `--override` when the founder said so in chat.** Rejected. `gate-override.sh` says in its own header that it is friction plus an audit trail, not a boundary, and that the pty workaround "reads as circumvention in a transcript". Normalising agents answering the prompt would empty the one place a red-gate close is marked.
- **Restore auto-close for specs the branch edited.** Rejected by the 2026-09-07 and 2026-08-31 rulings: editing a spec is not delivering it.
- **Stamp `dev` and a review onto the absorbed spec.** Rejected by the 2026-09-11 [process] entry: that records work that did not happen under that number.
- **Drop "P500 closed" from P1296's Done-When.** This is possible, but it leaves a finished spec open in the backlog, and the next absorbed spec repeats the problem.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| An agent writes `absorbed_by` plus a matching mention in another spec to close an undelivered spec | MITIGATE | The absorbing spec must also have a recorded implementation **and** a review naming it, and every box on the absorbed spec must be ticked. This is the same strength as any ticked box; the absorbing spec's review is the real check. The adversarial review probes this. |
| `/ship` runs the **main checkout's** `ship-gates.sh`, so the new arm does nothing until P1309 is on main (2026-09-07: "a tool change cannot test itself through the tool") | MITIGATE | Ship P1309 first, then run `git-ops.sh ship p500` from main |
| CI gates a pushed close with `origin/main`'s `ship-gates.sh`. If P500's close is pushed before or together with P1309, the old script fails it | MITIGATE | Push P1309 before the P500 close. Record this in the ship notes. |
| The absorbing spec resolves from a stale main-disk copy that lacks `dev` | MITIGATE | Resolve the feature branch copy first, the way gate 2.5 already resolves the spec under test |

**Non-Goals**
- Do NOT change `--override`, `gate-override.sh`, or the TTY requirement.
- Do NOT add any close-as-a-side-effect of shipping another spec.
- Do NOT change gates 1.5, 2.7b, 3.5 or 3.65.
- Do NOT backfill `absorbed_by` onto historical specs.

## Rollback Strategy

Revert the P1309 commit. Specs already closed through the new arm stay closed; reopen them by hand if the revert is for a correctness reason.

## Done-When

- [ ] `scripts/test-pipeline-gates.sh` has a new red/green section, green locally: a valid absorber passes; an absorber that is missing, has no implementation recorded, or does not name the absorbed spec fails; an absorbed spec with an unticked box fails; a spec with no `absorbed_by` behaves exactly as before
- [ ] Mutation check: disabling the new arm turns its PASS case red
- [ ] Gate 2.7 accepts a review naming the absorbing spec for an absorbed spec, and still refuses an absorbed spec whose absorber has no review
- [ ] An independent adversarial review of the change, with its findings resolved or recorded
- [ ] `features/p500_feed_card_harmonization.md` carries `absorbed_by: p1296`, and `./scripts/ship-gates.sh p500` passes gates 2.5 and 2.7 after P1309 is on main
- [ ] The CI ordering (push P1309 before any close that uses the new arm) is written into the P1309 ship notes

## Related

- [P1296](p1296_card_footer_consistency_and_stake_navigation.md): the absorbing spec; its Done-When needs P500 closed
- [P500](p500_feed_card_harmonization.md): the absorbed spec
- P1246: the override and closure gate. P1250: the removal of co-located auto-close.
- `docs/decisions.md`: 2026-09-07 [process], 2026-08-31 [process], and 2026-09-11 [process] "A spec absorbed by another cannot be closed by an agent" (on P1296's branch)
