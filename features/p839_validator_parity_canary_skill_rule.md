---
status: week
type: task
rank: 1000770.0
workstream: infra
created_date: '2026-05-15'
tags: [skills, generate-tests, spec-review, validation, regression, process]
delivery_stage: challenge-prd
pipeline_ran: [create-spec, challenge-prd]
---

# P839: Require validator-parity canaries in /generate-tests + /spec-review check

## Problem

**Situation:** `/slava:build:generate-tests` produces a Test Coverage Strategy from a spec and writes runnable test files. `/slava:build:spec-review` audits a complete spec for missing coverage. Neither has a rule that requires a parity canary against client constants and DB CHECK constraints when a spec adds an edge function with input validators.

**Complication:** P835 (2026-05-15) was a born-broken edge-function validator that survived 5 weeks because no test ever round-tripped the live client constant through the live server predicate. The /reproduce inline audit (this session, replacing the original P838 spec) backfilled canaries for the existing surface; P839 prevents the same class from re-occurring on every new edge function shipped from now on. **The /challenge-prd review surfaced a deeper structural issue:** P835 was caught by `/reproduce`, not by `/generate-tests` — the bug existed because no test workflow ran for that edge function at all, not because the workflow ran and produced wrong output. A rule placed only in `/generate-tests` only fires when `/generate-tests` is invoked; manual-test workflows bypass it.

**Question:** What's the minimum two-skill rule change that mechanically requires a parity canary whenever a new edge-function input validator lands, regardless of whether the test was generated or written manually?

## Appetite

Low blast radius (touches two skill files, possibly one rules file — no production code, no specs already in flight). Reversible (revert each skill edit). Low decision density once the trigger condition is settled — the worked example (`src/tests/p835-reproduce.test.ts`) defines what a canary looks like.

The trigger condition is the only real design call: it must fire correctly on edge-function specs without false-positive triggering on, e.g., specs that only modify an existing function, frontend-only specs that mention bounds, or specs that add a function with no input validators (background workers, fan-outs).

## Solution

**Two-skill change with complementary roles:**

### Edit 1: `/generate-tests` (the generator)

Edit `.claude/commands/slava/build/generate-tests/SKILL.md` to add a rule with the following shape:

> **Validator parity canary requirement.** When the spec text contains both (a) a new file path under `supabase/functions/` AND (b) at least one of the following predicate-shape signals: a named function matching `is(Valid|Allowed|Acceptable)*`, a constant ending `_REGEX`, a constant matching `ACCEPTED_*` or `VALID_*`, or an explicit numeric/length bound annotated as a server-side check (e.g. `rating must be 0–10`, `name <= 200 chars`) — the generated Test Coverage Strategy MUST include a parity canary section. Each validator gets one canary file at `src/tests/p{N}-parity-<function>-<predicate>.test.ts` that:
>
> 1. Imports every live client constant the validator's payload depends on.
> 2. Embeds a verbatim copy of the server predicate (rationale: see P835 KDD — Deno cannot be imported from Vitest; the verbatim copy catches drift if the function source is later refactored).
> 3. Asserts every reachable client value passes the predicate.
> 4. If a corresponding DB CHECK constraint exists on the column the value will land in, also asserts the value satisfies that constraint (re-implemented in TS for literal range / enum / length predicates only — do not attempt complex CHECK expressions).
> 5. Includes a header comment of the form `// SOURCE: <function>/index.ts:<line range> — keep in sync` pointing at the predicate it mirrors.
>
> If the spec adds a validator but no client constant exists yet (server-only enum), document the value-set in the canary and assert the documented set passes — the canary then doubles as the spec for what the validator accepts.
>
> Skip the rule when: (a) the function has no input validators (cron workers, fan-out workers), or (b) the spec is modifying an existing validator (the existing canary covers it; if missing, file an inline backfill before proceeding).

### Edit 2: `/spec-review` (the safety net)

Edit `.claude/commands/slava/build/spec-review.md` to add one check to its audit pass:

> **Validator parity check.** If the spec adds a new file path under `supabase/functions/` AND defines or references a validator predicate (same signal set as `/generate-tests` rule above), the spec's `## Test Coverage Strategy` section MUST list at least one parity canary file at `src/tests/p{N}-parity-*.test.ts`. If absent → emit `BLOCK: validator parity canary missing — see P839 rule`. This catches the case where tests were written manually (bypassing `/generate-tests`) or where `/generate-tests` ran before this rule landed.

### Edit 3 (conditional): `.claude/rules/tests.md`

Only if the `/claude-md` gate (run as Done-When step 1) confirms the addition is universal and non-redundant. The paragraph in `tests.md` is **not** a rule for the agent to follow — `tests.md` auto-loads when editing test files, so the paragraph functions as developer-facing documentation when someone manually writes a test for an edge function. If the gate flags it as redundant with the two skill rules above, skip Edit 3 entirely and rely on the skill rules.

## Risks / Non-Goals

### Risks
- **Trigger detection is approximate.** The `/generate-tests` rule pattern-matches spec text; specs that describe a validator in prose without naming a predicate (e.g., "validate the input") may not trigger. The `/spec-review` check is the safety net for this case — if the validator exists in code but no canary appears in Test Coverage Strategy, spec-review BLOCKs. Two-layer detection accepted in lieu of a perfect classifier.
- **`/spec-review` BLOCK may surface late** (after `/architect` and `/generate-tests` have run). Mitigation: the BLOCK message names the missing artifact and the worked example; resolution is one canary file. Late-stage BLOCK is preferable to no detection.
- **Server-only enum pattern (no client constant) creates a hidden coupling.** The canary documents the accepted value-set; if the server validator changes, the canary stays green against the old set. Mitigation: the SOURCE comment in the canary header (per Edit 1 step 5) points at the validator's source line; reviewers see drift on diff.
- **`/claude-md` gate may reject Edit 3 as redundant.** Mitigation: this is the intended behavior of the gate — Edit 3 is conditional, not required.

### Non-Goals
- Do NOT add the rule as a hard pre-commit hook. The skill rules + `/spec-review` BLOCK cover the same ground without a duplicate "what is a validator" grammar living in shell.
- Do NOT extend the rule to non-edge-function code paths (RPC functions, RLS expressions). RPCs have their own integration-test layer; RLS has its own dedicated test pattern. Scope to `supabase/functions/`.
- Do NOT touch `/architect` to require validator declarations in the architecture section. The validator pattern is a test-layer concern.
- Do NOT auto-migrate existing edge-function specs to include canary references. The inline backfill (this session) handles existing surface; P839 is forward-only.
- Do NOT add the synthetic dry-run as a Done-When (per challenge WARN-1: a mental dry-run by the implementing agent is self-attestation theatre, not falsification). Verification is a real run on a real spec.

### Alternatives Considered
- **Hook-based scanner (`scripts/check-validator-canary.sh`) run pre-commit.** Rejected: a hook needs its own grammar for "what is a validator" — duplicates the rule's logic, and a false-positive hook is louder/more disruptive than a missed canary. The two-skill approach uses the skill's existing spec-text understanding without adding a third grammar.
- **Embed the rule only in `/architect`.** Rejected: `/architect` decides what to build, not how to test. A canary is a test concern.
- **Embed the rule only in `/generate-tests`.** Rejected by /challenge-prd review (HQ-1): P835 was caught outside `/generate-tests` because the workflow was bypassed. A rule that only fires when the skill is invoked does not catch the workflow-absent case.
- **Move bound constants to a shared module imported by client + edge function.** Rejected: Deno's import rules and the Vitest build do not share a module graph; a JSON spec consumed at build time on both sides is build infra that does not exist.
- **Defer P839 until the inline backfill (this session) sets a base rate.** Rejected: blast radius is genuinely low (two skill files), fully reversible, and the pattern from the inline audit already demonstrates the value is real. The 6-month review trigger from challenge HQ-3-C is captured below as a follow-up signal, not a deferral.

### Rollback Strategy
Revert Edit 1 (`SKILL.md`), Edit 2 (`spec-review.md`), and Edit 3 (`tests.md`, if applied) — each is a single-commit revert. No specs already in flight depend on the rules (forward-only).

## Done-When

- [ ] `/claude-md` gate run before any rule-file edit (covers Edit 3 specifically; the skill `SKILL.md` and `spec-review.md` files are not gated by `/claude-md` — confirm during execution).
- [ ] `.claude/commands/slava/build/generate-tests/SKILL.md` updated with the validator-parity canary rule (Edit 1).
- [ ] `.claude/commands/slava/build/spec-review.md` updated with the parity-check audit step (Edit 2).
- [ ] Conditional: `.claude/rules/tests.md` updated with the developer-facing reference paragraph (Edit 3, only if `/claude-md` gate approves).
- [ ] **Real verification, not synthetic:** the next spec that adds an edge function with an input validator (after this rule lands) is processed through `/generate-tests` and `/spec-review` and the canary is generated / the BLOCK fires correctly. Until that natural test happens, status remains `qa` not `done`.
- [ ] No existing skill rules contradict the new rules (grep `.claude/commands/slava/build/` for any conflicting test-pattern guidance).

## Follow-up Signals (review trigger, not blocking)

- If 6 months pass and the `/spec-review` parity BLOCK has fired 0 times AND `/generate-tests` has produced 0 canary sections — revisit. Either no new edge-function validators shipped (rule is correctly silent) or the rule is too narrow (under-triggering). Counts are surfaced by `grep -c 'parity canary missing' .claude/journal/spec-review-*.log` if such logs exist; if not, the trigger is anecdotal.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd BLOCK-1 | Edit target file path was wrong (`generate-tests.md` does not exist; actual path is `generate-tests/SKILL.md`) | Corrected to `.claude/commands/slava/build/generate-tests/SKILL.md` in Solution Edit 1 and Done-When | Verified via `ls .claude/commands/slava/build/generate-tests/` |
| 2 | /challenge-prd BLOCK-2 | Trigger condition was underspecified — required NLP /generate-tests does not perform | Tightened to a concrete signal set (file path + named predicate / constant naming convention / annotated bound). Added `/spec-review` as a safety net for the prose-only case | Two-layer detection accepted in place of a perfect classifier |
| 3 | /challenge-prd HQ-1 | Rule only in /generate-tests misses workflows that bypass it (e.g., manual test writing) — which is exactly what happened with P835 | Added Edit 2: `/spec-review` parity-check audit step | Doubles coverage; spec-review runs after manual or generated tests |
| 4 | /challenge-prd WARN-1 | "Synthetic dry-run" Done-When was self-attestation theatre | Replaced with real-spec verification: the next natural edge-function spec post-rule-landing is the test | Falsifiable; status stays `qa` until the rule actually fires once |
| 5 | /challenge-prd WARN-3 | Routing ambiguity between `tests.md` paragraph and skill rules | Made Edit 3 conditional on `/claude-md` gate approval; clarified that `tests.md` content is developer-facing reference, not agent-instruction | Skill rules carry the enforcement; `tests.md` is documentation if non-redundant |
| 6 | /challenge-prd HQ-2 | Server-only enum pattern (no client constant) had hidden divergence risk | Added SOURCE comment requirement to canary header (Edit 1 step 5) — points at validator source line, makes coupling visible on diff | Zero runtime cost; one comment per canary |
| 7 | /challenge-prd HQ-3 | Bias check: one incident → permanent rule (overfitting risk on N=1) | Accepted A path (file P839); added 6-month review-trigger as Follow-up Signal | Blast radius is near-zero; cost asymptote justifies action; review trigger covers the bias |

## Dependencies

- **Inline backfill (this session, formerly P838)** is independent and ships in parallel — backfill retires existing risk; P839 prevents new risk. Neither blocks the other.
- The `/claude-md` gate is a hard prerequisite for the conditional `tests.md` edit (per global rule on editing rule files).
