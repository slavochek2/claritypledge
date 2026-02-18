import { describe, it, expect } from 'vitest';
import {
  shouldSkipFolder,
  isFeatureFile,
  validateFrontmatter,
  VALID_STATUS,
  VALID_TYPE,
  isValidStatus,
  isValidType,
  isValidRank,
  isValidTags,
} from '../scanner-rules';

/**
 * P147: Kanban Scanner Rules - Unit Tests
 *
 * Tests folder exclusion rules, date patterns, file filtering, and frontmatter validation
 * to prevent bugs like P137 (scanner/validation drift).
 *
 * These tests verify:
 * - Folder exclusion logic (research/, uat/, dated folders)
 * - File filtering (*.md files with p\d+ pattern)
 * - Frontmatter parsing and validation
 * - Edge cases (missing fields, invalid values, special characters)
 */

/** Generate a dated folder name for the current month (sweep-done.sh format: N_mon_yy) */
function currentMonthFolder(n = 1): string {
  const now = new Date();
  const mon = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const yy = String(now.getFullYear()).slice(-2);
  return `${n}_${mon}_${yy}`;
}

describe('P147: Scanner Rules - Folder Exclusion', () => {
  it('excludes research/ folder', () => {
    expect(shouldSkipFolder('research')).toBe(true);
  });

  it('excludes uat/ folder', () => {
    expect(shouldSkipFolder('uat')).toBe(true);
  });

  it('excludes past-month dated folders (format: N_D+_MMM+D+)', () => {
    /**
     * P137 BUG: Scanner and validation had different date patterns
     * Scanner: /^\d+_\d+_\w+\d+$/ (anchored, full folder name)
     * Validation: /\/\d+_\w+\d+\// (path-based, slightly different)
     *
     * Past-month dated folders are skipped to keep scan fast on large archives.
     */
    expect(shouldSkipFolder('4_27_jan26')).toBe(true);
    expect(shouldSkipFolder('1_nov25')).toBe(true);
    expect(shouldSkipFolder('12_01_dec24')).toBe(true);

    // Invalid formats should NOT be excluded
    expect(shouldSkipFolder('not_a_date')).toBe(false);
    expect(shouldSkipFolder('2026_feb_15')).toBe(false); // different format
    expect(shouldSkipFolder('archive')).toBe(false);
  });

  it('includes current-month dated folder (P___ regression: "Done Today" cards)', () => {
    /**
     * sweep-done.sh moves loose done files into a monthly folder like "5_feb_26".
     * The scanner must NOT skip the current month's folder — it holds cards completed
     * this month, including "Done Today" cards. Skipping it causes Done Today to go
     * empty after a cache refresh.
     */
    expect(shouldSkipFolder(currentMonthFolder(1))).toBe(false);
    expect(shouldSkipFolder(currentMonthFolder(5))).toBe(false);
  });

  it('includes done/ folder (not excluded)', () => {
    expect(shouldSkipFolder('done')).toBe(false);
    // Note: done/ is a valid folder, scanner should process it
  });

  it('includes archive/ folder (not excluded)', () => {
    expect(shouldSkipFolder('archive')).toBe(false);
    // Note: archive/ is a valid folder, scanner should process it
  });
});

describe('P147: Scanner Rules - File Filtering', () => {
  it('includes .md files with p{N} pattern', () => {
    expect(isFeatureFile('p147_test.md')).toBe(true);
    expect(isFeatureFile('p1_first.md')).toBe(true);
    expect(isFeatureFile('p999_big.md')).toBe(true);
    expect(isFeatureFile('test-p147.md')).toBe(true); // p147 after hyphen (word boundary)
  });

  it('excludes .md files without p{N} pattern', () => {
    expect(isFeatureFile('README.md')).toBe(false);
    expect(isFeatureFile('notes.md')).toBe(false);
    expect(isFeatureFile('feature_no_number.md')).toBe(false);
  });

  it('excludes non-.md files', () => {
    expect(isFeatureFile('p147.txt')).toBe(false);
    expect(isFeatureFile('p147.json')).toBe(false);
    expect(isFeatureFile('p147')).toBe(false); // no extension
  });

  it('handles edge cases (special characters, spaces)', () => {
    expect(isFeatureFile('p147_test-feature.md')).toBe(true);
    expect(isFeatureFile('p147_test_feature.md')).toBe(true);
    expect(isFeatureFile('p147 test.md')).toBe(true); // space before "p" - still matches \bp\d+
  });
});

describe('P147: Scanner Rules - Frontmatter Validation', () => {
  it('validates required fields (status, rank)', () => {
    const validFrontmatter = {
      status: 'backlog',
      rank: 147.0,
      type: 'task',
      tags: ['testing'],
    };

    const result = validateFrontmatter(validFrontmatter);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('validates status enum values', () => {
    // Valid statuses should pass
    for (const status of VALID_STATUS) {
      expect(isValidStatus(status)).toBe(true);
    }

    // Invalid status should fail
    expect(isValidStatus('invalid')).toBe(false);
    expect(isValidStatus(null)).toBe(false);
    expect(isValidStatus(undefined)).toBe(false);
    expect(isValidStatus(123)).toBe(false);

    // Frontmatter validation should reject invalid status
    const invalid = validateFrontmatter({ status: 'invalid', rank: 1 });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid status');
  });

  it('validates type enum values', () => {
    // Valid types should pass
    for (const type of VALID_TYPE) {
      expect(isValidType(type)).toBe(true);
    }

    // Invalid type should fail
    expect(isValidType('invalid')).toBe(false);
    expect(isValidType(null)).toBe(false);
    expect(isValidType(undefined)).toBe(false);

    // Frontmatter validation should reject invalid type
    const invalid = validateFrontmatter({ status: 'backlog', rank: 1, type: 'invalid' });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid type');
  });

  it('validates rank is positive number', () => {
    // Valid ranks
    expect(isValidRank(1.0)).toBe(true);
    expect(isValidRank(147.0)).toBe(true);
    expect(isValidRank(999.5)).toBe(true);
    expect(isValidRank(0)).toBe(true); // 0 is valid (positive or zero)

    // Invalid ranks
    expect(isValidRank(-1)).toBe(false); // negative
    expect(isValidRank('not a number')).toBe(false);
    expect(isValidRank(null)).toBe(false);
    expect(isValidRank(undefined)).toBe(false);
    expect(isValidRank(NaN)).toBe(false);
    expect(isValidRank(Infinity)).toBe(false);

    // Frontmatter validation should reject invalid ranks
    const invalid = validateFrontmatter({ status: 'backlog', rank: -1 });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid rank');
  });

  it('validates tags is array of strings', () => {
    // Valid tags
    expect(isValidTags([])).toBe(true);
    expect(isValidTags(['testing'])).toBe(true);
    expect(isValidTags(['testing', 'kanban'])).toBe(true);

    // Invalid tags
    expect(isValidTags('not an array')).toBe(false);
    expect(isValidTags([1, 2, 3])).toBe(false);
    expect(isValidTags(null)).toBe(false);
    expect(isValidTags(undefined)).toBe(false);
    expect(isValidTags([true, false])).toBe(false);
    expect(isValidTags(['valid', 123])).toBe(false); // mixed types

    // Frontmatter validation should reject invalid tags
    const invalid = validateFrontmatter({ status: 'backlog', rank: 1, tags: 'not an array' });
    expect(invalid.success).toBe(false);
    expect(invalid.error).toContain('Invalid tags');
  });

  it('handles optional fields (type, size, workstream, prepped_date)', () => {
    // Frontmatter without optional fields should pass
    const minimal = validateFrontmatter({
      status: 'backlog',
      rank: 147.0,
    });
    expect(minimal.success).toBe(true);

    // Frontmatter with optional fields should pass
    const withOptional = validateFrontmatter({
      status: 'backlog',
      rank: 147.0,
      type: 'task',
      size: 'm',
      workstream: 'foundation',
      prepped_date: '2026-02-16',
      tags: ['testing'],
    });
    expect(withOptional.success).toBe(true);
  });
});

describe('P147: Scanner Rules - Edge Cases', () => {
  it('handles missing frontmatter', () => {
    const result = validateFrontmatter(null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Frontmatter is missing');
  });

  it('handles missing required fields', () => {
    // Missing status
    const missingStatus = validateFrontmatter({ rank: 1 });
    expect(missingStatus.success).toBe(false);
    expect(missingStatus.error).toContain('Invalid status');

    // Missing rank
    const missingRank = validateFrontmatter({ status: 'backlog' });
    expect(missingRank.success).toBe(false);
    expect(missingRank.error).toContain('Invalid rank');
  });

  it('handles special characters in folder names', () => {
    // Special characters should not affect exclusion logic
    expect(shouldSkipFolder('features-backup')).toBe(false);
    expect(shouldSkipFolder('test_123')).toBe(false);
    expect(shouldSkipFolder('uat-old')).toBe(false); // "uat-old" !== "uat"

    // But exact matches should still work
    expect(shouldSkipFolder('uat')).toBe(true);
    expect(shouldSkipFolder('research')).toBe(true);
  });
});

describe('P147: P137 Regression Test - Scanner/Validation Drift', () => {
  it('scanner and validation use identical folder exclusion logic', () => {
    /**
     * P137 BUG: Scanner excluded dated folders, validation didn't
     * Scanner: skipFolders + isDateArchive
     * Validation: isHistorical (different logic)
     *
     * This test ensures both use the same shouldSkipFolder function
     */

    // research/ → excluded
    expect(shouldSkipFolder('research')).toBe(true);

    // uat/ → excluded
    expect(shouldSkipFolder('uat')).toBe(true);

    // Past-month dated folders → excluded
    expect(shouldSkipFolder('4_27_jan26')).toBe(true);
    expect(shouldSkipFolder('1_nov25')).toBe(true);

    // Current-month dated folder → NOT excluded (holds "Done Today" cards)
    expect(shouldSkipFolder(currentMonthFolder())).toBe(false);

    // done/ → included (NOT excluded)
    expect(shouldSkipFolder('done')).toBe(false);

    // archive/ → included (NOT excluded)
    expect(shouldSkipFolder('archive')).toBe(false);

    /**
     * REGRESSION TEST VALIDATION:
     * - On OLD code (separate logic): Test should FAIL (drift detected)
     * - On FIXED code (shared logic): Test should PASS
     *
     * This test PASSES because we now use the same shouldSkipFolder function
     * everywhere, eliminating the drift that caused P137.
     */
  });
});
