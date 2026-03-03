---
name: falsify
description: Test proposals against first principles before acting. Spawns root-cause, critique, falsification, creative, and scoring agents in sequence — surfaces what actually holds and finds better fixes for what doesn't.
when_to_use: "When you have proposals to test before acting — from /kdd meta-reflection, /dev decisions, design trade-offs, or any claim. Run before implementing a process change, rule addition, or architectural decision."
version: 1.0.0
---

# /falsify

Test proposals against first principles before acting on them.

**Your Role:** You are not here to defend proposals. You are here to break them.
A proposal that survives this process earned its implementation.
A proposal that fails this process saved you from the wrong fix.

> "The goal is not to falsify everything — it's to find what's actually true." — Popper

---

## When to Use This vs Other Skills

| Situation | Skill |
|---|---|
| You have proposals from /kdd meta-reflection | `/falsify` ← here |
| You're deciding between two approaches in /dev | `/falsify` ← here |
| You want to stress-test a UX design | `/falsify` (after `/ascii-flows` to visualize first) |
| You want to generate UX alternatives visually | `/ascii-flows` |
| You already know the right path, need trade-off framing | `/slava:build:simplify` |
| You want to challenge scope before building | `/slava:think:lean` |

---

## Input Handling

```
If argument is a file path → read the file
If argument is a quoted string → use as proposals
If no argument → use proposals from the most recent /kdd meta-reflection
                 or design decisions in the current conversation
```

**Works for:** process proposals, code decisions, UX designs, product hypotheses.

**Note for UX inputs:** Run `/ascii-flows` first to make the design concrete. Feed the diagram into /falsify as the input. Visual proposals are hard to falsify in the abstract.

---

## Process

### Phase 0: Parse + Number Proposals

Extract all proposals from the input as a numbered list. Determine input type:
- `process` — workflow changes, skill rules, CLAUDE.md additions
- `code` — implementation decisions, patterns, architecture
- `ux` — interface/flow designs
- `hypothesis` — product bets, business assumptions

Announce: "Found {N} proposals. Input type: {type}. Starting root-cause analysis."

---

### Phase 1: Root Cause (5-why agent)

**Spawn before critique or falsification — this is not optional.**

Falsification without root cause tests "does this prevent the symptom?" — which can give false positives. The root cause is the input the falsification agent needs.

**Agent prompt:**
> "For each proposal below, find the actual root cause of the problem it claims to fix.
> Apply 5-why reasoning: keep asking 'why did this happen?' until you reach something structural.
> Read any relevant code files to verify your answer.
> Return: one root cause per proposal (1-3 sentences). Be concrete — name the file, function, or missing mechanism.
> Do NOT propose fixes. Return root causes only."

---

### Phase 2: Critique + Falsification (parallel)

Spawn TWO agents simultaneously with the proposals AND the root causes from Phase 1.

**Critique agent** — principle-level, NO file reading required:
> "Argue against each proposal. For each, answer:
> (1) Is this overkill — does an existing mechanism already handle it?
> (2) Is this the wrong layer — should it be fixed elsewhere (e.g., postinstall not skill pre-flight)?
> (3) Does it address the root cause found in Phase 1, or a symptom?
> (4) Would a disciplined agent do this naturally without a rule?
> (5) Does it introduce new friction worse than the problem?
> Verdict per proposal: Worth / Overkill / Misdirected / Marginal.
> Be harsh. Surface issues the proposer missed. No solutions — only critique."

**Falsification agent** — evidence-level, MUST read relevant code and context:
> "For each proposal, given its root cause: simulate the failure mode.
> Apply the proposed fix. Simulate again. Did the fix actually prevent it?
> Read actual files to verify — do not reason from assumptions.
> Verdict per proposal: SURVIVES / FAILS + evidence (cite the file/line/mechanism that confirms it).
> Do NOT propose alternatives. Do NOT edit files. Return analysis only."

---

### Phase 3: Synthesize

After both agents return, triage each proposal:

| Critique | Falsification | Outcome |
|----------|--------------|---------|
| ✓ Worth | ✓ SURVIVES | → Phase 4 (creative alternatives) |
| ✓ Worth | ✗ FAILS | → Extract better fix, skip creative |
| ✗ Overkill/Misdirected | ✗ FAILS | → Better fix from falsification (if any), done |
| ✗ Overkill/Misdirected | ✓ SURVIVES | → Flag tension, user decides |

**If no proposals survive → output better fixes and skip to Verdict. Do not run Phase 4 for proposals with no surviving logic.**

---

### Phase 4: Creative (only if ≥1 proposal survived Phase 3)

#### Step 4a — Scoring criteria agent (runs FIRST)

Define "good" before brainstorming. Criteria defined post-hoc bias the scoring.

**Agent prompt:**
> "Given this root cause and the surviving proposal(s), define a scoring rubric.
> Return 4-6 criteria with weights (HIGH/MEDIUM/LOW). Example criteria:
> KISS (minimal complexity), MECHANICAL (prevents automatically, no future discipline needed),
> COVERAGE (fixes all paths, not just one), ROOT (addresses root cause not symptom),
> FRICTION (adds ≤ existing friction to happy path), REVERSIBLE (easy to undo).
> Tailor criteria to the input type ({type}). Return as a weighted table."

#### Step 4b — Creative agents (2-3 in parallel)

Each agent gets: the root cause, the surviving proposal, and the scoring criteria.

**Agent count:**
- 1 surviving proposal → 2 creative agents (15 proposals each = 30 total)
- 2+ surviving proposals → 3 creative agents (10 proposals each = 30 total)

**Agent prompt:**
> "Generate {N} alternative approaches to address this root cause: {root_cause}.
> Surviving proposal for comparison: {proposal}.
> Scoring criteria: {criteria}.
>
> If multiple root causes exist across surviving proposals, anchor on the most
> constraining one (the one hardest to satisfy). All proposals contribute to a
> unified 30-proposal pool — the benchmarking agent picks top 5 overall.
>
> Rules:
> — The first 10 ideas are obvious. Push past them.
> — At 20-30, you'll find KISS solutions that weren't obvious at the start.
> — Do NOT filter yourself — generate all {N}, including impractical ones.
>   The scoring agent handles filtering.
> — For UX inputs: describe visual/interaction alternatives concisely.
> — Return as a numbered list. One sentence per proposal. No scoring yet."

#### Step 4c — Benchmarking agent

**Agent prompt:**
> "Apply the scoring criteria to all {~30} proposals below.
> For each criterion, score the proposal: ✓ (meets), ⚠ (partial), ✗ (fails).
> Eliminate proposals that score ✗ on any HIGH-weight criterion.
> From survivors, rank the top 5 by total weighted score.
> Also benchmark the top 5 against the original surviving proposal — does any creative
> alternative clearly dominate? Return: top 5 table + comparison vs. original."

---

### Phase 5: /simplify (if decisions remain)

If top survivors have real trade-offs (no single option clearly dominates on all criteria), output a `/simplify` block per decision:

```
**Situation:** [1 sentence — what friction this addresses and the root cause]

**Options:**
A) [option] — [tradeoffs: note KISS / coverage / friction / reversibility]
B) [option] — [tradeoffs]
C) [option, if genuine middle path exists — never invent one to fill the format]

**Recommendation:** [Option X] — prevents this by [mechanism].
Mechanical: yes/no  Main risk: [Y]

Reply: "A", "B", or "C"
```

---

## Output Template

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/falsify: {input summary, ≤10 words}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Root causes:
  P1 "{proposal title}": {actual root cause, 1-2 sentences}
  P2 "{proposal title}": {actual root cause}
  P3...PN: {same pattern — one root cause per proposal}

Phase 2 verdicts:
  P1: Critique ✗ {verdict} — {reason} | Falsification ✗ FAILS — {reason}
      Better fix: {concrete fix, file+change if applicable}
  P2: Critique ✓ {verdict} — {reason} | Falsification ✓ SURVIVES — {evidence}
  P3...PN: {same pattern — one line per proposal}

Synthesis:
  Surviving proposals: P2
  Better fixes (from failed proposals): P1 → {do X instead}
  Proposals with no action: {list}

{Note: Creative phase uses a unified 30-proposal pool across all surviving proposals.
 When 2+ proposals survive, creative agents each pick the most constraining root cause as anchor.
 Benchmarking agent scores all 30 against criteria and picks top 5 overall — not top 5 per proposal.}

─────────────────────────────────────
Creative phase (for P2)
─────────────────────────────────────
Scoring criteria:
  MECHANICAL — HIGH | KISS — HIGH | COVERAGE — MEDIUM | FRICTION — LOW

Top 5 alternatives (from 30 proposals):
  #1. {proposal} — MECH✓ KISS✓ COV✓ FRIC⚠
  #2. {proposal} — MECH✓ KISS⚠ COV✓ FRIC✓
  #3. {proposal} — ...
  vs. Original P2: {comparison — does any alternative dominate?}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERDICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apply now (no decision needed):
  ✓ P1 better fix: {action}

Decide (/simplify block follows):
  P2 → 3 options with trade-offs [/simplify block here]

Flag tension (critique says overkill, but logic survives — user decides):
  P3 → {what critique objected to} vs {why falsification says it holds}

Skip (overkill, no action):
  {list}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Self-Check Before Writing Output

- [ ] Root cause was established BEFORE critique and falsification ran (Phase 1 completed)
- [ ] Root cause agent cited specific files or code to support each finding (not inferred from memory)
- [ ] Critique agent did NOT read code — principle-level only (verify: no file paths cited in critique output)
- [ ] Falsification agent DID read relevant code — cites specific files/lines in output (not general reasoning)
- [ ] Synthesis triage table applied — no proposal skipped
- [ ] Creative phase skipped if no proposals survived Phase 3
- [ ] Scoring criteria defined BEFORE creative agents ran (not after)
- [ ] /simplify block only present when real trade-offs remain — not for clear winners
- [ ] Better fixes from failed proposals are concrete (file + change, not vague)
- [ ] Verdict section is clean — every proposal in exactly one bucket: Apply / Decide / Skip / Flag tension

---

## Quality Gates

Before finalizing the output:

1. **Root cause is structural** — not "someone forgot" but "X mechanism is missing/wrong"
2. **Falsification is evidence-based** — cites actual code/files, not general reasoning
3. **Creative proposals push past the obvious** — if all 30 are variations of the original, the agents didn't push far enough (re-run with explicit instruction to explore orthogonal approaches)
4. **Benchmarking eliminated weak proposals** — top 5 should noticeably outperform the bottom 25
5. **Verdict has no ambiguity** — every proposal ends up in exactly one of: Apply / Decide / Skip / Flag tension

---

## Related Skills

- `/slava:build:simplify` — for trade-off decisions that survive /falsify (Phase 5 feeds into this)
- `/slava:think:lean` — challenge scope/MVP before building; /falsify challenges proposals after thinking
- `/slava:build:ascii-flows` — visualize UX flows before falsifying them; run before /falsify for UX inputs
- `/slava:maintain:kdd` — meta-reflection produces proposals; /falsify tests them before acting
- `/slava:think:innovate` — pure divergent brainstorm with no falsification gate; /falsify adds rigor
