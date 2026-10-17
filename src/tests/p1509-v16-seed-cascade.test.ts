/**
 * @file p1509-v16-seed-cascade.test.ts
 * @description P1509 v16: the persona reset must be judged against EVERY foreign key into a table it deletes from.
 * The edge list is derived from the real migrations (no hand-typed list), the seed script's classification must cover
 * it exactly, and the preflight must abort before any delete when a row a persona does not own is in the way.
 * Offline: the database is a recording fake.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KNOWN_UNRESOLVED, buildFkGraph, deriveReferrers, edgeKey, parserProblems, splitStatements, triggersTouching, type FkEdge, type FkGraph } from '../../scripts/p1509-fk-graph';
import {
  CASCADE_CLASSIFICATION,
  MAX_OWNER_SET,
  agreementPartnerGuard,
  cascadePreflight,
  classificationCoverage,
  fetchIds,
  foreignOwnerFilter,
  resolveSets,
  setNullProblems,
  type PersonaSets,
  type Ruling,
} from '../../scripts/p1509-seed-cascade';
import { RESET_ORDER, SeedGuardError, loadReferrers, reset, resetRoots } from '../../scripts/p1509-seed-personas';
import { PERSONA_IDS, personaEmail } from '../app/prototypes/clarity-chat-v16/personas';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((name) => ({ name, text: readFileSync(path.join(MIGRATIONS, name), 'utf8') }));
const real = buildFkGraph(files);
const roots = resetRoots();
const referrers = deriveReferrers(real.edges, roots);
const find = (key: string): FkEdge | undefined => real.edges.find((e) => edgeKey(e) === key);

const sql = (text: string, name = '001.sql') => buildFkGraph([{ name, text }]);
const keys = (g: ReturnType<typeof sql>) => g.edges.map((e) => `${edgeKey(e)} ${e.onDelete}`).sort();

describe('foreign-key graph parser (synthetic controls)', () => {
  it('reads a column REFERENCES, a table constraint, and the ON DELETE action (default NO ACTION)', () => {
    const g = sql(`
      CREATE TABLE public.a (id uuid PRIMARY KEY);
      CREATE TABLE public.b (
        id uuid PRIMARY KEY,
        a_id uuid NOT NULL REFERENCES public.a(id) ON DELETE CASCADE,
        a2 uuid REFERENCES a(id),
        a3 uuid,
        CONSTRAINT b_a3_fk FOREIGN KEY (a3) REFERENCES public.a (id) ON DELETE SET NULL
      );`);
    expect(keys(g)).toEqual(['b.a2->a NO ACTION', 'b.a3->a SET NULL', 'b.a_id->a CASCADE']);
    expect(g.declarations).toBe(g.referenceTokens);
  });

  it('reads ALTER ADD COLUMN and ADD CONSTRAINT, including several actions in one statement', () => {
    const g = sql(`
      CREATE TABLE a (id uuid);
      CREATE TABLE b (id uuid, x uuid, y uuid);
      ALTER TABLE b ADD COLUMN IF NOT EXISTS c uuid REFERENCES a(id) ON DELETE RESTRICT,
        ADD CONSTRAINT b_x_fk FOREIGN KEY (x) REFERENCES a(id) ON DELETE CASCADE NOT VALID;
      ALTER TABLE ONLY public.b ADD FOREIGN KEY (y) REFERENCES a(id);`);
    expect(keys(g)).toEqual(['b.c->a RESTRICT', 'b.x->a CASCADE', 'b.y->a NO ACTION']);
    expect(g.declarations).toBe(g.referenceTokens);
  });

  it('honours a later DROP CONSTRAINT then ADD with a different action (the last definition wins)', () => {
    const g = sql(`
      CREATE TABLE a (id uuid);
      CREATE TABLE b (id uuid, a_id uuid REFERENCES a(id) ON DELETE CASCADE);
      ALTER TABLE b DROP CONSTRAINT b_a_id_fkey;
      ALTER TABLE b ADD CONSTRAINT b_a_id_fkey FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE SET NULL;`);
    expect(keys(g)).toEqual(['b.a_id->a SET NULL']);
  });

  it('honours DROP CONSTRAINT IF EXISTS, DROP COLUMN, DROP TABLE and renames', () => {
    const g = sql(`
      CREATE TABLE a (id uuid);
      CREATE TABLE b (id uuid, a_id uuid REFERENCES a(id), d uuid REFERENCES a(id));
      CREATE TABLE c (id uuid, a_id uuid REFERENCES a(id));
      CREATE TABLE e (id uuid, b_id uuid REFERENCES b(id));
      ALTER TABLE b DROP CONSTRAINT IF EXISTS b_a_id_fkey;
      ALTER TABLE b DROP COLUMN d;
      ALTER TABLE e RENAME COLUMN b_id TO bee;
      ALTER TABLE b RENAME TO bb;
      DROP TABLE IF EXISTS c CASCADE;`);
    expect(keys(g)).toEqual(['e.bee->bb NO ACTION']);
  });

  it('a dropped parent removes the edges into it', () => {
    const g = sql(`CREATE TABLE a (id uuid); CREATE TABLE b (a_id uuid REFERENCES a(id)); DROP TABLE a CASCADE;`);
    expect(g.edges).toEqual([]);
  });

  it('reads a composite foreign key as one edge with both columns', () => {
    const g = sql(`
      CREATE TABLE s (l uuid, st uuid, PRIMARY KEY (l, st));
      CREATE TABLE x (id uuid, l uuid, st uuid, FOREIGN KEY (l, st) REFERENCES s(l, st) ON DELETE CASCADE);`);
    expect(keys(g)).toEqual(['x.l,st->s CASCADE']);
  });

  it('ignores REFERENCES in comments, strings and function bodies', () => {
    const g = sql(`
      -- b.a_id REFERENCES a(id)
      /* c uuid REFERENCES a(id) */
      CREATE TABLE a (id uuid, note text DEFAULT 'x REFERENCES y(id)');
      CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN ALTER TABLE a ADD COLUMN z uuid REFERENCES a(id); END $fn$ LANGUAGE plpgsql;
      GRANT REFERENCES ON a TO anon;`);
    expect(g.edges).toEqual([]);
    expect(g.declarations).toBe(g.referenceTokens);
  });

  it('finds ALTER TABLE inside a DO block and flags dynamic DDL it cannot resolve', () => {
    const g = sql(`
      CREATE TABLE a (id uuid); CREATE TABLE b (id uuid, a_id uuid);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1) THEN ALTER TABLE b ADD CONSTRAINT b_fk FOREIGN KEY (a_id) REFERENCES a(id) ON DELETE CASCADE; END IF;
        EXECUTE format('ALTER TABLE b DROP CONSTRAINT %I', 'zzz');
      END $$;`);
    expect(keys(g)).toEqual(['b.a_id->a CASCADE']);
    expect(g.unresolved.length).toBe(1);
  });

  it('CREATE TABLE IF NOT EXISTS on an existing table is a no-op', () => {
    const g = sql(`
      CREATE TABLE a (id uuid);
      CREATE TABLE b (id uuid, a_id uuid REFERENCES a(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS b (id uuid, a_id uuid REFERENCES a(id) ON DELETE SET NULL);`);
    expect(keys(g)).toEqual(['b.a_id->a CASCADE']);
  });

  it('replays files in name order, not argument order', () => {
    const g = buildFkGraph([
      { name: '002.sql', text: 'ALTER TABLE b DROP CONSTRAINT b_a_id_fkey;' },
      { name: '001.sql', text: 'CREATE TABLE a (id uuid); CREATE TABLE b (a_id uuid REFERENCES a(id));' },
    ]);
    expect(g.edges).toEqual([]);
  });

  it('splitStatements keeps a semicolon inside a string or dollar quote from splitting a statement', () => {
    expect(splitStatements(`SELECT 'a;b'; SELECT $$x;y$$; SELECT 1`).map((s) => s.text)).toEqual([`SELECT '' `.trim(), 'SELECT $$ $$', 'SELECT 1']);
  });

  it('derives referrers through CASCADE only, and still reports NO ACTION and SET NULL edges', () => {
    const g = sql(`
      CREATE TABLE p (id uuid);
      CREATE TABLE c1 (p uuid REFERENCES p(id) ON DELETE CASCADE);
      CREATE TABLE c2 (c uuid, p uuid REFERENCES p(id) ON DELETE SET NULL);
      CREATE TABLE gc (c uuid REFERENCES c1(p) ON DELETE CASCADE);
      CREATE TABLE blocker (p uuid REFERENCES p(id));
      CREATE TABLE behind_setnull (c uuid REFERENCES c2(c));`);
    const r = deriveReferrers(g.edges, ['p']);
    expect([...r.deletedTables].sort()).toEqual(['c1', 'gc', 'p']);
    expect(r.edges.map(edgeKey)).toEqual(['blocker.p->p', 'c1.p->p', 'c2.p->p', 'gc.c->c1']);
  });
});

describe('derivation from the real migrations (one known edge per path)', () => {
  it('parsed every REFERENCES in a CREATE/ALTER TABLE statement', () => {
    expect(real.edges.length).toBeGreaterThan(100);
    expect(real.declarations).toBe(real.referenceTokens);
  });

  it('left unresolved only the two CHECK-constraint drops, never an FK', () => {
    expect(real.unresolved.map((u) => u.file).sort()).toEqual([
      '20260908110000_p1259_profile_description_and_links.sql',
      '20261002140000_p1386_mic_setup_lightning_other.sql',
    ]);
  });

  it.each([
    ['event_rsvps.profile_id->profiles', 'CASCADE', 'CREATE TABLE'],
    ['event_rsvps.event_id->events', 'CASCADE', 'CREATE TABLE'],
    ['email_send_log.event_id->events', 'NO ACTION', 'CREATE TABLE'],
    ['clarity_agreements.partner_profile_id->profiles', 'RESTRICT', 'CREATE TABLE'],
    ['letter_story_snapshots.story_id->stories', 'NO ACTION', 'CREATE TABLE'],
    ['story_explain_backs.letter_id,story_id->letter_story_snapshots', 'CASCADE', 'composite'],
    ['profiles.id->auth.users', 'CASCADE', 'auth parent'],
    ['membership.invited_by->profiles', 'SET NULL', 'ALTER ADD COLUMN'],
    ['events.host_id->profiles', 'SET NULL', 'DROP + ADD CONSTRAINT rewrote CASCADE'],
  ])('%s is %s (%s)', (key, onDelete) => {
    expect(find(key)?.onDelete).toBe(onDelete);
  });

  it('every derived edge names a real migration file', () => {
    const names = new Set(files.map((f) => f.name));
    for (const e of real.edges) expect(names.has(e.file)).toBe(true);
  });
});

describe('classification covers the derived edges exactly', () => {
  it('has a ruling for every referrer edge and no ruling for a vanished one', () => {
    const cov = classificationCoverage(referrers);
    expect(cov.unclassified.map(edgeKey)).toEqual([]);
    expect(cov.stale).toEqual([]);
  });

  it('fails on a new foreign key into a deleted table (the control for the check above)', () => {
    const extra: FkEdge = { child: 'brand_new', columns: ['user_id'], parent: 'profiles', onDelete: 'CASCADE', name: 'x', file: 'x.sql' };
    const cov = classificationCoverage({ ...referrers, edges: [...referrers.edges, extra] });
    expect(cov.unclassified.map(edgeKey)).toEqual(['brand_new.user_id->profiles']);
  });

  it('fails on a ruling whose edge was removed', () => {
    const cov = classificationCoverage({ ...referrers, edges: referrers.edges.filter((e) => edgeKey(e) !== 'event_rsvps.event_id->events') });
    expect(cov.stale).toEqual(['event_rsvps.event_id->events']);
  });

  it('deleted-first rulings and RESET_ORDER name exactly the same (table, column) pairs', () => {
    const fromRulings = Object.entries(CASCADE_CLASSIFICATION)
      .filter(([, r]) => r.cls === 'deleted-first')
      .map(([k]) => k.replace(/->.*$/, ''))
      .sort();
    const fromReset = RESET_ORDER.map((s) => `${s.table}.${s.column}`).sort();
    expect(fromRulings).toEqual(fromReset);
  });

  it('every guarded edge has a single column and a parent table with a persona set', () => {
    for (const e of referrers.edges) {
      const r = CASCADE_CLASSIFICATION[edgeKey(e)];
      if (r?.cls !== 'guarded') continue;
      expect(e.columns.length).toBe(1);
    }
  });

  it('covers the cases the review named', () => {
    const guarded = (k: string) => CASCADE_CLASSIFICATION[k]?.cls === 'guarded';
    for (const k of [
      'email_send_log.event_id->events', 'email_send_log.profile_id->profiles', 'point_position_history.point_id->points',
      'story_verifications.story_id->stories', 'badge_points.point_id->points', 'doc_stories.story_id->stories',
      'event_preparations.event_id->events', 'letter_deliveries.letter_id->clarity_letters', 'letter_deliveries.receiver_profile_id->profiles',
    ]) expect(guarded(k), k).toBe(true);
  });

  it('the roots are the reset tables plus the account store', () => {
    expect(roots).toEqual([...RESET_ORDER.map((s) => s.table), 'auth.users']);
    expect(referrers.deletedTables.has('letter_deliveries')).toBe(true); // reached through the letter, not deleted by receiver
    expect(referrers.deletedTables.has('profiles')).toBe(true);
  });
});

// ───────────────────────────── a recording fake database ─────────────────────────────

interface Call { table: string; op: 'select' | 'delete'; filters: [string, ...unknown[]][]; opts?: Record<string, unknown> }
type Reply = { data?: unknown; count?: number | null; error?: { message: string } | null };

function fakeDb(respond: (c: Call) => Reply, users: { id: string; email: string }[] = []) {
  const calls: Call[] = [];
  const order: string[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      const b: Record<string, unknown> = {};
      const add = (name: string) => (...args: unknown[]) => { call.filters.push([name, ...args]); return b; };
      b['select'] = (_cols?: string, opts?: Record<string, unknown>) => { call.opts = opts; return b; };
      b['delete'] = (opts?: Record<string, unknown>) => { call.op = 'delete'; call.opts = opts; return b; };
      for (const n of ['in', 'or', 'not', 'neq', 'order', 'range', 'eq', 'is']) b[n] = add(n);
      b['then'] = (resolve: (v: unknown) => void) => {
        calls.push(call);
        order.push(`${call.op}:${table}`);
        const r = respond(call);
        resolve({ data: r.data ?? [], count: 'count' in r ? r.count : 0, error: r.error ?? null });
      };
      return b;
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        deleteUser: async (id: string) => { order.push(`deleteUser:${id}`); return { error: null }; },
      },
    },
  };
  return { db: db as never, calls, order };
}

const U = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const idsFor = (table: string): { id: string }[] =>
  ({ events: [{ id: 'e1' }], points: [{ id: 'p1' }], stories: [{ id: 's1' }], clarity_letters: [{ id: 'l1' }], clarity_docs: [{ id: 'd1' }],
    letter_deliveries: [{ id: 'dl1' }], story_versions: [{ id: 'v1' }] } as Record<string, { id: string }[]>)[table] ?? [];
/** Discovery returns one id per set; every count query returns `count` (or per-table override). */
const standard = (count: Record<string, number> = {}) => (c: Call): Reply => {
  if (c.opts?.['head']) return { count: count[c.table] ?? 0 };
  const range = c.filters.find((f) => f[0] === 'range') as [string, number, number] | undefined;
  return { data: range && range[1] > 0 ? [] : idsFor(c.table) }; // like the server: past the end, an empty page
};

describe('foreignOwnerFilter', () => {
  const sets: PersonaSets = { users: U, events: ['e1'], points: [], stories: [], letters: ['l1'], docs: [], deliveries: [], versions: [] };

  it('is true for a NULL owner or one outside the persona set', () => {
    expect(foreignOwnerFilter([{ col: 'profile_id' }], sets)).toBe(`profile_id.is.null,profile_id.not.in.(${U.join(',')})`);
  });

  it('joins several owner columns, each against its own set', () => {
    expect(foreignOwnerFilter([{ col: 'a' }, { col: 'b', set: 'letters' }], sets)).toBe(`a.is.null,a.not.in.(${U.join(',')}),b.is.null,b.not.in.(l1)`);
  });

  it('counts every row when an owner set is empty (any value is foreign)', () => {
    expect(foreignOwnerFilter([{ col: 'doc_id', set: 'docs' }], sets)).toBeNull();
  });

  it('refuses a set too large to put in a URL rather than checking part of it', () => {
    const big: PersonaSets = { ...sets, letters: Array.from({ length: MAX_OWNER_SET + 1 }, (_, i) => `l${i}`) };
    expect(() => foreignOwnerFilter([{ col: 'x', set: 'letters' }], big)).toThrow(/too many/);
  });
});

describe('id discovery', () => {
  it('reads every page until an EMPTY page', async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));
    const { db, calls } = fakeDb((c) => {
      const range = c.filters.find((f) => f[0] === 'range') as [string, number, number];
      return { data: range[1] === 0 ? page(1000) : range[1] === 1000 ? page(3) : [] };
    });
    const ids = await fetchIds(db, 'points', 'first_validator_id', ['u1']);
    expect(ids.length).toBe(1003);
    expect(calls.map((c) => (c.filters.find((f) => f[0] === 'range') as [string, number, number]).slice(1))).toEqual([[0, 999], [1000, 1999], [1003, 2002]]);
    expect(calls[0]?.filters.some((f) => f[0] === 'order')).toBe(true); // stable paging
  });

  it('does not stop early or skip rows when the server caps a page below 1000', async () => {
    const all = Array.from({ length: 450 }, (_, i) => ({ id: `id${i}` }));
    const { db } = fakeDb((c) => {
      const [, from] = c.filters.find((f) => f[0] === 'range') as [string, number, number];
      return { data: all.slice(from, from + 100) }; // the server returns at most 100 rows whatever the range asks
    });
    expect((await fetchIds(db, 'points', 'first_validator_id', ['u1'])).length).toBe(450);
  });

  it('chunks a long value list instead of building one huge URL', async () => {
    const { db, calls } = fakeDb(() => ({ data: [] }));
    await fetchIds(db, 'letter_deliveries', 'letter_id', Array.from({ length: 250 }, (_, i) => `l${i}`));
    expect(calls.length).toBe(3); // one (empty) page per chunk of 100
  });

  it('derives each set from the right parent', async () => {
    const { db } = fakeDb(standard());
    const sets = await resolveSets(db, U);
    expect(sets).toMatchObject({ users: U, events: ['e1'], letters: ['l1'], deliveries: ['dl1'], versions: ['v1'] });
  });
});

describe('cascade preflight', () => {
  it('reports nothing for a clean world and checks every guarded edge', async () => {
    const { db, calls } = fakeDb(standard());
    expect(await cascadePreflight(db, U, referrers)).toEqual([]);
    const guardedEdges = referrers.edges.filter((e) => CASCADE_CLASSIFICATION[edgeKey(e)]?.cls === 'guarded');
    const counted = new Set(calls.filter((c) => c.opts?.['head']).map((c) => c.table));
    for (const e of guardedEdges) expect(counted.has(e.child), edgeKey(e)).toBe(true);
    expect(calls.every((c) => c.op === 'select')).toBe(true);
  });

  it('flags a foreign RSVP, a foreign position, and an NO ACTION blocker, naming table and count', async () => {
    const { db } = fakeDb(standard({ event_rsvps: 2, point_positions: 1, email_send_log: 4 }));
    const problems = await cascadePreflight(db, U, referrers);
    const byEdge = Object.fromEntries(problems.map((p) => [p.edge, p.count]));
    expect(byEdge['event_rsvps.event_id->events']).toBe(2);
    expect(byEdge['point_positions.point_id->points']).toBe(1);
    expect(byEdge['email_send_log.event_id->events']).toBe(4);
    expect(byEdge['email_send_log.profile_id->profiles']).toBe(4);
  });

  it('counts rows whose owner is NULL (the filter names IS NULL as well as NOT IN)', async () => {
    const { db, calls } = fakeDb(standard({ event_rsvps: 1 }));
    await cascadePreflight(db, U, referrers);
    const rsvp = calls.find((c) => c.table === 'event_rsvps' && c.opts?.['head']);
    const or = rsvp?.filters.find((f) => f[0] === 'or')?.[1] as string;
    expect(or).toContain('profile_id.is.null');
    expect(or).toContain(`profile_id.not.in.(${U.join(',')})`);
  });

  it('a "blocks" edge counts every row (no owner filter)', async () => {
    const { db, calls } = fakeDb(standard());
    await cascadePreflight(db, U, referrers);
    const sessions = calls.find((c) => c.table === 'clarity_sessions' && c.opts?.['head']);
    expect(sessions?.filters.some((f) => f[0] === 'or')).toBe(false);
  });

  it('refuses to run against an out-of-date classification, before any query', async () => {
    const { db, calls } = fakeDb(standard());
    const extra: FkEdge = { child: 'brand_new', columns: ['user_id'], parent: 'profiles', onDelete: 'CASCADE', name: 'x', file: 'x.sql' };
    await expect(cascadePreflight(db, U, { ...referrers, edges: [...referrers.edges, extra] })).rejects.toThrow(/out of date/);
    expect(calls.length).toBe(0);
  });

  it('a failing query fails the preflight (never "no problems")', async () => {
    const { db } = fakeDb((c) => (c.opts?.['head'] && c.table === 'event_rsvps' ? { error: { message: 'boom' } } : standard()(c)));
    await expect(cascadePreflight(db, U, referrers)).rejects.toThrow(/boom/);
  });

  it('does nothing for no personas', async () => {
    const { db, calls } = fakeDb(standard());
    expect(await cascadePreflight(db, [], referrers)).toEqual([]);
    expect(calls.length).toBe(0);
  });
});

describe('reset()', () => {
  const personaUsers = [{ id: U[0] as string, email: personaEmail('bob') }, { id: U[1] as string, email: personaEmail('alice') }, { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: ['bob', 'gmail.com'].join('@') }];
  const withSecrets = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p1509-reset-'));
    const file = path.join(dir, 'p.json');
    writeFileSync(file, '{}');
    return { dir, file };
  };

  it('aborts with the table and count, and deletes NOTHING, when the preflight finds a foreign row', async () => {
    const { db, calls, order } = fakeDb(standard({ email_send_log: 3 }), personaUsers);
    const { dir, file } = withSecrets();
    try {
      const err = await reset(db, false, file).catch((e) => e);
      expect(err).toBeInstanceOf(SeedGuardError);
      expect(err.message).toContain('NOTHING WAS DELETED');
      expect(err.message).toContain('email_send_log.event_id->events');
      expect(err.message).toContain('3 row(s)');
      expect(calls.some((c) => c.op === 'delete')).toBe(false);
      expect(order.some((o) => o.startsWith('deleteUser'))).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe('{}'); // the secrets file survives an aborted reset
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('on a clean world deletes in RESET_ORDER, only after the preflight, accounts last, and only persona ids', async () => {
    const { db, calls, order } = fakeDb(standard(), personaUsers);
    const { dir, file } = withSecrets();
    try {
      await reset(db, false, file);
      const deletes = calls.filter((c) => c.op === 'delete');
      expect(deletes.map((c) => c.table)).toEqual(RESET_ORDER.map((s) => s.table));
      for (const d of deletes) expect(d.filters.find((f) => f[0] === 'in')?.[2]).toEqual(U);
      expect(deletes.find((d) => d.table === 'membership')?.filters).toContainEqual(['neq', 'role', 'organizer']);
      const firstDelete = order.findIndex((o) => o.startsWith('delete:'));
      const lastGuardCount = Math.max(...calls.map((c, i) => (c.opts?.['head'] && c.op === 'select' && !deletes.includes(c) ? i : -1)));
      expect(lastGuardCount).toBeLessThan(calls.indexOf(deletes[0] as Call));
      expect(order.slice(firstDelete).filter((o) => o.startsWith('deleteUser')).sort()).toEqual([`deleteUser:${U[0]}`, `deleteUser:${U[1]}`]);
      expect(order.lastIndexOf(order.find((o) => o.startsWith('deleteUser')) as string)).toBeGreaterThan(order.lastIndexOf('delete:membership') - 1);
      expect(() => readFileSync(file)).toThrow(); // the stale secrets file is gone
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a dry run counts but never deletes a row or an account', async () => {
    const { db, calls, order } = fakeDb(standard(), personaUsers);
    await reset(db, true);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
    expect(order.some((o) => o.startsWith('deleteUser'))).toBe(false);
  });

  it('with no persona accounts does nothing at all', async () => {
    const { db, calls } = fakeDb(standard(), [personaUsers[2] as { id: string; email: string }]);
    await reset(db, false);
    expect(calls.length).toBe(0);
  });

  it('loadReferrers derives from the repo migrations, the same edges the tests above use', () => {
    expect(loadReferrers().referrers.edges.map(edgeKey)).toEqual(referrers.edges.map(edgeKey));
  });
});

describe('seed script never deletes a delivery by receiver', () => {
  it('has no letter_deliveries step and the source never filters deletes on receiver_profile_id', () => {
    const source = readFileSync(path.resolve(__dirname, '../../scripts/p1509-seed-personas.ts'), 'utf8');
    expect(RESET_ORDER.some((s) => s.table === 'letter_deliveries')).toBe(false);
    expect(source).not.toMatch(/column:\s*'receiver_profile_id'/);
  });
});

describe('rulings the reviews corrected', () => {
  const ruling = (k: string): Ruling | undefined => CASCADE_CLASSIFICATION[k];

  it('a transcribe room on a persona event blocks the delete (its immutable-column trigger refuses the SET NULL)', () => {
    expect(ruling('transcribe_rooms.event_id->events')?.cls).toBe('guarded');
    expect((ruling('transcribe_rooms.event_id->events') as Extract<Ruling, { cls: 'guarded' }>).owners).toBeUndefined();
    expect(find('transcribe_rooms.event_id->events')?.onDelete).toBe('SET NULL');
    expect(real.updateTriggers.some((t) => t.table === 'transcribe_rooms' && t.name === 'transcribe_rooms_guard_immutable_columns')).toBe(true);
  });

  it('witness entries and live invites that a non-persona can create are guarded', () => {
    expect(ruling('witnesses.profile_id->profiles')?.cls).toBe('guarded');
    expect(ruling('clarity_live_invites.target_user_id->profiles')?.cls).toBe('guarded');
  });

  it('the preparation pin is reviewed, and the reset deletes preparations before RSVPs', () => {
    expect(ruling('event_preparations.rsvp_id->event_rsvps')?.cls).toBe('set-null-trigger-reviewed');
    const at = (t: string) => RESET_ORDER.findIndex((s) => s.table === t);
    expect(at('event_preparations')).toBeGreaterThan(-1);
    expect(at('event_preparations')).toBeLessThan(at('event_rsvps'));
  });

  it('keeps event_rounds children and letter_predictions persona-only, with the reason on record', () => {
    for (const k of ['event_round_seats.round_id->event_rounds', 'letter_predictions.letter_id->clarity_letters']) {
      expect(ruling(k)?.cls, k).toBe('persona-only');
    }
  });
});

describe('set-null audit', () => {
  it('finds no problem in the real schema', () => {
    expect(setNullProblems(real, referrers)).toEqual([]);
  });

  it('every set-null edge on a table with an UPDATE trigger on that column is explicitly reviewed or guarded', () => {
    for (const e of referrers.edges) {
      if (e.onDelete !== 'SET NULL') continue;
      const r = CASCADE_CLASSIFICATION[edgeKey(e)];
      if (r?.cls !== 'set-null') continue;
      expect(e.columns.flatMap((c) => triggersTouching(real, e.child, c)).map((t) => t.name), edgeKey(e)).toEqual([]);
    }
  });

  it('every SET NULL edge is on a nullable column', () => {
    for (const e of referrers.edges) {
      if (e.onDelete !== 'SET NULL') continue;
      expect(e.columns.some((c) => real.notNull.has(`${e.child}.${c}`)), edgeKey(e)).toBe(false);
    }
  });

  const fixture = (sqlText: string, ruling: Ruling) => {
    const g = sql(sqlText);
    const r = deriveReferrers(g.edges, ['p']);
    const key = edgeKey(g.edges[0] as FkEdge);
    return setNullProblems(g, r, { [key]: ruling });
  };
  const base = `CREATE TABLE p (id uuid); CREATE TABLE c (id uuid, p_id uuid REFERENCES p(id) ON DELETE SET NULL);`;

  it('flags a plain set-null on a table whose UPDATE trigger fires on the column (control)', () => {
    const out = fixture(`${base} CREATE TRIGGER guard BEFORE UPDATE ON c FOR EACH ROW EXECUTE FUNCTION f();`, { cls: 'set-null', why: 'x' });
    expect(out.length).toBe(1);
    expect(out[0]).toContain('BEFORE guard');
  });

  it('accepts the same edge once it is ruled reviewed, or when the trigger is on another column, or is not an UPDATE trigger', () => {
    expect(fixture(`${base} CREATE TRIGGER guard BEFORE UPDATE ON c FOR EACH ROW EXECUTE FUNCTION f();`, { cls: 'set-null-trigger-reviewed', why: 'x' })).toEqual([]);
    expect(fixture(`${base} CREATE TRIGGER guard BEFORE UPDATE OF id ON c FOR EACH ROW EXECUTE FUNCTION f();`, { cls: 'set-null', why: 'x' })).toEqual([]);
    expect(fixture(`${base} CREATE TRIGGER guard BEFORE INSERT ON c FOR EACH ROW EXECUTE FUNCTION f();`, { cls: 'set-null', why: 'x' })).toEqual([]);
    expect(fixture(`${base} CREATE TRIGGER guard BEFORE UPDATE ON c FOR EACH ROW EXECUTE FUNCTION f(); DROP TRIGGER guard ON c;`, { cls: 'set-null', why: 'x' })).toEqual([]);
  });

  it('flags SET NULL on a NOT NULL column, and stops flagging after DROP NOT NULL', () => {
    const notNullTable = `CREATE TABLE p (id uuid); CREATE TABLE c (p_id uuid NOT NULL REFERENCES p(id) ON DELETE SET NULL);`;
    expect(fixture(notNullTable, { cls: 'set-null', why: 'x' })[0]).toContain('NOT NULL');
    expect(fixture(`${notNullTable} ALTER TABLE c ALTER COLUMN p_id DROP NOT NULL;`, { cls: 'set-null', why: 'x' })).toEqual([]);
    expect(fixture(`${base} ALTER TABLE c ALTER COLUMN p_id SET NOT NULL;`, { cls: 'set-null', why: 'x' })[0]).toContain('NOT NULL');
  });
});

describe('parser completeness (run-time refusal)', () => {
  it('the real graph is complete: every REFERENCES became an edge, and only the two known CHECK drops are unresolved', () => {
    expect(parserProblems(real)).toEqual([]);
    expect(real.unresolved.length).toBe(KNOWN_UNRESOLVED.length);
  });

  it('flags dynamic DDL outside the known list, and a known file with different text', () => {
    const odd: FkGraph = { ...real, unresolved: [...real.unresolved, { file: '999.sql', text: 'EXECUTE format( ALTER TABLE x ADD FOREIGN KEY' }] };
    expect(parserProblems(odd).length).toBe(1);
    const other: FkGraph = { ...real, unresolved: [{ file: KNOWN_UNRESOLVED[0]!.file, text: 'EXECUTE format( ALTER TABLE public.points DROP CONSTRAINT %I' }] };
    expect(parserProblems(other).length).toBe(1);
  });

  it('flags a REFERENCES the parser counted but did not turn into an edge', () => {
    expect(parserProblems({ ...real, declarations: real.declarations - 1 }).length).toBe(1);
  });

  it('a DO block that EXECUTEs formatted DDL becomes unresolved (the fixture the reviews asked for)', () => {
    const g = sql(`CREATE TABLE a (id uuid);
      DO $$ BEGIN EXECUTE format('CREATE TABLE %I (id uuid, owner uuid REFERENCES a(id) ON DELETE CASCADE)', 'hidden'); END $$;`);
    expect(g.unresolved.length).toBe(1);
    expect(parserProblems(g).length).toBe(1);
  });

  it('DDL assembled with || is unresolved too', () => {
    const g = sql(`DO $$ BEGIN EXECUTE 'ALTER TABLE ' || 'b' || ' ADD COLUMN x uuid REFERENCES a(id)'; END $$;`);
    expect(g.unresolved.length).toBe(1);
  });

  it('literal EXECUTE of CREATE TABLE inside DO is parsed, not lost', () => {
    const g = sql(`CREATE TABLE profiles (id uuid);
      DO $$ BEGIN EXECUTE 'CREATE TABLE public.hidden (id uuid, owner uuid REFERENCES profiles(id) ON DELETE CASCADE)'; END $$;`);
    expect(keys(g)).toEqual(['hidden.owner->profiles CASCADE']);
    expect(g.unresolved).toEqual([]);
  });

  it('DROP TABLE inside DO is applied, but ALTER PUBLICATION ... DROP TABLE is not a table drop', () => {
    const g = sql(`CREATE TABLE a (id uuid); CREATE TABLE b (a_id uuid REFERENCES a(id)); CREATE TABLE c (a_id uuid REFERENCES a(id));
      DO $$ BEGIN DROP TABLE b; ALTER PUBLICATION pub DROP TABLE public.c; END $$;`);
    expect(keys(g)).toEqual(['c.a_id->a NO ACTION']);
  });

  it('ADD COLUMN IF NOT EXISTS on a column that already exists is a no-op, REFERENCES included', () => {
    const g = sql(`CREATE TABLE a (id uuid); CREATE TABLE b (id uuid, a_id uuid);
      ALTER TABLE b ADD COLUMN IF NOT EXISTS a_id uuid REFERENCES a(id) ON DELETE CASCADE;`);
    expect(g.edges).toEqual([]);
    expect(g.declarations).toBe(g.referenceTokens); // still accounted for
    const fresh = sql(`CREATE TABLE a (id uuid); CREATE TABLE b (id uuid);
      ALTER TABLE b ADD COLUMN IF NOT EXISTS a_id uuid REFERENCES a(id) ON DELETE CASCADE;`);
    expect(keys(fresh)).toEqual(['b.a_id->a CASCADE']);
  });

  it('a migration directory that cannot be read completely stops loadReferrers before anything else', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'p1509-mig-'));
    try {
      writeFileSync(path.join(dir, '001.sql'), `CREATE TABLE a (id uuid);
        DO $$ BEGIN EXECUTE format('ALTER TABLE %I ADD COLUMN x uuid REFERENCES a(id)', 'b'); END $$;`);
      expect(() => loadReferrers(dir)).toThrow(SeedGuardError);
      expect(() => loadReferrers(dir)).toThrow(/cannot vouch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tracks update triggers: OF lists, CREATE OR REPLACE, and drops', () => {
    const g = sql(`CREATE TABLE t (a uuid, b uuid);
      CREATE TRIGGER t1 BEFORE UPDATE OF a, b ON t FOR EACH ROW EXECUTE FUNCTION f();
      CREATE TRIGGER t2 AFTER INSERT OR UPDATE ON t FOR EACH ROW EXECUTE FUNCTION f();
      CREATE OR REPLACE TRIGGER t3 BEFORE DELETE ON t FOR EACH ROW EXECUTE FUNCTION f();
      CREATE TRIGGER t4 BEFORE UPDATE ON t FOR EACH ROW EXECUTE FUNCTION f();
      DROP TRIGGER IF EXISTS t4 ON t;`);
    expect(g.updateTriggers.map((t) => `${t.timing} ${t.name} ${t.ofColumns?.join('+') ?? 'any'}`).sort()).toEqual(['AFTER t2 any', 'BEFORE t1 a+b']);
    expect(triggersTouching(g, 't', 'a').map((t) => t.name).sort()).toEqual(['t1', 't2']);
    expect(triggersTouching(g, 't', 'c').map((t) => t.name)).toEqual(['t2']);
  });
});

describe('agreement partner guard', () => {
  const emails = PERSONA_IDS.map((id) => personaEmail(id));

  it('counts persona-created agreements whose partner is a real account or a real address', async () => {
    const { db, calls } = fakeDb(() => ({ count: 2 }));
    const out = await agreementPartnerGuard(db, U);
    expect(out.length).toBe(1);
    expect(out[0]?.count).toBe(2);
    const call = calls[0] as Call;
    expect(call.table).toBe('clarity_agreements');
    expect(call.filters).toContainEqual(['in', 'creator_profile_id', U]);
    const or = call.filters.find((f) => f[0] === 'or')?.[1] as string;
    expect(or).toContain(`partner_profile_id.not.is.null`);
    expect(or).toContain(`partner_profile_id.not.in.(${U.join(',')})`);
    expect(or).toContain(`partner_email.not.in.(${emails.join(',')})`);
  });

  it('is clean when every partner is a persona', async () => {
    const { db } = fakeDb(() => ({ count: 0 }));
    expect(await agreementPartnerGuard(db, U)).toEqual([]);
  });

  it('runs inside the preflight, so reset aborts before deleting', async () => {
    const { db } = fakeDb((c) => (c.table === 'clarity_agreements' && c.opts?.['head'] ? { count: 1 } : standard()(c)));
    const problems = await cascadePreflight(db, U, referrers);
    expect(problems.map((p) => p.edge)).toContain('clarity_agreements.creator_profile_id (deleted by the reset)');
  });

  it('a missing count is an error, never zero', async () => {
    const { db } = fakeDb(() => ({ count: null }));
    await expect(agreementPartnerGuard(db, U)).rejects.toThrow(/no row count/);
    const { db: db2 } = fakeDb((c) => (c.opts?.['head'] && c.table === 'event_rsvps' ? { count: null } : standard()(c)));
    await expect(cascadePreflight(db2, U, referrers)).rejects.toThrow(/no row count/);
  });

  it('does nothing without personas', async () => {
    const { db, calls } = fakeDb(() => ({ count: 9 }));
    expect(await agreementPartnerGuard(db, [])).toEqual([]);
    expect(calls.length).toBe(0);
  });
});
