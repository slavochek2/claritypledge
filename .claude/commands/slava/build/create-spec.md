---
name: create-spec
description: File a spec with the 6-field skeleton (Problem, Appetite, Solution, Risks/Non-Goals, Done-When, optional Invariants) plus type-appropriate expansion modules, mining the preceding conversation for founder intent
when_to_use: "Starting any new work that needs tracking — features, infrastructure, refactors, research, migrations. Absorbs /create-prd and /quick-feature."
version: 2.1.0
---

# /create-spec

**File a structured spec from a problem description.** The 6-field skeleton — the sixth, Invariants, is optional — plus expansion modules appropriate to the work type.

> **Principle:** Every piece of non-trivial work gets a spec. The spec is a thinking tool, not a contract. Depth scales with blast radius, not work type.

**Announce at start:** "I'm using the create-spec skill to file a spec."

---

## Worktree guard

Before creating any file: `git worktree list | head -1 | awk '{print $1}'`. Compare to `pwd`. If they differ you are in a worktree — **stop immediately**:

> "Specs must be created in w0 (main). Run `cd ~/Projects/public/claritypledge` first, then re-run this skill."

---

## Quick Start

```
/create-spec "Add dark mode toggle to profile page"
/create-spec "Enforce TDD for all bug fixes by modifying /fix and /create-bug skills"
/create-spec "Research: what auth provider should we use for SSO?"
/create-spec features/p142_dark_mode.md   # Extend existing spec
```

## When to Use

✅ **Use for:** any feature, infrastructure change, refactor, research task or migration · anything needing a P-number · when `/pick-flow` says "no spec exists — create one first".

❌ **Don't:** bug fixes → `/create-bug` · redesigns of shipped features → `/change-request` · a typo or whitespace fix with zero behavioral impact → no spec.

---

## The Skeleton

Fields 1-5 regardless of work type — the minimum viable spec. Field 6, Invariants, is optional and absent by default.

### 1. Problem

What's broken, missing, or needed — and for whom.

**Complex/ambiguous — use SCQ:**
```
**Situation:** [what IS — grounded facts, ≤3 sentences]
**Complication:** [why NOW — what changed or what's failing]
**Question:** [what we're actually deciding/building]
```

**Simple/obvious — a flat statement is fine:** *"The export button on the results page doesn't work on Safari. Users see a blank download."*

**The test:** if someone reading only the Problem can't explain what needs doing and why, it isn't clear enough.

#### If the Problem names a fix, offer `/problemify` — never call it

A Problem that opens with its remedy ("X is 468 lines and half of it is redundant") has smuggled a solution in as the complaint. The barrier goes unstated and every downstream agent obeys the wrong problem.

**Offer only when BOTH hold:** (1) the Problem names a **fix** rather than a **barrier**, and (2) Appetite says blast radius is **high**, or decision density is **not low**. Then say one line and keep going:

> "The Problem here names a fix rather than a barrier, and blast radius is high — `/slava:think:problemify` would reframe it before this spec sets the premise. Say the word; otherwise I file as drafted."

**Never invoke it.** `/problemify` stops and waits for the user mid-run, so auto-calling it turns every filing into a two-round conversation. Offer, then proceed. Deliberately not wired into `/create-bug` — a bug starts from an observed symptom, so its problem is given rather than constructed. ([decisions.md](docs/decisions.md) 2026-08-26.)

### 2. Appetite

Not a time estimate. Three dimensions:

- **Blast radius** — what breaks if we get this wrong? (one component / one flow / all future work)
- **Reversibility** — how hard to undo? (git revert / migration rollback / can't undo)
- **Decision density** — how many founder decisions are needed? (zero / a few / many)

*"High blast radius (touches auth flow for all users). Medium reversibility (migration + code, but feature-flaggable). Low decision density — UX decided in P400."*

### 3. Solution / Approach

What we intend to build or investigate, at appropriate abstraction. **Implementation work:** "Solution" — concrete enough to evaluate, abstract enough to leave room for the implementing agent's judgment. **Research:** "Approach" — what to investigate and how; the solution is the deliverable, not the input.

**Don't prescribe implementation details** unless they are architectural decisions. File paths, function names and build sequences belong in `/architect`.

### 4. Risks / Non-Goals

**The highest-leverage section for AI agent implementation.**

**Risks:** what could go wrong. **Label every entry `MITIGATE | ACCEPT | DEFER`** — required by `features.md:217-221`. Without the label the next agent treats every listed risk as a requirement and builds mitigations for risks you had already decided to accept. `MITIGATE` — name what we're doing. `ACCEPT` — say why it's tolerable. `DEFER` — name what unblocks it.

| Risk | Label | Note |
|---|---|---|
| Large exports slow the browser | MITIGATE | Cap at 1000 rows, stream beyond |
| Shared corporate IPs hit the limit | ACCEPT | 100/min is generous; monitor first |

**Non-Goals:** framed as agent constraints — "Do NOT change the auth flow", "Do NOT add new database tables", "Do NOT refactor adjacent code". Agents expand scope; explicit "do not" constraints prevent this better than detailed positive requirements.

### 5. Done-When

Measurable completion signals, checkbox format `- [ ]`, each verifiable without reading the code. Observable outcomes, not implementation steps. Include regression tests where applicable.

**Done-When vs Acceptance Criteria — different questions, and which one a spec carries depends on the skill that filed it. Do not merge them.**

- **`## Done-When`** — *this piece of work is finished when.* This skill's completion field. Covers infrastructure, research and migrations, where there is no user to observe anything.
- **`## Acceptance Criteria`** — *a person using the product can observe this.* The field `/create-bug` and `/change-request` emit **instead of** Done-When, and a Feature expansion module here.

Measured across `features/` (2026-08-26): change-request specs carry AC and no Done-When without exception, as do most bug specs; most `task` specs carry Done-When and no AC; `story` specs split across all four combinations. **Neither field is universal, AC is not feature-only — the filing skill decides.**

**Both are named by the `qa` hard gate** (`features.md:24`): every box in whichever section exists must be `[x]` before `status: qa`. A spec may carry both — user-observable outcomes in AC, the rest in Done-When, never restating one in the other. Never add a section you do not intend to fill.

#### A criterion that can only be checked after deploying is a CLAUSE, never its own box

`ship-gates.sh` gate 2.5 refuses to merge while any box is unticked — and it is right to.
So a standalone `- [ ] [post-deploy] …` box is unsatisfiable by construction: it cannot be
ticked before the deploy, and the deploy cannot happen until it is ticked. The spec deadlocks,
and the only ways out are both bad — tick something untrue, or route around the gate.

**Write it the way the repo already does** (`features/done/2026-04-22/p877_profiles_directory_pii_exposure_anon_key.md`):
tick the box for what was verified *as far as it can be* pre-deploy, then name the post-deploy
re-check as a trailing clause on the same line.

```markdown
- [x] Anon read of the restricted column errors rather than returning rows — verified on **test**
      (curl + canary). `[post-deploy]` re-verify on prod once the migration applies.
```

The box means *this work is done and verified to the limit of what is checkable here*, not
*this has been observed in production*. Almost everything has a pre-deploy half worth stating:
a header change has its static diff and its canary; a migration has its test-environment run.
**If a criterion genuinely has no pre-deploy half at all, it is a deploy step — put it in
`## Pre-deploy Checklist`, which gate 3.5 owns, not in a completion section.**

Found on P1216 (2026-09-03), which wrote three standalone `[post-deploy]` boxes and deadlocked
its own ship. The P877 pattern already existed and was not written down anywhere a spec author
would look. See [decisions.md](../../../../docs/decisions.md) 2026-09-03 [process].

### 6. Invariants — optional, additive-only

Properties that must remain true **whatever the implementation does**. Omit entirely when there are none; nothing gates on its absence.

**This is not Non-Goals.** A non-goal says *don't touch that area*; an invariant says *this property must hold no matter what you touch* — it constrains the areas you DO touch. "Do NOT change the auth flow" is a non-goal. "Any code path reaching the recorder must fail closed if consent is absent" is an invariant.

Write one when the work sits on a constraint that was expensive to learn: a blocking gate with an incident behind it, an ordering requirement, a fail-closed property, a contract with another file. Mirrors `create-bug.md:189`, which calls it *a sacred section — it persists across all future rewrites*: later specs may add to it; **removing an entry requires explicit user approval, never agent judgment.**

Most specs have none. A copy tweak with an Invariants section is the ceremony this field exists to avoid.

---

## Expansion Modules

Add modules appropriate to the work type. **All optional** — if a module would be filled with "N/A", don't add it.

### Feature expansions
`## UX Notes` (states: happy path, error, empty, loading) · `## Acceptance Criteria` (business-level, checkbox, per `.claude/rules/spec-sections.md`) · `## UI Contract` (exact strings, colors, measurements).

### Infrastructure / Refactor expansions
`## Alternatives Considered` · `## Rollback Strategy`.

### Research / Investigation / Measurement expansions
`## Research Questions` (numbered, specific) · `## Decision Criteria` (**pre-registered** — see below; the one that changes the answer) · `## Time Box` · `## Deliverable` (decision doc, prototype, recommendation).

### Migration expansions
`## Migration Plan` (execution order) · `## Rollback Plan` · `## Data Integrity Check`.

### Any spec introducing a new external API key, edge function, or third-party service secret

`## Pre-deploy Checklist` — **MUST**, per `features.md:231-255`. A new key, token, **edge function** or service credential does not reach prod by being mentioned in the Solution. List where the value is set, in which environment, and who sets it.

**Nothing enforces its presence.** `ship-gates.sh` gate 3.5 checks that a checklist which *exists* has no unticked boxes, and prints `PASS: no pre-deploy checklist` when the section is absent. Omitting it ships clean — writing the section is on you.

### Pre-registered decision criteria

For research, evaluation, comparison and measurement specs, write what would settle the question *before* the investigation runs:

```markdown
## Decision Criteria

1. **Which auth provider?** → Pick the one that supports SAML *and* has a self-serve tier under
   500 users. If both qualify, pick on migration cost off Supabase Auth. If neither, we stay put.
2. **Is the retention drop real?** → Real if week-2 return rate differs by >5pp across two
   consecutive cohorts of n≥40. Below that we do not act on it.
```

`Time Box` is a **budget**, not a criterion — when to stop looking, not what counts as an answer. Without pre-registered criteria a recommendation matches whatever the researcher found first, and every finding looks like it settles the question because the bar was set after seeing it.

---

## Work Type Detection

Detect from the description. Don't ask — classify and state it.

| Signal in description | Work type | Expansions |
|----------------------|-----------|-----------|
| "add", "new", "enable", "allow users to" | Feature | UX Notes, Acceptance Criteria, UI Contract |
| "refactor", "restructure", "extract", "move to" | Refactor | Alternatives Considered |
| "skill", "process", "hook", "rule", ".claude/" | Infrastructure | Alternatives Considered, Rollback Strategy |
| "research", "investigate", "evaluate", "compare" | Research | Research Questions, Decision Criteria, Time Box, Deliverable |
| "migrate", "upgrade", "move data", "schema change" | Migration | Migration Plan, Rollback Plan, Data Integrity Check |

**State it:** "Classifying as: infrastructure (modifies skill files). Adding: Alternatives Considered, Rollback Strategy." If genuinely ambiguous, ask one question: "Is this a [type A] or [type B]? The expansions differ."

---

## Intent capture — read the conversation, not just the argument string

**The argument string is a filename, not the spec.** By the time `/create-spec` runs the real content usually exists in the conversation above — what was wrong, the constraint named, the option rejected and why, the sentence describing success. A spec written from the one-line description alone discards all of it, and the founder re-types it.

Before structuring, scan the preceding conversation for:

- **The founder's own framing of the goal** — quote it **verbatim** in Problem, attributed: `> "I want the thing to stop asking me which model every single time."` Your paraphrase is a lossy re-encoding of the only authoritative sentence in the spec.
- **Rejected options and the reason** → `## Alternatives Considered`.
- **Named constraints** ("don't touch the gate", "must still work offline") → `## Invariants` or Non-Goals, whichever they actually are.
- **Decisions already made** — do not re-ask. Record them.
- **Anything the founder was uncertain about** → `## Open Questions`, in their words.

If the conversation is empty (a cold `/create-spec "…"`), say so in one clause and work from the description. Do not invent context. `/change-request` Step 3 is the working precedent.

---

## Workflow

1. **Worktree guard** — confirm you're on main (w0).
2. **Pipeline stamp** — set `delivery_stage` and `pipeline_ran` (below).
3. **Intent capture** — mine the preceding conversation (above).
4. **Detect type** — classify and state it.
5. **Duplicate gate** — BLOCKING, before any file is written. Both greps, both verdicts (below).
6. **P-number** — `./scripts/next-p-number.sh`.
7. **Rank** — `./scripts/next-rank.sh {status}` (per-column, never global).
8. **Structure** — skeleton + expansion modules for the type.
9. **Problem framing check** — if the Problem names a fix and blast radius is high or decision density is not low, offer `/problemify` in one line and continue. Never blocking, never invoked.
10. **Execution recommendation** — stamp `exec_model` / `exec_effort` (below).
11. **Self-review** — quality gates.
12. **Create file** — `features/p{N}_{slug}.md`.
13. **Report** — path, type, next step, execution call.

### Pipeline stamp (P659)

Before any other work (after worktree guard): set `delivery_stage: create-spec` and append `create-spec` to the inline `pipeline_ran` list (`[existing, items, create-spec]`; create as `[create-spec]` if absent). Since this skill creates the file, both go in the initial frontmatter.

**Predecessor check:** if `pipeline_plan` exists, find the skill before `create-spec` in it. If that skill is not in `pipeline_ran` (exact string match) → stop: "Run `/{predecessor}` first." Skip when `pipeline_plan` is absent, when this skill is first in the plan, or when `pipeline_ran` is absent/empty and this is the first planned skill. If this skill is **not** in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## Duplicate gate — BLOCKING, runs before the file is written

> **A gate, not a courtesy search.** No spec file is created until this has run and its output has been shown. Running it after the file exists converts a free check into a retraction.

Search **three** surfaces. `decisions.md` is the one that gets skipped and the one that most often holds the answer — a defect is frequently recorded there, with a spec already filed and referenced, long before it is rediscovered:

```bash
# Use the DEFECT'S OWN VOCABULARY, not your framing of it. Two or three distinct phrasings.
grep -ril "{key concept}" features/ 2>/dev/null | head -10          # open + done specs
grep -rn  "{key concept}" docs/decisions.md 2>/dev/null | head -10  # prior decisions AND the specs they filed
grep -ril "{key concept}" src/ scripts/ 2>/dev/null | head -10      # already handled in code
```

**Search terms are where this fails.** Grep the mechanism and the symptom, not the name you just invented — a search for the label you would give the new spec finds the new spec's absence and nothing else. If the defect is "the tool skipped a file", search `skipping`, the exact output string, the function name — not "drift" or "audit".

**State a verdict out loud before writing anything:**

- `DUPLICATE: pN` — stop. Do not create a file. Add the new evidence to the existing spec and say so. A second spec for one defect splits its evidence and hides its real age.
- `RELATED: pN` — proceed, and reference it in the new spec's Related section.
- `NONE — searched: "<t1>", "<t2>", "<t3>"` — proceed. Name the terms; "I looked" is not a result.

### The `decisions.md` grep does TWO jobs. Run it twice.

The verdict above answers *does a spec for this already exist*. It does **not** answer *has a ruling already been made that constrains this work* — and `features.md:55-74` requires harvesting those rulings into the new spec. Same axis (grep the **subject**, not the P-number), different question, different report.

Job 2 widens the term list to the **concrete nouns the work will touch** — the file, table, column, script, function or service names in your own draft Solution. Read the draft, list its proper nouns, grep each. Do **not** grep decision vocabulary (`MUST`, `never`, `rejected`): against a file this size those return noise, not rulings.

```bash
grep -rn "{subject terms}" docs/decisions.md | head -10   # job 1 — duplicate verdict
grep -rn "{nouns from your Solution}" docs/decisions.md | head -20   # job 2 — rulings
```

Report job 2 separately — **`RULINGS: <n> found — <one line each>`** or **`RULINGS: none — searched "<terms>"`** — and route anything found into `## Invariants` or `## Risks`, cited by date. Observed 2026-08-26: the run that filed P1158 searched subject terms, returned `NONE`, and harvested no rulings. One grep reporting one verdict is how that happens.

**A hit in `decisions.md` outranks an empty `features/` result.** Entries routinely name a filed P-number that may sit unimplemented for weeks — its absence from your `features/` grep usually means your terms were wrong, not that it does not exist.

If existing code already handles the concept, flag it: "This may be an inline extension of existing code at [path]. Proceed with spec or handle inline?" Let the user decide.

**Why blocking:** P1154 was diagnosed, written and committed while P1042 had been open at `severity: high` since 2026-08-10 specifying the same fix in more detail. The dedupe grep ran during `/kdd`, after the commit. See [decisions.md](docs/decisions.md) 2026-08-24 "File-first, grep-second".

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
driver: heuristic | anomaly    # OPTIONAL — omit if genuinely unclear
---
```

**Type mapping:** Feature → `story` · Infrastructure, refactor, migration → `task` · Research, investigation → `comment`. **Do NOT add at creation:** `completed_at`, `date_resolved`, `flow`.

### `exec_model` / `exec_effort` — the execution recommendation

**Who should DO the work**, distinct from `drafted_by` (who wrote the spec). Answers the "which model and effort?" question inside the artifact, at the moment the work-type classification that determines it has just been computed. Put the reason in the handoff line, not the frontmatter: `Execution: sonnet, medium — mechanical multi-file edit, spec is prescriptive.`

**`~/.claude/commands/recommend-model-effort.md` owns the routing logic — do not restate its lanes here or in the spec.** Read it, apply it, stamp the result. Contract and enforcement status: `features.md:134-138` — a snapshot, never gated, re-run rather than trusted on an old spec. **The trap:** a detailed spec does not mean mechanical work. Route on whether the work is *mechanical* (wiring, renames, convergent edits) or *judgment-bearing* (ambiguity, novel trade-offs, being wrong costs a day) — never on how thick the spec is.

**`driver:`** — `heuristic` (planned work following the programme's model sequence) or `anomaly` (reactive, after something broke or was refuted). Read by `/slava:maintain:programme-health` as a ratio. **Never enforced** — omit rather than guess; a fabricated ratio is worse than a thin one. Full contract: `features.md:102-112`.

---

## Quality Gates (Self-Review)

Before creating the file, verify. **Every gate checks something the sections above do not already say** — a checklist that restates its own headings measures nothing.

- [ ] **`[FOUNDER DECISION: ...]` on every founder call** — CTA text, pricing, tone, naming, value propositions. A spec that invents product copy otherwise passes clean. *Zero* founder decisions is a claim: confirm it's true rather than an omission.
- [ ] **No claim about existing code, schema or shipped specs that you did not run a command against.** Absence claims are the highest-risk and cheapest to check — grep them. Unverifiable → write UNVERIFIED, never fact.
- [ ] **Nothing invented to fill a section.** If a risk, non-goal or criterion exists because the template asked, delete it — a throwaway constraint on every spec trains the next agent to skim the real ones.
- [ ] **Done-When items observable without reading the code**; for feature specs, Acceptance Criteria observable by a *person using the product*.
- [ ] **Risks carry `MITIGATE | ACCEPT | DEFER`.**
- [ ] **Both `decisions.md` verdicts in the output** — `DUPLICATE|RELATED|NONE` *and* `RULINGS:`, each naming its terms.
- [ ] **Frontmatter carries every field `.claude/rules/features.md` requires** — check against that file, not from memory.
- [ ] **P-number from the script**, path is `features/p{N}_{slug}.md`.

**If any gate fails:** fix before writing the file.

**No gate fires on a missing optional section.** Invariants, Decision Criteria, Alternatives Considered and the rest are absent-by-default; never add a check that turns an optional field into ceremony on a two-line spec. The `/problemify` offer is likewise not a gate.

---

## Example: a spec with real ambiguity

Deliberately hard: contested scope, a live invariant, a decision the agent must refuse to make. Frontmatter carries **every** required field — models copy examples over prose.

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

```
Created: features/p{N}_{slug}.md
Type: {work type}
Execution: {exec_model}, {exec_effort} — {one clause of why}
Next step: /challenge-prd (if feature) or proceed to /architect or /dev
```

The execution line belongs in the report, not only in the frontmatter — it is the answer to the question that otherwise gets asked by hand on the next turn. Then: "Hit the Refresh button in the kanban to see the new card (http://localhost:9050 → Refresh)."

---

## Related Skills

- `/slava:think:problemify` — reframe a Problem that named a fix. **Offered, never called** (above).
- `/challenge-prd` — adversarial review (includes lean check for features)
- `/create-bug` — symptom-first bug spec · `/change-request` — predecessor-linked redesign spec
- `/architect` → `/generate-tests` → `/dev` — downstream implementation pipeline
