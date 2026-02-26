---
name: create-prd
description: Generate business requirements layer (WHY, intent, outcomes, user stories, JTBD)
when_to_use: Starting any new feature, major bug requiring analysis, or technical task needing planning
version: 2.0.0
---

# Create PRD

**Generate the business requirements layer from a problem statement.**

Produces business requirements ONLY:
- Problem statement
- Intention (why this matters)
- Business requirements (what solution must achieve)
- User stories (atomic, testable)
- Jobs to be done (explicit extraction)
- Outcomes (measurable success metrics)
- Acceptance criteria (business-level, not technical)

**Announce at start:** "I'm using the create-prd skill to generate business requirements."

---

## Quick Start

```
/create-prd "Add dark mode toggle to profile page"
```

Or with existing draft:
```
/create-prd features/p142_dark_mode.md
```

---

## When to Use

✅ **Use create-prd for:**
- Any new feature requiring business requirements
- Major bugs needing problem analysis
- Technical tasks needing business justification
- Features with unclear scope (agent will clarify)

❌ **Don't use for:**
- Quick skeleton only (use `/quick-feature` instead)
- Research notes (use `features/drafts/`)
- Simple typo fixes

**Next steps after create-prd:**
- Run `/ux` for UX design layer (if UI feature)
- Run `/architect` for technical architecture layer
- Run `/generate-tests` for test automation
- Run `/dev` for implementation

---

## What It Generates

### Problem Statement
- **Current state:** What exists today
- **Pain points:** What's broken or missing
- **Who's affected:** Target users

### Intention (Why This Matters)
- **Strategic importance:** Why this matters to business
- **Why now:** Urgency, timing
- **Impact if not solved:** Cost of inaction

### Business Requirements
- **Must-haves:** What solution MUST achieve for business value
- **Success conditions:** How we know it worked
- **Constraints:** What we can't change

### User Stories
- **Atomic:** Each story independently deliverable
- **Testable:** Clear acceptance criteria
- **Format:** As a [user], I want [goal], so that [benefit]

### Jobs to Be Done
- **Explicit extraction:** When [situation], I want [motivation], so I can [outcome]
- **Focus on motivation:** WHY user wants this, not HOW we build it

### Outcomes (Success Metrics)
- **Measurable:** Time savings, quality improvements, user satisfaction
- **Specific:** Not "better UX" but "reduce clicks from 5 to 2"
- **Observable:** Can verify after shipping

### Acceptance Criteria
- **Business-level only:** User can do X, system achieves Y outcome
- **NO technical details:** No file paths, architecture decisions, implementation approach
- **Format:** Checkbox list for verification

---

## Workflow

```
1. LAUNCH AGENT → PRD Creator agent starts
       ↓
2. CLARIFY → Agent asks business questions
       ↓
3. GENERATE → Agent creates business layer
       ↓
4. SELF-REVIEW → Agent checks completeness
       ↓
5. RETURN → Business requirements ready for user review
       ↓
6. USER REVIEWS → Approve or request changes
       ↓
7. NEXT STEP → Run /ux (if UI) or /architect (if backend)
```

---

## Agent Behavior

The PRD Creator agent focuses on **business requirements only**:

| Feature Type | Business Layer Sections |
|--------------|------------------------|
| **UI feature** | Problem + Intention + Business Reqs + User Stories + JTBD + Outcomes + Acceptance Criteria |
| **Data migration** | Same (business justification, user impact) |
| **Refactor** | Same (business value, technical debt cost) |
| **Bug fix** | Same (problem statement, user impact, success criteria) |
| **API endpoint** | Same (API consumer needs, business value) |

**Consistent across all types:**
- Always generates: Problem, Intention, Business Requirements, User Stories, JTBD, Outcomes, Acceptance Criteria
- Never generates: Technical details, UX design, implementation approach, test templates
- Next steps clearly documented: Which skill to run next (`/ux`, `/architect`, etc.)

---

## Quality Gates (Agent Self-Review)

Before returning, agent verifies:
- [ ] Problem statement is clear (current state, pain points, who's affected)
- [ ] Intention explains WHY this matters (strategic importance, urgency)
- [ ] Business requirements are concrete (must-haves for business value)
- [ ] User stories are atomic and testable (independently deliverable)
- [ ] Jobs to be done explicitly extracted (motivation focus, not implementation)
- [ ] Outcomes are measurable (specific metrics, not vague goals)
- [ ] Acceptance criteria are business-level only (no technical details)
- [ ] NO technical analysis included (no file paths, architecture, implementation)
- [ ] NO UX design included (no flows, screens, interactions)
- [ ] NO test templates included (no E2E, unit test stubs)
- [ ] Next steps documented (which skill to run next)
- [ ] Uncertainties flagged (if agent unsure, it says so)

**If any gate fails:** Agent flags what's missing and asks user for clarification.

---

## Example Output

### Input
```
/create-prd "Add ability to export sifter responses as CSV"
```

### Output (PRD Structure)
```markdown
---
status: week
type: feature
rank: 7.0
workstream: C2
tags: [export, csv, sifter]
prepped_date: '2026-02-10'
reviews:
  ux: null
  architect: null
  alignment: null
---

# P142: Export Sifter Responses as CSV

## Problem Statement

**Current state:** Users complete sifter exercises and view responses in-app only. No way to export or analyze responses offline.

**Pain points:**
- Can't track progress over time in spreadsheet tools
- Can't share responses with coaches for review
- Can't analyze patterns across multiple sifter sessions
- Limited to in-app viewing only

**Who's affected:** Users who want to track calibration progress over time, users working with coaches

---

## Intention (Why This Matters)

**Strategic importance:** Enables coaches to work with users by reviewing their calibration data. Supports long-term habit formation by allowing users to track progress in their preferred tools.

**Why now:** Coaches have been asking for this feature. Early adopters want to analyze patterns before we build in-app analytics (C3 milestone).

**Impact if not solved:** Users can't work with coaches effectively. Limits product to solo users, blocks coach market segment.

---

## Business Requirements

**Must-haves:**
- Users can export all responses for a sifter session
- Export format: CSV (compatible with Excel, Google Sheets)
- Export includes: question, response, timestamp, calibration score
- File name: `sifter_responses_YYYY-MM-DD.csv`
- Only user's own responses (no access to others' data)

**Success conditions:**
- Users can open exported CSV in Excel/Sheets without errors
- Exported data matches what's shown in-app
- Feature works on mobile and desktop

**Constraints:**
- Must respect RLS policies (users can only export their own data)
- Must not slow down results page load time

---

## User Stories

**As a user tracking calibration progress:**
- I want to export my sifter responses as CSV, so I can track progress over time in Excel
- I want the export to include all response data (question, answer, timestamp, score), so I have complete history
- I want the file name to include the date, so I can organize multiple exports

**As a user working with a coach:**
- I want to export my responses, so I can share them with my coach for review
- I want the export format to be standard CSV, so my coach can open it in any spreadsheet tool

**As a mobile user:**
- I want the export button visible on mobile, so I can export on any device
- I want export to work on mobile browsers, so I'm not limited to desktop

---

## Jobs to Be Done

**When I complete a sifter session:**
- I want confidence my responses are exportable, so I can analyze them later (motivation: progress tracking)

**When preparing for a coaching session:**
- I want to quickly export recent responses, so I can share calibration data with my coach (motivation: external accountability)

**When reviewing my calibration journey:**
- I want to see all historical responses in one spreadsheet, so I can spot patterns over time (motivation: learning from trends)

---

## Outcomes (Success Metrics)

**Time savings:**
- Reduce time to share responses with coach from "manual screenshots" (10+ min) to "1-click export" (<30 sec)

**Quality improvements:**
- Enable coach-guided calibration practice (new capability)
- Enable longitudinal progress tracking (new capability)

**User satisfaction:**
- Users can work with coaches (unblocks coach market segment)
- Users have data portability (own their calibration data)

---

## Acceptance Criteria

**Business-level criteria:**
- [ ] User can export sifter responses from results page
- [ ] Exported CSV opens in Excel/Google Sheets without errors
- [ ] CSV contains: question, response, timestamp, calibration score
- [ ] File name format: `sifter_responses_YYYY-MM-DD.csv`
- [ ] Export only includes user's own responses (RLS enforced)
- [ ] Feature works on mobile and desktop browsers
- [ ] Export button disabled when no responses exist
- [ ] Error handling for failed exports (user sees friendly error message)

---

## Next Steps

**After user approves business requirements:**
1. Run `/ux features/p142_export_csv.md` to design user flows and interactions
2. Run `/architect features/p142_export_csv.md` to design technical implementation
3. Run `/generate-tests features/p142_export_csv.md` to create test automation
4. Run `/dev features/p142_export_csv.md` to implement feature
```

---

## After PRD Generation

**Sequential workflow with review gates:**

1. **Review business requirements** - User confirms problem, intention, outcomes
   - Approve → Proceed to step 2
   - Request changes → Agent revises business layer

2. **Run `/ux`** (if UI feature) - Generate UX design layer
   - Agent designs: User flows, screens, interactions, edge cases, accessibility
   - User reviews UX → Approve or request changes

3. **Run `/architect`** - Generate technical architecture layer
   - Agent designs: Technical analysis, architecture decisions, security review, implementation approach
   - User reviews technical → Approve or request changes

4. **Run `/generate-tests`** - Generate test automation
   - Agent generates: UAT scenarios, E2E test stubs, smoke tests
   - No user review needed (automated from approved layers)

5. **Run `/dev`** - Implement feature
   - Agent implements, runs tests, iterates until pass
   - User validates UX only (not functionality)

6. **Ship** - `/dev` auto-closes on success

---

## Comparison: /quick-feature vs /create-prd

| Aspect | /quick-feature | /create-prd |
|--------|----------------|-------------|
| **Output** | Skeleton only | Business requirements layer |
| **Business requirements** | ❌ Empty | ✅ Generated (problem, intention, outcomes, JTBD) |
| **UX design** | ❌ Empty | ❌ Empty (use `/ux` after) |
| **Technical analysis** | ❌ Empty | ❌ Empty (use `/architect` after) |
| **Test requirements** | ❌ Empty | ❌ Empty (use `/generate-tests` after) |
| **Time to complete** | 30 seconds | 2-3 minutes |
| **When to use** | Quick placeholder | Structured business analysis |

**Rule of thumb:**
- Use `/quick-feature` for quick skeleton (you'll fill in manually)
- Use `/create-prd` for structured business requirements (agent generates WHY layer)
- Use new sequential flow (`/create-prd` → `/ux` → `/architect` → `/generate-tests` → `/dev`) for complete feature development

---

## Related Skills

**Sequential flow (recommended):**
- `/ux` - Generate UX design layer (user flows, screens, interactions)
- `/architect` - Generate technical architecture layer (implementation approach, security)
- `/generate-tests` - Generate test automation (UAT, E2E stubs, smoke tests)
- `/dev` - Implement the feature with test-driven development

**Other related:**
- `/verify` - Optional live browser UAT after implementation
- `/kdd` - Capture knowledge after implementation
- `/quick-feature` - Quick skeleton (alternative to `/create-prd`)

**Deprecated:**
- `/prep-spec` - Old 3-agent review (replaced by `/ux` + `/architect` sequential flow)

---

## Implementation

When invoked, this skill spawns a general-purpose agent with the following directive:

```
You are a PRD Creator agent. Your job is to generate the BUSINESS REQUIREMENTS layer only from the user's problem statement.

Read the problem statement: {user_input}

Generate a complete business requirements spec covering:

1. **Problem Statement**
   - Current state: What exists today
   - Pain points: What's broken or missing
   - Who's affected: Target users

2. **Intention (Why This Matters)**
   - Strategic importance: Why this matters to business
   - Why now: Urgency, timing
   - Impact if not solved: Cost of inaction

3. **Business Requirements**
   - Must-haves: What solution MUST achieve for business value
   - Success conditions: How we know it worked
   - Constraints: What we can't change

4. **User Stories**
   - Format: As a [user], I want [goal], so that [benefit]
   - Make atomic (independently deliverable)
   - Make testable (clear success criteria)

5. **Jobs to Be Done**
   - Format: When [situation], I want [motivation], so I can [outcome]
   - Focus on WHY user wants this (motivation), not HOW we build it

6. **Outcomes (Success Metrics)**
   - Measurable: Time savings, quality improvements, user satisfaction
   - Specific: Not "better UX" but "reduce clicks from 5 to 2"
   - Observable: Can verify after shipping

7. **Acceptance Criteria**
   - Business-level only: User can do X, system achieves Y outcome
   - NO technical details: No file paths, architecture decisions, implementation approach
   - Format: Checkbox list for verification

**Critical constraints:**
- Generate BUSINESS layer only (Problem, Intention, Business Requirements, User Stories, JTBD, Outcomes, Acceptance Criteria)
- DO NOT include: Technical analysis, UX design, architecture decisions, test templates, implementation details
- If scope is unclear, ask clarifying questions about business requirements (not technical approach)
- Flag uncertainties: If you're unsure about business requirements, say so explicitly

**Next steps to document:**
After generating business requirements, tell user which skill to run next:
- For UI features → Run /ux next
- For backend features → Skip /ux, run /architect next

**Self-review before returning:**
- [ ] Problem statement is clear (current state, pain points, who's affected)
- [ ] Intention explains WHY this matters (strategic importance, urgency)
- [ ] Business requirements are concrete (must-haves for business value)
- [ ] User stories are atomic and testable
- [ ] Jobs to be done explicitly extracted (motivation focus)
- [ ] Outcomes are measurable (specific metrics)
- [ ] Acceptance criteria are business-level only (no technical details)
- [ ] NO technical analysis included
- [ ] NO UX design included
- [ ] NO test templates included
- [ ] Next steps documented

**Before generating requirements — search for related work:**
```bash
grep -ril "{key concept}" features/ features/drafts/ 2>/dev/null | head -10
```
If a related spec exists in `features/drafts/`, read it. Either (a) supersede it (note in the new spec), or (b) build on it instead of filing a duplicate. This step is required — filing a duplicate spec wastes a P-number and misses prior thinking.

If spec already exists at {spec_file}, read it first and extend the Business layer. DO NOT modify existing UX or Technical sections.

**Determine P-number:** Run `./scripts/next-p-number.sh` from repo root — prints the correct next integer. Never compute manually (the script excludes `uat/` and `archive/` which must not drive the sequence). If the script is unavailable, halt and warn the user.

Create/update file: features/p{N}_{slug}.md with proper frontmatter (status, type, rank, milestone, tags, prepped_date, reviews).

**IMPORTANT - Delivery Stage Tracking:**
After creating/updating the spec file, set delivery_stage to indicate completion:
- Use Edit tool to update frontmatter: `delivery_stage: 1-prd-review`
- This signals PRD is ready for user review

**IMPORTANT - Kanban Visibility:**
After creating the file, tell the user: "Hit the Refresh button in the kanban to see the new card (or visit http://localhost:9050 and click Refresh)."
```

---

## Notes

- **First time using?** Start with a small feature to see output quality
- **Agent asks questions?** Answer them - it's clarifying scope
- **PRD too detailed?** You can ask agent to simplify (or use `/quick-feature` instead)
- **PRD missing something?** Agent will flag uncertainties - just provide missing info
