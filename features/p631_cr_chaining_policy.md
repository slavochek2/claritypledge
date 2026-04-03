---
status: today
type: task
rank: 1000034.0
tags:
  - process
  - rules
  - change-request
created_date: 2026-04-03
---

# P631: CR Chaining Policy — supersedes/chain_root for CR-on-CR

## Problem Statement

Current CR policy assumes single-depth: original spec → one change-request. When a CR itself needs correction (P616 → P621 → next CR), the rules don't handle:
- `changes:` pointing to another CR (not an original spec)
- Reading the full chain (root → CR1 → CR2) for context
- Unshipped predecessors (codebase state ≠ predecessor spec)

Discovered during P621 scope iterations — agent read P621 as "the predecessor" but missed that P616 was the root and P621 never shipped.

## Solution

Add to `.claude/rules/features.md`:

1. **`supersedes` + `chain_root` frontmatter** for CR-on-CR
2. **Chain-reading protocol** in Processing Contract — walk to root, read each spec
3. **Unshipped predecessor handling** — codebase state = last shipped ancestor

## Acceptance Criteria

- [ ] `features.md` Change Requests section has CR Chaining subsection with `supersedes:` and `chain_root:` fields
- [ ] Processing Contract updated to walk full chain and handle unshipped predecessors
- [ ] Changes pass `/claude-md` gate
