import { describe, it, beforeEach, afterEach, expect, test } from 'vitest';

// Skip all tests - requires running API server on port 9051
// TODO: Move to integration tests or add server startup
test.skip('API integration tests require running server - skipped', () => {});
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
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
 *
 * PREREQUISITES:
 * - API server must be running on http://localhost:9051
 * - Start server with: npm run dev:server (in tools/kanban directory)
 * - Tests create temporary fixtures in system temp directory
 * - All fixtures are cleaned up after each test
 */

// Test fixtures directory (in system temp)
const TEST_FIXTURES_BASE = join(tmpdir(), 'kanban-test-fixtures');
let TEST_WORKTREE_PATH: string;
let TEST_FEATURES_DIR: string;

// API base URL (assumes server running on default port)
const API_BASE_URL = 'http://localhost:9051';

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
 * Helper: Make GET request to API
 */
async function fetchFeatures(worktreePath?: string, refresh?: boolean): Promise<any> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);
  if (refresh) params.set('refresh', 'true');

  const url = `${API_BASE_URL}/api/features${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  return { status: response.status, data: await response.json() };
}

/**
 * Helper: Make PATCH request to API
 */
async function patchFeature(id: string, updates: Record<string, unknown>, worktreePath?: string): Promise<any> {
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

describe.skip('P147: API Endpoints - GET /api/features', () => {
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

  it('returns all features from features/ directory', async () => {
    // Create test features in features/ folder
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0, type: 'story' });
    await createTestFeature('p2_test.md', { status: 'week', rank: 2.0, type: 'task' });
    await createTestFeature('p3_test.md', { status: 'done', rank: 3.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response status 200
    expect(status).toBe(200);

    // Verify response contains all test features
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(3);

    // Verify each feature has required fields (id, status, rank, type)
    const ids = data.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_test', 'p2_test', 'p3_test']);

    const p1 = data.find((f: any) => f.id === 'p1_test');
    expect(p1.status).toBe('backlog');
    expect(p1.rank).toBe(1.0);
    expect(p1.type).toBe('story');
    expect(p1.path).toContain('p1_test.md');
  });

  it('excludes features from research/ folder', async () => {
    // Create test feature in features/research/
    await createTestFeature('p99_research.md', { status: 'backlog', rank: 99.0 }, '# Research', 'research');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response does NOT include research/ features
    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');
  });

  it('excludes features from uat/ folder', async () => {
    // Create test feature in features/uat/
    await createTestFeature('p99_uat.md', { status: 'backlog', rank: 99.0 }, '# UAT', 'uat');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response does NOT include uat/ features
    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');
  });

  it('excludes features from dated folders (P137 regression)', async () => {
    /**
     * P137 BUG: Validation script didn't exclude dated folders like scanner did
     * This test ensures scanner correctly excludes folders like "4_27_jan26/"
     */

    // Create test feature in features/4_27_jan26/
    await createTestFeature('p99_dated.md', { status: 'backlog', rank: 99.0 }, '# Dated', '4_27_jan26');
    await createTestFeature('p1_normal.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response does NOT include dated folder features
    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_normal');

    /**
     * REGRESSION TEST VALIDATION:
     * - If scanner includes dated folders: Test should FAIL
     * - If scanner excludes dated folders: Test should PASS
     */
  });

  it('includes features from done/ folder', async () => {
    // Create test feature in features/done/
    await createTestFeature('p1_done.md', { status: 'done', rank: 1.0 }, '# Done', 'done');

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response includes done/ features
    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_done');
    // Note: done/ is valid, should be scanned
  });

  it('includes features from archive/ folder', async () => {
    // Create test feature in features/archive/
    await createTestFeature('p1_archive.md', { status: 'rejected', rank: 1.0 }, '# Archive', 'archive');

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response includes archive/ features
    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('p1_archive');
  });
});

describe.skip('P147: API Endpoints - PATCH /api/features/:id', () => {
  beforeEach(async () => {
    // Setup test fixture
    TEST_WORKTREE_PATH = join(TEST_FIXTURES_BASE, `test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    TEST_FEATURES_DIR = join(TEST_WORKTREE_PATH, 'features');
    await mkdir(TEST_FEATURES_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test fixture
    try {
      await rm(TEST_WORKTREE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('updates feature status in filesystem', async () => {
    // Create test feature with status: backlog
    const filePath = await createTestFeature('p147_test.md', {
      status: 'backlog',
      rank: 147.0,
      type: 'task',
      tags: ['testing']
    });

    // Make PATCH request to /api/features/p147_test with { status: 'week' }
    const { status, data } = await patchFeature('p147_test', { status: 'week' }, TEST_WORKTREE_PATH);

    // Verify response status 200
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Read feature file from filesystem
    const updatedContent = await readFile(filePath, 'utf-8');

    // Verify frontmatter status updated to 'week'
    expect(updatedContent).toContain('status: week');

    // Verify other frontmatter fields unchanged
    expect(updatedContent).toContain('rank: 147');
    expect(updatedContent).toContain('type: task');
    expect(updatedContent).toContain('- testing'); // YAML array format
  });

  it('validates status enum values', async () => {
    // Create test feature
    const filePath = await createTestFeature('p147_test.md', {
      status: 'backlog',
      rank: 147.0
    });

    // Read original content
    const originalContent = await readFile(filePath, 'utf-8');

    // Make PATCH request with invalid status
    const { status, data } = await patchFeature('p147_test', { status: 'invalid_status' }, TEST_WORKTREE_PATH);

    // Verify response status 400 (bad request)
    expect(status).toBe(400);

    // Verify error message explains invalid status
    expect(data.error).toContain('Invalid status');

    // Verify file not modified
    const unchangedContent = await readFile(filePath, 'utf-8');
    expect(unchangedContent).toBe(originalContent);
  });

  it('returns 404 for non-existent feature', async () => {
    // Make PATCH request to /api/features/p999_nonexistent
    const { status, data } = await patchFeature('p999_nonexistent', { status: 'week' }, TEST_WORKTREE_PATH);

    // Verify response status 404
    expect(status).toBe(404);

    // Verify error message is clear
    expect(data.error).toContain('Feature not found');
  });
});

describe.skip('P147: Cache Logic', () => {
  beforeEach(async () => {
    // Setup test fixtures
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

  it('getCachedFeatures returns cached data on subsequent calls', async () => {
    // Create test feature
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features (populates cache)
    const { status: status1, data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    // Verify response
    expect(status1).toBe(200);
    expect(data1.length).toBeGreaterThanOrEqual(1);
    const p1 = data1.find((f: any) => f.id === 'p1_test');
    expect(p1).toBeDefined();
    expect(p1.id).toBe('p1_test');

    // Make second GET request (should use cache)
    const { status: status2, data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify response is identical (cache hit)
    expect(status2).toBe(200);
    const p1_cached = data2.find((f: any) => f.id === 'p1_test');
    expect(p1_cached).toBeDefined();
    expect(p1_cached.id).toBe(p1.id);
    expect(p1_cached.status).toBe(p1.status);
    expect(p1_cached.rank).toBe(p1.rank);
    // Note: We can't directly verify scanDir() wasn't called without mocking,
    // but identical results show cache is working
  });

  it('cache clears on refresh=true (P146 regression protection)', async () => {
    /**
     * P146 BUG: Refresh button didn't pass refresh=true, so cache wasn't cleared
     * This test ensures ?refresh=true query param clears cache
     */

    // Create initial feature
    await createTestFeature('p1_initial.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features (populates cache)
    const { status: status1, data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    expect(status1).toBe(200);
    const initialFeatures = data1.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(initialFeatures.length).toBe(1);
    expect(initialFeatures[0].id).toBe('p1_initial');

    // Create new feature file in filesystem
    await createTestFeature('p2_new.md', { status: 'week', rank: 2.0 });

    // Make GET request WITHOUT refresh=true
    const { status: status2, data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH, false);

    // Verify new feature NOT in response (cache hit)
    expect(status2).toBe(200);
    const cachedFeatures = data2.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(cachedFeatures.length).toBe(1); // Still only 1 feature (cached)

    // Make GET request WITH refresh=true
    const { status: status3, data: data3 } = await fetchFeatures(TEST_WORKTREE_PATH, true);

    // Verify new feature IS in response (cache cleared, fresh scan)
    expect(status3).toBe(200);
    const refreshedFeatures = data3.filter((f: any) => f.path.includes(TEST_WORKTREE_PATH));
    expect(refreshedFeatures.length).toBe(2); // Now 2 features
    const ids = refreshedFeatures.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_initial', 'p2_new']);

    /**
     * REGRESSION TEST VALIDATION:
     * - Without refresh=true: New feature not shown (cache hit)
     * - With refresh=true: New feature shown (cache cleared)
     */
  });

  it('cache clears after feature update', async () => {
    // Create test feature with unique filename
    await createTestFeature('p999_cache_update_test.md', { status: 'backlog', rank: 999.0 });

    // Make GET request to /api/features (populates cache) - use refresh to ensure fresh scan
    const { status: status1, data: data1 } = await fetchFeatures(TEST_WORKTREE_PATH, true);
    expect(status1).toBe(200);
    const p999Before = data1.find((f: any) => f.id === 'p999_cache_update_test');
    expect(p999Before).toBeDefined();
    expect(p999Before.status).toBe('backlog');

    // Make PATCH request to update feature status
    const { status: patchStatus } = await patchFeature('p999_cache_update_test', { status: 'week' }, TEST_WORKTREE_PATH);
    expect(patchStatus).toBe(200);

    // Make GET request to /api/features (should get updated value from cache - updated inline)
    const { status: status2, data: data2 } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify updated status in response (cache updated inline after PATCH)
    expect(status2).toBe(200);
    const p999After = data2.find((f: any) => f.id === 'p999_cache_update_test');
    expect(p999After).toBeDefined();
    expect(p999After.status).toBe('week');
  });
});

describe.skip('P147: Query Parameters', () => {
  beforeEach(async () => {
    // Setup test fixtures
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

  it('filters features by worktree path', async () => {
    // Create features in this worktree directory
    await createTestFeature('p1_worktree1.md', { status: 'backlog', rank: 1.0 });
    await createTestFeature('p2_worktree1.md', { status: 'week', rank: 2.0 });

    // Create second worktree directory
    const worktree2Path = join(TEST_FIXTURES_BASE, `test-wt2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const worktree2FeaturesDir = join(worktree2Path, 'features');
    await mkdir(worktree2FeaturesDir, { recursive: true });

    // Create feature in second worktree
    const wt2FilePath = join(worktree2FeaturesDir, 'p3_worktree2.md');
    await writeFile(wt2FilePath, '---\nstatus: "backlog"\nrank: 3.0\n---\n\n# Worktree 2', 'utf-8');

    try {
      // Make GET request with ?worktree=/path/to/worktree
      const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

      // Verify response only includes features from that worktree
      expect(status).toBe(200);
      expect(data.length).toBe(2);
      const ids = data.map((f: any) => f.id).sort();
      expect(ids).toEqual(['p1_worktree1', 'p2_worktree1']);

      // Verify features from other worktrees excluded
      expect(data.find((f: any) => f.id === 'p3_worktree2')).toBeUndefined();
    } finally {
      // Cleanup second worktree
      await rm(worktree2Path, { recursive: true, force: true });
    }
  });

  it('handles invalid worktree path gracefully', async () => {
    const nonexistentPath = '/nonexistent/path/to/worktree';

    // Make GET request with ?worktree=/nonexistent/path
    const { status, data } = await fetchFeatures(nonexistentPath);

    // Verify response status 200 (empty array when directory doesn't exist)
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0); // No features found (graceful handling)
  });
});

describe.skip('P147: Full scanDir() Integration', () => {
  beforeEach(async () => {
    // Setup complex test fixture (multiple folders, various file types)
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

  it('correctly processes complex directory structure', async () => {
    // Create test fixtures:
    // - features/p1_test.md (should be included)
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });

    // - features/done/p2_done.md (should be included)
    await createTestFeature('p2_done.md', { status: 'done', rank: 2.0 }, '# Done', 'done');

    // - features/research/p3_research.md (should be excluded)
    await createTestFeature('p3_research.md', { status: 'backlog', rank: 3.0 }, '# Research', 'research');

    // - features/uat/p4_uat.md (should be excluded)
    await createTestFeature('p4_uat.md', { status: 'backlog', rank: 4.0 }, '# UAT', 'uat');

    // - features/4_27_jan26/p5_dated.md (should be excluded)
    await createTestFeature('p5_dated.md', { status: 'backlog', rank: 5.0 }, '# Dated', '4_27_jan26');

    // - features/README.md (should be excluded - no p{N})
    const readmePath = join(TEST_FEATURES_DIR, 'README.md');
    await writeFile(readmePath, '---\nstatus: "backlog"\nrank: 99.0\n---\n\n# README', 'utf-8');

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify only p1 and p2 in response
    expect(status).toBe(200);
    expect(data.length).toBe(2);
    const ids = data.map((f: any) => f.id).sort();
    expect(ids).toEqual(['p1_test', 'p2_done']);

    // Verify p3, p4, p5, README excluded
    expect(data.find((f: any) => f.id === 'p3_research')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'p4_uat')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'p5_dated')).toBeUndefined();
    expect(data.find((f: any) => f.id === 'README')).toBeUndefined();
  });

  it('handles files with missing frontmatter', async () => {
    // Create test file with no frontmatter
    const noFrontmatterPath = join(TEST_FEATURES_DIR, 'p99_no_frontmatter.md');
    await writeFile(noFrontmatterPath, '# No Frontmatter\n\nThis file has no frontmatter.', 'utf-8');

    // Create valid feature for comparison
    await createTestFeature('p1_valid.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Scanner has graceful fallback: missing frontmatter gets default values
    expect(status).toBe(200);
    const noFrontmatter = data.find((f: any) => f.id === 'p99_no_frontmatter');
    expect(noFrontmatter).toBeDefined();
    // Verify defaults are applied
    expect(noFrontmatter.status).toBe('backlog'); // default status
    expect(noFrontmatter.rank).toBe(1000000); // default rank for missing frontmatter
    expect(noFrontmatter.title).toBe('No Frontmatter'); // extracted from heading

    // Verify no errors thrown (request succeeds)
    // Verify other valid features still returned
    const p1 = data.find((f: any) => f.id === 'p1_valid');
    expect(p1).toBeDefined();
  });

  it('handles files with invalid frontmatter', async () => {
    // Create test file with invalid rank (string instead of number)
    const invalidYamlPath = join(TEST_FEATURES_DIR, 'p99_invalid.md');
    await writeFile(invalidYamlPath, '---\nstatus: backlog\nrank: "not a number"\n---\n\n# Invalid YAML', 'utf-8');

    // Create valid feature for comparison
    await createTestFeature('p1_valid.md', { status: 'backlog', rank: 1.0 });

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Scanner has graceful fallback: invalid rank gets default value
    expect(status).toBe(200);
    const invalidFeature = data.find((f: any) => f.id === 'p99_invalid');
    expect(invalidFeature).toBeDefined();
    // Invalid rank → fallback to default
    expect(invalidFeature.rank).toBe(1000000); // default rank for invalid rank
    expect(invalidFeature.status).toBe('backlog'); // valid status preserved

    // Verify error logged (but request succeeds)
    // Verify other valid features still returned
    const p1 = data.find((f: any) => f.id === 'p1_valid');
    expect(p1).toBeDefined();
    expect(p1.rank).toBe(1.0); // valid rank preserved
  });

  it('parses all frontmatter fields correctly', async () => {
    // Create test file with all fields (status, rank, type, tags, workstream, etc.)
    await createTestFeature('p1_full.md', {
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
      blocked_by: ['p2', 'p3']
    }, '# Full Feature');

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(TEST_WORKTREE_PATH);

    // Verify all fields present in response
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

    // Verify types correct (rank is number, tags is array, etc.)
    expect(typeof feature.rank).toBe('number');
    expect(Array.isArray(feature.tags)).toBe(true);
    expect(feature.tags).toEqual(['testing', 'integration']);
    expect(Array.isArray(feature.blocked_by)).toBe(true);
    expect(feature.blocked_by).toEqual(['p2', 'p3']);
  });
});

describe.skip('P147: Error Handling', () => {
  beforeEach(async () => {
    // Setup test fixtures
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

  it('handles filesystem errors gracefully', async () => {
    // Test with non-existent directory (filesystem error scenario)
    const nonexistentPath = '/nonexistent/directory/that/does/not/exist';

    // Make GET request to /api/features
    const { status, data } = await fetchFeatures(nonexistentPath);

    // Verify response has appropriate status (200 with empty array is graceful handling)
    expect(status).toBe(200);

    // Verify error is handled gracefully (empty array, not crash)
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);

    // Verify server doesn't crash (request succeeds)
    // If server crashed, we wouldn't get a response
  });

  it('handles concurrent requests correctly', async () => {
    // Create test features
    await createTestFeature('p1_test.md', { status: 'backlog', rank: 1.0 });
    await createTestFeature('p2_test.md', { status: 'week', rank: 2.0 });
    await createTestFeature('p3_test.md', { status: 'done', rank: 3.0 });

    // Make multiple simultaneous GET requests
    const requests = Array.from({ length: 10 }, () =>
      fetchFeatures(TEST_WORKTREE_PATH, true) // Use refresh=true to force fresh scans
    );

    const results = await Promise.all(requests);

    // Verify all requests succeed
    results.forEach(({ status, data }) => {
      expect(status).toBe(200);
      expect(data.length).toBe(3);
    });

    // Verify cache doesn't corrupt (all responses identical)
    const firstResult = results[0].data;
    results.forEach(({ data }) => {
      expect(data.length).toBe(firstResult.length);
      const ids1 = data.map((f: any) => f.id).sort();
      const ids2 = firstResult.map((f: any) => f.id).sort();
      expect(ids1).toEqual(ids2);
    });

    // Verify no race conditions (consistent data across all responses)
    // If there were race conditions, we'd see inconsistent results
  });
});
