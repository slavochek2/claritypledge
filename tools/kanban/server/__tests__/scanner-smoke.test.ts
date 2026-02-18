import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { mkdir, writeFile, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';
import matter from 'gray-matter';
import { shouldSkipFolder, isFeatureFile } from '../../lib/scanner-rules';

/**
 * P147: Kanban Scanner - Smoke Tests
 *
 * Critical smoke tests that verify folder exclusion logic works correctly.
 * These tests call scanner-rules functions directly (unit test approach) rather than
 * making HTTP requests, making them faster and more resilient.
 *
 * Tests verify:
 * - research/ folder exclusion
 * - uat/ folder exclusion
 * - Dated folder exclusion (P137 regression protection)
 *
 * PREREQUISITES:
 * - None - tests are self-contained and use temporary fixtures
 * - No server required (tests scanner logic directly)
 */

// Test fixtures directory (in system temp)
const TEST_FIXTURES_BASE = join(tmpdir(), 'kanban-smoke-tests');
let TEST_WORKTREE_PATH: string;
let TEST_FEATURES_DIR: string;

/**
 * Helper: Create a test feature file
 */
async function createTestFeature(
  filename: string,
  frontmatter: Record<string, unknown>,
  content: string = '# Test Feature',
  subfolder: string = ''
): Promise<string> {
  const dir = subfolder ? join(TEST_FEATURES_DIR, subfolder) : TEST_FEATURES_DIR;
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, filename);
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: [${value.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]`;
      }
      return `${key}: ${typeof value === 'string' ? `"${value}"` : value}`;
    })
    .join('\n');

  const fileContent = `---\n${yaml}\n---\n\n${content}`;
  await writeFile(filePath, fileContent, 'utf-8');
  return filePath;
}

/**
 * Helper: Scan features directory using scanner-rules logic
 * Replicates the scanDir logic from api.ts without importing it (to avoid server startup)
 */
async function scanFeatures(featuresDir: string): Promise<any[]> {
  const features: any[] = [];

  async function scanDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip folders using shared scanner-rules logic
          if (!shouldSkipFolder(entry.name)) {
            await scanDir(fullPath);
          }
        } else if (isFeatureFile(entry.name)) {
          // Parse feature file (minimal - just extract ID)
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const { data } = matter(content);
            const id = entry.name.replace('.md', '');
            features.push({ id, status: data.status, path: fullPath });
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  await scanDir(featuresDir);
  return features;
}

describe('P147: Scanner Smoke Tests - Critical Folder Exclusions', () => {
  beforeEach(async () => {
    // Setup test fixtures (create unique directory per test)
    TEST_WORKTREE_PATH = join(TEST_FIXTURES_BASE, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    TEST_FEATURES_DIR = join(TEST_WORKTREE_PATH, 'features');
    await mkdir(TEST_FEATURES_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test fixtures
    try {
      await rm(TEST_WORKTREE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('excludes features from research/ folder', async () => {
    /**
     * CRITICAL SMOKE TEST #1: research/ folder exclusion
     * Verifies that features in research/ are not returned by scanner
     */

    // Create test feature in features/research/
    await createTestFeature('p99_research.md', { status: 'backlog', rank: 99.0 }, '# Research', 'research');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Scan features using scanner logic
    const features = await scanFeatures(TEST_FEATURES_DIR);

    // Verify research/ features are NOT included
    expect(features.length).toBe(1);
    expect(features[0].id).toBe('p1_normal');
    expect(features.find(f => f.id === 'p99_research')).toBeUndefined();
  });

  it('excludes features from uat/ folder', async () => {
    /**
     * CRITICAL SMOKE TEST #2: uat/ folder exclusion
     * Verifies that features in uat/ are not returned by scanner
     */

    // Create test feature in features/uat/
    await createTestFeature('p99_uat.md', { status: 'backlog', rank: 99.0 }, '# UAT', 'uat');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Scan features using scanner logic
    const features = await scanFeatures(TEST_FEATURES_DIR);

    // Verify uat/ features are NOT included
    expect(features.length).toBe(1);
    expect(features[0].id).toBe('p1_normal');
    expect(features.find(f => f.id === 'p99_uat')).toBeUndefined();
  });

  it('excludes features from past-month dated folders (P137 regression)', async () => {
    /**
     * CRITICAL SMOKE TEST #3: Dated folder exclusion
     *
     * P137 BUG: Validation script didn't exclude dated folders like scanner did
     * This test ensures scanner correctly excludes past-month folders like "4_27_jan26/".
     *
     * Note: The current month's folder is intentionally NOT excluded — it holds
     * "Done Today" cards. See isCurrentMonthFolder() in scanner-rules.ts.
     */

    // Create test feature in past-month folder features/4_27_jan26/
    await createTestFeature('p99_dated.md', { status: 'backlog', rank: 99.0 }, '# Dated', '4_27_jan26');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Scan features using scanner logic
    const features = await scanFeatures(TEST_FEATURES_DIR);

    // Verify past-month folder features are NOT included
    expect(features.length).toBe(1);
    expect(features[0].id).toBe('p1_normal');
    expect(features.find(f => f.id === 'p99_dated')).toBeUndefined();

    // Additional verification: past-month folders excluded, current-month NOT excluded
    expect(shouldSkipFolder('4_27_jan26')).toBe(true);
    expect(shouldSkipFolder('1_nov25')).toBe(true);
    const now = new Date();
    const mon = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
    const yy = String(now.getFullYear()).slice(-2);
    expect(shouldSkipFolder(`1_${mon}_${yy}`)).toBe(false);
  });
});
