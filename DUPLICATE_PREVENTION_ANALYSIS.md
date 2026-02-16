# Root Cause Analysis: Duplicate P-Numbers & Invisible Specs

**Date:** 2026-02-16
**Analyst:** Claude Sonnet 4.5
**Scope:** Feature file organization and kanban visibility

---

## 🔍 Root Cause Analysis

### Issue 1: Duplicate P-Numbers

#### Case Study: P139 (E2E Cleanup FK Constraint)

**Current State:**
- `features/p139_e2e_cleanup_fk_constraint.md` (status: in-progress)
- `features/done/p139_e2e_cleanup_fk_constraint.md` (status: done, "Merged into P138")

**How it happened:**
1. P139 was created in `features/` (Feb 15, commit 5bd86d4)
2. Work progressed, issue was resolved and merged into P138
3. Someone created a summary file in `done/` explaining resolution
4. **ERROR:** Original file in `features/` was NOT deleted or updated
5. Result: Two files with P139, different status

**Root cause:** No enforcement that P-number is unique across ALL folders

#### Case Study: P134 (Profile Story-Point Links)

**Current State:**
- `features/p134_profile_story_point_links.md` (status: blocked, minimal content)
- `features/archive/5_feb_26/p134_profile_story_point_links.md` (status: blocked, extensive prep)

**How it happened:**
1. P134 was created with extensive prep work (UX, Architect, Alignment reviews)
2. Feature moved to `archive/5_feb_26/` (dated folder)
3. **ERROR:** Someone later created NEW file with same P134 number in `features/`
4. Result: Original detailed spec hidden in archive, stub in main folder

**Root cause:** P-number assignment doesn't check archived/dated folders

---

### Issue 2: Specs Don't Show Up in Kanban

#### Scanner Exclusion Rules (from P147 analysis)

**Folders EXCLUDED from kanban scan:**
```typescript
const skipFolders = ['research', 'uat']
const isDateArchive = /^\d+_\d+_\w+\d+$/.test(entry.name)
// Skips: 5_feb_26, 4_27_jan26, 1_nov25, etc.
```

**Folders INCLUDED in kanban scan:**
- `features/` (root)
- `features/done/` (unless in dated subfolder)
- `features/archive/` (unless in dated subfolder)
- `features/drafts/`
- `features/bugs_and_debt/`

**Problem Cases:**

1. **P134 in `archive/5_feb_26/`** → INVISIBLE (dated folder)
2. **P148 in `archive/5_feb_26/`** → INVISIBLE (dated folder)
3. **All files in `done/5_feb_26/`** → INVISIBLE (dated folder)

**Hidden Features Count:**
```bash
$ find features -type d -regex '.*/[0-9]+_.*[0-9]+' | wc -l
3  # Three dated folders hiding features

$ find features/archive/5_feb_26 features/done/5_feb_26 features/done/4_27_jan26 -name "*.md" | wc -l
50+  # Over 50 features hidden in dated folders
```

#### Why Dated Folders Exist

**Intended use:** Archive completed work from a specific time period
**Actual use:** Mixture of done, archived, and active features

**Problem:** No clear policy on when to use dated folders vs `done/` vs `archive/`

---

## 💡 Sustainable Solutions

### Solution 1: Enforce Unique P-Numbers (Pre-commit Hook)

**File:** `scripts/check-duplicate-p-numbers.sh`

```bash
#!/bin/bash
# Check for duplicate P-numbers across ALL feature folders

set -e

echo ">>> Checking for duplicate P-numbers..."

# Find all P-numbers in feature files (including done, archive, dated folders)
p_numbers=$(find features -name "p[0-9]*.md" -type f |
  sed -E 's/.*\/p([0-9]+).*/\1/' |
  sort)

# Check for duplicates
duplicates=$(echo "$p_numbers" | uniq -d)

if [ -n "$duplicates" ]; then
  echo "❌ DUPLICATE P-NUMBERS FOUND:"
  echo "$duplicates" | while read -r num; do
    echo ""
    echo "  P$num appears in:"
    find features -name "p${num}_*.md" -o -name "p${num}.md" | sed 's/^/    /'
  done
  echo ""
  echo "Fix: Delete duplicate or rename to next available P-number"
  exit 1
fi

echo "✓ No duplicate P-numbers found"
```

**Integration:** Add to `scripts/pre-commit-checks.sh` line ~220:
```bash
# 14. Check for duplicate P-numbers
if [ -f "./scripts/check-duplicate-p-numbers.sh" ]; then
    ./scripts/check-duplicate-p-numbers.sh || ERRORS=$((ERRORS + 1))
fi
```

---

### Solution 2: P-Number Assignment Scans ALL Folders

**Current behavior (from `/slava:build:create-prd`):**
```typescript
// Only scans features/ root
const features = await glob('features/p*.md')
```

**Fixed behavior:**
```typescript
// Scan ALL feature files (including done, archive, dated folders)
const features = await glob('features/**/p*.md', {
  ignore: ['**/node_modules/**']
})

const maxP = features
  .map(f => parseInt(f.match(/p(\d+)/)?.[1] || '0'))
  .reduce((max, n) => Math.max(max, n), 0)

const nextP = maxP + 1  // Guaranteed unique
```

**Files to update:**
- `.claude/commands/slava/build/create-prd/agent.md`
- `.claude/commands/slava/build/quick-feature.md`
- Any skill that auto-assigns P-numbers

---

### Solution 3: Kanban Visibility Documentation

**File:** `docs/technical/feature-specs.md` (add section)

```markdown
## Kanban Visibility Rules

### ✅ Folders VISIBLE in Kanban

- `features/` (root)
- `features/done/` (non-dated)
- `features/archive/` (non-dated)
- `features/drafts/`
- `features/bugs_and_debt/`

### ❌ Folders HIDDEN from Kanban

- `features/research/` (research notes, not actionable features)
- `features/uat/` (user acceptance test protocols)
- `features/*/5_feb_26/` (dated folders - archived work from specific period)
- `features/*/4_27_jan26/` (dated folders)
- `features/*/1_nov25/` (dated folders)

**Rule:** Any folder matching pattern `\d+_\w+\d+` is excluded (dated archive)

### Why Dated Folders?

**Purpose:** Group completed work by time period for historical reference

**When to use:**
- End of sprint/milestone → move all `done/` features to `done/YYYY-MM-DD/`
- Major refactor complete → move related features to `archive/YYYY-MM-DD/`

**When NOT to use:**
- Active features (even if blocked) → keep in `features/`
- Features needing visibility → keep in non-dated folders

### How to Check Visibility

```bash
# See what kanban will show
npm run kanban

# See what's hidden in dated folders
find features -type d -regex '.*/[0-9]+_.*[0-9]+' -exec ls {} \;
```
```

---

### Solution 4: File Movement Protocol

**Document in `CLAUDE.md`:**

```markdown
### Moving Features Between Folders

**Safe file movement:**
```bash
# Mark as done → move to done/
git mv features/pXXX_name.md features/done/pXXX_name.md

# Archive old feature → move to archive/ (stays visible)
git mv features/pXXX_name.md features/archive/pXXX_name.md

# Archive sprint work → move to dated folder (becomes hidden)
git mv features/done/pXXX_name.md features/done/5_feb_26/pXXX_name.md
```

**CRITICAL RULES:**
1. Always use `git mv` (preserves history)
2. Never create new file with same P-number
3. If file exists in multiple locations, keep ONE canonical version
4. Before creating new Pxxx, search ALL folders: `find features -name "p${N}_*"`

**If you find duplicates:**
```bash
# 1. Identify canonical version (most complete, most recent)
# 2. Delete duplicates
git rm features/pXXX_duplicate.md

# 3. If moving canonical version, use git mv
git mv features/archive/5_feb_26/pXXX_name.md features/pXXX_name.md
```
```

---

### Solution 5: Validation Script Enhancement

**Add to `scripts/validate-features.cjs`:**

```javascript
// Check for duplicate P-numbers
function checkDuplicatePNumbers(files) {
  const pNumbers = new Map() // number -> [file paths]

  for (const file of files) {
    const match = file.match(/p(\d+)/)
    if (match) {
      const num = match[1]
      if (!pNumbers.has(num)) pNumbers.set(num, [])
      pNumbers.get(num).push(file)
    }
  }

  const duplicates = Array.from(pNumbers.entries())
    .filter(([_, paths]) => paths.length > 1)

  if (duplicates.length > 0) {
    console.error('\n❌ DUPLICATE P-NUMBERS DETECTED:')
    for (const [num, paths] of duplicates) {
      console.error(`\n  P${num} appears in:`)
      paths.forEach(p => console.error(`    - ${p}`))
    }
    console.error('\n  Fix: Delete duplicates or rename to unique P-number')
    process.exit(1)
  }
}

// Check for features in dated folders (likely invisible in kanban)
function warnInvisibleFeatures(files) {
  const datedFolderPattern = /\/\d+_\w+\d+\//
  const invisible = files.filter(f => datedFolderPattern.test(f))

  if (invisible.length > 0) {
    console.warn('\n⚠️  WARNING: Features in dated folders (hidden from kanban):')
    invisible.forEach(f => console.warn(`    - ${f}`))
    console.warn('\n  These features will NOT appear in kanban UI')
    console.warn('  Move to non-dated folder if they should be visible')
  }
}
```

---

## 🛠️ Immediate Fixes

### Fix 1: Resolve P139 Duplicate

```bash
# The done/ version is the canonical record (has resolution note)
# The features/ version is outdated (still says in-progress)

# Delete the outdated in-progress version
git rm features/p139_e2e_cleanup_fk_constraint.md

# Keep the done/ version (already documents that P139 merged into P138)
git add features/done/p139_e2e_cleanup_fk_constraint.md
```

### Fix 2: Resolve P134 Duplicate

```bash
# The archive version has ALL the prep work (UX, Architect, Alignment)
# The features/ version is a stub with minimal content

# Move archive version back to features/ (it's blocked, not done)
git mv features/archive/5_feb_26/p134_profile_story_point_links.md features/p134_profile_story_point_links.md --force

# This overwrites the stub and restores the complete spec
```

### Fix 3: Validate All Current Features

```bash
# Run enhanced validation to find other duplicates
node scripts/validate-features.cjs

# Find all features in dated folders (potentially invisible)
find features -type d -regex '.*/[0-9]+_.*[0-9]+' -exec find {} -name "p*.md" \;
```

---

## 📊 Impact Assessment

### Current State (Before Fixes)

**Duplicates:**
- 2 confirmed (P139, P134)
- Unknown how many more exist

**Hidden Features:**
- 50+ features in dated folders
- Unknown if they should be visible or truly archived

**Risk:**
- High: Agents may reuse P-numbers (no prevention)
- Medium: Features lost in dated folders
- Low: Confusion about folder structure

### Target State (After Fixes)

**Duplicates:**
- Zero (pre-commit blocks creation)
- Existing duplicates resolved

**Hidden Features:**
- Documented (clear rules in feature-specs.md)
- Intentional (dated folders for historical archives)

**Risk:**
- Zero: Pre-commit prevents duplicates
- Low: Clear folder visibility rules
- Zero: File movement protocol documented

---

## ✅ Implementation Checklist

### Phase 1: Documentation (15 min)
- [ ] Add "Kanban Visibility Rules" to `docs/technical/feature-specs.md`
- [ ] Add "File Movement Protocol" to `CLAUDE.md`
- [ ] Document dated folder purpose and usage

### Phase 2: Validation Enhancement (30 min)
- [ ] Create `scripts/check-duplicate-p-numbers.sh`
- [ ] Add duplicate check to `scripts/validate-features.cjs`
- [ ] Add invisible feature warning to validation
- [ ] Test validation catches P139 and P134 duplicates

### Phase 3: Pre-commit Integration (10 min)
- [ ] Add duplicate check to `scripts/pre-commit-checks.sh`
- [ ] Test: Create duplicate P-number → verify pre-commit fails
- [ ] Test: Create file in dated folder → verify warning shown

### Phase 4: P-Number Assignment Fix (20 min)
- [ ] Update `/slava:build:create-prd` to scan ALL folders
- [ ] Update `/slava:build:quick-feature` to scan ALL folders
- [ ] Test: Create feature → verify P-number doesn't conflict with archived features

### Phase 5: Fix Current Issues (15 min)
- [ ] Delete `features/p139_e2e_cleanup_fk_constraint.md`
- [ ] Move `features/archive/5_feb_26/p134_profile_story_point_links.md` → `features/`
- [ ] Commit all untracked feature files
- [ ] Verify no duplicates remain: `./scripts/check-duplicate-p-numbers.sh`

### Phase 6: Verification (10 min)
- [ ] Run validation: `node scripts/validate-features.cjs`
- [ ] Check kanban: `npm run kanban` → verify P134 now visible
- [ ] Pre-commit test: Try creating duplicate → verify blocked

**Total Estimated Time:** 2 hours

---

## 🎯 Success Metrics

**Immediate (After Phase 5):**
- Zero duplicate P-numbers across all folders
- P134 visible in kanban with full prep work
- All untracked features committed

**Ongoing (After Phase 6):**
- Pre-commit blocks duplicate P-number creation (100% prevention)
- Validation warns about invisible features (awareness)
- Clear documentation prevents future confusion (onboarding)

**Long-term (3 months):**
- Zero duplicate P-number incidents
- Zero "lost feature" incidents (archived features are intentional)
- Agents consistently create features in correct folders

---

## 📚 Related Work

- **P147:** Kanban System Test Coverage - Will test scanner exclusion rules
- **P148:** Kanban Sustainability - Merged into P147, addresses validation drift
- **Feature-specs.md:** Documents frontmatter format, needs visibility rules addition

---

**Next Steps:**
1. Review this analysis with user
2. User approves implementation plan
3. Execute Phase 1-6 in sequence
4. Verify all success metrics met
