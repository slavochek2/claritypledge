---
name: challenge-prd
description: >
  Adversarial stress-test of a spec immediately after /create-spec. Surfaces flawed assumptions,
  missing edge cases, strategic misalignment, and logic gaps — before any design or architecture
  work begins. Eight challenge dimensions plus command-backed verification of the spec's own
  claims about existing code. BLOCK/WARN/NOTE severity output.
when_to_use: >
  Right after /create-spec produces the skeleton, before /ux or /architect.
  Also useful when revisiting an existing spec that feels incomplete or when starting
  implementation on an older spec whose assumptions may have shifted.
version: 2.1.0
---

# /challenge-prd

**Adversarial stress-test of a spec — find the fatal flaw before design begins.**

Runs immediately after `/create-spec`. Reads the spec and project strategy docs, then systematically
tries to break it across eight dimensions. Returns structured findings that must be
resolved before proceeding to `/ux` or `/architect`.

**Announce at start:** "I'm using the /challenge-prd skill to stress-test this spec."

---

## Usage

```bash
/challenge-prd features/pN_feature.md
```

**Examples:**
- `/challenge-prd features/p511_guest_user_flow.md`
- `/challenge-prd features/p142_csv_export.md`

**Run after:** `/create-spec` (skeleton exists)
**Run before:** `/ux` (if UI) or `/architect` (if backend)

---

## What This Skill Does

Reads the spec's skeleton and stress-tests it against eight dimensions derived from pre-mortem
analysis, assumption mapping, and lean methodology. The stance is **adversarial** — the agent
tries to find flaws, not validate quality.

**Core principle:** Operate on the **assumption layer** underneath the spec, not the spec itself.
The requirements are rarely wrong in their own terms — the unstated beliefs underneath them are
where real defects hide.

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

## The Eight Challenge Dimensions

### 1. Strategic Fit — "Does this belong in the product right now?"

Read hypotheses.md for relevant hypothesis context and the lean canvas. Check:
- Does this spec map to at least one lean canvas element (Problem, Solution, Key Metrics, Unfair Advantage)?
- Does it advance an **active** hypothesis, or does it serve a blocked/parked one?
- Is this the highest-leverage thing to build right now?
- Does it reinforce or dilute the unique value proposition?

**Key question:** "By building this, we are choosing NOT to build [alternatives]. Is that the right trade-off given our active hypotheses?"

### 2. Assumption Validity — "What beliefs, if wrong, invalidate this?"

Extract every implicit and explicit assumption from the spec. For each:
- Rate importance (how critical to success) and uncertainty (how confident are we it's true)
- High importance + high uncertainty = existential risk that must be validated or explicitly flagged

**Assumption types to hunt:**
- **Desirability** — Do users actually want this? (hides in problem statements)
- **Viability** — Does this make business sense? (hides in appetite and done-when criteria)
- **Feasibility** — Can this be built as described? (hides in solution and constraints)

**Key question:** "Which assumption, if wrong, makes this entire feature worthless?"

### 3. Problem Clarity — "Would someone outside this conversation understand it?"

Evaluate the `## Problem` section:
- **SCQ completeness** (if used): Is the Situation grounded in observable facts? Does the Complication name a specific tension? Does the Question follow from the complication?
- **Flat statement** (if used): Is it falsifiable? Could you point to evidence that the problem exists?
- **Audience test:** Would a developer with zero context on this conversation understand what's broken or missing?
- **Problem vs solution:** Does the problem statement describe a need, or does it smuggle in a specific implementation?

**Key question:** "If I showed only the Problem section to someone who wasn't in the conversation, would they understand what needs fixing and why it matters?"

### 4. Appetite Calibration — "Does blast radius match solution size?"

Evaluate the `## Appetite` section:
- **Blast radius honesty:** Does the stated blast radius match what the solution actually touches? (A "low blast radius" claim on something touching auth, DB schema, and 3 UI flows is suspect.)
- **Reversibility claim:** Is the reversibility assessment accurate? (Git-revertable skill files ≠ git-revertable DB migrations.)
- **Decision density:** Are there genuinely few decisions, or are hard calls being deferred to implementation?
- **Proportionality:** Is the solution sized to the problem? A 15-file refactor for a 2-line behavioral change signals over-engineering.

**Key question:** "If this goes wrong, how hard is it to undo — and does the spec honestly acknowledge that?"

### 5. Non-Goals Quality — "Are constraints actually constraining, or obvious?"

Evaluate `## Risks / Non-Goals`:
- **Obvious non-goals:** "Do NOT rewrite the entire codebase" adds no information. Good non-goals prevent specific, tempting scope expansions.
- **Missing non-goals:** What adjacent work would a reasonable agent include that should be explicitly excluded?
- **Non-goal as deferral:** "Do NOT build X in this spec" — is X genuinely out of scope, or being deferred because it's hard? If deferred, the spec should say when it gets addressed.
- **Risk coverage:** Are risks that could actually happen listed, or only theoretical ones?

**Key question:** "Name a specific thing an agent might build during implementation that this spec should explicitly exclude but doesn't."

### 6. Testability — "Can every criterion be mechanically verified?"

Apply IEEE 830 filter to every done-when criterion and acceptance criterion:
- Can you write a pass/fail test for this right now?
- Is there exactly one interpretation? (two developers reading this — would they build the same thing?)
- Are success metrics specific enough to measure? ("Improve UX" fails. "Reduce clicks from 5 to 2" passes.)
- Are there any "TBD", "as needed", "similar to X", "standard behavior" phrases?

**Key question:** "Can I write an automated test for this criterion? If not, what's ambiguous?"

### 7. Bias Exposure — "What cognitive shortcuts contaminated this?"

Check for common spec biases (especially critical when author = reviewer):
- **Confirmation bias** — Are we only looking at evidence that supports building this?
- **Anchoring** — Are we locked onto the first solution we considered?
- **IKEA effect** — Are we overvaluing this because we already wrote the spec?
- **Planning fallacy** — Are the outcomes realistic or optimistic?
- **Feature creep disguised as scope** — Are "nice to haves" hiding in "must haves"?

**Inversion test:** For each major requirement, ask "What would make this requirement actively harmful?"

**Key question:** "If a competitor read this spec, what would they attack first?"

### 8. Opportunity Cost — "What are we NOT building by building this?"

- Name 2-3 alternative features or improvements that would use the same capacity
- Would any of those alternatives advance the active hypotheses more directly?
- Is there a cheaper experiment that validates the same hypothesis? (landing page, manual process, Wizard of Oz)
- Could we learn the same thing by building half?

**Key question:** "What's the riskiest assumption, and can we test it without building the full feature?"

---

## Output Format

```
## Spec Challenge: P{N} {Feature Name}

### Blocking Challenges (must resolve before proceeding):
- [BLOCK] Dimension: Description — what assumption is unverified, what flow is incomplete,
  what question is unanswered. Include the specific spec text that triggers this finding.

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
- `CHALLENGE` — 1-3 BLOCKs that can be resolved by updating the spec. Fix and re-run.
- `RETHINK` — Fundamental strategic or assumption issue. Step back before investing more.

---

## Pipeline stamp (P659)

Before any other work in this skill:
1. Read spec frontmatter
2. Set `delivery_stage: challenge-prd`
3. Append `challenge-prd` to `pipeline_ran` inline list. Edit pattern: match `pipeline_ran: [existing, items]`, replace with `pipeline_ran: [existing, items, challenge-prd]`. If `pipeline_ran` doesn't exist, add `pipeline_ran: [challenge-prd]`. Always inline format.
4. **Predecessor check:** If `pipeline_plan` exists, find the skill before `challenge-prd` in the plan. If that skill is NOT in `pipeline_ran` (exact match) → stop: "Run `/{predecessor}` first." Skip check if: (a) `pipeline_plan` absent, (b) this skill is first in plan, (c) `pipeline_ran` absent/empty and this is first planned skill.
5. If this skill is NOT in `pipeline_plan` → warn: "This skill wasn't in the planned flow. Proceed anyway?"

---

## Context Files to Read

Before running the eight dimensions, read these project context files:

```
docs/hypotheses.md        — Active hypotheses (does this spec test one?)
docs/lean-canvas.md       — Business model alignment
docs/decisions.md         — Past decisions (does this spec conflict?)
docs/definitions.md       — Terminology accuracy
docs/philosophy.md        — Mission alignment
```

These provide the strategic context against which the spec is challenged. Without them,
dimensions 1 (Strategic Fit), 2 (Assumption Validity), and 8 (Opportunity Cost) cannot be
evaluated properly.

---

## Agent Directive

**Phase 0 — Main agent prepares the challenger's inputs**

Subagents **can** read from disk. The claim that they cannot was measured false on 2026-07-30
(`.claude/rules/skills.md` — "Subagents CAN read from disk"). Choose inline-vs-path **by size**,
not by capability:

1. **Inline the spec.** Read `{spec_file}` and pass its contents. It is small, and the challenger
   must not mis-locate the artifact it is attacking.
2. **Pass paths, not contents, for the strategy docs.** `docs/decisions.md` alone is ~18k lines;
   inlining the five docs means ~21k lines, which no prompt carries without lossy summarising —
   and the summary silently strips the challenger's evidence base while the output still reads
   authoritative.
   - `docs/hypotheses.md` · `docs/lean-canvas.md` · `docs/decisions.md` · `docs/definitions.md` ·
     `docs/philosophy.md`
3. **Name the search terms.** List the spec's key concepts so the challenger greps those docs
   rather than reading them end to end.

Then spawn a general-purpose agent with this directive. **Model:** `sonnet` by default; use the
reasoning tier when the spec touches prod writes, a DB migration, or generated-column semantics.

```
You are a Spec Challenger. Your job is to BREAK this spec — find the fatal flaw,
the hidden assumption, the missing edge case. You are NOT validating quality.
You are stress-testing whether this should be built and whether it has
been thought through.

**Stance:** Adversarial. Think like a skeptical investor, a frustrated user,
and a competing product simultaneously. Your value comes from finding problems
the author couldn't see because they wrote it.

**Context provided:**
- Spec content: [inlined by main agent]
- Strategy docs: [paths + search terms passed by main agent — read them yourself, targeted by
  the search terms; do not assume their contents]

**Phase 1 — Orient (using inlined context)**

1. Identify the active P0/P1 hypotheses — every challenge in Dimension 1 is relative to these
2. Note hypothesis dependencies and blocking chains
3. Note relevant past decisions

**Phase 2 — Run the eight challenge dimensions**

Work through each dimension in order (Strategic Fit → Assumption Validity → Problem Clarity
→ Appetite Calibration → Non-Goals Quality → Testability → Bias Exposure → Opportunity Cost).

For each dimension:
- Apply the specific questions listed in the skill
- Quote the exact spec text that triggers each finding
- Rate severity: BLOCK (must resolve) / WARN (should address) / NOTE (awareness)

**BLOCK threshold:** A finding is BLOCK only when:
- An unverified **desirability or viability** assumption with high importance AND high uncertainty underpins a core requirement (feasibility assumptions are WARN — they belong in `/architect`)
- The Problem section is unintelligible to someone outside the conversation
- A done-when criterion is untestable or ambiguous enough that two developers would build different things
- A past decision is directly contradicted without acknowledgment

**WARN threshold for strategic fit:** A feature that doesn't connect to an active hypothesis
is WARN, not BLOCK — legitimate incremental improvements (UX polish, stability) may not map
directly to a hypothesis but are still valid work.

**Phase 2.5 — Codebase reality check, and verify the spec's own claims**

Two jobs. Both are command-backed — quote the command and its output, never the inference.

1. **Overlap.** Search `src/`, `supabase/migrations/` and `features/` for existing implementations
   that overlap what the spec proposes. Flag each: "Spec proposes X, but `src/path/file.tsx`
   already does Y." This grounds the spec in what is already built and prevents over-design.

2. **Claim verification (`epistemic.md` gate 9).** Every assertion the spec makes *about existing
   code, schema, or shipped specs* — "X already does Y", "there is no Z", "column C is a
   placeholder" — gets a command run against it. A claim you cannot run a command against is
   reported **UNVERIFIED**; it is never reported as confirmed.

   **Absence claims are the highest-risk class and the cheapest to check** — grep those first.
   A spec that cites a real file but draws a false conclusion from it survives every other
   dimension in this skill; this is the only one that catches it. Report a false claim as
   `[BLOCK]` regardless of which dimension it sits under.

3. **A spec's reading of a quoted primary source is a claim too — re-read the quote.** When a
   spec quotes a founder report, a transcript, or a user's words and *then* interprets them
   (a causes table, a "what they mean is", a restated Problem), the interpretation is an
   assertion and the quote is the artifact. Read the quote on its own, without the surrounding
   reading, and state whether it actually supports the interpretation. Divergence is `[BLOCK]`.

   Unlike job 2 this needs no command — the source is in the file. That is exactly why it gets
   skipped: nothing fails, nothing greps empty, and the spec reads as coherent because the
   interpretation is internally consistent with everything downstream of it. **Reading the spec
   completely does not catch this** — both halves get read; what is missing is precedence
   between them.

   P1240 (2026-09-04): the spec quoted the founder describing a signed-in person who "clicks on
   some kind of a link or something or opens a new tab" and loses their session, then built a
   causes table treating that as a possible *login-link* failure. It meant an ordinary public
   link. Two sessions went into investigating authentication before the founder said so; the
   quote had been sitting in the spec the whole time and is unambiguous read cold.

**Phase 3 — Extract assumptions**

Parse the entire spec and list every implicit and explicit assumption. For each,
rate importance (to feature success) and uncertainty (confidence it's true).
Present as a table.

**Phase 4 — Generate hard questions with resolution options**

Write 3-5 questions that, if answered differently than the spec assumes, would
fundamentally change what should be built. For each question, propose 2-3
resolution options with concrete trade-offs, and recommend one. The founder
should review the recommendations, not sit with open-ended questions.

**Phase 5 — Synthesize**

Write a 2-3 sentence summary: What's the biggest risk? What should change?
Assign verdict: PASS / CHALLENGE / RETHINK.

**Output rules:**
- Be specific: quote exact spec text, name the section
- Be actionable: say what needs to change or what question needs answering
- For BLOCKs/WARNs: surface the problem, do NOT propose solutions — the founder decides how to fix
- For Hard Questions: DO propose resolution options with trade-offs and a recommendation
- Do NOT challenge product direction unless it contradicts documented strategy
- Adversarial does not mean hostile — be direct and constructive, not dismissive
- If the spec is genuinely solid, say PASS and explain why it survived the challenge
```

---

## Calibration: Depth

**Full depth** (default — new capability, unvalidated user flow, new actor type, prod writes, or
a schema change): run all eight dimensions.

**Reduced depth** (incremental improvement to an existing flow): run dimensions 1, 2, 6, 7. Skip
3, 4, 5, 8 unless something stands out.

**Auto-detected, never a flag** (`.claude/rules/skills.md` — "No Flags — Skills Auto-Detect").
Reduced depth applies only when the spec's `## Appetite` states low blast radius **and** high
reversibility **and** the Solution introduces no schema change and no prod write. Any signal
missing or conflicting → full depth.

Phase 2.5 claim verification runs at **both** depths. It is never skipped.

---

## Post-Resolution Writeback

After the user resolves BLOCK/WARN findings (by updating the spec or making decisions), the main agent performs a **retirement step**:

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

- Does not fix the spec (surfaces problems for the founder to resolve)
- Does not evaluate spec quality across layers (that's `/spec-review`)
- Does not check technical feasibility in detail (that's `/architect`)
- Does not design UX or suggest flows (that's `/ux`)
- Does not replace the user's product judgment — challenges it constructively

---

## Examples

### Example: Guest User in /live (Problem Clarity)

Spec says: "Guest user enters name to start session"

Challenge would surface:
```
[BLOCK] Problem Clarity: "Guest user enters name to start session" — what happens on:
  - Browser reload mid-session? (Is guest state in memory only, localStorage, or server?)
  - Return visit next week? (Does the name persist? Is the user recognized?)
  - Session expiry? (Guest with no account — is their data recoverable?)
  - Transition to signup? (If guest signs up mid-session, does their session data migrate?)
  The spec assumes guest state "just works" without specifying the persistence mechanism
  or lifecycle. Two developers would build completely different things.
```

### Example: Export CSV (Strategic Fit)

Spec says: "Enable users to export sifter responses as CSV for coach review"

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

**Before this:** `/create-spec` — generates the spec skeleton that gets challenged
**After this:** `/ux` (if UI) or `/architect` (if backend) — design begins after challenge passes

**Different purpose:**
- `/spec-review` — audits the complete spec (all layers) for internal consistency; runs much later
- `/lean` (`think/lean`) — scope challenge before spec creation; `/challenge-prd` challenges after creation
- `/falsify` (`think/falsify`) — general-purpose proposal testing; `/challenge-prd` is spec-specific with project context
