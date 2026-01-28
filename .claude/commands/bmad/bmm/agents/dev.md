# /bmad:bmm:agents:dev (DEPRECATED)

> **This command has been replaced by `/dev`.**

## Migration

Use `/dev` instead - it includes everything from the BMAD dev agent plus:

- Smart task parallelization (spawns parallel agents when beneficial)
- UAT generation (auto-creates acceptance tests if missing)
- Subagent verification (`/design-audit` runs in fresh context)
- Context-aware skill loading (Vercel, Supabase, etc.)
- Built-in debugging protocol
- No persona/menu overhead - just executes

## Usage

```bash
# Old
/bmad:bmm:agents:dev
> *develop-story

# New
/dev features/p70_spec.md
/dev implement user authentication
```

## What Moved Where

| BMAD Dev Agent Feature | Now in /dev |
|------------------------|-------------|
| Story file as source of truth | Spec file loaded in Phase 0 |
| Red-green-refactor cycle | Phase 1: TDD workflow |
| Task checkbox tracking | Marks `[x]` in spec/UAT |
| Dev Agent Record | Phase 3: Output summary |
| File List updates | Phase 3: Files Changed section |
| Never lie about tests | Test Verification Gate (paste required) |
| Code review menu option | Phase 3: Code review prompt |

## No More Persona

The new `/dev` doesn't require "staying in character" - it just executes efficiently.

---

**Run `/dev` now.**
