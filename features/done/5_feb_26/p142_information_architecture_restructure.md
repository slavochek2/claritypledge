---
status: all-done
type: task
milestone: foundation
tags:
  - information-architecture
  - documentation
  - strategic-planning
  - agent-optimization
prepped_date: '2026-02-13'
reviews:
  ux: passed
  architect: passed
  alignment: passed
rank: 125001
completed_at: '2026-02-13'
created_date: 2026-02-12
---

# P142: Information Architecture Restructure — Separate Tracks/Hypotheses/Experiments/Outcomes/Milestones

## Business Requirements

**Intent:** Create clear conceptual separation between 7 different concepts currently mixed in track files, enabling both humans and agents to query, classify, and reason about strategic work systematically.

**Motivation:** Current milestone files mix:
1. Hypothesis (what we believe)
2. Experiment (how we test)
3. Outcome (what we measure)
4. Build requirements (what we ship)
5. Kill signals (when to stop)
6. Dependencies (blocked by)
7. Open questions (answered by)

This creates:
- **Conceptual confusion:** What IS a milestone? (Answer: current "milestones" are actually TRACKS)
- **Query limitations:** Can't ask "show me all active hypotheses" or "what experiments are running?"
- **Classification ambiguity:** Where does a new idea belong? (C-track? R-track? E-track? X-track? V-track?)
- **Agent friction:** Both AI agents and humans confused about how to categorize new strategic work
- **Strategic opacity:** Hard to see what we're actually testing vs. what we're building

**Outcomes:**
- Clear folder structure with 5 specialized directories: `/tracks/`, `/hypotheses/`, `/experiments/`, `/outcomes/`, `/milestones/`
- Category definition files for each track type (coaching-track.md, recognition-track.md, enhancement-track.md, exploratory-track.md, vision-track.md)
- Proper causal pathway structure in theory-of-change.md (problem → activities → outputs → outcomes → impact)
- Three-level assumption hierarchy: strategic (ToC), hypothesis-specific (hypotheses/), experimental (experiments/)
- Evidence locations clarified: strategic evidence in ToC, hypothesis-specific evidence in hypotheses/
- Queryable structure: agents can find "all active hypotheses", "experiments measuring O-story-usage", "tracks testing H-stories"

**Business Requirements:**
- MUST preserve all existing content (reorganize, don't delete)
- MUST maintain backward compatibility (update cross-references in decisions.md, lean-canvas.md)
- MUST provide classification templates (track category files teach agents how to classify new ideas)
- MUST support agent workflows (searchable structure, consistent frontmatter, linked relationships)
- MUST clarify Track vs Milestone distinction (tracks = albums of work, milestones = observable achievements)

**User Impact:**
- **Future agents:** Can classify new strategic ideas without human guidance
- **Human strategists:** Can query specific types of work ("what hypotheses are we testing?")
- **Cross-functional teams:** Clear separation makes strategic planning more transparent
- **Founder:** Easier to explain strategy to potential funders/partners

---

## Technical Analysis

**Current State:**

Milestone files located at: `/Users/slavochek/Projects/public/claritypledge/docs/milestones/*.md`

Existing structure (post-Feb 12 renaming):
```
/docs/milestones/
  c1-stories-live-events.md
  c2-first-workshops.md
  c3-paid-workshops.md
  r1-essay-writing.md
  r2-spec-publishing.md
  r3-recognition-checkpoint.md
  e1-points-ai-stories.md
  e2-scale-partners-async.md
  x1-asymmetric-conversion.md
  x2-social-dynamics.md
  x3-network-effects.md
  README.md
```

**Content analysis of C1 (example track file):**
- **Hypothesis section:** "Stories solve the cold start problem"
- **Build requirements:** "P126 (create story) → P128 (/live beginning screen) → P124 (event rooms)"
- **Success criteria:** "Users select stories to verify (don't ask 'on what?')"
- **Kill signal:** "Nobody creates stories, or stories don't improve /live sessions"
- **Open questions:** "OQ-6: What's the internal trigger?", "OQ-7: Do we need Points for verification?"
- **Frontmatter:** `status: active`, `priority: p1`, `tests: [H-Stories]`, `answers: [OQ-6, OQ-7]`

**Key insight from analysis:**
Current "milestones" are actually **TRACKS** — work streams containing multiple features/experiments. Real milestones (observable achievements like "first essay published") aren't tracked separately.

**Dependencies:**
- `/docs/theory-of-change.md` — references milestones, needs proper causal pathway structure
- `/docs/decisions.md` — references milestones in decision log
- `/docs/lean-canvas.md` — references customer segments aligned to tracks
- `/docs/philosophy.md` — contains vision concepts (mirror agents, digital twins) belonging to V-track
- `/features/*.md` — feature specs with `milestone:` frontmatter referencing tracks

**Related Systems:**
- Git history preservation (need to maintain lineage of renamed/moved files)
- Cross-document linking (update references when moving content)
- Agent classification workflows (how agents decide where new ideas belong)

**Files Involved:**
- 11 existing milestone files → become track files
- `/docs/theory-of-change.md` → needs causal pathway structure
- `/docs/decisions.md`, `/docs/lean-canvas.md` → need reference updates
- `/features/*.md` → need frontmatter updates (if `milestone:` references change)

---

## Technical Requirements

**Implementation Approach:**

**Phase 1: Create folder structure + category definition files**
1. Create 5 new directories: `/docs/tracks/`, `/docs/hypotheses/`, `/docs/experiments/`, `/docs/outcomes/`, `/docs/milestones/`
2. Write 5 track category definition files (coaching-track.md, recognition-track.md, enhancement-track.md, exploratory-track.md, vision-track.md)
3. Each category file defines:
   - **What belongs:** Classification criteria for new ideas
   - **Time horizon:** When work is expected to pay off
   - **Resource constraints:** What capabilities are required
   - **Decision framework:** How to decide if idea fits this track
   - **Examples:** Concrete examples of work in this track

**Phase 2: Update theory-of-change.md with proper causal pathway**
1. Add structured causal pathway: problem → activities → outputs → outcomes → impact
2. Add strategic assumptions section (assumptions that hold across all tracks)
3. Add strategic evidence section (research validating core theory)
4. Clarify: hypothesis-specific evidence goes in `/hypotheses/`, not ToC

**Phase 3: Extract C1 as example (prove the pattern)**
1. Create `/hypotheses/h-stories-solve-cold-start.md`:
   - Hypothesis statement
   - Rationale (why we believe this)
   - Assumptions (what must be true)
   - Evidence (research supporting)
   - Success criteria (how we'll know if true)
   - Failure criteria (kill signals)
2. Create `/experiments/e-story-creation-pilot.md`:
   - Protocol (how we test)
   - Sample size / participants
   - Measurements (what we track)
   - Timeline
   - Assumptions (experimental-level)
3. Create `/outcomes/o-story-usage.md`:
   - SMART goal definition (Specific, Measurable, Achievable, Relevant, Time-bound)
   - Measurement method
   - Target value
   - Kill threshold
4. Update `/tracks/c1-stories-live-events.md`:
   - Lightweight index linking to: hypothesis (h-stories), experiments (e-story-creation), outcomes (o-story-usage)
   - Build requirements (feature specs)
   - Overall track status

**Phase 4: Migrate remaining tracks**
1. R-track (Recognition): Extract essay hypotheses, publishing experiments, recognition outcomes
2. E-track (Enhancement): Extract AI/points hypotheses, async experiments
3. X-track (Exploratory): Extract asymmetric conversion, social dynamics, network effects hypotheses
4. Create V-track (Vision): Extract far-future ideas from philosophy.md (transcription, mirror agents, predictive calibration)

**Phase 5: Update cross-references**
1. Update `/docs/decisions.md`: milestone references → track references
2. Update `/docs/lean-canvas.md`: customer segment alignment
3. Verify feature specs: ensure `milestone:` frontmatter still resolves
4. Update `/docs/milestones/README.md` → `/docs/tracks/README.md` (explain new structure)

**Architecture Decisions:**

**Decision 1: Dedicated folders vs single folder with tags**
- **Chosen:** Dedicated folders (`/tracks/`, `/hypotheses/`, etc.)
- **Why:** Easier to query ("show me all hypotheses"), clearer file organization, better for agents
- **Alternative rejected:** Single folder with frontmatter tags — harder to browse, less discoverable

**Decision 2: Track category files as templates**
- **Chosen:** Create coaching-track.md, recognition-track.md, etc. as classification templates
- **Why:** Agents need examples to classify new ideas ("does this belong in C-track or E-track?")
- **Alternative rejected:** No templates, rely on agent reasoning — leads to inconsistent classification

**Decision 3: Three-level assumption hierarchy**
- **Chosen:** Strategic (ToC), hypothesis (hypotheses/), experimental (experiments/)
- **Why:** Different levels of abstraction require different validation methods
- **Alternative rejected:** All assumptions in one place — conflates strategic bets with tactical tests

**Decision 4: Evidence in two locations**
- **Chosen:** Strategic evidence in ToC, hypothesis-specific evidence in hypotheses/
- **Why:** Research validating "calibration works" (strategic) is different from "stories solve cold start" (hypothesis)
- **Alternative rejected:** All evidence in hypotheses/ — loses big-picture foundation

**Decision 5: V-track (Vision) as separate category**
- **Chosen:** Create V-track for far-future ideas (2+ years, new capabilities)
- **Why:** Distinguishes "requires scale" (X-track) from "requires new capabilities" (V-track)
- **Alternative rejected:** Bury vision in X-track — conflates timeline with capability gap

**Files to Create:**

**Category definition files (5):**
1. `/docs/tracks/coaching-track.md` — C-track definition + classification criteria
2. `/docs/tracks/recognition-track.md` — R-track definition
3. `/docs/tracks/enhancement-track.md` — E-track definition
4. `/docs/tracks/exploratory-track.md` — X-track definition
5. `/docs/tracks/vision-track.md` — V-track definition (NEW)

**Example extraction (C1):**
6. `/docs/hypotheses/h-stories-solve-cold-start.md`
7. `/docs/experiments/e-story-creation-pilot.md`
8. `/docs/outcomes/o-story-usage.md`

**Milestones (observable achievements):**
9. `/docs/milestones/2026-02-10-first-essay-published.md` (example format)
10. `/docs/milestones/2026-02-28-first-workshop-delivered.md` (example format)

**Files to Move:**

Move existing track files from `/docs/milestones/*.md` to `/docs/tracks/*.md`:
- `c1-stories-live-events.md` → `/docs/tracks/c1-stories-live-events.md`
- `c2-first-workshops.md` → `/docs/tracks/c2-first-workshops.md`
- `c3-paid-workshops.md` → `/docs/tracks/c3-paid-workshops.md`
- `r1-essay-writing.md` → `/docs/tracks/r1-essay-writing.md`
- `r2-spec-publishing.md` → `/docs/tracks/r2-spec-publishing.md`
- `r3-recognition-checkpoint.md` → `/docs/tracks/r3-recognition-checkpoint.md`
- `e1-points-ai-stories.md` → `/docs/tracks/e1-points-ai-stories.md`
- `e2-scale-partners-async.md` → `/docs/tracks/e2-scale-partners-async.md`
- `x1-asymmetric-conversion.md` → `/docs/tracks/x1-asymmetric-conversion.md`
- `x2-social-dynamics.md` → `/docs/tracks/x2-social-dynamics.md`
- `x3-network-effects.md` → `/docs/tracks/x3-network-effects.md`
- `README.md` → `/docs/tracks/README.md` (update to explain new structure)

**Files to Update:**

Update cross-references in:
1. `/docs/theory-of-change.md` — add causal pathway, update milestone references
2. `/docs/decisions.md` — update milestone references to track references
3. `/docs/lean-canvas.md` — update customer segment alignment
4. Feature specs in `/features/*.md` — verify `milestone:` frontmatter

**Frontmatter Schemas:**

**Hypothesis frontmatter:**
```yaml
---
status: active | validated | invalidated | paused
priority: p0 | p1 | p2 | p3
track: C | R | E | X | V
tested_by: [experiment-ids]
supports: [outcome-ids]
related_hypotheses: [hypothesis-ids]
---
```

**Experiment frontmatter:**
```yaml
---
status: planned | running | completed | aborted
tests: [hypothesis-ids]
measures: [outcome-ids]
start_date: YYYY-MM-DD
end_date: YYYY-MM-DD
sample_size: N
---
```

**Outcome frontmatter:**
```yaml
---
status: active | achieved | missed | deprecated
type: leading | lagging
track: C | R | E | X | V
target_value: "description"
kill_threshold: "description"
measured_by: [experiment-ids]
---
```

**Milestone frontmatter:**
```yaml
---
date: YYYY-MM-DD
track: C | R | E | X | V
type: launch | checkpoint | achievement
related_outcomes: [outcome-ids]
---
```

**Track frontmatter (updated):**
```yaml
---
status: active | paused | completed | killed
priority: p0 | p1 | p2 | p3
summary: "One-line description"
tests: [hypothesis-ids]
builds: [feature-ids]
measures: [outcome-ids]
answers: [open-question-ids]
---
```

**Linking Strategy:**

Use frontmatter references to create bidirectional links:
- **Track → Hypothesis:** `tests: [h-stories]`
- **Hypothesis → Experiment:** `tested_by: [e-story-creation-pilot]`
- **Experiment → Outcome:** `measures: [o-story-usage]`
- **Track → Build:** `builds: [p126, p305, p303]`
- **Milestone → Outcome:** `related_outcomes: [o-first-essay]`

This creates a queryable graph:
- "What hypotheses is C1 testing?" → Read C1 frontmatter `tests:` field
- "What experiments test h-stories?" → Read h-stories frontmatter `tested_by:` field
- "What outcomes does e-story-creation measure?" → Read e-story-creation frontmatter `measures:` field

---

## Execution Plan

### Phase 0: Pre-Migration Audit + Definitions Update (2-3 hours) — NEW

**Tasks:**
1. **Update `docs/definitions.md` FIRST:**
   - Add canonical definitions for: Track, Milestone (new definition), Hypothesis, Experiment, Outcome
   - Include distinction table (Track vs Milestone vs Hypothesis vs Experiment vs Outcome)
   - Update existing "Milestone" references in related docs section
   - **Why first:** Agents and humans need canonical terms before restructure

2. **Comprehensive reference scan:**
   ```bash
   # Find ALL references to milestones/ folder
   grep -r "docs/milestones/" . --exclude-dir={node_modules,.git,dist}

   # Find ALL references to old milestone names (M1-M12, MA-MC)
   grep -r "M[0-9]\|M1[0-2]\|MA\|MB\|MC" docs/ .claude/ scripts/ tools/

   # Count features with milestone: field
   grep -h "^milestone:" features/**/*.md | wc -l
   ```

3. **Update skills BEFORE moving files:**
   - `.claude/commands/slava/build/quick-feature/` → handle new track structure
   - `.claude/commands/slava/build/create-prd/` → reference new structure
   - Any other skills referencing `docs/milestones/`

4. **Update CLAUDE.md references:**
   - File locations table → new folder paths
   - Classification guidance → track categories (R/C/E/X/V)
   - Frontmatter schemas → updated with new structure

5. **Document findings:**
   - List ALL files to update (expand "Files to Update" section)
   - Verify validation script exists: `./scripts/validate-doc-links.cjs` ✓ (already created 2026-02-13)

**Success criteria:**
- [ ] `definitions.md` updated with canonical terms
- [ ] All milestone references catalogued (docs/, .claude/, scripts/, tools/)
- [ ] Skills updated to use new structure
- [ ] CLAUDE.md updated with new paths
- [ ] Validation script confirmed working
- [ ] "Files to Update" section expanded with all references found

**Note:** Validation script (`./scripts/validate-doc-links.cjs`) already created and tested (2026-02-13). Added to pre-commit hook.

---

### Phase 1: Create folder structure + category definition files + navigation guide (3-4 hours)

**Tasks:**
1. Create 5 new directories: `mkdir -p docs/{tracks,hypotheses,experiments,outcomes,milestones}`
2. Write category definition files:
   - **coaching-track.md:**
     - What belongs: Workshop revenue, skill building, team alignment
     - Time horizon: 0-6 months (safety track)
     - Resources: Facilitation skills, event infrastructure
     - Examples: C1 (Stories), C2 (First Workshops), C3 (Paid Workshops)
   - **recognition-track.md:**
     - What belongs: Thought leadership, essays, positioning
     - Time horizon: 3-12 months (primary track)
     - Resources: Writing, technical depth, audience reach
     - Examples: R1 (Essays), R2 (Spec Publishing), R3 (Recognition Checkpoint)
   - **enhancement-track.md:**
     - What belongs: Product improvements that require validation
     - Time horizon: 3-9 months (conditional on core traction)
     - Resources: Engineering, design, existing user base
     - Examples: E1 (Points+AI), E2 (Partners+Async)
   - **exploratory-track.md:**
     - What belongs: Ideas requiring 12+ months scale to test
     - Time horizon: 12-24 months (requires network effects)
     - Resources: User base at scale (10K+ users)
     - Examples: X1 (Asymmetric Conversion), X2 (Social Dynamics), X3 (Network Effects)
   - **vision-track.md:**
     - What belongs: Far-future ideas requiring new capabilities (not just scale)
     - Time horizon: 24+ months
     - Resources: ML/AI, transcription, advanced analytics
     - Examples: V1 (Transcription+AI), V2 (Mirror Agents), V3 (Predictive Calibration)

3. **Create HOW-TO-NAVIGATE.md** (human navigation guide):
   - Maps common questions → file locations
   - Decision tree: "Start here if you want to understand [X]"
   - Example workflows: "Understanding C1 strategy" → read these 4 files in this order
   - Bridges cognitive overhead between humans and AI-optimized structure
   - **Sample content:**
     ```markdown
     # How to Navigate the Strategic Docs

     ## Common Questions

     **"What are we testing right now?"** → `/docs/hypotheses/` (see status: active)
     **"How are we testing it?"** → `/docs/experiments/` (see status: running)
     **"What are we measuring?"** → `/docs/outcomes/` (see status: active)
     **"What are we building?"** → `/docs/tracks/` → look at builds: field
     **"When did X happen?"** → `/docs/milestones/` (dated achievements)

     ## Understanding a Track (e.g., C1)

     1. Start: `/docs/tracks/c1-stories-live-events.md` (overview + TL;DR)
     2. Deep dive: Follow links to hypothesis, experiment, outcome files
     3. Build plan: Check builds: field for feature specs
     ```

**Success criteria:**
- [ ] 5 directories created
- [ ] 5 category definition files written with classification criteria
- [ ] Each category file includes decision framework + examples
- [ ] HOW-TO-NAVIGATE.md created with question→file mapping

---

### Phase 2: Update theory-of-change.md with proper causal pathway (1-2 hours)

**Tasks:**
1. Add structured causal pathway section:
   ```
   ## Causal Pathway

   ### Problem
   - Understanding miscalibration (speakers + listeners overestimate)
   - No feedback loop exists
   - Measurement tools don't help (self-report bias)

   ### Activities (What We Do)
   - Build /live verification tool
   - Teach explain-back protocol
   - Create Stories as context for verification
   - Run workshops to train coaches
   - Publish essays to reach rationalist communities

   ### Outputs (What We Produce)
   - Calibration measurements (gap scores)
   - Certifications (verified understanding records)
   - Protocol adoption (people using explain-back)
   - Content (essays, specs, technical writing)

   ### Outcomes (What Changes)
   - Short-term (0-6 months):
     - Workshop participants report reduced miscommunication
     - Essays reach 50+ readers in target communities
     - First coaches adopt protocol
   - Medium-term (6-12 months):
     - €5k/month workshop revenue
     - Recognition as "calibration expert"
     - Inbound requests from aligned funders
   - Long-term (12-24 months):
     - Protocol spreads via coaches (√N growth)
     - AI labs adopt for agent alignment
     - Network effects kick in (topology map emerges)

   ### Impact (Civilizational Change)
   - Fractured realities → common reality
   - Verified understanding becomes norm
   - Coordination unlocked at scale
   ```

2. Add strategic assumptions section:
   - Assumption 1: Calibration training works (backed by Yang et al. meta-analysis)
   - Assumption 2: Explain-back protocol is teachable (backed by healthcare teach-back)
   - Assumption 3: People value being understood (backed by Kluger et al. listening research)
   - Assumption 4: Protocol-led growth is viable (protocol spreads free, tool captures value)

3. Add strategic evidence section:
   - Link to research from existing Evidence Base section
   - Clarify: hypothesis-specific evidence goes in `/hypotheses/`, not here

**Success criteria:**
- [ ] Causal pathway section added with 5 levels (problem → activities → outputs → outcomes → impact)
- [ ] Strategic assumptions section added (backed by research)
- [ ] Strategic evidence section clarified (vs hypothesis-specific evidence)

---

### Phase 3: Extract C1 as example (prove the pattern) (2-3 hours)

**Tasks:**

1. **Create `/docs/hypotheses/h-stories-solve-cold-start.md`:**
```markdown
---
status: active
priority: p1
track: C
tested_by: [e-story-creation-pilot]
supports: [o-story-usage]
related_hypotheses: []
---

# H-Stories: Stories Solve the Cold Start Problem

## Hypothesis Statement

Stories provide the "what" that /live needs. "Verify understanding of THIS story" is a clearer purpose than "verify understanding of... something."

## Rationale

**The problem:** /live works (users report feeling understood) but users ask "on what? when?" — no trigger for spontaneous use.

**Why stories solve this:**
- Stories are concrete (not abstract "let's verify something")
- Stories create natural triggers ("I have a story to share")
- Stories provide context (verification feels purposeful)

## Assumptions

**Critical assumptions:**
1. People have stories they want to share (not just professional updates)
2. Story creation is low-friction enough (won't block usage)
3. Verification on stories feels more purposeful than verification on abstract topics
4. Story authors value knowing who understood (creates retention loop)

## Evidence

**Supporting research:**
- Narrative psychology: Stories are how humans make sense of experience
- Social proof: Medium, Substack built on "everyone has a story worth sharing"
- User feedback: "I like /live but don't know when to use it" (P96 validation notes)

**Hypothesis-specific evidence:**
- None yet (pilot starting)

## Success Criteria

- [ ] Users create stories without prompting
- [ ] Users select stories to verify (don't ask "on what?")
- [ ] Verification sessions feel focused (qualitative feedback)
- [ ] Story authors see value in knowing who understood (retention signal)

## Failure Criteria (Kill Signals)

- Nobody creates stories after 4 weeks of availability
- Stories exist but users still ask "on what?" during /live sessions
- Story verification feels forced/artificial (qualitative feedback)
```

2. **Create `/docs/experiments/e-story-creation-pilot.md`:**
```markdown
---
status: planned
tests: [h-stories]
measures: [o-story-usage]
start_date: 2026-02-15
end_date: 2026-03-15
sample_size: 20
---

# E-Story-Creation: Story Creation Pilot

## Experiment Protocol

**What we're testing:** Whether users will create stories and use them as context for /live verification.

**Method:**
1. Build story creation feature (P126)
2. Invite 20 pilot users (mix of previous /live users + new)
3. Prompt: "Share a story that matters to you"
4. Observe: Do they create? Do they verify?
5. Measure: Story creation rate, verification frequency, qualitative feedback

**Timeline:**
- Weeks 1-2: Build story feature + recruit pilot users
- Weeks 3-4: Pilot running, collect data
- Week 5: Analyze results, decide next steps

## Measurements

**Quantitative:**
- Story creation rate (stories per user per week)
- Verification frequency (verifications per story)
- Session quality (understanding gap reduction)

**Qualitative:**
- Exit interviews: "Did stories make /live feel more purposeful?"
- Observation: Do users ask "on what?" less?
- Retention: Do story authors return?

## Sample Size

**Target:** 20 pilot users
**Composition:**
- 10 previous /live users (returning users)
- 10 new users (cold start test)

**Justification:** Small enough to iterate quickly, large enough to spot patterns.

## Assumptions (Experimental)

1. 20 users sufficient to spot signal (not statistical significance, just pattern detection)
2. 4-week timeframe long enough for habits to form
3. Pilot users willing to give feedback
4. Story creation feature works technically (no major bugs blocking usage)

## Success Threshold

**Proceed if:**
- ≥50% of users create at least 1 story
- ≥30% of users verify understanding of stories
- Qualitative feedback: "Stories make /live feel purposeful"

**Kill if:**
- <20% story creation rate after 4 weeks
- Users still ask "on what?" despite stories existing
- Qualitative feedback: "Stories feel forced"
```

3. **Create `/docs/outcomes/o-story-usage.md`:**
```markdown
---
status: active
type: leading
track: C
target_value: "≥50% story creation rate, ≥30% verification rate"
kill_threshold: "<20% story creation rate after 4 weeks"
measured_by: [e-story-creation-pilot]
---

# O-Story-Usage: Story Creation + Verification Rates

## SMART Goal Definition

**Specific:** Users create stories on their profiles and verify understanding of those stories via /live.

**Measurable:**
- Story creation rate: % of active users who create ≥1 story
- Verification rate: % of stories that get verified via /live

**Achievable:** Based on analogous platforms (Medium, Substack), 20-50% content creation rate is realistic for early adopters.

**Relevant:** Leading indicator for H-Stories hypothesis. If users don't create stories, hypothesis fails.

**Time-bound:** 4-week pilot (Feb 15 - Mar 15, 2026)

## Measurement Method

**Data collection:**
- Story creation events (logged in database)
- /live session events linked to stories (logged in database)
- User feedback surveys (exit interviews)

**Analysis:**
- Weekly snapshot: creation rate, verification rate
- Cohort analysis: returning users vs new users
- Qualitative coding: exit interview themes

## Target Value

**Success threshold:**
- ≥50% story creation rate (10+ of 20 pilot users create stories)
- ≥30% verification rate (3+ of 10 stories get verified)
- Qualitative: "Stories make /live purposeful" feedback

## Kill Threshold

**Abandon hypothesis if:**
- <20% story creation rate after 4 weeks (too low engagement)
- Stories exist but verification rate <10% (stories don't trigger /live usage)
- Qualitative: "Stories feel forced" (poor UX fit)

## Related Outcomes

- O-Workshop-Retention (C2): Do workshop participants create stories?
- O-Essay-Reach (R1): Do essays mention Stories feature?
```

4. **Update `/docs/tracks/c1-stories-live-events.md`:**

Refactor to lightweight index linking to extracted components:

```markdown
---
status: active
priority: p1
summary: "Stories give /live a purpose — verify understanding of specific stories, not abstract 'something'"
tests: [h-stories]
builds: [p126, p305, p303]
measures: [o-story-usage]
answers: [oq-6, oq-7]
---

# C1: Stories + Live + Events (Coaching Foundation)

## TL;DR (Quick Summary)

**Hypothesis:** Stories solve the cold start problem — "verify understanding of THIS story" is clearer than "verify understanding of... something."

**How we test:** 20-user pilot over 4 weeks. Users create stories, verify via /live.

**Success metric:** ≥50% story creation rate, ≥30% verification rate, qualitative feedback: "Stories make /live purposeful."

**Kill signal:** <20% story creation after 4 weeks, or stories don't improve /live sessions.

---

## Deep Dive (Full Details)

**What we're building:** Story creation (profiles) + /live verification (beginning screen) + event rooms (workshop pairing)

**What we're testing:** [H-Stories: Stories solve cold start problem](../hypotheses/h-stories-solve-cold-start.md)

**What we're measuring:** [O-Story-Usage: Creation + verification rates](../outcomes/o-story-usage.md)

**Experiments running:** [E-Story-Creation: Pilot with 20 users](../experiments/e-story-creation-pilot.md)

## Build Requirements

**Phase 1-2:** Story creation on profiles (P126)
**Phase 3:** /live beginning screen linking to stories (P128)
**Phase 4:** Event rooms for workshop pairing (P124)

**Done when:** Can run a workshop where participants create stories, verify in /live, pair via event rooms

## Kill Signal

See [H-Stories kill criteria](../hypotheses/h-stories-solve-cold-start.md#failure-criteria): <20% story creation rate after 4 weeks, or stories don't improve /live sessions.

## Open Questions Answered

### OQ-6: What's the internal trigger?

**Answered by:** Stories create natural triggers ("I have a story to share" or "Someone shared a story with me")

**See:** [H-Stories rationale](../hypotheses/h-stories-solve-cold-start.md#rationale)

### OQ-7: Do we need Points for verification?

**Decision:** Start with holistic verification (no points). Add points only if holistic proves too vague.

**See:** [E-Story-Creation protocol](../experiments/e-story-creation-pilot.md) (Phase 4a tests holistic, Phase 4b adds points if needed)
```

**Success criteria:**
- [ ] 3 new files created (hypothesis, experiment, outcome)
- [ ] C1 track file refactored to lightweight index
- [ ] All cross-references working (links resolve)

---

### Phase 4: Migrate remaining tracks (4-6 hours)

**Tasks:**

For each remaining track, extract:
1. Hypothesis files → `/docs/hypotheses/h-{name}.md`
2. Experiment files → `/docs/experiments/e-{name}.md`
3. Outcome files → `/docs/outcomes/o-{name}.md`
4. Update track file → lightweight index

**Track migration order:**
1. **R1 (Essay Writing):** Extract h-recognition-via-essays, e-essay-publishing, o-essay-reach
2. **R2 (Spec Publishing):** Extract h-specs-build-credibility, e-spec-writing, o-spec-discussion
3. **R3 (Recognition Checkpoint):** Extract o-recognition-threshold (50+ readers per essay)
4. **C2 (First Workshops):** Extract h-workshops-validate-ux, e-donation-workshops, o-workshop-retention
5. **C3 (Paid Workshops):** Extract h-paid-tier-viable, e-pricing-test, o-revenue-5k
6. **E1 (Points+AI):** Extract h-points-improve-clarity, e-ai-story-extraction, o-point-adoption
7. **E2 (Partners+Async):** Extract h-async-scales-access, e-slack-integration, o-partner-usage
8. **X1 (Asymmetric Conversion):** Extract h-asymmetric-conversion, e-position-tracking, o-conversion-rate
9. **X2 (Social Dynamics):** Extract h-group-dynamics, e-topology-mapping, o-network-density
10. **X3 (Network Effects):** Extract h-sqrt-n-growth, e-recursive-spokescouncil, o-common-knowledge

**V-track creation (NEW):**
11. Create vision-track.md (category definition)
12. Extract from philosophy.md:
    - V1: Transcription + AI Analysis (P33, P41 AI coaching)
    - V2: Mirror Agents / Digital Twins (philosophy.md concepts)
    - V3: Predictive Calibration (ML models)

**Success criteria:**
- [ ] All 11 tracks migrated (content preserved)
- [ ] V-track created with 3 vision items
- [ ] All hypotheses/experiments/outcomes extracted
- [ ] Track files become lightweight indexes

---

### Phase 5: Reclassify all feature frontmatter (2-3 hours)

**CRITICAL: Must complete BEFORE Phase 6** — Can't update cross-references in docs while features still point to old milestone names.

**Tasks:**

1. **Create and run reclassification script:**
   ```bash
   # Create script at scripts/reclassify-features.ts
   # Script reads mapping table and updates all feature frontmatter
   npm run reclassify-features
   ```

2. **Milestone mapping table (used by script):**
   - M1 → C1 (Stories + Live + Events)
   - M2 → C2 (First Workshops)
   - M3 → C3 (Paid Workshops)
   - M4 → C4 (Workshop Scale)
   - M5 → C5 (Async Partners)
   - M6 → R1 (Essay Writing)
   - MA → R2 (Spec Publishing)
   - MB → R3 (Recognition Signals)
   - MC → R4 (Recognition Scale)
   - M7+M8+M9 → X2 (Social Dynamics - merged)
   - M10+M11+M12 → X3 (Network Effects - merged)

3. **Validate with validation script:**
   ```bash
   ./scripts/validate-frontmatter.sh
   # Checks: All features have milestone field, all values are valid (C*/R*/E*/X*/foundation)
   ```

4. **Verify kanban visibility:**
   ```bash
   npm run kanban
   # Confirm all features appear in correct tracks
   # Check for any features missing milestone field
   ```

5. **Document the mapping in decisions.md:**
   - Add entry explaining track rename rationale (M1→C1, etc.)
   - Preserve history of old names for reference

**Success criteria:**
- [ ] Script created and run successfully
- [ ] All features have valid milestone values (C*, R*, E*, X*, or foundation)
- [ ] No features reference old milestone names (M1-M12, MA-MC)
- [ ] All features visible in kanban
- [ ] Mapping documented in decisions.md

**Script specification:**
```typescript
// scripts/reclassify-features.ts
// Reads all features/*.md and features/done/*.md
// Applies mapping table (M1→C1, M2→C2, etc.)
// Updates frontmatter milestone field
// Reports: N files updated, N files skipped (already correct)
```

---

### Phase 6: Update cross-references (1-2 hours)

**Depends on:** Phase 5 complete (all features reclassified)

**Tasks:**

1. **Update `/docs/decisions.md`:**
   - Find all track references: `grep -n "M[0-9]" docs/decisions.md`
   - Replace with new track names: M1→C1, M2→C2, MA→R1, etc.
   - Update Feb 12 decision entry to reference new structure

2. **Update `/docs/lean-canvas.md`:**
   - Update customer segment alignment to reference tracks
   - Verify Track 1 (Recognition) and Track 2 (Coaching) descriptions still accurate

3. **Update `/docs/tracks/README.md`:**
   - Explain new folder structure
   - Document track categories (R/C/E/X/V)
   - Provide classification decision tree
   - Link to category definition files

4. **Scan for remaining references:**
   ```bash
   grep -r "M[0-9]\|M1[0-2]\|MA\|MB\|MC" docs/ --exclude-dir=milestones
   # Verify each is intentional or update
   ```

**Success criteria:**
- [ ] All cross-references updated (no broken links)
- [ ] decisions.md reflects new structure
- [ ] lean-canvas.md references tracks correctly
- [ ] tracks/README.md explains new system
- [ ] No stale references remain

---

## Bidirectional Reference Sync Protocol

**Problem:** Frontmatter creates bidirectional links:
- Track file: `tests: [h-stories]`
- Hypothesis file: `track: C1, tested_by: [e-pilot]`
- Experiment file: `tests: [h-stories], measures: [o-usage]`

If someone updates one side, who updates the other?

**Protocol:**

1. **Manual sync during Phase 3 extraction:**
   - When extracting hypothesis from track, add BOTH links:
     - Track file: `tests: [h-stories]`
     - Hypothesis file: `track: C1`
   - Double-check before committing

2. **Validation script catches drift:**
   ```bash
   ./scripts/validate-doc-links.sh
   # Checks:
   # - Track lists hypothesis → hypothesis points back to track
   # - Hypothesis lists experiment → experiment points back to hypothesis
   # - Experiment lists outcome → outcome is measured by experiment
   # Reports: "C1 lists h-stories but h-stories doesn't list C1"
   ```

3. **Run validation:**
   - After each phase completion (Phase 3, Phase 4)
   - Before committing changes
   - In pre-commit hook (optional but recommended)

4. **Fix conflicts immediately:**
   - Script reports broken links → fix before proceeding
   - Don't accumulate sync debt

**Script location:** `scripts/validate-doc-links.sh` (created in Phase 1, used throughout)

**Alternative considered:** Unidirectional links only (track → hypothesis, no backlink). **Rejected** because agents need to discover "what track is this hypothesis part of?" without scanning all tracks.

---

## Prep Notes (2026-02-13)

**Reviews:** UX ✓, Architect ✓, Alignment ✓ — All passed

**Status:** READY TO IMPLEMENT

### Completed Pre-Work (2026-02-13)

1. ✅ **Validation script created** — `./scripts/validate-doc-links.cjs` built and tested. All tests passed. Integrated into pre-commit hook.

2. ✅ **Linking tool analysis** — Evaluated Foam, Marksman, Obsidian. Decision: Keep manual sync + validation script (tools don't support YAML frontmatter).

3. ✅ **Simplification decisions** — Reviewed all architectural decisions. V-track will be created, all 11 tracks migrated together, single PRD (no split).

### Implementation Decisions (2026-02-13)

**Confirmed:**
- Create V-track during migration (not deferred)
- Migrate all 11 tracks in one session (no P142a/P142b split)
- Manual bidirectional sync + validation script (no specialized tools)
- Timeline: 20-28 hours (realistic estimate with Phase 0)

**To Add:**
- Phase 0: Pre-migration audit + definitions.md update (2-3 hours)
- HOW-TO-NAVIGATE.md in Phase 1 (30-60 min)
- Inline TL;DR in track file template (preserves narrative)

### Blockers (RESOLVED 2026-02-12)

1. ✅ **Phase ordering** — Feature reclassification (Phase 5) now happens BEFORE cross-reference updates (Phase 6).

2. ✅ **Bidirectional reference sync** — Manual sync + validation script documented in "Bidirectional Reference Sync Protocol" section.

3. ✅ **Terminology inconsistency** — Spec uses "track" for C1/R1/etc., "milestone" for dated achievements only.

4. ✅ **Feature reclassification** — Phase 5 requires creating `scripts/reclassify-features.cjs` (follows migrate-to-rank.cjs pattern).

### Key Findings (2026-02-13)

**UX Review:**
- 5-folder structure creates cognitive overhead for humans — mitigated by HOW-TO-NAVIGATE.md + inline TL;DR
- Track files should include 1-2 sentence summary before links (don't force 4-file navigation)
- Validation script prevents manual sync errors

**Architect Review:**
- Missing Phase 0: Must scan ALL milestone references (docs/, .claude/, scripts/, tools/) before moving files
- 35 files with references found (not just 4 planned in spec)
- Validation script already created (2026-02-13) — moves to Phase 0, not Phase 1

**Alignment Review:**
- BLOCKER: Update `definitions.md` FIRST with Track/Hypothesis/Experiment/Outcome/Milestone canonical definitions
- P142 reverses P130 (merged → separated for queryability) — document in decisions.md
- Aligns with scientific method principles in philosophy.md

### Post-Implementation KDD

After completion, `/kdd` should update:
- `definitions.md` — Add Track/Hypothesis/Experiment/Outcome/Milestone canonical table
- `decisions.md` — Document P130 reversal rationale + terminology shift
- `theory-of-change.md` — Point to `/hypotheses/` folder, clarify evidence locations
- `CLAUDE.md` — Classification decision tree, frontmatter schemas, updated skill references
- `.claude/commands/slava/build/quick-feature/` — Handle new structure

---

## Risks & Open Questions

### Risks

**Risk 1: Breaking existing links in other docs**
- **Likelihood:** Medium (many docs reference milestones)
- **Impact:** Medium (broken links create confusion)
- **Mitigation:** Update references as we migrate, keep track files as indexes (backward compatibility)

**Risk 2: Agent confusion during transition**
- **Likelihood:** Low (clear structure once complete)
- **Impact:** Low (agents can ask for clarification)
- **Mitigation:** Complete migration in single session, update CLAUDE.md to reference new structure

**Risk 3: Over-engineering (creating structure we don't use)**
- **Likelihood:** Medium (early stage, structure may feel heavy)
- **Impact:** Low (can simplify later)
- **Mitigation:** Start with C1 example (Phase 3), validate pattern works before full migration

**Risk 4: Losing context in extraction**
- **Likelihood:** Low (preserving all content, just reorganizing)
- **Impact:** High (strategic context is valuable)
- **Mitigation:** Extract carefully, review before committing, use git to track changes

### Open Questions

**Q1: Should V-track exist now or wait for first V1 idea?**
- **Current thinking:** Create now as part of restructure
- **Why:** V-track ideas already exist (P33, P41, philosophy.md concepts) — just not organized
- **Decision:** Create V-track in Phase 4, extract from philosophy.md

**Q2: Should we create strategy.md for cross-track concerns?**
- **Current thinking:** No, use decisions.md + tracks/README.md
- **Why:** Cross-track decisions belong in decisions.md (trade-offs), track system explanation belongs in README
- **Decision:** Don't create strategy.md (avoid proliferation)

**Q3: Do milestones need dates or can they be planned?**
- **Current thinking:** Milestones should be OBSERVABLE events (past tense)
- **Why:** "First essay published" is a milestone, "publish 3 essays" is an outcome
- **Decision:** Milestones are date-stamped achievements, outcomes are forward-looking goals

**Q4: Should experiments have status tracking (planned/running/completed)?**
- **Current thinking:** Yes, add to frontmatter
- **Why:** Need to know which experiments are active vs historical
- **Decision:** Add `status:` to experiment frontmatter (see schema above)

---

## Acceptance Criteria

**Folder structure:**
- [ ] 5 new directories created (`/tracks/`, `/hypotheses/`, `/experiments/`, `/outcomes/`, `/milestones/`)
- [ ] 5 category definition files written (coaching, recognition, enhancement, exploratory, vision)

**Content migration:**
- [ ] All 11 existing track files moved to `/docs/tracks/`
- [ ] C1 fully extracted (hypothesis, experiment, outcome files created)
- [ ] Remaining tracks extracted (10 tracks × ~3 files each = 30+ files)
- [ ] V-track created with vision items from philosophy.md

**Theory of Change:**
- [ ] Causal pathway structure added (problem → activities → outputs → outcomes → impact)
- [ ] Strategic assumptions section added
- [ ] Strategic vs hypothesis-specific evidence clarified

**Cross-references:**
- [ ] decisions.md updated (milestone → track references)
- [ ] lean-canvas.md updated (customer segment alignment)
- [ ] Feature frontmatter verified (`milestone:` references still work)
- [ ] tracks/README.md explains new structure

**Documentation:**
- [ ] Frontmatter schemas defined (hypothesis, experiment, outcome, milestone, track)
- [ ] Linking strategy documented (bidirectional frontmatter references)
- [ ] Classification templates provided (track category files)

**Agent readiness:**
- [ ] Queryable structure (can find "all active hypotheses")
- [ ] Classification guidance (category files teach how to classify new ideas)
- [ ] Consistent frontmatter (agents can parse relationships)

---

## Next Steps

1. **Review PRD** — Confirm scope, approach, and phasing
2. **Execute Phase 1** — Create folders + category files (prove structure works)
3. **Execute Phase 2** — Update ToC (establish causal framework)
4. **Execute Phase 3** — Extract C1 (validate pattern with real example)
5. **Review checkpoint** — Does extracted C1 feel clearer? Does linking work?
6. **Execute Phases 4-5** — Migrate remaining tracks + update references
7. **Final review** — Verify all links work, documentation complete
8. **Commit** — Use git to preserve history of moved files
9. **Update CLAUDE.md** — Document new structure for future agents
10. **Run `/kdd`** — Capture learnings in strategic docs

---

## Implementation Notes

**Git strategy for moving files:**
```bash
# Preserve history when moving files
git mv docs/milestones/c1-stories-live-events.md docs/tracks/c1-stories-live-events.md

# Commit with clear message
git commit -m "refactor: restructure tracks → separate tracks/hypotheses/experiments/outcomes

- Move track files to /tracks/ (lightweight indexes)
- Extract hypotheses to /hypotheses/ (what we believe)
- Extract experiments to /experiments/ (how we test)
- Extract outcomes to /outcomes/ (what we measure)
- Create milestones/ for observable achievements
- Add track category definitions (R/C/E/X/V classification)
- Update theory-of-change.md with causal pathway
- Update cross-references in decisions.md, lean-canvas.md

Rationale: Current 'milestones' are actually TRACKS (work streams).
Separating concepts enables querying ('show all hypotheses'),
classification (agents know where new ideas belong), and
strategic transparency (what we're testing vs building).

See P142 for full PRD.
"
```

**Validation checklist before committing:**
- [ ] All files created/moved successfully
- [ ] No broken links (run link checker)
- [ ] Frontmatter valid (no syntax errors)
- [ ] Git history preserved (moved files maintain lineage)
- [ ] Cross-references updated (decisions.md, lean-canvas.md)
- [ ] README.md explains new structure

**Documentation to update after completion:**
- [ ] CLAUDE.md: Add section on new info architecture
- [ ] docs/technical/feature-specs.md: Update milestone frontmatter guidance
- [ ] .claude/commands/slava/build/quick-feature/: Update to use new track structure

---

## Related Documents

- [decisions.md](../docs/decisions.md) — Feb 12 milestone restructure decision
- [theory-of-change.md](../docs/theory-of-change.md) — Needs causal pathway structure
- [philosophy.md](../docs/philosophy.md) — Vision concepts for V-track
- [lean-canvas.md](../docs/lean-canvas.md) — Customer segment alignment
- [milestones/](../docs/milestones/) — Current structure to be reorganized
- [P130: Merge hypotheses into milestones](./p130_merge_hypotheses_into_milestones.md) — Previous consolidation decision (now being reversed/refined)
