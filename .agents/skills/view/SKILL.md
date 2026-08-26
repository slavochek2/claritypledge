---
name: view
description: Produce a polished view component + demo wrapper for UI-heavy features, catching visual polish issues before /dev
when_to_use: >
  RETIRED FROM ROUTING 2026-08-20 — /pick-flow no longer recommends this skill and must not put it
  in a recommended flow. Still runnable on request. Originally: after /ui, before /generate-tests,
  for ui-heavy features needing visual polish within the existing design system.
version: 1.1.0
---

> **Retired from routing, not deleted (2026-08-20).** Created 2026-04-14, recommended in flows, and
> **run zero times in four months** while `/dev` ran 92. Not new — never once chosen. Kept because
> retiring costs nothing to reverse and the open question is whether producing a design artifact
> beats it. **What would settle it:** run both on the same feature and compare. Until someone does,
> it stays out of recommended flows. See `docs/decisions.md` 2026-08-20 and
> `.claude/commands/slava/build/pick-flow/SKILL.md` § Retired from routing.

# View Component Polish

**Produce a visually polished view component + demo wrapper before implementation begins.**

Generates two files:
- `{feature}-view.tsx` — props-only view component, typed from real project types
- `{feature}-view.demo.tsx` — mock data + state toggles for browser review

Adds a preview route at `/tree/{feature}` (guarded by `import.meta.env.DEV`).
Writes `view_locked: [path/to/view.tsx, path/to/view.demo.tsx]` to spec frontmatter.

**Announce at start:** "I'm using the /view skill to produce a polished view component before implementation."

---

## Quick Start

```
/view features/p142_dark_mode.md
```

---

## When to Use

✅ **Use /view for:**
- Features with a new visual surface (new page, new card, new modal)
- Features where visual polish will otherwise splinter across /dev iterations
- Features where you want the founder to approve visuals before build begins

❌ **Skip /view for:**
- Backend-only features (no visual surface)
- Pure refactors (component structure, not appearance)
- Single-file copy or config changes
- Medium pipeline runs without a Component Strategy section
- **Already-shipped UI you want to polish** — use `/change-request` to file a redesign spec, then run the `ui-heavy` flow (which includes `/view`) on that CR

---

## Position in Pipeline

```
/create-spec → /challenge-prd → /ux → /architect → /ui → [/view] → /generate-tests → /spec-review → /dev
```

**ui-heavy flow (add /view):**
```
/create-spec → /challenge-prd → /ux → /architect → /ui → /view → /generate-tests → /spec-review → /dev
```

`/view` requires `/ui` (Component Strategy + Visual Specification) before it can run.

---

## What It Generates

### 1. `{feature}-view.tsx`
- Props-only: no data fetching, no routing, no state persistence
- Typed from real project types (imports from `src/app/types/`)
- Follows existing design system (shadcn/ui, Tailwind tokens, existing components)
- Matches adjacent production pages for visual consistency
- Lives in `src/app/components/_proto/`

### 2. `{feature}-view.demo.tsx`
- Provides mock data for every prop
- Includes state toggles (loading, empty, error, populated states)
- Used exclusively for browser preview at `/tree/{feature}`
- Lives in `src/app/components/_proto/`

### 3. Proto route
- Added to `src/App.tsx` guarded by `import.meta.env.DEV`
- Accessible at `/tree/{feature}` for visual review
- Removed when `/dev` integrates the view into real containers

### 4. Spec frontmatter update
- Adds `view_locked: [src/app/components/_proto/{feature}-view.tsx, src/app/components/_proto/{feature}-view.demo.tsx]`
- `/dev` reads this and treats the paths as forbidden-edit during integration

---

## Constraint Model (inverted from `frontend-design`)

The public `frontend-design` skill prioritizes bold, distinctive aesthetics. That is wrong for a shipping product with an established design system.

`/view` inverts this:
- **Treats the existing ClarityPledge design language as the already-chosen direction.** Polish is the only variable.
- **NO new fonts, NO new colors, NO new component patterns** not already used elsewhere in the app.
- **Match adjacent production pages precisely** — proportions, rhythm, spacing, hierarchy, default states.
- Reference pages are named in `## Visual Context` from `/ux`. If that section is missing, stop and ask.

---

## Prop Verification Step (prevents hallucination)

Before writing either output file, `/view` must verify every prop it uses actually exists:

1. Parse every `<ComponentName …>` usage in the draft (multi-line-aware — attributes may span many lines)
2. For each component: Glob its source at `src/components/ui/{Name}.tsx` or `src/app/components/**/{Name}.tsx`
3. Read the source and grep for `interface {Name}Props`, `type {Name}Props`, or the inline props destructure
4. Verify each prop used in the draft exists in the source
5. If ANY prop is missing: **STOP** — report to founder with three options:
   - **(A) Extend the component** — route back to `/ui` to add the prop
   - **(B) Use an existing prop / workaround** — describe the workaround
   - **(C) Skip** — remove the component from the draft and use something simpler

This step catches the exact failure mode from the w1 experiment (`footerSlot` hallucination on `LiveStoryCardExpanded`).

---

## Workflow

```
1. PIPELINE STAMP → Set delivery_stage: view, append view to pipeline_ran
     ↓
2. READ SPEC → UX Design + Component Strategy + Visual Specification + Visual Context + types
     ↓
3. READ TOKENS → tailwind.config.ts + src/app/globals.css
     ↓
4. READ ADJACENT PAGES → 2-3 pages named in Visual Context (for aesthetic reference)
     ↓
5. READ TARGET COMPONENT SOURCES → Verify props exist for every component in the draft
     ↓
6. DRAFT → {feature}-view.tsx + {feature}-view.demo.tsx
     ↓
7. PRE-WRITE PROP VERIFICATION → Grep every <Component> usage against its source
     ↓
8. IMPORT RESOLUTION CHECK → Verify every import Globs to an existing file
     ↓
9. WRITE FILES → src/app/components/_proto/
     ↓
10. ADD PROTO ROUTE → src/App.tsx (import.meta.env.DEV guard)
     ↓
11. WRITE view_locked → spec frontmatter (inline list, repo-root-relative literal paths)
     ↓
12. BUILD GATE → npm run build (one retry on failure)
     ↓
13. CONFIRM READBACK → Read last 10 lines of spec frontmatter
```

---

## Pre-Flight Check

**Before running /view, verify:**

✅ `## Component Strategy` exists in spec (from `/ui`) — required
✅ Visual Specification subsection exists with at least: visual hierarchy, register, spacing — required
✅ `## Visual Context` from `/ux` includes a `Visual reference:` bullet naming adjacent pages — required. If absent: **STOP** and ask the founder to name 2-3 adjacent pages to match.
✅ Current worktree has `src/App.tsx` (not on a branch missing shared infrastructure)

---

## Design System Context

Same constraints as `/ui`:
- **shadcn/ui** — all primitives in `src/components/ui/`
- **Tailwind CSS** — semantic tokens via CSS variables. Never hardcode hex colors.
- **Blue for actions, green for success only** — no amber/orange/yellow
- **Use `cn()` for conditional class merging**
- **Framer Motion** for animations — match existing page entry patterns

---

## Agent Behavior

When invoked, this skill spawns a general-purpose agent (`model: "sonnet"`) with the following directive:

```
You are a UI Polish Specialist. Your job is to produce a visually polished view component
for a new feature, matching the existing ClarityPledge design language precisely.

This is NOT a creative design task. You are not introducing new aesthetic directions.
You are polishing within the existing design system — proportions, rhythm, spacing,
hierarchy, and default states. Match adjacent production pages.

**Step 1 — Pipeline Stamp (P659)**
Before any other work:
1. Read spec frontmatter at {spec_file}
2. Set `delivery_stage: view`
3. Append `view` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`,
   replace with `pipeline_ran: [existing, items, view]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `view` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If `view` is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

**Step 2 — Read spec inputs**
Read the spec at {spec_file}:
- `## UX Design` — interaction patterns, states, edge cases
- `## Component Strategy` → Visual Specification subsection — hierarchy, register, spacing, animation
- `## Visual Context` from `/ux` — extract the `Visual reference:` bullet (adjacent page paths)
  If `Visual reference:` bullet is ABSENT or EMPTY: STOP. Ask founder to name 2-3 adjacent pages.
- Types referenced in the spec (imports you'll need)

**Step 3 — Read design tokens**
Read `tailwind.config.ts` and `src/app/globals.css`. Extract:
- All color tokens (CSS variables under `:root`)
- Spacing scale, border-radius tokens
- Any custom animation keyframes
Only use classes and variables that actually exist here. Never invent token names.

**Step 4 — Read adjacent pages**
For each page named in `Visual reference:`, read its source file:
- Glob to find the file path if you only have a route name
- Read the source
- Note: exact spacing classes, heading styles, card patterns, button treatments used there
These become your visual target. Match them.

**Step 5 — Read target component sources**
For every component you plan to use (from Component Strategy):
- Glob its source file
- Read the props interface
- Record: name, required props, optional props, available variants
This gives you the prop inventory before drafting.

**Step 6 — Draft both files**
Draft `{feature}-view.tsx`:
- Props-only. NO data fetching (no useQuery, no supabase calls). NO routing (no useNavigate). NO persistence (no localStorage). NO side effects.
- Accept all variable data as props, typed from real project types
- For every component used: reference the exact file path you read in Step 5
- Follow Visual Specification spacing, hierarchy, register, animation classes exactly

Draft `{feature}-view.demo.tsx`:
- Import the view component
- Provide mock data for every prop (use plausible-looking values, not "test" strings)
- Include state toggles: at minimum empty state, loaded state, loading state if applicable
- Export a default `{FeatureName}Demo` component that renders all states

**Step 7 — Pre-write prop verification (MANDATORY — do not skip)**
Before writing any file:

For every `<ComponentName` usage in the draft (case-sensitive, starts with uppercase):
1. Locate source: try `src/components/ui/{ComponentName}.tsx` and `src/app/components/**/{ComponentName}.tsx`
   - If Glob returns no match: the component does not exist at this worktree root (see step 7b)
2. Read the source. Grep for the props interface:
   - `interface {ComponentName}Props` or `type {ComponentName}Props`
   - Or the inline destructure in the function signature: `({ prop1, prop2 }: { ... })`
3. For each prop you use in the draft: verify it exists in the interface.
   - Multi-line attribute check: attributes may span many lines (e.g., `className={\n  cn(...)\n}`)
   - Check attribute names, not values

If ANY prop is MISSING from the interface:
STOP. Report to founder:
  "Prop `{propName}` does not exist on `{ComponentName}` (source: {file}).
   Options:
   (A) Extend the component — route back to /ui to add `{propName}` to the interface
   (B) Use existing prop `{existingProp}` instead — describe the workaround
   (C) Remove `{ComponentName}` from the draft and use a simpler alternative
   Which do you prefer?"
Do NOT proceed until founder responds.

7b. If any import in the draft resolves to NO file at this worktree root:
STOP. Report:
  "Missing dependencies at this worktree root:
   - {importPath} (imported by draft, does not exist here)
   These may exist on other feature branches. Options:
   (A) Cherry-pick the commits that added them — name the branch
   (B) Create minimal stubs — /view drafts minimal versions
   (C) Rework the draft to avoid these components
   Which do you prefer?"
Do NOT proceed until founder responds.

**Step 8 — Write files**
Write both files to `src/app/components/_proto/`:
- `src/app/components/_proto/{feature}-view.tsx`
- `src/app/components/_proto/{feature}-view.demo.tsx`

**Step 9 — Add proto route**
Edit `src/App.tsx`:
- Import the demo component: `import {FeatureName}Demo from './components/_proto/{feature}-view.demo'`
- Add route GUARDED by `import.meta.env.DEV`:
  `{import.meta.env.DEV && <Route path="/tree/{feature}" element={<{FeatureName}Demo />} />}`
- Place alongside the other `/tree/*` routes (the PROTOTYPES block in `src/App.tsx`); otherwise place before the catch-all route.

**Step 10 — Write view_locked to spec**
Edit {spec_file} frontmatter:
- If `view_locked:` already exists: replace the existing line with the new value.
- If absent: add after the `tags:` line.
Value: `view_locked: [src/app/components/_proto/{feature}-view.tsx, src/app/components/_proto/{feature}-view.demo.tsx]`
Format: inline YAML list of repo-root-relative literal path strings. No globs. No `../`. No absolute paths.

**Step 11 — Build gate**
Run `npm run build`.
- If build succeeds: continue.
- If build fails: read the error. Attempt ONE fix (type error, missing import, wrong prop type).
  Re-run `npm run build`.
  If still failing: STOP. Report the full build error to founder. Do NOT mark complete.

**Step 12 — Confirm readback**
Read the last 10 lines of {spec_file} (to confirm view_locked was written correctly).
Output:
"View component written to src/app/components/_proto/{feature}-view.tsx.
Preview at http://localhost:{port}/tree/{feature}.
view_locked written to spec. Ready for /generate-tests."

**Self-review before returning:**
- [ ] view.tsx is props-only (no fetching, no routing, no persistence)
- [ ] All props are typed from real project types
- [ ] Every component prop verified against its source (no hallucinated props)
- [ ] Every import resolves to an existing file at this worktree root
- [ ] view.demo.tsx covers all major states (empty, loaded, loading if applicable)
- [ ] Proto route is guarded by `import.meta.env.DEV`
- [ ] view_locked written as inline list in spec frontmatter
- [ ] Build passes
```

---

## After View

**Next steps:**
1. **Preview at `/tree/{feature}`** — founder reviews visual output in browser
2. **Run /generate-tests** — tests reference the view component for assertions
3. **Run /dev** — integrates the view into real containers. view.tsx is read-only during integration.

**To update the view after seeing it in browser:**
Re-run `/view` — it will overwrite the output files and re-run the build gate.
Do NOT edit `view.tsx` directly if `view_locked` is set — that's `/dev`'s constraint.

---

## Related Skills

- `/ui` — Component Strategy (must run before /view)
- `/generate-tests` — Test generation (run after /view)
- `/dev` — Implementation (run after /generate-tests; respects view_locked)
- `/ux` — UX Design (must run before /ui; its Visual Context feeds /view)
