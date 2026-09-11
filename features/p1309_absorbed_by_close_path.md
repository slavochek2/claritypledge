---
status: in-progress
type: task
rank: 99
workstream: infrastructure
created_date: '2026-09-11'
tags: [ship-gates, closure, pipeline, process]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

1. **A two-way declaration, in frontmatter only.** The absorbed spec carries `absorbed_by: pM`; the absorbing spec carries `absorbs: [pN]`. Both are read between the first two `---` lines, never from the body.
2. **One verdict, decided once** in `ship-gates.sh` before any gate runs, and read by both gates 2.5 and 2.7. The absorbed spec qualifies only when every condition holds:
   - it records **no** implementation of its own;
   - the absorbing spec has **shipped**: exactly one copy under `features/done/`. Two copies are refused as ambiguous;
   - the absorbing spec records `dev`, `fix` or `inline` (`pipeline_ran` or `flow: inline`);
   - the absorbing spec lists the absorbed spec in its `absorbs:` field.

   Every refusal names the condition that failed. A refused `absorbed_by` value is echoed with redirect and pipe characters stripped.
3. **Gate 2.5** PASSes on the absorbing spec's record only when that verdict holds. The PASS line says `implementation recorded on absorbing spec pM`. **Gate 2.7** (no-branch arm) borrows the absorbing spec's review under the same condition and says so. Gate 2.7b skips freshness for a borrowed review, since that review's freshness is judged on the absorbing spec's own ship.
4. **`git-ops.sh ship`, no-branch route:** its code-presence check requires a "ready for QA" stamp commit. For an absorbed close it accepts the **absorbing** spec's stamp, taken from gate 2.5's PASS line and never from an override. A "pN ready for QA" stamp would record work that did not happen under pN.
5. **CI:** `closure-gate.yml` runs gate 2.5 from `origin/main`'s copy of `ship-gates.sh`. Because the absorbing spec must be under `features/done/`, the runner sees exactly what the local gate sees.

**Adversarial review (2026-09-11), first version:** 2 HIGH and 4 MEDIUM findings, all fixed in the rules above and pinned as cases H10–H16:
- **H-1** (HIGH): the review could be borrowed without the absorbing spec qualifying.
- **H-2** (HIGH): an absorbing spec that had not shipped was accepted.
- **M-1**: a prose mention counted as a delivery claim.
- **M-2**: `git-ops.sh ship` demanded a stamp under the wrong number.
- **M-3**: the local and CI verdicts differed.
- **M-4**: a stale copy of a spec was picked.

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

- [x] `scripts/test-pipeline-gates.sh` has a new red/green section, green locally: a valid absorber passes; an absorber that is missing, has no implementation recorded, or does not name the absorbed spec fails; an absorbed spec with an unticked box fails; a spec with no `absorbed_by` behaves exactly as before — cases H1–H16. The legitimate closes are H1, H9 (CI path) and H15 (full `git-ops.sh ship`). The attacks refused are: missing, unshipped (H11), unbuilt (H3) or prose-only (H4) absorber; an unticked box (H5); self-absorption (H8); a borrowed review (H10); a body-only key (H12); an ambiguous absorber (H13); a hostile value (H14); no absorber stamp (H16). Suite 46 PASS, 0 FAIL
- [x] Mutation check: disabling the new arm turns its PASS case red — four mutations, each restored byte-identical by shasum. Borrowing a review without the verdict turns H3 and H4 red. Accepting an unshipped absorber turns H11 red. Skipping the `absorbs:` check turns H4 red. Stamping under the absorbed number turns H15 and H16 red
- [x] Gate 2.7 accepts a review naming the absorbing spec for an absorbed spec, and still refuses an absorbed spec whose absorber has no review — H1 passes, with the output line "recorded under absorbing spec p2001". H7 fails when there is no review at all. H3, H4 and H10 fail when the absorbing spec is reviewed but does not qualify
- [ ] An independent adversarial review of the change, with its findings resolved or recorded
- [x] A dry run of the new gates on P500 carrying `absorbed_by: p1296` gives the right verdict against the real repo. Today it is refused with its reason named: "absorbing spec p1296 has not shipped (no copy under features/done/), ship it first". That is the intended order under the shipped-absorber rule. The same pairing (`absorbed_by` plus `absorbs:`) closes end-to-end through `git-ops.sh ship` in H15. `[post-ship]` The real close is `./scripts/git-ops.sh ship p500`, once P1309 and then P1296 are on main.
- [x] The CI ordering (push P1309 before any close that uses the new arm) is written into the P1309 ship notes — see Ship Notes below

## Ship Notes

- **Order on main:** ship P1309, then P1296 (it carries P500's ticks and `absorbed_by: p1296`), then `./scripts/git-ops.sh ship p500`. `/ship` runs the main checkout's `ship-gates.sh`, so the new arm does nothing for P500 until P1309 is on main.
- **Order on push:** push P1309 in an earlier push than P500's close, or in the same push only if CI's trusted base already carries it. `closure-gate.yml` gates a pushed close with `origin/main`'s `ship-gates.sh`, so a P500 close pushed before P1309 reaches `origin/main` is refused by the old script. Pushing needs the founder in any case.

## Related

- [P1296](p1296_card_footer_consistency_and_stake_navigation.md): the absorbing spec; its Done-When needs P500 closed
- [P500](p500_feed_card_harmonization.md): the absorbed spec
- P1246: the override and closure gate. P1250: the removal of co-located auto-close.
- `docs/decisions.md`: 2026-09-07 [process], 2026-08-31 [process], and 2026-09-11 [process] "A spec absorbed by another cannot be closed by an agent" (on P1296's branch)
