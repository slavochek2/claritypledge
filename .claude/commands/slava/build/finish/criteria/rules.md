# Rules/CLAUDE.md Coherence Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are reviewing changes to `.claude/rules/**` or `CLAUDE.md`. These files control agent behavior across all sessions. The core question: **will this change produce consistent, correct agent behavior?**

## Placement

- Universal rules (apply to >80% of tasks) belong in `CLAUDE.md`
- Path-specific rules belong in `.claude/rules/{path}.md` (auto-loaded when editing matching files)
- Patterns and guides belong in `docs/technical/`
- Decisions belong in `docs/decisions.md`
- Flag any content in the wrong location

## Redundancy

- No content duplicated between `CLAUDE.md` and `.claude/rules/` files
- No content duplicated between different `.claude/rules/` files
- Reference over duplication: link to the source, don't copy
- Check: does this rule already exist elsewhere in a different form?

## Consistency

- Rules in `.claude/rules/` must not contradict `CLAUDE.md`
- Auto-load path patterns in `CLAUDE.md` must match actual `.claude/rules/` filenames
- `CLAUDE.md` line budget: must stay at or below 350 lines
- Reversibility classification must be consistent with CLAUDE.md's ALWAYS-ACT / ALWAYS-ASK / JUDGMENT lists

## Quality

- Every rule should have a "why" — a principle, incident reference, or rationale
- Rules should be testable/assessable — not vague ("be careful" → bad; "always check X before Y" → good)
- No orphaned references to deleted skills, agents, or features
- No stale instructions that reference removed functionality

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (will cause wrong behavior) | MEDIUM (inconsistency/redundancy) | LOW (clarity/style)
```
