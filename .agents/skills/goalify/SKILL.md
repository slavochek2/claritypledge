---
name: goalify
description: >
  Write down what "done" means for a spec, as a contract an exit code can decide,
  so an unattended loop can run it without pulling the founder back in.
  Emits one decision sheet, one reference approval, and a `/goal` line.
when_to_use: >
  After a spec exists (any buildable type) and before handing it to an unattended
  run. Triggered by "/goalify pN", "make this loopable", "prepare pN for /goal".
  Not for research notes — `type: comment` is refused by type.
version: 1.0.0
---

# /goalify pN

Turn a spec into a **contract**: a written definition of done where every line is
decided by a command, by a blind reviewer against a named reference, or by a
person — and where the finish line is `./scripts/goal-gate.sh pN` exiting 0.

**You prepare. The loop runs.** This skill never builds anything.

---

## The design rule — CONTRACT, never PROCEDURE

**Goalify specifies the OUTCOME. It names no skills, no flow, no model tier.**

A control that encodes a *method* rots. A control that encodes an *outcome* does
not. Two of this repo's own quality steps sat unmeasured for four months; a plan
mandating them would have mandated something last used in June. So this skill
does not restate the delivery process, does not name which steps the loop should
run, and does not pick a model — model tiers change every few months and a skill
that hardcodes one freezes a stale choice.

Repo **facts** (where tests live, what must never happen, which helper mints a
JWT) are not procedure and do not rot the same way. Those may be carried.

The **one** durable constraint this skill does impose, because it is about
independence rather than method: **the blind reviewer must not be the agent that
built the thing.** That is the only property the evidence supports — one feature
needed four review rounds, every defect was found by a reviewer given renders and
nothing else, and every version had already passed the implementer's own review.

---

## Why the finish line is an exit code

The loop's evaluator is an LLM reading **the transcript**. It runs nothing and
opens nothing. A goal condition phrased *"command X reports Y, output pasted"* is
therefore scored on **text the agent wrote** — forgeable by the entity it binds.

So the goal condition is one clause, and the thing it names is an exit code the
agent cannot author:

```
./scripts/goal-gate.sh pN exits 0, output pasted. Stop after 30 turns.
```

**One clause, deliberately.** More clauses push evidence out of the evaluator's
window and force re-pastes from memory — which is fabrication pressure.

**State the guarantee honestly.** The loop still stops on the agent's *paste* of
the exit code. Nothing here changes that. What the gate buys is that forgery and
decay are caught **at the merge boundary** by CI, before anything reaches main.
Expect a walk-back that is usually-but-not-always green. Do not promise a
"self-proven branch"; promise batched, end-loaded founder turns with a real merge
gate.

---

## Scope — one skill, all buildable types

What varies is what counts as evidence, not the machinery.

| `type:` | contract shape |
|---|---|
| `bug` | the reproduce artifact's failing test passes, and nothing else breaks. **Half the verification already exists** — the failing test IS the contract's first row |
| `story` / `feature` | done-when lines, plus an approved visual reference |
| `task` | command output |
| `change-request` | the delta only; the parent spec's contract is the regression baseline |
| `comment` | **REFUSE BY TYPE.** Research notes have no done-state a command can decide. Say so and stop |

---

## Phase 0 — triage, and the refusal

Read every `## Done-When` and `## Acceptance Criteria` line. Classify each:

- **MECHANICAL** — a command decides it. Exit code, nothing else.
- **COMPARABLE** — a blind reviewer decides it against a **named reference**.
- **HUMAN-ONLY** — needs a person who has not read the spec, or founder taste.

**Refuse to emit if HUMAN-ONLY > 25%.** Report the count and the offending lines.
A spec that is mostly taste is not loopable, and pretending otherwise produces a
run that burns 30 turns and lands on a judgement nobody made.

**Write the classification into the spec and show it on the decision sheet.** The
agent that wants to emit must not be the sole grader of whether it may.

---

## Phase 1 — the decision sweep (founder turn 1 of 2)

**One** `AskUserQuestion` sheet. Recommendation first, every time. Gather:

- every unanswered `[FOUNDER DECISION: ...]` marker in the spec
- every Phase-0 classification you were not sure about
- the visual reference and the density intent, if the spec is visual
- anything the spec leaves open that the contract needs in order to be decidable

Answers land in a new `## Resolved Decisions` section.

**Append-only.** Goalify never rewrites `## Problem`, `## Solution`, `## Appetite`
or `## Risks / Non-Goals`. Those are the founder's.

---

## Phase 2 — the reference (founder turn 2 of 2, visual specs only)

Goalify requires that a visual reference **exists and is approved**. It does not
mandate the tool that produces it.

- **New surface** → a rendered prototype the founder can look at.
- **Existing surface** → drive the real route with Playwright and
  `getTestAuthContext()` from `e2e/helpers/auth-context.ts`, which mints a real
  user JWT.

**This is the state-reach answer, and it is the whole point of the phase.** The
recorded UI complaints — *"barely functional, never usable"*, *"worse than
before… actually unusable"* — came from **gated interactive states**: auth, plus
seeded data, plus a phase transition. An isolated component fed mock props cannot
reach those states, so a reference built that way certifies a screen the user
never sees. Reach the real state or say plainly that you did not.

Expect this to be iterative on a genuinely new surface; one recent feature needed
four rounds.

---

## Phase 3 — write `## Verification Contract`

Append to the spec. One row per done-when line:

```markdown
## Verification Contract

| line | class | decided by | artifact |
|---|---|---|---|
| DW-1 the failing repro test passes | MECHANICAL | `npx vitest run src/tests/pN-repro.test.ts` | src/tests/pN-repro.test.ts |
| DW-2 renders correctly at 320/375/desktop | COMPARABLE | blind-reviewer | features/verification/pN/review-round-*.md |
| DW-3 the copy feels right | HUMAN-ONLY | founder | — |
```

- ***decided by*** is a **literal command** for MECHANICAL rows — the gate runs
  this cell verbatim. Not a description of a command.
- Rows whose command mentions Playwright are **local tier**: CI has no browser
  and no database credentials, by design.

**The reviewer roster** — record, for each reviewer:

- what it is **given**: renders, and the named reference
- what it is **forbidden** to see: the diff, the intent, the spec's rationale
- what it is **guaranteed** to be given: **320px, 375px, desktop, and the empty
  state** (`.claude/rules/visual-qa.md`)

**Evidence lives in `features/verification/pN/`:**

| file | holds |
|---|---|
| `contract.sha256` | the pin (Phase 5) |
| `review-round-N.md` | `VERDICT: PASS\|FAIL`, then one `SCREENSHOT: <sha256>  <path>` line per image judged. **The reviewer writes this file directly.** The gate re-hashes every image itself — it never trusts a hash it is handed |
| `assumptions.md` | every call the loop made alone. **There is no escalation clause**: the agent decides, logs, continues. The log is the price of not being interrupted |
| `feedback.md` | **two numbers, never one** — `corrections given` (quality) and `turns consumed` (cost). Quality bought with runaway spend reads as success on a one-axis scoreboard, and cost is ranked dimension (5) in CLAUDE.md |

`feedback.md` is written **at the moment corrections are given**, not
reconstructed later. These are the first countable measures this pipeline has
ever had; a learning loop with no recorded history starts empty.

---

## Phase 4 — red-first

Run every MECHANICAL row's command **now**, before the loop exists, and paste the
failures. A row that cannot be made to fail is flagged **unproven** in the
contract and does not silently count as evidence.

A check you have never seen fail is not a check.

---

## Phase 5 — emit

**1. Pin the contract to main.** Without this the gate reads its judging criteria
from the branch it is judging, and the loop can delete a row it is about to fail.

```bash
mkdir -p features/verification/pN
./scripts/goal-gate.sh pN --print-contract-hash > features/verification/pN/contract.sha256
```

Commit that pin **to main** (it is also what makes CI run the gate at all — the
pin is the trigger, precisely because a branch cannot delete a file on main).
The `--print-contract-hash` flag is the *same* implementation the gate checks
with, so the pin and the check cannot drift apart.

**2. Claim the worktree — two arguments, always.**

```bash
eval "$(./scripts/git-ops.sh claim pN short-description 2>/tmp/claim-stderr.log | \
        sed -n '/^#CP_CLAIM_BEGIN$/,/^#CP_CLAIM_END$/p' | grep -v '^#')"
cat /tmp/claim-stderr.log
```

One argument exits 2. The sentinel `eval` form is required so the nonce exports.

**3. Check where the session already is — never *tell* the founder to `cd`.**

Run `pwd`. The claim in step 2 may have put this very session in the slot, in
which case an instruction to "run it from wN" describes somewhere they are
already standing, and reads as a second task that does not exist. Compare against
the claimed slot path and say which of the two is true:

- **already there** → say so in those words, then print the line alone.
- **not there** → put the `cd` *inside* the copy-pasteable block, never beside it.
  One paste, one action.

The invariant behind this is unchanged and is why the check exists at all: a loop
left running in the main checkout shares an index and HEAD with co-tenant
sessions and can flip verification into **prod mode** — writing rows to the live
database, unattended.

**4. Write the goal line into the spec *before* printing it.**

A line that exists only in a chat message is lost to the next compaction, and the
founder is then reconstructing a security-relevant command from memory. Insert a
`## Run This` section immediately after the spec's H1 title — top of file, so it
survives skimming:

```markdown
## Run This

Run from `<absolute slot path>` (this is the claimed worktree for this spec):

    /goal "./scripts/goal-gate.sh pN exits 0, output pasted. Stop after 30 turns."

`/goal` is native Claude Code, not a repo skill — the founder types it; no agent
can invoke it for them. The condition names an exit code on purpose: the
evaluator reads the transcript and runs nothing, so the only trustworthy
condition is one naming an artifact the agent cannot author.
```

**Top of file, never inside `## Verification Contract`** — the pin hashes that
section alone, and a new heading inside it silently breaks the digest.

**5. Print the same line and stop.**

No adjectives in the goal condition. Ever.

---

## What goalify does not do

**It does not ship.** The loop stops at a committed branch on a worktree. Merging
to main, migrating prod, deploying and pushing are all ALWAYS-ASK and none are
pre-approvable. The founder looks, then ships. This is not a limitation to remove
later.

**It does not author the spec.** Bring one.

**It does not name a model or an effort level.** That guidance lives in
`.claude/rules/model-effort.md`, which goalify points at and never copies.
