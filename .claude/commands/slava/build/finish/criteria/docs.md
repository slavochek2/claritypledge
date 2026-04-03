# Documentation Quality Criteria

> Inlined into subagent prompts by `/finish`. Not a standalone skill.

You are reviewing changes to `docs/**` or `docs/technical/**`. These are public-facing documentation in an AGPL-3.0 repo. The core question: **is this accurate, complete, and safe to publish?**

## Accuracy

- File paths, command names, and API shapes mentioned in docs match the current codebase
- No references to deleted files, archived skills, or removed features
- Version numbers, dates, and URLs are current
- Code examples actually work (syntactically correct, imports exist)

## Completeness

- New features mentioned in specs are reflected in relevant docs
- No "TODO", "TBD", or "FIXME" left unresolved
- Architecture docs cover the patterns actually used
- `decisions.md` entries follow the `## YYYY-MM-DD [tag]: Title` format

## Consistency

- No contradictions between different `docs/technical/` files
- Cross-references between docs are valid (linked files exist, anchors resolve)
- Terminology matches `docs/definitions.md`
- `decisions.md` entries include Context, Decision, Alternatives rejected, Consequences

## Privacy (public repo)

- No personal identifiers (emails, phone numbers, names of third parties)
- No private business strategy or unreleased plans
- No client/session content or behavioral observations about identifiable people
- (Detailed PII scan is delegated to `/privacy` — this is a quick check)

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (inaccurate/privacy risk) | MEDIUM (incomplete/stale) | LOW (style/formatting)
```
