# Feature Spec Quality Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are reviewing changes to `features/p*.md` — feature specification files. The core question: **is this spec complete, consistent, and implementable?**

## Frontmatter

- Required fields present: `title`, `status`, `type`, `p_number`
- `status` is a valid value (backlog, in-progress, qa, done)
- `type` is a valid value (story, task, bug, comment, change-request)
- If `type: change-request`: `predecessor` field references an existing spec

## Acceptance Criteria

- Every AC is testable (a developer can write a test for it)
- No vague criteria ("should work well", "looks good")
- Edge cases covered (empty state, error state, max values)

## Consistency

- References to other specs, files, or components are valid
- No contradictions between sections (e.g., scope says X is excluded but AC tests X)
- Terminology matches `docs/definitions.md`

## Completeness

- No unresolved `[FOUNDER DECISION: ...]` markers left from PRD phase
- No "TBD", "TODO", or placeholder sections
- If architecture section exists: build sequence is present

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (spec will cause wrong implementation) | MEDIUM (ambiguous/incomplete) | LOW (style/formatting)
```
