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

- [x] All **17** auto-closures classified in `docs/process-learnings.md` (2026-09-07 section) —
      spec, closing commit, verdict, evidence. Verdicts rest on grepping for the claimed artifact,
      not on the checkboxes: **6 delivered, 11 not**, of which 6 were already reversed by hand,
      p1162 was caught by this work, p558 is superseded by measurement, and 3 are reopened below
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
