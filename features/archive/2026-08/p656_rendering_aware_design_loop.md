---
status: rejected
type: task
rank: 48
created_date: '2026-04-04'
tags:
  - design-excellence
  - wave-3
  - rendering
  - infrastructure
closed_at: '2026-08-14'
---

# P656: Rendering-Aware Design Loop

> **Closed 2026-08-14 — backlog triage.** None of its five deliverables were built and nothing waited for them in 131 days. The adjacent goal is served by `.claude/rules/visual-qa.md` + the P955 UI gate + `/verify` — different mechanisms, not this one. Closed on absence of demand, not on supersession.
>
> Full reasoning and the adversarial review that produced this call: session plan v2, 2026-08-14.

**Part of:** Design Excellence Program (3-wave). Wave 3 of 3.
**Depends on:** P655 (Pipeline Skills Upgrade) must be shipped first
**Why backlog:** Wave 3 only adds value once Wave 2 constraints are in place. Feedback loops for decisions that don't yet exist as constraints are premature.

---

## Problem

**Situation:** After Wave 1 (design system foundation) and Wave 2 (pipeline skill upgrades), agents will work within better constraints and produce visual design specs before implementation. The `/design-critique` skill will evaluate rendered output after implementation.

**Complication:** The critique still runs once, at the end. Agents don't see rendered output during implementation — only after. This means visual decisions accumulate through the implementation phase and are corrected in bulk at the critique gate. For simple features, this is fine. For complex layouts, novel interaction patterns, or high-stakes pages, a single end-of-pipeline correction pass may not be enough.

**Question:** How do we give agents visual feedback during implementation (not just after), and how do we ensure new pages are visually consistent with the broader app?

---

## Appetite

- **Blast radius:** Medium. Additive infrastructure — new scripts, new reference library, new tooling. Does not modify existing skills (Wave 2 already upgraded them).
- **Reversibility:** High. All changes are additive. Removing a golden screenshot library or cross-page check script has no blast radius.
- **Decision density:** Medium. Tooling choices (how to store reference screenshots, how to run cross-page diffs) need founder input before implementation.

**Unblock condition:** P655 shipped AND at least 3 features built using the Wave 2 pipeline to validate that constraints-first approach produces good results before investing in rendering loops.

---

## Approach

### 1. Golden Screenshot Library

Capture reference screenshots of the 5-8 best-looking shipped pages at desktop + mobile viewports.

- **Storage:** `docs/design-references/{page-name}/{desktop|mobile}.png`
- **Metadata:** `docs/design-references/index.md` — for each reference, tag: visual language (standard/ceremony), density (spacious/dense), emotional register
- **Usage:** `/design-critique` skill references these when evaluating new feature renders. "Compare against: profile page (standard/spacious), agreements page (ceremony/spacious)"
- **Maintenance:** Update when pages are intentionally redesigned. Stale references become wrong benchmarks.

### 2. Render-in-the-Loop During Implementation

During Phase 2b (visual implementation), after each major UI component is implemented:
1. Dev server is already running (worktree setup provides this)
2. Screenshot via Chrome MCP at the affected route
3. Lightweight design-check: does this component match the Visual Specification density and hierarchy intent?
4. Fix before moving to next component

This catches visual drift early instead of accumulating it to the final critique gate.

**Tooling needed:** A lightweight `scripts/design-check-component.sh` that takes a screenshot URL and a spec section reference and produces a pass/fail against the Visual Specification.

### 3. Cross-Page Visual Consistency Check

After implementing a new page, automatically screenshot 2-3 sibling/adjacent pages and compare visual weight, spacing rhythm, and color temperature.

**Trigger:** After `/design-critique` PASS — before marking delivery_stage: uat.

**Tooling needed:** `scripts/cross-page-consistency.sh` — takes a list of page URLs, screenshots each, produces a comparison report highlighting visual inconsistencies.

### 4. A/B Design Generation (High-Stakes Features)

For features tagged `design-critical` in spec frontmatter:
- Generate 2 visual approaches (e.g., spacious card vs. dense table)
- Render both at desktop + mobile
- Present comparison screenshots to founder for selection before full implementation

This is how human design teams work: explore and select, not produce one option and QA it.

**Trigger:** Only when spec has `tags: [design-critical]`. Not default.

### 5. Design Token Extraction From References

When a spec's Visual Design Brief says "feel like [page]", an agent should:
1. Screenshot the reference page
2. Read its source to extract effective tokens (spacing scale, color temperature, density, typography)
3. Use those as constraints during implementation

Closes the loop between "reference" and "implementation." Currently the reference is a named page — the agent has to guess what "feel like" means in Tailwind terms.

---

## Risks / Non-Goals

**Risks:**
- Golden screenshot library becomes stale as pages evolve. Mitigation: document maintenance trigger (on intentional redesign) and add stale-reference warning to `/design-critique`.
- Render-in-the-loop requires dev server running during implementation — adds setup complexity. Mitigation: worktree setup already starts dev servers; this is a documentation and scripting problem, not a new infrastructure problem.
- A/B generation doubles implementation work for design-critical features. Mitigation: explicit opt-in via tag, not default.

**Non-Goals:**
- Do NOT implement automated visual regression testing (Percy/Chromatic) — that's a different problem (catching regressions vs. evaluating design quality)
- Do NOT run cross-page consistency check on every commit — only after new page implementation
- Do NOT make render-in-the-loop mandatory for all features — only for features tagged `design-intensive` or where `/design-critique` returns FAIL after 2 cycles

---

## Done-When

- [ ] `docs/design-references/` exists with ≥5 reference page screenshots (desktop + mobile)
- [ ] `docs/design-references/index.md` documents each reference with visual language, density, and register tags
- [ ] `/design-critique` skill references golden screenshots when evaluating new renders
- [ ] `scripts/cross-page-consistency.sh` exists and produces a visual comparison report
- [ ] Cross-page check runs automatically as part of the UAT gate for new page implementations
- [ ] Render-in-the-loop script documented for `design-intensive` features
- [ ] A/B generation flow documented in `/dev` skill as opt-in for `design-critical` tagged specs

## Screenshot Tooling Decision (Resolved)

- **Golden screenshot library + cross-page consistency:** Use **Playwright** — already installed, runs headless, can be scripted at defined viewports, no Chrome extension dependency. Pattern already exists in `e2e/live-page-layout.spec.ts` and `e2e/landing-no-horizontal-scroll.spec.ts`.
- **Render-in-the-loop during `/dev`:** Handled by Wave 2 (upgraded step 8.9 using Chrome extension). Wave 3 does not re-implement this.

## Research Questions

Before implementing, answer:
1. Does render-in-the-loop (mid-implementation screenshot feedback) add enough value over the end-of-pipeline critique loop from Wave 2 to justify the complexity?
2. Should golden screenshots live in git (PNG files) or as Playwright baseline snapshots (integrated with existing test infrastructure)?

## Time Box

Do not start until P655 is shipped and 3+ features have been built using the Wave 2 pipeline. Evaluate wave 2 results before committing to wave 3 scope.
