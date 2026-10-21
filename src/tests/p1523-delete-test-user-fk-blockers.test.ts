/**
 * P1522/P1523 — deleteTestUser clears foreign-key blockers named by the database error.
 *
 * The service client is mocked with state: a delete on a table stays blocked (23503, default
 * constraint name) until the blocking rows have been deleted, exactly as Postgres behaves.
 * Two shapes, both seen on the test project: a row pointing straight at the profile (an
 * agreement as creator), and a row pointing at one of the user's stories (a sealed letter's
 * snapshot), which stranded every such user until P1523.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Blocker = { table: string; constraint: string; column: string; value: string };
/** Delete on `key` is refused while its blocker's rows are still present. */
let blockers: Record<string, Blocker> = {};
let cleared: string[] = [];
let storiesOfUser: { id: string }[] = [];

const fkError = (b: Blocker) => ({
  code: '23503',
  message: `update or delete on table "x" violates foreign key constraint "${b.constraint}" on table "${b.table}"`,
});

vi.mock('@playwright/test', () => ({
  test: { info: () => { throw new Error('not in a test'); } },
  expect: { soft: () => ({ toBeTruthy: () => {} }) },
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: table === 'stories' ? storiesOfUser : [], error: null }) }),
      delete: () => ({
        eq: (column: string, value: string) => {
          const key = `${table}.${column}=${value}`;
          const b = blockers[`${table}.${column}`] ?? blockers[table];
          if (b && !cleared.includes(`${b.table}.${b.column}=${b.value}`)) return Promise.resolve({ error: fkError(b) });
          cleared.push(key);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));
vi.mock('../../e2e/helpers/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ or: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }), in: () => Promise.resolve({ error: null }) }),
    }),
    auth: { admin: { deleteUser: () => Promise.resolve({ error: null }) } },
  },
}));

const { deleteTestUser } = await import('../../e2e/helpers/test-user');

describe('P1523 deleteTestUser clears FK blockers', () => {
  beforeEach(() => {
    blockers = {};
    cleared = [];
    storiesOfUser = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('clears a row that points straight at the profile (agreement as creator)', async () => {
    blockers.profiles = {
      table: 'clarity_agreements', constraint: 'clarity_agreements_creator_profile_id_fkey',
      column: 'creator_profile_id', value: 'u-1',
    };
    await expect(deleteTestUser('u-1')).resolves.toBeUndefined();
    expect(cleared).toContain('clarity_agreements.creator_profile_id=u-1');
    expect(cleared).toContain('profiles.id=u-1');
  });

  it("clears a sealed letter's snapshot of the user's story, through the story id", async () => {
    storiesOfUser = [{ id: 's-9' }];
    blockers['stories.author_id'] = {
      table: 'letter_story_snapshots', constraint: 'letter_story_snapshots_story_id_fkey',
      column: 'story_id', value: 's-9',
    };
    await expect(deleteTestUser('u-1')).resolves.toBeUndefined();
    expect(cleared).toContain('letter_story_snapshots.story_id=s-9');
    expect(cleared).toContain('stories.author_id=u-1');
  });

  it('fails closed on a constraint that is not default-named', async () => {
    blockers.profiles = { table: 'witnesses', constraint: 'custom_witness_link', column: 'witness_profile_id', value: 'u-1' };
    await expect(deleteTestUser('u-1')).rejects.toThrow(/failed at profile delete/);
    expect(cleared).not.toContain('witnesses.witness_profile_id=u-1');
  });
});
