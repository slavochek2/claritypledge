---
name: ui
description: Map UX designs and architecture decisions to concrete component choices, maximizing reuse of the existing design system
when_to_use: After /architect, before /generate-tests — for all UI features
version: 1.0.0
---

# UI Component Strategy

**Map UX designs and architecture decisions to concrete component choices.**

Adds Component Strategy layer to feature spec:
- Component inventory (what exists in the codebase)
- Component map (Reuse / Extend / Extract / New per element)
- Composition tree (nesting, props, data flow)
- Visual refinements (implementation-level polish below UX wireframe resolution)
- Extraction plan (consolidate existing duplicates touched by this feature)
- Challenge Notes (upstream concerns, if any)

**Announce at start:** "I'm using the /ui skill to map UX designs to concrete component choices."

---

## Quick Start

```
/ui features/p142_dark_mode.md
```

---

## When to Use

✅ **Use /ui for:**
- All features with user-facing UI (after architecture is approved)
- Medium pipeline features with UI changes
- Design corrections that touch components

❌ **Skip /ui for:**
- Backend-only features (no UI surface)
- Pure CSS-only changes (no component decisions)
- Single-file copy/string changes

---

## Position in Pipeline

```
/create-prd → /challenge-prd → /ux → /architect → /ui → /generate-tests → /spec-review → /dev
```

**Why after both /ux AND /architect:**
- From `/ux`: knows what screens, interactions, states, and edge cases to render
- From `/architect`: knows what data shapes, file boundaries, server/client splits exist
- Both inputs are needed to make correct component choices

**Medium pipeline:**
```
/create-prd → /challenge-prd → /ui → /dev
```

**Note:** In the medium pipeline, /ux and /architect are skipped. /ui's pre-flight relaxes for medium work: it requires only business requirements (from /create-prd) and scans the codebase directly for component decisions — no UX or Architecture section needed. The Component Inventory + Map still provides value by preventing duplicate components.

---

## What It Generates

### 1. Component Inventory

Automated scan of `src/components/ui/` (design system primitives) and `src/app/components/` (feature components). Produces a snapshot of what's available before making decisions.

### 2. Component Map

For every major UI element in the spec, classify:

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Main card | **Reuse** | `src/components/ui/card.tsx` — use as-is | No |
| Action button | **Reuse** | `src/components/ui/button.tsx` variant='default' | No |
| Status badge | **Extend** | `src/app/components/shared/ear-badge.tsx` — add `variant='status'` | No |
| Commitment card | **Extract** | 5 similar card patterns exist — extract shared `<ContentCard>` | Yes — generalize or keep separate? |
| Timeline view | **New** | No existing equivalent — `src/app/components/{feature}/timeline.tsx` | No |

**Classification rules:**
- **Reuse** — existing component, no changes. Name the file and variant/props.
- **Extend** — existing component + new props/variant/styles. Name the file and describe the change.
- **Extract** — existing duplicated patterns should be consolidated into a shared component. Name the files that have the pattern, propose the shared component.
- **New** — genuinely novel, no existing equivalent. Must document why existing patterns don't apply. Propose file location: `src/components/ui/` (design system) vs `src/app/components/shared/` (cross-feature) vs `src/app/components/{feature}/` (feature-specific).

### 3. Composition Tree

How components nest, what props flow where, where shared state lives.

```
<PageLayout>
  <ContentCard variant="commitment">          ← Extended
    <PersonAvatar user={creator} />            ← Reuse
    <CommitmentBody text={commitment.text} />  ← New
    <Button variant="outline" onClick={...} /> ← Reuse
  </ContentCard>
</PageLayout>
```

### 4. Visual Refinements

Implementation-level visual choices that fall **below UX wireframe resolution** but **above raw code**. These are choices UX doesn't specify but that affect perceived quality:

- Shadow depth (`shadow-sm` vs `shadow-lg` for visual hierarchy)
- Hover/focus transitions (`transition-shadow duration-200`)
- Spacing precision (`gap-3` vs `gap-4` for tighter grouping)
- Border radius consistency (match adjacent components)
- Animation timing (entry/exit for dialogs, toasts)

**Constraint:** Visual refinements must not contradict `/ux` specifications. They fill gaps, not override decisions.

### 5. Extraction Plan

When this feature touches an area with existing component duplication:

- List the duplicated patterns (with file paths)
- Propose the shared abstraction
- Include extraction as a build step (before the feature's own components)

**Scope rule:** Extract only patterns this feature naturally touches. Flag out-of-scope duplication as a note for future work — don't scope-creep.

### 6. Challenge Notes (if any)

When `/ui` discovers a problem with an upstream decision:

```markdown
## Challenge Notes

> **`/ui` challenges `/ux` (Section: Screen Designs)**
> UX specifies a full-width card grid on mobile. At 320px with the required
> avatar + name + date + action button, elements will clip or wrap.
>
> **Options:**
> A. Stack layout on mobile (avatar above text) — requires UX revision
> B. Truncate name at 12 chars — preserves layout, loses information
> C. Drop date on mobile — preserves readability
>
> **Recommendation:** A
> **Blocking:** No — proceeding with current spec. Flag for user review.
```

**Challenge Notes rules:**
- Any agent can write Challenge Notes when it has **evidence** a prior decision will cause problems at implementation
- No agent can **override** — the note presents options and a recommendation
- **Non-blocking by default** — agent continues with current spec
- **Blocking** = reserved for cases where proceeding produces broken output (e.g., component UX references doesn't exist and can't be created)
- Challenge Notes are for **facts discovered during component analysis**, not aesthetic preferences

---

## Workflow

```
1. PRE-FLIGHT CHECK → Verify UX + Architecture exist
     ↓
2. COMPONENT INVENTORY → Scan src/components/ui/ + src/app/components/
     ↓
3. COMPONENT MAP → Classify every UI element (Reuse/Extend/Extract/New)
     ↓
4. COMPOSITION TREE → Define nesting, props, state
     ↓
5. VISUAL REFINEMENTS → Fill gaps below UX wireframe resolution
     ↓
6. EXTRACTION PLAN → Consolidate duplicates in scope
     ↓
7. CHALLENGE NOTES → Flag upstream concerns (if any)
     ↓
8. UPDATE SPEC → Append Component Strategy section
     ↓
9. RETURN → User reviews, approves or requests changes
```

---

## Pre-Flight Check

**Before running /ui, verify:**

✅ **Business requirements exist** in spec (from /create-prd) — always required

✅ **UX section exists** (from /ux) — required for full pipeline, optional for medium pipeline

✅ **Technical Architecture exists** (from /architect) — required for full pipeline, optional for medium pipeline

❌ **If backend feature** (`feature_type: backend` in frontmatter) → Skip /ui entirely

**Medium pipeline behavior:** When UX and/or Architecture sections are absent, /ui operates in lightweight mode — scans the codebase directly to produce Component Inventory + Map, skips Composition Tree and Visual Refinements (no UX wireframes to refine). Still prevents component duplication.

---

## Design System Context

**This project uses:**
- **shadcn/ui** — all primitives in `src/components/ui/` (Button, Dialog, Input, etc.)
- **Radix UI** — underlying accessibility primitives (wrapped by shadcn/ui)
- **Tailwind CSS** — semantic tokens via CSS variables (never hardcode hex colors)
- **CVA (class-variance-authority)** — for component variants
- **lucide-react** — icons
- **Framer Motion** — animations

**Rules from design system (enforced by hooks):**
- Blue for actions, green for success only, no amber/orange/yellow
- Use semantic tokens (`bg-card`, `text-muted-foreground`), not raw colors
- Use `<Button>` variants, never custom inline button styles
- Use `cn()` utility for conditional class merging

**When proposing new components:** Check if shadcn/ui has an equivalent first (`npx shadcn@latest add <component>`). Prefer extending the design system over creating ad-hoc components.

---

## Agent Behavior

The /ui agent:
- **Scans existing components** using Glob/Grep before making decisions
- **Classifies every UI element** — no element left unclassified
- **Defaults to Reuse** — only classify as New when existing patterns genuinely don't apply
- **Documents "why New"** — every New classification must explain why existing patterns don't work
- **Proposes file locations** — `src/components/ui/` (design system), `src/app/components/shared/` (cross-feature), `src/app/components/{feature}/` (feature-specific)
- **Respects upstream decisions** — never silently overrides /ux or /architect
- **Flags concerns via Challenge Notes** — with evidence, options, and recommendation
- **Can spawn fact-checking agents** for: accessibility validation, codebase state queries, Tailwind compatibility checks
- **Cannot spawn opinion agents** about upstream design choices

**Self-review checklist:**
- [ ] Component inventory completed (scanned both ui/ and app/components/)
- [ ] Every major UI element classified (Reuse/Extend/Extract/New)
- [ ] Every "New" classification includes justification (why existing patterns don't apply)
- [ ] File locations proposed for all new/extended components
- [ ] Composition tree covers the main screen(s)
- [ ] Visual refinements don't contradict /ux specifications
- [ ] Extraction plan scoped to patterns this feature touches (no scope creep)
- [ ] If spec has `## UI Contract`: all component names and labels in Component Map match UI Contract values verbatim
- [ ] Challenge Notes (if any) include evidence, options, and recommendation
- [ ] No sections from prior spec layers were modified

---

## Implementation

When invoked, this skill spawns a general-purpose agent with the following directive:

```
You are a UI Component Strategist. Your job is to map UX designs and architecture decisions to concrete component choices, maximizing reuse of the existing design system (shadcn/ui + Radix + Tailwind).

Read the spec at {spec_file}:
- UX section: what screens, interactions, states, edge cases
- Architecture section: data shapes, file boundaries, server/client splits
- UI Contract (if exists): exact strings, component names, labels — use verbatim
- Acceptance criteria: what done looks like

**Step 1 — Component Inventory**
Scan the codebase to understand what's available:
- Glob `src/components/ui/*.tsx` — list all design system primitives
- Glob `src/app/components/**/*.tsx` — list all feature components
- For components referenced in the UX section, Read their source to understand props/variants

**Step 2 — Component Map**
For every major UI element described in the spec:
1. Search for existing components that could serve the purpose (Grep for similar names, patterns)
2. Classify: Reuse / Extend / Extract / New
3. For Reuse: name the file and the exact variant/props to use
4. For Extend: name the file, describe the new prop/variant needed
5. For Extract: list the files with the duplicated pattern, propose the shared component
6. For New: explain why existing patterns don't apply, propose file location

Format as a table:
| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|

**Step 3 — Composition Tree**
Show how components nest for the main screen(s). Use indented JSX-like notation showing component hierarchy, key props, and where state is managed.

**Step 4 — Visual Refinements**
Identify implementation-level visual choices that fall below UX wireframe resolution:
- Shadow depth, hover transitions, spacing precision, animation timing
- These must NOT contradict /ux — they fill gaps only

**Step 5 — Extraction Plan**
If this feature touches an area with duplicated patterns:
- List the duplicates with file paths
- Propose the shared abstraction
- Include extraction as the FIRST build step
If no duplicates in scope: write "No extraction needed — no duplicated patterns in the files this feature touches."

**Step 6 — Challenge Notes**
If you discover any upstream decision that will cause problems at the component level:
- Write a Challenge Note with: which skill/section is challenged, the evidence, options (A/B/C), recommendation, and whether it's blocking
- If no concerns: omit this section entirely

**MANDATORY FINAL STEP — WRITE TO FILE**
Use the Edit tool to append the Component Strategy section to {spec_file}:
- Append after the last line
- Do NOT modify any existing content
- Use heading: `## Component Strategy`
- Include all subsections: Component Inventory (summary), Component Map (table), Composition Tree, Visual Refinements, Extraction Plan, Challenge Notes (if any)

**Delivery Stage Tracking:**
1. BEFORE starting, set delivery_stage (running /ui = architecture approved):
   - Edit frontmatter: `delivery_stage: 3.5-ui-review`
2. AFTER appending Component Strategy section, delivery_stage is already set — no further change needed.

**Self-review before returning:**
- [ ] Every UI element classified
- [ ] Every "New" justified
- [ ] File locations proposed
- [ ] Composition tree present
- [ ] Visual refinements don't contradict /ux
- [ ] Challenge Notes have evidence (if any)
- [ ] UI Contract values used verbatim (if UI Contract exists)

CONFIRM the write succeeded — read back the last 10 lines of {spec_file} and output:
"Component Strategy written to {spec_file}. Ready for /generate-tests."
```

---

## After Component Strategy

**Next steps:**
1. **Review Component Strategy** — User confirms component choices, extraction plan
2. **Run /generate-tests** — Tests reference Component Map for scope
3. **Run /spec-review** — Audits Component Strategy consistency
4. **Implement** — Run `/dev` with full spec

---

## Related Skills

- `/ux` — UX design (run before /architect, before /ui)
- `/architect` — Technical architecture (run before /ui)
- `/generate-tests` — Test generation (run after /ui)
- `/spec-review` — Spec quality audit (run after /generate-tests)
- `/dev` — Implementation (run after /spec-review)

---

## Notes

- **Component Map is a constraint for /dev** — developers must follow Reuse/Extend/Extract/New classifications
- **Extraction Plan is step 1 of build sequence** — extract shared components before building new ones
- **/ui refines but never overrides** — visual refinements fill gaps below UX resolution, Challenge Notes flag concerns but don't change decisions
- **Design system is authoritative** — prefer extending `src/components/ui/` over creating ad-hoc components
