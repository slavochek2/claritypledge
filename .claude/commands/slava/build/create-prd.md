---
name: create-prd
description: Generate comprehensive PRD with business requirements, technical analysis, implementation plan, and test coverage
when_to_use: Starting any new feature (P0-P3), major bug requiring analysis, or technical task needing planning
version: 1.0.0
---

# Create PRD

**Generate a comprehensive Product Requirements Document from a problem statement.**

Produces a complete PRD with:
- Business requirements (WHY, intent, outcomes)
- Technical analysis (current code state)
- Technical requirements (implementation approach)
- UX requirements (if UI work)
- Verification requirements (unit + E2E tests with templates)
- User stories (if large, split into testable pieces)

**Announce at start:** "I'm using the create-prd skill to generate a comprehensive PRD."

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
- Any new feature (P0-P3)
- Major bugs requiring root cause analysis
- Technical tasks needing implementation planning
- Features with unclear scope (agent will clarify)

❌ **Don't use for:**
- Quick skeleton only (use `/quick-feature` instead)
- Research notes (use `features/drafts/`)
- Simple typo fixes

---

## What It Generates

### Business Requirements
- **Intent:** WHY we're building this
- **Motivation:** What problem exists today
- **Outcomes:** What success looks like (measurable)
- **Business requirements:** Must-haves for business value
- **User impact:** How this affects users

### Technical Analysis
- **Current state:** What code exists, how it works
- **Dependencies:** What this touches
- **Related systems:** How it integrates
- **Files involved:** Specific paths

### Technical Requirements
- **Implementation approach:** How we'll build it
- **Architecture decisions:** Key choices and trade-offs
- **Files to change:** Concrete file paths + what changes
- **Phases:** If complex, break into phases with gates

### UX Requirements (if UI work)
- **User flows:** Step-by-step interactions
- **Edge cases:** Error states, loading states, empty states
- **Accessibility:** Screen reader support, keyboard navigation
- **Responsive design:** Mobile, tablet, desktop

### Verification Requirements
- **Business verification:** How to confirm outcomes achieved
- **Technical verification:** How to confirm implementation correct
- **Design verification:** How to confirm UX is good
- **Unit tests:** What to test at unit level
- **E2E tests:** Actual test templates with Given/When/Then
- **Test all happy paths:** Every user journey tested

### User Stories (if applicable)
- If feature is large, split into smaller testable pieces
- Each story independently deliverable
- Each story has acceptance criteria + tests

---

## Workflow

```
1. LAUNCH AGENT → PRD Creator agent starts
       ↓
2. CLARIFY → Agent asks business questions
       ↓
3. ANALYZE → Agent explores current code
       ↓
4. GENERATE → Agent creates all sections
       ↓
5. SELF-REVIEW → Agent checks completeness
       ↓
6. RETURN → Complete PRD ready for implementation
```

---

## Agent Behavior

The PRD Creator agent is **adaptive** - it decides what sections are needed:

| Feature Type | Sections Generated |
|--------------|-------------------|
| **UI feature** | Business + Technical Analysis + Technical Reqs + **UX** + Verification |
| **Data migration** | Business + Technical Analysis + Technical Reqs + **Migration Scripts** + Verification |
| **Refactor** | ~~Business~~ + Technical Analysis + Technical Reqs + Verification |
| **Bug fix** | Business + Technical Analysis + **Root Cause** + Resolution + Verification |
| **API endpoint** | Business + Technical Analysis + Technical Reqs + **API spec** + Verification |

**Adaptive sections:**
- UX (if user-facing UI)
- Migration scripts (if data transformation)
- API spec (if backend endpoint)
- Root cause analysis (if bug)

---

## Quality Gates (Agent Self-Review)

Before returning, agent verifies:
- [ ] Business WHY is clear (not just "what")
- [ ] Technical analysis explores current code (not assumptions)
- [ ] Implementation approach is concrete (file paths, not vague)
- [ ] Verification paths exist (how to confirm it works)
- [ ] Test requirements specified (E2E test templates)
- [ ] UX section present (if UI work)
- [ ] Edge cases considered (not just happy path)
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
priority: p1
milestone: C2
tags: [export, csv, sifter]
---

# P142: Export Sifter Responses as CSV

## Business Requirements

**Intent:** Allow users to analyze sifter responses in spreadsheet tools

**Motivation:** Users currently can only view responses in-app. They want to:
- Track progress over time in Excel/Sheets
- Share responses with coaches
- Analyze patterns across multiple sifters

**Outcomes:**
- Users can export all responses for a sifter session
- Export includes: question, response, timestamp, calibration score
- Format: CSV (compatible with Excel, Google Sheets)

**Business Requirements:**
- Export button on sifter results page
- File name: `sifter_responses_YYYY-MM-DD.csv`
- Includes metadata: sifter type, date, user ID

**User Impact:** Enables offline analysis, sharing with coaches

---

## Technical Analysis

**Current State:**
- Sifter responses stored in `responses` table (Supabase)
- Results page: `src/app/sifter/[id]/results/page.tsx`
- Response fetching: `src/lib/supabase/queries/responses.ts`

**Dependencies:**
- Supabase query (already exists)
- CSV library (need to install)
- Browser download API (built-in)

**Related Systems:**
- Authentication (only export own responses)
- RLS policies (verify user can access responses)

---

## Technical Requirements

**Implementation Approach:**
1. Add "Export CSV" button to results page
2. Fetch all responses for sifter session
3. Transform to CSV format (headers + rows)
4. Trigger browser download

**Architecture Decisions:**
- Client-side CSV generation (no server endpoint needed)
- Use `papaparse` library (lightweight, well-tested)
- Browser download via blob URL + `<a download>`

**Files to Change:**
1. `src/app/sifter/[id]/results/page.tsx` (add button, export logic)
2. `package.json` (add papaparse dependency)
3. `src/lib/csv/export.ts` (NEW - export utility)

**Phases:** Single phase (simple feature)

---

## UX Requirements

**User Flow:**
1. User completes sifter → navigates to results page
2. User clicks "Export CSV" button
3. Browser downloads `sifter_responses_2026-02-12.csv`
4. User opens in Excel/Sheets

**Edge Cases:**
- No responses yet → Disable export button, show tooltip "No responses to export"
- Export fails → Show error toast "Export failed. Try again."
- Large dataset (100+ responses) → Show loading spinner during generation

**Accessibility:**
- Button keyboard accessible (Tab + Enter)
- Screen reader announces "Export responses as CSV file"

**Responsive Design:**
- Button visible on mobile (don't hide in overflow menu)

---

## Verification Requirements

**Business Verification:**
- [ ] User can export responses
- [ ] CSV opens in Excel without errors
- [ ] Exported data matches in-app responses

**Technical Verification:**
- [ ] RLS policies enforced (can't export other users' responses)
- [ ] File name format correct
- [ ] CSV headers correct

**E2E Tests:**

**File:** `e2e/sifter-csv-export.spec.ts`

```typescript
test('exports sifter responses as CSV', async ({ page }) => {
  // Setup: Complete sifter with 3 responses
  // Navigate to results page
  // Click "Export CSV" button
  // Expected: CSV file downloads
  // Verify: File contains 3 rows + header
});

test('disables export when no responses', async ({ page }) => {
  // Setup: Sifter with 0 responses
  // Navigate to results page
  // Expected: Export button disabled
  // Verify: Tooltip shows "No responses to export"
});

test('handles export error gracefully', async ({ page }) => {
  // Setup: Mock CSV generation failure
  // Click export button
  // Expected: Error toast appears
  // Verify: Button re-enabled after error
});
```

**Happy Paths to Test:**
- ✅ Export with responses → CSV downloads
- ✅ Open CSV in Excel → Data correct
- ✅ Export with 0 responses → Button disabled

---

## Acceptance Criteria

- [ ] Export button visible on results page
- [ ] Clicking button downloads CSV file
- [ ] CSV contains: question, response, timestamp, calibration score
- [ ] File name: `sifter_responses_YYYY-MM-DD.csv`
- [ ] Button disabled when no responses
- [ ] Error handling for failed exports
- [ ] E2E tests passing (3 scenarios)
- [ ] Accessible (keyboard, screen reader)
```

---

## After PRD Generation

**Next steps:**
1. **Review PRD** - User confirms scope, approach
2. **Run `/prep-spec`** (optional) - 3-agent review for P0/P1 features
3. **Implement** - Run `/dev features/p142_export_csv.md`
4. **Verify** - Run E2E tests, confirm acceptance criteria
5. **Ship** - Run `/done` to mark complete

---

## Comparison: /quick-feature vs /create-prd

| Aspect | /quick-feature | /create-prd |
|--------|----------------|-------------|
| **Output** | Skeleton only | Complete PRD |
| **Business requirements** | ❌ Empty | ✅ Generated (WHY, outcomes) |
| **Technical analysis** | ❌ Empty | ✅ Generated (current code) |
| **Implementation plan** | ❌ "To be filled in" | ✅ Concrete (file paths) |
| **Test requirements** | ❌ "How to verify" | ✅ E2E test templates |
| **Time to complete** | 30 seconds | 3-5 minutes |
| **When to use** | Quick placeholder | Ready to implement |

**Rule of thumb:**
- Use `/quick-feature` for quick skeleton (you'll fill in manually)
- Use `/create-prd` for comprehensive PRD (agent fills in for you)

---

## Related Skills

- `/prep-spec` - Review PRD before implementation (UX, Architect, Alignment)
- `/dev` - Implement the PRD with TDD
- `/done` - Mark feature complete
- `/kdd` - Capture knowledge after implementation

---

## Notes

- **First time using?** Start with a small feature to see output quality
- **Agent asks questions?** Answer them - it's clarifying scope
- **PRD too detailed?** You can ask agent to simplify (or use `/quick-feature` instead)
- **PRD missing something?** Agent will flag uncertainties - just provide missing info
