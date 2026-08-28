---
status: all-done
type: task
rank: 82
workstream: infrastructure
created_date: '2026-08-28'
tags: [skills, align, detection, filtering]
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
completed_at: 2026-08-28
---

# P1185: `/understanding:detect` gains an arbiter-failure filter and item provenance

## Problem

**Situation:** `understanding:detect` scans a corpus for one declared subject's high-stakes items and ranks them by potential loss in their own currency. Ranking is the only filter it applies.

**Complication:** Stake magnitude alone does not answer the question its output is used to decide — *is this worth the comprehension instrument at all?* cp already has that filter written down (`lean-canvas.md` §Customer Segments, 2026-08-24): a challenge earns the instrument when its natural consequence-arbiter **fails** — fuzzy intent, delayed feedback, concentrated stakes, or explanatory divergence — and the **interface disqualifier** says where a specifying interface already exists, use it and don't. That filter has never been wired into the skill that produces the candidates.

Second gap: a high-stakes item you have reformulated five times without resolving is a different signal from one raised yesterday, and the cards carry neither fact.

**Question:** Should the detection skill apply the criteria the project already uses to decide whether the instrument applies?

## Appetite

**Blast radius: low** — one skill file, additive to the card format. **Reversibility: high.** **Decision density: zero** — the criteria are already defined and dated.

## Solution

Two additive changes to the card format and the ranking pass.

**1. Arbiter-failure tag per card.** Name which mode fires — fuzzy intent · delayed feedback · concentrated stakes · explanatory divergence — or `NONE`, and apply the interface disqualifier as an explicit skip with its reason stated. A card where no mode fires is not a defect; it is a card the instrument does not serve, and saying so is the point.

**2. Provenance line per card.** Earliest appearance in the corpus · number of distinct reformulations · related work produced. **Not a score.** Improving a problem statement does not restart its clock, and a stable statement with five shipped pieces of work behind it is a different signal from five reformulations — the story says which.

## Why this is a change to `understanding:detect` and not to its consumers

Both additions serve the skill's **own** job. `understanding:detect` feeds a decision about whether to run the comprehension protocol on an item; the arbiter-failure criteria are precisely cp's stated answer to that, so applying them downstream means every consumer re-derives the same filter. Provenance is stake-adjacent information that improves ranking for any consumer.

**What deliberately does NOT move here:** the four-slot problem decomposition from P1180. That is an output shape belonging to one consumer, and `understanding:reconstruct` already has its own construction (anti-point → reverse-story → point, aimed at −3/10/+3). Per `decisions.md` 2026-08-06 [process] the shareable kinds are **definitions and acceptance contracts, never elicitation procedure** — these two additions are filter and metadata, not procedure.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A wrongly-applied disqualifier silently drops a real candidate | MITIGATE | Skips are printed with their reason, never removed silently |
| Provenance reads as a quality score and gets optimised | MITIGATE | State in the skill that it is provenance, not ranking input |
| Reformulation count is unreliable on an unstructured corpus | ACCEPT | Report a range or `UNKNOWN` rather than a false precision |

**Non-Goals**
- Do NOT add the four slots. That belongs to P1180 and is not shareable procedure.
- Do NOT change how stake is estimated or the currency rules.
- Do NOT make `understanding:detect` call or be called by another skill.

## Done-When

- [x] Every emitted card carries an arbiter-failure tag or `NONE`, with the interface disqualifier applied and any skip printed with its reason
- [x] Every card carries a provenance line, with `UNKNOWN` where the corpus cannot support it
- [x] A run on a real corpus shows at least one card tagged `NONE` or skipped — proving the filter can exclude, not only include

## Related

- `docs/lean-canvas.md` §Customer Segments — the arbiter-failure criteria + interface disqualifier
- `docs/decisions.md` 2026-08-24 [product] — the fourth mode and the disqualifier
- `docs/decisions.md` 2026-08-06 [process] — what is shareable between skills
- P1180 consumes this, and does not modify it

## Evidence

Implemented in `.claude/commands/slava/understanding/detect.md` (v1.7.0 → 1.8.0): two card fields
(`arbiter-failure`, `provenance`) with their rules, a ranking rule holding set-aside items out of the
stake ordering, `### Counts` lines in the run state, a `Not for this instrument` section and a
`worth working through` column in the reader-facing deliverable, plus four quality gates.

**AC3 — the filter excludes.** Trial pass over four items in `docs/decisions.md`; two of four were
set aside, both from quoted corpus material:

| item | tag | reason |
|---|---|---|
| "the unit of disagreement is a slot, not a problem" (2026-08-28 [product]) | `fuzzy intent` · `concentrated stakes` | "unit of disagreement" is the load-bearing term two people would read differently, and the entry itself records the founder arriving at the Deutsch Gap independently — the divergence was never checked against a shared definition |
| "A prose warning inside the file it protects failed six times in fourteen days" (2026-08-28 [process]) | `explanatory divergence` | six agents each had a local explanation for their own miss; none read it as a comprehension failure |
| "Never cite `decisions.md` by line number" (2026-08-27 [process]) | `NONE` | the natural arbiter works and fires immediately — a rotted line number resolves to a visibly different entry the moment anyone follows it ("Two were checked while implementing and **both were already wrong**") |
| "Writing KDD entries on a feature branch AND on main in one session guarantees a cherry-pick conflict" (2026-08-28 [process]) | `SKIP — interface: git cherry-pick conflict detection + `git-ops.sh ship`` | the conflict fires deterministically at merge and blocks until resolved — a specifying interface already arbitrates this, so the instrument is not needed |

Both exclusions were printed with their reason rather than dropped, which is the behaviour the
MITIGATE row in Risks requires.
