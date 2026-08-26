---
description: 'Pre-dev spec quality audit — catches redundancy, consistency gaps, blindspots, and under-specification before implementation starts'
when_to_use: "Before /dev. When a spec exists but has not been reviewed for quality."
name: spec-review
version: 1.0.0
---

# /spec-review

Pre-dev spec quality audit — catches redundancy, consistency gaps, blindspots, and under-specification before implementation starts.

**Announce at start:** "I'm using the /spec-review skill to audit the spec before development."

---

## Usage

```bash
/spec-review features/pN_feature.md
```

**Examples:**
- `/spec-review features/p425_ai_story_core_loop.md`
- `/spec-review features/p142_csv_export.md`

**Run after:** `/generate-tests` (all spec layers exist)
**Run before:** `/decompose` (if complex) or `/dev`

---

## Lean Mode

**Trigger:** User invokes with the word `lean` as an argument.
Example: `/spec-review features/p142.md lean`

**Decision protocol:**
1. Check invocation for `lean` argument.
2. If present: announce "Lean mode — skipping deep cross-layer audit dimensions. This is a founder-asserted skip, not a verified clean run."
3. Proceed with reduced scope below.
4. Label output section to preserve signal/confidence distinction.

**When lean is appropriate (founder judges, skill does not):**
- Feature has been manually reviewed by founder
- Change is scoped + understood (copy, styling, refactor within one file)
- Founder accepts responsibility for skipped coverage

**When lean is NOT appropriate:**
- New data model / table / column
- New auth surface or route
- New external API call or LLM prompt
- Unfamiliar area of codebase

**Lean scope reduction:**
- Skipped: Dimensions 3 (Gaps), 4 (Blindspots), 5 (Under-specification), 8 (Cross-spec conflicts), 9 (Prior decisions conflict)
- Retained: Layer presence checks + Dimensions 1 (Redundancy), 2 (Consistency), 6 (Over-specification), 7 (Component Strategy)
- Output labeled: `## Spec Review (Lean — structural only)`

---

## What This Skill Does

Reads the fully prepared spec (Business + UX + Technical + Component Strategy + Tests) and audits it across nine dimensions. Returns a structured findings report with severity ratings. Does NOT auto-fix — surfaces issues for the user to decide.

**Nine audit dimensions:**

1. **Redundancy** — Content repeated across sections (same requirement in business + UX + tech)
2. **Consistency** — Contradictions between layers (UX wireframe says X, arch decision says Y)
3. **Gaps** — Missing edge cases, error states, or behaviors required by acceptance criteria but not specified anywhere
4. **Blindspots** — Unvalidated assumptions that could break during implementation (auth assumed, state not tracked, component not yet built)
5. **Under-specification** — Vague requirements ("TBD", "as needed", "similar to X") that a dev agent cannot implement without guessing
6. **Over-specification** — Implementation details in UX layer, pixel measurements in business layer, or tech decisions that constrain without rationale
7. **Component Strategy consistency** — Component Map classifications match codebase reality, no contradictions with Architecture Decisions (UI features only)
8. **Cross-spec conflicts** — Contradictions with related features referenced in `blocked_by`, `related_to`, or frontmatter tags (reads related specs to verify)
9. **Prior decisions conflict** — Contradictions with entries in `docs/decisions.md`

---

## Output Format

```
## Spec Review: P{N} {Feature Name}

**Verdict:** READY | NEEDS FIXES

**Blocking issues (must fix before /dev):**
- [BLOCK] Dimension: Description — what's missing/conflicting, where to fix it

**Warnings (should fix, won't break dev but will cause rework):**
- [WARN] Dimension: Description — what's at risk

**Notes (minor, optional to address):**
- [NOTE] Dimension: Description — suggestion only

**Summary:**
{1-2 sentence synthesis: what's the biggest risk if we proceed now?}
```

**Severity levels:**
- `[BLOCK]` — Ambiguity will cause dev agent to make wrong assumptions or produce untestable output. Fix before `/dev`. Before assigning BLOCK to any finding about an existing component, function, route, or DB column: verify the claim against the codebase (Grep + Read). A BLOCK based solely on spec text — without checking whether the code already handles it — is a false alarm.
- `[WARN]` — Implementation will work but likely needs a revision cycle. Recommend fixing.
- `[NOTE]` — Cleanup or stylistic improvement. Optional.

**Verdict rules:**
- `READY` — zero BLOCK findings
- `NEEDS FIXES` — one or more BLOCK findings

---

## Pipeline stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: spec-review`
3. Append `spec-review` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, spec-review]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [spec-review]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `spec-review` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## Agent Directive

When invoked, spawn a general-purpose agent (`model: "sonnet"`) with this directive:

```
You are a spec auditor. Your job is to catch issues that will cause rework during implementation.

**Phase 1 — Read everything first, before auditing anything.**

1. Read the full spec at {spec_file}.
2. From the spec, collect every named component, function, hook, and route mentioned. Use Grep and Read to locate and read each one in `src/`. If a name appears in an AC or architecture section, read its source file and its call sites now.
3. Read any specs in `blocked_by` or `related_to` frontmatter fields.

Do not begin dimension analysis until Phase 1 is complete. A finding about a named component or function requires evidence from what you read in Phase 1, not from spec text alone.

**Phase 2 — Check layers are present.**

All layers should be present: Business Requirements, UX Design (if UI feature), Technical Architecture, Component Strategy (if UI feature), and Test Coverage Strategy. See `.claude/rules/spec-sections.md` for canonical header names.

To determine feature type: check frontmatter for `feature_type: backend`. If absent, check whether the spec contains a `## UX Design` section. If neither frontmatter flag nor UX section exists, add BLOCK: "Cannot determine feature type — add `feature_type: backend` to frontmatter (if backend-only) or run /ux first (if UI feature)."

If any mandatory layer is missing for the feature type:
- UI feature missing `## UX Design` → BLOCK: "UX layer not found — run /ux first"
- Any feature missing `## Technical Architecture` → BLOCK: "Technical layer not found — run /architect first"
- UI feature missing Component Strategy → BLOCK: "Component Strategy not found — run /ui first"
- Any feature missing Test Coverage Strategy → BLOCK: "Tests layer not found — run /generate-tests first"

**Phase 3 — Audit across all seven dimensions:**

### 1. Redundancy
Flag content copied verbatim or near-verbatim across sections without adding new information. Each section should add a new layer, not repeat the previous one.

### 2. Consistency
Cross-check each layer against the others:
- UX wireframes vs. acceptance criteria (do wireframes cover every criterion?)
- Architecture decisions vs. UX flows (does the tech approach support every UX state?)
- Test coverage vs. acceptance criteria (is every criterion tested?)
- Data model vs. UX fields (does every UI field have a corresponding DB column or computed value?)
- Spec-stated routes vs. existing pages: for every route or URL pattern written in the spec, check whether a page at that route already exists in `src/app/pages/`. If the spec routes to `/foo?entityId=X` but a dedicated page for that entity already exists (e.g., `src/app/pages/entity-page.tsx` at `/entity/:id`), flag it: `[BLOCK] Consistency: Spec routes to /foo?entityId=X — /entity/:id already exists. Verify whether /foo is the correct destination or an unnecessary intermediary.`

### 3. Gaps
For each acceptance criterion: verify that at least one of (UX flow / test case / implementation step) covers it explicitly. Flag criteria with no coverage.

Also check:
- Error states: does every API call / async operation have an error path specified?
- Empty states: does every list/collection have an empty state specified?
- Loading states: does every async operation have a loading state specified?
- Auth boundaries: does the spec specify who can access what, and is it enforced at both UI and DB levels?

### 4. Blindspots
Look for unvalidated assumptions:
- "Users will see X" — where is X rendered? Does the component exist?
- State machine transitions — is every phase/state reachable AND escapable?
- Third-party dependencies — are external services (APIs, edge functions, AI models) confirmed to exist and accessible?
- Component reuse — does the spec reference components that don't exist yet?
- Migration order — does the spec assume DB columns exist that require a prior migration to apply?
- **Coexistence assumption check:** For any AC that uses language like "X replaces Y", "X does not coexist with Y", "Y is removed when X appears" — verify that Y actually exists and is a separate, independent element in the current component/page. If the AC assumes replacement but a pre-existing adjacent element also satisfies the same condition, the replacement logic will fail silently on surfaces where both elements are present.

  Ask: "Does anything already on this surface do the same job as what this spec adds or removes? Would both elements be visible simultaneously on any surface?"

### 5. Under-specification
Flag any requirement where a dev agent would have to guess:
- "TBD", "similar to", "as needed", "standard behavior" — what IS the standard?
- Missing labels, copy, or placeholder text for UI elements
- Missing error message copy
- Unspecified behavior when optional fields are omitted
- Phase transitions with no trigger specified

### 6. Over-specification
Flag constraints that limit implementation without justification:
- Pixel measurements in UX section (specify intent, not px)
- Specific library/implementation choices in UX (not the UX layer's concern)
- Business requirements that dictate HOW instead of WHAT
- Test files that specify implementation internals (test behavior, not code)

### 7. Component Strategy consistency (UI features only)
If a `## Component Strategy` section exists:
- Verify every "Reuse" component actually exists at the named file path (Glob check)
- Verify every "Extend" component has the base file and the proposed change is feasible
- Verify every "New" component has a justification for why existing patterns don't apply
- Check for Challenge Notes — if any are marked "Blocking", flag as BLOCK
- Cross-check Component Map against Architecture Decisions: if Architecture says "create new file X" but Component Map says "Reuse Y", flag the contradiction

### 8. Cross-spec conflicts (renumbered from 7)
Read the frontmatter `blocked_by` and `tags` fields. For each referenced feature (pN), read that feature's spec and check:
- Does this spec's architecture contradict a decision made in a dependency?
- Does this spec add a DB column/table that a dependency already added (collision)?
- Does this spec's UX flow assume a component or page that a dependency has designed differently?

### 9. Prior decisions conflict
```bash
grep "\[technical\]" docs/decisions.md
grep "\[product\]" docs/decisions.md
```
Check whether this spec contradicts any prior `[technical]` or `[product]` decision. If a contradiction exists, flag it as BLOCK with the exact decision entry date and title. If the spec intentionally supersedes a prior decision, it should say so explicitly — flag as WARN if it doesn't.

**Output rules:**
- Be specific: quote the exact text that is problematic, and name the section it's in
- Be actionable: say what needs to change, not just that something is wrong
- Do NOT suggest fixes that change product decisions — only surface spec quality issues
- Do NOT auto-fix the spec — return findings only
- Severity: BLOCK for anything that will cause a wrong implementation; WARN for rework risk; NOTE for cleanup

Use the output format specified in the skill. End with a one-line verdict: READY or NEEDS FIXES.
```

---

## When to Run

**In the sequential flow:**
```
/generate-tests → /spec-review → /decompose* → /dev
```

Run after all layers exist. `/spec-review` cannot audit what isn't there — partial specs will generate false BLOCKs.

**Optional re-runs:** After making spec fixes based on findings, re-run `/spec-review` to confirm the issues are resolved before proceeding to `/dev`.

---

## What This Skill Does NOT Do

- Does not auto-fix the spec (user decides what to change)
- Does not evaluate product decisions (wrong vs. right feature)
- Does not replace user review gates (it surfaces quality issues, not product direction)
- Does not test the implementation (that's `/dev`)

---

## Related Skills

- `/architect` — Technical architecture (run before /spec-review)
- `/generate-tests` — Test generation (run before /spec-review)
- `/decompose` — Task decomposition (run after /spec-review, complex features only)
- `/dev` — Implementation (run after /spec-review)
