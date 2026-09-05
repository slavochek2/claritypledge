---
status: week
type: bug
rank: 1000070
workstream: infrastructure
created_date: '2026-09-05'
tags: [process, ship, kanban, cost-control]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
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
[P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) went looking for a spend cap on
2026-09-04, found none, and recorded its absence — with no idea a spec sitting in `done/` claimed to
have built it. [decisions.md](../docs/decisions.md) L5117 calls P1162 *"open, untouched by this
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

`[FOUNDER DECISION: what closes a co-located spec.]`

- **(a) Nothing — report instead.** Phase 2b stops closing and prints *"these specs were edited by
  this branch and were NOT closed: pM, pN — close them by name if they are done."* Closure becomes
  an explicit act. **Recommended:** it addresses the cause rather than stacking a second guess on
  it, it cannot strand a branch, it needs no gate refactor, and its failure mode is a spec left open
  with a line in the log saying so.
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

- [ ] The at-risk auto-closures are classified in `docs/process-learnings.md`, one line each: spec,
      closing commit, verdict, evidence. A verdict that exists only in conversation does not count
- [ ] Every spec classified `wrongly closed` is reopened, each in a commit whose subject names the
      spec and the reason
- [ ] The founder decision above is answered here, and the mechanism changed to match
- [ ] The new behaviour is pinned by a **named canary** in `scripts/git-ops.sh`'s existing canary
      series, exercising both directions: a co-located spec that must NOT be closed, and — if the
      chosen option still closes anything — one that must be
- [ ] **False-positive rate measured, not assumed:** the last three real ships plus the documented
      `/ship p798 p799` shape are replayed through the new rule, and the number of specs it would
      newly leave open is recorded in this spec
- [ ] `ship.md:39` no longer describes unconditional co-located auto-close, **and** the code change
      making that true lands in the same commit — a doc-only edit does not satisfy this
- [ ] Each of the four March artifacts has a written verdict with its reason, recorded in
      `docs/decisions.md`
- [ ] P552 and P556 no longer assert outcomes their code did not deliver

## Related

- **P1105** — narrowed this same predicate once already (filed-vs-delivered). This is the second
  visit; read its reasoning in `detect_cospecs`/`detect_filed_cospecs` before changing either.
- [P1237](done/2026-06-10/p1237_batch_pipeline_gemini_vs_six_steps.md) — went looking for the spend
  cap P1162 claims to have built, found nothing, recorded the absence.
- [P1162](p1162_cap_claritypledge_gemini_spend.md) — reopened by this work.
- P1251 — folded in as part 3 and archived; its outside-git search is now a Non-Goal here.
- [P1252](p1252_merged_multiphone_audio_is_never_time_aligned.md) — the one concrete code defect
  from the March set; separate because it is an audio fix, not a record fix.
