---
status: week
type: task
rank: 1000954.0
created_date: '2026-07-30'
tags: [privacy, audit-privacy, rules, pii]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1014: Extend the third-party-name authoring rule to `docs/` and `content/`

## Problem

**Situation:** P936 (done, 2026-06-15) split third-party PII into two controls by design: **emails** are scanner-detected and server-enforced, **names** are an authoring-layer control, because name auto-detection was rejected against a measured false-positive baseline. That names control is `.claude/rules/features.md` §"PII in Specs" — which states it "applies to **all** `features/` authoring" and auto-loads only on `features/` paths.

**Complication:** On 2026-07-30 a peer practitioner's real first name plus a characterization of his business was found in `docs/decisions.md`, shipped, having survived the 2026-07-29 de-identification pass and every commit since. A second mention was in `content/articles/`. Neither path loads the rule, so no agent authoring them ever saw it. The scanner cannot help by design — `HARD_PATTERNS` covers only the founder's own identifiers, and P936 documented that names "stay an authoring-layer control." Both leaks were found by hand, incidentally, while answering an unrelated question.

**Question:** How do we give `docs/` and `content/` the same write-time name discipline `features/` already has, without reversing P936's rejection of scanner-side name detection?

## Appetite

Low blast radius (rules-file scope change; no scanner, no CI, no enforcement mechanism touched). Fully reversible (`git revert` one commit). Low decision density — P936 already made the hard call; this corrects where that call is delivered.

## Solution

Make the existing role-vocabulary rule reachable from the paths where public prose is actually written. Two candidate mechanisms, to be chosen during implementation:

1. Extend the auto-load globs so the existing rule fires on `docs/**` and `content/**` as well as `features/**`.
2. Add a pointer in the rules file(s) that already auto-load for those paths, referencing the one canonical statement of the rule.

Reference, never duplicate — the rule text has one home (CLAUDE.md "Reference Over Duplication"). Whichever mechanism is used, the outcome is that an agent editing `docs/decisions.md` or `content/articles/*.md` sees the role-vocabulary requirement before writing.

Run `/slava:maintain:claude-md` before editing any rules file, per CLAUDE.md.

## Risks / Non-Goals

### Risks
- **Rule sprawl / dilution.** Widening globs loads more context on more edits, and a rule that fires everywhere gets skimmed. Mitigation: extend scope only to the two path families with demonstrated leaks; do not make it global.
- **False confidence.** An authoring rule is not enforcement — it cannot fail a commit. Mitigation: state that limitation in the rule text itself, as P936 already did, so the next reader does not mistake it for a gate.
- **Backfill is unbounded.** `docs/decisions.md` is ~17,700 lines with 297+ commits of history. A full historical name audit is not this spec. Mitigation: scoped out below.

### Non-Goals
- Do **NOT** add name detection, NER, or a name watchlist to `audit-privacy.sh`. P936 rejected this against a measured FP baseline (170 emails / 483 raw hits) with founder sign-off. Reversing it needs new evidence about false-positive cost, which this spec does not have and does not gather.
- Do **NOT** commit any real third-party name into the public tree — including into tests, fixtures, or any list. Synthetic fixtures only (mirrors P919/P936 sentinel discipline).
- Do **NOT** weaken, rescope, or touch the founder-identifier patterns, `.privacy-allowlist`, or `.privacy-email-allowlist`.
- Do **NOT** change P919's enforcement mechanism (ruleset, staging hop, credential model).
- Do **NOT** attempt a historical backfill scan of `docs/` in this spec. Range mode (`git log -p`) exists and could support one, but it needs a name list to scan for — which the first non-goal forbids building. Backfill is a separate decision.
- Do **NOT** rewrite already-shipped articles for style; the two known leaks are already fixed (`d31c798e`).

### Alternatives Considered
- **Gitignored name watchlist (`.private/privacy-names.txt`) read by `audit-privacy.sh`.** Sidesteps P936's "don't publish the name to protect the name" trap, since the list is never committed. REJECTED here as out of scope: it is still the scanner route P936 rejected for names, it only ever catches names someone remembered to add, and it would give the strongest false-confidence signal of any option (a green gate that knows three names). Revisit only with evidence on FP cost.
- **Rely on the periodic de-identification pass.** REJECTED as the sole layer: the 2026-07-29 pass ran and missed this exact line. Nothing scanned for it, so it was never in scope rather than overlooked.
- **Make names server-enforced.** REJECTED: requires the detection P936 ruled out; enforcement without reliable detection blocks legitimate commits.
- **Do nothing.** REJECTED: two leaks found by hand in one session, one of them shipped, is not a rate that process memory alone survives.

### Rollback Strategy
Single-commit revert of the rules-file change. No data migration, no scanner change, no CI change — prior behavior restored immediately.

## Done-When

- [ ] Editing a file under `docs/` surfaces the third-party-name role-vocabulary requirement without the agent having to know it exists
- [ ] Editing a file under `content/` does the same
- [ ] The rule text exists in exactly one place; the new path coverage references it rather than restating it
- [ ] The rule states plainly that it is an authoring-layer control and NOT commit-enforced
- [ ] `.claude/rules/features.md` §"PII in Specs" behavior for `features/` is unchanged (no regression)
- [ ] `./scripts/pre-commit-checks.sh` passes; `scripts/test-audit-privacy.sh` still green (unchanged, proving the scanner was not touched)
- [ ] The `/slava:maintain:claude-md` gate was run before the rules edit, and its verdict recorded

## Notes

- Triggering leak and both fixes: commit `d31c798e` (2026-07-30). Prior de-identification pass: `dd35ce20`.
- Predecessor: P936 — read its §Resolved Decisions before proposing any scanner-side change here.
- The founder's own name is effectively allowlisted (it is the git author), which is why founder-name leaks and third-party-name leaks fail differently and need different controls.
