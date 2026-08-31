---
status: week
type: task
rank: 87
workstream: infrastructure
created_date: '2026-08-31'
tags: [skills, tooling, change-request, kanban]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1195: Thin `/change-request` — cut the four sections that carry no information, bound the founder-decision prompt, and repair the rank formula

## Problem

**Situation:** `.claude/commands/slava/build/change-request.md` (383 lines, verified by `wc -l`)
emits a fixed section template for every redesign spec.

**Complication:** A controlled benchmark run this session tested whether that template helps. Two
agents (same model, same repo access) wrote the **same** change-request spec from an **identical**
context brief — one following the skill, one with no template at all. An independent judge scored
both against a rubric fixed **before** either document existed, blind to which was which. The
untemplated document won:

| Rubric criterion | Templated | No template |
|---|---|---|
| Actionable problem statement | 5 | 5 |
| Factual accuracy about the code (highest weight) | 4 → **5 (corrected)** | 3 |
| Closed scope | 3 | 5 |
| Explicit non-goals | 5 | 5 |
| Nothing present only because a form asked for it | 2 | 5 |
| Length against substance | 2 (278 lines) | 5 (239 lines) |

The template lost on the two criteria that measure the template itself, and bought only one point
of factual accuracy — which, as finding 2 below records, came from **one** obligation, not from the
form as a whole.

**Question:** Which parts of this skill's output contract earn their place, and what does the rest
cost the founder?


### Correction to the benchmark record, 2026-08-31 — read this before citing the scores

The judge docked the templated candidate for presenting a **fabricated codebase
quote**: *"An empty Members tab is a far better failure than a dead Events page."*
That finding is **WRONG, and it was confirmed wrong twice before being caught.**

The comment exists verbatim at `src/app/pages/org-page.tsx:96-98` on the
`feature/p1060-events-org` worktree. It is **wrapped across two source lines**:

```
        // Swallowed on purpose — see the call site. An empty Members tab is a far
        // better failure than a dead Events page.
```

`grep -n "far better failure" <file>` returns nothing, because no single line
contains that substring. The judge ran that search and reported a fabrication;
the session lead then ran the identical search to "independently confirm" it and
reported the confirmation to the founder. Both were reproducing a method, not
testing a claim.

**Consequences for this spec's evidence:**
- The templated candidate invented nothing. Its citation record is ~25 exact
  line-level references, two off-by-one line numbers, and no fabrications.
- The no-template candidate remains the only one with a consequential factual
  error (it claimed two call sites of `actionButtons` where there are three;
  acting on it literally would have stripped the hosting action from the
  no-group first-time-host funnel).
- **The verdict does not change.** The no-template candidate still wins, but on
  scope closure and absence of restatement ONLY — not on accuracy.

**The generalisable finding, which outranks everything else here:** a
line-anchored `grep` is not a test of whether a phrase exists in source code,
because source code wraps. Every false claim produced in that session — four
across four agents — came from a wrapped-line grep or from reading the wrong
checkout of a file, and none from bad reasoning. Verify a quote with a
whitespace-normalised search, and verify a line number against an absolute path
in the intended worktree.

## Appetite

Blast radius: **high** — this skill's output contract is duplicated across five files in two git
repos (see Risks), and every future redesign spec is shaped by it. Reversibility: high (git revert
of markdown). Decision density: low — the four sections to cut and the one to keep are named by
evidence below; no product call is involved.

## Solution

Four changes to `.claude/commands/slava/build/change-request.md`, in this order.

### 1. Remove four sections from the emitted template

The judge quoted each as carrying no information a builder would act on — roughly 90 skippable
lines of the 278-line output:

- `## Operating Mode` (lines 193–198) — addresses the *agent*, not the builder. Instructions to the
  pipeline do not belong in the artifact the pipeline produces.
- `## Jobs To Be Done` (206–211) — restates the Problem Statement in a second voice.
- `## Requirements` (254–257) — restates the decisions already stated in `## Redesign`.
- `## Next Steps` (295–303) — restates a requirement, and duplicates the hand-off block Step 8
  already prints.

Also drop the **"Still valid"** rows of `## Predecessor Sections Superseded` — a row asserting that
a predecessor section is unchanged resolves to nothing the builder does. Keep the superseded rows.

### 2. Keep `## Predecessor Sections Superseded` — this is the section that earned its place

Its chain-walk obligation forced the templated agent to open the **predecessor** spec, which
surfaced P1010's Risks entry, verified verbatim at
`features/done/2026-06-10/p1010_clarity_organizations_community_container.md:61`:

> **Sole-organizer self-orphan (ACCEPT for v1):** `membership_delete` RLS is
> `USING (user_id = auth.uid())` with no role carve-out … **DEFER** a client-side "last organizer
> can't leave" guard until self-serve org creation ships.

That is the exact guard the new spec proposed, ACCEPTed and DEFERRED on a premise the founder has
since falsified. The untemplated agent never looked and missed it entirely. Finding this reframed
the feature from "new work" to "a deferred decision coming due" — the single highest-value output of
the whole run. **Do NOT propose removing this section or weakening the chain-walk.**

### 3. Bound the `[FOUNDER DECISION: ...]` self-check to founder categories

Step 7's self-check (lines 348–352) tells the agent a redesign is "the highest-risk skill" for
founder markers and that zero markers is a claim. Under that pressure the templated spec emitted
**six blocking** `[FOUNDER DECISION]` markers — including two ordinary engineering calls the
untemplated agent simply made itself: whether the guard is client-only or also server-enforced, and
how the sole-lead count is obtained.

CLAUDE.md defines founder decisions as **CTA text, pricing, tone, naming, and value propositions**.
Rewrite the check to enumerate those categories and to say explicitly that a technical
implementation choice is the implementing agent's call, not a founder gate. This cost is paid by the
founder personally — he is the bottleneck every manufactured question lands on.

### 4. Fix the rank formula

Step 4 (lines 152–155) computes a global `max rank + 1`:

```bash
MAX_RANK=$(grep "^rank:" features/*.md features/bugs_and_debt/*.md 2>/dev/null | \
  grep -oE '[0-9]+(\.[0-9]+)?' | sort -n | tail -1)
```

Verified this session: `features/bugs_and_debt/` holds `rank: 125484`, `rank: 1000053` and
`rank: 1000054.0` (a float), so the formula returns **1000055**. On the benchmark run it fell back
to emitting `rank: 1`, which collides with three existing open specs carrying `rank: 1`
(`p1058`, `p1102`, `p593` — verified by `grep -l "^rank: 1$" features/*.md`).

Two halves, both required:
- **Repair the two junk-ranked `bugs_and_debt/` files** (the 1000053 / 1000054.0 pair) and decide
  what to do with 125484.
- **Stop hand-rolling the formula.** `scripts/next-rank.sh <status>` already exists and is the
  single source per `docs/decisions.md` 2026-08-14 [process], "Kanban `rank` must be scoped to its column" ("Rank is computed **per status column, never
  globally**"). `/create-spec` calls it. `/change-request` should call it too rather than carry a
  second, divergent, global implementation. Whatever survives must ignore non-integer and absurd
  ranks. Max legitimate rank in `features/*.md` is 251.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The output contract is duplicated in **five** files across **two** git repos, and copy 5 (`.claude/hooks/verify-before-stop.py`) is **NORMATIVE** for the banned-word list — per `~/.claude/commands/slava/build/simplify/SKILL.md:86–98`, which records a prior divergence between copies | MITIGATE — do not solve here | Before cutting any heading, enumerate all five copies and reconcile against copy 5. This spec deliberately does not prescribe the reconciliation |
| Another skill may read a section being removed (`/dev`, `/ship`, `ship-gates.sh`, the kanban scanner, `/finish` criteria) | MITIGATE | `grep -rn "Jobs To Be Done\|Operating Mode\|## Requirements\|Next Steps" .claude/ scripts/ tools/` before deleting a heading — CLAUDE.md's enumerate-dependents rule |
| Editing shared agent config is JUDGMENT-class under CLAUDE.md, and `/slava:maintain:claude-md` gates `.claude/rules/*` | ACCEPT | Run the gate if the change reaches a rules file; a skill-body edit does not require it, but the dependents grep above is not optional |
| Existing shipped change-request specs still carry the removed headings | ACCEPT | No retro-edit. The change applies to specs filed after it lands |
| `/create-spec` (407 lines, verified) is a sibling that may share the same waste | ACCEPT | Explicitly **not** assumed either way. Whether to scope it in is the implementer's call after reading it — not a premise of this spec |
| Rank repair touches files owned by other open work | MITIGATE | Only the `rank:` line changes; stage those files explicitly |

**Non-Goals**
- Do NOT delete `## Predecessor Sections Superseded` or weaken the chain-walk obligation.
- Do NOT rewrite `/create-spec` as part of this spec unless the implementer first reads it and
  states the case; it is out of scope by default.
- Do NOT change `scripts/next-rank.sh`'s per-column semantics — reuse it, don't fork it.
- Do NOT renumber the kanban board.

## Done-When

- [ ] A change-request spec produced by the edited skill contains **none** of the four removed
      headings (`## Operating Mode`, `## Jobs To Be Done`, `## Requirements`, `## Next Steps`) and
      no "Still valid" rows — verified by grepping the generated file
- [ ] `## Predecessor Sections Superseded` is still present in that generated file, and the run
      still reads the predecessor spec
- [ ] The skill's Step 4 rank command, run fresh, returns **253** (or the current
      `next-rank.sh {status}` value) — never 1000055 and never a fallback `1`
- [ ] `grep -h "^rank:" features/bugs_and_debt/*.md | sort -t: -k2 -n | tail -3` shows no value
      above the legitimate board maximum and no float
- [ ] The `[FOUNDER DECISION]` self-check names the five CLAUDE.md categories and states that
      technical implementation choices are not founder gates
- [ ] The dependents grep across all five copies of the output contract is pasted into the PR/ship
      evidence, showing nothing else reads a removed heading

## Related

- **DUPLICATE: none.** Searched `features/` and `docs/decisions.md` for `change-request`,
  `next-rank`, `rank formula`. Hits are usages of the skill, not specs to thin it.
- **RULINGS: 3 found** — `docs/decisions.md` 2026-08-14 [process], "Kanban `rank` must be scoped to its column" (rank is per-column, `next-rank.sh` is the single
  source; the global scale caused exactly this 1000045-class reinfection before);
  `docs/decisions.md` 2026-08-19 [process], "Retiring a Non-Goal is a recorded act" (the Superseded table is the founder-approved authorization to evolve a
  predecessor's contract test — a second reason the section must survive);
  `docs/decisions.md` 2026-08-26 [process], "A skill with zero inbound references is not 'available'" (`/change-request` offers `/problemify`, never calls it — unaffected).
- `~/.claude/commands/slava/build/simplify/SKILL.md` — the five-copy map and the copy-5 normativity
  warning.
