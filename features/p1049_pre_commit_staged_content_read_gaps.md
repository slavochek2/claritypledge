---
status: week
type: task
rank: 18
workstream: security
created_date: '2026-08-11'
tags: [security, ci, tooling, pre-commit]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1049: Pre-commit architecture doesn't reliably see what actually gets committed

## Problem

**Situation:** This repo's security-relevant pre-commit checks (gitleaks, the privacy scanner, the
P887 client-safety gate, the P1039/P1041 RLS-scope gate) all assume the content they scan is the
content that gets committed, and assume `git-ops.sh ship`'s cherry-pick re-verifies each commit at
merge-to-main time.

**Complication:** Neither assumption holds. Investigating during P1041 (with a scratch-repo control,
run 3×) established that a **clean, non-conflicting** `git cherry-pick` does not fire the pre-commit
hook at all — only a cherry-pick that hits a conflict and completes via `--continue` does. Since
`git-ops.sh ship`'s common case is a clean pick, most ships never re-run any pre-commit check at
merge time; the only real verification happens when each commit was originally authored on the
feature branch. Separately, content-based checks read the working-tree file at a staged path rather
than the staged git blob, and a specific git staging technique (documented privately —
`.private/docs/security-log.md`, 2026-08-11 entry — not restated here) makes a file invisible to
`git diff --cached` while still fully committable, defeating every staged-content check in the repo,
not just the RLS gate.

**Question:** How do we close the gap between "the pre-commit checks passed" and "the content that
actually landed on main was verified" — at both authoring time and merge time?

## Appetite

Medium-high blast radius (touches the shared `pre-commit-checks.sh` used by every commit in this
repo, and potentially `git-ops.sh ship`'s merge flow). Reversible (each fix is additive — a new
verification step or a new hard-block condition — nothing existing needs to change behavior for the
non-adversarial case). Medium decision density — the merge-time gap (gap 1) and the staged-content
gap (gap 2) may warrant different fix shapes and are logically separable; an architecture pass should
decide whether to fix them together or as two independent specs.

## Approach

Two independent gaps, investigate and design a fix for each (may end up as two implementation
specs branched from this one, or one combined fix — that's an `/architect` decision, not fixed here):

1. **Merge-time re-verification.** `git-ops.sh ship`'s clean cherry-pick path never re-runs
   pre-commit checks. Candidate direction: a CI job that re-scans every migration/security-relevant
   file touched in `origin/main...HEAD` regardless of which commit introduced it — this closes the
   gap without needing to alter cherry-pick's internals (which is git's own behavior, not something
   this repo controls).

2. **Staged-content fidelity.** Content-based checks should scan what will actually be committed, not
   an approximation of it. Candidate direction: materialize `git show :<path>` into a temp file for
   each content-based check instead of reading the working-tree path directly, so the check-time
   content is provably the commit-time content. Separately, add a hard-block on any
   `git status --porcelain` line showing the specific intermediate staging state documented in
   `.private/docs/security-log.md` before running staged-content checks at all.

## Risks / Non-Goals

### Risks
- **Fix for gap 2 slows down every commit** (materializing blobs to a temp dir per check, per
  commit). Mitigation: only content-based checks need this: the majority of pre-commit checks (lint,
  typecheck, build) already operate correctly since they run against the actual working tree state
  the developer intends to ship, not a staged subset — scope the blob-materialization fix to the
  specific checks that read individual staged file content (gitleaks, privacy scan, P887, P1039/P1041),
  not the whole script.
- **CI re-scan (gap 1 fix) duplicates work already done at authoring time**, adding latency to every
  merge. Mitigation: scope it to security-relevant paths only (migrations, RLS-adjacent scripts), not
  a full repo re-lint — the categories that already have a dedicated pre-commit check are exactly the
  categories worth re-verifying at merge time, nothing broader.

### Non-Goals
- Do NOT attempt to make cherry-pick itself fire the hook — that's git's internal behavior, not
  something this repo's tooling can change. Work around it (re-verify via CI), don't fight it.
- Do NOT publish the exact staging technique from gap 2 in this spec, in any PR description, or in
  any commit message on this work. Reference `.private/docs/security-log.md` by name. This repo is
  public.
- Do NOT fold this into an unrelated feature's branch. This is repo-wide infrastructure; it gets its
  own branch and its own review.

## Done-When

- [ ] `/architect` pass has decided: one combined fix or two independent specs for gap 1 vs gap 2
- [ ] Gap 1: a CI job (or equivalent) exists that re-scans security-relevant files touched in
      `origin/main...HEAD` on every push to main, independent of which commit in the cherry-picked
      series introduced the change
- [ ] Gap 1: the failure path has been exercised — simulate a clean cherry-pick landing a file that
      should fail a content check, confirm the new CI step catches it where local pre-commit didn't
      (epistemic gate 7)
- [ ] Gap 2: content-based checks (gitleaks, privacy scan, `check-migration-client-safety.sh`,
      `check-rls-scope.py`) read the staged git blob, not the working-tree file, verified by the
      same edit-after-stage reproduction used to find the bug (kept private, not restated in this
      spec's public body)
- [ ] Gap 2: the intent-to-add bypass technique is hard-blocked before any staged-content check runs
- [ ] No exploit-level reproduction detail added to this spec, any commit message, or any PR
      description for this work — reference `.private/docs/security-log.md` only
