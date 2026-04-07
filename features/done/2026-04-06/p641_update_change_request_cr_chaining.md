---
status: all-done
type: task
flow: inline
rank: 1000050
created_date: 2026-04-04T00:00:00.000Z
tags:
  - process
  - skills
  - change-request
locked_at: '2026-04-05T07:48:55.039Z'
---

# P641: Update /change-request skill to support CR chaining

## Problem Statement

P631 added the CR chaining policy to `.claude/rules/features.md` — covering `chain_root:`, `superseded_by:`, chain-depth limits, and the Change-Request Processing Contract. However, the `/change-request` skill itself (`.claude/commands/slava/build/change-request/SKILL.md`) was not updated. As a result:

1. The skill does not set `superseded_by: pN` on the predecessor when that predecessor is itself a `type: change-request`.
2. The skill does not compute and write `chain_root:` for depth > 1 chains.
3. The skill does not validate chain depth or warn when a chain reaches 4.

The policy exists; the tool doesn't enforce it.

## Solution

Update `.claude/commands/slava/build/change-request/SKILL.md` to implement the three missing behaviors:

1. **`superseded_by` on predecessor** — when filing a CR, read the immediate predecessor spec. If `type: change-request`, write `superseded_by: pN` into its frontmatter (where N is the new spec's P-number). Also write `superseded_by` when predecessor is a non-CR spec, since the policy requires it in both cases.

2. **`chain_root` computation** — when the immediate predecessor is `type: change-request`, walk the chain backward to find the first non-CR spec. Write `chain_root: pXXX` on the new spec. Omit `chain_root` when `changes:` already points to the original non-CR spec (chain depth == 1).

3. **Depth-4 guard** — after computing chain depth, if depth ≥ 4 warn: "This chain is 4 deep. Consider consolidating into a fresh spec before filing." Halt and ask the user whether to proceed or consolidate.

No changes to frontmatter schema — all three fields are already defined in `.claude/rules/features.md`.

## Acceptance Criteria

- [x] Filing a CR against a non-CR spec sets `superseded_by` on that predecessor (existing Step 6, verified).
- [x] Filing a CR against a `type: change-request` spec sets `superseded_by` on the predecessor CR.
- [x] The new CR spec gets `chain_root:` pointing to the original non-CR spec when chain depth > 1.
- [x] `chain_root:` is omitted when the immediate predecessor is the original non-CR spec (depth == 1).
- [x] Chain depth is computed correctly for depths 1–4.
- [x] At depth ≥ 4, the skill warns and pauses before creating the spec.
- [x] Skill reads the predecessor spec file to determine its `type` via subagent (Step 2 updated).
