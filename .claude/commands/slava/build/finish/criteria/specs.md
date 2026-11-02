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

## Founder asks with no criterion

Reviews that read only the spec cannot see a request that never reached it. So read the founder's messages too: what the caller passed, or the messages since the spec's last commit (`/finish` Step 4 says how to get them).

List every specific request or objection about what the product should do or show that has **no acceptance criterion**. A criterion is a checkbox line naming the visible element or behaviour. A mention in prose, a decision, a journey step, a wireframe or a table does not count: that is how the requests get lost (P1536: voice in canvas threads and the mirror chat's + were both written in prose, had no checkbox, and were not built). Skip passing thoughts, questions the founder answered themselves, and anything the spec declines with a reason.

Add a second table: Ask (the founder's words, under 20 words) | Nearest spec text, or none | Why it is not a criterion. End with `Uncovered: N.` This is advisory, not a block: the builder answers one line per ask, criterion added, declined with a reason, or escalated to the founder.

Proven 2026-11-02 on real messages: against P1536's spec before S3c it flagged the audio button and the paperclip's canvases; against the spec with S3c it flagged neither.

## Cost budget

- A spec whose Solution matches "When this applies" in `docs/technical/metered-services.md` carries `## Cost Budget`. Table and severities (HIGH blocks the ship): that doc.
- A spec with no metered surface carries no such section; do not ask for one.

## Output Format

```markdown
### Findings
| # | Finding | File:Line | Severity | Description |
|---|---------|-----------|----------|-------------|

Severity: HIGH (spec will cause wrong implementation) | MEDIUM (ambiguous/incomplete) | LOW (style/formatting)
```
