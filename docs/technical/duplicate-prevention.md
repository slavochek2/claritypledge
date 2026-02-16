# Duplicate P-Number Prevention

**Problem:** P-numbers were being reused when features were moved to done/archive folders.

**Root Cause:** P-number assignment logic only scanned `features/` root directory, not subdirectories like `features/done/` or `features/archive/`.

---

## Prevention Strategy

### 1. Skills Updated to Scan ALL Folders

Both `/create-prd` and `/quick-feature` skills now scan:
- `features/**/*.md` (all subdirectories)
- Not just `features/*.md` (root only)

**Implementation:**
```bash
# Find highest P-number across ALL folders
max_p=$(find features -type f -name "p[0-9]*.md" 2>/dev/null |
  sed -E 's/.*\/p([0-9]+)[_-].*/\1/' |
  sort -n |
  tail -1)

next_p=$((max_p + 1))
```

### 2. Pre-Commit Hook Integration

Added to `scripts/pre-commit-checks.sh`:
```bash
# Check for duplicate P-numbers
echo ">>> Checking for duplicate P-numbers..."
if ! ./scripts/check-duplicate-p-numbers.sh; then
  echo -e "${RED}✗ Duplicate P-numbers found${NC}"
  ERRORS=$((ERRORS + 1))
fi
```

### 3. Manual Check Script

Run anytime:
```bash
./scripts/check-duplicate-p-numbers.sh
```

---

## Resolution Protocol

When duplicates are detected:

1. **Identify which is active:**
   - If one is in `features/done/` or `features/archive/` → Keep active version
   - If both are active → Keep the one in main `features/` folder

2. **Renumber the duplicate:**
   ```bash
   # Find next available P-number
   ./scripts/check-duplicate-p-numbers.sh
   
   # Rename file
   git mv features/p135_old.md features/p149_old.md
   
   # Update title in file
   # Update all cross-references
   ```

3. **Update cross-references:**
   ```bash
   # Find all references to old P-number
   grep -r "P135" features/ docs/
   
   # Update each reference
   ```

---

## Historical Context

**Feb 2026 Cleanup:**
- Fixed 47 duplicate P-numbers
- Renumbered P135→P149, P143→P150, P145→P151, P146→P152, P147→P153
- Root cause: Skills only scanned `features/` root
- Fix: Updated skills to scan `features/**/*.md`

Most duplicates were in archived folders (expected - P-numbers reused after archival). Going forward, this is prevented by scanning ALL folders before assignment.
