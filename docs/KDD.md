# Knowledge-Driven Development (KDD)

Minimal knowledge capture for decisions that matter.

## Principle

Git tracks *what* changed. KDD captures *why*.

## Components

| Component | Purpose |
|-----------|---------|
| `docs/DECISIONS.md` | Append-only log of trade-offs and reasoning |
| `/kdd` | Skill to record decisions (run manually) |
| `features/archive/` | Completed feature docs after merge |

## When to Run `/kdd`

- After finishing a feature with interesting trade-offs
- When making a decision worth remembering
- When confusion about past decisions signals one should have been recorded

## Process

```
PLAN                    BUILD                   AFTER MERGE
  │                       │                          │
  ▼                       ▼                          ▼
features/p66.md  →  Code + Tests + Commits  →  Run /kdd (optional)
(temporary)            (truth)                   Move to features/archive/
```

## Decision Entry Format

```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```
