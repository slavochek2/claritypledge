---
status: done
type: task
rank: 125001
workstream: C2
tags:
  - information-architecture
  - documentation
  - simplification
  - refactoring
---

# P144: Simplify Planning System — Restore One-File-Per-Milestone Structure

## Problem Statement

### Current State: 5-Folder Complexity

P142 (Information Architecture Restructure, completed 2026-02-13) split single milestone files into 4-5 separate files across 5 folder locations:

**Before P142 (one file):**
- `/docs/milestones/c1-stories-live-events.md` — 64 lines total
- All context in one place: hypothesis, how to test, what to measure, what to build, kill signals

**After P142 (five folders):**
- `/docs/workstreams/c1-stories-live-events.md` — 73 lines (index file linking to other files)
- `/docs/hypotheses/h-stories-solve-cold-start.md` — 108 lines
- `/docs/experiments/e-story-creation-pilot.md` — 160 lines
- `/docs/key-results/kr-story-usage.md` — 150 lines
- `/docs/workstreams/coaching-track.md` — category definition file

**Total: 64 lines → 491+ lines across 5 files in 4 directories** (7.6x increase in content to read)

### Pain Points

**1. Cognitive overhead**
- Must read 5 files (491 lines) to understand one milestone vs. 1 file (64 lines)
- Mental context-switching between folders (workstreams → hypotheses → experiments → key-results)
- Harder to see "what are we doing and why" at a glance

**2. Information fragmentation**
- "What is C1?" requires reading 4+ files scattered across 4 directories
- Can't quickly answer "what's the hypothesis for C1?" (must navigate to hypotheses/ folder)
- Cross-references create navigation maze (click → read → click back → click next link)

**3. Terminology confusion**
- P142 introduced "workstream" terminology, but user's mental model is simpler: C1/C2/C3 are **milestones** in the Coaching **track**
- "Workstream" implies ongoing work (correct) but creates semantic confusion with "milestone" (checkpoint)
- Documentation now mixes "workstream," "track," "milestone" — three terms for overlapping concepts

**4. Over-engineering for current scale**
- Structure optimized for querying ("show all active hypotheses"), but we have 6 active workstreams, not 600
- Can query 6 markdown files with `grep` — don't need folder-based separation
- Separation was solving a future problem (100+ strategic initiatives) we don't have yet

### Who's Affected

**AI agents:**
- Must navigate 5 folders to understand one milestone
- More files = more tokens, slower comprehension
- Harder to answer "what is C1 testing?" (requires reading 4+ files)

**Humans (founder, potential funders/partners):**
- Can't quickly skim planning structure — must follow links across folders
- Harder to explain strategy ("let me show you 5 files...")
- More cognitive load when deciding where new work belongs

**Documentation maintainers:**
- Changes to one milestone now require updating 4-5 files
- Easier to create inconsistencies (update hypothesis, forget to update experiment)
- More places for documentation to drift out of sync

---

## Intention (Why This Matters)

### Strategic Importance: Simplicity Enables Speed

**Current trajectory is unsustainable:**
- Every planning decision requires reading 500+ lines across 5 files
- Cognitive overhead slows down strategic iteration
- Over-engineered structure optimizes for scale we won't reach for 18+ months

**Business cost of complexity:**
- **Time cost:** 5-10 minutes to understand one milestone (reading 5 files) vs. 2 minutes (reading 1 file)
- **Decision cost:** Harder to classify new work ("is this a hypothesis? experiment? key result?")
- **Communication cost:** Can't quickly share strategy with potential funders/partners ("here, read these 5 files...")

### Why Now

**Immediate trigger:**
- User observed complexity during Feb 13 strategic planning session
- Revealed mental model mismatch: user thinks "C1/C2/C3 are milestones in Coaching track," not "C1 is a workstream containing hypotheses/experiments/outcomes"
- Complexity is slowing down current milestone work (C1 validation), not helping it

**Right time to simplify:**
- P142 shipped yesterday (Feb 13) — easy to revert before other work depends on new structure
- No downstream dependencies yet (no code references new folder structure)
- Fresh evidence of friction (user struggled to navigate during planning)

### Impact If Not Solved

**Short term (1-3 months):**
- Slower strategic iteration (10 min to understand milestone vs. 2 min)
- Confusion when classifying new work (hypothesis vs. outcome vs. experiment)
- Documentation drift (updating 1 file forgotten when updating 4 others)

**Long term (6-12 months):**
- Premature optimization prevents iteration (structure too rigid for early-stage pivots)
- Onboarding friction (explaining planning system takes 30 min, not 5 min)
- Lost funder/partner opportunities (can't quickly communicate strategy)

---

## Business Requirements

### Must-Haves: What Simplified System MUST Achieve

**1. Single source of truth for each milestone**
- One file contains: what we're building, why (hypothesis), how we test (experiment), what we measure (metrics), kill signals
- Reading one file answers "what is C1?" completely
- No cross-file navigation required for basic understanding

**2. Preserve track categorization**
- Keep C (Coaching), R (Recognition), E (Enhancement), X (Exploratory), V (Vision) track system
- Track names explain purpose: C-track = coaching/workshops, R-track = recognition/essays, etc.
- Folder structure: `/docs/milestones/` contains ALL milestone files (not split by track)

**3. Maintain queryability**
- Agents can still find "all active milestones" (search frontmatter: `status: active`)
- Agents can still find "milestones in Coaching track" (search frontmatter: `track: C`)
- Agents can still find "what we're testing" (grep for "## Hypothesis" sections)

**4. Reduce cognitive load**
- Total lines to read per milestone: 500+ lines → <100 lines (80% reduction target)
- Files to navigate per milestone: 5 files → 1 file (80% reduction)
- Folders to understand: 5 folders → 1 folder (80% reduction)

**5. Support both detailed and quick understanding**
- TL;DR section at top (30 seconds to understand)
- Deep dive sections below (5 min for full context)
- No external links required for basic comprehension

### Success Conditions: How We Know It Worked

**Measurable outcomes:**
- Time to understand a milestone: 5-10 min → <2 min (agent or human reading)
- Files to read per milestone: 4-5 files → 1 file
- Total lines per milestone: 491 lines → <100 lines
- Folders in `/docs/`: 5 specialized folders → 1 primary folder + supporting docs

**Observable behaviors:**
- Agents answer "what is C2?" by reading ONE file, not navigating folders
- User can explain strategy to outsider by showing ONE folder, not five
- Classification questions ("where does this belong?") answered by reading milestone file, not track definition file

**Qualitative feedback:**
- User reports: "Planning structure is clearer now"
- Agents report: "Understood milestone in <2 min" (vs. 5-10 min before)
- Onboarding is faster: "Here's the milestones folder" (not "here are 5 folders...")

### Constraints: What We Must Preserve from P142

**1. Track-based organization (C/R/E/X/V)**
- Keep track prefixes: C1/C2/C3, R1/R2, E1/E2, X1/X2/X3
- Tracks categorize by purpose + time horizon (coaching = 0-6mo, recognition = 3-12mo, etc.)
- Track definitions help classify new work

**2. Distinction between milestones and dated achievements**
- P142 correctly separated "C1 workstream" (ongoing work) from "2026-02-10 First Essay Published" (dated achievement)
- Keep this distinction: `planned-c2-workshops-validated.md` (checkpoint) vs. ongoing C2 work

**3. Status tracking in frontmatter**
- Keep `status: active | planned | paused | completed | killed`
- Keep priority system: `priority: p0 | p1 | p2 | p3`
- Queryable via frontmatter search

**4. Git history preservation**
- Use `git mv` to maintain file history (not delete/recreate)
- Preserve blame/log for all content (no content loss)

---

## User Stories

### As an AI agent implementing features

**Story 1: Quick milestone understanding**
- **As an** agent assigned to implement a feature in C1
- **I want** to read ONE file to understand the milestone (hypothesis, experiment, metrics, what to build)
- **So that** I can start implementation in 2 minutes, not 10 minutes navigating folders

**Story 2: Strategic queries**
- **As an** agent classifying new work
- **I want** to search milestone files for relevant hypotheses/experiments
- **So that** I can answer "which milestone tests X hypothesis?" without reading 5 folders

**Story 3: Context-aware implementation**
- **As an** agent implementing a feature
- **I want** all milestone context in one file (why we're building, what we're testing, how we measure)
- **So that** I understand business context without asking clarifying questions

### As a human (founder) planning strategy

**Story 4: Quick strategic overview**
- **As a** founder reviewing strategy
- **I want** to skim the `/docs/milestones/` folder
- **So that** I can see all active/planned work in one place (not scattered across 5 folders)

**Story 5: Explaining strategy to outsiders**
- **As a** founder pitching to potential funders
- **I want** to share one folder (`/docs/milestones/`) showing what we're building
- **So that** they understand strategy in 10 minutes (not 30+ minutes explaining folder structure)

**Story 6: Fast decision-making**
- **As a** founder deciding where new work belongs
- **I want** to read relevant milestone files to see if new idea fits
- **So that** I can classify work in 5 minutes (not 20 minutes reading hypotheses/experiments/outcomes separately)

### As a documentation maintainer

**Story 7: Consistent updates**
- **As a** maintainer updating milestone information
- **I want** to update ONE file when hypothesis/experiment/metric changes
- **So that** documentation stays consistent (not 4 separate files to update)

**Story 8: Clear structure**
- **As a** maintainer creating a new milestone
- **I want** a simple template (one file with standard sections)
- **So that** new milestones match existing structure without confusion

---

## Jobs to Be Done

### When planning strategy

**JTBD 1: Understanding current work**
- **When** reviewing what we're working on this month
- **I want** a single source of truth per milestone
- **So I can** quickly answer "what are we building and why?" without folder navigation

**JTBD 2: Evaluating new ideas**
- **When** someone proposes a new feature or experiment
- **I want** to check existing milestones to see if it fits
- **So I can** classify work accurately in minutes, not hours

**JTBD 3: Tracking progress**
- **When** checking milestone status (are we on track?)
- **I want** to read progress/metrics/kill-signals in one file
- **So I can** make go/no-go decisions quickly

### When communicating strategy

**JTBD 4: External communication**
- **When** explaining strategy to potential funders, partners, or team members
- **I want** a simple folder structure that's self-explanatory
- **So I can** communicate strategy in 10 minutes without explaining information architecture

**JTBD 5: Agent handoff**
- **When** assigning an agent to work on a milestone
- **I want** to point them to ONE file with all context
- **So I can** avoid 10-minute explanations of folder structure

### When maintaining documentation

**JTBD 6: Keeping docs accurate**
- **When** hypothesis, experiment, or metric changes
- **I want** to update one location
- **So I can** avoid documentation drift (updating hypothesis file but forgetting experiment file)

**JTBD 7: Creating new milestones**
- **When** starting a new workstream or validation checkpoint
- **I want** a clear template to follow
- **So I can** create consistent documentation without confusion about hypotheses vs. experiments vs. outcomes

---

## Outcomes (Success Metrics)

### Time Efficiency

**Metric 1: Time to understand a milestone**
- **Current:** 5-10 minutes (read 5 files, 491+ lines, navigate 4 folders)
- **Target:** <2 minutes (read 1 file, <100 lines)
- **Measurement:** Agent timestamps when starting/finishing reading milestone
- **Success threshold:** 60% reduction in time

**Metric 2: Files to navigate per milestone**
- **Current:** 4-5 files (workstream + hypothesis + experiment + key-result + track-definition)
- **Target:** 1 file (milestone file contains all context)
- **Measurement:** Count of file reads required to answer "what is C1?"
- **Success threshold:** 80% reduction (5 files → 1 file)

### Information Density

**Metric 3: Total lines per milestone**
- **Current:** 491+ lines (C1 example: 73 + 108 + 160 + 150 lines across 4 files)
- **Target:** <100 lines (single file, condensed but complete)
- **Measurement:** `wc -l` on milestone file
- **Success threshold:** 80% reduction (491 → <100)

**Metric 4: Folder count for planning**
- **Current:** 5 folders (`/workstreams/`, `/hypotheses/`, `/experiments/`, `/key-results/`, `/milestones/`)
- **Target:** 1 primary folder (`/milestones/`) + supporting docs
- **Measurement:** Count of directories in `/docs/` related to planning
- **Success threshold:** 80% reduction (5 → 1)

### Cognitive Load

**Metric 5: Classification decision time**
- **Current:** 10-20 minutes (read track definition, hypothesis template, experiment template, decide which to create)
- **Target:** <5 minutes (read relevant milestone files, decide if new work fits)
- **Measurement:** Time from "new idea proposed" to "classification decided"
- **Success threshold:** 50% reduction

**Metric 6: Onboarding explanation time**
- **Current:** 20-30 minutes (explain 5-folder structure, terminology, navigation)
- **Target:** 5-10 minutes ("Here's `/docs/milestones/`, each file is a milestone")
- **Measurement:** Time to explain planning structure to new agent/human
- **Success threshold:** 66% reduction

### Quality: Information Consistency

**Metric 7: Documentation drift incidents**
- **Current:** Risk of updating hypothesis but not experiment (4-5 files to keep in sync)
- **Target:** Zero drift (one file to update)
- **Measurement:** Count of "milestone info inconsistent across files" issues
- **Success threshold:** 100% reduction (eliminate multi-file sync requirement)

---

## Acceptance Criteria

### Structure Simplification

- [ ] All milestone files consolidated into `/docs/milestones/` folder (not split across 5 folders)
- [ ] Each milestone is ONE file containing: TL;DR, hypothesis, experiment, metrics, build requirements, kill signals
- [ ] Track categorization preserved via frontmatter (`track: C | R | E | X | V`)
- [ ] Folder count reduced: 5 specialized folders → 1 primary folder (`/docs/milestones/`)

### Content Consolidation

- [ ] C1 example: 491 lines across 5 files → <100 lines in 1 file
- [ ] All other milestones (C2, C3, R1, R2, E1, E2, X1, X2, X3) follow same pattern
- [ ] No information loss: all content from P142 structure preserved (condensed, not deleted)
- [ ] TL;DR section at top of each file (30-second understanding)
- [ ] Deep dive sections for full context (5-minute understanding)

### Queryability Maintained

- [ ] Agents can find "all active milestones" via frontmatter search (`status: active`)
- [ ] Agents can find "milestones in Coaching track" via frontmatter search (`track: C`)
- [ ] Agents can find "what hypothesis does C1 test?" by reading C1 file (no folder navigation)
- [ ] Classification still works: track definitions help decide where new work belongs

### Git History Preserved

- [ ] All file moves use `git mv` (not delete/recreate)
- [ ] Git blame/log intact for all content
- [ ] Commit message documents consolidation (references P142, explains reversal)

### Documentation Updates

- [ ] `CLAUDE.md` updated: remove references to 5-folder structure, document simplified structure
- [ ] `docs/decisions.md` updated: explain why P142 was reversed, what we learned
- [ ] `docs/HOW-TO-NAVIGATE.md` updated: simplified navigation guide (1 folder, not 5)
- [ ] Track definition files updated or archived (if still useful for classification)

### Verification

- [ ] Agent can answer "what is C1?" by reading ONE file in <2 minutes
- [ ] Human can skim `/docs/milestones/` folder and understand all active work in <10 minutes
- [ ] New milestone creation uses simplified template (one file, not 4-5)
- [ ] User confirms: "Planning structure is clearer now"

---

## Next Steps

**After business requirements approved:**

1. **Run `/architect`** (skip `/ux` — this is a documentation refactoring, no UI)
   - Technical analysis: current P142 file structure
   - Migration plan: how to consolidate 5 folders → 1 folder
   - File-by-file consolidation strategy
   - Git history preservation approach

2. **Implementation** (after architecture approved)
   - Consolidate C1 as example (prove the pattern)
   - Apply pattern to all other milestones (C2, C3, R1, R2, E1, E2, X1, X2, X3)
   - Update cross-references in strategic docs
   - Verify queryability still works

3. **Validation**
   - Agent reads C1 file, confirms <2 min to understand
   - Human reviews `/docs/milestones/` folder, confirms clearer structure
   - Measure: files read, lines read, time to answer "what is X?"

---

## Notes

### What We Learned from P142

**P142 was valuable exploration:**
- Proved we CAN separate hypotheses/experiments/outcomes (technically possible)
- Revealed tension between "queryable structure" and "cognitive simplicity"
- Showed that 5-folder structure optimizes for scale we don't have (yet)

**Key insight:**
- Separation creates clarity when you have 100+ strategic initiatives (need queryability)
- Separation creates confusion when you have 6 strategic initiatives (need simplicity)
- We're at 6 initiatives — optimize for simplicity now, revisit separation if we reach 50+

### Terminology Clarification

**User's mental model (simpler, clearer):**
- **Track** = category (C = Coaching, R = Recognition, E = Enhancement, X = Exploratory, V = Vision)
- **Milestone** = checkpoint (C1, C2, C3 are milestones in Coaching track)
- **Dated achievement** = specific event (e.g., "2026-02-10 First Essay Published")

**P142 terminology (more complex):**
- **Workstream** = ongoing work stream (not a milestone)
- **Milestone** = dated achievement only
- **Track** = category definition file

**Simplified system will use:**
- **Track** = C/R/E/X/V category (matches user mental model)
- **Milestone** = C1/C2/C3 etc. (ongoing work toward a validation checkpoint)
- **Achievement** = dated milestone files (e.g., "planned-c2-workshops-validated.md")

### Risks

**Risk 1: Lose P142 benefits**
- **Mitigation:** Preserve track categorization, queryable frontmatter, status tracking
- **Test:** After consolidation, verify agents can still find "all active milestones," "milestones in C-track"

**Risk 2: Re-expand complexity later**
- **Mitigation:** Document decision in `decisions.md` — "optimized for current scale (6 milestones), revisit if we reach 50+"
- **Test:** Set threshold: if we have 50+ strategic initiatives, re-evaluate separation

**Risk 3: Information loss during consolidation**
- **Mitigation:** Use `git mv` for history preservation, review consolidated files for completeness
- **Test:** Compare before/after — all P142 content appears in consolidated files

---

## Security Review

### Data Integrity

**⚠️ Git history preservation:**
- **Risk:** Manual copy/paste loses file history, git blame, and author attribution
- **Mitigation REQUIRED:** Use `git mv` for all file movements, not delete/recreate
- **Verification:** After each move, run `git log --follow <new-path>` to confirm history intact
- **Critical:** Must consolidate content BEFORE deleting old files (merge first, then cleanup)

**⚠️ Content completeness:**
- **Risk:** Merging 491 lines from 5 files into <100 lines risks information loss
- **Mitigation REQUIRED:** Line-by-line verification strategy for each milestone
  - Create consolidated file with ALL original content first (may be >100 lines initially)
  - Compare with source files using `diff` or manual review
  - Condense ONLY after verifying completeness (remove redundancy, not content)
  - Document what was condensed and why in commit message
- **Verification:** Diff check between P142 5-file content and consolidated single-file content
- **Test:** Agent reads consolidated file and can answer same questions as before (no information gap)

**⚠️ Link integrity:**
- **Risk:** HIGH — Spec mentions "11 broken references" already exist before this work starts
- **Risk amplification:** Moving files from 5 folders → 1 folder breaks all existing cross-references
- **Mitigation REQUIRED:**
  - Run link validation BEFORE starting (baseline broken links)
  - After consolidation, run link validation again
  - Fix ALL new broken links (not just pre-existing ones)
  - Update references in: `CLAUDE.md`, `HOW-TO-NAVIGATE.md`, `decisions.md`, feature specs
- **Verification script needed:** `./scripts/validate-doc-links.cjs` (check if exists, create if missing)

**✅ Rollback capability:**
- **Strength:** P142 completed Feb 13, only 1 day ago — easy rollback
- **Mitigation:** Create feature branch before starting, test full consolidation on branch
- **Recovery plan:**
  - If consolidation breaks: `git reset --hard origin/main` (if on feature branch)
  - If already merged to main: `git revert <consolidation-commit>`
  - If git history corrupted: Restore from P142 completed state (1 commit back)

### Migration Safety

**✅ Incremental validation (REQUIRED strategy):**
- **Phase 1: Consolidate C1 as proof-of-concept**
  - Merge 5 C1 files into one
  - Verify: agent reads C1, confirms <2 min understanding, no information loss
  - Test queries: "what is C1 testing?", "what are C1 metrics?", "what is C1 kill signal?"
  - STOP if validation fails — fix C1 before proceeding to other milestones
- **Phase 2: Apply pattern to remaining milestones (C2, C3, R1, R2, E1, E2, X1, X2, X3)**
  - One milestone at a time, validate after each
  - Compare before/after for each milestone
- **Phase 3: Update cross-references**
  - CLAUDE.md, HOW-TO-NAVIGATE.md, decisions.md
  - Run link validation
- **Phase 4: Delete old folders ONLY after all verification passes**
  - Last step, not first step
  - Commit deletions separately (easy to revert if needed)

**✅ Backup strategy:**
- **Pre-work snapshot:** Create branch `feature/p144-simplify-planning` before any changes
- **P142 preservation:** Tag current state as `p142-complete` for easy reference
- **Incremental commits:** Commit after each phase (C1 consolidation, C2 consolidation, etc.)
- **Verification commits:** Separate commits for verification script updates

**⚠️ Verification scripts:**
- **Missing:** No automated link validation script mentioned in acceptance criteria
- **Risk:** Manual link checking error-prone (11 broken links already suggests manual process failed)
- **Mitigation REQUIRED:**
  - Create `./scripts/validate-doc-links.cjs` (check `/docs/`, `/features/`, `CLAUDE.md`)
  - Run before consolidation (baseline), after consolidation (detect new breaks)
  - Add to pre-commit checks (prevent future link rot)
- **Verification:** Script detects all markdown links, checks file existence, reports broken links with context

### Risk Assessment

**HIGH RISK: Content loss during merge**
- **Why HIGH:** Condensing 491 lines → <100 lines (80% reduction) creates pressure to delete, not condense
- **Impact:** Lost strategic context = agents can't understand milestone fully = broken implementation
- **Mitigation:**
  - **DO NOT optimize for line count first** — optimize for completeness first
  - If consolidated C1 is 150 lines, that's fine (still better than 491 across 5 files)
  - Condense only AFTER verifying completeness (remove redundancy, not unique content)
  - Review consolidated content with user before deletion

**HIGH RISK: Link breakage cascade**
- **Why HIGH:** Moving files from 5 folders → 1 folder changes ALL relative paths
- **Impact:** Broken links in CLAUDE.md, feature specs, strategic docs = navigation failures
- **Mitigation:**
  - Automated link validation (required script creation)
  - Update cross-references BEFORE deleting old files (old files still exist during link updates)
  - Test navigation workflows: "agent finding C1 info", "human reading strategy docs"

**MEDIUM RISK: Tool breakage (kanban, validation scripts)**
- **Why MEDIUM:** Scripts may hardcode folder paths (`/workstreams/`, `/hypotheses/`)
- **Impact:** Kanban server fails to load milestones, validation scripts skip files
- **Mitigation:**
  - Search codebase for hardcoded paths: `grep -r "workstreams\|hypotheses\|experiments\|key-results" scripts/`
  - Update discovered scripts before consolidation
  - Test kanban server after Phase 1 (C1 consolidation) — verify milestone appears

**LOW RISK: Re-expansion complexity**
- **Why LOW:** If we need 5-folder structure again (at 50+ milestones), P142 git history shows how to split
- **Impact:** Future migration work, but not immediate risk
- **Mitigation:** Document decision in decisions.md (threshold: 50+ milestones triggers re-evaluation)

### Critical Mitigations (MUST DO)

1. **Pre-consolidation checklist:**
   - [ ] Create feature branch `feature/p144-simplify-planning`
   - [ ] Tag current state as `p142-complete`
   - [ ] Search for hardcoded paths: `grep -r "workstreams\|hypotheses\|experiments\|key-results" scripts/ src/`
   - [ ] Run baseline link validation (document current broken links)
   - [ ] Backup `.mcp.json` and other configs (per CLAUDE.md safety protocol)

2. **During consolidation (for EACH milestone):**
   - [ ] Use `git mv` to move files (never delete/recreate)
   - [ ] Merge ALL content into consolidated file (completeness over brevity)
   - [ ] Verify with diff: `diff -r old-folder/ new-file.md` (conceptual — adapt for markdown)
   - [ ] Test agent understanding: can agent answer same questions as before?
   - [ ] Commit consolidation separately (one commit per milestone)

3. **Post-consolidation verification:**
   - [ ] Run link validation script (detect ALL new broken links)
   - [ ] Fix broken links BEFORE deleting old folders
   - [ ] Test kanban server (verify milestones load correctly)
   - [ ] Test agent workflows: "what is C1?", "find all active milestones", "classify new work"
   - [ ] User review: "Planning structure clearer?" (qualitative feedback)

4. **CLAUDE.md updates (BEFORE deleting old folders):**
   - [ ] Run `/claude-md-maintain` BEFORE updating (baseline analysis)
   - [ ] Update CLAUDE.md, decisions.md, HOW-TO-NAVIGATE.md (minimal changes only)
   - [ ] Run `/claude-md-maintain` AFTER updating (verify minimal changes)
   - [ ] **STOP if excessive changes** - revert and make minimal updates only
   - [ ] User reviews CLAUDE.md changes before proceeding

5. **Final cleanup (LAST STEP ONLY):**
   - [ ] Delete old folders (`/workstreams/`, `/hypotheses/`, `/experiments/`, `/key-results/`) in separate commit
   - [ ] Re-run link validation (should be zero new broken links)
   - [ ] Tag completion: `p144-complete`

### Approval Gates

**STOP and ask user if:**
- ⚠️ Consolidated C1 file >150 lines (may indicate verbosity, not condensation failure)
- ⚠️ Diff check shows content missing between P142 files and consolidated file
- ⚠️ Link validation detects >5 new broken links (suggests systematic path error)
- ⚠️ Kanban server fails to load milestones after Phase 1
- ⚠️ Agent takes >2 min to understand consolidated C1 (target not met)

**Proceed automatically if:**
- ✅ C1 consolidation complete, verified, <2 min understanding time
- ✅ Zero new broken links detected
- ✅ Kanban server loads milestones correctly
- ✅ All git history intact (log --follow works)

---

## Related Work

**P142: Information Architecture Restructure**
- Created 5-folder structure: workstreams, hypotheses, experiments, key-results, milestones
- Introduced terminology: workstream, track definitions, outcome → key-result
- Completed: 2026-02-13

**This work (P144) is:**
- **NOT a rejection of P142** — P142 proved we CAN separate concerns (valuable learning)
- **A simplification for current scale** — 6 milestones don't need 5-folder structure
- **Reversible** — if we reach 50+ milestones, we can re-apply P142 separation

---

## Technical Architecture

### Current State Analysis

**Folder Structure (P142 implementation):**
```
docs/
├── workstreams/        # 12 files (5 track definitions + 6 milestone workstreams + README)
│   ├── c1-stories-live-events.md (73 lines)
│   ├── e1-points-ai-stories.md
│   ├── e2-scale-partners-async.md
│   ├── x1-asymmetric-conversion.md
│   ├── x2-social-dynamics.md
│   ├── x3-network-effects.md
│   ├── coaching-track.md (track definition)
│   ├── enhancement-track.md (track definition)
│   ├── exploratory-track.md (track definition)
│   ├── recognition-track.md (track definition)
│   ├── vision-track.md (track definition)
│   └── README.md
├── hypotheses/         # 2 files
│   ├── h-stories-solve-cold-start.md (108 lines)
│   └── h-recognition-via-essays.md (56 lines)
├── experiments/        # 2 files
│   ├── e-story-creation-pilot.md (160 lines)
│   └── e-essay-publishing.md (44 lines)
├── key-results/        # 2 files
│   ├── kr-story-usage.md (150 lines)
│   └── kr-essay-reach.md (41 lines)
└── milestones/         # 6 files (dated achievements, not workstreams)
    ├── 2026-02-10-first-essay-published.md
    ├── planned-c2-workshops-validated.md
    ├── planned-c3-paid-workshops-validated.md
    ├── planned-r1-essay-reach-validated.md
    ├── planned-r2-spec-credibility-validated.md
    └── planned-recognition-checkpoint.md
```

**Content Distribution Analysis:**

**C1 Milestone (Stories + Live + Events):**
- Workstream file: `/docs/workstreams/c1-stories-live-events.md` (73 lines)
- Hypothesis: `/docs/hypotheses/h-stories-solve-cold-start.md` (108 lines)
- Experiment: `/docs/experiments/e-story-creation-pilot.md` (160 lines)
- Key Result: `/docs/key-results/kr-story-usage.md` (150 lines)
- **Total: 491 lines across 4 files in 4 directories**

**R1 Milestone (Essay Writing):**
- **MISSING:** No R1 workstream file in `/docs/workstreams/`
- Hypothesis: `/docs/hypotheses/h-recognition-via-essays.md` (56 lines)
- Experiment: `/docs/experiments/e-essay-publishing.md` (44 lines)
- Key Result: `/docs/key-results/kr-essay-reach.md` (41 lines)
- Planned milestone: `/docs/milestones/planned-r1-essay-reach-validated.md` (67 lines)
- **Total: 208 lines across 4 files (no central workstream file)**
- **NOTE:** Planned milestone file contains some workstream content (TL;DR, hypothesis, experiment, metrics)

**E1, E2, X1, X2, X3 Milestones:**
- Workstream files exist in `/docs/workstreams/`
- **MISSING:** No split files (hypotheses, experiments, key-results)
- These are placeholder workstreams (not yet validated)

**Broken Link Inventory (discovered via grep analysis):**
```
1. h-stories-solve-cold-start.md:108   → ../tracks/c1-stories-live-events.md (should be ../workstreams/)
2. e-story-creation-pilot.md:155      → ../tracks/c1-stories-live-events.md (should be ../workstreams/)
3. h-recognition-via-essays.md:56     → ../tracks/r1-essay-writing.md (file doesn't exist)
4. kr-essay-reach.md:41               → ../tracks/r1-essay-writing.md (file doesn't exist)
5-11. Multiple files                  → ../outcomes/* (folder doesn't exist, should be ../key-results/)
```

**Git History Preservation:**
- P142 completed: `abb8f9b feat(p142): complete information architecture restructure` (2026-02-13)
- Files created via `git mv` from original locations (history preserved)
- Current files are <24 hours old (easy to revert if needed)

**Code Dependencies (grep results):**
```
tools/kanban/src/lib/types.ts:23      workstream?: string // Field exists, no path dependency
scripts/validate-doc-links.cjs:43     DIRS.tracks = 'docs/workstreams' (HARDCODED PATH)
scripts/validate-doc-links.cjs:46     DIRS.outcomes = 'docs/key-results' (HARDCODED PATH)
CLAUDE.md:395                         [workstreams/](docs/workstreams/) (navigation link)
```

### Architecture Decisions

**Decision 1: Merge Strategy — Sequential with Verification**
- **Chosen:** Merge split files → workstream file for C1 first, then R1, then verify before proceeding to placeholders
- **Rationale:**
  - C1 has complete 4-file split (73 + 108 + 160 + 150 = 491 lines) — best test case
  - R1 missing workstream file but has planned milestone file with some content
  - E/X milestones are placeholders (no split files to merge)
  - Validates merge pattern on real data before generalizing
- **Trade-off:**
  - PRO: Catch merge issues early (C1 is most complex)
  - PRO: Can refine condensation strategy after C1 learning
  - CON: Slower than parallel merge (but safer)
- **Alternative rejected:** Parallel merge all milestones at once — risks propagating merge errors across all files

**Decision 2: Content Consolidation Approach — Completeness First, Condense Second**
- **Chosen:** Merge ALL content first (may exceed 100 lines), verify completeness, then condense by removing redundancy
- **Rationale:**
  - Target of <100 lines is ASPIRATIONAL (80% reduction from 491 lines)
  - Missing content is CATASTROPHIC (agents can't implement features correctly)
  - Redundancy removal is SAFE (same info stated multiple ways)
  - Example: C1 experiment file has "Decision 1/2/3/4" sections — can condense to "Key Decisions" section
- **Trade-off:**
  - PRO: Zero risk of content loss
  - PRO: User can review completeness before condensation
  - CON: Initial consolidated file may be 150-200 lines (still 60% reduction)
  - CON: Requires second pass for condensation (more work)
- **Alternative rejected:** Condense while merging — risks losing unique content in rush to hit line count target

**Decision 3: R1 Special Case — Create Missing Workstream File**
- **Chosen:** Extract workstream content from `planned-r1-essay-reach-validated.md` to create `r1-essay-writing.md`
- **Rationale:**
  - R1 planned milestone file (67 lines) already contains TL;DR, hypothesis, experiment, metrics
  - This is workstream content (ongoing work), not dated milestone content (achievement)
  - P142 pattern: workstream file (ongoing) vs. milestone file (checkpoint)
  - Creating R1 workstream file makes structure consistent with C1
- **Trade-off:**
  - PRO: Consistent structure (C1 and R1 both have workstream files)
  - PRO: Planned milestone file can focus on checkpoint definition only
  - CON: Requires extracting content from existing file (merge source is split across 2 files)
- **Alternative rejected:** Leave R1 as-is (no workstream file) — creates inconsistency, harder to query "what is R1?"

**Decision 4: Git Operations — Use git mv for Folder Rename, Manual Merge for Content**
- **Chosen:**
  - Content merge: Manual edit (copy content from 4 files → 1 consolidated file)
  - Folder rename: `git mv docs/workstreams docs/milestones` (after merge complete)
  - File deletion: `git rm` old split files (after verification)
- **Rationale:**
  - Git mv preserves history for folder rename (important for blame/log)
  - Manual merge preserves ALL file histories (workstream file + hypothesis file + experiment file)
  - Can't use git mv for content merge (merging 4 files into 1, not moving 1 file)
  - Git operations happen AFTER content consolidation (content changes committed first)
- **Trade-off:**
  - PRO: All git history preserved (folder rename + original file histories)
  - PRO: Can track "where did this line come from?" across merge (git log --follow)
  - CON: Manual merge = manual verification required (can't automate diff check)
- **Alternative rejected:** Delete files and recreate — loses all git history, breaks blame/log

**Decision 5: Broken Links — Fix in Two Phases (Pre-existing + New)**
- **Chosen:**
  - Phase 1: Document baseline broken links (11 known: tracks/ → workstreams/, outcomes/ → key-results/)
  - Phase 2: Fix baseline links first (before consolidation)
  - Phase 3: Consolidate files (workstreams/ → milestones/)
  - Phase 4: Fix new broken links from consolidation
  - Phase 5: Run validation (should be zero broken links)
- **Rationale:**
  - Pre-existing broken links (11) are P142 artifacts (tracks/ folder never existed, outcomes/ renamed to key-results/)
  - Mixing pre-existing + new breaks creates confusion ("which breaks are ours?")
  - Fixing baseline first = clean slate for measuring consolidation impact
  - Can attribute any new breaks to P144 work (not P142 debt)
- **Trade-off:**
  - PRO: Clear ownership (pre-existing = P142 debt, new = P144 regressions)
  - PRO: Can test link validation script on known breaks (verify script works)
  - CON: More phases = more work (but safer)
- **Alternative rejected:** Fix all links at end — can't distinguish P142 debt from P144 regressions

**Decision 6: Verification Strategy — Multi-Layer Validation**
- **Chosen:** Three verification layers:
  1. **Automated:** Link validation script (detect broken markdown links)
  2. **Automated:** Git history check (`git log --follow` confirms history preserved)
  3. **Manual:** Agent comprehension test (can agent answer "what is C1?" in <2 min?)
- **Rationale:**
  - Link validation catches navigation breaks (CLAUDE.md, cross-references)
  - Git history check catches history loss (blame/log still work)
  - Agent test catches content loss (can't automate "did we lose strategic context?")
  - Three layers = defense in depth (one layer fails, others catch issues)
- **Trade-off:**
  - PRO: High confidence (catches technical + semantic errors)
  - PRO: Agent test aligns with success metric (time to understand milestone)
  - CON: Manual agent test = human time required (can't fully automate)
- **Alternative rejected:** Link validation only — misses content loss, git history corruption

**Decision 7: Rollback Strategy — Feature Branch + Incremental Commits**
- **Chosen:**
  - Create `feature/p144-simplify-planning` branch before any work
  - Tag current state as `p142-complete` (easy reference point)
  - Commit after each phase (C1 merge, R1 merge, link fixes, folder rename, deletions)
  - Merge to main only after all verification passes
- **Rationale:**
  - Feature branch = can nuke entire branch if consolidation fails
  - Incremental commits = can cherry-pick successful phases
  - Tags = easy rollback to P142 state if needed
  - P142 completed <24 hours ago = very fresh, easy to revert
- **Trade-off:**
  - PRO: Safe experimentation (can't break main branch)
  - PRO: Granular rollback (can undo just Phase 3 if Phase 2 worked)
  - CON: Merge conflicts if main branch changes during P144 work
- **Alternative rejected:** Work directly on main — risky, harder to rollback

### Implementation Approach

**Phase 1: Pre-Flight Checks (Baseline Establishment)**

**Steps:**
1. Create feature branch: `git checkout -b feature/p144-simplify-planning`
2. Tag current state: `git tag p142-complete`
3. Run baseline link validation: `./scripts/validate-doc-links.cjs --verbose > /tmp/p144-baseline-links.txt`
   - Expected: 11 broken links (tracks/ and outcomes/ references)
   - Document baseline for comparison
4. Search for hardcoded paths:
   ```bash
   grep -r "docs/workstreams\|docs/hypotheses\|docs/experiments\|docs/key-results" \
     scripts/ tools/ .claude/ CLAUDE.md docs/*.md
   ```
   - Update list of files requiring path changes
5. Verify validation script exists and works:
   - Script already exists: `/Users/slavochek/Projects/public/claritypledge/scripts/validate-doc-links.cjs`
   - Confirms P142 structure is recognized
   - Can detect broken links (currently 11 known breaks)

**Deliverables:**
- Feature branch created
- Baseline link report saved
- List of files with hardcoded paths (for Phase 5 updates)

**Phase 2: Fix Pre-Existing Broken Links (P142 Debt)**

**Broken links to fix (11 total):**
1. `h-stories-solve-cold-start.md` → Change `../tracks/c1-stories-live-events.md` to `../workstreams/c1-stories-live-events.md`
2. `e-story-creation-pilot.md` → Change `../tracks/c1-stories-live-events.md` to `../workstreams/c1-stories-live-events.md`
3. `h-recognition-via-essays.md` → Remove link to `../tracks/r1-essay-writing.md` (file doesn't exist)
4. `kr-essay-reach.md` → Remove link to `../tracks/r1-essay-writing.md` (file doesn't exist)
5-11. Multiple files → Change `../outcomes/*` to `../key-results/*`

**Steps:**
1. Fix tracks/ → workstreams/ references (2 files)
2. Remove broken r1-essay-writing.md references (2 files)
3. Fix outcomes/ → key-results/ references (remaining files)
4. Run validation: `./scripts/validate-doc-links.cjs`
   - Expected: 0 broken links (baseline cleared)
5. Commit: `git commit -m "fix(p142): correct tracks→workstreams and outcomes→key-results links"`

**Deliverables:**
- All P142 broken links fixed
- Validation passes (0 broken links)
- Clean baseline for Phase 3 consolidation

**Phase 3: Content Consolidation — C1 Milestone (Proof of Concept)**

**Source files (4 files → 1 file):**
- `/docs/workstreams/c1-stories-live-events.md` (73 lines) — TL;DR + links to other files
- `/docs/hypotheses/h-stories-solve-cold-start.md` (108 lines) — hypothesis statement, rationale, assumptions, evidence, success criteria
- `/docs/experiments/e-story-creation-pilot.md` (160 lines) — experiment protocol, measurements, sample size, success thresholds
- `/docs/key-results/kr-story-usage.md` (150 lines) — SMART goal, measurement method, target values, tracking over time

**Consolidation strategy:**
1. Start with workstream file as base (has correct frontmatter + TL;DR)
2. Add hypothesis content:
   - Section: `## Hypothesis`
   - Include: hypothesis statement, rationale, assumptions, evidence
   - Remove: redundant intro, Related Documents section (no longer needed)
3. Add experiment content:
   - Section: `## How We're Testing`
   - Include: protocol, measurements, sample size, timeline
   - Condense: Merge "Experimental Design Decisions" into "Key Decisions" subsection
4. Add key result content:
   - Section: `## What We're Measuring`
   - Include: SMART goal, target value, kill threshold
   - Condense: Remove "Tracking Over Time" (covered in experiment timeline)
   - Condense: Remove "Data Sources" (implementation detail, not strategic)
5. Review and condense:
   - Remove duplicate intro sections (each file has "what is C1" intro)
   - Merge Related Documents sections (consolidate all cross-references)
   - Remove verbose examples (keep essential, remove illustrative)

**Target structure (consolidated file):**
```markdown
---
status: active
priority: p1
track: C
milestone: C1
tests: [h-stories-solve-cold-start]
builds: [p128, p124]
measures: [kr-story-usage]
answers: [oq-6, oq-7]
---

# C1: Stories + Live + Events (Coaching Foundation)

## TL;DR (30-second summary)
[Keep from workstream file — already concise]

## Hypothesis
[From h-stories-solve-cold-start.md]
- Statement
- Rationale
- Key assumptions

## How We're Testing
[From e-story-creation-pilot.md]
- Experiment protocol
- Sample: 20 users, 4 weeks
- Key decisions (condensed from Decision 1/2/3/4)

## What We're Measuring
[From kr-story-usage.md]
- SMART goal
- Target: ≥50% creation, ≥30% verification
- Kill signal: <20% creation

## What We're Building
[From workstream file]
- Phase 1-2: Story creation
- Phase 3: /live beginning screen (P128)
- Phase 4: Event rooms (P124)

## Related Documents
[Consolidated from all 4 files]
```

**Verification (REQUIRED before proceeding):**
1. Diff check: Compare consolidated file with 4 source files
   - Manual review: "Did we lose any unique content?"
   - Check each section from source appears in consolidated file
2. Agent comprehension test:
   - Agent reads consolidated file
   - Agent answers 5 questions (expected answers):
     - Q: "What is C1 testing?" → Expected: "Stories solve cold start problem"
     - Q: "What are success metrics?" → Expected: "≥50% create 2nd story, ≥30% verify"
     - Q: "What are we building?" → Expected: "Story creation (P126) + /live beginning screen (P128) + event rooms (P124)"
     - Q: "What is kill signal?" → Expected: "<20% creation rate after 2 weeks"
     - Q: "What questions does C1 answer?" → Expected: "OQ-6 (internal trigger), OQ-7 (need for points)"
   - Time to understand: Should be <2 min (from reading file to answering questions)
   - **User validates agent responses** before proceeding
   - PASS if all answers correct and <2 min
3. Line count check:
   - Count lines: `wc -l docs/milestones/c1-stories-live-events.md`
   - Target: <150 lines (if >150, review for condensation opportunities)
   - ACCEPTABLE range: 80-150 lines (still 60-70% reduction from 491)
4. **Compare to pre-P142 original (CRITICAL):**
   - Checkout original: `git show 2ac71d2:docs/milestones/c1-stories-live-events.md > /tmp/c1-original.md`
   - Verify ALL original sections present: Hypothesis, How to test, Success criteria, Kill signal, Build requirements
   - Check OQ-6, OQ-7 answers preserved
   - **STOP if:** Any original content missing from consolidated file
   - **Why this matters:** P142 expanded content 7.7x. This verifies we preserved ORIGINAL seed content, not just P142 elaborations.

**Steps:**
1. Copy workstream file to milestones: `cp docs/workstreams/c1-stories-live-events.md docs/milestones/c1-stories-live-events.md`
2. Edit consolidated file: Merge content from 4 source files (following structure above)
3. Review completeness: Check all unique content from sources appears in consolidated file
4. Condense: Remove redundancy, verbose examples (keep essential content)
5. Verify: Diff check + agent test + line count
6. Commit: `git commit -m "feat(p144): consolidate C1 milestone (491 lines → X lines, 4 files → 1)"`
   - Include before/after line counts in commit message
   - Note condensation decisions (what was removed and why)

**Stop conditions (MUST ask user before proceeding):**
- ❌ Consolidated file >200 lines (condensation failed, too verbose)
- ❌ Agent test fails (can't answer questions or takes >2 min)
- ❌ Diff check reveals missing content (unique content lost)

**Deliverables:**
- `/docs/milestones/c1-stories-live-events.md` (consolidated, verified)
- Commit with before/after metrics
- Verification report (diff check + agent test results)

**Phase 4: Content Consolidation — R1 Milestone (Special Case)**

**Source files (4 files → 1 file, but different sources):**
- `/docs/milestones/planned-r1-essay-reach-validated.md` (67 lines) — Already contains TL;DR, hypothesis, experiment, metrics
- `/docs/hypotheses/h-recognition-via-essays.md` (56 lines) — More detailed hypothesis
- `/docs/experiments/e-essay-publishing.md` (44 lines) — Experiment protocol
- `/docs/key-results/kr-essay-reach.md` (41 lines) — Key result details
- **MISSING:** No workstream file (will create)

**Consolidation strategy:**
1. Start with planned milestone file as base (has TL;DR + overview)
2. Enhance with hypothesis details (from h-recognition-via-essays.md)
3. Enhance with experiment details (from e-essay-publishing.md)
4. Enhance with key result details (from kr-essay-reach.md)
5. Remove "planned-" prefix, rename to `r1-essay-writing.md`
6. Update frontmatter: status from "planned" to "active" (work already running)

**Target structure: Same as C1 pattern**

**Verification: Same as Phase 3**

**Steps:**
1. Copy planned milestone file: `cp docs/milestones/planned-r1-essay-reach-validated.md docs/milestones/r1-essay-writing.md`
2. Edit: Merge content from 4 source files
3. Update frontmatter: status: active, add track: R, milestone: R1
4. Verify: Diff + agent test + line count
5. Commit: `git commit -m "feat(p144): consolidate R1 milestone (208 lines → X lines)"`

**Deliverables:**
- `/docs/milestones/r1-essay-writing.md` (consolidated, verified)
- Commit with metrics

**Phase 5: Update Cross-References (Fix Paths Before Deletion)**

**Files requiring updates (from grep analysis):**
1. `scripts/validate-doc-links.cjs` (lines 43, 46) — Update DIRS.tracks, DIRS.outcomes
2. `CLAUDE.md` (line 395) — Update navigation links
3. `.claude/commands/slava/build/create-prd/agent.md` — Check for hardcoded paths
4. `docs/HOW-TO-NAVIGATE.md` — Update navigation guide
5. `docs/decisions.md` — Add P144 decision (why simplified)
6. `docs/workstreams/README.md` — Archive or delete (no longer needed)

**Steps:**
1. Update validation script:
   ```javascript
   // OLD
   DIRS.tracks = path.join(__dirname, '..', 'docs', 'workstreams')
   DIRS.outcomes = path.join(__dirname, '..', 'docs', 'key-results')

   // NEW
   DIRS.tracks = path.join(__dirname, '..', 'docs', 'milestones')
   DIRS.outcomes = path.join(__dirname, '..', 'docs', 'milestones')
   ```
   - Note: Script will need refactor (tracks and outcomes are now in same folder)
   - Simplify script to validate milestones/ only (no separate folders)

2. **CRITICAL: Run /claude-md-maintain BEFORE changes:**
   ```bash
   # Baseline - analyze current CLAUDE.md
   # Agent will identify all planning-related sections
   # Documents current state before modification
   ```
   - Expected output: Sections related to workstreams/, hypotheses/, experiments/, key-results/
   - Save agent analysis for comparison after changes

3. Update CLAUDE.md:
   ```markdown
   // OLD
   [workstreams/](docs/workstreams/) | [hypotheses/](docs/hypotheses/) | [experiments/](docs/experiments/) | [key-results/](docs/key-results/)

   // NEW
   [milestones/](docs/milestones/)
   ```

3. Update HOW-TO-NAVIGATE.md:
   - Remove 5-folder navigation guide
   - Add simple guide: "Milestones are in `/docs/milestones/`, one file per milestone"

4. Update decisions.md:
   - Add decision: "2026-02-14: Simplified planning system (P144)"
   - Rationale: "5-folder structure optimized for scale we don't have (6 milestones vs 50+)"
   - Reversibility: "If we reach 50+ milestones, re-evaluate separation (P142 pattern)"

5. Check other files:
   - Grep for remaining references: `grep -r "workstreams\|hypotheses\|experiments\|key-results" .`
   - Update any discovered references

6. **CRITICAL: Run /claude-md-maintain AFTER changes:**
   ```bash
   # Verify changes - analyze updated CLAUDE.md
   # Agent compares to baseline (from step 2)
   # Flags if changes are excessive or non-minimal
   ```
   - Expected: Only planning-related sections changed
   - Expected: Minimal changes (folder paths updated, nothing else)
   - **STOP if:** Agent reports excessive changes or unrelated sections modified
   - **Fix:** Revert CLAUDE.md, make minimal changes only, re-run verification

7. **CRITICAL: Test Kanban BEFORE Deletion:**
   ```bash
   # Build kanban
   npm run build

   # Start kanban server
   npm run kanban
   # Open http://localhost:9050
   ```
   - **Verification checklist:**
     - [ ] Kanban server starts without errors
     - [ ] C1, R1 milestones appear in sidebar
     - [ ] Milestone badges display on feature cards
     - [ ] Filter by milestone works
     - [ ] Drag-and-drop updates frontmatter correctly
   - **STOP if:** Kanban doesn't start, milestones missing, filter broken, or drag-drop fails
   - **Why test now:** If path changes broke kanban, discover BEFORE deleting old files (easy rollback)

8. Commit: `git commit -m "docs(p144): update cross-references for simplified structure"`

**Deliverables:**
- All cross-references updated
- Validation script updated (or simplified)
- Documentation updated (CLAUDE.md, HOW-TO-NAVIGATE.md, decisions.md)
- **CLAUDE.md verification:** Before/after analysis from /claude-md-maintain confirms minimal changes
- **Approval gate:** User reviews CLAUDE.md changes before proceeding to Phase 6

**Phase 6: Folder Rename and Cleanup (LAST STEP)**

**This is the DESTRUCTIVE phase — do LAST, after all verification passes.**

**Steps:**
1. Verify all previous phases complete:
   - [ ] C1 consolidated and verified
   - [ ] R1 consolidated and verified
   - [ ] Cross-references updated
   - [ ] Link validation passes (0 broken links)

2. **User Decision Required: Track Definition Files**

   **Files in question:**
   - `docs/workstreams/coaching-track.md`
   - `docs/workstreams/recognition-track.md`
   - `docs/workstreams/enhancement-track.md`
   - `docs/workstreams/exploratory-track.md`
   - `docs/workstreams/vision-track.md`

   **Options:**
   - **Option A (RECOMMENDED):** KEEP → Move to `docs/milestones/` (classification guides remain useful)
   - **Option B:** ARCHIVE → Move to `features/archive/p142-track-definitions/` (preserve but not active)
   - **Option C:** DELETE → Only if absolutely certain not needed (not recommended)

   **Rationale for keeping:** These files help agents classify new work (is it Coaching, Recognition, Enhancement, etc.)

   **User approval required before proceeding**

3. Delete old split files:
   ```bash
   git rm docs/hypotheses/h-stories-solve-cold-start.md
   git rm docs/hypotheses/h-recognition-via-essays.md
   git rm docs/experiments/e-story-creation-pilot.md
   git rm docs/experiments/e-essay-publishing.md
   git rm docs/key-results/kr-story-usage.md
   git rm docs/key-results/kr-essay-reach.md
   ```

3. Delete old workstream files (that were consolidated):
   ```bash
   git rm docs/workstreams/c1-stories-live-events.md
   # Keep E1, E2, X1, X2, X3 workstream files (not yet consolidated)
   # Keep track definition files (coaching-track.md, etc.) — may still be useful
   ```

4. Delete empty folders:
   ```bash
   rmdir docs/hypotheses/    # Should be empty after deletions
   rmdir docs/experiments/   # Should be empty after deletions
   rmdir docs/key-results/   # Should be empty after deletions
   ```

5. Commit deletions:
   ```bash
   git commit -m "chore(p144): remove old split files (hypotheses, experiments, key-results)

   Deleted files:
   - hypotheses/h-stories-solve-cold-start.md (merged into c1-stories-live-events.md)
   - hypotheses/h-recognition-via-essays.md (merged into r1-essay-writing.md)
   - experiments/e-story-creation-pilot.md (merged into c1-stories-live-events.md)
   - experiments/e-essay-publishing.md (merged into r1-essay-writing.md)
   - key-results/kr-story-usage.md (merged into c1-stories-live-events.md)
   - key-results/kr-essay-reach.md (merged into r1-essay-writing.md)
   - workstreams/c1-stories-live-events.md (moved to milestones/)

   Deleted folders:
   - docs/hypotheses/ (content merged into milestones/)
   - docs/experiments/ (content merged into milestones/)
   - docs/key-results/ (content merged into milestones/)

   All content preserved in consolidated milestone files.
   "
   ```

6. Final verification:
   ```bash
   ./scripts/validate-doc-links.cjs
   npm run kanban  # Verify milestones still load
   ```

7. Tag completion:
   ```bash
   git tag p144-complete
   ```

**Deliverables:**
- Old folders deleted
- Git history preserved (all deletions tracked)
- Validation passes
- Tag created

**Phase 7: Final Validation (Acceptance Criteria Check)**

**Verification checklist:**
- [ ] All milestone files in `/docs/milestones/` (not split across 5 folders)
- [ ] C1 file contains TL;DR, hypothesis, experiment, metrics, build requirements (<150 lines)
- [ ] R1 file contains TL;DR, hypothesis, experiment, metrics (<100 lines)
- [ ] Folder count reduced: 5 folders → 1 folder (hypotheses/, experiments/, key-results/ deleted)
- [ ] Agents can find "all active milestones" via frontmatter: `grep "status: active" docs/milestones/*.md`
- [ ] Agents can find "Coaching track milestones" via frontmatter: `grep "track: C" docs/milestones/*.md`
- [ ] Git history intact: `git log --follow docs/milestones/c1-stories-live-events.md` shows history
- [ ] Link validation passes: `./scripts/validate-doc-links.cjs` (0 broken links)
- [ ] Kanban loads milestones: `npm run kanban` (verify C1, R1 appear)
- [ ] Agent comprehension test: Agent reads C1, answers "what is C1?" in <2 min

**Acceptance test:**
1. Run agent comprehension test:
   - Agent reads `/docs/milestones/c1-stories-live-events.md`
   - Agent answers:
     - "What hypothesis does C1 test?"
     - "How are we testing C1?"
     - "What are the success metrics?"
     - "What are we building for C1?"
     - "What is the kill signal?"
   - Time: Should be <2 min from start to answering all questions
   - PASS if all answers correct and <2 min

2. Run link validation:
   ```bash
   ./scripts/validate-doc-links.cjs
   # Expected: All links valid, 0 broken links
   ```

3. Run kanban server:
   ```bash
   npm run kanban
   # Open http://localhost:9050
   # Verify: C1, R1 milestones appear in kanban
   # Verify: Can drag milestones, frontmatter updates correctly
   ```

4. **Content Preservation Grep Checks (CRITICAL):**
   ```bash
   # Verify unique content from P142 elaborations preserved
   grep -q "Evidence" docs/milestones/c1-stories-live-events.md || echo "FAIL: Evidence section missing"
   grep -q "SMART" docs/milestones/c1-stories-live-events.md || echo "FAIL: SMART goals missing"
   grep -q "≥50%" docs/milestones/c1-stories-live-events.md || echo "FAIL: Quantified thresholds missing"
   grep -q "20-user pilot" docs/milestones/c1-stories-live-events.md || echo "FAIL: Experiment details missing"
   grep -q "OQ-6" docs/milestones/c1-stories-live-events.md || echo "FAIL: Open questions missing"
   ```
   - **Verification:** All grep checks pass (no "FAIL" output)
   - **STOP if:** Any key phrase missing (indicates content loss during consolidation)
   - **Why this matters:** Verifies that P142's unique elaborations (evidence, SMART goals, quantified metrics) were preserved, not just original content

4. User review:
   - User reads `/docs/milestones/` folder
   - User confirms: "Planning structure is clearer now"
   - User confirms: "Can understand milestones faster"

**Deliverables:**
- All acceptance criteria met
- Test results documented
- User confirmation received

### Files to Create

**None** — This is a refactoring task (consolidate existing files, no new files needed)

**Exception:** If validation script needs updates, create:
- `scripts/validate-doc-links.cjs` (already exists, may need simplification)

### Files to Modify

**Phase 2 (Fix pre-existing broken links):**
- `docs/hypotheses/h-stories-solve-cold-start.md` (fix tracks/ link)
- `docs/experiments/e-story-creation-pilot.md` (fix tracks/ link)
- `docs/hypotheses/h-recognition-via-essays.md` (remove broken r1-essay-writing link)
- `docs/key-results/kr-essay-reach.md` (remove broken r1-essay-writing link)
- Multiple files with `../outcomes/` references (fix to `../key-results/`)

**Phase 3 (C1 consolidation):**
- Create: `docs/milestones/c1-stories-live-events.md` (consolidated from 4 files)

**Phase 4 (R1 consolidation):**
- Create: `docs/milestones/r1-essay-writing.md` (consolidated from 4 files)

**Phase 5 (Update cross-references):**
- `scripts/validate-doc-links.cjs` (update paths, simplify for single folder)
- `CLAUDE.md` (update navigation links)
- `docs/HOW-TO-NAVIGATE.md` (update navigation guide)
- `docs/decisions.md` (add P144 decision)
- `.claude/commands/slava/build/create-prd/agent.md` (check for hardcoded paths)

**Phase 6 (Cleanup):**
- None (deletions only, handled via `git rm`)

### Files to Delete

**Phase 6 (LAST STEP, after all verification):**

**Split files (content merged into milestones):**
- `docs/hypotheses/h-stories-solve-cold-start.md` (→ c1-stories-live-events.md)
- `docs/hypotheses/h-recognition-via-essays.md` (→ r1-essay-writing.md)
- `docs/experiments/e-story-creation-pilot.md` (→ c1-stories-live-events.md)
- `docs/experiments/e-essay-publishing.md` (→ r1-essay-writing.md)
- `docs/key-results/kr-story-usage.md` (→ c1-stories-live-events.md)
- `docs/key-results/kr-essay-reach.md` (→ r1-essay-writing.md)

**Workstream files (moved to milestones):**
- `docs/workstreams/c1-stories-live-events.md` (→ milestones/c1-stories-live-events.md)

**Track definition files (DECISION NEEDED):**
- `docs/workstreams/coaching-track.md` — Keep or delete? (may still be useful for classification)
- `docs/workstreams/enhancement-track.md` — Keep or delete?
- `docs/workstreams/exploratory-track.md` — Keep or delete?
- `docs/workstreams/recognition-track.md` — Keep or delete?
- `docs/workstreams/vision-track.md` — Keep or delete?
- `docs/workstreams/README.md` — Delete (no longer needed)

**Recommendation:** KEEP track definition files (coaching-track.md, etc.) for now
- **Rationale:** Help classify new work ("does this belong in C-track or R-track?")
- **Move to:** `docs/planning/tracks/` (separate from milestones)
- **Re-evaluate:** If unused after 3 months, archive or delete

**Empty folders:**
- `docs/hypotheses/` (after files deleted)
- `docs/experiments/` (after files deleted)
- `docs/key-results/` (after files deleted)

### Build Sequence

**Complete build sequence with verification checkpoints:**

```
1. Pre-Flight Checks
   ├─ Create feature branch: feature/p144-simplify-planning
   ├─ Tag current state: p142-complete
   ├─ Run baseline link validation (save report)
   ├─ Search for hardcoded paths (document findings)
   └─ CHECKPOINT: Baseline established ✓

2. Fix Pre-Existing Broken Links (P142 Debt)
   ├─ Fix tracks/ → workstreams/ (2 files)
   ├─ Remove broken r1-essay-writing links (2 files)
   ├─ Fix outcomes/ → key-results/ (multiple files)
   ├─ Run validation (expect 0 broken links)
   ├─ Commit: "fix(p142): correct broken links"
   └─ CHECKPOINT: Baseline links fixed ✓

3. Content Consolidation — C1 (Proof of Concept)
   ├─ Create consolidated file (merge 4 files → 1)
   ├─ Verify completeness (diff check)
   ├─ Verify agent comprehension (<2 min test)
   ├─ Verify line count (<150 lines)
   ├─ Commit: "feat(p144): consolidate C1 milestone"
   └─ CHECKPOINT: C1 consolidated and verified ✓
   └─ STOP if verification fails (fix before proceeding)

4. Content Consolidation — R1 (Special Case)
   ├─ Create consolidated file (merge 4 files → 1)
   ├─ Verify completeness (diff check)
   ├─ Verify agent comprehension (<2 min test)
   ├─ Verify line count (<100 lines)
   ├─ Commit: "feat(p144): consolidate R1 milestone"
   └─ CHECKPOINT: R1 consolidated and verified ✓

5. Update Cross-References (Before Deletion)
   ├─ Update validation script (paths + simplify)
   ├─ Update CLAUDE.md (navigation links)
   ├─ Update HOW-TO-NAVIGATE.md (navigation guide)
   ├─ Update decisions.md (add P144 decision)
   ├─ Check for other hardcoded paths (from Phase 1 list)
   ├─ Commit: "docs(p144): update cross-references"
   └─ CHECKPOINT: Cross-references updated ✓

6. Folder Rename and Cleanup (DESTRUCTIVE — Last Step)
   ├─ Verify all previous phases complete
   ├─ Delete old split files (git rm)
   ├─ Delete old workstream file (c1, not E/X placeholders)
   ├─ Delete empty folders (hypotheses/, experiments/, key-results/)
   ├─ Commit: "chore(p144): remove old split files"
   ├─ Run validation (expect 0 broken links)
   ├─ Tag completion: p144-complete
   └─ CHECKPOINT: Cleanup complete ✓

7. Final Validation (Acceptance Criteria)
   ├─ Run agent comprehension test (C1, R1)
   ├─ Run link validation (expect 0 broken links)
   ├─ Run kanban server (verify milestones load)
   ├─ User review (confirm clarity improvement)
   └─ CHECKPOINT: All acceptance criteria met ✓

8. Merge to Main
   ├─ Push feature branch: git push origin feature/p144-simplify-planning
   ├─ Create PR: "P144: Simplify planning system (5 folders → 1)"
   ├─ Review PR (check diffs, verify no content loss)
   ├─ Merge to main
   └─ COMPLETE ✓
```

**Estimated timeline:**
- Phase 1: 15 min (setup + baseline)
- Phase 2: 20 min (fix 11 broken links)
- Phase 3: 45 min (C1 consolidation + verification)
- Phase 4: 30 min (R1 consolidation + verification)
- Phase 5: 30 min (update cross-references)
- Phase 6: 15 min (cleanup + verification)
- Phase 7: 20 min (final validation)
- **Total: ~3 hours** (with verification at each step)

**Risk mitigation timeline:**
- If C1 consolidation fails verification (Phase 3): +30 min to fix
- If link validation fails (Phase 6): +20 min to fix new breaks
- If agent comprehension test fails: +45 min to add missing content
- **Buffer: +1.5 hours** for fixes
- **Total with buffer: ~4.5 hours**
