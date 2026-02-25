# Skill Rules

Auto-loaded when editing `.claude/commands/slava/**/*.md`.

---

## Archiving a Skill

When moving a skill to `archive/`, complete this checklist **before** moving the file:

1. **Find references** — grep for the skill name across all skill files and CLAUDE.md:
   ```bash
   grep -r "skill-name" .claude/commands/slava/ CLAUDE.md
   ```
2. **Check Sequential Flow** — if the skill appears in the `Sequential Flow` section of CLAUDE.md, update or remove it.
3. **Update or note references** — either update the referencing file to point to the replacement, or add a comment explaining why the reference is intentionally kept (e.g., backward-compat note).

Then add `archived_reason` frontmatter to the archived file:

```yaml
---
archived_reason: "one sentence — why archived and what to use instead (or 'no replacement')"
---
```

**Examples:**
- `"replaced by /slava:build:dev auto-close on success"`
- `"prep-spec sub-agent — /prep-spec superseded by sequential flow"`
- `"merged into archive/prep-spec-agents/alignment.md"`
- `"Notion no longer used — retired with no replacement"`

---

## Skill Frontmatter (Active Skills)

Required fields for all active skills:

```yaml
---
name: skill-name
description: One sentence — what this skill does and when to use it
when_to_use: Trigger conditions (optional but recommended)
version: 1.0.0
---
```

Namespace placement: `build/` · `maintain/` · `content/` · `think/` · `util/` · `events/`
No skill without a namespace — if none fits, propose a new one first.
