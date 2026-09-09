---
status: all-done
type: task
rank: 1
workstream: infrastructure
created_date: '2026-09-09'
tags: [tooling, scripts, pre-commit, worktrees, canary]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: process-debt
intent: cold-start
completed_at: 2026-09-09
---

# P1293: the flag probe that now gates every commit has never been seen to fail

## Problem

**No founder conversation to mine — `intent: cold-start`.** This originated in a concurrent
agent's incident report during the P1284 review, not in a discussion with the founder. The
authoritative framing is that report, quoted verbatim and attributed:

> Reporting agent H2-p1283, verbatim (2026-09-09): *"P1284's --staged-only change blocks commits in
> every worktree whose branch predates it. Reproduced in w20 just now. ... So the hook is always the
> newest installed copy while `./scripts/sync-agent-skills.sh` is whatever the branch has. Any
> caller change in pre-commit-checks.sh that depends on a paired change in another script breaks
> older worktrees the moment it lands on main."*

The mechanism, confirmed independently here: `.git/hooks/pre-commit` is a symlink to the **main
checkout's** copy of `scripts/pre-commit-checks.sh`, while every `./scripts/...` inside it resolves
against the **committing worktree's** cwd, where `scripts/` is a native per-branch checkout. Caller
is always newest; callee is whatever the branch has.

P1284 hard-coded `./scripts/sync-agent-skills.sh --check --staged-only`. The moment it landed on
main, every worktree cut before P1284 was handed a flag its script could not parse:

```
sync-agent-skills: unknown argument: --staged-only
✗ Agent skills sync (P1151)
✗ 1 error(s) - commit blocked
```

Measured across w3, w5, w10 and w20, with no drift behind it — purely flag arity.

**Two hotfixes have already landed and the behaviour is correct today.** `a7782c75f` added a probe;
`70412d850` re-anchored it on the parser's case arm after the first version would have accepted a
script that merely *documents* the flag in its usage comment. Both touched
`scripts/pre-commit-checks.sh` and nothing else.

So the defect is closed and this spec does not re-fix it. What is missing is the other half:
**that probe now decides whether every commit in this repo runs its skills gate, and it has never
been observed to fail.** That is what `.claude/rules/epistemic.md` gate 7 forbids relying on. Both
of its failure modes are real and both already happened once — hand the flag to a script that
cannot parse it (blocks every commit), or fail to hand it to one that can (the gate silently widens
to the whole working tree, which is the co-tenant-blocking behaviour P1284 existed to remove).

## Appetite

One canary. No change to the shipped probe.

## Solution

`scripts/test-precommit-sas-flags.sh` extracts the probe **from the shipped script** by pattern and
makes it callable, applying exactly one substitution: the hard-coded
`./scripts/sync-agent-skills.sh` becomes `"$SAS_PATH"` so it can be aimed at fixtures. The grep
expression itself — the load-bearing part — runs verbatim. If the probe is renamed or restructured
the extraction yields nothing and the canary fails loudly rather than silently measuring nothing.

It then drives the probe against two **real** callees taken from git history rather than invented
ones: `62904083d^:scripts/sync-agent-skills.sh` (the last tree without the flag, which is the shape
every pre-P1284 worktree still has on disk) and the current copy.

Six behaviours are asserted, in both directions:

1. the fixtures are what they claim to be (old lacks the case arm, current has it);
2. the defect control — hard-coding the flag against the old copy really does exit 2;
3. the old copy makes the probe drop the flag, and the current copy makes it keep the flag;
4. a script that only *documents* the flag is not handed it — the discrimination `70412d850` exists
   for, and the case that would have caught the first hotfix's weakness;
5. the known limit is asserted rather than hidden: an alternation arm (`--scoped|--staged-only)`)
   reads as unsupported, so the gate degrades to the repo-wide `--check`. Over-broad, never a silent
   pass, and asserted so anyone tightening the anchor has to look at the trade;
6. end to end, the command the probe derives is actually accepted by each copy — exit 0 or 1 are
   both fine, exit 2 is the only refusal.

## Risks / Non-Goals

- **Risk: the extraction silently goes stale.** Mitigated by failing hard when the pattern matches
  nothing, and by `bash -n` on the extracted text before sourcing. Proven: deleting the probe makes
  the canary exit 1 with a FATAL naming the cause.
- **Non-goal:** changing the probe. It is correct as shipped and this branch leaves
  `pre-commit-checks.sh` byte-identical to main.
- **Non-goal:** changing the hook to run the worktree's own `pre-commit-checks.sh`. That would let
  each branch gate itself by its own rules and remove the property that a new gate applies
  immediately everywhere — a larger decision, not this spec's.
- **Non-goal:** wiring this canary into `pre-commit-checks.sh`. It reads git history and is a
  developer-run check; adding it to the hook is a separate call.
- **Non-goal, but recorded because it is real: the gate fails OPEN when the callee is missing or is
  a dangling symlink.** `if [ -f "./scripts/sync-agent-skills.sh" ]` is false, the hook prints
  `⚠ scripts/sync-agent-skills.sh not found — skipping agent-skills sync gate`, and the commit
  proceeds. Raised by codex-review 2026-09-09 and confirmed by reading the call site; it predates
  both hotfixes and this spec. Turning a skip into a hard failure changes when commits are blocked
  repo-wide, which is a decision, not a canary — filed as a follow-up rather than changed here.

## Done-When

- [x] 1. A canary exercises the shipped probe in both directions against real pre- and post-P1284
  copies of `sync-agent-skills.sh`.
  Evidence: `scripts/test-precommit-sas-flags.sh` — 16 passed, 0 failed, exit 0. Old copy makes the
  probe emit the empty flag; current copy makes it emit `--staged-only`.
- [x] 2. The canary is proven to FAIL on a broken probe, not merely to pass on the working one
  (epistemic gate 7). Three mutations, each applied to the shipped file and reverted:
  - anchor reverted to the bare-string grep of `a7782c75f` — 12 passed, **4 FAILED**, exit 1
    (documents-only plus all three formatting limits);
  - probe removed entirely — exit 1 with `FATAL: could not extract the flag probe`;
  - probe left intact but the call site re-hard-coded to `--check --staged-only` — 14 passed,
    **2 FAILED**, exit 1, which is the case the first draft of this canary could not have caught.
  After restoring, `git diff` on `scripts/pre-commit-checks.sh` is empty and the canary is 16/0.
- [x] 2b. Findings from the independent review are closed or recorded.
  Evidence: codex-review returned BLOCK with five findings against an earlier draft; each was
  re-run by command (epistemic gate 9). Two were fixture defects in this canary and are fixed —
  the alternation fixture was a single-line `case` whose arm was not at line start, so it passed
  for the wrong reason, and the end-to-end assertion accepted "any exit but 2", which scores a
  broken-shebang 127 as a pass. One was a real gap and is fixed: the canary tested the extracted
  probe while the call site could drift, so two assertions now bind the shipped invocation to
  `$SYNC_SCOPE_FLAG`. One finding did NOT reproduce against main's anchored regex (a
  `# comment: --staged-only)` line is correctly not detected — it applied only to the unanchored
  draft). The last is the pre-existing fail-open recorded under Non-Goals.
- [x] 3. The original defect is reproduced inside the canary, so it cannot rot into a test that
  measures nothing.
  Evidence: the control case runs the pre-P1284 copy with the flag hard-coded and asserts exit 2
  plus the literal `unknown argument: --staged-only`.
- [x] 4. No behaviour change to the hook.
  Evidence: `scripts/pre-commit-checks.sh` is untouched on this branch; the only files added are the
  canary and this spec. Full `./scripts/pre-commit-checks.sh` run on this branch exits 0.

## Pre-deploy Checklist

- [x] N/A — no migrations, no edge functions, no prod infra touched. One new test script.