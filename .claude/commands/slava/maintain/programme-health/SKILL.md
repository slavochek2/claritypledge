---
name: programme-health
description: Judge whether the research programme is progressive, stagnating, or degenerating — one verdict, one recommendation, from the docs alone. Reads research-programme.md + hypotheses.md + recent decisions.md.
when_to_use: "Auto-invoked by /monthly. Also run after any transform-trigger fires, after any stopping-rule clause trips, and before any further wedge re-cut. NOT a strategy-doc editor (that's /docs-strategy-update) and NOT a decision log (that's /kdd) — this skill writes nothing."
version: 1.0.0
---

# /slava:maintain:programme-health

> Falsified-per-unit-time measures **activity**. This skill measures **progress**: are corroborated novel predictions accumulating, or is each successor framing only accommodating the anomaly that killed its predecessor?

**Announce at start:** "Running /programme-health."

Reads [docs/research-programme.md](../../../../../docs/research-programme.md), [docs/hypotheses.md](../../../../../docs/hypotheses.md), and recent [docs/decisions.md](../../../../../docs/decisions.md). Outputs **exactly one verdict and exactly one recommendation.**

**This skill writes nothing** — no doc edits, no decision entries. If the verdict implies a doc change, hand off to `/docs-strategy-update`; if it implies a recorded decision, hand off to `/kdd`.

---

## The two hard constraints

**1. One verdict, one recommendation — never a report.**
The top risk of the whole research-programme layer is **ceremony**: a ledger that becomes ritual. A health check that emits a document would be the first symptom. Metrics below exist to *justify* the single verdict, not to be delivered as findings. Ceiling: **one verdict line, one recommendation line, four metric lines, one confidence line.**

**2. The judge must not have watched the defendant.**
The same person owns the core, routes the refutations, and judges the rivals. The mitigation is structural: **Step 2 runs as a fresh subagent that receives only file paths** — never this conversation, never the reasoning that produced the pivot under audit. That framing is the thing being judged; feeding it in defeats the check.

---

## Verdict criteria — fixed in advance

**These criteria were written before any period was judged (2026-08-07, P1026) and are not to be tuned to fit a result.** Rewriting them in the same session as a verdict is itself a degeneration signal — record the proposed change in `decisions.md` and apply it on a later run.

Evaluate in order; **first match wins**.

| # | Verdict | Condition |
|---|---|---|
| 1 | **DEGENERATING** | Stopping-rule **N-clause** tripped: **3 tests run in the period with zero novel predictions corroborated**. OR: every framing adopted in the period is an **accommodation** — no novel content documented at adoption time. |
| 2 | **STAGNATING** | Stopping-rule **M-clause** tripped: **2 months with zero tests run**. The programme is not accumulating corroboration *or* refutation. |
| 3 | **PROGRESSIVE** | **≥1 novel prediction corroborated** in the period, and neither clause above tripped. |
| 4 | **STAGNATING** | Default when none of the above resolve — tests ran, nothing corroborated yet, neither clause tripped. |

**Degenerating ≠ stagnating, and the difference is load-bearing.** Degenerating = running tests and only ever accommodating. Stagnating = **not running them**. July 2026 was stagnating, not degenerating: nothing was corroborated because nothing was *run* — across ~6 founder interviews the wedge was re-cut 4 times and no definition was tested more than about twice. A check that collapsed the two would have prescribed the wrong fix (better hypotheses, when the actual fix was *repeat before re-cut*).

---

## Workflow

### Step 0 — Resolve the period

```bash
LAST=$(grep '^date:' ~/.claude_programme_health_last_run 2>/dev/null | awk '{print $2}' | tr -d '[:space:]')
[ -z "$LAST" ] && LAST=$(date -v-60d +%Y-%m-%d 2>/dev/null || date -d '60 days ago' +%Y-%m-%d)
echo "Period: $LAST → $(date +%Y-%m-%d)"
```

No prior run → default to 60 days (two M-clause months, so the M-clause is evaluable on a first run).

### Step 1 — Confirm the inputs exist

A verdict from a file that failed to load is fabrication. Check before spawning:

```bash
wc -l docs/research-programme.md docs/hypotheses.md docs/decisions.md
```

Any file missing or zero-length → **stop and report BLOCKED**. Never infer a verdict from a partial read.

### Step 1b — Core-adjacent budget pre-check (runs BEFORE the verdict)

The negative heuristic's rule 3 says an exhausted **ad-hoc-ness budget** escalates to a **core-hit review** rather than another belt patch. Nothing else in the pipeline reads that — Gate 9 in `/docs-strategy-update` only checks that a budget is *stated*, never whether it is *spent*. Without this step the rule is prose that can never fire.

```bash
# Which belt hypotheses are core-adjacent, and is their budget spent?
grep -n -i "core-adjacent" docs/hypotheses.md
grep -n -i "budget" docs/hypotheses.md | grep -i "spent\|exceeded\|exhausted"
```

For each core-adjacent entry, read its budget line and classify:

- **Budget remaining** → note it, continue to Step 2.
- **Budget spent, and no further auxiliary has since been added** → note it, continue. This is the armed state, not the tripped one.
- **Budget spent AND another auxiliary was added anyway** → **the escalation has fired.** Report it in Step 4 above the verdict, name the core element whose core-hit signature the next failure would land on, and set the recommendation to *run the core-hit review* — regardless of what the verdict criteria return. A programme quietly patching past a spent budget is degenerating even in a period that scores well on M1.

*As of 2026-08-07: H-WTP-Pain is core-adjacent, budget ONE auxiliary (the demo-selection / dyad-pre-screening precondition), and that auxiliary is **spent**. Armed, not tripped — the next belt patch on it fires the escalation.*

### Step 2 — Spawn the analyst (fresh context, docs only)

Spawn **one** subagent, `model: "sonnet"`, **foreground** (`run_in_background: false` — a background subagent's final text is silently lost, and this skill's entire output is that text).

Pass **paths, not contents** — the corpus is large and inlining forces lossy summarizing. Pass **no conversation history, no session context, no framing of what you expect to find.**

```
You are an independent Lakatosian methodologist auditing a research programme.
You have NOT seen the conversations that produced any of the decisions below, and
you must not ask for them. Judge only what the documents record.

READ (in this order):
  docs/research-programme.md   — the hard core, negative heuristic, rivals registry,
                                 progressivity ledger, stopping rule. This is the spec
                                 you are auditing against.
  docs/hypotheses.md           — the protective belt
  docs/decisions.md            — entries dated {LAST} to today only

PERIOD: {LAST} → today

Produce EXACTLY these five metrics, each with a QUOTED artifact from the docs
(a heading, a dated line, a status field). A metric with no quoted artifact is
reported as UNKNOWN, never as zero — "I found nothing" and "nothing happened"
are different findings and conflating them is the failure mode here.

  M1 NOVEL PREDICTIONS CORROBORATED — progressivity-ledger entries whose
     corroboration status changed to `corroborated` in the period. Count only
     entries graded NOVEL. Retrodictions are excluded by construction — say so
     explicitly if you excluded any, and name them.
  M2 TESTS RUN — hypotheses that had a test actually EXECUTED in the period.
     A re-cut, a reframe, copy iteration, or a plan to test is NOT a test run.
     This distinction decides the verdict; be strict and quote the evidence.
  M3 PIVOT COUNT — wedge/ICP/framing re-cuts in the period. For each, state
     whether the doc records what it NEWLY PREDICTED at adoption time (the
     adoption-time novelty audit). A re-cut with no documented novel content is
     an ACCOMMODATION — label it.
  M4 HEURISTIC-VS-ANOMALY RATIO — of the work recorded in the period, how much
     was driven by the positive heuristic (the pre-planned model sequence) versus
     reacting to an anomaly that had just refuted something? Report as
     `<heuristic>:<anomaly>` with one example each. Primary source is the optional
     `driver:` frontmatter field on specs:
       grep -l "^driver: heuristic" features/*.md features/done/**/*.md
       grep -l "^driver: anomaly"   features/*.md features/done/**/*.md
     The field is OPTIONAL and unenforced, so most specs will lack it. Report the
     coverage alongside the ratio (`3:1, from 4 of 19 specs`) and never extrapolate
     an uncovered majority — a ratio from 4 specs is a ratio from 4 specs.
  M5 RIVAL STATUS DELTA — for each rivals-registry row, did its progressivity
     status change in the period, and did any evidence column gain or lose an
     entry? Flag any rival whose own evidence now looks BETTER than ours.

Then apply the verdict criteria table below EXACTLY as written; evaluate in order,
first match wins. Do not invent, reorder, or soften a criterion.

{inline the verdict-criteria table from this skill verbatim}

RETURN (nothing else — no preamble, no summary, no encouragement):
  VERDICT: <PROGRESSIVE|STAGNATING|DEGENERATING>
  CRITERION: <which numbered row matched, and the metric value that matched it>
  M1: <n> — <quoted artifact>
  M2: <n> — <quoted artifact>
  M3: <n> — <n accommodations> — <quoted artifact>
  M4: <h>:<a> — <example each>
  M5: <changed rows, or "no delta"> — <quoted artifact>
  RECOMMENDATION: <ONE action. Not a list. Not "consider…".>
  CONFIDENCE: <HIGH|LOW> — <if LOW, the one thing the docs do not record>
```

### Step 3 — Verify before relaying (epistemic gate 9)

**A subagent's claim is not evidence until a command confirms it — and the command must test the claim, not the quote under it.** Before presenting the verdict:

1. **Re-derive the verdict-deciding metric yourself.** Whichever of M1/M2/M3 matched the criterion row — run the grep and count it. Do not accept the number.
2. **Check absence claims hardest.** "Zero tests run" and "no rival delta" are the highest-risk and cheapest-to-check class. `grep` the negative.
3. If your re-derivation disagrees with the analyst, **your count wins** and you say so in the output.

```bash
# Adjust the date window; these locate candidate lines, they do not classify them — read the hits.
grep -n "corroborated\|pre-registered\|Novel prediction" docs/hypotheses.md docs/research-programme.md
grep -n "^## 2026-" docs/decisions.md | head -40      # decisions.md is newest-first — head, not tail, for the most recent period
```

### Step 4 — Output

Exactly this shape. **No expansion.**

```
programme-health — {LAST} → {today}

VERDICT: <PROGRESSIVE|STAGNATING|DEGENERATING>   (criterion <n>: <what matched>)

  novel predictions corroborated ... <n>   <artifact>
  tests actually run ............... <n>   <artifact>
  pivots / of which accommodations . <n>/<n>   <artifact>
  heuristic:anomaly ratio .......... <h>:<a>
  rival status delta ............... <rows changed, or none>

RECOMMENDATION: <one action>

Confidence: <HIGH|LOW>. <If LOW: the one thing the docs do not record.>
Verified independently: <which metric you re-derived, and whether it matched>
```

Then, if and only if the verdict is not PROGRESSIVE, add **one** line naming the hand-off: `/docs-strategy-update` (a doc is wrong) or `/kdd` (a decision needs recording). Nothing more.

### Step 5 — Save state

Only on completion — an abandoned run must stay overdue on `/monthly`'s trigger.

```bash
cat > ~/.claude_programme_health_last_run << EOF
date: $(date +%Y-%m-%d)
verdict: <VERDICT>
recommendation: <one line>
EOF
```

Then append one line to `.private/logs/skill-costs.log` per `.claude/rules/skills.md` (silent; `mkdir -p` first).

---

## Rules

- **One verdict, one recommendation.** If you are writing a third paragraph, you are building the ceremony this skill exists to prevent.
- **Never tune the criteria to the result.** Propose changes to `decisions.md`; apply them on a later run, never this one.
- **UNKNOWN is a legitimate metric value; zero is not its synonym.** "The docs do not record this" is a finding — and it is usually the most actionable one, because it names what to start recording.
- **The analyst never sees the conversation.** Paths only. If you find yourself pasting session context into the prompt, stop — you have removed the only independence this check has.
- **Re-derive the deciding metric yourself** before relaying (epistemic gate 9). The analyst's count is a claim.
- **This skill writes nothing.** No doc edits, no decision entries, no hypothesis updates.
- **A LOW-confidence verdict still ships.** Withholding it because the evidence is thin is the exact failure `.claude/rules/epistemic.md` gate 8 names — report it with the honest label.

---

## Related Skills

- `/slava:maintain:monthly` — invokes this skill automatically
- `/slava:maintain:docs-strategy-update` — owns the strategy-doc layer; the hand-off when a doc is wrong
- `/kdd` — owns `decisions.md`; the hand-off when the verdict needs recording
- `/slava:think:falsify` — when a core commitment itself needs first-principles stress-testing
