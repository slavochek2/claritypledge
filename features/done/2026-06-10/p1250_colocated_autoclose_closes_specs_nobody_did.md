---
status: all-done
type: bug
disclosure: public
rank: 1000070
workstream: infrastructure
created_date: '2026-09-05'
tags: [process, ship, kanban, cost-control]
flow: inline
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
completed_at: 2026-09-07
---

# P1250: `/ship` reads "this branch edited the spec" as "this branch delivered the spec"

> **Rewritten 2026-09-05 after a hostile review, which found the first draft's mechanism and every
> one of its counts wrong.** The original said Phase 2b *"closes every spec whose file sits on the
> shipped branch"*. It does not, and a fix designed against that sentence would not have worked.
> Superseded figures, all mine: 23 closures (really **18**), 40 unticked boxes (really **33** — I
> counted Pre-deploy checkboxes gate 2.5 never reads), 6 standing reversals (really **5** — P1047
> and P1048 were reopened then legitimately re-closed, and I missed P1043 entirely). Every number
> below was re-derived by command.

## Problem

**Situation:** `git-ops.sh ship` Phase 2b auto-closes **co-located specs**. The real predicate is
in `detect_cospecs()`: every `features/pNNN_*.md` **edited by a commit in `main..branch`**, minus
every spec that branch **created** (`--diff-filter=A`), minus the spec being shipped. That
created-spec subtraction is P1105's fix to this same defect class, and its reasoning is already in
the code: *being touched by the branch's commits is not evidence of delivery.*

**Complication:** P1105 narrowed the predicate; it did not repair it. **Editing a spec is still
read as delivering it.** Touch another spec's file in passing during a `/dev` run — add a note, fix
a link, correct a stale reference — and shipping your branch closes it.

Verified by command, 2026-09-05:

| | |
|---|---|
| Closures via this path | **18**, across **17** distinct specs (P1152 twice) |
| Standing reversals, reopened by hand | **5** — P1043, P1044, P1045, P1241, P929 |
| Closed with **zero** ticked and work outstanding | P1162 (0/7), P828 (0/21), P558 (0/5), P572 (no completion section at all) |

**A 28% hand-reversal rate is the measurement that matters.** Five of eighteen were caught only
because a person noticed — one commit says so outright: *"reopen — ship closed a live bug spec as a
side effect"* (`cd5d11340`). Nothing detects the ones nobody notices.

**The cost is not hypothetical.** P1162 **is the Gemini spend cap**.
[P1237](p1237_batch_pipeline_gemini_vs_six_steps.md) went looking for a spend cap on
2026-09-04, found none, and recorded its absence — with no idea a spec sitting in `done/` claimed to
have built it. [decisions.md](../../../docs/decisions.md) L5117 calls P1162 *"open, untouched by this
work"*, written before the auto-close moved the file. P558 is the spec P1237's Related section names
as *"should be superseded by whatever this concludes"* — closed 2026-09-03, before P1237 concluded
anything. And **P1152 was closed twice**, a week apart, by two different ships: the mechanism cannot
see that it has already fired on a spec.

**Question:** What evidence should close a spec the operator did not name — and if no such evidence
survives contact with `/dev`, should closure stop being automatic at all?

## Appetite

**Blast radius:** high and silent. A wrongly-closed spec leaves the kanban asserting work is
finished, so nobody schedules it, and the next agent to need that capability rediscovers its absence
from scratch — the P1237 sequence exactly. **Reversibility:** high per spec (`chore: reopen pN`
commits exist as precedent). **Decision density:** one founder call, below.

## Approach

**Part 1 — audit, scoped to what is actually at risk.** Not all 18. Five are already reversed and
self-corrected; seven are `all-done` with the work plainly delivered. The at-risk set is the four
named above plus any auto-closure whose spec still reads `backlog`. That is roughly a dozen lookups.
The finding that mattered (P1162) was found without an audit at all, so this part is cheap or it is
not worth doing.

**Part 2 — the mechanism.** Three constraints the first draft missed, each of which rules out the
fix it proposed:

1. **Gate 2.5 cannot simply be reused.** It requires `dev`, `fix` or `inline` in the spec's own
   `pipeline_ran`. A spec genuinely delivered as a side effect of *another* spec's `/dev` run will
   essentially never carry that. Bolting gate 2.5 onto Phase 2b is therefore not a tightening — it
   is **equivalent to deleting auto-close**, while looking like a refinement. If that is the intent,
   say it plainly rather than arriving there by accident.
2. **Gate 2.5 is not a callable predicate here.** `ship-gates.sh` is a whole-script, per-`pn` run
   that resolves the spec from a `feature/${pn}-*` branch and also runs gates 2.7/3.5/3.65. A
   co-located spec has no such branch. Reuse means first factoring the checkbox scanner into a
   shared function — real work, named here rather than discovered mid-implementation.
3. **Phase 2b cannot refuse.** It runs after Phase 2's close commit, inside the main lock, and
   deliberately `continue`s on every failure, because a hard `die` there strands the branch and
   worktree (the P1057 incident). Any refusal must move to the **Phase-1 pre-lock guard**, before
   anything is committed.

**DECIDED 2026-09-07 — option (a). This was never a founder decision and should not have carried
the marker.** The founder pushed back: *"i dont understand what is loadbearing in this decision and
why i make it? does it have any influence on business, user or me?"* The honest answer is no on the
first two and marginally on the third, so the criteria for `[FOUNDER DECISION]` — CTA text, pricing,
tone, naming, value propositions — are not met. It is an internal tooling trade-off with a
reversible, script-level fix, which CLAUDE.md's "Decisive Action — No False Choices" says to take
rather than ask about. Two independent analyses (the draft's own recommendation and the hostile
review's, reached separately) converged on (a).

The operator cost is the only real one and it is small: after a ship that edited another spec, the
operator sees a line naming it and runs `/ship pM` if that spec is genuinely done. On the measured
history that is 18 occurrences across the repo's life — roughly once every few weeks.

**(a) CHOSEN — Nothing; report instead.** Phase 2b stops closing and prints *"these specs were edited by
  this branch and were NOT closed: pM, pN — close them by name if they are done."* Closure becomes
  an explicit act. **Recommended:** it addresses the cause rather than stacking a second guess on
  it, it cannot strand a branch, it needs no gate refactor, and its failure mode is a spec left open
  with a line in the log saying so — the loud direction, not the silent one.
Rejected, and why:

- **(b) Close, but stamp `closed_as: co-located-with-pNNNN`** in frontmatter, so the kanban can
  surface unaudited closes. Keeps today's convenience and makes the guess visible.
- **(c) Apply an evidence check** — subject to the three constraints above; in practice this is (a)
  with more machinery.
- **(d) Refuse the ship** while co-located specs are unresolved. The first draft called this
  "safest"; it is the option with a documented prior incident, and it belongs in the Phase-1 guard
  if chosen at all.

**Part 3 — the four March artifacts.** Same problem class, different mechanism: recorded as shipped,
never committed. `git log --all -S` proves `get_separate_wavs()`, `llm_merge.py`,
`energy_validator.py` and cross-correlation alignment in `audio.py` have never existed on any
branch. Write one verdict each — rebuild / abandon / supersede — from evidence P1237 already
produced. **Searching outside git for the lost code is explicitly a Non-Goal here:** it is the
expensive half, its likely answer changes nothing this month, and coupling it would gate parts 1-2
behind it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The fix relocates the harm instead of removing it | MITIGATE | Today a wrong close is loud — the file moves, someone reopens it, 5 times in 18. Under any tightening a genuinely-finished spec silently stays open on a WIP-limited board, and **nobody reopens that**. Option (a) mitigates by printing the names; the Done-When measures the false-positive rate instead of assuming it |
| A new refusal blocks a legitimate multi-spec ship | MITIGATE | Gate 7c: replay the last three real ships plus the documented `/ship p798 p799` shape through the new rule before it lands — not an invented case |
| Part 3's verdicts gate parts 1-2 behind them | MITIGATE | Gate 2.5 requires **every** box in every completion section, so a coupled part 3 would genuinely block the urgent half. Part 3 is reduced to a verdict from evidence in hand; the outside-git search is a Non-Goal |
| The audit is archaeology nobody acts on | ACCEPT, and scoped for it | Part 1 is cut to the at-risk set. If it grows past a dozen lookups, stop and record what was covered |
| P572 has no completion section, so no evidence check can classify it | MITIGATE | Gate 2.5 already treats a missing completion section as FAIL, fail-closed. That is a decision, not an indeterminacy — state it, so P572-shaped specs are known never to auto-close |
| Rebuilding LLM merge on one 8-of-10 benchmark over-reads n=1 | MITIGATE | The 8/10 is a reason to look, not to adopt; any rebuild is re-benchmarked per-speaker and filed as its own spec |

**Non-Goals**
- Do NOT search outside git for the lost March code here. File it as a follow-up if a verdict
  returns `rebuild`.
- Do NOT change gate 2.5 itself — it works; this is about the path that never reaches it.
- Do NOT batch-close or batch-reopen without reading each spec.
- Do NOT add a `die` inside Phase 2b. Stranding a branch and worktree mid-ship is a worse failure
  than a wrong close, and it has already happened once.

## Done-When

- [x] All **17** auto-closures classified in [§Audit](#audit-the-17-specs-ship-auto-closed-as-co-located)
      below (moved here from `docs/process-learnings.md` by P1317, 2026-09-15) —
      spec, closing commit, verdict, evidence. Verdicts rest on grepping for the claimed artifact,
      not on the checkboxes. **Corrected totals (2026-09-07): 7 delivered, 10 not**, of which 6 were
      already reversed by hand, p1162 was caught by this work, p558 is superseded by measurement, and
      2 are reopened (p572, p828). The first count on this line read "6 delivered, 11 not, 3 reopened"
      and was superseded when p1096 was re-verified as delivered — see §Audit
- [x] The three still-closed `wrongly closed` specs are reopened to `backlog`: **p1096** (0/10, no
      "felt disagreement" pipeline anywhere), **p572** (no completion section, no point-extraction
      code), **p828** (0/21, no "agentic" code in `src/`). p558 is **superseded** rather than
      reopened — P1237 retired the work it describes. **p843 was NOT reopened** despite 0/14: its
      `cohort-table.tsx` exists and carries the avatar/full-name/suppress handling, so the work
      landed and only the boxes were never ticked — the false-positive shape, caught by grepping
      for the artifact instead of trusting the count
- [x] The mechanism matches the decision above: Phase 2b reports co-located specs by name and closes
      none. `scripts/git-ops.sh` Phase 2b is now a report; `detect_cospecs` is unchanged
- [x] The new behaviour is pinned by **named canaries** in `scripts/test-git-ops-ship.sh`, both
      directions covered: `Z2` (an edited spec is left untouched, unmodified, and named in the
      report), `Z3` (a filed spec is still untouched — P1105 preserved), `UU` (a malformed co-spec
      is named, left in place, and does not strand Phase 3), and `ZZ-b`, **inverted** from
      "every bail-out restores the move" to "Phase 2b mutates nothing" — the stronger assertion,
      since it forbids the dangerous operation rather than policing its cleanup.
      **Gate 7 evidence — the canary was watched failing, not assumed:** injecting a single
      `git add` into Phase 2b produced
      `FAIL: ZZ-b (P1250): Phase 2b performs a mutation — it must only report.`
      Full suite after restore: **55 pass, 0 fail**
- [x] **False-positive rate measured, not assumed.** Rather than three sampled ships, all **17**
      specs the old rule ever auto-closed were classified by whether they were genuinely delivered
      (all completion boxes ticked) — that is the exact set the new rule would have left open:

      | | count | consequence |
      |---|---|---|
      | Genuinely delivered | **6** | one manual `ship pN` each, over the repo's whole history |
      | Not delivered | **11** | a silent wrong close **prevented** |

      **The 6 is an over-count and the 11 an under-count**, because the classification reads each
      spec's state *today*, not at close time. P1162 is in the "delivered" column only because the
      wrong close was caught and reversed and someone then did the work; at the moment it was
      auto-closed it stood at 0 of 7. So the honest read is: **~6 extra manual closes bought ~12
      prevented silent ones**, and the manual close is the loud direction.
- [x] `ship.md` no longer describes unconditional auto-close (line 39 rewritten, plus a new step
      3.8 telling the operator to read and act on the report), and the `git-ops.sh` change landed in
      the same commit `62c0a2a7b`
- [x] Four verdicts recorded in `docs/decisions.md` 2026-09-07 [technical]: `get_separate_wavs()`
      ABANDON, `llm_merge.py` SUPERSEDE (carrying its 8-of-10 as the bar any replacement must
      clear), `energy_validator.py` ABANDON, cross-correlation alignment **REBUILD** — the one live
      thread, already specced as P1252
- [x] P552 and P556 both carry a correction block naming the missing artifact, the `git log
      --all -S` evidence, and the verdict

## Audit: the 17 specs /ship auto-closed as co-located

*Recorded 2026-09-07 in `docs/process-learnings.md` and moved here verbatim by P1317 on 2026-09-15:
it is a record of this spec's work, not open work, so it does not belong in the task inbox. Its two
open outcomes (p572, p828) are tracked as their own specs.*

One line per spec: closing commit, verdict, and the evidence behind it. Method: a spec is
`delivered` only if every box in its own completion section is ticked; otherwise the artifact it
claims is grepped for. `indeterminate` is an allowed verdict and leaves the spec closed — guessing
is what produced this list.

| Spec | Closing commit | Verdict | Evidence |
|---|---|---|---|
| p1043 | `8d4a24fd3` | wrongly closed — **already reopened** | `cd5d11340` "reopen — ship closed a live bug spec as a side effect"; now `backlog` |
| p1044 | `626ac8307` | wrongly closed — **already reopened** | `d6a0b2fa8`; now `backlog`, 0/8 ticked |
| p1045 | `b83686c45` | wrongly closed — **already reopened** | `d6a0b2fa8`; now `backlog`, 0/5 ticked |
| p1047 | `2e52944c8` | delivered | reopened by `d6a0b2fa8`, then legitimately re-closed; 9/9 ticked, `all-done` |
| p1048 | `bfcacf467` | delivered | same shape as p1047; 4/4 ticked, `all-done` |
| p1057 | `a16ca1afa` | delivered | 10/10 ticked, `all-done` |
| p1096 | `fef0df4ae` | **CORRECTED same day — delivered, re-closed** | First classified "wrongly closed" on `grep -rln "felt disagreement"` returning nothing. That is a title-phrase search, and this row's own caveat had already called it a weak oracle. The mechanism shipped as the disagreement pipeline (`select`/`prepare`/`positions`/`story-draft`/`publish`/`provision-agent`), satisfies the Done-When line for line, and has been run live several times. Closed co-located with **p1156**, which built the chain contract — a genuine co-implementation |
| p1152 | `2c226cd5c`, `68b016450` | wrongly closed — **already reopened** | closed TWICE, a week apart, by two different ships — the mechanism cannot see it has already fired on a spec; now `in-progress` |
| p1162 | `43c46d6f9` | wrongly closed — **reopened 2026-09-05, then built and closed properly 2026-09-07** | 0/7 at close time; 13/13 today. The cost was real: P1237 searched for the spend cap this spec claimed to have built and found nothing |
| p1241 | `ae92afe66` | wrongly closed — **already reopened** | `c4e6ceb68` "wrongly auto-closed as co-located with p1234"; now `backlog` |
| p558 | `08b425d86` | **wrongly closed, but SUPERSEDE rather than reopen** — correction block added to the spec | 0/5 ticked. P1237 measured Gemini tying the naive baseline (0 of 10 on the minority speaker) and its Related section already names P558 as "should be superseded by whatever this concludes". Reopening would restart work the measurement retired |
| p572 | `e0982a026` | **wrongly closed — REOPEN** | no completion section at all; `grep -rln "extractPoints\|extract_points"` across `src/` and `supabase/functions/` returns nothing |
| p828 | `93972fa91` | **wrongly closed — REOPEN** | 0/21 ticked; `grep -rln "agentic" src/` returns nothing |
| p836 | `2a8a81783` | delivered | 12/12 ticked, `all-done` |
| p843 | `bb58f31ef` | delivered, boxes never ticked | 0/14 ticked, BUT `src/app/components/letters/cohort-table.tsx` exists and carries avatar / full_name / suppress handling. The work landed; the spec was never updated. Leave closed — correction block added to the spec |
| p919 | `7d7b78600` | delivered | 5/5 ticked in its completion section, `all-done` |
| p929 | `c01031dfa` | wrongly closed — **already reverted** | `af43a6519` reverted the close; now `rejected` in `archive/` |

**Totals, corrected 2026-09-07.** 17 specs. **7 delivered** (p1047, p1048, p1057, p836, p843, p919,
p1096) — exactly the cases the new report-don't-close rule costs one manual `ship pN` each. **10 not
delivered**, of which 6 had already been caught and reversed by hand, 1 (p1162) was caught by this
work, 1 (p558) is superseded by measurement, and **2 are reopened: p572 and p828.**

**The correction is the finding.** p1096 was reopened and re-closed within hours, because the first
verdict rested on grepping the spec's own title phrase — the weak oracle this table's caveat had
already named. An audit built to stop bad closures produced a bad *re-opening* by the same
mechanism: matching a name instead of testing the claim. The verdict column's rule is therefore
strengthened: **grep for the artifact the spec says it builds, and if the spec names no artifact,
the verdict is `indeterminate`, never `wrongly closed`.**

**p843 is the interesting one.** Its work shipped and its boxes were never ticked, so a
box-counting rule reads it as undelivered. That is the false-positive shape, and it is why the
verdict column required grepping for the artifact rather than trusting the checkboxes alone.

## Related

- **P1105** — narrowed this same predicate once already (filed-vs-delivered). This is the second
  visit; read its reasoning in `detect_cospecs`/`detect_filed_cospecs` before changing either.
- [P1237](p1237_batch_pipeline_gemini_vs_six_steps.md) — went looking for the spend
  cap P1162 claims to have built, found nothing, recorded the absence.
- [P1162](p1162_cap_claritypledge_gemini_spend.md) — reopened by this work on
  2026-09-05, then **built and properly closed 2026-09-07** by another session: 13 of 13 items
  ticked, via the direct-to-main path with a `ready for QA` stamp. That is the outcome this spec
  exists to make normal — the wrongly-closed spec, once reopened, turned out to be real work
  someone then did. It is no longer an open example; the historical closure remains the evidence.
- P1251 — folded in as part 3 and archived; its outside-git search is now a Non-Goal here.
- [P1252](../../p1252_merged_multiphone_audio_is_never_time_aligned.md) — the one concrete code defect
  from the March set; separate because it is an audio fix, not a record fix.
