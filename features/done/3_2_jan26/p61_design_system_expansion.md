---
status: all-done
type: story
tags: []
rank: 125442.0
created_date: 2026-01-15
completed_at: '2026-02-09'
---

# P61: Design System Consolidation (Lightweight Spec + Simple Validation)

**Status:** Complete
**Priority:** High
**Epic:** Design System Infrastructure
**Created:** 2026-01-15
**Updated:** 2026-01-15 (Completed - all phases executed)

## Problem Statement

The current design system specification is incomplete and fragmented:

1. **Missing negative rules**: Specs say what TO do, but not what NOT to do (e.g., "Green = success" exists, but "Green ≠ actions" is missing)
2. **Fragmented documentation**: Two separate specs (CLAUDE.md + UX design spec) with gaps
3. **Context overhead**: CLAUDE.md design section consumes ~90 lines unnecessarily
4. **Semantic validation gap**: `/design-check` catches syntax violations (amber, iOS blue), but not semantic violations (green action buttons)

**Recent example:** V8 wireframe used green (#22c55e) for "Continue →" action button, violating implicit rule that green should only be used for success states.

## Goals (Revised for KISS)

1. **Single source of truth**: Consolidate fragmented specs into `docs/design-system.md` (~200 lines)
2. **Context efficiency**: CLAUDE.md references spec, doesn't embed it (save ~85 lines)
3. **LLM-first design**: Write spec for Opus to read and interpret (not regex validation)
4. **Minimal validation**: Hook catches obvious syntax violations, Opus handles semantic decisions

## Design Spec Audit (Phase 0)

Before creating the new spec, audit existing documentation for gaps and edge cases.

### Current State

**Two existing specs:**
1. **CLAUDE.md** (lines 417-506): Design System section for AI agents
2. **docs/bmad/ux-design-specification.md** (lines 1-148): UX design spec for Clarity Chat

### Audit Findings

#### ✅ What's Consistent

| Element | CLAUDE.md | UX Design Spec | Status |
|---------|-----------|----------------|--------|
| Primary blue | `blue-500` (#3b82f6) | `blue-500` (#3B82F6) | ✅ Consistent |
| Blue hover | `blue-600` | `blue-600` (#2563EB) | ✅ Consistent |
| Blue highlight | `blue-50` | `blue-50` | ✅ Consistent |
| Success green | `green-500/600` | `green-600` | ✅ Consistent |
| Forbidden colors | amber, orange | amber, orange (in audit) | ✅ Consistent |
| Primary button | Blue with hover | Blue with shadow/hover | ✅ Consistent |

#### ⚠️ Gaps and Inconsistencies

| Issue | CLAUDE.md | UX Design Spec | Problem |
|-------|-----------|----------------|---------|
| **Green usage** | "Success states only" | "Success/Accepted" | ❌ MISSING: "Never for action buttons" |
| **Purple** | Forbidden (implied) | Not mentioned | ❌ Gap: Not explicitly forbidden |
| **Recording red** | `red-500` for recording | `red-500` for recording | ✅ But missing: destructive actions |
| **Typography** | Not documented | Full scale documented | ❌ Gap: No typography in CLAUDE.md |
| **Border radius** | Not documented | Full scale documented | ❌ Gap: No border radius in CLAUDE.md |
| **Badge patterns** | Only 2 types | Only 2 types | ✅ But missing: neutral/info badge |
| **Action pills** | One example | One example | ❌ Missing: nudged/animated state |
| **Excalidraw colors** | Full table | Not mentioned | ❌ Gap: No Excalidraw in UX spec |
| **Message bubbles** | `primary`/`muted` | Full pattern | ❌ Gap: Not in CLAUDE.md |
| **Expandable sections** | Not mentioned | Full pattern | ❌ Gap: Not in CLAUDE.md |

#### 🔴 Critical Edge Cases (Not Covered)

1. **Green for actions/CTAs:**
   - ✅ Says: "Success states only"
   - ❌ Missing: "NEVER for Continue, Next, Submit buttons"
   - ❌ Missing: "Only for confirmation screens post-action"
   - **Real violation:** V8 green Continue button

2. **Purple in UI:**
   - ✅ Excalidraw table says: No yellow/amber/orange/purple
   - ❌ Missing: "Purple only for notes/annotations"
   - ❌ Missing: TSX component purple check
   - **Gap:** User changed V8 note box from purple → blue, but spec didn't say purple was wrong

3. **Red usage:**
   - ✅ Says: "Recording indicator, destructive actions"
   - ❌ Missing: When to use red vs blue for destructive? (e.g., Delete vs Cancel)
   - ❌ Missing: Red for error states?

4. **Blue semantic meaning:**
   - ✅ Says: "Primary CTA, interactive elements"
   - ❌ Missing: "Blue = YOUR content/status in multi-user contexts"
   - ❌ Missing: "Gray = OTHER person's content"
   - **Context:** Excalidraw table has this, but not explained as a pattern

5. **Info/Warning states:**
   - ❌ Missing: How to show warnings without amber?
   - ❌ Missing: Info banners (gray or blue?)
   - **Spec says:** Use blue with messaging, but no examples

6. **Button hierarchy:**
   - ✅ Has: Primary (blue), Secondary (outline)
   - ❌ Missing: When to use which? Decision tree?
   - ❌ Missing: Ghost button usage (UX spec has it, CLAUDE.md doesn't)
   - ❌ Missing: Disabled button styling

7. **Badge hierarchy:**
   - ✅ Has: Success (green), Pending (blue)
   - ❌ Missing: Neutral/Info badge (when neither success nor pending)
   - ❌ Missing: Error badge (red?)

8. **Responsive patterns:**
   - ✅ UX spec has: Responsive typography (`text-4xl sm:text-5xl lg:text-7xl`)
   - ❌ CLAUDE.md missing: Mobile vs desktop patterns
   - ❌ Missing: When to use responsive classes

9. **Animation/States:**
   - ✅ UX spec mentions: `animate-pulse` for nudged buttons
   - ❌ Missing: Other animation patterns
   - ❌ Missing: Loading states (spinners, skeletons)

10. **Accessibility:**
    - ❌ Missing: Color contrast requirements
    - ❌ Missing: Focus states (keyboard navigation)
    - ❌ Missing: Screen reader considerations

### Recommended Spec Structure (Simplified)

Create `docs/design-system.md` with THREE focused sections:

#### Section 1: Foundation (~30 lines)
Reference existing systems, don't reinvent:
- **Tailwind CSS** for design tokens (colors, spacing, typography)
- **shadcn/ui** for accessible components (built on Radix UI)
- **External docs**: Link to Tailwind docs, shadcn/ui, Radix UI
- **Internal reference**: Landing page as visual implementation

#### Section 2: Our Conventions (~120 lines)
Document OUR specific decisions:
- **Color semantics**: Blue (interactive, yours), Green (success only), Gray (neutral, others), Red (destructive, recording)
- **Component patterns**: When to use Button variants (default/outline/destructive/ghost)
- **Multi-user contexts**: Blue = yours, Gray = others (explain the pattern)
- **Typography**: Reference existing patterns from landing page
- **Excalidraw conventions**: Color table + element ID naming (enables validation)

#### Section 3: Anti-Patterns (~50 lines)
What NOT to do with clear examples:
- ❌ Green for action buttons (use blue) - V8 example
- ❌ Amber/orange/yellow anywhere (use blue + messaging)
- ❌ Purple in UI (Excalidraw notes only)
- ❌ iOS blue #007AFF (use Tailwind blue-500)
- ❌ Pixel font sizes text-[17px] (use semantic text-lg)
- ❌ Custom button styling (use shadcn/ui Button variants)
- ❌ Blue info banners (use gray - blue implies clickable)

**Key insight**: Keep decision trees minimal. Add only when real confusion arises (YAGNI).

## File Structure Decision

**Problem:** CLAUDE.md is consuming context with embedded design system section.

**Solution:** Create separate, lightweight design spec, reference it from CLAUDE.md.

### New File: `docs/design-system.md`

Lightweight spec (~200 lines) using simplified 3-section structure above.

**Why `docs/`?**
- Human-readable documentation folder
- Version controlled with code
- Easy for Opus to reference on demand
- NOT in `.claude/` (that's for tool config)
- NOT in `docs/bmad/` (that's workflow artifacts)

### Updated CLAUDE.md Section

Replace current "Design System" section (lines 417-506) with **ultra-lightweight pointer**:

```markdown
## Design System

**Specification:** [docs/design-system.md](docs/design-system.md)

**Before creating UI**: Read the spec above. It references shadcn/ui and Tailwind CSS - use those components and tokens.

**Quick rules (most common violations):**
- ✅ Blue for actions/CTAs, green for SUCCESS ONLY
- ❌ Never green action buttons, amber/orange/yellow, purple in UI
```

**Benefits:**
- Saves ~85 lines in CLAUDE.md
- Full spec loaded only when needed
- Single source of truth
- Less context consumed per request

## Implementation Plan (Simplified)

### Phase 0: Spec Audit ✅ COMPLETE
- ✅ Read both existing specs
- ✅ Identify gaps and inconsistencies
- ✅ Architectural review with Winston (this session)
- ✅ Define simplified structure (3 sections, ~200 lines)

### Phase 1: Create Lightweight Spec (Priority 1 - ~1 hour)

1. **Create `docs/design-system.md`** with 3-section structure:
   - **Foundation** (~30 lines): Reference Tailwind, shadcn/ui, external docs
   - **Our Conventions** (~120 lines): Color semantics, component patterns, Excalidraw conventions
   - **Anti-Patterns** (~50 lines): What NOT to do with examples

2. **Content sources**:
   - Extract patterns from CLAUDE.md (lines 417-506)
   - Extract patterns from `docs/bmad/ux-design-specification.md`
   - Reference [clarity-pledge-landing.tsx] for visual examples
   - Add missing edge cases from audit (green action buttons, multi-user contexts)

3. **Replace CLAUDE.md section** (lines 417-506) with ultra-lightweight pointer

4. **Archive old specs**:
   - Move `docs/bmad/ux-design-specification.md` → `docs/bmad/archive/`
   - Mark as "Superseded by docs/design-system.md"

**Deliverable**: Single source of truth at `docs/design-system.md`, CLAUDE.md pointer updated

### Phase 2: Update Validation References (Priority 2 - ~30 minutes)

**Keep validation simple** - only update spec references:

1. **Update `.claude/commands/design-check.md`**:
   - Line 7: Change "CLAUDE.md" → "docs/design-system.md"
   - Line 78: Change reference to new spec file
   - Keep existing checks (amber, iOS blue, pixel sizes)
   - **DO NOT add complex green button regex** - let Opus interpret spec

2. **Update `.claude/hooks/design-system-check.sh`**:
   - Line 109: Change "CLAUDE.md" → "docs/design-system.md"
   - Keep existing checks (amber, orange, yellow, iOS blue, pixel sizes, purple)
   - **DO NOT add green button validation** - too many false positives, Opus handles this

**Rationale**: Hook catches obvious syntax violations. Opus with Playwright/Chrome DevTools MCP handles semantic violations (reading spec context).

**Deliverable**: Validation tools reference correct spec, no added complexity

### Phase 3: Fix Known Violations (Priority 3 - ~15 minutes)

1. **Fix V8 wireframe**: Change Continue button from green (#22c55e) to blue (#3b82f6)
2. **Archive old wireframes**: Move V4-V7 to `docs/bmad/diagrams/archive/` (V8 is latest)
3. **Skip V6**: If not actively used, just archive it

**Deliverable**: Latest wireframe (V8) compliant, old versions archived

### Phase 4: SKIPPED (Premature Optimization)
- ~~Pre-commit hooks~~ - Unnecessary for solo dev, hook already runs on Edit/Write
- ~~Lint rules~~ - Over-engineering, Opus handles semantic decisions
- ~~Decision trees~~ - Add when real confusion arises (YAGNI)

## Success Criteria (Revised)

- [x] `docs/design-system.md` created (~200 lines, 3 sections)
- [x] CLAUDE.md Design System section replaced with 3-line pointer
- [x] `docs/bmad/ux-design-specification.md` archived to `docs/bmad/archive/`
- [x] `.claude/commands/design-check.md` updated to reference new spec
- [x] `.claude/hooks/design-system-check.sh` updated to reference new spec
- [x] V8 wireframe fixed (green → blue Continue button)
- [x] Old wireframes (V4-V7) archived to `docs/bmad/diagrams/archive/`
- [x] Opus can read spec and make semantic design decisions
- [x] Hook still catches syntax violations (amber, iOS blue, pixel sizes)

## Technical Approach (KISS)

**What we're using:**
- ✅ **Markdown documentation** in `docs/design-system.md` (~200 lines)
- ✅ **shadcn/ui** for accessible components (already in codebase)
- ✅ **Tailwind CSS** for design tokens (already in use)
- ✅ **External references** to Tailwind docs, shadcn/ui docs (don't reinvent)
- ✅ **Landing page** as visual reference (not dependency)
- ✅ **Simple validation** via existing hook (syntax only)

**What we're NOT using:**
- ❌ **Tailwind UI** ($299 paywalled product - we have shadcn/ui already)
- ❌ **Figma Variables/Design OS** (premature - adds ceremony for solo dev)
- ❌ **Storybook** (overkill - shadcn/ui docs + landing page sufficient)
- ❌ **Design tokens JSON** (Tailwind config is our token system)
- ❌ **Complex regex validation** (let Opus read spec and decide)
- ❌ **Pre-commit blocking** (hook warnings + Opus semantic checks sufficient)

**Key insight**: We're not building a design system. We're **documenting our Tailwind + shadcn/ui conventions** so Opus can follow them consistently.

**Validation philosophy**:
- **Hook** catches obvious syntax violations (amber colors, iOS blue)
- **Opus** reads spec and handles semantic decisions (green action buttons, multi-user contexts)
- **Playwright/Chrome DevTools MCP** enables visual validation when needed

**Rationale:** Start simple, iterate based on real pain points. Don't over-engineer.

## Design Decisions (Resolved)

### 1. What happened to `docs/bmad/ux-design-specification.md`?
**Decision**: Archive to `docs/bmad/archive/` - it's Clarity Chat-specific, new spec is app-wide.

### 2. Should we add complex green button validation to the hook?
**Decision**: No. Too many false positives (context-dependent). Opus reads spec and makes semantic decisions. Hook catches only syntax violations (amber, iOS blue, pixel sizes).

### 3. Should validation block commits or just warn?
**Decision**: Keep non-blocking warnings. Opus with Playwright/Chrome DevTools MCP handles semantic validation. Hook is for quick syntax checks during editing.

### 4. How detailed should the spec be?
**Decision**: ~200 lines, 3 sections. Reference external docs (Tailwind, shadcn/ui) instead of reinventing. Document only OUR conventions (color semantics, when to use what). Add decision trees only when real confusion arises (YAGNI).

### 5. Should we use Tailwind UI as reference?
**Decision**: No. It's a $299 paywalled product. We already have shadcn/ui (free, open, better accessibility via Radix UI). Reference those docs instead.

### 6. Multi-user context pattern scope?
**Decision**: Document pattern (blue = yours, gray = others) in spec, but clarify it's currently used in Excalidraw wireframes. Add to production components when needed (YAGNI).

### 7. Landing page as "source of truth"?
**Decision**: Decouple. Landing page is a **visual reference**, not a dependency. Spec is the canonical source. Reference landing page for examples, but don't rely on it (what if we redesign?).

## Dependencies

- Landing page UI (source of truth - already exists)
- `.claude/commands/design-check.md` skill (needs update)
- `.claude/hooks/design-system-check.sh` hook (needs update)
- CLAUDE.md (needs pointer replacement)

## Related Files

- [CLAUDE.md](../../../CLAUDE.md) (lines 417-506 - current design system section)
- [docs/bmad/ux-design-specification.md](../../../docs/bmad/archive/ux-design-specification.md) (existing UX spec)
- [.claude/commands/design-check.md](../.claude/commands/design-check.md) (current skill)
- [.claude/hooks/design-system-check.sh](../../../.claude/hooks/design-system-check.sh) (current hook)
- [src/app/pages/landing-page.tsx](../src/app/pages/landing-page.tsx) (source of truth for UI)
- [docs/bmad/diagrams/sifter-mvp-wireframe-v8.excalidraw](../../../docs/bmad/diagrams/sifter-mvp-wireframe-v8.excalidraw) (example violation)

## Execution Notes

**Estimated time**: 1h 45m total
- Phase 1: 1 hour (create spec, update CLAUDE.md, archive old specs)
- Phase 2: 30 minutes (update skill + hook references)
- Phase 3: 15 minutes (fix V8, archive old wireframes)

**Agent recommendations**:
- **Dev agent** for Phase 1 (documentation writing)
- **Dev agent** for Phase 2 (tool updates)
- **UX Designer agent** for Phase 3 (wireframe fixes) OR Dev agent (quick fix)

**Testing**:
- Read `docs/design-system.md` and verify clarity
- Verify CLAUDE.md pointer works
- Run `/design-check` on V8 (should catch amber if any)
- Verify hook still runs after Edit/Write on `.excalidraw` files

---

## Next Steps

**For Slava:**
1. ✅ Review revised P61 (this version)
2. Execute with Dev agent or other specialist
3. Validate spec is clear and useful
4. Use spec going forward for all UI work

**For executing agent:**
1. Phase 1: Create `docs/design-system.md` using 3-section structure
2. Phase 1: Update CLAUDE.md pointer (lines 417-506 → 3 lines)
3. Phase 1: Archive `docs/bmad/ux-design-specification.md`
4. Phase 2: Update `.claude/commands/design-check.md` references
5. Phase 2: Update `.claude/hooks/design-system-check.sh` references
6. Phase 3: Fix V8 wireframe Continue button (green → blue)
7. Phase 3: Archive V4-V7 wireframes to `docs/bmad/diagrams/archive/`
