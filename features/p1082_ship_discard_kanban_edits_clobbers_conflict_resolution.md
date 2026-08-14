---
status: week
type: bug
rank: 30
severity: high
workstream: tooling
date_reported: '2026-08-14'
created_date: '2026-08-14'
tags: [git-ops, ship, tooling, data-loss]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1082: `git-ops.sh ship`'s kanban-edit discard silently clobbers a staged conflict resolution on `--resume`

## Summary

`git-ops.sh ship`'s "discard uncommitted kanban edits" hygiene step runs unconditionally at the top of every invocation — including `--resume` — before checking whether a paused cherry-pick already has a legitimate, operator-staged conflict resolution sitting in the index. It cannot tell "a background kanban process wrote stray noise to this spec file" apart from "the operator just resolved a real merge conflict and staged it," so it discards both identically. During the P1077 ship, this silently reverted the spec file to its stale pre-implementation content on 3 of 4 cherry-picked commits, while the journal recorded each as cleanly "landed."

**This is not a new defect, and the P936→P972 history is more precise than "partially fixed" suggests.** [decisions.md 2026-06-15 \[process\]](../docs/decisions.md) (P936) diagnosed **two** distinct defects in one sentence: *"the discard-then-fresh-pick sequence strips the spec **and** cannot continue an in-flight pick."* Its `Candidate hardening (Status: proposed)` line, however, proposed a fix for only the second half — *"detect `CHERRY_PICK_HEAD` and `--continue` the in-flight commit."* [decisions.md 2026-06-28 \[process\]](../docs/decisions.md) (P972) implemented that proposal **verbatim and correctly** (verified: neither of P972's two commits, `82552641` or `9ad464b0`, touches the discard block at lines 2060–2073, which is unmodified since `07c7bea0`, 2026-04-23, predating both). P972 did not under-deliver against its own brief — **the discard half of the diagnosis was never in the proposal it was implementing.** The transferable lesson: a `Status: proposed` line can be narrower than the diagnosis paragraph it sits under, and "implemented the proposal" is not the same claim as "closed the diagnosis" — decisions.md's own append-only-staleness problem (2026-06-27 entry, "62 `Status: proposed` occurrences, no mechanism relates any to its resolution") is exactly this gap, one level up.

**Severity correction — this is not an edge case, it's the documented path.** `scripts/git-ops.sh`'s own conflict diagnostic (~line 2274, printed on every cherry-pick conflict) instructs the operator: *"Stage the resolution with 'git add', then run 'git-ops ship pN --resume'... Do NOT run 'git cherry-pick --continue' yourself first."* Following the tool's own instructions on any conflicted spec-touching commit **is** the trigger sequence. This is not "branches with 2+ spec-touching commits and spec divergence are at risk" — it's "every conflicted ship is routed into the failure by the tool's own guidance."

## Root Cause

`scripts/git-ops.sh`, `cmd_ship()`, lines ~2060–2073:

```bash
# Discard any uncommitted/staged kanban-written changes to this feature's spec file.
local spec_pattern="features/${pn}_*.md"
if git -C "$REPO_ROOT" diff-index --quiet HEAD -- "$spec_pattern" 2>/dev/null; then
  : # no kanban edits, nothing to do
else
  echo "ship: discarding uncommitted kanban edits to $spec_pattern before cherry-pick:" >&2
  git -C "$REPO_ROOT" diff --stat HEAD -- "$spec_pattern" >&2 || true
  git -C "$REPO_ROOT" reset HEAD -- "$spec_pattern" 2>/dev/null || true
  git -C "$REPO_ROOT" checkout -- "$spec_pattern" 2>/dev/null || true
fi
```

This block executes once, unconditionally, **before** the per-commit cherry-pick loop begins (and therefore before the loop's own `CHERRY_PICK_HEAD`/`_resume_continue` detection at ~line 2096 onward). On a `--resume` call issued right after the operator resolves a conflict (`git checkout --theirs`/manual edit + `git add`), the resolved content is a real, intentional diff against `HEAD` — `git diff-index --quiet HEAD -- features/${pn}_*.md` correctly reports "not quiet" (a diff exists), and the block discards it via `reset` + `checkout --`, indistinguishable from its intended target (genuine stray kanban-tool writes).

The discard silently succeeds (`|| true` on both git calls), so nothing in `--resume`'s output signals that a just-staged resolution was wiped. The subsequent `git cherry-pick --continue` (or a fresh `git cherry-pick $sha` once `CHERRY_PICK_HEAD` is gone) then either produces an empty/no-op commit or immediately re-conflicts against the very same stale base — and in the observed run, the empty-commit path was mistaken for a benign already-applied pick (the `empty|nothing to commit` branch at ~line 2188), which records `landed_sha` against a commit that does **not** contain the intended spec content.

## Invariants

- **The kanban-edit discard must never fire while a cherry-pick conflict resolution is staged.** Detect this via `CHERRY_PICK_HEAD` (or unmerged index entries) rather than assuming any uncommitted diff on the spec-file pattern is kanban noise.
- **Code-file cherry-picks are unaffected** — the discard pattern is scoped to `features/${pn}_*.md` only, so this class of bug is specific to specs, never `src/`/`e2e/`/`supabase/`.
- **The journal's `landed_sha` is not proof of correct content** — it only proves *a* commit exists at that SHA post-pick, not that the pick's actual diff is represented. Any recovery/audit of a `--resume` sequence must diff the landed commit's content against the source commit's intended diff, not just check that `landed_sha` is non-null.

## Reproduction Steps

1. On a P-number branch with **2 or more commits that each touch `features/p{N}_*.md`**, where main's tracked/untracked copy of that spec differs from the branch's evolved copy (e.g., spec was left untracked-and-edited on main before a worktree was created, or a prior commit already landed a partial spec state).
2. Run `git-ops.sh ship p{N}`. It hits a conflict on the first spec-touching commit.
3. Resolve the conflict correctly (`git checkout --theirs -- features/p{N}_*.md` or a manual merge-conflict edit), then `git add features/p{N}_*.md`.
4. Run `git-ops.sh ship p{N} --resume`.
5. Observe the printed line `ship: discarding uncommitted kanban edits to features/p{N}_*.md before cherry-pick:` followed by a diff-stat that **matches the resolution just staged in step 3**.
6. Check the resulting landed commit's content: `git show <landed_sha>:features/p{N}_*.md` — it matches the stale pre-resolution state, not the resolution from step 3.

**Reproduction rate:** 100% when steps 1–4 are followed — observed 3 times in immediate succession during the P1077 ship (commits `fb8dcf73`, `3cfd2aee`, `e2e831d3` all landed with the spec file reverted; the 4th spec-touching commit, `b294b03d`, was caught before landing and resolved manually via `--skip` + `commit-to-main` + `--mark-landed`).

## Expected Behavior

`--resume` should only discard uncommitted spec-file changes when there is **no** in-progress cherry-pick on that commit (i.e., `CHERRY_PICK_HEAD` unset, or set to a different SHA than what's about to be picked). When a paused pick's conflict has already been resolved and staged, `--resume` should treat that staged content as the intended resolution and proceed via `git cherry-pick --continue`, never discarding it first.

## Actual Behavior

`--resume` discards the staged resolution unconditionally, then either produces a no-op/empty commit (misrecorded as "landed") or re-conflicts against the same stale base — with no error, warning beyond the generic diff-stat line, or indication that a real resolution was just destroyed.

## Affected Files

- `scripts/git-ops.sh` — `cmd_ship()`, kanban-edit discard block, lines ~2060–2073 (root cause)
- `scripts/git-ops.sh` — `cmd_ship()`, per-commit cherry-pick loop and `_resume_continue` detection, lines ~2078–2183 (the discard should be gated relative to this logic, or moved inside it, scoped per-SHA)
- `scripts/git-ops.sh` — empty/no-op cherry-pick detection, lines ~2184–2198 (secondary: this branch will happily record a no-op as "landed" for a discarded resolution — worth a content-equality guard, not just an empty-diff check, though the primary fix at the discard site should make this path unreachable for this scenario)

## Severity

**High** — not a production/user-facing defect, but a silent correctness failure in a load-bearing shared tool: it can make `/ship` report success while a spec's actual documented state (Done-When, risk decisions, UI contract) never reaches main, and the journal's own "landed" record becomes misleading evidence. The tool's own conflict diagnostic actively routes operators into the trigger sequence (see above), so exposure is every conflicted spec-touching cherry-pick, not a narrow subset. Caught this time only because the operator independently diffed landed commits against expected content — see `.claude/rules/epistemic.md` gate 9 ("a subagent's claim is not evidence until a command confirms it"), same discipline applied to a tool's own self-report here.

**Adversarial review (2026-08-14, Opus) confirmed the root cause via hermetic reproduction** (a scratch repo with the discard block copied verbatim reproduced the identical failure shape) and the fix via testing both regression paths. Two residual gaps to close in the same patch, neither a blocker:
1. **Staged kanban noise during a paused pick.** The discard's own comment (line ~2061) notes kanban writes are sometimes `git add`-staged (folder-move status changes). With the `CHERRY_PICK_HEAD`-gated fix, such staged noise would ride along into the `--continue` commit instead of being discarded. Correct trade (frontmatter noise on main beats silent content loss) but should be named in the fix's commit message, not left implicit.
2. **Foreign `CHERRY_PICK_HEAD` + empty `pending` list.** With the fix, a foreign in-progress cherry-pick skips the discard (correct) but the per-sha loop never runs if `pending` is empty — meaning the loop's own foreign-pick `die` guard (line ~2101) never fires, and Phase 2 spec-closure (`git mv` + commit, ~line 2290) has no op-in-progress guard of its own, unlike the seed block (line ~2038) and the no-branch arm (line ~1816). This gap is pre-existing, not introduced by the fix — but the fix makes it the only remaining unguarded path, so it belongs in the same acceptance criteria.

## Fix Approach

Gate the discard block on the absence of an in-progress cherry-pick for this P-number's commits:

```bash
local _gitdir_discard
_gitdir_discard="$( cd "$REPO_ROOT" && git rev-parse --absolute-git-dir )"
if [[ -e "$_gitdir_discard/CHERRY_PICK_HEAD" ]]; then
  : # a resume is converging a paused pick — never discard staged resolution content
elif git -C "$REPO_ROOT" diff-index --quiet HEAD -- "$spec_pattern" 2>/dev/null; then
  : # no kanban edits, nothing to do
else
  echo "ship: discarding uncommitted kanban edits to $spec_pattern before cherry-pick:" >&2
  git -C "$REPO_ROOT" diff --stat HEAD -- "$spec_pattern" >&2 || true
  git -C "$REPO_ROOT" reset HEAD -- "$spec_pattern" 2>/dev/null || true
  git -C "$REPO_ROOT" checkout -- "$spec_pattern" 2>/dev/null || true
fi
```

As a secondary hardening (belt-and-suspenders, not a substitute for the above): the empty/no-op cherry-pick branch (~line 2188) should verify the landed commit's tree for the spec file actually matches the source commit's tree for that file before recording `landed_sha` — not just that the pick reported "empty."

## Acceptance Criteria

- [ ] A canary reproducing the exact P1077 sequence (2+ commits touching the same spec file, a resolved-and-staged conflict, then `--resume`) shows the staged resolution surviving into the landed commit
- [ ] The existing `--resume` happy path (no conflict, clean cherry-pick) is unaffected — verified by re-running an existing passing `git-ops.sh` ship canary/test
- [ ] The genuine kanban-noise-discard case (uncommitted spec edit with **no** in-progress cherry-pick) still discards as before — verified by a canary that seeds a stray uncommitted edit with no `CHERRY_PICK_HEAD` present
- [ ] No regression in the empty/no-op cherry-pick detection path for its actual intended case (a prior partial run's commit already landed verbatim)
- [ ] Staged kanban noise present during a legitimately paused pick rides into the `--continue` commit (documented trade-off, not silently different behavior) — verified by a canary that seeds both a real conflict resolution AND staged kanban noise simultaneously
- [ ] Phase 2 spec-closure (`git mv` + commit, ~line 2290) gets its own op-in-progress guard, matching the seed block (~line 2038) and no-branch arm (~line 1816) — closes the gap the fix would otherwise leave as the only unguarded path
