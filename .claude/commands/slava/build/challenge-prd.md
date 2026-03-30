---
name: challenge-prd
description: >
  Adversarial stress-test of a PRD immediately after /create-prd. Surfaces flawed assumptions,
  missing edge cases, strategic misalignment, and logic gaps — before any design or architecture
  work begins. Seven challenge dimensions, BLOCK/WARN/NOTE severity output.
when_to_use: >
  Right after /create-prd produces business requirements, before /ux or /architect.
  Also useful when revisiting an existing PRD that feels incomplete or when starting
  implementation on an older spec whose assumptions may have shifted.
version: 1.0.0
---

# /challenge-prd

**Adversarial stress-test of business requirements — find the fatal flaw before design begins.**

Runs immediately after `/create-prd`. Reads the PRD and project strategy docs, then systematically
tries to break the requirements across seven dimensions. Returns structured findings that must be
resolved before proceeding to `/ux` or `/architect`.

**Announce at start:** "I'm using the /challenge-prd skill to stress-test the business requirements."

---

## Usage

```bash
/challenge-prd features/pN_feature.md
```

**Examples:**
- `/challenge-prd features/p511_guest_user_flow.md`
- `/challenge-prd features/p142_csv_export.md`

**Run after:** `/create-prd` (business requirements exist)
**Run before:** `/ux` (if UI) or `/architect` (if backend)

---

## What This Skill Does

Reads the PRD's business requirements layer and stress-tests it against seven dimensions derived
from pre-mortem analysis, assumption mapping, JTBD validation, and lean methodology. The stance
is **adversarial** — the agent tries to find flaws, not validate quality.

**Core principle:** Operate on the **assumption layer** underneath requirements, not the
requirements themselves. The requirements are rarely wrong in their own terms — the unstated
beliefs underneath them are where real defects hide.

**Constraint origin rule:** Every stated constraint in the spec must be tagged with its origin:
- `[user-stated]` — the user explicitly chose this constraint in conversation
- `[copied from PX]` — inherited from a parent or related spec
- `[inferred]` — the spec author assumed this without explicit evidence

Constraints tagged `[copied]` or `[inferred]` get automatic skepticism: generate one counterexample
where violating the constraint would be beneficial. If the counterexample is plausible, flag for review.
`[user-stated]` constraints get lighter scrutiny (user had context the agent lacks).

**This is NOT a spec quality audit** (that's `/spec-review`, which runs later on the full spec).
This is a business logic and strategic challenge — "should we build this, and have we thought
it through?"

---

## The Seven Challenge Dimensions

### 1. Strategic Fit — "Does this belong in the product right now?"

Read hypotheses.md for relevant hypothesis context and the lean canvas. Check:
- Does this PRD map to at least one lean canvas element (Problem, Solution, Key Metrics, Unfair Advantage)?
- Does it advance an **active** hypothesis, or does it serve a blocked/parked one?
- Is this the highest-leverage thing to build right now?
- Does it reinforce or dilute the unique value proposition?

**Key question:** "By building this, we are choosing NOT to build [alternatives]. Is that the right trade-off given our active hypotheses?"

### 2. Assumption Validity — "What beliefs, if wrong, invalidate this?"

Extract every implicit and explicit assumption from the PRD. For each:
- Rate importance (how critical to success) and uncertainty (how confident are we it's true)
- High importance + high uncertainty = existential risk that must be validated or explicitly flagged

**Assumption types to hunt:**
- **Desirability** — Do users actually want this? (hides in problem statements and user stories)
- **Viability** — Does this make business sense? (hides in business requirements and success metrics)
- **Feasibility** — Can this be built as described? (hides in acceptance criteria and constraints)

**Key question:** "Which assumption, if wrong, makes this entire feature worthless?"

### 3. JTBD Integrity — "Does this solve a real job or a presumed one?"

Validate each Job to Be Done statement:
- **Too broad?** "Help me communicate better" is unfalsifiable. What's the specific trigger moment?
- **Too narrow?** Describes a feature, not a need. "Help me click the calibration button" ≠ job.
- **Solution-contaminated?** The requirement presupposes a specific implementation. Strip the solution — what's the underlying job?

**Four Forces check** (for each major user story):
- **Push** — What dissatisfaction drives users away from current behavior?
- **Pull** — What attracts them to our solution?
- **Anxiety** — What makes them nervous about our approach?
- **Inertia** — What habit must they break to adopt this?

A PRD that only addresses push and pull while ignoring anxiety and inertia will overestimate adoption.

**Key question:** "What is the user doing today instead, and why haven't they already solved this?"

### 4. Flow Completeness — "What happens when things go wrong?"

For each actor-action pair in the user stories, systematically ask:
- What if the actor has **no prior state** (first time)?
- What if the actor has **expired state** (session timeout, token refresh)?
- What if the actor **returns** (second visit — does state persist? how?)?
- What if the action **partially completes** (network drop, browser close mid-flow)?
- What if the action **conflicts with concurrent activity** (multiple tabs, race condition)?
- What if the actor **lacks permission** (auth edge case, guest vs authenticated)?
- What if the **data is invalid or missing** (empty input, malformed data)?
- What if the actor's **context changes mid-flow** (role change, subscription change)?

**Key question:** "Walk me through a returning user who had a partial session last time — what exactly happens?"

### 5. Testability — "Can every criterion be mechanically verified?"

Apply IEEE 830 filter to every acceptance criterion:
- Can you write a pass/fail test for this right now?
- Is there exactly one interpretation? (two developers reading this — would they build the same thing?)
- Are success metrics specific enough to measure? ("Improve UX" fails. "Reduce clicks from 5 to 2" passes.)
- Are there any "TBD", "as needed", "similar to X", "standard behavior" phrases?

**Key question:** "Can I write an automated test for this acceptance criterion? If not, what's ambiguous?"

### 6. Bias Exposure — "What cognitive shortcuts contaminated this?"

Check for common PRD biases (especially critical when author = reviewer):
- **Confirmation bias** — Are we only looking at evidence that supports building this?
- **Anchoring** — Are we locked onto the first solution we considered?
- **IKEA effect** — Are we overvaluing this because we already wrote the PRD?
- **Planning fallacy** — Are the outcomes realistic or optimistic?
- **Feature creep disguised as scope** — Are "nice to haves" hiding in "must haves"?

**Inversion test:** For each major requirement, ask "What would make this requirement actively harmful?"

**Key question:** "If a competitor read this PRD, what would they attack first?"

### 7. Opportunity Cost — "What are we NOT building by building this?"

- Name 2-3 alternative features or improvements that would use the same capacity
- Would any of those alternatives advance the active hypotheses more directly?
- Is there a cheaper experiment that validates the same hypothesis? (landing page, manual process, Wizard of Oz)
- Could we learn the same thing by building half?

**Key question:** "What's the riskiest assumption, and can we test it without building the full feature?"

---

## Output Format

```
## PRD Challenge: P{N} {Feature Name}

### Blocking Challenges (must resolve before proceeding):
- [BLOCK] Dimension: Description — what assumption is unverified, what flow is incomplete,
  what question is unanswered. Include the specific PRD text that triggers this finding.

### Warnings (should address, proceeding is risky):
- [WARN] Dimension: Description — what could go wrong if unaddressed

### Notes (awareness items):
- [NOTE] Dimension: Description — observation or suggestion

### Assumptions Extracted
| # | Assumption | Type | Importance | Uncertainty | Risk |
|---|------------|------|------------|-------------|------|
| 1 | Users want X | Desirability | High | High | VALIDATE |
| 2 | DB can handle Y | Feasibility | Medium | Low | DEFER to /architect |

### Hard Questions (with Resolution Options)
For each question: state the question, propose 2-3 resolution options with trade-offs, and recommend one.

1. **[Question — the one that, if answered differently, changes everything]**
   - Option A: [approach] — [trade-off]
   - Option B: [approach] — [trade-off]
   - **Recommended:** [A or B] because [reason]
2. **[Second most important]**
   - Option A: ... — ...
   - Option B: ... — ...
   - **Recommended:** ...
3. **[Third]**
   - ...

### Summary
{2-3 sentences: What's the biggest risk? What should the founder think about before proceeding?}

**Verdict:** PASS | CHALLENGE | RETHINK
```

**Verdict rules:**
- `PASS` — Zero BLOCKs. Requirements are stress-tested. Proceed to `/ux` or `/architect`.
- `CHALLENGE` — 1-3 BLOCKs that can be resolved by updating the PRD. Fix and re-run.
- `RETHINK` — Fundamental strategic or assumption issue. Step back before investing more.

---

## Context Files to Read

Before running the seven dimensions, read these project context files:

```
docs/hypotheses.md        — Active hypotheses (does this PRD test one?)
docs/lean-canvas.md       — Business model alignment
docs/decisions.md         — Past decisions (does this PRD conflict?)
docs/definitions.md       — Terminology accuracy
docs/philosophy.md        — Mission alignment
```

These provide the strategic context against which the PRD is challenged. Without them,
dimensions 1 (Strategic Fit), 3 (JTBD Integrity), and 7 (Opportunity Cost) cannot be
evaluated properly.

---

## Agent Directive

**Phase 0 — Main agent reads files before spawning** (required by subagent file-content rule)

Before spawning the subagent, the main agent MUST:
1. Read the PRD at `{spec_file}`
2. Read all five context files:
   - `docs/hypotheses.md`
   - `docs/lean-canvas.md`
   - `docs/decisions.md`
   - `docs/definitions.md`
   - `docs/philosophy.md`
3. Pass all file contents inline in the subagent prompt below

Then spawn a general-purpose agent with this directive (with file contents inlined):

```
You are a PRD Challenger. Your job is to BREAK this PRD — find the fatal flaw,
the hidden assumption, the missing edge case. You are NOT validating quality.
You are stress-testing whether this feature should be built and whether it has
been thought through.

**Stance:** Adversarial. Think like a skeptical investor, a frustrated user,
and a competing product simultaneously. Your value comes from finding problems
the author couldn't see because they wrote it.

**Context provided inline:**
- PRD content: [inlined by main agent]
- Lean canvas: [inlined by main agent]
- Hypotheses: [inlined by main agent]
- Decisions: [inlined by main agent]
- Definitions: [inlined by main agent]
- Philosophy: [inlined by main agent]

**Phase 1 — Orient (using inlined context)**

1. Identify the active P0/P1 hypotheses — every challenge in Dimension 1 is relative to these
2. Note hypothesis dependencies and blocking chains
3. Note relevant past decisions

**Phase 2 — Run the seven challenge dimensions**

Work through each dimension in order (Strategic Fit → Assumption Validity → JTBD Integrity
→ Flow Completeness → Testability → Bias Exposure → Opportunity Cost).

For each dimension:
- Apply the specific questions listed in the skill
- Quote the exact PRD text that triggers each finding
- Rate severity: BLOCK (must resolve) / WARN (should address) / NOTE (awareness)

**BLOCK threshold:** A finding is BLOCK only when:
- An unverified **desirability or viability** assumption with high importance AND high uncertainty underpins a core requirement (feasibility assumptions are WARN — they belong in `/architect`)
- A user flow has no specified behavior for a common state (first visit, return, reload, error)
- An acceptance criterion is untestable or ambiguous enough that two developers would build different things
- A past decision is directly contradicted without acknowledgment

**WARN threshold for strategic fit:** A feature that doesn't connect to an active hypothesis
is WARN, not BLOCK — legitimate incremental improvements (UX polish, stability) may not map
directly to a hypothesis but are still valid work.

**Phase 2.5 — Codebase reality check**

Search `src/` for existing implementations that overlap with what the PRD proposes. For each overlap found, flag it: "PRD proposes X, but `src/path/file.tsx` already does Y." This prevents over-design by grounding the PRD in what's already built.

**Phase 3 — Extract assumptions**

Parse the entire PRD and list every implicit and explicit assumption. For each,
rate importance (to feature success) and uncertainty (confidence it's true).
Present as a table.

**Phase 4 — Generate hard questions with resolution options**

Write 3-5 questions that, if answered differently than the PRD assumes, would
fundamentally change what should be built. For each question, propose 2-3
resolution options with concrete trade-offs, and recommend one. The founder
should review the recommendations, not sit with open-ended questions.

**Phase 5 — Synthesize**

Write a 2-3 sentence summary: What's the biggest risk? What should change?
Assign verdict: PASS / CHALLENGE / RETHINK.

**Output rules:**
- Be specific: quote exact PRD text, name the section
- Be actionable: say what needs to change or what question needs answering
- For BLOCKs/WARNs: surface the problem, do NOT propose solutions — the founder decides how to fix
- For Hard Questions: DO propose resolution options with trade-offs and a recommendation
- Do NOT challenge product direction unless it contradicts documented strategy
- Adversarial does not mean hostile — be direct and constructive, not dismissive
- If the PRD is genuinely solid, say PASS and explain why it survived the challenge
```

---

## Calibration: Depth vs Speed

**Full depth** (default — new capability, unvalidated user flow, new actor type):
Run all seven dimensions. Target: 5-10 minutes.

**Quick mode** (`/challenge-prd features/pN.md --quick` — incremental improvement, enhancing existing flow):
Run dimensions 1, 2, 4, 5 at reduced depth. Skip 3, 6, 7 unless something stands out.
Target: 3-5 minutes.

When in doubt, use full depth. The 5-minute difference is cheap insurance.

---

## Post-Resolution Writeback

After the user resolves BLOCK/WARN findings (by updating the PRD or making decisions), the main agent performs a **retirement step**:

1. **Write `## Resolved Decisions` section** to the spec (append after the last Business layer section, before any UX/Technical content). Format:
   ```markdown
   ## Resolved Decisions

   | # | Source | Finding | Resolution | Rationale |
   |---|--------|---------|-----------|-----------|
   | 1 | /challenge-prd | [BLOCK] ... | Chose Option A | [why] |
   | 2 | /challenge-prd | [WARN] ... | Accepted risk | [why] |
   ```

2. **Remove `## Open Questions for /challenge-prd`** section if it exists — the questions have been answered.

3. **Remove `## Next Steps`** if all listed steps are completed (check delivery_stage). If some steps remain actionable, leave the section.

This ensures challenge decisions persist in the spec for downstream skills to reference.

---

## What This Skill Does NOT Do

- Does not fix the PRD (surfaces problems for the founder to resolve)
- Does not evaluate spec quality across layers (that's `/spec-review`)
- Does not check technical feasibility in detail (that's `/architect`)
- Does not design UX or suggest flows (that's `/ux`)
- Does not replace the user's product judgment — challenges it constructively

---

## Examples

### Example: Guest User in /live (Flow Completeness)

PRD says: "Guest user enters name to start session"

Challenge would surface:
```
[BLOCK] Flow Completeness: "Guest user enters name to start session" — what happens on:
  - Browser reload mid-session? (Is guest state in memory only, localStorage, or server?)
  - Return visit next week? (Does the name persist? Is the user recognized?)
  - Session expiry? (Guest with no account — is their data recoverable?)
  - Transition to signup? (If guest signs up mid-session, does their session data migrate?)
  The PRD assumes guest state "just works" without specifying the persistence mechanism
  or lifecycle. Two developers would build completely different things.
```

### Example: Export CSV (Strategic Fit)

PRD says: "Enable users to export sifter responses as CSV for coach review"

Challenge might find:
```
[WARN] Strategic Fit: Active P0 hypothesis is "pairs recognize gap as costly and return."
  CSV export serves the coach segment — a blocked hypothesis. Building this now
  consumes capacity that could go toward retention validation.

[NOTE] Opportunity Cost: Could we validate coach demand with a manual export
  (founder emails CSV on request) before building self-serve?
```

---

## Related Skills

**Before this:** `/create-prd` — generates the PRD that gets challenged
**After this:** `/ux` (if UI) or `/architect` (if backend) — design begins after challenge passes

**Different purpose:**
- `/spec-review` — audits the complete spec (all layers) for internal consistency; runs much later
- `/lean` (`think/lean`) — scope challenge before PRD creation; `/challenge-prd` challenges after creation
- `/falsify` (`think/falsify`) — general-purpose proposal testing; `/challenge-prd` is PRD-specific with project context
