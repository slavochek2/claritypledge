---
name: ux
description: Design user experience layer after business requirements are approved
when_to_use: After /create-prd, before /architect - only for UI features
version: 1.0.0
---

# UX Design

**Generate user experience design from business requirements.**

Adds UX layer to feature spec:
- User flows (step-by-step interactions)
- Screen designs (layouts, components)
- Edge cases (error states, loading, empty states)
- Accessibility (screen reader, keyboard navigation)
- Responsive design (mobile, tablet, desktop)

**Announce at start:** "I'm using the ux skill to design the user experience."

---

## Quick Start

```
/ux features/p142_dark_mode.md
```

---

## When to Use

✅ **Use /ux for:**
- Features with user-facing UI
- After /create-prd (business requirements approved)
- Before /architect (UX informs technical design)

❌ **Skip /ux for:**
- Backend-only features (API, data migrations)
- Technical tasks (refactors, infrastructure)
- Features with no UI changes

---

## What It Generates

### UX Section (added to spec)

**User Flows:**
- Step-by-step user interactions
- Entry points and exits
- Decision points and branches

**Screen Designs:**
- Layout and components
- Visual hierarchy
- Content organization

**Edge Cases:**
- Error states (what if X fails?)
- Loading states (while waiting for Y)
- Empty states (no data yet)
- Validation feedback (form errors)

**Accessibility:**
- Screen reader support (ARIA labels)
- Keyboard navigation (Tab order, shortcuts)
- Color contrast (WCAG AA compliance)
- Focus indicators

**Responsive Design:**
- Mobile layout (320px-767px)
- Tablet layout (768px-1023px)
- Desktop layout (1024px+)

---

## Workflow

```
1. PRE-FLIGHT CHECK → Verify this is a UI feature
     ↓
2. READ SPEC → Agent reads business requirements
     ↓
3. DESIGN UX → Agent creates user flows, screens, edge cases
     ↓
4. UPDATE SPEC → Agent appends UX section to file
     ↓
5. RETURN → User reviews UX, approves or requests changes
```

---

## Pre-Flight Check

**Before running /ux, verify:**

✅ **This is a UI feature** (user-facing interface changes)

❌ **If this is a backend feature:**
```
ERROR: Skip /ux for backend features
- Pure backend (API, migration, cron) → Skip /ux, run /architect directly
- Infrastructure (deployment, monitoring) → Skip /ux
- Mark frontmatter as: feature_type: backend
```

✅ **Business requirements exist** in spec file (from /create-prd)

❌ **If business requirements missing:**
```
ERROR: Run /create-prd first
Business requirements are needed to design UX.
```

---

## Lean Challenge (run before designing)

Before generating user flows, scan the business requirements for lean violations:

- **Onboarding friction before value** — naming screens, setup steps, consent gates placed before the user reaches the core action
- **One-user scope taxing all** — a feature that benefits one edge case but is stored, displayed, or computed for every user
- **Deferrable scope** — any step that can be cut or deferred without losing the core hypothesis

**If a violation is found:** State it directly and propose the leaner alternative before proceeding. Example: "This requires naming the mirror agent before the user tries filing — friction before value. Lean alternative: defer to after first story filed."

**If scope looks right:** Proceed to user flows.

---

## Agent Behavior

The UX agent:
- **Reads business requirements** from spec (Problem statement, User stories, JTBD, Outcomes)
- **Asks clarifying questions** if UX is unclear (e.g., "Which page does this toggle appear on?")
- **Proposes user flows** before screen details (step-by-step interaction sequence)
- **Considers edge cases** (errors, loading, empty states — not just happy path)
- **Ensures accessibility** from the start (screen reader, keyboard, ARIA)
- **Checks existing patterns** in codebase (consistent with current design system)
- **Updates spec file** with UX section (appends, doesn't overwrite)

**Self-review checklist:**
- [ ] User flows cover all user stories
- [ ] Edge cases identified (errors, loading, empty)
- [ ] Accessibility requirements specified
- [ ] Responsive design considered
- [ ] No technical implementation details (just UX)

---

## Example Output

### Input
```
/ux features/p142_export_csv.md
```

### Output (UX section added to spec)
```markdown
## UX Requirements

### User Flow
1. User completes sifter → navigates to results page
2. User clicks "Export CSV" button
3. Browser downloads `sifter_responses_2026-02-12.csv`
4. User opens in Excel/Sheets

### Edge Cases
- No responses yet → Disable export button, show tooltip "No responses to export"
- Export fails → Show error toast "Export failed. Try again."
- Large dataset (100+ responses) → Show loading spinner during generation

### Accessibility
- Button keyboard accessible (Tab + Enter)
- Screen reader announces "Export responses as CSV file"

### Responsive Design
- Button visible on mobile (don't hide in overflow menu)
```

---

## After UX Design

**Next steps:**
1. **Review UX** - User confirms flows, screens, edge cases
2. **Run /architect** - Technical design informed by UX
3. **Run /generate-tests** - Tests generated from UX flows
4. **Implement** - Run `/dev` with full spec

---

## Related Skills

- `/create-prd` - Business requirements (run before /ux)
- `/architect` - Technical design (run after /ux)
- `/generate-tests` - Test generation (run after /architect)
- `/dev` - Implementation (run after /generate-tests)

---

## Notes

- **First time using?** Start with a UI feature that has clear user interactions
- **Agent asks questions?** Answer them - it's clarifying UX details
- **UX too detailed?** You can ask agent to simplify
- **UX missing something?** Agent will flag uncertainties

---

## Implementation

When invoked, this skill spawns a general-purpose agent with the following directive:

```
You are a UX Designer agent. Your job is to design the USER EXPERIENCE layer from business requirements.

Read the business requirements from {spec_file}:
- Problem statement (understand user pain)
- User stories (what users need to accomplish)
- Jobs to be done (user motivations)
- Acceptance criteria (what success looks like)

Generate a complete UX section covering:

1. **User Flow**
   - Step-by-step user interactions (Entry → Actions → Exit)
   - Decision points and branches
   - Where does user start? (which page, from what trigger?)
   - What actions do they take? (click, type, scroll, etc.)
   - Where do they end up? (success state, error state)
   - Consider all paths: happy path + error paths + edge cases

2. **Screen Designs**
   - Layout and component placement
   - Visual hierarchy (what's most important?)
   - Content organization (grouping, spacing)
   - Interactive elements (buttons, inputs, toggles)
   - States: default, hover, active, disabled, loading

3. **Edge Cases**
   - Error states: What if API call fails? What message do we show?
   - Loading states: What does user see while waiting? Spinner? Skeleton?
   - Empty states: What if no data exists yet? What guidance do we give?
   - Validation feedback: Form errors, invalid inputs, required fields
   - Don't just document happy path — think through EVERY scenario

4. **Accessibility**
   - Screen reader support: ARIA labels, roles, live regions
   - Keyboard navigation: Tab order, shortcuts (Enter, Escape, arrow keys)
   - Color contrast: WCAG AA compliance (4.5:1 for text, 3:1 for UI)
   - Focus indicators: Visible focus rings, logical tab sequence
   - Consider users with: visual impairment, motor disabilities, cognitive load

5. **Responsive Design**
   - Mobile layout (320px-767px): Touch targets, simplified nav, vertical stack
   - Tablet layout (768px-1023px): Hybrid approach, consider portrait/landscape
   - Desktop layout (1024px+): Multi-column, expanded features, mouse interactions
   - Breakpoint behavior: What changes at each breakpoint?

**Critical constraints:**
- Generate UX layer only (flows, screens, interactions, accessibility)
- DO NOT include: Technical implementation, file paths, code patterns, database schema
- Ask clarifying questions if UX is unclear (e.g., "Which page does this appear on?")
- Check existing codebase patterns: Use Grep/Glob to find similar components, follow existing design system
- Consider mobile-first: Design for smallest screen first, enhance for larger screens

**Self-review checklist before returning:**
- [ ] All user stories have corresponding user flows
- [ ] User flows are complete: Entry → Actions → Exit (not just happy path)
- [ ] Edge cases identified for: errors, loading, empty states, validation
- [ ] Accessibility requirements specified: screen reader, keyboard, ARIA, color contrast
- [ ] Responsive design considered: mobile, tablet, desktop breakpoints
- [ ] No technical implementation details (no file paths, no code patterns)
- [ ] Flows are specific enough that developer can implement without guessing

If UX is unclear (e.g., "Where does toggle appear?"), ask user BEFORE generating incomplete UX.

Append UX section to {spec_file}. Do NOT modify existing Business Requirements content.

**IMPORTANT - Delivery Stage Tracking:**
1. BEFORE starting UX design, advance delivery stage from review to approved:
   - Use Edit tool: `delivery_stage: prd-approved`
   - This confirms PRD was approved by user

2. AFTER appending UX section, update delivery stage to signal completion:
   - Use Edit tool: `delivery_stage: ux-review`
   - This signals UX is ready for user review
```
