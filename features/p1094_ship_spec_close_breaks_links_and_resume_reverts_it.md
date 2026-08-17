---
status: in-progress
type: bug
rank: 4
created_date: '2026-08-17'
tags: [tooling, git-ops, ship, process]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
driver: anomaly
reproduce_artifact:
  test_file: scripts/test-git-ops-ship.sh
  root_cause: "Two independent defects in cmd_ship. (1) Phase 2 closes a spec with `git mv` into features/done/<sprint>/ then rewrites only frontmatter — grep confirms zero relative-link handling anywhere in git-ops.sh — so a `../docs/` body link is dead from two directories deeper and validate-doc-links.cjs blocks the close commit after the code has landed. (2) The pre-cherry-pick discard block's pathspec `features/pN_*.md` matches the rename's staged SOURCE deletion but not the nested destination; with Phase 1 fully landed CHERRY_PICK_HEAD is absent, so a --resume falls to the unconditional else-branch and `git checkout --` resurrects the old path, after which `git mv` dies 'destination exists'."
  confidence: high
  surfaces_in_scope: [link-depth-on-close, resume-reverts-staged-rename]
  surfaces_deferred: []
  reproduced_at: '2026-08-17'
---

# P1094: closing a spec breaks its own links, and the retry reverts the fix

## Problem

**Situation:** Both halves of this were diagnosed precisely on 2026-08-14 while shipping P1082, written up in
`docs/decisions.md` 2026-08-17 [technical] items 1 and 2, and explicitly left unfixed — *"flagging as
follow-up, not silently absorbing it as scope creep."*

**Complication:** They both recurred on the very next ship (P1067, 2026-08-17), in the same order, and
cost the same manual recovery. That is two occurrences in three days, and the second one happened to
an agent that had read the write-up. A documented gotcha that recurs on the next use is not
documentation working — it is a bug with a note attached.

**The two, restated from the existing diagnosis:**

1. Closing a spec moves it from `features/` into `features/done/<sprint>/` — two directories deeper —
   and nothing rewrites its relative links. Any spec whose body links to `docs/` with a shallow
   relative path therefore fails the doc-link gate *at the close commit*, after the code has already
   landed.
2. Recovering from that failure is booby-trapped. With the code already landed, retrying the close
   runs a discard step that cannot distinguish the rename this same run staged moments ago from stray
   editor noise — so it reverts it, resurrecting the old path and leaving the move unable to proceed
   ("destination exists"). The fix you just staged is gone.

**Question:** fix the cause (rewrite links on move) or the symptom (make the discard step recognise its
own in-flight rename)? Both are cheap; only one prevents the recurrence.

## Root Cause

Confirmed 2026-08-17 by two canaries in `scripts/test-git-ops-ship.sh` (**PP** and **QQ**), both
observed failing before any fix exists.

**Item 1 — link depth.** Phase 2 of `cmd_ship` performs exactly three mutations: `git mv` into the
sprint folder, `ship_rewrite_frontmatter`, `git add`. The frontmatter rewriter splits the file and
passes the body through verbatim, and a grep across all 3050 lines of `git-ops.sh` returns **zero**
occurrences of any relative-link handling. So a body link written `../docs/decisions.md` — correct
from `features/` — survives the move unchanged and now resolves to `features/done/docs/decisions.md`.
The close commit stages the moved spec, `pre-commit-checks.sh` runs `validate-doc-links.cjs` over
staged files, and the gate blocks — *after* Phase 1 has already landed the code on main.

PP failure: `relative link(s) dead after move — ../docs/decisions.md (resolved from
features/done/2026-04-22)`.

**Item 2 — retry reverts the rename.** The discard block guards on `CHERRY_PICK_HEAD` (the P1082
fix). Once Phase 1 has fully landed that sentinel is gone, so a `--resume` reaches the unconditional
`else`. Its pathspec is `features/pN_*.md`, and git pathspec wildcards do **not** match across the
added directories — verified empirically: `git ls-files -- 'features/p999_*.md'` returns only the
top-level path, never `features/done/<sprint>/p999_demo.md`. What it *does* match is the rename's
staged **source deletion**. So `diff-index` reports a real change, `git checkout --` restores the old
path from HEAD, and Phase 2 then finds both paths present and dies at `git mv`.

QQ failure: `discarding uncommitted kanban edits to features/p161_*.md` (11 lines — the whole spec),
then `fatal: destination exists`, then `git-ops: ship: git mv failed`.

**Why item 2 is not a two-window problem.** The block now has three known windows: mid-conflict
(closed by P1082), post-Phase-1-pre-Phase-2-commit (this bug), and any future phase inserted between
the pick loop and the final commit. Enumerating windows is what produced the second occurrence; the
fix must key on whether a *ship-owned in-flight mutation* exists, per `docs/decisions.md` 2026-08-17.

## Appetite

Small, and bounded to one script. Reversible. Decision density: one — which of the two to fix, or both.
The tool already has a test file covering this area, so the failure is expressible as a test.

## Approach

1. Reproduce both in the tool's own test harness first. Item 2 is the one that destroys work, so it
   gets a test that fails before the fix.
2. **Cause fix:** when moving a spec, rewrite relative links whose depth changed. Depth is known —
   it is exactly the number of directories the move added. Do not guess targets; adjust the prefix
   and confirm each rewritten target resolves, failing loudly if one does not.
3. **Symptom fix:** the discard step must not revert a rename this same run staged. The run already
   records its own state; consult it rather than inferring from the working tree.
4. Re-run the existing tool tests plus the two new ones.

## Risks / Non-Goals

### Risks

- **The discard step exists for a real reason** — stray edits genuinely do break the move. MITIGATE:
  narrow it by provenance (staged by this run) rather than removing it. A previous fix in this same
  block addressed one trigger window and left this one open; check both windows are covered by tests
  before closing.
- **Link rewriting could silently mangle a target.** MITIGATE: verify every rewritten link resolves
  after the move, and fail rather than commit a rewritten-but-dead link.

### Non-Goals

- Do **NOT** widen this into general link maintenance across the repo — a repair tool for legacy dead
  links already exists and is separate.
- Do **NOT** fix this by asking spec authors to avoid relative links. The tool moves the file; the
  tool owns the consequence.

## Done-When

- [x] A test that fails before the fix for the retry-reverts-the-rename case — canary `QQ`
- [x] A test that fails before the fix for the link-depth case — canary `PP`
- [x] Closing a spec whose body links to `docs/` with a shallow relative path succeeds unaided
- [x] Retrying a close after an unrelated gate failure preserves a staged fix
- [x] Both existing decisions.md items updated in place to record the fix landing, since they
      currently read as open follow-ups

## Resolution

**Fixed:** 2026-08-17 · **Files changed:** `scripts/git-ops.sh`, `scripts/test-git-ops-ship.sh`,
`docs/decisions.md`

**Item 1 — cause fix.** New `ship_rebase_doc_links()` runs immediately after each `git mv`, at all
three sites that move a spec into `features/done/<sprint>/` (Phase 2, Phase 2b co-located, and the
no-branch closure path — all three perform the identical move and so carried the identical defect).
Re-base is pure path math: resolve each target against the old directory, express the same file
relative to the new one. It never guesses a target, unlike `scripts/fix-doc-links.cjs`, which
repairs unrelated legacy rot by basename. Scope deliberately mirrors `validate-doc-links.cjs` —
inline markdown links only, fence-aware, same skip prefixes — because rewriting exactly the set
of links the gate judges is the point. (Writing the literal bracket-paren form here to illustrate
it is itself a dead link, and the gate blocked this very commit for it — inline code spans are not
skipped, only fenced blocks. The re-base mirrors that, deliberately.) Ratchet, not threshold: a link already dead before the move
is re-based but never blocks the close; only a link that resolved before and does not after fails,
and it fails loudly rather than committing a mangled target. Called only on the branch that just
performed the move, so a `--resume` cannot re-base twice and add a second `../` level.

**Item 2 — symptom fix, by provenance rather than by window.** The discard step now discards only
*unstaged* working-tree noise and never touches the index: the `git reset HEAD` is gone and the
predicate is `git diff` (working tree vs index) instead of `diff-index HEAD` (which also sees
staged content). The index is the provenance — anything staged got there by a deliberate act, the
operator's conflict resolution or this run's own Phase 2 rename. This closes the third window
(any future phase between the pick loop and the final commit) without enumerating it, which is what
`docs/decisions.md` 2026-08-17 predicted was necessary. The `CHERRY_PICK_HEAD` gate stays and is
not redundant: mid-pick, an *unstaged* edit to the spec is the operator's in-progress resolution,
and only that gate protects it. Applied to both discard sites, since they are siblings.

**Evidence.** Full canary suite exits 0 (38 checks). Each fix proved independently load-bearing by
mutation: disabling only the re-base makes `PP` and `RR` fail while `QQ` passes; reverting only the
discard narrowing makes `QQ` fail with the original `fatal: destination exists` while `PP` passes.
End-to-end against the real gate: a real spec carrying 12 relative links, moved naively, fails
`validate-doc-links.cjs` with 6 dead links; re-based, it reports 0.
