---
status: all-done
type: comment
tags: []
rank: 125407.0
created_date: 2026-01-15
completed_at: '2026-02-09'
---

# P62: Design System Expansion (Comprehensive Spec + Validation)

**Status:** Planning
**Priority:** High
**Epic:** Design System Infrastructure
**Created:** 2026-01-15

## Problem Statement

The current design system specification in CLAUDE.md is incomplete and missing critical guidance:

1. **Missing negative rules**: Spec says what TO do, but not what NOT to do (e.g., "Green = success" exists, but "Green ≠ actions" is missing)
2. **Incomplete button patterns**: Landing page has patterns not documented in spec
3. **No automated validation**: `/design-check` skill can't catch all violations (e.g., missed green Continue button in V8)
4. **Inconsistent application**: Wireframes and components diverge from landing page patterns

**Recent example:** V8 wireframe used green (#22c55e) for "Continue →" action button, violating implicit rule that green should only be used for success states.

## Goals

1. **Comprehensive documentation**: Expand CLAUDE.md design spec to cover all patterns from landing page
2. **Negative rules**: Add "What NOT to do" section for each design element
3. **Automated validation**: Update `/design-check` skill to catch all violations
4. **Source of truth**: Establish landing page as canonical reference
5. **KISS approach**: Keep it simple - use existing tools (shadcn/ui + Tailwind + Markdown), no Figma/Storybook yet

## User Story

**As a** developer or AI agent working on this codebase
**I want** comprehensive design system documentation with both positive and negative rules
**So that** I can build consistent UI without accidentally violating design principles

## Success Criteria

- [ ] CLAUDE.md has expanded "Design System" section with:
  - Complete color semantic rules (positive + negative)
  - All button variants from landing page with code examples
  - "What NOT to do" subsection for each element type
  - Badge/pill patterns
  - Card patterns
  - Typography scale
  - Spacing conventions

- [ ] `/design-check` skill updated to validate:
  - ✅ Existing: Forbidden colors (amber, orange, yellow, purple in UI)
  - ✅ Existing: iOS blue (#007AFF)
  - 🆕 NEW: Green used for non-success elements (actions, CTAs, info states)
  - 🆕 NEW: Button color violations (non-blue primary CTAs)
  - 🆕 NEW: Inconsistent badge patterns

- [ ] Pre-commit hook validates design compliance (optional, nice-to-have)

- [ ] V8 wireframe fixed to use blue Continue button (apply after spec is done)

## File Structure Decision

**Problem:** CLAUDE.md is getting too large and consuming too much context.

**Solution:** Create separate design specification file, reference it from CLAUDE.md with minimal context.

### New File: `docs/design-system-spec.md`

This file will contain the full specification:
- Complete color semantic rules (positive + negative)
- All button variants with code examples
- Status badges, cards, typography, spacing
- Excalidraw wireframe color reference
- "What NOT to do" sections for each element
- Examples extracted from landing page

### Updated CLAUDE.md Section

Replace current "Design System" section (lines 280-579) with **lightweight pointer**:

```markdown
## Design System

**Specification:** [docs/design-system-spec.md](docs/design-system-spec.md)

**Source of truth:** Landing page ([src/app/pages/landing-page.tsx](src/app/pages/landing-page.tsx))

**Before creating UI:**
1. Read the full spec at [docs/design-system-spec.md](docs/design-system-spec.md)
2. Reference landing page for visual examples
3. Run `/design-check` to validate compliance

**Quick rules (most common violations):**
- ✅ Blue for actions/CTAs, user's content
- ✅ Green for SUCCESS ONLY (verified, confirmed, completed)
- ❌ Never green for action buttons (Continue, Next, Submit)
- ❌ Never amber/orange/yellow in UI
- ❌ Never purple except notes/annotations
```

**Benefits:**
- Saves ~300 lines in CLAUDE.md
- Full spec only loaded when needed
- Easier to maintain single source
- Less context consumed per request

## Implementation Plan

### Phase 1: Documentation (Priority 1)
1. **Create `docs/design-system-spec.md`** with comprehensive specification:
   - Colors (semantic meanings + "What NOT to do")
   - Buttons (all variants from landing page + anti-patterns)
   - Badges (success/pending/neutral + violations)
   - Cards, typography, spacing
   - Excalidraw colors (positive + negative rules)
2. **Replace CLAUDE.md section** with lightweight pointer (lines 280-579)
3. **Extract patterns** from [src/app/pages/landing-page.tsx](../src/app/pages/landing-page.tsx)

### Phase 2: Validation (Priority 2)

#### 2A. Review Current Implementation

**Skill:** `.claude/commands/design-check.md` (lines 1-79)
**Hook:** `.claude/hooks/design-system-check.sh` (lines 1-117)

**Current capabilities (GOOD):**
- ✅ Checks `.excalidraw` files for forbidden colors (amber, orange, yellow)
- ✅ Checks for iOS blue (#007AFF)
- ✅ Checks TSX files for amber/orange/yellow Tailwind classes
- ✅ Checks for pixel font sizes (text-[Npx])
- ✅ Hook runs automatically after Edit/Write on UI files
- ✅ Non-blocking (warnings only, doesn't fail edits)

**Missing checks (CRITICAL GAPS):**
1. ❌ **Green for actions** - Doesn't catch green buttons/CTAs in non-success contexts
   - Example: V8 Continue button (#22c55e) - NOT DETECTED
   - Should detect: `"id": ".*-btn.*", "strokeColor": "#22c55e"` in action contexts
2. ❌ **Purple in UI** - Only checks Excalidraw, not TSX components
   - Should check: `bg-purple-*`, `text-purple-*` in non-note contexts
3. ❌ **Button variant violations** - Doesn't validate shadcn/ui Button usage
   - Should check: Custom button classes instead of `<Button variant="...">`
4. ❌ **Reference to outdated spec** - Points to CLAUDE.md (lines 7, 109) which will be replaced with pointer

**Recommendations:**

#### 2B. Update Skill (`.claude/commands/design-check.md`)
```markdown
# Changes needed:

1. Line 7: Change "CLAUDE.md" → "docs/design-system-spec.md"
2. Line 78: Change "reading CLAUDE.md's Design System section" → "reading docs/design-system-spec.md"
3. Add new check section:

### 1.5 Excalidraw: Green Button Validation

Check for green colors (#22c55e, #16a34a) used in button contexts:

```bash
# Find buttons with green colors (potential violations)
grep -E '"id":\s*"[^"]*-btn[^"]*"' file.excalidraw | grep -A5 -B5 '#22c55e\|#16a34a'
```

**Valid green usage:** Only for success confirmation screens, verified badges
**Invalid green usage:** Action buttons (Continue, Next, Submit, Improve)

If found in action context, flag as violation.
```

#### 2C. Update Hook (`.claude/hooks/design-system-check.sh`)

```bash
# Add after line 73 (purple check):

  # NEW: Check for green buttons (action buttons should be blue)
  # Green (#22c55e) should ONLY be used for success states
  if grep -qE '"id":\s*"[^"]*-(btn|button)[^"]*"' "$FILE_PATH" 2>/dev/null; then
    # Found button elements, check if any use green
    if grep -qE '"(strokeColor|backgroundColor)":\s*"#22c55e|#16a34a"' "$FILE_PATH" 2>/dev/null; then
      # Check if it's a success confirmation button (allowed)
      if ! grep -q '"success\|verified\|confirmed\|published"' "$FILE_PATH" 2>/dev/null; then
        echo "⚠️  Found green button - action buttons should be blue (#3b82f6)"
        echo "   Green (#22c55e) is for SUCCESS ONLY (checkmarks, verified badges)"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi
```

```bash
# Change line 109: Update reference
- echo "   See CLAUDE.md 'Design System' section for the spec"
+ echo "   See docs/design-system-spec.md for full specification"
```

#### 2D. Test Plan

After updates, test against known violations:
```bash
# Should CATCH these:
- V8 wireframe: Green Continue button (screen 4)
- V6 wireframe: Amber reject banner

# Should PASS these:
- V8 wireframe: Blue "Improve now" buttons
- V8 wireframe: Green success state (if we add one)
```

#### Summary of Phase 2 Work

1. **Review** current skill + hook (DONE - see above)
2. **Update** skill to reference new spec file
3. **Add** green button validation to both skill and hook
4. **Test** against V4-V8 wireframes (should catch V8 violation)
5. **Document** in skill's "What to Check" section

### Phase 3: Remediation (Priority 3)
1. Fix V8 wireframe: Change Continue button from green to blue
2. Fix V6 wireframe: Change reject banner from amber to blue
3. Archive non-compliant V4, V5 wireframes (replaced by V8)

### Phase 4: Integration (Nice-to-have)
1. Add pre-commit hook that runs `/design-check` on changed `.excalidraw` files
2. Add lint rule for React components (check for `bg-green-*` in non-success contexts)

## Technical Approach (KISS)

**What we're using:**
- ✅ Markdown documentation in CLAUDE.md (simple, version-controlled)
- ✅ shadcn/ui component patterns (already in use)
- ✅ Tailwind CSS semantic tokens (already in use)
- ✅ Landing page as source of truth (already built)
- ✅ Custom `/design-check` skill (already exists, just needs expansion)

**What we're NOT using (yet):**
- ❌ Figma design system (premature - we're still iterating)
- ❌ Storybook component library (overkill for current scale)
- ❌ Design tokens JSON (Tailwind config is sufficient)
- ❌ Separate design documentation site (CLAUDE.md is enough)

**Rationale:** Start simple, iterate based on real pain points. Don't over-engineer.

## Open Questions

1. Should we create a visual reference page (HTML page with all patterns)? Or is landing page sufficient?
2. Should pre-commit hook block commits on design violations, or just warn?
3. Do we need separate docs for mobile vs desktop patterns?

## Dependencies

- Landing page UI (source of truth - already exists)
- `.claude/commands/design-check.md` skill (needs update)
- CLAUDE.md (needs expansion)

## Acceptance Criteria

**Definition of Done:**
1. Can run `/design-check` and catch all known violations (including V8 green button)
2. New developer/agent can read CLAUDE.md and understand both what TO do and what NOT to do
3. V8 wireframe updated with compliant colors
4. No regression in existing features

## Notes

- This is a **documentation + tooling** story, not a feature story
- Focus on **negative rules** (what NOT to do) as much as positive rules
- Keep it **simple** (KISS) - use existing tools, don't over-engineer
- Landing page is **canonical** - if in doubt, copy from there

## Related Files

- [CLAUDE.md](../../../CLAUDE.md) (lines 280-579 - current design system section)
- [.claude/commands/design-check.md](../.claude/commands/design-check.md) (current skill)
- [src/app/pages/landing-page.tsx](../src/app/pages/landing-page.tsx) (source of truth for UI)
- [docs/archive/bmad/diagrams/sifter-mvp-wireframe-v8.excalidraw](../../../docs/archive/bmad/diagrams/sifter-mvp-wireframe-v8.excalidraw) (example violation)

---

**Next Steps:**
1. Review and approve this story
2. Start Phase 1: Expand CLAUDE.md
3. Update `/design-check` skill (Phase 2)
4. Fix V8 wireframe (Phase 3)
