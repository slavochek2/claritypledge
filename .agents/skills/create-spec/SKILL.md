---
name: create-spec
description: File a spec with the 5-field skeleton (Problem, Appetite, Solution, Risks/Non-Goals, Done-When) plus type-appropriate expansion modules
when_to_use: "Starting any new work that needs tracking — features, infrastructure, refactors, research, migrations. Replaces /create-prd and /quick-feature."
version: 1.0.0
---

# /create-spec

**File a structured spec from a problem description.** Produces the 5-field skeleton with expansion modules appropriate to the work type.

> **Principle:** Every piece of non-trivial work gets a spec. The spec is a thinking tool, not a contract. Depth scales with blast radius, not work type.

**Announce at start:** "I'm using the create-spec skill to file a spec."

---

## Worktree guard

Before creating any file, check:
```bash
git worktree list | head -1 | awk '{print $1}'
```
Compare to `pwd`. If they differ, you are in a worktree — **stop immediately**. Tell the user:
> "Specs must be created in w0 (main). Run `cd ~/Projects/public/claritypledge` first, then re-run this skill."
Do not create any file until you are in the main repo.

---

## Quick Start

```
/create-spec "Add dark mode toggle to profile page"
/create-spec "Enforce TDD for all bug fixes by modifying /fix and /create-bug skills"
/create-spec "Research: what auth provider should we use for SSO?"
/create-spec features/p142_dark_mode.md   # Extend existing spec
```

---

## When to Use

✅ **Use /create-spec for:**
- Any new feature, infrastructure change, refactor, research task, or migration
- Any work that needs a P-number for tracking
- When `/pick-flow` says "no spec exists — create one first"

❌ **Don't use for:**
- Bug fixes → use `/create-bug` (symptom-first template)
- Redesigns of shipped features → use `/change-request` (predecessor-linked)
- Typo in a comment, whitespace fix — zero behavioral impact, no spec needed

---

## The 5-Field Skeleton

Every spec, regardless of work type, has these five fields. The skeleton is the minimum viable spec.

### 1. Problem

What's broken, missing, or needed — and for whom.

**For complex/ambiguous problems, use SCQ:**
```
**Situation:** [what IS — grounded facts, ≤3 sentences]
**Complication:** [why NOW — what changed or what's failing]
**Question:** [what we're actually deciding/building]
```

**For simple/obvious problems, a flat statement is fine:**
```
The export button on the results page doesn't work on Safari. Users see a blank download.
```

**The test:** If someone reading only the Problem section can't explain what needs doing and why — it's not clear enough.

### 2. Appetite

Not a time estimate. Three dimensions:

- **Blast radius** — what breaks or changes if we get this wrong? (one component / one flow / all future work)
- **Reversibility** — how hard to undo? (git revert / migration rollback / can't undo)
- **Decision density** — how many founder decisions are needed? (zero / a few / many open questions)

**Example:**
```
High blast radius (touches auth flow for all users). Medium reversibility (migration + code, 
but feature-flaggable). Low decision density — UX decided in P400.
```

### 3. Solution / Approach

What we intend to build or investigate, at appropriate abstraction.

- **For implementation work:** "Solution" — what to build. Concrete enough to evaluate, abstract enough to leave room for the implementing agent's judgment.
- **For research/investigation:** "Approach" — what to investigate and how. The solution is the deliverable, not the input.

**Don't prescribe implementation details** unless they're architectural decisions. File paths, function names, and build sequences belong in `/architect`, not here.

### 4. Risks / Non-Goals

**The highest-leverage section for AI agent implementation.**

**Risks:** What could go wrong. Include mitigation for each.

**Non-Goals:** What we are explicitly NOT doing. Frame as agent constraints:
- "Do NOT change the auth flow"
- "Do NOT add new database tables"
- "Do NOT refactor adjacent code"

Agents expand scope. Explicit "do not" constraints prevent this better than detailed positive requirements.

### 5. Done-When

Measurable completion signals. Each item should be verifiable without reading the code.

- Use checkbox format `- [ ]`
- Observable outcomes, not implementation steps
- Include regression test requirements where applicable

---

## Expansion Modules

After the skeleton, add modules appropriate to the work type. **Modules are optional** — only add what the work type needs. If a module would be filled with "N/A", don't add it.

### Feature expansions
- `## UX Notes` — interaction patterns, states (happy path, error, empty, loading)
- `## Acceptance Criteria` — business-level, checkbox format (per `spec-sections.md`)
- `## UI Contract` — exact strings, colors, measurements (if UI feature)

### Infrastructure / Refactor expansions
- `## Alternatives Considered` — what else was evaluated and why rejected
- `## Rollback Strategy` — how to undo if it goes wrong

### Research / Investigation expansions
- `## Research Questions` — numbered, specific questions to answer
- `## Time Box` — maximum investment before reporting findings
- `## Deliverable` — what the output looks like (decision doc, prototype, recommendation)

### Migration expansions
- `## Migration Plan` — step-by-step execution order
- `## Rollback Plan` — how to reverse if data integrity fails
- `## Data Integrity Check` — how to verify migration succeeded

---

## Work Type Detection

Detect from the description. Don't ask — classify and state:

| Signal in description | Work type | Expansions |
|----------------------|-----------|-----------|
| "add", "new", "enable", "allow users to" | Feature | UX Notes, Acceptance Criteria, UI Contract |
| "refactor", "restructure", "extract", "move to" | Refactor | Alternatives Considered |
| "skill", "process", "hook", "rule", ".claude/" | Infrastructure | Alternatives Considered, Rollback Strategy |
| "research", "investigate", "evaluate", "compare" | Research | Research Questions, Time Box, Deliverable |
| "migrate", "upgrade", "move data", "schema change" | Migration | Migration Plan, Rollback Plan, Data Integrity Check |

**State the classification:** "Classifying as: infrastructure (modifies skill files). Adding: Alternatives Considered, Rollback Strategy."

If genuinely ambiguous, ask one question: "Is this a [type A] or [type B]? The expansions differ."

---

## Agent Persona

```
You are a Product Manager working directly with the founder. The founder provides 
vision, context, and decisions. Your job: structure their intent into a spec, ask 
clarifying questions when the problem or scope is unclear, and flag [FOUNDER DECISION] 
for anything requiring business judgment. You do not make product decisions. You 
structure them.
```

---

## Workflow

```
1. WORKTREE GUARD → Check you're on main (w0)
       ↓
1b. PIPELINE STAMP → Set delivery_stage and pipeline_ran (see below)
       ↓
2. DETECT TYPE → Classify work type from description, state it
       ↓
3. DUPLICATE GATE → grep features/ + docs/decisions.md + src/; state
   DUPLICATE/RELATED/NONE with the terms searched. BLOCKING — no file
   is written before this runs (see Step 3)
       ↓
4. GET P-NUMBER → Run ./scripts/next-p-number.sh
       ↓
5. CALCULATE RANK → ./scripts/next-rank.sh {status} (per-column, never global)
       ↓
6. STRUCTURE → Write 5-field skeleton + appropriate expansion modules
       ↓
7. SELF-REVIEW → Check quality gates
       ↓
8. CREATE FILE → features/p{N}_{slug}.md with correct frontmatter
       ↓
9. REPORT → File path, work type, next step
```

### Pipeline stamp (P659)

Before any other work in this skill (after worktree guard):
1. Read spec frontmatter
2. Set `delivery_stage: create-spec`
3. Append `create-spec` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, create-spec]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [create-spec]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `create-spec` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

**Note:** Since create-spec creates the file, set `delivery_stage: create-spec` and `pipeline_ran: [create-spec]` in the initial frontmatter (see Frontmatter section below).

---

### Step 3: Duplicate gate — BLOCKING, runs before the file is written

> **This is a gate, not a courtesy search.** No spec file is created until this has run and its
> output has been shown. Running it after the file exists converts a free check into a retraction.

Search **three** surfaces. `decisions.md` is the one that is skipped and the one that most often
holds the answer — a defect is frequently recorded there, with a spec already filed and referenced,
long before it is rediscovered:

```bash
# Use the DEFECT'S OWN VOCABULARY, not your framing of it. Two or three distinct phrasings.
grep -ril "{key concept}" features/ 2>/dev/null | head -10          # open + done specs
grep -rn  "{key concept}" docs/decisions.md 2>/dev/null | head -10  # prior decisions AND the specs they filed
grep -ril "{key concept}" src/ scripts/ 2>/dev/null | head -10      # already handled in code
```

**Search terms are where this fails.** Grep the mechanism and the symptom, not the name you just
invented for it. A search for the label you would give the new spec finds the new spec's absence and
nothing else. If the defect is "the tool skipped a file", search `skipping`, the exact output
string, the function name — not "drift" or "audit".

**Then state a verdict out loud before writing anything.** One of:

- `DUPLICATE: pN` — stop. Do not create a file. Add the new evidence to the existing spec and say
  so. A second spec for one defect splits its evidence and hides its real age.
- `RELATED: pN` — proceed, and reference it in the new spec's Related section.
- `NONE — searched: "<term1>", "<term2>", "<term3>"` — proceed. Name the terms; an unstated search
  cannot be judged, and "I looked" is not a result.

**A hit in `decisions.md` outranks an empty `features/` result.** Entries routinely name a filed
P-number in their Decision or References field, and that spec may sit unimplemented for weeks. The
spec's absence from your grep of `features/` usually means your search terms were wrong, not that
the spec does not exist.

If existing code already handles the concept — flag it: "This may be an inline extension of existing
code at [path]. Proceed with spec or handle inline?" Let the user decide.

**Why this is blocking (2026-08-24):** a migration version-collision defect was diagnosed from
scratch, written up, and committed as P1154 — while **P1042** had been open since 2026-08-10 at
`severity: high`, specifying the same fix in more detail, including the authoring-time check P1154
offered as its novel contribution. The dedupe grep ran during `/kdd`, after the commit. The 2026-08-11
decision entry naming P1042 would have surfaced it instantly. Cost: a retraction, and two weeks in
which the real fix looked like it was being worked on. See [decisions.md](../../../../docs/decisions.md)
2026-08-24 "File-first, grep-second".

---

## Frontmatter

```yaml
---
status: week
type: story | task | comment    # story=user-facing, task=technical, comment=research/notes
rank: {calculated}
workstream: {infer or omit}
created_date: '{YYYY-MM-DD}'
tags: [{2-4 relevant tags}]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: {model writing this draft: opus|sonnet|gemini|human}  # write-once, never updated
driver: heuristic | anomaly    # OPTIONAL — see below; omit if genuinely unclear
---
```

**Type mapping:**
- Feature → `type: story`
- Infrastructure, refactor, migration → `type: task`
- Research, investigation → `type: comment`

**`driver:` (optional, one line, never enforced).** Records *why this spec exists*:
- `heuristic` — planned work, following the programme's pre-planned model sequence ([research-programme.md](../../../../docs/research-programme.md) — Positive heuristic).
- `anomaly` — reactive work, cleaning up after something just broke or was refuted.

`/slava:maintain:programme-health` reads the **ratio** across specs as one of five signals. A programme working mostly off its own agenda looks different from one only ever patching. **Nothing blocks on this field** — no gate, no check, no prompt if it is missing. Omit it rather than guessing; a fabricated ratio is worse than a thin one.

**Do NOT add at creation:** `completed_at`, `date_resolved`, `flow`.

---

## Quality Gates (Self-Review)

Before creating the file, verify:

- [ ] Problem is clear — a reader understands what needs doing and why without reading anything else
- [ ] Problem uses SCQ for complex problems, or a clear flat statement for simple ones
- [ ] Appetite states blast radius, reversibility, and decision density — NOT time
- [ ] Solution/Approach is at the right abstraction — not prescribing implementation details
- [ ] Risks list at least one concrete risk with mitigation
- [ ] Non-Goals include at least one "Do NOT" constraint relevant to AI agent implementation
- [ ] Done-When items are observable without reading code
- [ ] Expansion modules match the work type — no cargo-cult sections
- [ ] No section would be filled with "N/A" — if it would be, remove it
- [ ] Frontmatter has all required fields
- [ ] P-number from script, not manual computation
- [ ] File path follows `features/p{N}_{slug}.md`

**If any gate fails:** Fix before writing the file.

---

## Example: Feature Spec

```markdown
---
status: week
type: story
rank: 42.0
workstream: C2
created_date: '2026-04-04'
tags: [export, csv, sifter]
---

# P648: Export Sifter Responses as CSV

## Problem

**Situation:** Users complete sifter exercises and view responses in-app only.
**Complication:** Coaches need to review calibration data offline. Users tracking
progress over time have no way to export to spreadsheets.
**Question:** How do we give users a standard export of their sifter responses?

## Appetite

Low blast radius (new button on results page, no existing flows change). Fully
reversible (feature flag or remove button). Zero decision density — UX is a single
button, format is CSV.

## Solution

Add "Export CSV" button to results page. Export includes: question, response,
timestamp, calibration score. File name: `sifter_responses_YYYY-MM-DD.csv`.
Client-side generation (no server endpoint needed — data already loaded).

## Risks / Non-Goals

### Risks
- Large response sets may slow browser CSV generation. Mitigation: limit to 1000 rows
  with "Export All" option that streams.

### Non-Goals
- Do NOT add server-side export endpoint (data is already client-side)
- Do NOT support formats other than CSV (Excel, PDF — future consideration)
- Do NOT add export to other pages (profile, dashboard — scope to results only)

## Done-When

- [ ] "Export CSV" button visible on results page (desktop and mobile)
- [ ] Exported CSV opens in Excel/Google Sheets without errors
- [ ] CSV contains: question, response, timestamp, calibration score
- [ ] Only user's own responses exported (RLS enforced)
- [ ] Button disabled when no responses exist

## Acceptance Criteria

- [ ] User can export sifter responses from results page
- [ ] Feature works on mobile and desktop browsers
- [ ] Error handling for failed exports (user sees friendly message)

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Button label | "Export CSV" | Results page |
| Button state | disabled | When no responses |
| File name | `sifter_responses_YYYY-MM-DD.csv` | Downloaded file |
| Error toast | "Export failed. Please try again." | On error |
```

---

## Example: Infrastructure Spec

```markdown
---
status: week
type: task
rank: 43.0
created_date: '2026-04-04'
tags: [infrastructure, skills, process]
---

# P649: Add rate limiting to edge functions

## Problem

Edge functions have no rate limiting. A single client can hammer endpoints
and exhaust Supabase compute budget.

## Appetite

Medium blast radius (affects all edge functions). Reversible (remove middleware).
Low decision density — standard pattern, no novel trade-offs.

## Solution

Add rate-limiting middleware to all edge functions using sliding window
algorithm. 100 requests/minute per IP. Return 429 with Retry-After header.

## Risks / Non-Goals

### Risks
- Shared IPs (corporate NATs) may hit limits for legitimate users.
  Mitigation: 100/min is generous; monitor before tightening.

### Non-Goals
- Do NOT add per-user rate limiting (requires auth resolution in middleware)
- Do NOT add rate limiting to REST API (Supabase handles this)

### Alternatives Considered
- Cloudflare rate limiting: adds external dependency, harder to customize
- Supabase built-in limits: too coarse (project-level, not per-function)

### Rollback Strategy
Remove middleware import from each function. Single-line change per file.

## Done-When

- [ ] All edge functions return 429 after 100 requests/minute from same IP
- [ ] Retry-After header present in 429 responses
- [ ] Legitimate traffic unaffected (verified with prod traffic patterns)
```

---

## After File Creation

Tell the user:

```
Created: features/p{N}_{slug}.md
Type: {work type}
Next step: /challenge-prd (if feature) or proceed to /architect or /dev
```

Tell the user: "Hit the Refresh button in the kanban to see the new card (http://localhost:9050 → Refresh)."

---

## Replaces

- **`/create-prd`** — absorbed. The 5-field skeleton replaces the business-layer-only PRD. Product-owner sections (JTBD, User Stories, Success Metrics) move to `/product-owner` enrichment step (future, not yet built).
- **`/quick-feature`** — absorbed. Lightweight specs are just specs with shorter sections, not a different template.

---

## Related Skills

- `/challenge-prd` — adversarial review (includes lean check for features)
- `/product-owner` — enriches with JTBD, user stories, success metrics (features only, future)
- `/create-bug` — symptom-first bug spec (separate skill, not replaced)
- `/change-request` — predecessor-linked redesign spec (separate skill, not replaced)
- `/architect` → `/generate-tests` → `/dev` — downstream implementation pipeline
