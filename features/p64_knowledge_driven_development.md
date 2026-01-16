# P64: Knowledge-Driven Development (KDD)

**Status:** Planning
**Priority:** High (Foundation for all future work)
**Created:** 2026-01-16

---

## Problem Statement

Documentation is scattered and goes stale immediately:
- `features/*.md` - Written once, never updated after implementation
- `docs/visions/v0-v5` - Multiple versions, unclear which is current
- `docs/bmad/`, `docs/business/`, `docs/technical/` - Fragmented
- No changelog, no decision log, no process

**Result:** Nobody knows what's current. Docs become lies.

---

## Solution: Append-Only Knowledge System

### Principles

1. **Append-only beats edit** - Never edit old docs, only append new entries
2. **Regenerable beats maintained** - If it can be derived from code, regenerate it
3. **One place per knowledge type** - No duplicates
4. **Feature docs are disposable** - Planning artifacts, deleted after merge

---

## New Documentation Structure

```
docs/
├── PRODUCT.md           # What the app does NOW
├── VISION.md            # Where we're going (north star)
├── DESIGN-SYSTEM.md     # Visual/UX patterns
│
├── ARCHITECTURE.md      # Technical current state (regenerable)
├── DECISIONS.md         # Why we chose things (append-only)
├── CHANGELOG.md         # What changed when (append-only)
├── KDD.md               # This process documented
│
├── technical/           # Deep-dives (minimal + links to code)
│   ├── auth.md
│   ├── navigation.md
│   └── ...
│
├── business/            # Business ops (separate from product)
│
└── _archive/            # Superseded docs

features/                # TEMPORARY planning space
├── _archive/            # Auto-archived after merge to main
└── p65_*.md             # Active planning (deleted on merge)
```

---

## Document Purposes

| Document | Purpose | Update Pattern |
|----------|---------|----------------|
| PRODUCT.md | What the app is, core features, user types | When product scope changes |
| VISION.md | North star, where we're going | Rarely (strategic pivots) |
| DESIGN-SYSTEM.md | Colors, components, patterns | When design evolves |
| ARCHITECTURE.md | Routes, data model, auth states | Regenerable on demand |
| DECISIONS.md | Why we chose X over Y | Append after each decision |
| CHANGELOG.md | What changed, when | Append after each merge |
| KDD.md | This process | When process evolves |
| technical/*.md | How specific systems work | Minimal, links to code/tests |

---

## The KDD Process

### Lifecycle

```
PLAN              BUILD             COMMIT            MERGE TO MAIN
  │                 │                 │                    │
  ▼                 ▼                 ▼                    ▼
features/p65.md → Code + Tests → Hook: /kdd → Archive feature doc
(temporary)        (truth)       (prompted)   Append DECISIONS
                                              Append CHANGELOG
```

### What You Do vs System Does

| Action | You | System |
|--------|:---:|:------:|
| Write planning doc in features/ | ✅ | |
| Write code + tests | ✅ | |
| Commit | ✅ | Hook prompts `/kdd` |
| Answer "What decision? What changed?" | ✅ | Formats & appends |
| Merge to main | ✅ | Auto-archives features/ |
| Regenerate ARCHITECTURE.md | | On demand |

---

## Skill: `/kdd`

Single skill that prompts for knowledge updates.

**Trigger:** Post-commit hook (optional) or manual

**Flow:**
```
/kdd

1. "Any key decisions to record?"
   → User describes decision
   → Appends formatted entry to DECISIONS.md

2. "What changed?"
   → User describes changes
   → Appends formatted entry to CHANGELOG.md

3. "Update ARCHITECTURE.md?"
   → If yes, regenerates from code
```

**Output format for DECISIONS.md:**
```markdown
## YYYY-MM-DD: Decision Title

**Context:** Why this came up
**Decision:** What we chose
**Alternatives rejected:** What we didn't choose
**Consequences:** What this means going forward
```

**Output format for CHANGELOG.md:**
```markdown
## YYYY-MM-DD

### Added
- New feature X

### Changed
- Modified Y to do Z

### Removed
- Deleted unused W
```

---

## Hooks

### Post-commit hook (optional)
```
After commit: "Run /kdd to update knowledge base? (y/n)"
```

### Pre-merge hook (on merge to main)
```
1. Move features/p*.md → features/_archive/
2. Prompt: "Final /kdd summary for this branch?"
```

---

## Migration: Consolidate Existing Docs

### Phase 1: Create new structure
- [ ] Create `docs/PRODUCT.md` (from product-requirements.md)
- [ ] Create `docs/VISION.md` (consolidate v0-v5 best parts)
- [ ] Create `docs/DESIGN-SYSTEM.md` (from bmad/ux-design-specification.md)
- [ ] Create `docs/ARCHITECTURE.md` (generate from current code)
- [ ] Create `docs/DECISIONS.md` (seed with P50 KISS decision)
- [ ] Create `docs/CHANGELOG.md` (seed with recent commits)
- [ ] Create `docs/KDD.md` (this process)

### Phase 2: Archive old docs
- [ ] Move `docs/visions/v0-v5*.md` → `docs/_archive/visions/`
- [ ] Move `docs/bmad/ux-design-specification.md` → `docs/_archive/`
- [ ] Move `docs/product-requirements.md` → `docs/_archive/`
- [ ] Clean up `features/` - archive completed, delete stale

### Phase 3: Update CLAUDE.md
- [ ] Add KDD section pointing to `docs/KDD.md`
- [ ] Remove redundant doc references
- [ ] Add `/kdd` skill reference

### Phase 4: Create automation
- [ ] Create `/kdd` skill
- [ ] Create post-commit hook (optional prompt)
- [ ] Create pre-merge hook (auto-archive)

---

## CLAUDE.md Addition

```markdown
## Knowledge-Driven Development (KDD)

See [docs/KDD.md](docs/KDD.md) for the full process.

**Quick reference:**
- `/kdd` - Update DECISIONS + CHANGELOG after commits
- `features/` - Temporary planning (auto-archived on merge)
- `docs/` - Permanent knowledge

**Documentation structure:**
- `docs/PRODUCT.md` - What the app does
- `docs/VISION.md` - Where we're going
- `docs/DESIGN-SYSTEM.md` - Visual patterns
- `docs/ARCHITECTURE.md` - Technical state (regenerable)
- `docs/DECISIONS.md` - Why we chose things (append-only)
- `docs/CHANGELOG.md` - What changed (append-only)

**Rule:** Feature docs are disposable. After merge:
1. Distill decisions → DECISIONS.md
2. Distill changes → CHANGELOG.md
3. Archive or delete feature doc
```

---

## Success Criteria

- [ ] Single place for each knowledge type
- [ ] No stale docs (append-only or regenerable)
- [ ] Clear process documented in KDD.md
- [ ] `/kdd` skill works
- [ ] Hooks prompt at right moments
- [ ] Old scattered docs archived
- [ ] CLAUDE.md updated with KDD reference

---

## Out of Scope

- Automated doc generation from code comments (future)
- Version history UI (git handles this)
- External doc hosting (stays in repo)
