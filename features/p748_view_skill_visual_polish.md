---
status: in-progress
type: task
rank: 1000748.0
created_date: '2026-04-14'
tags: [infrastructure, skills, ui, design-system]
delivery_stage: dev
pipeline_ran: [create-spec, architect, dev]
---

# P748: `/view` skill — visual polish agent before /dev

## Problem

**Situation:** The current pipeline (`/ux` → `/ui` → `/dev`) produces functionally-correct but visually-unpolished UI. P699 needed 5 follow-up commits after initial ship for basic polish: alignment, button colors, default states, link treatments.

**Complication:** No agent in the pipeline is responsible for visual polish. `/ux` produces text wireframes. `/ui` produces a component inventory. `/dev` implements mechanically from those inputs. Aesthetic decisions splinter across handoffs and none of them own "does this look polished within our design system."

**Question:** How do we catch the polish upfront — within the existing design system's constraints — without replacing the pipeline or requiring the founder to hand-craft prompts per feature?

## Appetite

Medium blast radius (adds one skill + modifies `/dev` with one conditional branch + adds one flow to `/pick-flow`). Fully reversible (delete skill file, remove one branch, remove one flow). Low decision density — experiment already validated the approach in worktree w1.

## Solution

Add a new skill `/view` that runs between `/ui` and `/dev` in a new `ui-heavy` flow variant. `/view` produces a polished view component + demo wrapper; `/dev` integrates by wiring data in a container, without editing the locked view file.

### Skill scope

**Reads (deterministic from spec + codebase):**
- Feature spec (UX Design, Component Strategy, types)
- 2–3 adjacent production pages as aesthetic reference
- Design tokens (`tailwind.config.ts`, `src/app/globals.css`)
- Target component source files (to verify props exist)

**Produces:**
- `{feature}-view.tsx` — view component, props-only, typed from real project types
- `{feature}-view.demo.tsx` — mock data + state toggles for browser review
- Route added to `App.tsx` for preview (`/_proto/{feature}`)
- Writes `view_locked: [path/to/view.tsx]` to spec frontmatter

**Does NOT touch:** data fetching, routing, state persistence, tests, backend, container components.

### Constraint model (inverted from `frontend-design`)

The public `frontend-design` skill prioritizes bold, distinctive aesthetics ("brutally minimal", "maximalist", "NEVER converge on common choices"). That's wrong for a shipping product with an established design system.

`/view` inverts this:
- Treats the existing ClarityPledge design language as the **already-chosen aesthetic direction**
- Polish is the only variable — proportions, rhythm, spacing, hierarchy, default states
- NO new fonts, NO new colors, NO new component patterns
- Match adjacent production pages precisely

### Prop verification step (prevents hallucination)

The experiment in w1 caught a real failure mode: the agent invented a `footerSlot` prop that didn't exist on `LiveStoryCardExpanded`. Mandatory step in the skill: **before writing output, read the source of every component used and verify every prop exists.** Fail loudly if a needed prop is missing — stop and ask the founder whether to extend the component or use a workaround.

### Handoff to `/dev`

`/dev` gets one conditional branch at its start:
```
if spec.frontmatter.view_locked exists:
    add view_locked paths to forbidden-edit list
    continue as normal (integrate mode)
else:
    continue as normal (current behavior)
```

Backward-compatible. Existing specs have no `view_locked` field, so they get unchanged `/dev` behavior.

### `/pick-flow` entry

Add one new flow variant: `ui-heavy` that includes `/view` between `/ui` and `/dev`. Existing flows unchanged.

## Risks / Non-Goals

### Risks

1. **Agent still hallucinates props despite the verification step.** Mitigation: the skill has a mandatory grep-for-prop step AND a pre-commit build check in the skill workflow — if `npm run build` fails, the skill must fix before declaring done.

2. **Adjacent pages are themselves inconsistent** — "match adjacent pages" produces inconsistent output if the neighborhood is inconsistent. Mitigation: skill picks 2–3 pages the spec explicitly names; if the founder names inconsistent references, that surfaces a separate design-system issue to resolve, not a `/view` failure.

3. **Worktree missing dependencies** — the experiment revealed that `GapBanner` and `FixedBottomBar` existed on a feature branch but not on main, so w1 couldn't build until files were copied over. Mitigation: `/view` must check every imported component resolves at the target worktree root, and flag missing files rather than silently failing.

4. **`/dev`'s `view_locked` respect is a prompt-level constraint, not a hard guard** — agents can still edit files if they decide to. Mitigation: add `view_locked` paths to a forbidden-paths list that `/dev` checks programmatically before each write. If edit attempted, stop and report instead of proceeding.

5. **Skill adds latency to the pipeline** — one more step before implementation. Mitigation: only runs in the `ui-heavy` flow variant; backend-only and medium flows skip it entirely.

### Non-Goals

- Do NOT build a separate `/slice` skill — `/view`'s input boundary is defined by its own prompt, no separate splitting step needed
- Do NOT modify `/ux`, `/ui`, `/architect`, `/spec-review`, or `/decompose` — they're unchanged
- Do NOT replace the visual QA subagent at UAT — it still runs, now with a baseline polished view to validate against
- Do NOT tokenize `#0044CC` as part of this skill (separate work; this skill uses existing tokens and existing hardcoded patterns)
- Do NOT build visual design for net-new surfaces (marketing pages, brand work) — `/view` is for in-app features with adjacent references; bold standalone design is a separate problem

### Alternatives Considered

- **Modify `/ui` to produce the view component directly.** Rejected: `/ui` is a component-inventory skill, not a design skill. Conflating roles dilutes both. Also breaks the retry loop — founder should approve visuals before build, which requires a separate artifact stage.
- **Use `frontend-design` as-is.** Rejected: its constraint model is inverted from what ClarityPledge needs (see experiment findings in `.claude/worktrees/w1`).
- **Keep doing it manually per feature with Claude one-shot prompts.** Rejected by founder — not repeatable, fragile across features, requires prompt craftsmanship each time.
- **Build `/slice` skill to split frontend/backend before `/view`.** Rejected: adds infrastructure without a clear payoff. The split is implicit in `/view`'s input-output boundary and `/dev`'s `view_locked` check.

### Rollback Strategy

1. Delete `.claude/commands/slava/build/view.md`
2. Remove the `view_locked` conditional branch from `/dev`
3. Remove the `ui-heavy` flow variant from `/pick-flow`
4. Remove any `view_locked` frontmatter from specs that used it (optional — they'll just be ignored)

No data migrations, no deployed code changes, no external dependencies. Pure skill-level rollback.

## Done-When

- [ ] `/view` skill file exists at `.claude/commands/slava/build/view.md` with proper frontmatter
- [ ] `/view` skill reads spec + adjacent pages + tokens + target component sources
- [ ] `/view` skill has a mandatory prop-verification step before writing output
- [ ] `/view` skill writes `view_locked: [path]` to spec frontmatter when done
- [ ] `/dev` skill reads `view_locked` and adds those paths to its forbidden-edit list when present
- [ ] `/pick-flow` offers a new `ui-heavy` flow variant that includes `/view` between `/ui` and `/dev`
- [ ] Re-running the p699 test via `/view` on a clean worktree produces a view component that catches all 4 polish fixes AND passes build without the `footerSlot` hallucination
- [ ] Experiment artifact in `.claude/worktrees/w1` remains intact as reference until this spec ships

## Acceptance Criteria

- [ ] A UI-heavy feature can run the full `ui-heavy` flow end-to-end and ship with visually polished output
- [ ] Backward compatibility: existing specs without `view_locked` get unchanged `/dev` behavior
- [ ] The skill fails gracefully (stops and reports) when it detects a prop that doesn't exist, rather than hallucinating

## Reference artifact

`.claude/worktrees/w1` — contains the passing experiment output for p699. The view + demo + proto route at `/_proto/story-walk` demonstrate the target quality bar. Compare output of productionized `/view` against this artifact before closing the spec.

## Technical Architecture

### Technical Analysis

**Closest pipeline analogues (read before designing):**
- `.claude/commands/slava/build/ui.md` — same pipeline shape: pre-flight → inventory (Glob/Grep) → append section → retire ephemeral sections → pipeline stamp → predecessor check. `/view` models its agent-prompt block on this file verbatim (section numbering, "MANDATORY FINAL STEP — WRITE TO FILE", confirm-readback pattern).
- `.claude/commands/slava/build/ux.md` — write-to-spec pattern with delta-aware discovery. `/view` does NOT need delta mode (its output is code files + a frontmatter key, not a spec section), so only the pipeline stamp pattern is reused.
- `.claude/commands/slava/build/dev.md` — target of one-branch modification. Steps 0–0.4 are the pre-flight block; Step -1 is Context Load; Step 1.5 reads Component Strategy. Natural insertion point for `view_locked` is a new Step 1.6 immediately after 1.5, before step 2 (Verify context) — this places the forbidden-path list alongside the other spec-derived constraints.
- `.claude/commands/slava/build/pick-flow/SKILL.md` — task classification table (Step 0) + risk-to-step reasoning (Step 1). `ui-heavy` is not a new row in the classification table (it's a feature subtype). Correct insertion: add one example in Step 1's risk-reasoning list ("Feature is a new visual surface needing aesthetic polish within the design system" → `/view`) and extend the "Available commands (sequence order)" line to include `/view` between `/ui` and `/generate-tests`.

**Rules that constrain the design:**
- `.claude/rules/spec-sections.md` — `view_locked` is a frontmatter field, not a section, so no canonical header is needed. `/view` does not emit a `## {Something}` section.
- `.claude/rules/features.md` — frontmatter must be inline YAML. `view_locked` follows the `tags: []` / `pipeline_ran: [...]` inline-list convention.
- `.claude/rules/skills.md` — `/view` needs `name`/`description`/`when_to_use`/`version` frontmatter, namespace `build/`, cost-log write, and "subagent file content inline" discipline (this skill reads spec + adjacent page sources + tokens + component sources, then embeds content into the agent prompt).

**Current pipeline position:**
```
/create-spec → /challenge-prd → /ux → /architect → /ui → [NEW: /view] → /generate-tests → /spec-review → /decompose → /dev → /verify
```

### Architecture Decisions

**Decision 1 — Skill file location + namespace**
- **Chosen:** `.claude/commands/slava/build/view.md` (flat file, not a directory). Namespace `build/`.
- **Rationale:** Matches `ui.md`, `ux.md`, `architect.md`, `dev.md` — all pipeline skills are flat files in `build/`. Directory form (`pick-flow/SKILL.md`) is reserved for skills with bundled sub-agent files.
- **Trade-off:** Single file means the agent prompt lives inline; can't reuse it from another skill. Acceptable — no other skill needs to call `/view`'s prompt.
- **Alternative rejected:** `content/` namespace (this is not a content-production skill; it's a pipeline step).

**Decision 2 — Single-agent structure (no sub-agents)**
- **Chosen:** One general-purpose agent invocation, matching `/ui` and `/ux`. Skill spawns one agent with the full directive inline.
- **Rationale:** `/view`'s work is sequential and context-bound (read spec → read tokens → read adjacent pages → read target component sources → draft → verify props → write → build-gate). Splitting into two agents (e.g., "designer" + "verifier") would require the second agent to re-read everything the first read — extra cost, no parallelism benefit.
- **Trade-off:** No independent adversarial voice on the draft before writing. Mitigation: the prop-verification step is itself an adversarial check against the draft; failed build is the second.
- **Alternative rejected:** Two-agent pattern like `/architect`'s optional security sub-agent — overkill for a skill whose output is two TSX files.

**Decision 3 — Input discovery (hybrid: spec-named + automatic)**
- **Chosen:** Spec-named adjacent pages. `/view` reads the `## Visual Context` section of the spec (produced by `/ux`) and extracts the `- Visual reference:` bullet (one-line list of page paths or route names, comma- or newline-separated). Automatic fallback: if the `Visual Context` section is missing OR the `Visual reference:` bullet is empty, `/view` stops and asks the founder to name them — does NOT auto-infer from route proximity.
- **Rationale:** Auto-inference from routing is brittle (routes don't encode visual similarity). Asking up-front costs one round-trip and produces better output. The `/ux` Visual Context already requires a "visual reference" field — `/view` reuses it.
- **Trade-off:** Extra friction when founder didn't fill in visual reference. Mitigation: stop-and-ask is a one-line response, not a re-run.
- **Alternative rejected:** Scanning sibling routes in `src/app/` — produces inconsistent output when sibling routes span mixed design eras.

**Decision 4 — Prop verification (grep-based, build-gated)**
- **Chosen:** Two-layer verification.
  1. **Pre-write prop extraction:** Before writing either output file, parse every JSX opening tag in the draft, **including multi-line attribute blocks** (attributes may span many lines with `prop={…}` expressions on their own lines — a single-line regex is insufficient; use a multi-line-aware scan or AST-lite pass: find each `<Capitalized…` token, then consume until the matching `>` or `/>` at the same nesting level, accumulating attribute names along the way). For each component, locate source via Glob (`src/components/ui/{name}.tsx`, `src/app/components/**/{name}.tsx`), read the file, and grep for `interface {Name}Props` or `type {Name}Props` or the inline props destructure (`{ prop1, prop2, ... }: { prop1: ...; prop2: ...; }`). For each prop used in the draft, verify it exists. If ANY prop missing: STOP, report to founder with three options (A: extend component — route back to `/ui`; B: use existing prop / workaround; C: skip feature).
  2. **Post-write build gate:** After writing files + route, run `npm run build`. If build fails, read the error, attempt one fix, re-build. If still failing: STOP, report full error. Do not mark skill complete on a red build.
- **Rationale:** Grep catches the exact failure mode from the w1 experiment (`footerSlot` hallucination on `LiveStoryCardExpanded`). Build gate catches type errors grep misses (wrong prop type, missing required prop). Two cheap layers beat one expensive one.
- **Trade-off:** Grep misses complex prop types (union types, generics, spread props). Build gate catches those. Acceptable blind spot: prop types accepting a subset of literals where an invalid literal is passed — TSC catches this during build.
- **Alternative rejected:** AST-based verification (ts-morph, typescript compiler API). Too much infrastructure for a skill that runs a build anyway. The build itself IS the AST check.

**Decision 5 — Worktree missing-dependency handling (stop and report)**
- **Chosen:** Before writing output, for every import in the draft, verify the source file resolves at the worktree root (Glob). If any import unresolved, STOP, report:
  ```
  Missing dependencies at this worktree root:
    - src/components/ui/gap-banner.tsx (imported by draft)
    - src/app/components/shared/fixed-bottom-bar.tsx (imported by draft)
  These exist on other feature branches but not here. Options:
    (A) Cherry-pick the commits that added them — name the branch
    (B) Create stubs locally — /view drafts minimal versions
    (C) Rework the draft to avoid these components
  ```
- **Rationale:** Silent failure (draft imports something that doesn't exist → build fails with confusing error) wastes a full iteration. Explicit stop surfaces the branch-dependency reality. Copying files from other worktrees silently is worse — it's a hidden coupling that diverges when the other branch changes.
- **Trade-off:** Founder has to make a decision. Acceptable: the decision needs to be made anyway.
- **Alternative rejected:** Auto-copy from sibling worktree (hidden coupling). Auto-stub (invisible scope expansion; stub may diverge from real component).

**Decision 6 — `/dev` enforcement (prompt-level with programmatic check before write)**
- **Chosen:** Prompt-level constraint + programmatic pre-write check. In `/dev` Step 1.6 (new), read `view_locked` from frontmatter. **Exact frontmatter format** (inline YAML list, repo-root-relative literal paths):
  ```yaml
  view_locked: [src/app/components/_proto/p748-view.tsx, src/app/components/_proto/p748-view.demo.tsx]
  ``` Before every Write/Edit call during implementation, check: is the target path in `view_locked`? If yes: STOP, report: "Attempted to edit locked view file {path}. `/view` owns this file. Options: (A) re-run `/view` to update the view, (B) remove path from `view_locked` if ownership has changed, (C) edit a different file." The check is a prompt instruction, not a wrapper hook — hooks are in `.claude/hooks/` and adding one is out of scope for P748.
- **Rationale:** Matches existing `/dev` discipline (the Component Map and Visual Specification are also prompt-level constraints). Adding a real wrapper hook is orthogonal infrastructure and not required to validate the hypothesis. If prompt-level respect proves insufficient in practice, a hook is a separate feature.
- **Trade-off:** Agent can still override if it decides to. Acceptable — prompt-level constraints are how every other part of the pipeline works.
- **Alternative rejected:** Wrapper hook in `.claude/hooks/pre-write.sh` that reads `view_locked` and rejects writes. Defer until the prompt-level approach is shown to fail.

### Security Review

**RLS Policies:**
- ✅ N/A — no database surface

**Authentication:**
- ✅ N/A — no auth surface

**Input Validation:**
- ⚠️ `view_locked` frontmatter paths are consumed by `/dev` as a forbidden-edit list. Paths are founder-authored via the skill and live inside the repo. Low risk, but `/dev` should treat `view_locked` as literal path strings (not glob/regex) and resolve them relative to repo root — prevents a mistyped `../` entry from silently disabling the guard.

**Data Protection:**
- ✅ N/A — no user data

**Skill-specific risks:**
- `/view` writes to `{feature}-view.tsx`, `{feature}-view.demo.tsx`, and adds a route to `App.tsx`. Paths are derived from the feature P-number (founder-controlled), not untrusted input. Low risk.
- ⚠️ The `/_proto/{feature}` route is a dev preview surface — must not be exposed in prod builds. Gate by `import.meta.env.DEV` or equivalent. The skill's route-addition step must include this guard.
- No shell command execution with untrusted input. No external network surface beyond `npm run build`.

Overall: skill-file infrastructure with no data, auth, or external surface. Two action items — `/dev` resolves `view_locked` as repo-root literals, and `/view` guards proto routes by `import.meta.env.DEV`.

(No external services, no secrets, no DB access, no auth changes. Infrastructure-only skill changes.)

### Implementation Approach

**Worktree recommended:** yes — touches `.claude/` skill files.

#### Build Sequence

1. **Create `.claude/commands/slava/build/view.md`** with:
   - Frontmatter: `name: view`, `description: …`, `when_to_use: After /ui, before /generate-tests — for ui-heavy features needing visual polish`, `version: 1.0.0`
   - Sections modelled on `ui.md`: Quick Start, When to Use, Position in Pipeline, What It Generates, Workflow, Pre-Flight Check, Design System Context, Agent Behavior, Implementation (inline agent directive), After View, Related Skills
   - Constraint model: inverted `frontend-design` (reuse design system, polish-only variable)
   - Agent directive steps: (1) Read spec UX Design + Component Strategy + Visual Specification + Visual Context + types referenced; (2) Read tokens (`tailwind.config.ts`, `src/app/globals.css`); (3) Read 2–3 named adjacent pages; (4) Read target component sources for prop inventory; (5) Draft `{feature}-view.tsx` (props-only, typed) + `{feature}-view.demo.tsx` (mocks + state toggles); (6) **Pre-write prop verification** (grep every `<Component>` usage against its source); (7) **Import resolution check** (every import Globs to an existing file at worktree root); (8) Write files to `src/app/components/_proto/`; (9) Add route to `src/App.tsx` **guarded by `import.meta.env.DEV`** — proto routes must not render in prod builds (e.g., `{import.meta.env.DEV && <Route path="/_proto/{feature}" element={…} />}`); (10) Write `view_locked: [path]` to spec frontmatter as an **inline list of repo-root-relative literal path strings** (no globs, no `../`, no absolute paths); (11) **Post-write `npm run build` gate** (one retry allowed); (12) Confirm readback of last 10 lines of spec frontmatter
   - Pipeline stamp (P659): set `delivery_stage: view`, append `view` to `pipeline_ran`, predecessor check (expects `ui` in `pipeline_ran` when `pipeline_plan` places `view` after `ui`)
   - Cost-log write per `.claude/rules/skills.md`

2. **Modify `.claude/commands/slava/build/dev.md`** — add new Step 1.6 immediately after the existing Step 1.5 (Read Component Strategy), before step 2 (Verify context):
   ```
   1.6. **Read view_locked** — If spec frontmatter has `view_locked: [path1, path2, ...]`,
   treat each path as read-only for the remainder of this run. Paths are literal strings
   resolved relative to the repo root — do NOT interpret them as globs or regex. Reject any
   entry containing `..`, starting with `/`, or otherwise escaping the repo root (mistyped
   entries must fail loudly, not silently disable the guard). Before any Write or Edit call,
   normalize the target file path (repo-root-relative) and check literal equality against
   every view_locked entry. If a write to a locked path is attempted, STOP and report:
   "Attempted to edit locked view file {path}. /view owns this file. Options: (A) re-run
   /view to update the view, (B) remove path from view_locked if ownership has changed,
   (C) edit a different file." Continue only after founder confirms. If view_locked is
   absent, proceed with current behavior (backward-compatible).
   ```
   Also add one bullet to the "Self-review checklist" section (grep `dev.md` for the `Self-review checklist` heading — do NOT rely on line numbers): `- [ ] No locked view files modified (if view_locked present in spec)`.

3. **Modify `.claude/commands/slava/build/pick-flow/SKILL.md`** — two edits:
   - In Step 1 (risk reasoning list, ~line 68), add: `- "Feature is a new visual surface where polish will splinter across /dev iterations" → /view (between /ui and /generate-tests)`
   - In "Available commands (sequence order)" (line 132), insert `/view` between `/ui` and `/generate-tests`: `… /ui · /view · /generate-tests …`

4. **Validation step — re-run the w1 experiment** on a clean worktree using the productionized `/view`:
   - Create a new worktree, check out an imaginary p699 branch state
   - Invoke `/view features/p699_*.md`
   - Verify the skill catches the `footerSlot` hallucination in its prop-verification step (not via the build gate)
   - Verify the build gate catches anything the grep missed
   - Verify `view_locked` is written correctly as inline list
   - Compare output file quality against `.claude/worktrees/w1/src/app/components/_proto/story-walk-view.tsx` — must be at least equivalent
   - If the productionized skill produces worse output than the manual experiment, iterate on the agent directive before closing

5. **Run `python3 scripts/fix-skill-frontmatter.py`** to validate frontmatter.

6. **Commit on `main`** (skill files must land on main per `.claude/rules/skills.md` branch guard).

#### Files to Create

- `.claude/commands/slava/build/view.md` — the new skill (≤350 lines, modelled on `ui.md` structure)

#### Files to Modify

- `.claude/commands/slava/build/dev.md` — add Step 1.6 (view_locked forbidden-path check) + one self-review bullet
- `.claude/commands/slava/build/pick-flow/SKILL.md` — add `/view` to risk-reasoning examples + to Available commands sequence line
