---
status: week
type: bug
rank: 4
created_date: '2026-08-17'
tags: [tooling, git-ops, ship, process]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
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

- [ ] A test that fails before the fix for the retry-reverts-the-rename case
- [ ] A test that fails before the fix for the link-depth case
- [ ] Closing a spec whose body links to `docs/` with a shallow relative path succeeds unaided
- [ ] Retrying a close after an unrelated gate failure preserves a staged fix
- [ ] Both existing decisions.md items updated in place to record the fix landing, since they
      currently read as open follow-ups
