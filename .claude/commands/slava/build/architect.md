---
name: architect
description: Design technical architecture and security after business/UX requirements are approved
when_to_use: After /create-prd (and /ux if UI feature), before /generate-tests
version: 1.0.0
---

# Technical Architecture

**Generate technical architecture and security design from business/UX requirements.**

Adds Technical layer to feature spec:
- Technical analysis (current code state)
- Architecture decisions (patterns, trade-offs)
- Security review (RLS, auth, validation)
- Implementation approach (how to build)
- Files to change (concrete paths)

**Announce at start:** "I'm using the architect skill to design the technical architecture."

---

## Quick Start

```
/architect features/p142_dark_mode.md
```

---

## When to Use

✅ **Use /architect for:**
- All features (after business requirements)
- UI features (after UX design)
- Before test generation and implementation

❌ **Never skip /architect:**
- Even simple features need architectural review
- Security review is mandatory for all features

---

## What It Generates

### Technical Analysis
- Current code state (what exists today)
- Related systems (what this touches)
- Dependencies (what this needs)
- Files involved (specific paths)

### Architecture Decisions
- Patterns to use (with rationale)
- Trade-offs considered (pros/cons)
- Alternatives rejected (why)
- Integration approach (how it fits)

### Security Review
- RLS policies (row-level security)
- Authentication requirements (who can access)
- Authorization rules (what actions allowed)
- Input validation (prevent injection)
- Data protection (sensitive fields)

### Implementation Approach
- Build sequence (what order)
- Files to create (new files)
- Files to modify (existing files)
- Migration scripts (if database changes)

---

## Workflow

```
1. PRE-FLIGHT CHECK → Verify prerequisites exist
     ↓
2. READ SPEC → Agents read business + UX requirements
     ↓
3. EXPLORE CODE → Architect explores current implementation
     ↓
4. PARALLEL REVIEW:
   - Architect agent → Architecture decisions
   - Security agent → Security review
     ↓
5. MERGE RESULTS → Architect waits for Security, combines into Technical section
     ↓
6. UPDATE SPEC → Append Technical section to spec file
     ↓
7. RETURN → User reviews architecture, approves or requests changes
```

---

## Pre-Flight Check

**Before running /architect, verify:**

✅ **Business requirements exist** in spec file (from /create-prd)

✅ **UX section exists** (if UI feature) OR **Frontmatter marks as backend**
- UI features: Must run /ux first, then /architect
- Backend features: Can skip /ux, run /architect directly

❌ **If prerequisites missing:**
```
ERROR: Cannot run /architect
- Missing business requirements → Run /create-prd first
- Missing UX section (UI feature) → Run /ux first
- Missing UX section (backend) → Mark frontmatter as "backend feature"
```

**How to mark as backend feature:**
Add to spec frontmatter: `feature_type: backend`

---

## Agent Coordination

**Two agents run in parallel, then merge:**

**1. Architect Agent** writes:
- Technical Analysis (current code state)
- Architecture Decisions (patterns, trade-offs, rationale)
- Implementation Approach (build sequence, files to change)

**2. Security Agent** writes:
- Security Review (subsection within Technical section)
- RLS policies, auth requirements, validation, data protection

**3. Merge Logic:**
- Architect agent waits for Security agent to complete
- Architect reads Security review findings
- If Security flags risks → Architect adjusts approach (or marks as "risk accepted")
- Architect combines both outputs into single Technical section
- Append to spec file (no conflicts — sequential merge)

**Conflict Resolution:**
- If Security says "Pattern X has risk Y" AND Architect chose Pattern X:
  - Architect evaluates alternatives (can we mitigate Y? use different pattern?)
  - If mitigation possible → Architect updates approach + documents mitigation
  - If mitigation not possible → Architect flags to user: "Security risk identified, need decision"

---

## Agent Behavior

**Architect agent:**
- Explores current codebase (Read, Grep, Glob)
- Makes architecture decisions (patterns, trade-offs)
- Identifies files to change (concrete paths)
- Considers scalability and maintainability
- Flags technical risks
- **Waits for Security agent, then merges results**

**Security agent:**
- Reviews RLS policies (Supabase row-level security)
- Checks authentication requirements
- Validates authorization rules
- Identifies injection risks (SQL, XSS, etc.)
- Ensures data protection (PII, sensitive fields)
- **Reports findings to Architect agent for merge**

**Self-review checklist:**
- [ ] Current code state analyzed (not assumptions)
- [ ] Architecture decisions justified (not arbitrary)
- [ ] Security review complete (RLS, auth, validation)
- [ ] Files to change are concrete (not vague)
- [ ] Trade-offs considered (pros/cons documented)

---

## Example Output

### Input
```
/architect features/p142_export_csv.md
```

### Output (Technical section added to spec)
```markdown
## Technical Analysis

**Current State:**
- Sifter responses stored in `responses` table (Supabase)
- Results page: `src/app/sifter/[id]/results/page.tsx`
- Response fetching: `src/lib/supabase/queries/responses.ts`

**Dependencies:**
- Supabase query (already exists)
- CSV library (need to install: papaparse)
- Browser download API (built-in)

---

## Architecture Decisions

**Decision 1: Client-side CSV generation**
- **Chosen:** Generate CSV in browser (no server endpoint)
- **Rationale:** Simple feature, small datasets, no server load
- **Trade-off:** Limited to browser memory (max ~1000 responses)
- **Alternative rejected:** Server endpoint (added complexity for no benefit)

**Decision 2: Library choice**
- **Chosen:** papaparse (lightweight, well-tested)
- **Alternative rejected:** Manual CSV generation (error-prone, reinventing wheel)

---

## Security Review

**RLS Policies:**
- ✅ Existing RLS on `responses` table enforces user can only export own data
- ✅ No new RLS policies needed

**Authentication:**
- ✅ Page already requires auth (Supabase client enforces)
- ✅ Export button only visible to authenticated users

**Input Validation:**
- ✅ No user input (sifter ID from URL, already validated)

**Data Protection:**
- ⚠️ Exported CSV may contain PII (user responses)
- ✅ Mitigation: File saved locally, not uploaded anywhere
- ✅ No sensitive data in file name

---

## Implementation Approach

**Files to Create:**
1. `src/lib/csv/export.ts` - CSV export utility function

**Files to Modify:**
1. `src/app/sifter/[id]/results/page.tsx` - Add export button, wire up logic
2. `package.json` - Add papaparse dependency

**Build Sequence:**
1. Install papaparse dependency
2. Create export utility (src/lib/csv/export.ts)
3. Add button to results page
4. Wire up button click → export logic
5. Test with sample responses

**No database migrations needed.**
```

---

## Implementation

This skill spawns TWO agents in parallel:

### Architect Agent

**Prompt:**
```
You are an Architect agent. Read business + UX requirements from {spec_file} and design the technical architecture.

Explore current codebase:
- Use Grep, Glob, Read to understand what exists
- Identify files that need to change
- Understand current patterns

Generate Technical section covering:
1. Current code state (what exists, how it works)
2. Architecture decisions (patterns, trade-offs, alternatives)
3. Implementation approach (build sequence, files to change)

Append to spec file. Do NOT modify existing content.

Include:
- **Technical Analysis** subsection
- **Architecture Decisions** subsection (Decision 1, Decision 2, etc. with Chosen/Rationale/Trade-off/Alternative rejected)
- **Implementation Approach** subsection (Files to Create, Files to Modify, Build Sequence)
```

### Security Agent

**Prompt:**
```
You are a Security agent. Read business + UX requirements from {spec_file} and perform security review.

Review for:
1. RLS policies (row-level security in Supabase)
2. Authentication (who can access)
3. Authorization (what actions allowed)
4. Input validation (prevent injection)
5. Data protection (PII, sensitive fields)

Append Security Review subsection to Technical section. Flag risks with ⚠️.

Use format:
**RLS Policies:**
- ✅ or ⚠️ findings

**Authentication:**
- ✅ or ⚠️ findings

**Input Validation:**
- ✅ or ⚠️ findings

**Data Protection:**
- ✅ or ⚠️ findings
```

---

## After Architecture

**Next steps:**
1. **Review Architecture** - User confirms approach, security, files to change
2. **Run /generate-tests** - Tests generated from architecture
3. **Implement** - Run `/dev` with full spec

---

## Related Skills

- `/create-prd` - Business requirements (run before /architect)
- `/ux` - UX design (run before /architect if UI feature)
- `/generate-tests` - Test generation (run after /architect)
- `/dev` - Implementation (run after /generate-tests)

---

## Notes

- **Security review is mandatory** - Never skip, even for "simple" features
- **Architect explores code** - Not assumptions, reads actual files
- **Concrete file paths** - Not "update the auth module", but "src/lib/auth/session.ts"
- **Trade-offs documented** - Why we chose X over Y
- **Parallel execution** - Architect and Security agents run simultaneously for efficiency
- **Append only** - Agents append Technical section, never modify existing Business/UX content
