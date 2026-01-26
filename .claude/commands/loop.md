# /loop (DEPRECATED)

> **This command has been replaced by `/dev`.**

## Migration

Use `/dev` instead - it includes everything from `/loop` plus:

- Smart task parallelization (spawns parallel agents when beneficial)
- UAT generation (auto-creates acceptance tests if missing)
- Subagent verification (`/design-audit` runs in fresh context)
- Context-aware skill loading (Vercel, Supabase, etc.)
- Built-in debugging protocol

## Usage

```bash
# Old
/loop

# New
/dev fix the login button
/dev features/p99-story-position.md
```

## What Moved Where

| /loop Feature | Now in /dev |
|---------------|-------------|
| Task classification | Phase 0.5: Task Analysis |
| TDD workflow | Phase 1: Execution |
| Visual checks | Phase 2: Verification |
| Stuck detection | Debugging Protocol section |
| Design audit | Spawns as subagent |
| Test verification gate | Still required, same format |

---

**Run `/dev` now.**
