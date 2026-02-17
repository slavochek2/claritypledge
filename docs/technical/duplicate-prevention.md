# Duplicate P-Number Prevention

**Problem:** P-numbers were being reused when features were moved to done/archive folders.

**Root Cause:** P-number assignment logic only scanned `features/` root directory, not subdirectories like `features/done/` or `features/archive/`.

---

## Prevention Strategy

### 1. Canonical Script for P-Number Assignment

All skills use `./scripts/next-p-number.sh` — the single source of truth.

```bash
./scripts/next-p-number.sh   # prints next available integer
```

**What it scans:** `features/` including `done/` subdirectories.

**What it excludes:**
- `uat/` — companion files keyed to existing P-numbers (e.g. `p192.md` is UAT for feature P192, not a new feature)
- `archive/` — retired P-numbers; not available for reuse

Never compute the next P-number with an ad-hoc `find` command. Different invocations produce different results depending on which folders they include.

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
- Root cause: Skills only scanned `features/` root; `uat/` and `archive/` inflated the sequence
- Fix: Created `scripts/next-p-number.sh` — canonical tool that scans `features/**` while excluding `uat/` and `archive/`

Most duplicates were in archived folders (expected - P-numbers reused after archival). Going forward, all skills use the canonical script to prevent this.
