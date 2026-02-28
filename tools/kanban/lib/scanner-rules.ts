/**
 * P147: Kanban Scanner Rules - Shared Logic
 *
 * Single source of truth for folder exclusion, file filtering, and frontmatter validation.
 * Used by both runtime scanner (api.ts) and validation script (validate-features.cjs)
 * to prevent drift like P137 (scanner/validation using different exclusion logic).
 *
 * Principles:
 * - One change updates both runtime and validation
 * - TypeScript provides type safety
 * - All logic is unit-testable
 */

import type { Status, FeatureType, Size, DeliveryStage } from '../src/lib/types';

// Valid enum values (source of truth)
export const VALID_STATUS: readonly Status[] = [
  'backlog',
  'week',
  'today',
  'in-progress',
  'blocked',
  'qa',
  'done',
  'all-done',
  'draft',
  'rejected',
] as const;

export const VALID_TYPE: readonly FeatureType[] = ['bug', 'task', 'story', 'comment'] as const;

export const VALID_SIZE: readonly Size[] = ['xs', 's', 'm', 'l', 'xl'] as const;

export const VALID_DELIVERY_STAGE: readonly DeliveryStage[] = [
  'prd-draft',
  'prd-review',
  'prd-approved',
  'ux-design',
  'ux-review',
  'ux-approved',
  'arch-design',
  'arch-review',
  'arch-approved',
  'tests-generated',
  'implementation',
  'uat',
] as const;

// Folders to skip during scanning
export const SKIP_FOLDERS = ['research', 'uat'] as const;

// Pattern for dated archive folders
// Matches multiple formats found in the repository:
// - Day-based: "4_27_jan26", "3_1_jan26" (N_D_MMMYY format)
// - Month-based with underscore: "5_feb_26" (N_MMM_YY format with underscore)
// - Month-based without underscore: "1_nov25" (N_MMMYY format)
// First number is 1-2 digits (sequence/month), optional second is 1-2 digits (day)
// Month is letters, year is 2 digits (not 4-digit years like "2026")
// Negative lookahead (?!\d) ensures we don't match the start of longer numbers
export const DATE_ARCHIVE_PATTERN = /^\d{1,2}(?!\d)_(\d{1,2}_)?\w+_?\d{2}$/;

/**
 * Check if a dated archive folder belongs to the current month.
 *
 * sweep-done.sh creates folders like "5_feb_26" (N_mon_yy).
 * The current month's folder must not be skipped — it holds "Done Today" cards.
 *
 * @param folderName - Name of the folder (not full path)
 */
function isCurrentMonthFolder(folderName: string): boolean {
  const now = new Date();
  const mon = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const yy = String(now.getFullYear()).slice(-2);
  const lower = folderName.toLowerCase();
  // Matches both "_feb_26" and "_feb26" separator styles
  return lower.includes(`_${mon}_${yy}`) || lower.includes(`_${mon}${yy}`);
}

/**
 * Determine if a folder should be skipped during scanning
 *
 * P137 BUG: Scanner and validation had different exclusion logic
 * - Scanner: skipFolders + isDateArchive regex
 * - Validation: isHistorical function (different pattern)
 *
 * This function is the single source of truth for both.
 *
 * @param folderName - Name of the folder (not full path)
 * @returns true if folder should be skipped, false otherwise
 */
export function shouldSkipFolder(folderName: string): boolean {
  // Skip explicitly excluded folders
  if ((SKIP_FOLDERS as readonly string[]).includes(folderName)) {
    return true;
  }

  // Skip dated archive folders (e.g., "4_27_jan26"), but NOT the current
  // month's folder — it contains cards moved to done this month, including today.
  if (DATE_ARCHIVE_PATTERN.test(folderName)) {
    if (isCurrentMonthFolder(folderName)) return false;
    return true;
  }

  return false;
}

/**
 * Determine if a file is a valid feature file
 *
 * Valid feature files:
 * - End with .md extension
 * - Contain "p" followed by digits in filename (e.g., p147, p1, p999)
 *
 * @param filename - Name of the file (not full path)
 * @returns true if file should be scanned, false otherwise
 */
export function isFeatureFile(filename: string): boolean {
  return filename.endsWith('.md') && /\bp\d+/.test(filename);
}

/**
 * Validate frontmatter status value
 *
 * @param status - Status value from frontmatter
 * @returns true if valid, false otherwise
 */
export function isValidStatus(status: unknown): status is Status {
  return typeof status === 'string' && VALID_STATUS.includes(status as Status);
}

/**
 * Validate frontmatter type value
 *
 * @param type - Type value from frontmatter
 * @returns true if valid, false otherwise
 */
export function isValidType(type: unknown): type is FeatureType {
  return typeof type === 'string' && VALID_TYPE.includes(type as FeatureType);
}

/**
 * Validate frontmatter size value
 *
 * @param size - Size value from frontmatter
 * @returns true if valid, false otherwise
 */
export function isValidSize(size: unknown): size is Size {
  return typeof size === 'string' && VALID_SIZE.includes(size as Size);
}

/**
 * Validate rank is a positive number
 *
 * @param rank - Rank value from frontmatter
 * @returns true if valid, false otherwise
 */
export function isValidRank(rank: unknown): rank is number {
  return typeof rank === 'number' && Number.isFinite(rank) && rank >= 0;
}

/**
 * Validate tags is an array of strings
 *
 * @param tags - Tags value from frontmatter
 * @returns true if valid, false otherwise
 */
export function isValidTags(tags: unknown): tags is string[] {
  return (
    Array.isArray(tags) &&
    tags.every(tag => typeof tag === 'string')
  );
}

/**
 * Simple frontmatter validator (without Zod dependency)
 *
 * Validates that frontmatter has required fields with correct types.
 * Used by scanner to validate frontmatter before processing.
 *
 * @param frontmatter - Parsed frontmatter object
 * @returns Validation result with success flag and optional error message
 */
export function validateFrontmatter(frontmatter: unknown): {
  success: boolean;
  error?: string;
} {
  // Check required fields exist
  if (!frontmatter) {
    return { success: false, error: 'Frontmatter is missing' };
  }

  // Validate status (required)
  if (!isValidStatus(frontmatter.status)) {
    return {
      success: false,
      error: `Invalid status: ${frontmatter.status}. Must be one of: ${VALID_STATUS.join(', ')}`,
    };
  }

  // Validate rank (required)
  if (!isValidRank(frontmatter.rank)) {
    return {
      success: false,
      error: `Invalid rank: ${frontmatter.rank}. Must be a positive number`,
    };
  }

  // Validate type (optional, but if present must be valid)
  if (frontmatter.type !== undefined && !isValidType(frontmatter.type)) {
    return {
      success: false,
      error: `Invalid type: ${frontmatter.type}. Must be one of: ${VALID_TYPE.join(', ')}`,
    };
  }

  // Validate size (optional, but if present must be valid)
  if (frontmatter.size !== undefined && !isValidSize(frontmatter.size)) {
    return {
      success: false,
      error: `Invalid size: ${frontmatter.size}. Must be one of: ${VALID_SIZE.join(', ')}`,
    };
  }

  // Validate tags (optional, but if present must be array of strings)
  if (frontmatter.tags !== undefined && !isValidTags(frontmatter.tags)) {
    return {
      success: false,
      error: 'Invalid tags: must be an array of strings',
    };
  }

  return { success: true };
}
