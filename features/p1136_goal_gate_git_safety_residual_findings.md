---
status: week
type: task
rank: 55.0
created_date: '2026-08-20'
tags: [git-safety, goal-gate, tooling]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1136: goal-gate.sh / git-commit-safety — residual findings from the P1108 adversarial review

## Problem

**Situation:** Closing P1108 required two rounds of fixes to shared repo tooling: `goal-gate.sh`
CHECK 4 (a forged/stale UAT scorecard could silently win a required merge gate) and `git-ops.sh`
`commit-to-main` (the actual mechanized commit path still ran the pathspec-commit pattern just
declared unsafe). Both are fixed and committed (`541401c5`, `94070cf6`, `1408961a`).

**Complication:** The same adversarial-review pass (3 Opus reviewers, fail-open / evasion /
blast-radius lenses) surfaced six smaller findings that were explicitly deferred rather than fixed
under continued scope pressure in that session. None is a live, proven exploit — the CRITICAL was
already closed — but each is a real, named gap in the same surface.

**Question:** Which of these six are worth closing, and in what order?

## Appetite

Low-to-medium blast radius per item (each is independently scoped, touches one file or a small,
well-understood area). Fully reversible. Low decision density — mostly "fix it" calls, with one
genuine product question (item 6, below) about whether `/ship` should automate a manual convention.

## Solution

Six independent findings, each closeable on its own. Direction only — the implementing agent picks
the fix shape per item.

1. **No mechanical enforcement of the pathspec-commit ban.** `.claude/rules/git.md` now marks
   `git commit -m "..." -- <paths>` as unsafe in prose, but `.claude/hooks/block-banned-git.py`'s
   `commit` branch only blocks `--no-verify`/`-n`. Its own test suite
   (`scripts/test-block-banned-git.py:131`) asserts the pathspec form must PASS (i.e., stay
   unblocked). Separately, `git commit -a`/`-am` is unblocked and is the single most literal
   misreading of "commit with no path arguments" — on the shared main checkout it sweeps every
   modified tracked file, including a co-tenant's.
2. **CI runs a stale `goal-gate.sh`.** `.github/workflows/goal-gate.yml` fetches the gate script
   from `origin/main`, currently ~20+ commits behind local `main`. Today's CHECK 4 fix (and the
   vulnerability it closes) is inert in CI until pushed — a real gap between "green locally" and
   "verified in CI" for this exact class of fix.
3. **CHECK 2's contract-row path rewrite doesn't cover a UAT-shaped row.** The sed substitution
   added earlier the same day (`scripts/goal-gate.sh`, CHECK 2) rewrites `features/${PN}_*.md`
   references in a pinned contract row, but not `features/uat/${PN}.md` — the same staleness class,
   one row shape uncovered, if a future goalified spec's contract ever phrases a MECHANICAL row
   against its own UAT file's path.
4. **`$SPEC` resolution carries the same ambiguity shape CHECK 4 was just fixed for.**
   `scripts/goal-gate.sh`'s own spec-file resolution (`find features -name "${PN}_*.md" | head -1`,
   near the top of the script) has the identical "silently pick one of several matches" shape as the
   bug just fixed in CHECK 4. Flagged by a reviewer as same-pattern, not yet proven exploitable —
   worth the same audit, not yet done.
5. **A zero-row UAT scorecard passes CHECK 4.** A UAT file with no scenario rows currently reports
   "every row carries a result" (0 of 0) instead of failing. Pre-existing at the canonical path;
   newly *reachable* via the widened (post-fix) resolution logic for a moved file.
6. **UAT files don't actually move, and 4 are already orphaned.** `.claude/rules/features.md:28`
   says a UAT file "always moves" alongside its spec into `features/done/{sprint}/uat/`, but
   `git-ops.sh`'s `/ship` never automates that move — it's manual, unenforced housekeeping. p1010,
   p1053, p1104, and this session's own p1108 all currently sit at the pre-move path despite their
   specs being closed. Decide: automate the move in `/ship`, batch-fix the existing orphans, or
   drop the "always moves" convention and update `features.md` to match reality.

## Risks / Non-Goals

### Risks
- **Fixing item 1 (mechanical enforcement) could be over-broad** if the hook can't distinguish a
  legitimate whole-file pathspec commit (safe) from a partially-staged one (unsafe) without more
  context than it has at hook time. MITIGATE: default to a WARN in the hook, not a hard block,
  unless a cheap-to-check signal (e.g., comparing pathspec args against `git diff --cached
  --name-only`) is available at hook execution time.
- **Item 6 is a product/process decision, not a pure bug fix** — automating the UAT move inside
  `/ship` changes `/ship`'s behavior for every future feature. ACCEPT this needs founder sign-off,
  don't auto-decide it during implementation.

### Non-Goals
- Do NOT re-open or re-litigate the CRITICAL/HIGH findings already fixed this session
  (`541401c5`, `94070cf6`, `1408961a`) — this spec is the residual only.
- Do NOT batch-fix the 4 orphaned UAT files as part of this spec unless item 6 resolves toward
  "automate the move" — fixing the symptom before the policy decision just creates a 5th manual
  exception.

## Done-When

- [ ] Item 1: either the hook mechanically blocks/warns on the unsafe pathspec-commit shape, or a
      recorded decision explains why prose-only enforcement is accepted (with the hook's own test
      suite updated either way — it currently asserts the opposite of git.md's guidance).
- [ ] Item 2: CI-staleness is either fixed (workflow pinned differently) or explicitly accepted and
      documented as a known lag between push and CI-verified.
- [ ] Item 3: CHECK 2's rewrite covers a UAT-path-shaped MECHANICAL row, or a test proves no such
      row currently exists in any pinned contract (making the gap theoretical, not live).
- [ ] Item 4: `$SPEC` resolution is audited against the same ambiguity attack CHECK 4 had — fixed if
      reproducible, recorded as a checked-and-safe non-issue if not.
- [ ] Item 5: a zero-row UAT scorecard fails CHECK 4 with a clear message, with a regression test.
- [ ] Item 6: a founder decision is recorded (automate / batch-fix / drop convention) and the chosen
      path is implemented.

## Alternatives Considered

- **Fold all 6 into a single "harden goal-gate.sh" pass with no spec.** Rejected — item 6 in
  particular needs a founder decision point a spec makes visible; bundling risks it getting decided
  implicitly by whoever implements first.

### Rollback Strategy

Each item is independently revertible (a single commit per item, per this repo's own commit
discipline). No data, no schema, no migration.
