import { describe, it, beforeAll, beforeEach, afterEach, afterAll, expect } from 'vitest';
import { app } from '../api';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * P962: Pipeline (CRM) Board — Integration Tests
 *
 * Tests the opportunities scanner and GET/PATCH /api/opportunities endpoints.
 * Mirrors the api.test.ts pattern: shared server on a random port, temp-dir
 * fixtures written to <tempWorktree>/.private/crm/opportunities/, requests
 * include ?worktree= to point the scanner at the temp dir.
 *
 * These tests will FAIL until /dev implements:
 *   - getOpportunitiesDir(worktreePath?)
 *   - parseOpportunityFile(filePath)
 *   - getOpportunities(worktreePath?) / getCachedOpportunities(worktreePath?)
 *   - opportunitiesCacheByWorktree Map
 *   - GET /api/opportunities
 *   - PATCH /api/opportunities/:id
 *
 * That is intentional — this is the TDD contract /dev must satisfy.
 */

// ─── Shared server ────────────────────────────────────────────────────────────

let server: ReturnType<typeof createServer>;
let API_BASE_URL: string;

beforeAll(async () => {
  server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  API_BASE_URL = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(() => {
  server.close();
});

// ─── Temp fixture infrastructure ─────────────────────────────────────────────

const TEST_FIXTURES_BASE = join(tmpdir(), 'kanban-opp-test-fixtures');
let TEST_WORKTREE_PATH: string;
let TEST_OPPORTUNITIES_DIR: string;

/**
 * Write a single opportunity fixture file into
 * <tempWorktree>/.private/crm/opportunities/<filename>.
 *
 * frontmatter values are serialised naively — strings quoted, others raw.
 * Returns the absolute path of the created file.
 */
async function createTestOpportunity(
  filename: string,
  frontmatter: Record<string, unknown>,
  body = '# Test Opportunity'
): Promise<string> {
  await mkdir(TEST_OPPORTUNITIES_DIR, { recursive: true });

  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
    .join('\n');

  const filePath = join(TEST_OPPORTUNITIES_DIR, filename);
  await writeFile(filePath, `---\n${yaml}\n---\n\n${body}`, 'utf-8');
  return filePath;
}

function useTestWorktree() {
  beforeEach(async () => {
    TEST_WORKTREE_PATH = join(
      TEST_FIXTURES_BASE,
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    TEST_OPPORTUNITIES_DIR = join(TEST_WORKTREE_PATH, '.private', 'crm', 'opportunities');
    await mkdir(TEST_OPPORTUNITIES_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(TEST_WORKTREE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchOpportunities(
  worktreePath?: string,
  refresh?: boolean
): Promise<{ status: number; data: any }> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);
  if (refresh) params.set('refresh', 'true');
  const url = `${API_BASE_URL}/api/opportunities${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url);
  return { status: response.status, data: await response.json() };
}

async function patchOpportunity(
  id: string,
  updates: Record<string, unknown>,
  worktreePath?: string
): Promise<{ status: number; data: any }> {
  const params = new URLSearchParams();
  if (worktreePath) params.set('worktree', worktreePath);
  const url = `${API_BASE_URL}/api/opportunities/${id}${params.toString() ? '?' + params.toString() : ''}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return { status: response.status, data: await response.json() };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/opportunities — basic scanning
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: GET /api/opportunities — basic scanning', () => {
  useTestWorktree();

  it('returns all opportunities parsed from the scan dir', async () => {
    await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
      next_step: 'Send proposal',
      next_date: '2026-06-30',
      contact_ref: 'pp/crm — Cofounder Clarity',
    });
    await createTestOpportunity('kai.md', {
      name: 'Kai',
      type: 'founder',
      stage: 'contacted',
      next_step: 'Follow up',
      next_date: '2026-07-05',
      contact_ref: 'pp/crm — Kai',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);

    const ids = data.map((o: any) => o.id).sort();
    expect(ids).toEqual(['kai', 'matt-jones']);
  });

  it('returns an empty array when the scan dir does not exist (no error)', async () => {
    // Point at a path that has no .private/crm/opportunities dir
    const nonexistentRoot = join(tmpdir(), `kanban-opp-nodir-${Date.now()}`);

    const { status, data } = await fetchOpportunities(nonexistentRoot, true);

    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it('ignores non-.md files', async () => {
    await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
    });
    // Write a non-.md file alongside — scanner must skip it
    await writeFile(join(TEST_OPPORTUNITIES_DIR, 'notes.txt'), 'just a text file', 'utf-8');
    await writeFile(join(TEST_OPPORTUNITIES_DIR, 'data.json'), '{"foo":1}', 'utf-8');

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe('matt-jones');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: Field surfacing — all frontmatter fields on the object
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: Field surfacing', () => {
  useTestWorktree();

  it('surfaces id, path, name, type, stage, next_step, next_date, contact_ref', async () => {
    const filePath = await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
      next_step: 'Send proposal',
      next_date: '2026-06-30',
      contact_ref: 'pp/crm — Cofounder Clarity',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(1);
    const opp = data[0];

    expect(opp.id).toBe('matt-jones');
    expect(opp.path).toBe(filePath);
    expect(opp.name).toBe('Matthew Jones');
    expect(opp.type).toBe('coach');
    expect(opp.stage).toBe('in-conversation');
    expect(opp.next_step).toBe('Send proposal');
    expect(opp.next_date).toBe('2026-06-30');
    expect(opp.contact_ref).toBe('pp/crm — Cofounder Clarity');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: Stage parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: Stage parsing', () => {
  useTestWorktree();

  it('preserves a valid stage value', async () => {
    const validStages = [
      'contacted',
      'in-conversation',
      'qualified',
      'committed',
      'active',
      'closed',
    ];

    for (const stage of validStages) {
      const filename = `opp-${stage}.md`;
      await createTestOpportunity(filename, {
        name: `Test ${stage}`,
        type: 'founder',
        stage,
      });
    }

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    expect(data.length).toBe(validStages.length);

    for (const stage of validStages) {
      const opp = data.find((o: any) => o.id === `opp-${stage}`);
      expect(opp, `Expected opportunity for stage "${stage}" to exist`).toBeDefined();
      expect(opp.stage).toBe(stage);
    }
  });

  it('defaults to "contacted" when stage is missing', async () => {
    // No stage in frontmatter at all
    await createTestOpportunity('no-stage.md', {
      name: 'No Stage Person',
      type: 'investor',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const opp = data.find((o: any) => o.id === 'no-stage');
    expect(opp).toBeDefined();
    expect(opp.stage).toBe('contacted');
  });

  it('defaults to "contacted" when stage is an invalid value', async () => {
    await createTestOpportunity('bad-stage.md', {
      name: 'Bad Stage Person',
      type: 'coach',
      stage: 'totally-made-up',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const opp = data.find((o: any) => o.id === 'bad-stage');
    expect(opp).toBeDefined();
    expect(opp.stage).toBe('contacted');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: Type parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: Type parsing', () => {
  useTestWorktree();

  it('preserves a valid type value', async () => {
    const validTypes = ['founder', 'coach', 'distribution-partner', 'investor'];

    for (const type of validTypes) {
      await createTestOpportunity(`opp-${type}.md`, {
        name: `Test ${type}`,
        type,
        stage: 'contacted',
      });
    }

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    for (const type of validTypes) {
      const opp = data.find((o: any) => o.id === `opp-${type}`);
      expect(opp, `Expected opportunity for type "${type}" to exist`).toBeDefined();
      expect(opp.type).toBe(type);
    }
  });

  it('returns undefined for type when it is an invalid value', async () => {
    await createTestOpportunity('bad-type.md', {
      name: 'Bad Type Person',
      type: 'syndicate-lead',
      stage: 'contacted',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const opp = data.find((o: any) => o.id === 'bad-type');
    expect(opp).toBeDefined();
    expect(opp.type).toBeUndefined();
  });

  it('returns undefined for type when it is missing', async () => {
    await createTestOpportunity('no-type.md', {
      name: 'No Type Person',
      stage: 'qualified',
    });

    const { status, data } = await fetchOpportunities(TEST_WORKTREE_PATH, true);

    expect(status).toBe(200);
    const opp = data.find((o: any) => o.id === 'no-type');
    expect(opp).toBeDefined();
    expect(opp.type).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: Cache logic
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: Cache logic', () => {
  useTestWorktree();

  it('returns cached data on subsequent calls without refresh', async () => {
    await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
    });

    const { status: s1, data: d1 } = await fetchOpportunities(TEST_WORKTREE_PATH, true);
    expect(s1).toBe(200);
    expect(d1.length).toBe(1);

    // Add a second file but do NOT pass refresh — expect cache hit, still 1
    await createTestOpportunity('kai.md', { name: 'Kai', type: 'founder', stage: 'contacted' });
    const { status: s2, data: d2 } = await fetchOpportunities(TEST_WORKTREE_PATH, false);
    expect(s2).toBe(200);

    // Filter to only records from our test worktree to avoid cross-test interference
    const fromThisTree = d2.filter((o: any) => o.path.includes(TEST_WORKTREE_PATH));
    expect(fromThisTree.length).toBe(1);
  });

  it('?refresh=true busts the cache and picks up a new file', async () => {
    await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
    });

    const { data: d1 } = await fetchOpportunities(TEST_WORKTREE_PATH, true);
    const initial = d1.filter((o: any) => o.path.includes(TEST_WORKTREE_PATH));
    expect(initial.length).toBe(1);

    await createTestOpportunity('kai.md', { name: 'Kai', type: 'founder', stage: 'contacted' });

    const { status, data: d2 } = await fetchOpportunities(TEST_WORKTREE_PATH, true);
    expect(status).toBe(200);
    const refreshed = d2.filter((o: any) => o.path.includes(TEST_WORKTREE_PATH));
    expect(refreshed.length).toBe(2);

    const ids = refreshed.map((o: any) => o.id).sort();
    expect(ids).toEqual(['kai', 'matt-jones']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: PATCH /api/opportunities/:id — stage update
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: PATCH /api/opportunities/:id', () => {
  useTestWorktree();

  it('updates stage in frontmatter on disk', async () => {
    const filePath = await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
      next_step: 'Send proposal',
    });

    // Seed the cache
    await fetchOpportunities(TEST_WORKTREE_PATH, true);

    const { status, data } = await patchOpportunity('matt-jones', { stage: 'qualified' }, TEST_WORKTREE_PATH);

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    const updatedContent = await readFile(filePath, 'utf-8');
    expect(updatedContent).toContain('stage: qualified');
    // Other fields must be preserved
    expect(updatedContent).toContain('Matthew Jones');
    expect(updatedContent).toContain('Send proposal');
  });

  it('rejects an invalid stage value with 400', async () => {
    const filePath = await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
    });
    const originalContent = await readFile(filePath, 'utf-8');

    await fetchOpportunities(TEST_WORKTREE_PATH, true);

    const { status, data } = await patchOpportunity(
      'matt-jones',
      { stage: 'not-a-real-stage' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(400);
    expect(data.error).toBeDefined();

    // File must be unmodified
    const unchanged = await readFile(filePath, 'utf-8');
    expect(unchanged).toBe(originalContent);
  });

  it('returns 404 for a non-existent opportunity id', async () => {
    await fetchOpportunities(TEST_WORKTREE_PATH, true);

    const { status, data } = await patchOpportunity(
      'nobody-exists',
      { stage: 'qualified' },
      TEST_WORKTREE_PATH
    );

    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it('cache is updated after PATCH — subsequent GET reflects new stage', async () => {
    await createTestOpportunity('matt-jones.md', {
      name: 'Matthew Jones',
      type: 'coach',
      stage: 'in-conversation',
    });

    await fetchOpportunities(TEST_WORKTREE_PATH, true);

    await patchOpportunity('matt-jones', { stage: 'qualified' }, TEST_WORKTREE_PATH);

    // No refresh flag — should still see updated stage via cache-update path
    const { data } = await fetchOpportunities(TEST_WORKTREE_PATH);
    const opp = data.find((o: any) => o.id === 'matt-jones');
    expect(opp).toBeDefined();
    expect(opp.stage).toBe('qualified');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P962: Regression — existing boards unaffected
// ─────────────────────────────────────────────────────────────────────────────

describe('P962: Regression — existing boards unaffected', () => {
  it('GET /api/features still returns 200', async () => {
    const res = await fetch(`${API_BASE_URL}/api/features`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /api/articles still returns 200', async () => {
    const res = await fetch(`${API_BASE_URL}/api/articles`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
