# /quick-dev (DEPRECATED)

> **This command has been replaced by `/dev`.**

## Migration

Use `/dev` instead - it includes everything from `/quick-dev` plus:

- Smart task parallelization (spawns parallel agents when beneficial)
- UAT generation (auto-creates acceptance tests if missing)
- Subagent verification (`/design-audit` runs in fresh context)
- Context-aware skill loading (Vercel, Supabase, etc.)
- Built-in debugging protocol
- Full TDD workflow with test verification gates

## Usage

```bash
# Old
/quick-dev features/p70_spec.md
/quick-dev refactor src/foo.ts

# New
/dev features/p70_spec.md
/dev refactor src/foo.ts
```

## What Moved Where

| /quick-dev Feature | Now in /dev |
|--------------------|-------------|
| Mode A: Tech-spec | Phase 0.5: Detects spec file automatically |
| Mode B: Direct instructions | Phase 0.5: Detects direct mode |
| Create tech-spec option | Can still use `/create-tech-spec` separately |
| User skill level | Referenced from project config |
| Code review prompt | Phase 3: Output section |

---

**Run `/dev` now.**
