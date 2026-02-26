import { describe, it, beforeAll, beforeEach, afterEach, afterAll, expect } from 'vitest';
import { app } from '../api';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * P147: Kanban API - Integration Tests
 *
 * Tests API endpoints, cache logic, query parameters, and full scanDir() flow
 * to ensure scanner correctly processes feature files and handles edge cases.
 *
 * These tests verify:
 * - GET /api/features returns correct feature list
 * - PATCH /api/features/:id updates feature status
 * - Cache logic (getCachedFeatures, cache clearing)
 * - Query params (?refresh=true, ?worktree=path)
 * - Full scanDir() flow (folder exclusions, file filtering, frontmatter parsing)
 * - completed_at and locked_at transitions
 * - File move logic (done/, archive/, back to features/)
 * - GET /api/milestones
 */

// Shared server — spun up once for all test suites
let server: ReturnType<typeof createServer>;
let API_BASE_URL: string;

beforeAll(async () => {
  server = app.listen(0); // port 0 = OS picks a random free port
  const port = (server.address() as AddressInfo).port;
  API_BASE_URL = `http://localhost:${port}`;
  // Give server one tick to fully initialize
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(() => {
  server.close();
});

// Test fixtures directory (in system temp)
const TEST_FIXTURES_BASE = join(tmpdir(), 'kanban-test-fixtures');
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
        return `${key}: [${value.map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(', ')}]`;
      }
      return `${key}: ${typeof value === 'string' ? `"${value}"` : value}`;
    })
    .join('\n');

  const fileContent = `---\n${yaml}\n---\n\n${content}`;
  await writeFile(filePath, fileContent, 'utf-8');
  return filePath;
}

/**
 * Helper: Make GET request to /api/features
 */
async function fetchFeatures(worktreePath?: string, refresh?: boolean): Promise<{ status: number; data: any }> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);
  if (refresh) params.set('refresh', 'true');

  const url = `${API_BASE_URL}/api/features${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  return { status: response.status, data: await response.json() };
}

/**
 * Helper: Make PATCH request to /api/features/:id
 */
async function patchFeature(
  id: string,
  updates: Record<string, unknown>,
  worktreePath?: string
): Promise<{ status: number; data: any }> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);

  const url = `${API_BASE_URL}/api/features/${id}${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return { status: response.status, data: await response.json() };
}

/**
 * Helper: Make GET request to /api/milestones
 */
async function fetchMilestones(worktreePath?: string): Promise<{ status: number; data: any }> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);

  const url = `${API_BASE_URL}/api/milestones${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  return { status: response.status, data: await response.json() };
}

// ─── Shared per-describe fixture setup ──────────────────────────────────────

function useTestWorktree() {
  beforeEach(async () => {
    TEST_WORKTREE_PATH = join(
      TEST_FIXTURES_BASE,
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    TEST_FEATURES_DIR = join(TEST_WORKTREE_PATH, 'features');
    await mkdir(TEST_FEATURES_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_WORKTREE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/features
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: API Endpoints - GET /api/features', () => {
  useTestWorktree();

  it('returns all features from features/ directory', async () => {
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0, type: 'story' });
    await createTestFeature('p2_test.md', { status: 'week', rank: 2.0, type: 'task' });
    await createTestFeature('p3_test.md', { status: 'done', rank: 3.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(3);

    const ids = data.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_test', 'p2_test', 'p3_test']);

    const p1 = data.find((f: any) => f.id === 'p1_test');
    expect(p1.status).toBe('backlog');
    expect(p1.rank).toBe(1.0);
    expect(p1.type).toBe('story');
    expect(p1.path).toContain('p1_test.md');
  });

  it('excludes features from research/ folder', async () => {
    await createTestFeature('p99_research.md', { status: 'backlog', rank: 99.0 }, '# Research', 'research');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');
  });

  it('excludes features from uat/ folder', async () => {
    await createTestFeature('p99_uat.md', { status: 'backlog', rank: 99.0 }, '# UAT', 'uat');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');
  });

  it('excludes features from dated folders (P137 regression)', async () => {
    await createTestFeature('p99_dated.md', { status: 'backlog', rank: 99.0 }, '# Dated', '4_27_jan26');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');
  });

  it('includes features from done/ folder', async () => {
    await createTestFeature('p1_done.md', { status: 'done', rank: 1.0 }, '# Done', 'done');

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_done');
  });

  it('includes features from archive/ folder', async () => {
    await createTestFeature('p1_archive.md', { status: 'rejected', rank: 1.0 }, '# Archive', 'archive');

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_archive');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/features/:id
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: API Endpoints - PATCH /api/features/:id', () => {
  useTestWorktree();

  it('updates feature status in filesystem', async () => {
    const filePath = await createTestFeature('p147_test.md', {
      status: 'backlog',
      rank: 147.0,
      type: 'task',
      tags: ['testing'],
    });

    const { status, data } = await patchFeature('p147_test', { status: 'week' }, TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    const updatedContent = await readFile(filePath, 'utf-8');
    expect(updatedContent).toContain('status: week');
    expect(updatedContent).toContain('rank: 147');
    expect(updatedContent).toContain('type: task');
    expect(updatedContent).toContain('- testing');
  });

  it('validates status enum values', async () => {
    const filePath = await createTestFeature('p147_test.md', { status: 'backlog', rank: 147.0 });
    const originalContent = await readFile(filePath, 'utf-8');

    const { status, data } = await patchFeature(
      'p147_test',
      { status: 'invalid_status' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(400);
    expect(data.error).toContain('Invalid status');

    const unchangedContent = await readFile(filePath, 'utf-8');
    expect(unchangedContent).toBe(originalContent);
  });

  it('returns 404 for non-existent feature', async () => {
    const { status, data } = await patchFeature(
      'p999_nonexistent',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(404);
    expect(data.error).toContain('Feature not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache Logic
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: Cache Logic', () => {
  useTestWorktree();

  it('getCachedFeatures returns cached data on subsequent calls', async () => {
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });

    const { status: status1, data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    expect(status1).toBe(200);
    const p1 = data1.find((f: any) => f.id === 'p1_test');
    expect(p1).toBeDefined();

    const { status: status2, data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH);
    expect(status2).toBe(200);
    const p1_cached = data2.find((f: any) => f.id === 'p1_test');
    expect(p1_cached).toBeDefined();
    expect(p1_cached.id).toBe(p1.id);
    expect(p1_cached.status).toBe(p1.status);
    expect(p1_cached.rank).toBe(p1.rank);
  });

  it('cache clears on refresh=true (P146 regression protection)', async () => {
    await createTestFeature('p1_initial.md', { status: 'backlog', rank: 1.0 });

    const { status: status1, data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    expect(status1).toBe(200);
    const initialFeatures = data1.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(initialFeatures.length).toBe(1);
    expect(initialFeatures[0].id).toBe('p1_initial');

    // Add new feature file to disk
    await createTestFeature('p2_new.md', { status: 'week', rank: 2.0 });

    // Without refresh — cache hit, new file not visible
    const { status: status2, data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH, false);
    expect(status2).toBe(200);
    const cachedFeatures = data2.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(cachedFeatures.length).toBe(1);

    // With refresh — cache cleared, new file visible
    const { status: status3, data: data3 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    expect(status3).toBe(200);
    const refreshedFeatures = data3.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(refreshedFeatures.length).toBe(2);
    const ids = refreshedFeatures.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_initial', 'p2_new']);
  });

  it('cache reflects updated status after PATCH', async () => {
    await createTestFeature('p999_cache_update_test.md', { status: 'backlog', rank: 999.0 });

    const { data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    const p999Before = data1.find((f: any) => f.id === 'p999_cache_update_test');
    expect(p999Before).toBeDefined();
    expect(p999Before.status).toBe('backlog');

    const { status: patchStatus } = await patchFeature(
      'p999_cache_update_test',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );
    expect(patchStatus).toBe(200);

    const { data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH);
    const p999After = data2.find((f: any) => f.id === 'p999_cache_update_test');
    expect(p999After).toBeDefined();
    expect(p999After.status).toBe('week');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query Parameters
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: Query Parameters', () => {
  useTestWorktree();

  it('filters features by worktree path', async () => {
    await createTestFeature('p1_worktree1.md', { status: 'backlog', rank: 1.0 });
    await createTestFeature('p2_worktree1.md', { status: 'week', rank: 2.0 });

    const worktree2Path = join(
      TEST_FIXTURES_BASE,
      `test-wt2-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const worktree2FeaturesDir = join(worktree2Path, 'features');
    await mkdir(worktree2FeaturesDir, { recursive: true });
    await writeFile(
      join(worktree2FeaturesDir, 'p3_worktree2.md'),
      '---\nstatus: "backlog"\nrank: 3.0\n---\n\n# Worktree 2',
      'utf-8'
    );

    try {
      const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

      expect(status).toBe(200);
      expect(data.length).toBe(2);
      const ids = data.map((f: any) => f.id).sort();
      expect(ids).toEqual(['p1_worktree1', 'p2_worktree1']);
      expect(data.find((f: any) => f.id === 'p3_worktree2')).toBeUndefined();
    } finally {
      await rm(worktree2Path, { recursive: true, force: true });
    }
  });

  it('handles invalid worktree path gracefully', async () => {
    const nonexistentPath = '/nonexistent/path/to/worktree';

    const { status, data } = await fetchFeatures(nonexistentPath, true);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full scanDir() Integration
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: Full scanDir() Integration', () => {
  useTestWorktree();

  it('correctly processes complex directory structure', async () => {
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });
    await createTestFeature('p2_done.md', { status: 'done', rank: 2.0 }, '# Done', 'done');
    await createTestFeature('p3_research.md', { status: 'backlog', rank: 3.0 }, '# Research', 'research');
    await createTestFeature('p4_uat.md', { status: 'backlog', rank: 4.0 }, '# UAT', 'uat');
    await createTestFeature('p5_dated.md', { status: 'backlog', rank: 5.0 }, '# Dated', '4_27_jan26');

    const readmePath = join(TEST_FEATURES_DIR, 'README.md');
    await writeFile(readmePath, '---\nstatus: "backlog"\nrank: 99.0\n---\n\n# README', 'utf-8');

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(2);
    const ids = data.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_test', 'p2_done']);

    expect(data.find((f: any) => f.id === 'p3_research')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'p4_uat')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'p5_dated')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'README')).toBeUndefined();
  });

  it('handles files with missing frontmatter', async () => {
    const noFrontmatterPath = join(TEST_FEATURES_DIR, 'p99_no_frontmatter.md');
    await writeFile(noFrontmatterPath, '# No Frontmatter\n\nThis file has no frontmatter.', 'utf-8');
    await createTestFeature('p1_valid.md', { status: 'backlog', rank: 1.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const noFrontmatter = data.find((f: any) => f.id === 'p99_no_frontmatter');
    expect(noFrontmatter).toBeDefined();
    expect(noFrontmatter.status).toBe('backlog');
    expect(noFrontmatter.rank).toBe(1000000);
    expect(noFrontmatter.title).toBe('No Frontmatter');

    const p1 = data.find((f: any) => f.id === 'p1_valid');
    expect(p1).toBeDefined();
  });

  it('handles files with invalid frontmatter', async () => {
    const invalidYamlPath = join(TEST_FEATURES_DIR, 'p99_invalid.md');
    await writeFile(
      invalidYamlPath,
      '---\nstatus: backlog\nrank: "not a number"\n---\n\n# Invalid YAML',
      'utf-8'
    );
    await createTestFeature('p1_valid.md', { status: 'backlog', rank: 1.0 });

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const invalidFeature = data.find((f: any) => f.id === 'p99_invalid');
    expect(invalidFeature).toBeDefined();
    expect(invalidFeature.rank).toBe(1000000);
    expect(invalidFeature.status).toBe('backlog');

    const p1 = data.find((f: any) => f.id === 'p1_valid');
    expect(p1).toBeDefined();
    expect(p1.rank).toBe(1.0);
  });

  it('parses all frontmatter fields correctly', async () => {
    await createTestFeature(
      'p1_full.md',
      {
        status: 'in-progress',
        rank: 147.5,
        type: 'story',
        size: 'm',
        tags: ['testing', 'integration'],
        workstream: 'foundation',
        hypothesis: 'H1',
        created: '2026-02-01',
        completed_at: '2026-02-16',
        prepped_date: '2026-02-15',
        blocked_by: ['p2', 'p3'],
      },
      '# Full Feature'
    );

    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    const feature = data[0];

    expect(feature.id).toBe('p1_full');
    expect(feature.status).toBe('in-progress');
    expect(feature.rank).toBe(147.5);
    expect(feature.type).toBe('story');
    expect(feature.size).toBe('m');
    expect(feature.workstream).toBe('foundation');
    expect(feature.hypothesis).toBe('H1');
    expect(feature.created).toBe('2026-02-01');
    expect(feature.completed_at).toBe('2026-02-16');
    expect(feature.prepped).toBe(true);
    expect(typeof feature.rank).toBe('number');
    expect(Array.isArray(feature.tags)).toBe(true);
    expect(feature.tags).toEqual(['testing', 'integration']);
    expect(Array.isArray(feature.blocked_by)).toBe(true);
    expect(feature.blocked_by).toEqual(['p2', 'p3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: Error Handling', () => {
  useTestWorktree();

  it('handles filesystem errors gracefully', async () => {
    const nonexistentPath = '/nonexistent/directory/that/does/not/exist';

    const { status, data } = await fetchFeatures(nonexistentPath, true);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('handles concurrent requests correctly', async () => {
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });
    await createTestFeature('p2_test.md', { status: 'week', rank: 2.0 });
    await createTestFeature('p3_test.md', { status: 'done', rank: 3.0 });

    const requests = Array.from({ length: 10 }, () =>
      fetchFeatures(TEST_WORKTREE_PATH, true)
    );

    const results = await Promise.all(requests);

    results.forEach(({ status, data }) => {
      expect(status).toBe(200);
      expect(data.length).toBe(3);
    });

    const firstResult = results[0].data;
    results.forEach(({ data }) => {
      const ids1 = data.map((f: any) => f.id).sort();
      const ids2 = firstResult.map((f: any) => f.id).sort();
      expect(ids1).toEqual(ids2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P147: Status Transitions - completed_at and locked_at
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: Status Transitions - completed_at and locked_at', () => {
  useTestWorktree();

  it('moving a feature to done sets completed_at to today', async () => {
    const today = new Date().toISOString().split('T')[0];
    await createTestFeature('p200_transition.md', { status: 'backlog', rank: 200.0 });

    // Seed cache
    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status, data } = await patchFeature(
      'p200_transition',
      { status: 'done' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify file on disk has completed_at set to today.
    // gray-matter serializes date strings with quotes: completed_at: '2026-02-26'
    const featurePath = join(TEST_FEATURES_DIR, 'done', 'p200_transition.md');
    const fileContent = await readFile(featurePath, 'utf-8');
    expect(fileContent).toContain(today); // date value is present (quoted or unquoted)
  });

  it('moving a feature from done to week clears completed_at', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Create a feature already in done/ with completed_at
    const donePath = join(TEST_FEATURES_DIR, 'done');
    await mkdir(donePath, { recursive: true });
    await writeFile(
      join(donePath, 'p201_was_done.md'),
      `---\nstatus: done\nrank: 201.0\ncompleted_at: ${today}\n---\n\n# Was Done`,
      'utf-8'
    );

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status, data } = await patchFeature(
      'p201_was_done',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify file moved back to features/ and completed_at is removed
    const newPath = join(TEST_FEATURES_DIR, 'p201_was_done.md');
    const fileContent = await readFile(newPath, 'utf-8');
    expect(fileContent).not.toContain('completed_at:');
  });

  it('any PATCH with status sets locked_at as ISO timestamp', async () => {
    await createTestFeature('p202_lock.md', { status: 'backlog', rank: 202.0 });

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const before = new Date();
    const { status } = await patchFeature(
      'p202_lock',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );
    const after = new Date();

    expect(status).toBe(200);

    const fileContent = await readFile(join(TEST_FEATURES_DIR, 'p202_lock.md'), 'utf-8');
    // Extract locked_at from file
    const match = fileContent.match(/locked_at:\s*'?([^'\n]+)'?/);
    expect(match).not.toBeNull();
    const lockedAt = new Date(match![1].trim());
    expect(lockedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(lockedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('PATCH without status does not set locked_at', async () => {
    await createTestFeature('p203_nolock.md', { status: 'backlog', rank: 203.0 });

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status } = await patchFeature(
      'p203_nolock',
      { rank: 999.0 },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);

    const filePath = join(TEST_FEATURES_DIR, 'p203_nolock.md');
    const fileContent = await readFile(filePath, 'utf-8');
    expect(fileContent).not.toContain('locked_at:');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P147: File Move Logic
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: File Move Logic', () => {
  useTestWorktree();

  it('PATCH status=done moves file from features/ to features/done/', async () => {
    const originalPath = await createTestFeature('p210_move_done.md', {
      status: 'backlog',
      rank: 210.0,
    });

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status } = await patchFeature(
      'p210_move_done',
      { status: 'done' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);

    // Old path no longer exists
    expect(existsSync(originalPath)).toBe(false);

    // New path exists in done/
    const newPath = join(TEST_FEATURES_DIR, 'done', 'p210_move_done.md');
    expect(existsSync(newPath)).toBe(true);

    const fileContent = await readFile(newPath, 'utf-8');
    expect(fileContent).toContain('status: done');
  });

  it('PATCH status=rejected moves file from features/ to features/archive/', async () => {
    const originalPath = await createTestFeature('p211_move_archive.md', {
      status: 'backlog',
      rank: 211.0,
    });

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status } = await patchFeature(
      'p211_move_archive',
      { status: 'rejected' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);

    expect(existsSync(originalPath)).toBe(false);

    const newPath = join(TEST_FEATURES_DIR, 'archive', 'p211_move_archive.md');
    expect(existsSync(newPath)).toBe(true);

    const fileContent = await readFile(newPath, 'utf-8');
    expect(fileContent).toContain('status: rejected');
  });

  it('PATCH status=week on a file in features/done/ moves it back to features/', async () => {
    const donePath = join(TEST_FEATURES_DIR, 'done');
    await mkdir(donePath, { recursive: true });
    const doneFilePath = join(donePath, 'p212_back_from_done.md');
    await writeFile(
      doneFilePath,
      '---\nstatus: done\nrank: 212.0\n---\n\n# Back from done',
      'utf-8'
    );

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status } = await patchFeature(
      'p212_back_from_done',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);

    expect(existsSync(doneFilePath)).toBe(false);

    const newPath = join(TEST_FEATURES_DIR, 'p212_back_from_done.md');
    expect(existsSync(newPath)).toBe(true);

    const fileContent = await readFile(newPath, 'utf-8');
    expect(fileContent).toContain('status: week');
  });

  it('PATCH status=week on a file in features/archive/ moves it back to features/', async () => {
    const archivePath = join(TEST_FEATURES_DIR, 'archive');
    await mkdir(archivePath, { recursive: true });
    const archiveFilePath = join(archivePath, 'p213_back_from_archive.md');
    await writeFile(
      archiveFilePath,
      '---\nstatus: rejected\nrank: 213.0\n---\n\n# Back from archive',
      'utf-8'
    );

    await fetchFeatures(TEST_WORKTREE_PATH, true);

    const { status } = await patchFeature(
      'p213_back_from_archive',
      { status: 'week' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(200);

    expect(existsSync(archiveFilePath)).toBe(false);

    const newPath = join(TEST_FEATURES_DIR, 'p213_back_from_archive.md');
    expect(existsSync(newPath)).toBe(true);

    const fileContent = await readFile(newPath, 'utf-8');
    expect(fileContent).toContain('status: week');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P147: GET /api/milestones
// ─────────────────────────────────────────────────────────────────────────────

describe('P147: GET /api/milestones', () => {
  useTestWorktree();

  async function createMilestone(
    filename: string,
    frontmatter: Record<string, unknown>,
    content: string
  ): Promise<string> {
    const milestonesDir = join(TEST_WORKTREE_PATH, 'docs', 'milestones');
    await mkdir(milestonesDir, { recursive: true });
    const filePath = join(milestonesDir, filename);
    const yaml = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
      .join('\n');
    await writeFile(filePath, `---\n${yaml}\n---\n\n${content}`, 'utf-8');
    return filePath;
  }

  it('returns empty array when milestones dir does not exist', async () => {
    // TEST_WORKTREE_PATH has no docs/milestones/ directory
    const { status, data } = await fetchMilestones(TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('returns parsed milestone with correct fields', async () => {
    await createMilestone(
      'm1-test.md',
      { status: 'active', summary: 'First milestone for testing' },
      '# M1: Test Milestone'
    );

    const { status, data } = await fetchMilestones(TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    expect(data.length).toBe(1);

    const m = data[0];
    expect(m.id).toBe('M1');
    expect(m.title).toBe('M1: Test Milestone');
    expect(m.status).toBe('active');
    expect(m.summary).toBe('First milestone for testing');
    expect(m.filename).toBe('m1-test.md');
  });

  it('maps status running to active', async () => {
    await createMilestone(
      'm2-running.md',
      { status: 'running' },
      '# M2: Running Milestone'
    );

    const { status, data } = await fetchMilestones(TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    const m = data.find((x: any) => x.id === 'M2');
    expect(m).toBeDefined();
    expect(m.status).toBe('active');
  });

  it('extracts milestone ID from title pattern', async () => {
    await createMilestone(
      'c1-conversion.md',
      { status: 'next' },
      '# C1: Conversion Milestone'
    );

    const { status, data } = await fetchMilestones(TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    const m = data.find((x: any) => x.id === 'C1');
    expect(m).toBeDefined();
    expect(m.title).toBe('C1: Conversion Milestone');
  });

  it('milestones are sorted alphanumerically by ID', async () => {
    await createMilestone('m3-third.md', { status: 'future' }, '# M3: Third');
    await createMilestone('m1-first.md', { status: 'active' }, '# M1: First');
    await createMilestone('m2-second.md', { status: 'next' }, '# M2: Second');

    const { status, data } = await fetchMilestones(TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    expect(data.length).toBe(3);
    const ids = data.map((m: any) => m.id);
    expect(ids).toEqual(['M1', 'M2', 'M3']);
  });
});
