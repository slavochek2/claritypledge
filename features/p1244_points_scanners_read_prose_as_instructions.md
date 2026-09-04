---
status: week
type: task
rank: 1000071
workstream: infrastructure
created_date: '2026-09-04'
tags: [points, pipeline, scanners, verification]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1244: The points scanners read prose as if it were an instruction, so they cannot be widened

## Problem

**Situation:** `scripts/points/store-inspection-scan.mjs` and `scripts/points/input-block-scan.mjs`
guard the six disagreement-pipeline skill files — the first against a stage being told to inspect a
machine-global store directly, the second against a stage asking the founder for a value after the
input block has closed. Both read the **entire markdown file** line by line and match regexes over
every line.

**Complication:** both regexes are narrow enough to be evaded by an ordinary rewording, and the
obvious fix does not work. `INSPECTION_VERB` matches only `ls|find|cat|stat|test -f`, so
`grep -r diarize-store ~/.local/share` passes. `INPUT_ASK` is anchored on the literal word "ask", so
*"confirm the event tag with the founder"* passes. At the P1210 ship on 2026-09-03 both lists were
widened and the gate went **red with three false positives on files that were already correct**:

| Flagged line | Why it is not a defect |
|---|---|
| ``**Verification:** `grep -F` against the cleaned transcript … resolved strictly from the RAW `.vtt` file in the yt-store (§0.6)`` | describes grepping a **transcript**; "yt-store" appears as a cross-reference |
| "A whitelist-and-count **check** is what makes a hash of an opaque SQL string mean anything." | explanatory prose; matched `check` + `for a` |
| "Same shape as the **check** above and **for the** same reason…" | explanatory prose |

All three are prose *describing* the pipeline, not instructions to it. The widening was reverted.

**Question:** how do these scanners tell an instruction from a sentence about one — so that the verb
and phrase lists can be widened without the false-positive rate going with them?

> Founder framing, verbatim: *"should you fix?"* — asked after the revert was reported, once P1210
> had shipped and the constraint that forced the revert no longer applied.

## Appetite

**Blast radius: low** — two scanner modules and their fixtures. Nothing outside `scripts/points/`
reads them; they gate six markdown skill files and no runtime code path.
**Reversibility: high** — `git revert`; no schema, no deploy, no data.
**Decision density: zero founder decisions.** The detection shape is an engineering call and the
evidence for it already exists (the three false positives above).

## Invariants

- Each scanner keeps a **must-pass and a must-fail fixture**, and `verify-all.mjs` continues to sweep
  both through the identical code path. A predicate that loses its must-fail fixture fails the sweep
  by construction (P1210 DW-20, now wired into `npm test` via `src/tests/p1210-verify-all-sweep.test.ts`).
- The **exemption stays a delimited region**, never a filename — `docs/points-process.md` §0.6 is the
  one sanctioned place a store may be named, and it is exempt by region so that adding a file to the
  scan cannot silently exempt it (P1210 DW-12).

## Solution

**Scan command-shaped content only; never prose.** Restrict both scanners to text inside fenced code
blocks and inline code spans, and ignore everything else in the file. All three false positives above
are prose and are eliminated structurally rather than by tuning a word list.

Then widen, which is safe once prose can no longer match:

- `INSPECTION_VERB` gains the inspection commands an agent would plausibly write — `grep`, `head`,
  `tail`, `wc`, `du`, `file`, `tree`, `less`, `readlink`, `realpath`.
- `INPUT_ASK` gains the phrasings that ask for a value without the word "ask" — *confirm … with the
  founder*, *get … from the operator*, *obtain*, *request*.

**Treat a fenced block as one unit.** This closes the split-line evasion in the same change: today
`store-inspection-scan.mjs` requires the verb and the store name on the **same line**, so a two-line
instruction (verb on one, store on the next) evades it. Inside a fenced block that restriction is
wrong anyway — a shell block is one instruction sequence. Match verb-anywhere-in-block against
store-name-anywhere-in-block. Prose is unaffected because prose is no longer scanned.

Not part of the shape change, listed because they live in the same modules and were found in the
same review: `two-callers.mjs`'s "invoked by a skill file" test is a raw substring match that cannot
distinguish a runnable stanza from a prose mention (**the same prose-vs-command problem, third
instance** — fix it with the same code-span restriction); and `redact-run.mjs`'s `codeForPerson()`
resolves a cast code by surname alone, so two arguers sharing a surname would be misattributed.

## Alternatives Considered

**Widen the verb and phrase lists only.** Attempted 2026-09-03 and reverted — three false positives,
recorded above. Rejected on evidence, not on judgment.

**Tune a similarity or proximity threshold.** Rejected: the false positives are not near-misses, they
are ordinary English sentences that happen to contain a command word. No threshold separates
*"grep the transcript"* from *"grep the store"* without reading the surrounding structure, which is
what the code-span restriction does directly.

**Delete the scanners.** Rejected: both catch a real defect class that reached the pipeline before —
P1210 DW-12 removed eleven literal store paths that were live in the skill files at branch start.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A real instruction written as prose ("read the diarize store directly") is no longer caught | **ACCEPT** | It was never caught — today's regex needs a command verb too. The change trades an unmeasured false-negative surface for a measured false-positive rate of zero. State the limit in the module docstring rather than implying coverage. |
| Widened verbs re-introduce false positives inside code blocks | MITIGATE | Gate 7c: run all six skill files plus `docs/points-process.md` through the widened scanner and require zero findings before committing. This is the check that caught the 2026-09-03 attempt. |
| Markdown parsing (fences, inline spans, nesting) is subtly wrong | MITIGATE | Fixtures covering: fenced block, indented fenced block, inline span, a fence inside a blockquote, and an unterminated fence. An unterminated fence must not swallow the rest of the file. |
| Fixing `two-callers.mjs` changes which modules read as "wired" | MITIGATE | No current false pass — both affected modules have a genuine invocation elsewhere. Assert the current 13-module wired set is unchanged before and after. |

**Non-Goals**
- Do NOT change what either scanner *means* — the sanctioned-naming region, the input-block model,
  and the verdict strings stay as P1210 defined them.
- Do NOT touch the other eleven predicate modules, their fixtures, or `goal-gate.sh`.
- Do NOT edit the six skill files or `docs/points-process.md` to make the scanner pass. If the
  widened scanner flags one of them, that is a finding to report, not a file to rewrite.
- Do NOT add a similarity threshold to any predicate.

## Done-When

- [ ] Both scanners parse markdown into prose and command spans, and match **only** command spans.
      Fixture: a file whose prose contains `grep`, a store name and the word "check" is CLEAN.
- [ ] The three real 2026-09-03 false positives are each a committed fixture and each PASSES.
- [ ] `INSPECTION_VERB` and `INPUT_ASK` are widened as listed in Solution, and each added verb/phrase
      has a must-fail fixture proving it bites inside a code span.
- [ ] Split-line evasion closed: verb and store name on separate lines **within one fenced block** is
      FLAGGED; the same two lines as prose is CLEAN.
- [ ] Unterminated fence does not swallow the remainder of the file — fixture asserts the tail is
      still treated as prose.
- [ ] Gate 7c: all six skill files plus `docs/points-process.md` run through both widened scanners
      with **zero** findings, output pasted.
- [ ] `node scripts/points/verify-all.mjs` exits 0 with both scanners still carrying must-pass and
      must-fail fixtures.
- [ ] `npx vitest run src/tests/p1210-` stays green (20 files) — these scanners are covered by
      P1210's suite and must not regress it.
- [ ] `two-callers.mjs` distinguishes a runnable stanza from a prose mention, and the wired-module
      set is asserted unchanged at 13.
- [ ] `redact-run.mjs` resolves a cast code unambiguously or refuses; a same-surname roster fixture
      proves it does not silently misattribute.

## Related

- **Predecessor:** [p1210](done/2026-06-10/p1210_disagreement_pipeline_objective_and_point_unit.md) —
  built these scanners; its §12 non-goal forbade tuning them mid-branch. Shipped 2026-09-03, so that
  constraint has lifted. Findings and the reverted attempt: `features/uat/p1210.md`.
- **Same failure class, different target:** [p1009](p1009_single_value_canary_evasions.md) — a
  markdown guard that recognises one shape and is evaded by every other. Worth reading before
  choosing the parsing approach; the two may share a helper.
- Deferred-work entry: `docs/process-learnings.md` (filed 2026-09-03).
- Rulings applied: `docs/decisions.md` 2026-09-03 [process] — presence checks are one-sided;
  [technical] — the contract-pin normalizer.
