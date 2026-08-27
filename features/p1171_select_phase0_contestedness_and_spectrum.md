---
status: week
type: task
rank: 76
workstream: infrastructure
created_date: '2026-08-27'
tags: [skills, points-pipeline, selection, correctness]
delivery_stage: create-spec
pipeline_ran: [create-spec]
flow: inline
pipeline_plan: [create-spec, dev]
pipeline_skipped: [challenge-prd -- decision density zero, founder decisions pre-recorded; ux -- no visual surface; architect -- prose skill, no schema/API/state dependency beyond the run-file headings; generate-tests -- no code; decompose -- 5 files, 1 concern]
drafted_by: opus
exec_model: opus
exec_effort: xhigh
driver: anomaly
---

# P1171 — `select` gains a Phase 0 contestedness check and N-arguer spectrum support

## Problem

**Situation:** `/slava:disagreement:select` searches for sources first and tests the disagreement last.
Its judge step (Phase 3) evaluates the **pair**, after every sweep and transcript fetch is already
paid for. It also selects exactly **two** opposed sources.

**Complication — both defects fired in one live run, 2026-08-27.**

**(1) No contestedness check.** A run on *"whether AI concentrates power or distributes it"* consumed
**seven search sweeps and ~12 fetched-and-measured sources** before it emerged that the topic is a
**consensus**, not a disagreement. Every source found agrees AI power is *currently* concentrated:

| Source | Evidence of agreement |
|---|---|
| Andrew Ng | *"why is AI largely concentrated in the big tech companies"* |
| Harari | concentration is the thesis |
| Arthur Mensch | talk titled *"Warns Against AI Power Concentration"* |
| Yann LeCun | talk titled *"AI Is Power, Not Intelligence"* |
| Van Jones | *"I worry about where we're going"* |

The skill's **own Phase 3 judge output flagged it** — objection 1 read *"both speakers say concentrated
in the present tense"* — and the run argued past it. The founder read the judge output correctly and
diagnosed it:

> *"right so i guess here on this otpic there is consensus ! no dissagemenet - the probme is not that
> we dont agree... we agree but we dont know how to solve it? (competiion dynamics etc) - then we must
> find what kind of disagrements we can produce in this space.. what do people argue about? if they
> dont argue in this space how come it apperas as something contested?"*

**(2) Pair-shaped selection, while the rest of the chain is not.** Measured by grep 2026-08-27:

| Stage | Pair-shaped hits | Note |
|---|---|---|
| `select.md` | **18** | where the assumption actually lives |
| `prepare.md` | 8 | |
| `publish.md` | 11 | nearly all prose (credential pairs, gate-exercise pairs); only *"event tag — one per source pair"* is structural |
| `positions.md` | 3 | |
| `story-draft.md` | **0** | already N-agnostic |

`docs/points-process.md` emits **repeatable, self-describing `arguer:` blocks** under `### Side A` /
`### Side B` headings — the two headings are a **convention, not a structural limit**. Quote
verification, per-quote speaker confirmation, story drafting and the Likert −3..+3 positions are all
already per-arguer.

**This is the second time in one day `select` was found stricter than the chain it feeds.** The first
was Gate 0 rejecting multi-speaker sources that `positions`/`publish` already supported
([decisions.md:59](../docs/decisions.md), P1167). The pattern itself is the finding.

**Question:** How does selection establish that a disagreement exists *before* spending search, and
carry N positions instead of two poles?

## Appetite

Blast radius: medium — one skill's control flow plus two schema headings; no code, no data, no
migration. Reversibility: `git revert`. Decision density: **zero** — the founder decisions are
recorded below.

## Invariants

- A topic that resolves to **consensus** is a **successful, informative outcome** — reported with the
  shared premise named — never a failure to route around by widening the search.
- Per-quote speaker confirmation remains the attribution guarantee at every value of N. It is never
  amortised, sampled, or skipped because there are more arguers.

## Solution

**(a) Phase 0 — establish the fork before any video search.** Output: the named disagreement, and the
distinct positions along it, each with at least one named advocate. Consensus → report the shared
premise and **STOP without searching**. Contested → the enumerated positions become Phase 2's search
targets, replacing keyword guessing.

**(b) Generalize from a pair to N arguers, N ∈ 2..6**, each occupying a distinct enumerated position.
Generalize the `### Side A` / `### Side B` schema headings to repeatable per-arguer blocks. Reword
`publish.md`'s *"event tag — one per source pair"*.

### Founder decisions — recorded 2026-08-27, do not re-ask

- **N ∈ 2..6, start at 4.** Ten was proposed and **rejected**. Reasons are runtime, not authoring:
  every added arguer multiplies per-quote speaker confirmation, which cannot be skipped; and a room
  holds roughly five distinct positions per point before a split degrades into a survey.
  > *"we just need the full diversity on subject … not just two opositivng views but comprehensive
  > overview of all improntat views"*
- **Topic level moves from diagnosis to remedy** — *"how should we respond to X"* — because remedies
  disagree even where diagnoses agree. Founder: *"the thing of disagrement is how to solve it."*

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| With 6 voices, points may land everyone mid-scale — comprehensive and inert | DEFER | Watch on the first run; do not design around it now. The cross-camp split gets **more** likely with more arguers, which is the upside ([decisions.md:1262](../docs/decisions.md) — two of six points were built on one arguer's cross-camp split) |
| Phase 0 is prose executed by an agent, so it can be wrong | ACCEPT | A wrong Phase 0 costs one cheap check; its absence cost seven sweeps |
| Phase 0 becomes a research rabbit hole | MITIGATE | It enumerates positions and advocates; it does not evaluate them. Ranking stays in Phase 2 |
| More arguers ⇒ more agent accounts ⇒ more provisioning at filing | ACCEPT | `p1096`'s *"one agent identity per speaker"* ruling holds unchanged at any N ([decisions.md:3245](../docs/decisions.md)) |

**Non-Goals**

- Do **NOT** weaken Gate 0, the ≥75% one-way threshold, `turn-inferred` as a filing STOP, or per-quote
  confirmation.
- Do **NOT** relax the recency or audience floors as part of this work.
- Do **NOT** rebuild `prepare` / `positions` / `story-draft` / `publish` — they are already
  N-agnostic. Generalize the schema headings only. `decisions.md:643` split this chain by **moving**
  stages rather than rewriting them *"so every hard-won rule travels intact"*; that constraint holds.
- Do **NOT** drop an arguer to make a set fit. `decisions.md:1282` records that dropping a subject
  *"silently deletes the opposing camp."*

## Done-When

**Authored and verifiable now:**

- [x] `grep -c "Side A" docs/points-process.md` returns **0** — headings generalized to repeatable
      `### Arguer <n>: <name> — position <n>: <statement>` blocks, not duplicated (verified
      2026-08-27)
- [x] `docs/process-learnings.md` entry *"select has no person-level fallback from Gate 1"* is closed.
      **It is not merely subsumed** — the fallback was authored: Gate 1 runners-up are carried into
      the run file as that position's `alternates:`, Phase 2 reports *"alternates available"* instead
      of dead-ending, and swapping one in re-opens Gate 1 for that position only. Closed per the
      file's own graduation rule (entry deleted, tombstone left, decision recorded in
      `docs/decisions.md`), **not** marked done in place
- [x] Phase 0 is authored so a `CONSENSUS` verdict is a terminal, successful outcome with the shared
      premise printed and **no `yt` call made** — the *"whether AI concentrates power or distributes
      it"* run is written into the skill as a worked fixture with its five agreeing advocates
- [x] Phase 3 is authored so Phase 0 **cannot** make it redundant: the judge now runs the same-side
      check **pairwise across all N** (`N·(N−1)/2` pairs), the negative control `lJR-7_Dcess` +
      `5VSxrEH1-Rk` is named in the step, and the text states that skipping Phase 3 because "Phase 0
      established the fork" is the defect, not an optimisation
- [x] The chain is generalized to N ∈ 2..6 without rebuilding `prepare` / `positions` /
      `story-draft` / `publish` — the machine-read `arguer:` line was already N-agnostic; only
      headings, the approvals-block shape, and pair-shaped prose changed

**Requires a live pipeline run — NOT satisfied by this change:**

- [ ] A contested remedy-level topic runs Phase 0, enumerates ≥3 positions each with a named advocate,
      and those positions drive the Phase 2 search
- [ ] **Failure path exercised** (epistemic.md gate 7): a genuinely-consensus topic **STOPS at Phase 0**
      with the shared premise printed and **no video search performed**. Use *"whether AI concentrates
      power or distributes it"* — measured as consensus this session — as the fixture
- [ ] **Second failure fixture:** the retained negative-control pair `lJR-7_Dcess` + `5VSxrEH1-Rk`
      (`docs/decisions.md` 2026-08-25 [product], *"YouTube search matches words, not stances"* — two
      videos that look opposed by title and are the same side) is still caught **by an actual judge
      run**. Authoring the check is not exercising it
- [ ] A run selects 4 arguers on distinct positions, and the run file's repeatable `arguer:` blocks are
      read correctly by `positions` and `publish` without either being modified
- [ ] The Gate 1 `alternates` fallback is taken at least once on a live run

> **Why these four are open.** Phase 0 and the judge step are **prose executed by an agent**;
> `epistemic.md` gate 7 says a gate never seen to FAIL is unproven, and none of these has been seen to
> fail — or to fire — yet. They need the parked Chiang Mai run (see Open Questions §2), which costs
> `yt` quota and a founder at three gates. **Do not read the `[x]` items above as evidence for these.**

## Alternatives Considered

- **Move the judge step earlier instead of adding Phase 0.** Rejected: the judge evaluates *sources*,
  which do not exist yet at Phase 0. Different input, different question.
- **Relax recency to manufacture a pair on the consensus topic.** Considered and **rejected by the
  founder on the merits** — it would file a fake disagreement between two people who agree, which is
  worse than filing nothing. The 2022 Ng talk it would have unlocked agrees with Harari's diagnosis.
- **Keep the pair and run the same topic multiple times.** Rejected: produces N/2 disconnected runs
  with no shared point set, so the room cannot see a spectrum.

## Rollback Strategy

One skill file's control flow, two schema headings, one reworded line in `publish.md`. `git revert`.
Run files already written under the generalized schema stay readable — the `arguer:` blocks are
self-describing and were never the thing that changed.

## Related

- **P1167** (shipped 2026-08-27) — Gate 0 `turn-verified`; the *first* instance of `select` being
  stricter than the chain. Same defect shape.
- **P1164** — the marker probe `select` Phase 2b depends on.
- `decisions.md:617` — the same-side trap and its retained negative control.
- `decisions.md:1262` — a full run reaching the filing step before a blocking question surfaced; the
  argument for cheap checks early.
- `decisions.md:643` — move stages, never rewrite them.

## Open Questions

1. ~~Should Phase 0 present its enumerated positions at a **gate**, or flow straight into Phase 2?~~
   **RESOLVED 2026-08-27 at implementation — neither: it folds into the EXISTING Gate 1.** The
   question assumed the choice was *new halt* vs *no review*. It is not: Gate 1 already halts
   **before any video search**, which is precisely the spend Phase 0 exists to protect (Phase 1's own
   rule is *"Do not search YouTube for topics"*). So Gate 1 now presents the Phase 0 output block
   first, then the per-position candidates, and the founder rejects a mis-framed spectrum there.
   A separate Phase 0 gate would buy a second founder halt and **zero** additional protection — the
   only thing it would save is agent authoring effort on candidate people, which
   [CLAUDE.md](../CLAUDE.md) *Quality Over Build Speed* explicitly excludes from the cost ranking.
   **Reversible in one edit** if the founder wants the spectrum approved before candidates are
   researched: split `### [GATE 1: Founder Approves the Spectrum AND the People]` in `select.md` back
   into two halts.
2. **Parked run:** topic to be reframed to remedy level; room key `chiang-mai-ai-safety` from
   `.private/audiences.json`; Harari source `_V_ed5fuexA` already admitted `turn-verified` at 82.3%.
   Nothing filed, no run file written.
