---
name: create-spec
description: File a spec with the 6-field skeleton (Problem, Appetite, Solution, Risks/Non-Goals, Done-When, optional Invariants) plus type-appropriate expansion modules, mining the preceding conversation for founder intent
when_to_use: "Starting any new work that needs tracking — features, infrastructure, refactors, research, migrations. Absorbs /create-prd and /quick-feature."
version: 2.0.0
---

# /create-spec

**File a structured spec from a problem description.** Produces the 6-field skeleton — the sixth, Invariants, is optional — with expansion modules appropriate to the work type.

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

## The Skeleton

Every spec has fields 1-5 regardless of work type — that is the minimum viable spec. Field 6,
Invariants, is optional and absent by default.

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

**Risks:** What could go wrong. **Label every entry `MITIGATE | ACCEPT | DEFER`** — required by
`.claude/rules/features.md`. Without the label the next agent treats every listed risk as a
requirement and builds mitigations for risks you had already decided to accept.

- `MITIGATE` — we are doing something about it; name what.
- `ACCEPT` — known, tolerated, no action. Say why it is tolerable.
- `DEFER` — blocked on a decision or a later spec. Name what unblocks it.

A table is the compact form:

| Risk | Label | Note |
|---|---|---|
| Large exports slow the browser | MITIGATE | Cap at 1000 rows, stream beyond |
| Shared corporate IPs hit the limit | ACCEPT | 100/min is generous; monitor first |

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

**Done-When vs Acceptance Criteria — different questions, and which one a spec carries depends on
the skill that filed it. Do not merge them.**

- **`## Done-When`** — *this piece of work is finished when.* The completion field of **this**
  skill's skeleton. Covers infrastructure, research and migrations, where there is no user to
  observe anything.
- **`## Acceptance Criteria`** — *a person using the product can observe this.* The corresponding
  field in `/create-bug` and `/change-request`, whose templates emit it **instead of** Done-When,
  and a Feature expansion module here.

Measured across `features/` (2026-08-26): all 38 change-request specs and 217 of 238 bug specs
carry AC and no Done-When; 102 `task` specs carry Done-When and no AC; 52 `story` specs carry both.
So neither field is universal and AC is not feature-only — the filing skill decides.

**Both are named by the `qa` hard gate** in `.claude/rules/features.md`: every box in whichever of
these sections exists must be `[x]` before `status: qa`. A feature spec may carry both — put the
user-observable outcomes in AC and the rest in Done-When rather than restating one in the other.
Never add a section you do not intend to fill; a populated section nobody will verify is the real
hazard, not an empty one.

### 6. Invariants — optional, additive-only

Properties that must remain true **whatever the implementation does**. Omit the section entirely
when there are none; nothing gates on its absence.

**This is not Non-Goals.** A non-goal says *don't touch that area*. An invariant says *this
property must hold no matter what you touch* — it constrains the areas you DO touch. "Do NOT change
the auth flow" is a non-goal. "Any code path reaching the recorder must fail closed if consent is
absent" is an invariant.

Write one when the work sits on a constraint that was expensive to learn: a blocking gate with an
incident behind it, an ordering requirement, a fail-closed property, a contract with another file.
Mirrors `## Invariants` in `/create-bug`, which calls it *a sacred section — it persists across all
future rewrites*. Same treatment here, at the same strength: later specs and rewrites may add to
it; **removing an entry requires explicit user approval, never agent judgment.**

Most specs have none. A copy tweak with an Invariants section is the ceremony this field exists to
avoid.

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

### Research / Investigation / Measurement expansions
- `## Research Questions` — numbered, specific questions to answer
- `## Decision Criteria` — **pre-registered.** What evidence would settle each question, named
  *before* going to look. See below — this is the one that changes the answer.
- `## Time Box` — maximum investment before reporting findings
- `## Deliverable` — what the output looks like (decision doc, prototype, recommendation)

### Any spec introducing a new external API key, edge function, or third-party service secret
- `## Pre-deploy Checklist` — **MUST**, per `.claude/rules/features.md`, and enforced by
  `scripts/ship-gates.sh`. A new key, token, **edge function** or service credential does not reach
  prod by being mentioned in the Solution. List where the value is set, in which environment, and
  who sets it.

### Pre-registered decision criteria

For research, evaluation, comparison and measurement specs, write what would settle the question
before the investigation runs:

```markdown
## Decision Criteria

1. **Which auth provider?** → Pick the one that supports SAML *and* has a self-serve tier under
   500 users. If both qualify, pick on migration cost off Supabase Auth. If neither, we stay put.
2. **Is the retention drop real?** → Real if week-2 return rate differs by >5pp across two
   consecutive cohorts of n≥40. Below that we do not act on it.
```

`Time Box` is a **budget**, not a criterion — it says when to stop looking, not what counts as an
answer. Without pre-registered criteria a recommendation matches whatever the researcher happened
to find first, and every finding looks like it settles the question because the bar was set after
seeing it.

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

## Intent capture — read the conversation, not just the argument string

**The argument string is a filename, not the spec.** By the time `/create-spec` runs, the real
content usually already exists in the conversation above — what was wrong, the constraint named,
the option rejected and why, the sentence describing success. A spec written from the one-line
description alone discards all of it, and the founder re-types it.

Before structuring, scan the preceding conversation for:

- **The founder's own framing of the goal.** Quote it **verbatim** in Problem, attributed —
  `> "I want the thing to stop asking me which model every single time."` Your paraphrase is a
  lossy re-encoding of the only sentence in the spec that is authoritative.
- **Rejected options and the reason** → `## Alternatives Considered`.
- **Named constraints** ("don't touch the gate", "must still work offline") → `## Invariants` or
  Non-Goals, whichever they actually are.
- **Decisions already made** — do not re-ask them. Record them.
- **Anything the founder was uncertain about** → `## Open Questions`, in their words.

If the conversation is empty (a cold `/create-spec "…"` with no prior thread), say so in one
clause and work from the description. Do not invent context.

`/change-request` Step 3 does this already and is the working precedent.

---

## Workflow

1. **Worktree guard** — confirm you're on main (w0).
2. **Pipeline stamp** — set `delivery_stage` and `pipeline_ran` (below).
3. **Intent capture** — mine the preceding conversation (above).
4. **Detect type** — classify and state it.
5. **Duplicate gate** — BLOCKING, before any file is written. Both greps, both verdicts (Step 3).
6. **P-number** — `./scripts/next-p-number.sh`.
7. **Rank** — `./scripts/next-rank.sh {status}` (per-column, never global).
8. **Structure** — skeleton + expansion modules for the type.
9. **Execution recommendation** — stamp `exec_model` / `exec_effort` (below).
10. **Self-review** — quality gates.
11. **Create file** — `features/p{N}_{slug}.md`.
12. **Report** — path, type, next step, execution call.

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

#### The `decisions.md` grep does TWO jobs. Run it twice.

The verdict above answers *does a spec for this already exist*. It does **not** answer *has a
ruling already been made that constrains this work* — and `features.md:55-74` requires harvesting
those constraining rulings into the new spec. Same axis (`features.md` is explicit: grep the
**subject**, not the P-number), different question, different report.

Job 2 widens the term list to the **concrete nouns the work will touch** — the file, table, column,
script, function or service names in your own draft Solution. Those are derivable: read the draft,
list its proper nouns, grep each. Do **not** grep decision vocabulary (`MUST`, `never`, `rejected`)
— against a file this size those match thousands of lines and return noise, not rulings.

```bash
grep -rn "{subject terms}" docs/decisions.md | head -10   # job 1 — duplicate verdict
grep -rn "{file|table|script|function names from your Solution}" docs/decisions.md | head -20   # job 2 — rulings
```

Report job 2 separately: **`RULINGS: <n> found — <one line each>`** or **`RULINGS: none — searched
"<terms>"`**. Anything found goes into the new spec's `## Invariants` or `## Risks`, cited by date.

**Observed 2026-08-26, this session — not a logged incident:** the run of this gate that filed
P1158 searched subject terms, returned `NONE`, and harvested no rulings; that spec carries none.
One grep reporting one verdict is how that happens.

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
exec_model: opus | sonnet | haiku | gemini      # recommended model to IMPLEMENT this — see below
exec_effort: low | medium | high | xhigh
driver: heuristic | anomaly    # OPTIONAL — see below; omit if genuinely unclear
---
```

### `exec_model` / `exec_effort` — the execution recommendation

**Who should DO the work** — distinct from `drafted_by`, which records who wrote the spec. This
answers the "which model and effort?" question in the artifact, at the moment the work-type
classification that determines it has just been computed. Put the reason in the handoff line, not
the frontmatter:

> `Execution: sonnet, medium — mechanical multi-file edit, spec is prescriptive.`

**`~/.claude/commands/recommend-model-effort.md` owns the routing logic — do not restate its lanes
here or in the spec.** Copies drift, and a stale routing table is invisible until it has been wrong
for weeks. Read it, apply it, stamp the result.

**A snapshot, not a contract.** Nothing gates on it; no downstream skill must obey it. If the spec
has sat in `backlog` for weeks, re-run the call rather than trust the stamp. Omit both fields
rather than guess when the work type is unclear.

**The trap:** a detailed spec does not mean mechanical work. Route on whether the work is
*mechanical* (wiring, renames, convergent edits) or *judgment-bearing* (ambiguity, novel
trade-offs, anything where being wrong costs a day) — never on how thick the spec is.

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

Before creating the file, verify. **Every gate here checks something the section descriptions above
do not already say** — a checklist that restates its own headings measures nothing.

- [ ] **`[FOUNDER DECISION: ...]` marker present on every founder call.** CTA text, pricing, tone,
      naming, value propositions — CLAUDE.md mandates the marker and a spec that invents product
      copy otherwise passes clean. If the spec names *zero* founder decisions, confirm that is
      genuinely true rather than an omission.
- [ ] **No claim about existing code, schema or shipped specs that you did not run a command
      against.** Absence claims ("there is no X", "nothing handles this") are the highest-risk and
      cheapest to check — grep them. An unverifiable claim is written as UNVERIFIED, never as fact.
- [ ] **Nothing in the spec was invented to fill a section.** If a risk, a non-goal or a criterion
      exists because the template asked for one, delete it. A throwaway constraint on every spec
      trains the next agent to skim the real ones.
- [ ] **Done-When items are observable without reading the code** — and, for feature specs,
      Acceptance Criteria are observable by a *person using the product*.
- [ ] **Risks carry `MITIGATE | ACCEPT | DEFER`** labels.
- [ ] **Both `decisions.md` verdicts appear in the output** — `DUPLICATE|RELATED|NONE` *and*
      `RULINGS:`, each naming the terms it searched. An unstated search cannot be judged.
- [ ] **Frontmatter carries every field required by `.claude/rules/features.md`** — that file owns
      the contract; check against it, not from memory.
- [ ] **P-number from the script**, not manual computation, and path is `features/p{N}_{slug}.md`.

**If any gate fails:** Fix before writing the file.

**No gate fires on a missing optional section.** Invariants, Decision Criteria, Alternatives
Considered and the rest are absent-by-default. Do not add a check that turns an optional field into
ceremony on a two-line spec.

---

## Example: a spec with real ambiguity

One example, deliberately hard: contested scope, a live invariant, and a decision the agent must
refuse to make. The two short low-stakes examples that used to sit here modelled the shape of spec
that needs the least help. Frontmatter carries **every** required field — models copy examples over
prose.

```markdown
---
status: week
type: task
rank: 71.0
workstream: infrastructure
created_date: '2026-08-26'
tags: [auth, sessions, security]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P812: Session expiry is enforced client-side only

## Problem

**Situation:** `useSession` clears local state after 24h of inactivity and redirects to /login.
**Complication:** The Supabase JWT itself is valid for 7 days. A user who never opens the app —
or anyone holding a copied token — retains API access for six days after the UI says logged out.
Surfaced when a founder's own token from the previous week still returned rows via curl.
**Question:** Do we shorten the token lifetime, add server-side revocation, or both?

> Founder framing, verbatim: "I don't want to discover that logging out doesn't actually log you out."

## Appetite

Blast radius: high — every authenticated request. Reversibility: medium. Decision density: one
real founder call (re-auth frequency users will tolerate).

## Invariants

- Any path that treats a request as authenticated MUST consult server-side state, not only the
  token's own claims. Client-side expiry is a UX affordance; it is not a security boundary.
- Revocation must fail **closed** — an unreachable revocation store denies, never allows.

## Solution

Shorten the access-token lifetime and add refresh-token revocation on logout.

[FOUNDER DECISION: how often may a normally-active user be forced to re-authenticate? This sets
the token lifetime and is a product-feel call, not a technical one. Options discussed: 1h with
silent refresh, 24h, 7d unchanged.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Shorter lifetime increases refresh traffic | ACCEPT | Refresh is cheap; measure before tuning |
| Revocation store becomes an availability dependency | MITIGATE | Fail closed, with a health check |
| Existing sessions invalidated on deploy | DEFER | Needs the founder decision above first |

**Non-Goals**
- Do NOT add device management or a session list — separate product surface.
- Do NOT change RLS policies; this is token lifetime and revocation only.

## Done-When

- [ ] A token from a logged-out session is rejected by the REST API, verified by curl
- [ ] Revocation store unreachable → requests are denied, verified by simulating the outage
- [ ] Founder decision on re-auth frequency recorded in the spec

## Open Questions

1. Does anything outside the app hold long-lived tokens (scripts, cron, the kanban)? Not assessed.
```

---

## After File Creation

Tell the user:

```
Created: features/p{N}_{slug}.md
Type: {work type}
Execution: {exec_model}, {exec_effort} — {one clause of why}
Next step: /challenge-prd (if feature) or proceed to /architect or /dev
```

The execution line belongs in the report, not only in the frontmatter — it is the answer to the
question that otherwise gets asked by hand on the next turn.

Tell the user: "Hit the Refresh button in the kanban to see the new card (http://localhost:9050 → Refresh)."

---

## Related Skills

- `/challenge-prd` — adversarial review (includes lean check for features)
- `/product-owner` — enriches with JTBD, user stories, success metrics (features only, future)
- `/create-bug` — symptom-first bug spec (separate skill, not replaced)
- `/change-request` — predecessor-linked redesign spec (separate skill, not replaced)
- `/architect` → `/generate-tests` → `/dev` — downstream implementation pipeline
