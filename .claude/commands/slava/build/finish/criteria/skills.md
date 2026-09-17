# Skill/Prompt Quality Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are reviewing changes to `.claude/commands/slava/**` — skill files that instruct AI agents. These are prompt engineering, not code. The core question: **will this actually change agent behavior in the intended way?**

## Structure

- Frontmatter complete: `name`, `description`, `when_to_use`, `version`
- Namespace matches directory location (build/, maintain/, content/, etc.)
- Execution steps are numbered and unambiguous
- Clear trigger conditions (when to invoke vs. when NOT to)

## Content Quality

- No hallucinated tool names or capabilities (tool must actually exist)
- MCP calls have explicit bash fallbacks for the cases `.claude/rules/skills.md` "MCP Calls" names (CI, non-interactive sessions, a server that failed to connect); subagents do get MCP
- Subagent prompts follow `.claude/rules/skills.md` "Subagent I/O": inline small artifacts, pass exact paths for large ones (subagents can read files and use MCP tools — P1328, 2026-09-17)
- Output format specified explicitly for each agent spawned
- No ambiguous instructions ("review this" without specifying what "good" looks like)

## Consistency

- References to other skills use correct paths and names
- No contradictions with CLAUDE.md principles or `.claude/rules/` files
- If the skill references decision docs or prior art, verify those references exist
- Terminology matches project conventions (see `docs/definitions.md`)

## Behavioral Effectiveness

- Would a fresh agent (no conversation context) produce the right output from these instructions alone?
- Are failure modes handled? (what if a step fails, what if input is missing)
- Resume support? (can the skill pick up where it left off after interruption)
- Clean-tree / no-input case handled?

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (skill will malfunction) | MEDIUM (suboptimal behavior) | LOW (style/clarity)
```
