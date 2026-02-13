# How to Navigate the Strategic Docs

The strategic documentation is organized into specialized folders optimized for AI agent querying and classification. This guide helps humans navigate the structure.

---

## Quick Reference: Common Questions

**"What are we testing right now?"**
→ `/docs/hypotheses/` (filter by `status: active`)

**"How are we testing it?"**
→ `/docs/experiments/` (filter by `status: running`)

**"What are we measuring?"**
→ `/docs/outcomes/` (filter by `status: active`)

**"What are we building?"**
→ `/docs/tracks/` → look at `builds:` field → cross-reference with `/features/`

**"When did X happen?"**
→ `/docs/milestones/` (dated achievements like "2026-02-10-first-essay-published.md")

**"What's the overall strategy?"**
→ Start with `/docs/lean-canvas.md` (business model) and `/docs/theory-of-change.md` (how we create impact)

**"Where do I classify a new idea?"**
→ `/docs/tracks/` → read category files (coaching-track.md, recognition-track.md, etc.) for decision framework

---

## Understanding a Track (Example: C1)

To understand the full picture of a track, follow this reading order:

### 1. Start: Track Overview
**File:** `/docs/tracks/c1-stories-live-events.md`

**What you'll find:**
- TL;DR summary (quick context)
- Links to hypothesis, experiments, outcomes
- Build requirements (what features we're shipping)
- Kill signals (when to abandon)

### 2. Deep Dive: Hypothesis
**File:** `/docs/hypotheses/h-stories-solve-cold-start.md` (linked from track)

**What you'll find:**
- Hypothesis statement ("Stories solve cold start problem")
- Rationale (why we believe this)
- Assumptions (what must be true)
- Evidence (research supporting)
- Success/failure criteria

### 3. How We Test: Experiment
**File:** `/docs/experiments/e-story-creation-pilot.md` (linked from hypothesis)

**What you'll find:**
- Protocol (step-by-step how we test)
- Sample size (20 users)
- Measurements (what we track)
- Timeline (start/end dates)
- Success thresholds

### 4. What We Measure: Outcome
**File:** `/docs/outcomes/o-story-usage.md` (linked from experiment)

**What you'll find:**
- SMART goal definition
- Target value (≥50% story creation rate)
- Kill threshold (<20% creation rate)
- Measurement method

### 5. What We're Building: Features
**Location:** `/features/` (cross-referenced from track's `builds:` field)

**What you'll find:**
- Detailed PRDs for each feature
- Implementation plans
- Test coverage
- Status tracking

---

## Folder Structure Overview

```
docs/
├── tracks/              # Work streams (albums of related work)
│   ├── c1-stories-live-events.md
│   ├── c2-first-workshops.md
│   ├── r1-essay-writing.md
│   ├── coaching-track.md       # Classification guide
│   ├── recognition-track.md
│   ├── enhancement-track.md
│   ├── exploratory-track.md
│   ├── vision-track.md
│   └── README.md
│
├── hypotheses/          # Testable beliefs (what we think is true)
│   ├── h-stories-solve-cold-start.md
│   ├── h-recognition-via-essays.md
│   └── ...
│
├── experiments/         # Testing protocols (how we validate hypotheses)
│   ├── e-story-creation-pilot.md
│   ├── e-essay-publishing.md
│   └── ...
│
├── outcomes/            # Measurable goals (what success looks like)
│   ├── o-story-usage.md
│   ├── o-essay-reach.md
│   └── ...
│
├── milestones/          # Observable achievements (dated events)
│   ├── 2026-02-10-first-essay-published.md
│   ├── 2026-02-28-first-workshop-delivered.md
│   └── ...
│
├── definitions.md       # Canonical concept definitions
├── lean-canvas.md       # Business model
├── theory-of-change.md  # How we create impact
├── decisions.md         # Trade-offs and why
├── philosophy.md        # WHY we're doing this
└── ...
```

---

## Why This Structure?

**For AI agents:**
- Queryable ("show me all active hypotheses")
- Classifiable (category files teach where new ideas belong)
- Linked (frontmatter creates bidirectional references)

**For humans:**
- Separation of concerns (hypotheses ≠ experiments ≠ outcomes)
- Clear lifecycle (idea → hypothesis → experiment → outcome → milestone)
- Traceable (can follow links from track → hypothesis → experiment → outcome)

**Trade-off:**
- **Cost:** Cognitive overhead (need to navigate 4 files instead of 1)
- **Benefit:** Clarity (each file has single purpose, easier to query)
- **Mitigation:** This guide + inline TL;DR in track files

---

## Workflow Examples

### Example 1: "I want to understand the coaching strategy"

1. **Start:** `/docs/tracks/coaching-track.md` (category overview)
2. **Read:** `/docs/tracks/c1-stories-live-events.md` (current work)
3. **Deep dive:** Follow links to hypothesis/experiment/outcome files
4. **Features:** Check `/features/` for build status (filter by `milestone: c1`)

### Example 2: "I have a new feature idea — where does it belong?"

1. **Read:** `/docs/tracks/coaching-track.md`, `recognition-track.md`, etc. (category files)
2. **Match:** Find track that fits your idea's purpose + timeline
3. **Decision framework:** Each category file has "Choose X-track if..." criteria
4. **Create:** File feature spec with `milestone: {track-id}` frontmatter

### Example 3: "What did we achieve last month?"

1. **Read:** `/docs/milestones/` (date-stamped achievements)
2. **Filter:** Files matching last month's dates
3. **Cross-reference:** Look at `related_outcomes:` field to see which goals were achieved

### Example 4: "Is hypothesis X validated yet?"

1. **Read:** `/docs/hypotheses/h-{name}.md`
2. **Check:** `status:` field (active / validated / invalidated / paused)
3. **Follow:** `tested_by:` field → read experiment files
4. **Review:** Experiment results, measurements, conclusions

---

## File Naming Conventions

**Tracks:**
- Format: `{prefix}{number}-{slug}.md`
- Example: `c1-stories-live-events.md`, `r2-spec-publishing.md`

**Hypotheses:**
- Format: `h-{slug}.md`
- Example: `h-stories-solve-cold-start.md`, `h-recognition-via-essays.md`

**Experiments:**
- Format: `e-{slug}.md`
- Example: `e-story-creation-pilot.md`, `e-essay-publishing.md`

**Outcomes:**
- Format: `o-{slug}.md`
- Example: `o-story-usage.md`, `o-essay-reach.md`

**Milestones:**
- Format: `{YYYY-MM-DD}-{slug}.md`
- Example: `2026-02-10-first-essay-published.md`

---

## Frontmatter Quick Reference

### Track Frontmatter
```yaml
status: active | paused | completed | killed
priority: p0 | p1 | p2 | p3
summary: "One-line description"
tests: [hypothesis-ids]
builds: [feature-ids]
measures: [outcome-ids]
answers: [open-question-ids]
```

### Hypothesis Frontmatter
```yaml
status: active | validated | invalidated | paused
priority: p0 | p1 | p2 | p3
track: C | R | E | X | V
tested_by: [experiment-ids]
supports: [outcome-ids]
```

### Experiment Frontmatter
```yaml
status: planned | running | completed | aborted
tests: [hypothesis-ids]
measures: [outcome-ids]
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
sample_size: N
```

### Outcome Frontmatter
```yaml
status: active | achieved | missed | deprecated
type: leading | lagging
track: C | R | E | X | V
target_value: "description"
kill_threshold: "description"
measured_by: [experiment-ids]
```

### Milestone Frontmatter
```yaml
date: YYYY-MM-DD
track: C | R | E | X | V
type: launch | checkpoint | achievement
related_outcomes: [outcome-ids]
```

---

## Tips for Navigating

1. **Start broad, zoom in:** Track → Hypothesis → Experiment → Outcome
2. **Use frontmatter links:** Follow `tested_by:`, `measures:`, `builds:` fields
3. **Filter by status:** Active hypotheses, running experiments, achieved outcomes
4. **Check category files first:** When classifying new ideas, read track category files
5. **Track files have TL;DR:** Don't need to read 4 files if you just want quick context

---

## Related Documents

- [definitions.md](definitions.md) — Canonical definitions of Track/Hypothesis/Experiment/Outcome/Milestone
- [lean-canvas.md](lean-canvas.md) — Business model and customer segments
- [theory-of-change.md](theory-of-change.md) — Causal pathway (problem → impact)
- [decisions.md](decisions.md) — Strategic trade-offs and why
