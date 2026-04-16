---
name: ux
description: Design user experience layer after business requirements are approved
when_to_use: After /create-spec, before /architect - only for UI features
version: 2.1.0
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
- After /create-spec (business requirements approved)
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

**Visual Context:**
- Density intent (spacious vs. dense — with user-context reason why)
- Visual reference ("this should feel like [existing shipped page or external reference]")

**Edge Cases & UI States:**
- Error states: what the error looks like spatially, what the user's next action is, recovery path
- Loading states: skeleton vs. spinner vs. progressive reveal — with reason
- Empty states: what the empty state communicates (guidance, not just "no data")
- Validation feedback: inline vs. toast vs. summary — with spatial placement
- Per-screen specification required for screens with novel interaction patterns; generic list acceptable for standard CRUD screens

**Accessibility:**
- Screen reader support (ARIA labels)
- Keyboard navigation (Tab order, shortcuts)
- Color contrast (WCAG AA compliance)
- Focus indicators

**Responsive Design:**
- Mobile layout (320px-767px)
- Tablet layout (768px-1023px)
- Desktop layout (1024px+)

**Challenge Notes (if any):**
- Flag upstream concerns from `/create-spec` with evidence, options, and recommendation
- Non-blocking by default — proceed with current spec
- Only blocking when proceeding would produce broken UX output

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

✅ **Business requirements exist** in spec file (from /create-spec)

❌ **If business requirements missing:**
```
ERROR: Run /create-spec first
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
- [ ] UI States specified per screen for novel interaction patterns
- [ ] Visual Context has both fields (density intent with reason, visual reference)
- [ ] Accessibility requirements specified
- [ ] Responsive design considered
- [ ] Decisions requiring founder input surfaced explicitly
- [ ] No technical implementation details (just UX) — component choices are deferred to `/ui`
- [ ] No visual design decisions (hierarchy, emotional register, negative constraints) — those are `/ui` territory
- [ ] If spec has `## UI Contract`: update the table with any new strings/colors discovered during UX design (button labels from flows, toast messages from edge cases, placeholder text). The UI Contract is the authoritative reference for all downstream skills — every concrete string in UX flows must appear in it.
- [ ] Challenge Notes written for any upstream PRD concerns (if any)

---

## Example Output

### Input
```
/ux features/p142_export_csv.md
```

### Output (UX section added to spec)
```markdown
## UX Design

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
1. **Review UX** — User confirms flows, screens, edge cases
2. **Run /architect** — Technical design informed by UX
3. **Run /ui** — Component strategy maps UX to concrete components (after /architect)
4. **Run /generate-tests** — Tests generated from full spec
5. **Implement** — Run `/dev` with full spec

---

## Related Skills

- `/create-spec` — Business requirements (run before /ux)
- `/architect` — Technical design (run after /ux)
- `/ui` — Component strategy (run after /architect)
- `/generate-tests` — Test generation (run after /ui)
- `/dev` — Implementation (run after /generate-tests)

---

## Notes

- **First time using?** Start with a UI feature that has clear user interactions
- **Agent asks questions?** Answer them - it's clarifying UX details
- **UX too detailed?** You can ask agent to simplify
- **UX missing something?** Agent will flag uncertainties

---

## Implementation

When invoked, this skill spawns a general-purpose agent (`model: "sonnet"`) with the following directive:

```
You are a UX Designer agent. Your job is to design the USER EXPERIENCE layer from business requirements.

Read the business requirements from {spec_file}:
- Problem statement (understand user pain)
- User stories (what users need to accomplish)
- Jobs to be done (user motivations)
- Acceptance criteria (what success looks like)

**Delta-aware discovery (run before generating):**

Check if `## UX Design` already exists in the spec AND has substantial content (>50 lines).
Also scan the spec body above UX Design for inline UX thinking: ASCII prototypes, layout diagrams,
"Redesign" sections with wireframes, flow descriptions embedded in the problem statement or solution.

**If substantial UX already exists → DELTA MODE:**
1. Read the existing UX content (both the formal section and any inline UX thinking in the spec body) as PRIMARY input
2. Run the self-review checklist (sections 1–6) as an AUDIT against what's there
3. Output a gap report to the user BEFORE writing anything:
   - "Existing UX covers: [list what's solid]"
   - "Gaps found: [list missing subsections or underspecified areas]"
   - "Improvements needed: [list areas that exist but are weak, with reason]"
4. Then generate ONLY the delta: fill gaps, strengthen weak areas, preserve solid decisions
5. When writing: merge new content into existing subsections rather than replacing the entire section.
   Keep the author's phrasing and structure where it's adequate. Add, don't rewrite.
6. If existing UX is complete and passes all checklist items → report "UX section already complete,
   no changes needed" and skip writing. Don't regenerate for the sake of regenerating.

**If no UX section or stub only (≤50 lines) → FULL MODE:**
Proceed with full generation as described below.

---

Generate a complete UX section covering (FULL MODE) or fill gaps in existing UX (DELTA MODE):

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

3. **Edge Cases & UI States**
   For screens with novel interaction patterns, specify these states per screen (not as a generic list).
   For standard CRUD screens, a generic list is acceptable.
   - Error states: What does the error look like spatially? Where does the message appear relative to the failed element? What is the user's next action? What recovery path exists?
   - Loading states: Skeleton, spinner, or progressive reveal — with reason for the choice. What content is already visible vs. loading?
   - Empty states: What does the empty state communicate? Guidance toward first action, not just "no data yet." What visual weight does the empty state carry?
   - Validation feedback: Inline, toast, or summary — with spatial placement rationale. When does validation fire (on blur, on submit, real-time)?
   - Don't just document happy path — think through EVERY scenario. "Show error toast" is not a UI state — describe where, how, and what happens next.

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

6. **Visual Context**
   Two fields that communicate the USAGE CONTEXT for downstream visual design (`/ui` and `/dev`).
   These are NOT visual design decisions — they are UX-layer context that informs visual decisions.
   
   Required fields:
   - **Density intent:** Spacious/airy OR dense/efficient — with the user-context reason. E.g., "Spacious — user just completed an emotional exercise, not scanning data." This tells `/ui` what spacing scale to apply.
   - **Visual reference:** "This should feel like [existing shipped page]" or "[external reference]". Anchors intent to something concrete, not a mood word. E.g., "Should feel like the Partner Agreement signing page — centered, breathing room, single focal point."
   
   Visual hierarchy, emotional register, and negative constraints ("what should feel wrong") are `/ui` territory — do NOT include them here.

**Critical constraints (UX sections 1–6):**
- Generate UX layer only (flows, screens, interactions, accessibility, visual context)
- DO NOT include: Technical implementation, file paths, code patterns, database schema
- DO NOT include: Visual design decisions (color choices, typography, animation specifics) — those are `/ui` territory
- Ask clarifying questions if UX is unclear (e.g., "Which page does this appear on?")
- Check existing codebase patterns: Use Grep/Glob to find similar components, follow existing design system
- Consider mobile-first: Design for smallest screen first, enhance for larger screens

---

**Section 7 — Challenge Notes** *(optional — only when upstream concerns are found)*

If during UX design you discover a problem with a `/create-spec` decision (e.g., a user story that can't map to a coherent flow, acceptance criteria that conflict):

Write a Challenge Note:
- Which section of `/create-spec` is challenged
- The evidence (what you discovered during UX design)
- Options (A/B/C) with recommendation
- Whether it's blocking (rarely) or non-blocking (usually)

If no upstream concerns: omit Section 7 entirely.

**Note:** Component-level decisions (which components to reuse, extend, or create) are handled by `/ui`, which runs after `/architect`. Do NOT include component analysis here — focus on UX flows, screens, and interactions.

---

**Self-review checklist before returning:**
- [ ] All user stories have corresponding user flows
- [ ] User flows are complete: Entry → Actions → Exit (not just happy path)
- [ ] Edge cases identified for: errors, loading, empty states, validation
- [ ] UI States specified per screen for screens with novel interaction patterns (spatial placement, recovery path, visual weight)
- [ ] Visual Context has both fields: density intent (with user-context reason) and visual reference (concrete anchor)
- [ ] Accessibility requirements specified: screen reader, keyboard, ARIA, color contrast
- [ ] Responsive design considered: mobile, tablet, desktop breakpoints
- [ ] Decisions requiring founder input surfaced explicitly
- [ ] Sections 1–6 contain no file paths, code patterns, or component names — component mapping is deferred to `/ui`
- [ ] Sections 1–6 contain no visual design decisions (hierarchy, emotional register, animation specifics) — those are `/ui` territory
- [ ] Challenge Notes written for any upstream `/create-spec` concerns (if any)
- [ ] Flows are specific enough that developer can implement without guessing

If UX is unclear (e.g., "Where does toggle appear?"), ask user BEFORE generating incomplete UX.

Before writing: check if a `## UX Design` section already exists in the spec (use Read tool). The canonical header is `## UX Design` (see .claude/rules/spec-sections.md). Never use "UX Requirements" or "Screen Designs".
- If NO existing UX section → append at end of file (FULL MODE).
- If YES existing UX section, ≤50 lines → replace it in-place using Edit tool (FULL MODE).
- If YES existing UX section, >50 lines → apply DELTA MODE: edit subsections in-place to fill gaps
  and strengthen weak areas. Preserve existing content that passes the checklist. Do NOT replace
  the entire section wholesale — use targeted Edit calls per subsection that needs changes.
Do NOT leave two UX sections in the file. Do NOT modify Business layer content before the UX section.
**Retirement step (after writing UX section):** Remove any `## Open Questions for /ux` section — you answered those in your UX Design. If `## Next Steps` lists only completed steps (check delivery_stage), remove it.

**IMPORTANT - Pipeline Stamp (P659):**
Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: ux`
3. Append `ux` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, ux]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [ux]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `ux` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

AFTER appending UX section, the delivery_stage is already set — no further change needed.

CONFIRM the write succeeded — read back the last 10 lines of {spec_file} and output exactly:
   "UX section written to {spec_file} — [first 5 words of the last ## heading]. Ready for /architect."
   This is the final step. If the read-back shows no UX section, re-append and confirm again.
```
