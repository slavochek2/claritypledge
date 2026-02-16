#!/usr/bin/env node
/**
 * P147: Validate feature frontmatter
 *
 * Uses shared scanner-rules logic to prevent drift (P137 bug).
 *
 * Checks:
 * 1. All status: done features have completed_at field
 * 2. All features in /done/ have status: done
 * 3. All features have required frontmatter fields (status, type, rank)
 * 4. completed_at is a valid date format (YYYY-MM-DD)
 * 5. Valid status/type/size values (from scanner-rules)
 *
 * Usage: npm run validate (from tools/kanban)
 *    or: npx tsx scripts/validate-features.ts (from tools/kanban)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
  shouldSkipFolder,
  isValidStatus,
  isValidType,
  isValidSize,
  VALID_STATUS,
  VALID_TYPE,
  VALID_SIZE,
} from '../lib/scanner-rules.js';

// Get project root (tools/kanban/scripts -> tools/kanban -> tools -> project root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m'; // No Color

let errors = 0;
let warnings = 0;

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  if (!dateString) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Recursively get all .md files in directory, respecting scanner-rules exclusions
 */
function getMarkdownFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      // Use shouldSkipFolder from scanner-rules (single source of truth)
      if (!shouldSkipFolder(file)) {
        getMarkdownFiles(filePath, fileList);
      }
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

/**
 * Check if file is in /done/ directory
 */
function isInDoneDir(filePath: string): boolean {
  return filePath.includes('/done/');
}

/**
 * Check if file is historical (in /done/ or /archive/ directory)
 * Used to warn instead of error for missing completed_at
 */
function isHistorical(filePath: string): boolean {
  return filePath.includes('/done/') || filePath.includes('/archive/');
}

/**
 * Main validation
 */
function validateFeatures(): number {
  console.log('>>> Validating feature frontmatter...\n');

  const featuresDir = join(PROJECT_ROOT, 'features');
  if (!existsSync(featuresDir)) {
    console.log(`${RED}✗ features/ directory not found${NC}`);
    return 1;
  }

  const files = getMarkdownFiles(featuresDir);
  let validCount = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const { data: frontmatter } = matter(content);

    if (!frontmatter || Object.keys(frontmatter).length === 0) {
      console.log(`${RED}✗ ${file}: No frontmatter found${NC}`);
      errors++;
      continue;
    }

    // Check 1: status: done features should have completed_at
    if (frontmatter.status === 'done' && !frontmatter.completed_at) {
      if (isHistorical(file)) {
        // Historical files - warn but don't block
        console.log(`${YELLOW}⚠ ${file}: status=done but missing completed_at (historical)${NC}`);
        warnings++;
      } else {
        // New files - error and block
        console.log(`${RED}✗ ${file}: status=done but missing completed_at${NC}`);
        errors++;
        continue;
      }
    }

    // Check 2: Files in /done/ should have status: done
    if (isInDoneDir(file) && frontmatter.status !== 'done') {
      console.log(`${YELLOW}⚠ ${file}: In /done/ but status=${frontmatter.status}${NC}`);
      warnings++;
    }

    // Check 3: Required fields
    const requiredFields = ['status', 'type', 'rank'];
    const missingFields = requiredFields.filter(field => !frontmatter[field]);

    if (missingFields.length > 0) {
      console.log(`${RED}✗ ${file}: Missing required fields: ${missingFields.join(', ')}${NC}`);
      errors++;
      continue;
    }

    // Check 4: completed_at format (if present)
    if (frontmatter.completed_at && !isValidDate(frontmatter.completed_at)) {
      console.log(`${RED}✗ ${file}: Invalid completed_at format (expected YYYY-MM-DD): ${frontmatter.completed_at}${NC}`);
      errors++;
      continue;
    }

    // Check 5: Valid status value (from scanner-rules)
    if (!isValidStatus(frontmatter.status)) {
      console.log(`${RED}✗ ${file}: Invalid status: ${frontmatter.status}. Must be one of: ${VALID_STATUS.join(', ')}${NC}`);
      errors++;
      continue;
    }

    // Check 6: Valid type value (from scanner-rules)
    if (!isValidType(frontmatter.type)) {
      console.log(`${RED}✗ ${file}: Invalid type: ${frontmatter.type}. Must be one of: ${VALID_TYPE.join(', ')}${NC}`);
      errors++;
      continue;
    }

    // Check 7: Valid size value (if present, from scanner-rules)
    if (frontmatter.size && !isValidSize(frontmatter.size)) {
      console.log(`${RED}✗ ${file}: Invalid size: ${frontmatter.size}. Must be one of: ${VALID_SIZE.join(', ')}${NC}`);
      errors++;
      continue;
    }

    // Check 8: Valid rank (must be a number >= 0)
    if (typeof frontmatter.rank !== 'number' || frontmatter.rank < 0) {
      console.log(`${RED}✗ ${file}: Invalid rank: ${frontmatter.rank}. Must be a positive number${NC}`);
      errors++;
      continue;
    }

    validCount++;
  }

  console.log('\n=== VALIDATION SUMMARY ===');
  console.log(`Total files checked: ${files.length}`);
  console.log(`Valid: ${validCount}`);

  if (errors > 0) {
    console.log(`${RED}Errors: ${errors}${NC}`);
  }

  if (warnings > 0) {
    console.log(`${YELLOW}Warnings: ${warnings}${NC}`);
  }

  if (errors === 0 && warnings === 0) {
    console.log(`${GREEN}✓ All features valid${NC}`);
    return 0;
  } else if (errors === 0) {
    console.log(`${YELLOW}⚠ Validation passed with warnings${NC}`);
    return 0;
  } else {
    console.log(`${RED}✗ Validation failed${NC}`);
    return 1;
  }
}

// Run validation
const exitCode = validateFeatures();
process.exit(exitCode);
