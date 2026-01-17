# P64: Knowledge-Driven Development (KDD)

**Status:** Planning
**Priority:** Medium (depends on P65)
**Created:** 2026-01-16
**Updated:** 2026-01-16
**Depends on:** P65 (CLAUDE.md restructuring)

---

## Problem Statement

Documentation goes stale immediately:
- `features/*.md` - Written once, never updated after implementation
- No decision log - Trade-offs and "why" are lost
- No process - Knowledge capture depends on memory

**Result:** Past decisions are forgotten. Same debates repeat.

---

## Solution: Minimal Knowledge Capture

### Principles

1. **Decisions matter, not changes** - Git tracks what changed; we track *why*
2. **Append-only** - Never edit old entries, only add new ones at top
3. **Manual discipline over automation** - No hooks, just a command to run when needed
4. **Feature docs are temporary** - Planning artifacts, manually archived after merge

---

## What We're Building

### 1. `docs/DECISIONS.md` (append-only log)

Records trade-offs and reasoning. Format:

```markdown
## 2026-01-16: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

### 2. `/kdd` skill (manual command)

Run it when you want to capture a decision. No automation, no hooks.

```
/kdd

Recent commits on this branch:
- feat: add event creation form
- fix: validation edge case

Any decisions worth recording? [Enter to skip]
> We chose client-side validation over server-side because...

✓ Appended to docs/DECISIONS.md
```

### 3. `features/_archive/` folder

Manually move completed feature docs here after merge.

---

## What We're NOT Building

| Dropped | Reason |
|---------|--------|
| CHANGELOG.md | Git log is enough |
| ARCHITECTURE.md | CLAUDE.md already covers this |
| PRODUCT.md | Out of scope for now |
| VISION.md | Out of scope for now |
| Pre-merge hooks | KISS - manual discipline is enough |
| Auto-archival | Pattern matching is fragile |
| Smart skip logic | No hooks = no need |

---

## Process

```
PLAN                    BUILD                   AFTER MERGE
  │                       │                          │
  ▼                       ▼                          ▼
features/p66.md  →  Code + Tests + Commits  →  Run /kdd (optional)
(temporary)            (truth)                   Move feature doc to _archive/
```

**When to run `/kdd`:**
- After finishing a feature with interesting trade-offs
- When you make a decision worth remembering
- When you're confused about past decisions (signal you should have recorded one)

---

## Migration Plan

### Phase 1: Setup
- [ ] Create `docs/DECISIONS.md` with header and first entry
- [ ] Create `features/_archive/` folder
- [ ] Move completed features to archive

### Phase 2: Skill
- [ ] Create `/kdd` skill

### Phase 3: Documentation
- [ ] Create `docs/KDD.md` (brief process doc)
- [ ] Add KDD reference to CLAUDE.md (after P65 restructuring)

---

## CLAUDE.md Addition (after P65)

```markdown
## Knowledge-Driven Development

- `/kdd` - Record decisions (run manually when you have something worth capturing)
- `docs/DECISIONS.md` - Why we chose things (append-only, newest at top)
- `features/_archive/` - Completed feature docs (move manually after merge)
```

---

## Success Criteria

- [ ] `docs/DECISIONS.md` exists with clear format
- [ ] `/kdd` skill works
- [ ] `features/_archive/` exists
- [ ] Process documented in `docs/KDD.md`
- [ ] CLAUDE.md references KDD (after P65)

---

## Out of Scope

- Automation (hooks, auto-archival)
- CHANGELOG.md (git is enough)
- ARCHITECTURE.md (CLAUDE.md covers it)
- PRODUCT.md, VISION.md (future consideration)
