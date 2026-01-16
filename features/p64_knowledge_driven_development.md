# P64: Knowledge-Driven Development (KDD)

**Status:** Planning
**Priority:** High (Foundation for all future work)
**Created:** 2026-01-16
**Updated:** 2026-01-16

---

## Problem Statement

Documentation is scattered and goes stale immediately:
- `features/*.md` - Written once, never updated after implementation
- `docs/visions/v0-v7` - Multiple versions, evolution unclear
- `docs/bmad/`, `docs/business/`, `docs/technical/` - Fragmented
- No changelog, no decision log, no process

**Result:** Nobody knows what's current. Docs become lies.

---

## Solution: Append-Only Knowledge System

### Principles

1. **Append-only beats edit** - Never edit old entries, only add new ones at top
2. **Regenerable beats maintained** - If it can be derived from code, regenerate it
3. **One place per knowledge type** - No duplicates
4. **Feature docs are temporary** - Planning artifacts, archived after merge
5. **No deletions** - Archive superseded docs, keep reference materials

---

## Documentation Structure

```
docs/
├── PRODUCT.md           # What the app does NOW
├── VISION.md            # North star pointer + evolution context
├── DESIGN-SYSTEM.md     # Visual/UX patterns (rename existing)
├── ARCHITECTURE.md      # Technical current state (regenerable)
├── DECISIONS.md         # Why we chose things (append-only)
├── CHANGELOG.md         # What changed when (append-only)
├── KDD.md               # This process documented
│
├── visions/             # ACTIVE - evolution of thinking (keep as-is)
│   ├── v0_theory-of-change.md
│   ├── v1_vision-meme-platform.md
│   ├── ...
│   ├── v7_communicative_critical_rationalism.md  ← CURRENT
│   └── *.pdf            # Research materials (keep)
│
├── technical/           # Deep-dives (keep, minimal + links to code)
├── business/            # Business ops (keep)
├── inspiration/         # Reference materials (keep)
├── bmad/                # BMAD workflow outputs (keep)
│
└── _archive/            # Superseded docs only
    └── mvp_pledge.md    # (after PRODUCT.md created)

features/                # TEMPORARY planning space
├── _archive/            # Auto-archived after merge to main
└── p65_*.md             # Active planning
```

---

## Document Purposes

| Document | Purpose | Update Pattern |
|----------|---------|----------------|
| PRODUCT.md | What the app is, core features, user types | When product scope changes |
| VISION.md | North star pointer, links to visions/ | When vision evolves (add new vX) |
| DESIGN-SYSTEM.md | Colors, components, patterns | When design evolves |
| ARCHITECTURE.md | Routes, data model, auth states | Regenerable on demand |
| DECISIONS.md | Why we chose X over Y | Append-only (newest at top) |
| CHANGELOG.md | What changed, when | Append-only (newest at top) |
| KDD.md | This process | When process evolves |
| visions/*.md | Evolution of product thinking | Add new versions, never edit old |
| technical/*.md | How specific systems work | Minimal, links to code/tests |

---

## The KDD Process

### What You Do

```
PLAN                    BUILD                   MERGE TO MAIN
  │                       │                          │
  ▼                       ▼                          ▼
features/p65.md  →  Code + Tests + Commits  →  Pre-merge hook runs /kdd
(temporary)            (truth)                   - Prompts for decisions/changes
                                                 - Archives feature doc
                                                 - Merge proceeds
```

### Your Workflow

| Step | What Happens |
|------|--------------|
| 1. Plan | Write `features/p65_whatever.md` |
| 2. Build | Code, test, commit (normal work) |
| 3. Merge | Pre-merge hook auto-runs `/kdd` |
| 4. Answer | One prompt: decisions + changes (Enter to skip) |
| 5. Done | Feature doc archived, knowledge captured |

---

## Skill: `/kdd`

Single command for knowledge capture.

### When It Runs

| Trigger | Behavior |
|---------|----------|
| **Pre-merge hook** (automatic) | Runs before merge to main |
| **Manual** (`/kdd`) | Run anytime you want to capture knowledge |

### Smart Skip

If `/kdd` ran in the last 5 minutes on this branch, pre-merge hook skips the prompts and just archives.

### Flow

```
/kdd

Commits on this branch:
- feat: add event creation form
- fix: validation edge case
- refactor: extract event utils

Any decisions or changes worth noting? [Enter to skip]
> _

[Enter]           → Done, nothing written
[Type something]  → Claude formats and appends to appropriate doc
```

### How It Decides Where to Append

| Your input mentions... | Goes to... |
|------------------------|------------|
| "chose", "decided", "instead of", "why" | DECISIONS.md |
| "added", "changed", "fixed", "removed" | CHANGELOG.md |
| Both | Both (Claude splits it) |

### Output Formats

**DECISIONS.md** (newest at top):
```markdown
## 2026-01-16: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

**CHANGELOG.md** (newest at top):
```markdown
## 2026-01-16

### Added
- New feature X

### Changed
- Modified Y to do Z

### Removed
- Deleted unused W
```

---

## Pre-Merge Hook

### What It Does

```bash
# Triggered when merging any branch to main

1. Check: Did /kdd run in last 5 minutes?
   → Yes: Skip to step 3
   → No: Run /kdd (prompts user)

2. /kdd prompts:
   - Shows commits on branch
   - "Any decisions or changes worth noting? [Enter to skip]"
   - Appends to DECISIONS.md / CHANGELOG.md if user types

3. Archive feature doc:
   - Move features/p*.md → features/_archive/
   - (Only if file exists matching branch pattern)

4. Proceed with merge
```

### Tracking Last Run

`/kdd` writes timestamp to `.kdd-last-run`:
```
branch: p65-events-feature
timestamp: 2026-01-16T14:32:00Z
```

Pre-merge hook reads this to decide whether to prompt.

---

## Migration Plan

### Phase 1: Create Core Docs
- [ ] Create `docs/PRODUCT.md` (from mvp_pledge.md + current reality)
- [ ] Create `docs/VISION.md` (pointer to visions/, explain v7 is current)
- [ ] Rename `docs/design-system.md` → `docs/DESIGN-SYSTEM.md`
- [ ] Create `docs/ARCHITECTURE.md` (generate from current code)
- [ ] Create `docs/DECISIONS.md` (seed with key past decisions)
- [ ] Create `docs/CHANGELOG.md` (seed with recent major changes)
- [ ] Create `docs/KDD.md` (this process)

### Phase 2: Archive Superseded Docs
- [ ] Create `docs/_archive/` folder
- [ ] Move `docs/mvp_pledge.md` → `docs/_archive/` (after PRODUCT.md done)
- [ ] Create `features/_archive/` folder
- [ ] Move completed features → `features/_archive/`

### Phase 3: Create Automation
- [ ] Create `/kdd` skill
- [ ] Create pre-merge hook
- [ ] Create `.kdd-last-run` tracking

### Phase 4: Update CLAUDE.md
- [ ] Add KDD section
- [ ] Add `/kdd` to skill list
- [ ] Update documentation structure section

---

## CLAUDE.md Addition

```markdown
## Knowledge-Driven Development (KDD)

See [docs/KDD.md](docs/KDD.md) for the full process.

**Quick reference:**
- `/kdd` - Capture decisions + changes (runs auto on merge, or manual)
- `features/` - Temporary planning (auto-archived on merge)
- `docs/` - Permanent knowledge

**Documentation structure:**
| Doc | Purpose | Pattern |
|-----|---------|---------|
| PRODUCT.md | What the app does now | Edit when scope changes |
| VISION.md | North star + visions/ index | Add new vX versions |
| DESIGN-SYSTEM.md | Visual patterns | Edit when design evolves |
| ARCHITECTURE.md | Technical state | Regenerate on demand |
| DECISIONS.md | Why we chose things | Append-only |
| CHANGELOG.md | What changed when | Append-only |
| visions/*.md | Evolution of thinking | Add new, never edit old |

**The rule:** Feature docs die after merge. Knowledge lives in append-only logs.
```

---

## Success Criteria

- [ ] Single place for each knowledge type
- [ ] No stale docs (append-only or regenerable)
- [ ] Clear process documented in KDD.md
- [ ] `/kdd` skill works
- [ ] Pre-merge hook runs automatically
- [ ] Hook skips if `/kdd` ran recently
- [ ] Feature docs auto-archived on merge
- [ ] visions/ folder stays active (not archived)
- [ ] CLAUDE.md updated with KDD reference

---

## Out of Scope

- Automated doc generation from code comments (future)
- Version history UI (git handles this)
- External doc hosting (stays in repo)
- Post-commit hooks (decided: pre-merge is better)
- Deleting any existing docs (archive only)
