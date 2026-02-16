# Agent File Creation Prevention

**Date:** 2026-02-16
**Status:** Analysis complete, recommendations ready for implementation

## Executive Summary

Agents have been creating temporary files in the project root (UPPERCASE markdown, JSON reports, one-off scripts) due to:

1. **No explicit guidance** in CLAUDE.md on where to save analysis outputs
2. **Implicit permission** via .gitignore patterns that catch these files after creation
3. **Missing pre-commit enforcement** to prevent accidental commits of temporary files
4. **Agent workflow patterns** that default to "save analysis as file" rather than terminal output

**Impact:** Low (files are gitignored), but creates clutter and confusion about what belongs in the project.

**Priority:** Medium (prevents future cleanup work, improves agent discipline)

---

## Root Causes Identified

### 1. CLAUDE.md Missing File Creation Guidance

**Finding:** CLAUDE.md has extensive rules about what NOT to do (git add ., installing software, modifying tests), but **zero guidance** on:
- Where to save temporary analysis outputs
- Whether to create analysis files at all (vs terminal output)
- Where one-off migration scripts belong

**Evidence:**
- Searched CLAUDE.md for "temporary", "output", "save", "report" patterns
- Found rules about NOT creating docs unless requested
- No positive guidance on "if you need to save analysis, put it in X"

**Impact:** Agents default to creating files in current directory (project root) when generating analysis.

---

### 2. .gitignore Patterns Create Implicit Permission

**Current .gitignore patterns:**
```gitignore
# Agent-generated temporary files (analysis, audits, migration outputs)
/*_AUDIT*.md
/*_ANALYSIS*.md
/*_SUMMARY*.md
/*FIXES*.md
/*DUPLICATE*.md
*-results.json
*-report.json
*-audit*.json
```

**Problem:** These patterns say "we expect agents to create these files in root, so we'll ignore them."

**Better approach:** Don't expect these files at all. If agents need to save analysis, direct them to specific locations.

---

### 3. Skills Don't Create Root Files (Good News)

**Finding:** Audited all skills in `.claude/commands/slava/`:
- `/create-prd` writes to `features/p{N}_{slug}.md` (correct location)
- `/prepare-blog` writes to `content/blog/{slug}.md` (correct location)
- `/architect`, `/ux`, `/dev` all append to feature spec files (correct)
- `/review-all` outputs to terminal (correct - no file creation)

**Evidence:**
```bash
# Only one skill file mentions Write tool for content
/Users/slavochek/Projects/public/claritypledge/.claude/commands/slava/content/prepare-blog.md
# And it writes to correct location: content/blog/
```

**Conclusion:** The skills themselves are NOT the source of root file creation. Ad-hoc agent requests are.

---

### 4. Ad-Hoc Agent Requests Create Temporary Files

**Pattern observed from git history:**
```bash
# Recent commits related to temporary files
107791e fix: add missing milestone field to frontmatter + dynamic discovery pattern
4c1c8a4 docs: restore critical patterns to CLAUDE.md, fix frontmatter violations
137bbdc chore: add migration scripts + MCP backup docs
```

**Inference:** User likely asked agents to:
- "Audit frontmatter across all features" → Agent creates `FRONTMATTER_AUDIT_SUMMARY.md`
- "Add missing frontmatter fields" → Agent creates `add-frontmatter-results.json`
- "Fix duplicate P-numbers" → Agent creates `DUPLICATE_PREVENTION_ANALYSIS.md`
- "Apply migration to features" → Agent creates `apply-e2e-migration.mjs`

**Why root?** No guidance on where to put these outputs, so agents default to current directory.

---

## Prevention Strategy

### Priority 1: Add Explicit File Creation Rules to CLAUDE.md

**Copy-paste ready addition for CLAUDE.md:**

```markdown
### File Creation Rules — Where to Save Outputs

> **Principle:** Prefer terminal output over files. If you must create files, use designated locations.

**For analysis/audit/validation outputs:**
- ❌ **NEVER** create files in project root (no `/*.md`, `/*.json`, etc.)
- ✅ Output analysis to terminal (use Bash `echo` or direct text response)
- ✅ If results are large (>500 lines), ask user: "Save to docs/technical/ or terminal output?"

**For one-off migration scripts:**
- ❌ **NEVER** create scripts in project root
- ✅ Create in `scripts/archive/migrations/` with dated prefix: `YYYYMMDD-description.{js,mjs,cjs,sh}`
- ✅ Example: `scripts/archive/migrations/20260216-add-frontmatter-fields.cjs`

**For feature specs:**
- ✅ Use `/create-prd` skill (creates `features/p{N}_{slug}.md`)
- ❌ Never create feature files manually without skill

**For documentation:**
- ✅ Ask first: "Should I create docs/technical/{name}.md or docs/{name}.md?"
- ❌ Never create docs proactively (see CLAUDE.md#universal-principles)

**For temporary debugging:**
- ✅ Use `/tmp/` or system temp directory
- ✅ Or output to terminal
- ❌ Never use project root

**Red flags to stop and ask:**
- Filename is ALL_UPPERCASE.md
- Filename contains SUMMARY, AUDIT, ANALYSIS, FIXES, RESULTS, REPORT
- Creating JSON files in root (*-results.json, *-report.json, etc.)
- Creating scripts outside `scripts/` directory
```

**Location in CLAUDE.md:** Add new section after "### Proactive Improvement" (around line 90).

---

### Priority 2: Update .gitignore (Remove Implicit Permission)

**Current patterns to REMOVE:**
```gitignore
# Agent-generated temporary files (analysis, audits, migration outputs)
/*_AUDIT*.md
/*_ANALYSIS*.md
/*_SUMMARY*.md
/*FIXES*.md
/*DUPLICATE*.md
*-results.json
*-report.json
*-audit*.json
```

**Replace with comment only:**
```gitignore
# Agents should NOT create files in root (see CLAUDE.md for file creation rules)
# If you see files matching these patterns, it's a bug:
#   /*_AUDIT*.md, /*_ANALYSIS*.md, *-results.json, etc.
# These patterns were removed to enforce agent discipline.
```

**Why remove:** .gitignore catching these files creates false safety ("it's fine to create them, they won't be committed"). Better to have no safety net and enforce discipline.

**Alternative (safer transition):** Keep patterns for 1 month, then remove. Gives time to observe if agents still create these files.

---

### Priority 3: Add Pre-Commit Check for Root Files

**Add to `scripts/pre-commit-checks.sh`:**

```bash
# 8. Root file pollution check (after line 160, before Final Summary)
echo ">>> Checking for temporary files in project root..."
ROOT_TEMP_FILES=$(ls -1 /*.md /*.json 2>/dev/null | grep -vE '(CLAUDE|GEMINI|README|CONTRIBUTING|SECURITY|CLA|components\.json|package\.json|package-lock\.json|tsconfig.*\.json|vercel\.json|\.aider\.chat\.history\.md|\.mcp\.json)' || true)

if [ -n "$ROOT_TEMP_FILES" ]; then
    echo -e "${YELLOW}⚠ Temporary files found in project root:${NC}"
    echo "$ROOT_TEMP_FILES" | while read -r file; do
        # Check for agent-generated patterns
        if echo "$file" | grep -qE '(_AUDIT|_ANALYSIS|_SUMMARY|FIXES|DUPLICATE|-results\.json|-report\.json|-audit.*\.json|TEST_)'; then
            echo -e "${YELLOW}  → $file (appears to be agent-generated)${NC}"
        else
            echo -e "${YELLOW}  → $file${NC}"
        fi
    done
    echo -e "${YELLOW}  See CLAUDE.md#file-creation-rules for where to save analysis outputs${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓ No temporary files in project root${NC}"
fi
echo ""
```

**Benefits:**
- Catches temporary files before commit
- Provides helpful guidance (link to CLAUDE.md rules)
- Non-blocking (warning, not error) to avoid breaking workflow
- Can upgrade to ERROR later once agents are trained

---

### Priority 4: Education Pattern for Active Sessions

**When agents create root files during a session, immediately educate:**

**Template response:**
```
I created {file} in the project root. This violates file creation rules.

Moving forward:
- Analysis outputs should go to terminal (or docs/technical/ if large)
- Migration scripts belong in scripts/archive/migrations/
- See CLAUDE.md#file-creation-rules

Should I:
1. Delete {file} and output to terminal instead
2. Move {file} to appropriate location
3. Keep it this time (but don't repeat)
```

**Why this works:** Immediate correction + offering fix teaches better than retroactive cleanup.

---

## Recommended Implementation Order

### Week 1 (High ROI, Low Effort)
1. ✅ **Add File Creation Rules to CLAUDE.md** (Priority 1)
   - Effort: 15 minutes (copy-paste ready content above)
   - Impact: High (prevents future violations)
   - Test: Ask agent to "audit feature frontmatter" and verify it outputs to terminal

2. ✅ **Add Pre-Commit Check** (Priority 3)
   - Effort: 10 minutes (bash script addition)
   - Impact: High (catches violations before commit)
   - Test: Create dummy `TEST_AUDIT.md` in root, run pre-commit, verify warning

### Week 2 (Observation Period)
3. 🕐 **Keep .gitignore patterns** (Priority 2 - delayed)
   - Effort: 0 (do nothing)
   - Impact: Observe if agents still create root files despite CLAUDE.md rules
   - If no violations after 1 week → remove patterns (stricter enforcement)

### Ongoing (Practice)
4. 🔄 **Education Pattern** (Priority 4)
   - Effort: As needed (when violations occur)
   - Impact: Reinforces rules over time
   - Success metric: Zero root file creations in 1 month

---

## Success Metrics

**Short-term (1 week):**
- Zero agent-created files matching `/*_AUDIT*.md`, `/*_ANALYSIS*.md`, `*-results.json` patterns
- Pre-commit check catches any violations before commit

**Medium-term (1 month):**
- Agents consistently output analysis to terminal or ask before creating files
- No cleanup commits needed for temporary files
- .gitignore patterns can be safely removed (no longer needed)

**Long-term (3 months):**
- File creation rules become second nature (agents don't violate)
- Project root stays clean (only permanent config files)

---

## Appendix A: Files Cleaned Up (Context)

**From project root (moved to archive or deleted):**
- `FRONTMATTER_AUDIT_SUMMARY.md`
- `DUPLICATE_PREVENTION_ANALYSIS.md`
- `FIXES_APPLIED.md`
- `add-frontmatter-results.json`
- `frontmatter-audit-report.json`

**From scripts/ (moved to scripts/archive/migrations/):**
- `add-missing-frontmatter.js`
- `apply-e2e-migration.mjs`
- `apply-migration.mjs`
- `audit-frontmatter.js`
- `fix-done-status.js`

**Pattern:** All were ad-hoc analysis/migration outputs, not permanent tooling.

---

## Appendix B: .gitignore Current State

**Files already ignored in root:**
```gitignore
/*.png              # Browser automation screenshots
/*.jpg
/*.jpeg
TEST_*.md           # Test markdown files
/*_AUDIT*.md        # Agent audit outputs
/*_ANALYSIS*.md     # Agent analysis outputs
/*_SUMMARY*.md      # Agent summary outputs
/*FIXES*.md         # Agent fix reports
/*DUPLICATE*.md     # Agent duplicate reports
*-results.json      # Agent result outputs
*-report.json       # Agent report outputs
*-audit*.json       # Agent audit JSON outputs
```

**Recommendation:** Remove all `/*_AUDIT*` through `*-audit*.json` patterns after 1-week observation period.

---

## Questions for User

1. **CLAUDE.md addition:** Ready to add File Creation Rules section now? (Copy-paste ready above)

2. **Pre-commit check:** Add immediately or wait until CLAUDE.md rules are in place?

3. **.gitignore patterns:** Remove now (strict enforcement) or keep for 1 week (observation)?

4. **Education pattern:** Should I proactively flag when I see agents creating root files in conversations?

---

## Related Documentation

- **CLAUDE.md** (project instructions): Will contain new File Creation Rules
- **docs/technical/feature-specs.md** (where feature files go)
- **scripts/pre-commit-checks.sh** (will catch violations)
- **.gitignore** (currently catches violations, will be updated)

---

**Next Steps:**
1. User reviews this analysis
2. User approves Priority 1 + Priority 3 (CLAUDE.md + pre-commit)
3. Implement changes
4. Test with ad-hoc analysis request
5. Observe for 1 week
6. Remove .gitignore patterns if no violations
