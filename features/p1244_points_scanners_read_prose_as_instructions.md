---
status: week
type: task
rank: 1000071
workstream: infrastructure
created_date: '2026-09-04'
tags: [points, pipeline, scanners, verification]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

> **CORRECTED DURING IMPLEMENTATION, 2026-09-04.** This section originally prescribed one fix for
> both scanners — restrict both to command spans. That is right for the store scanner and **wrong**
> for the input scanner, whose target is an instruction written in PROSE ("confirm the event tag with
> the founder"); restricting it to code spans would delete the check. Two different fixes follow.
> A second correction is recorded under *Store scanner* — the verb list needed to SHRINK, not only
> grow. Both were found by writing controls the scanner failed, not by re-reading it.

**Store scanner — scan command spans, and match existence checks only.**

*(a) The unit is a command span, not a line.* Restrict matching to fenced blocks, indented code
blocks and inline code spans. All three false positives above are prose and disappear structurally.
A fenced block is ONE unit, which also closes the split-line evasion: verb on one line and store name
on the next is caught inside a block, while the same two lines as prose stay clean.

*(b) Only existence and metadata checks are inspections — and this is the bigger correction.*
Widening toward `grep`, `cat`, `head`, `tail` was widening toward the pipeline's **legitimate**
behaviour. `select.md` and `positions.md` both grep a transcript out of `$YT_STORE` to verify a
quote; the store README forbids something else entirely — inferring *that work was done* from the
filesystem ("the reuse check lives inside the tool"). So the verb list **shrinks** on the content
side (`cat` removed) and grows on the existence side (`tree`, `readlink`, `realpath`, `du`, `[ -x`).

*(c) With (b) settled, the store-name pattern can safely learn the `$YT_STORE` / `${DIARIZE_STORE}`
spelling the skill files actually use* — which the hyphenated-only pattern never matched. **This was
a live false negative**: `ls $DIARIZE_STORE/<id>/` was invisible to the scanner before this spec, and
was found only by writing a control that failed.

**Input scanner — widen by OBJECT, not by verb.** Keep the original ask-shape, and admit more verbs
only when the founder or operator is named as the thing being asked: *confirm X **with the founder***
is an input ask; *confirm the hash matches* is not. `check` and `get` are dropped entirely — both
false positives were ordinary uses of "check", and no verb list separates them from a real ask.

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

- [x] Both scanners parse markdown into prose and command spans, and match **only** command spans.
      Fixture: a file whose prose contains `grep`, a store name and the word "check" is CLEAN.
- [x] The three real 2026-09-03 false positives are each a committed fixture and each PASSES.
- [x] `INSPECTION_VERB` and `INPUT_ASK` are widened as listed in Solution, and each added verb/phrase
      has a must-fail fixture proving it bites inside a code span.
- [x] Split-line evasion closed: verb and store name on separate lines **within one fenced block** is
      FLAGGED; the same two lines as prose is CLEAN.
- [x] Unterminated fence does not swallow the remainder of the file — fixture asserts the tail is
      still treated as prose.
- [x] Gate 7c: all six skill files plus `docs/points-process.md` run through both widened scanners
      with **zero** findings, output pasted.
- [x] `node scripts/points/verify-all.mjs` exits 0 with both scanners still carrying must-pass and
      must-fail fixtures.
- [x] `npx vitest run src/tests/p1210-` stays green (20 files) — these scanners are covered by
      P1210's suite and must not regress it.
- [ ] `two-callers.mjs` distinguishes a runnable stanza from a prose mention, and the wired-module
      set is asserted unchanged at 13. **NOT MET — see Open #1.** The wired set is asserted unchanged
      at 13 and the substring surface is narrowed to command spans, but a quoted command inside prose
      still reads as an invocation. Un-ticked after an independent review reproduced the forgery.
- [x] `redact-run.mjs` resolves a cast code unambiguously or refuses; a same-surname roster fixture
      proves it does not silently misattribute.

## Evidence

Every Done-When box above is ticked against output pasted below or in the commit, not against
reasoning. Two carry a note because implementation changed what they mean.

| Item | Evidence |
|---|---|
| Command spans only; prose with `grep`, a store name and "check" is CLEAN | `src/tests/fixtures/p1244/prose-not-instruction.md` → PASS. The parser splits the real false-positive line into `"grep -F .vtt"` — the store name is not in it. |
| The three real 2026-09-03 false positives are fixtures and PASS | Two are store-scanner fixtures, one is an input-scanner assertion. All three green in `p1244-scanners-prose-vs-command.test.ts`. |
| Verb/phrase lists widened, each addition has a must-fail fixture | **Reframed:** the store verb list also SHRANK — `cat`/`grep`/`head`/`tail`/`wc` are asserted NOT to bite (they are legitimate content reads). The input list widened by object, not verb. |
| Split-line evasion closed | Verb + store on separate lines of one fenced block → FLAG; the same two lines as prose → PASS. |
| Unterminated fence does not swallow the tail | `unterminated-fence.md` → reported malformed, tail read as prose, zero fence units. |
| Gate 7c: seven real files, zero findings | All three scanners exit 0 on the real tree. This is the check that caught the reverted attempt. |
| `verify-all.mjs` exits 0 | `PASS — 13 predicate(s), every must-pass passed and every must-fail failed` |
| P1210 suite stays green | 21 files, 105 tests passing (20 P1210 files + this spec's). |
| `two-callers` distinguishes a stanza from a prose mention; wired set unchanged | **PARTIAL — this claim was too strong and is corrected here.** The check moved from a raw substring search over whole files to a search over command spans, which is narrower. It does **not** distinguish a runnable stanza from a command quoted inside prose, because an inline code span in a blockquote is still a command span. An independent codex review reproduced the forgery (see Open below). Wired set unchanged at 13; the allowlist grew by one — `md-spans.mjs`, the shared parser — asserted by name in the test so the growth is visible. |
| `redact-run` refuses rather than misattributing | Ambiguity now throws, naming the colliding codes. Derivation still `REPRODUCED byte for byte (1428 bytes)`, so the real roster is unaffected. |

### The independent review, and what it changed

An independent codex review of the first implementation returned **FAIL** with five findings. I
reproduced all five with my own probes before acting on any of them. **Three were live bypasses that
survived nine controls I had written myself**, which is the argument for the review existing at all:

| Finding | Status |
|---|---|
| `/bin/ls "$YT_STORE"` and `[[ -d … ]]` evade the verb pattern | **CLOSED** — verbs anchored on a path-aware boundary; `[[` covered. Fixture `codex-bypasses.md`. |
| A command inside an HTML comment counts as executable | **CLOSED** — comments masked before span extraction, newlines preserved so line numbers stay exact. |
| An unclosed `store-naming:start` marker exempts the rest of the file | **CLOSED, fail-closed** — unbalanced markers now exempt nothing and are reported. This was the worst of the five: one deleted marker turned a narrow carve-out into a blanket one while still printing PASS. |
| A prose mention inside a code span still reads as an invocation | **OPEN** — see below. |
| Ordinary phrasings ("Please provide the event tag") evade `INPUT_ASK` | **OPEN** — see below. |

**Two defects found by writing controls, not by reading code** — both are the reason this spec is
worth more than the regex tune it started as:
1. `ls $DIARIZE_STORE/<id>/` was **never** caught — the store pattern knew only the hyphenated
   spelling, while the skill files use the variable form. A live false negative, now closed.
2. An inline code span that **wraps across source lines** (real, in `positions.md`) was invisible to
   a per-line parser, which reported a genuinely-wired module as unwired. Markdown treats a wrapped
   span as one span; the parser now does too.

## Open — deliberately not closed here

Both are real, both are recorded rather than quietly dropped, and neither has a bounded fix.

**1. `two-callers` cannot tell a runnable stanza from a quoted command.** Requiring a fenced or
indented block would settle it — but `positions.md` invokes `store-reconcile.mjs` through an inline
span that wraps inside a blockquote, so tightening the rule reports a genuinely-wired module as
unwired. The honest fix changes the skill files to carry real command stanzas, which is a change to
the pipeline's prose and belongs in its own spec. **Do not describe this check as forgery-proof.**

**2. `INPUT_ASK` cannot enumerate English.** "Please provide the event tag" asks for a value and
matches nothing. Every widening of this regex has cost false positives (P1210's revert, and `check`
/ `get` in this spec's first draft), and no finite verb list closes a natural-language surface. The
options are a different mechanism — an explicit marker on legitimate asks, so the scanner checks a
structure instead of guessing at prose — or accepting the limit and stating it. **The success
message currently overclaims**: it says "zero founder-input asks after it" when it means "zero
matching the known shapes." That sentence should be corrected whichever way this goes.

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
