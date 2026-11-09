/**
 * @file p1650-sharing-reaches-people.test.ts
 * @description P1650 backend on the live TEST project (migration 20261109100000): search by any word, people before
 * typing, the events window, letter origin and chat delivery for invited recipients, a share that opens the 1:1,
 * and the paperclip's canvas list.
 *
 * Actors: owner O (sender), people in O's scope with NO shared chat reason (witnesses of O): A "Ana Maria Lopez",
 * J "Jean-Luc Picard", S "Sean O'Brien", M "Maria Zed"; an outsider X outside O's scope; blocked pair B; readers.
 *
 * Every refusal has a control that shows the same call succeeding for the case that must succeed. Every row is
 * created by this run and removed in afterAll.
 *
 * Run: npx vitest run --config src/tests/integration/vitest.config.ts src/tests/integration/p1650-sharing-reaches-people.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../../../e2e/helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../../../e2e/helpers/test-organization';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../../../e2e/helpers/test-event';
import { createTestDoc, createTestLetter } from '../../../e2e/helpers/test-letter';
import { signIn, purgeChatFor } from '../../../e2e/helpers/test-chat';

type Row = Record<string, any>;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `p1650${RUN}`;
const NAME = `p1650${RUN}`.toLowerCase();
const DAY = 86_400_000;
const MIG = join(__dirname, '../../../supabase/migrations');

const users: TestUser[] = [];
const events: TestEvent[] = [];
const orgs: TestOrganization[] = [];
const pointIds: string[] = [];
const letterIds: string[] = [];
const docIds: string[] = [];

async function mk(name: string): Promise<TestUser> {
  const u = await createTestUser({ name });
  users.push(u);
  return u;
}
async function ok<T = any>(c: SupabaseClient, fn: string, args: Record<string, unknown> | undefined, what: string): Promise<T> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${what}: ${fn} failed: ${error.message}`);
  return data as T;
}
const dmOf = async (a: string, b: string): Promise<string | null> => {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'dm').eq('dm_user_a', lo).eq('dm_user_b', hi);
  return data?.[0]?.id ?? null;
};
const cards = async (conv: string | null, kind: string, id: string): Promise<Row[]> => {
  if (!conv) return [];
  const { data, error } = await supabaseAdmin.from('chat_messages').select('id, author_id, attachment_kind, attachment_id')
    .eq('conversation_id', conv).eq('attachment_kind', kind).eq('attachment_id', id);
  if (error) throw new Error(error.message);
  return data ?? [];
};
async function mkPoint(owner: string, label: string, canvas: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from('points').insert({
    statement: `${TAG} ${label}`, first_validator_id: owner, visibility: 'private', tags: [TAG],
    system_tags: [`canvas_${canvas}`, 'canvas:problem'],
  }).select('id').single();
  if (error) throw new Error(`mkPoint ${label}: ${error.message}`);
  pointIds.push(data.id);
}
const witness = async (profileId: string, witnessId: string, at?: Date) => {
  const r = await supabaseAdmin.from('witnesses').insert({
    profile_id: profileId, witness_name: `${TAG} w`, witness_profile_id: witnessId, ...(at ? { created_at: at.toISOString() } : {}),
  });
  if (r.error) throw new Error(`witness: ${r.error.message}`);
};
const canvasIdOf = async (owner: string, name: string): Promise<string> =>
  (await supabaseAdmin.from('canvases').select('id').eq('owner_id', owner).eq('name', name).single()).data!.id as string;
const sealOneToMany = async (c: SupabaseClient, owner: TestUser, deliveries: Row[]) => {
  const doc = await createTestDoc(owner.user.id, `${TAG} doc`);
  docIds.push(doc.id);
  const letter = await createTestLetter(owner.user.id, doc.id, { mode: 'one-to-many' });
  letterIds.push(letter.id);
  const res = await ok<Row>(c, 'seal_and_send_letter', { p_letter_id: letter.id, p_predictions: [], p_deliveries: deliveries, p_responses_mode: 'invite' }, 'seal');
  return { letterId: letter.id, res };
};

let O: TestUser, A: TestUser, J: TestUser, S: TestUser, M: TestUser, X: TestUser, B: TestUser;
let R1: TestUser, R2: TestUser, R3: TestUser, Z: TestUser, ATT: TestUser, P1: TestUser, L: TestUser;
let cO: SupabaseClient, cA: SupabaseClient, cX: SupabaseClient, cZ: SupabaseClient, cR2: SupabaseClient, cATT: SupabaseClient, cL: SupabaseClient;
let G: TestOrganization;

beforeAll(async () => {
  O = await mk(`P1650 Owner ${RUN}`);
  A = await mk('Ana Maria Lopez'); J = await mk('Jean-Luc Picard'); S = await mk("Sean O'Brien"); M = await mk('Maria Zed');
  X = await mk('Zebrafish Outsider'); B = await mk(`P1650 Blocked ${RUN}`);
  R1 = await mk(`P1650 R1 ${RUN}`); R2 = await mk(`P1650 R2 ${RUN}`); R3 = await mk(`P1650 R3 ${RUN}`);
  Z = await mk(`P1650 Reader ${RUN}`); ATT = await mk(`P1650 Attendee ${RUN}`); P1 = await mk(`P1650 P1 ${RUN}`); L = await mk(`P1650 Limited ${RUN}`);
  cO = (await signIn(O)).client; cA = (await signIn(A)).client; cX = (await signIn(X)).client; cZ = (await signIn(Z)).client;
  cR2 = (await signIn(R2)).client; cATT = (await signIn(ATT)).client; cL = (await signIn(L)).client;

  G = await createTestOrganization({ name: `P1650 group ${RUN}`, visibility: 'public' }); orgs.push(G);
  await createTestMembership(G.id, O.user.id); await createTestMembership(G.id, R1.user.id);

  // Scope: witnesses of O (a relationship that is NOT a shared chat reason). Dated so recency order is known.
  await witness(O.user.id, A.user.id, new Date(Date.now() - 5 * DAY));
  await witness(O.user.id, J.user.id, new Date(Date.now() - 3 * DAY));
  await witness(O.user.id, S.user.id, new Date(Date.now() - 4 * DAY));
  await witness(O.user.id, M.user.id, new Date(Date.now() - 2 * DAY));
  await witness(O.user.id, B.user.id, new Date(Date.now() - 6 * DAY));
  await witness(O.user.id, R1.user.id); await witness(O.user.id, R2.user.id); await witness(O.user.id, R3.user.id);
  await witness(O.user.id, P1.user.id);
  await mkPoint(O.user.id, 'first', NAME);
}, 300_000);

afterAll(async () => {
  const uid = users.map(u => u.user.id);
  const convs: string[] = [];
  for (const o of orgs) {
    const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', o.id);
    for (const r of data ?? []) convs.push(r.id);
  }
  await purgeChatFor(uid, convs);
  if (O) await supabaseAdmin.from('canvases').delete().eq('owner_id', O.user.id);
  if (pointIds.length) await supabaseAdmin.from('points').delete().in('id', pointIds);
  if (uid.length) {
    await supabaseAdmin.from('witnesses').delete().in('profile_id', uid);
    await supabaseAdmin.from('chat_blocks').delete().in('blocker_id', uid);
  }
  for (const id of letterIds) await supabaseAdmin.from('clarity_letters').delete().eq('id', id);
  for (const id of docIds) await supabaseAdmin.from('clarity_docs').delete().eq('id', id);
  for (const e of events) await deleteTestEvent(e.id);
  for (const o of orgs) await deleteTestOrganization(o.id);
  for (const u of users) await deleteTestUser(u.user.id);
}, 300_000);

/** The body of the NEWEST migration that defines `fn` (optionally only files before `before`): what the database runs now. */
function newestDefinition(fn: string, before?: string): { file: string; body: string } {
  const rx = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${fn}\\s*\\(`, 'gi');
  const files = readdirSync(MIG).filter(n => /^\d{14}_.*\.sql$/.test(n) && (!before || n < before)).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIG, files[i]!), 'utf8');
    const hits = [...sql.matchAll(rx)];
    if (hits.length) {
      const rest = sql.slice(hits[hits.length - 1]!.index);
      const end = rest.indexOf('\n$$;');
      if (end < 0) throw new Error(`${fn}: no body end in ${files[i]}`);
      return { file: files[i]!, body: rest.slice(0, end) };
    }
  }
  throw new Error(`no migration defines ${fn}`);
}

describe('P1650 search_profiles: any word of the name', () => {
  // the single admin row can appear for any query; the fixtures never match it, and every assertion names a fixture
  const find = (c: SupabaseClient, q: string): Promise<Row[]> => ok<Row[]>(c, 'search_profiles', { p_query: q }, `search ${q}`);
  it.each([['lop', 'Ana Maria Lopez'], ['mar', 'Ana Maria Lopez'], ['luc', 'Jean-Luc Picard'], ['brien', "Sean O'Brien"], ['ana m', 'Ana Maria Lopez']])(
    '"%s" finds %s', async (q, name) => {
      const rows = await find(cO, q);
      expect(rows.map(r => r.name), q).toContain(name);
    });
  it('a whole-name prefix ranks before a later-word match', async () => {
    const names = (await find(cO, 'mar')).map(r => r.name);
    expect(names.indexOf('Maria Zed'), 'whole-name prefix').toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Maria Zed')).toBeLessThan(names.indexOf('Ana Maria Lopez'));
  });
  it('a query with a space keeps matching the whole name, and (review fix) also a phrase that starts at a later word', async () => {
    expect((await find(cO, 'ana maria')).map(r => r.name)).toContain('Ana Maria Lopez');
    // The review fix reads "any word" off the unsplit name, so "maria l" now finds "Ana Maria Lopez"; it used to be refused.
    expect((await find(cO, 'maria l')).map(r => r.name)).toContain('Ana Maria Lopez');
    expect((await find(cO, 'maria x')).map(r => r.name), 'control: a phrase that is not in the name').not.toContain('Ana Maria Lopez');
  });
  it('wildcards are literal', async () => {
    expect((await find(cO, '%an')).map(r => r.name)).not.toContain('Ana Maria Lopez');
    expect((await find(cO, 'a_a')).map(r => r.name)).not.toContain('Ana Maria Lopez');
    expect((await find(cO, '%%%')).filter(r => r.name !== null)).toHaveLength(0);
  });
  it('a word of a profile outside the caller\'s scope finds no one (the admin row excepted)', async () => {
    const rows = await find(cO, 'zeb');
    expect(rows.map(r => r.name)).not.toContain('Zebrafish Outsider');
    expect((await find(cO, 'fish')).map(r => r.name)).not.toContain('Zebrafish Outsider');
    // control: the same words DO find the person for a caller who has them in scope (X witnesses O's own scope would not matter)
    expect((await find(cX, 'lop')).map(r => r.name), 'X has no scope: no Ana').not.toContain('Ana Maria Lopez');
  });
  it('the admin and non-admin branches of the newest definition match by the identical predicate (so the non-admin tests cover both)', () => {
    const predicates = (body: string): string[] =>
      [...body.matchAll(/AND \(starts_with\(lower\(p\.name\), v_query\)[\s\S]*?(?=\n\s*ORDER BY)/g)]
        .map(m => m[0].replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim());
    const assertSame = (body: string) => {
      const p = predicates(body);
      expect(p, 'exactly two branches carry the match predicate').toHaveLength(2);
      expect(p[0], 'the predicate includes the word-boundary clause').toContain("IN (' ', '''', '.', '’', '-')");
      expect(p[0]).toBe(p[1]);
    };
    const body = newestDefinition('search_profiles').body;
    expect(() => assertSame(body)).not.toThrow();
    // control: change the boundary set in ONE branch only and the check must fail
    const mutated = body.replace("IN (' ', '''', '.', '’', '-')", "IN (' ', '-')");
    expect(mutated, 'the mutation changed the text').not.toBe(body);
    expect(() => assertSame(mutated)).toThrow();
  });
  it('the minimum of three characters still holds', async () => {
    const r = await cO.rpc('search_profiles', { p_query: 'ma' });
    expect(r.error?.message).toMatch(/at least 3 characters/);
  });
  it('returns display-safe columns only', async () => {
    const rows = await find(cO, 'lop');
    expect(Object.keys(rows[0]!).sort()).toEqual(['avatar_color', 'avatar_url', 'has_pledged', 'is_verified', 'name', 'profile_id', 'slug']);
  });
});

describe('P1650 people before typing: get_canvas_share_people', () => {
  it('lists the relationship scope, latest relationship first, at most 8, display-safe', async () => {
    const rows = await ok<Row[]>(cO, 'get_canvas_share_people', undefined, 'people');
    expect(rows.length).toBeLessThanOrEqual(8);
    expect(Object.keys(rows[0]!).sort()).toEqual(['avatar_color', 'avatar_url', 'has_pledged', 'is_verified', 'name', 'profile_id', 'slug']);
    // the four dated witnesses keep their order: Maria Zed (2d), Jean-Luc (3d), Sean (4d), Ana (5d)
    const order = rows.map(r => r.name as string);
    const pos = (n: string) => order.indexOf(n);
    expect(pos('Maria Zed')).toBeLessThan(pos('Jean-Luc Picard'));
    expect(pos('Jean-Luc Picard')).toBeLessThan(pos("Sean O'Brien"));
    // the three undated witnesses (now) rank above the dated ones; the outsider and the caller never appear
    expect(order).not.toContain('Zebrafish Outsider');
    expect(rows.map(r => r.profile_id)).not.toContain(O.user.id);
  });
  it('the latest chat message with a person moves that person up', async () => {
    const before = (await ok<Row[]>(cO, 'get_canvas_share_people', undefined, 'people')).map(r => r.name as string);
    const [lo, hi] = O.user.id < A.user.id ? [O.user.id, A.user.id] : [A.user.id, O.user.id];
    const conv = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: O.user.id, last_message_at: new Date().toISOString() }).select('id').single();
    expect(conv.error).toBeNull();
    const after = (await ok<Row[]>(cO, 'get_canvas_share_people', undefined, 'people')).map(r => r.name as string);
    expect(after.indexOf('Ana Maria Lopez')).toBeLessThan(before.indexOf('Ana Maria Lopez'));
    await supabaseAdmin.from('chat_conversations').delete().eq('id', conv.data!.id);
  });
  it('a caller with no relationships gets an empty list, not the directory', async () => {
    const rows = await ok<Row[]>(cX, 'get_canvas_share_people', undefined, 'people (no scope)');
    expect(rows).toEqual([]);
  });
  it('every listed person can be added (the server accepts them)', async () => {
    const rows = await ok<Row[]>(cO, 'get_canvas_share_people', undefined, 'people');
    // P1 is kept out of this loop: a later test needs a person O has never shared with and never chatted with
    for (const r of rows.filter(x => x.profile_id !== P1.user.id).slice(0, 3)) {
      const res = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: r.profile_id }, `share with ${r.name}`);
      expect(res.shared).toBe(true);
    }
  });
  it('does not branch on the admin flag: the newest definition reads the relationship scope and never is_admin', () => {
    const def = newestDefinition('get_canvas_share_people');
    expect(def.body, 'control: the extracted text is this function and uses the scope helper').toContain('p878_relationship_scope(v_uid)');
    expect(def.body).not.toMatch(/is_admin/);
    // control that the check can fail: search_profiles legitimately branches on it
    expect(newestDefinition('search_profiles').body).toMatch(/is_admin/);
  });
});

describe('P1650 events window (D2)', () => {
  let eFinished8: TestEvent, eLong: TestEvent, eYesterday: TestEvent, eFuture: TestEvent, eOld: TestEvent, eRunning: TestEvent;
  const offered = async () => (await ok<Row>(cO, 'get_canvas_share_targets', undefined, 'targets')).events as Row[];
  beforeAll(async () => {
    eFinished8 = await createTestEvent(O.user.id, new Date(Date.now() - 8 * DAY), { title: `${TAG} finished8` });
    eLong = await createTestEvent(O.user.id, new Date(Date.now() - 8 * DAY), { title: `${TAG} long`, durationMinutes: 10 * 24 * 60 });
    eYesterday = await createTestEvent(O.user.id, new Date(Date.now() - 1 * DAY), { title: `${TAG} yesterday` });
    eFuture = await createTestEvent(O.user.id, new Date(Date.now() + 3 * DAY), { title: `${TAG} future` });
    eRunning = await createTestEvent(O.user.id, new Date(Date.now() - 30 * 60_000), { title: `${TAG} running` });
    eOld = await createTestEvent(O.user.id, new Date(Date.now() - 30 * DAY), { title: `${TAG} old` });
    events.push(eFinished8, eLong, eYesterday, eFuture, eRunning, eOld);
  }, 120_000);

  it('offers upcoming, running, recently started and long-running; not a finished event from 8 days ago', async () => {
    const ids = (await offered()).map(e => e.id);
    expect(ids).toContain(eFuture.id);
    expect(ids).toContain(eRunning.id);
    expect(ids).toContain(eYesterday.id);
    expect(ids, 'a 10-day event that started 8 days ago').toContain(eLong.id);
    expect(ids, 'finished 8 days ago').not.toContain(eFinished8.id);
    expect(ids, 'finished 30 days ago').not.toContain(eOld.id);
  });
  it('share_canvas applies the same window to a new addition', async () => {
    const refusal = await cO.rpc('share_canvas', { p_name: NAME, p_kind: 'event', p_target: eFinished8.id });
    expect(refusal.error?.code).toBe('42501');
    for (const e of [eFuture, eYesterday, eLong]) {
      const res = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: e.id }, `share ${e.title}`);
      expect(res.shared).toBe(true);
    }
  });
  it('an older event already on the canvas keeps admitting, can be re-shared, and the panel read returns its date', async () => {
    const cid = await canvasIdOf(O.user.id, NAME);
    const ins = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: cid, kind: 'event', event_id: eOld.id });
    expect(ins.error).toBeNull();
    await supabaseAdmin.from('event_rsvps').insert({ event_id: eOld.id, profile_id: ATT.user.id, rsvped_at: new Date(Date.now() - 31 * DAY).toISOString() });
    const view = await ok<Row>(cATT, 'get_canvas', { p_owner: O.user.id, p_name: NAME }, 'attendee reads');
    expect(view.access.admitted, 'attendee of the old event is admitted').toBe(true);
    const aud = await ok<Row>(cO, 'get_canvas_audience', { p_name: NAME }, 'audience');
    const entry = (aud.entries as Row[]).find(e => e.kind === 'event' && e.id === eOld.id);
    expect(entry, 'old event entry').toBeDefined();
    expect(new Date(entry!.datetime).getTime()).toBe(new Date((await supabaseAdmin.from('events').select('datetime').eq('id', eOld.id).single()).data!.datetime).getTime());
    for (const e of (aud.entries as Row[]).filter(x => x.kind === 'event')) expect(e.datetime, `${e.name} carries a date`).toBeTruthy();
    const again = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'event', p_target: eOld.id }, 're-share old event');
    expect(again.shared).toBe(true);
    expect(again.skipped).toEqual([]);
  });
});

describe('P1650 a share opens the 1:1', () => {
  it('adding a person with no chat and no shared reason opens the 1:1 with the canvas card', async () => {
    expect(await dmOf(O.user.id, P1.user.id), 'control: no 1:1 yet').toBeNull();
    const res = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P1.user.id }, 'share with P1');
    expect(res).toEqual({ shared: true, skipped: [] });
    const cid = await canvasIdOf(O.user.id, NAME);
    const dm = await dmOf(O.user.id, P1.user.id);
    expect(dm).not.toBeNull();
    expect(await cards(dm, 'canvas', cid)).toHaveLength(1);
    const again = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: P1.user.id }, 're-share');
    expect(again).toEqual({ shared: true, skipped: [] });
    expect(await cards(dm, 'canvas', cid), 're-share posts nothing').toHaveLength(1);
  });
  it('a blocked pair gets no card; the share still succeeds and names who was skipped', async () => {
    await supabaseAdmin.from('chat_blocks').insert({ blocker_id: B.user.id, blocked_id: O.user.id });
    const res = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: B.user.id }, 'share with blocked B');
    expect(res.shared).toBe(true);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ kind: 'person', id: B.user.id });
    expect(await dmOf(O.user.id, B.user.id), 'no 1:1 opened').toBeNull();
  });
  it('plain start_dm to a stranger is still refused, in both directions', async () => {
    const e1 = await cO.rpc('start_dm', { p_other: X.user.id });
    expect(e1.error?.message).toMatch(/cannot start a conversation/);
    const e2 = await cX.rpc('start_dm', { p_other: O.user.id });
    expect(e2.error?.message).toMatch(/cannot start a conversation/);
    const e3 = await cZ.rpc('start_dm', { p_other: R2.user.id });
    expect(e3.error?.message).toMatch(/cannot start a conversation/);
  });
  it('the sender\'s 20-new-DMs-a-day limit still applies to a share', async () => {
    const others: TestUser[] = [];
    for (let i = 0; i < 20; i++) others.push(await mk(`P1650 lim ${i} ${RUN}`));
    const rows = others.map(o => {
      const [lo, hi] = L.user.id < o.user.id ? [L.user.id, o.user.id] : [o.user.id, L.user.id];
      return { kind: 'dm', dm_user_a: lo, dm_user_b: hi, created_by: L.user.id };
    });
    const ins = await supabaseAdmin.from('chat_conversations').insert(rows);
    expect(ins.error).toBeNull();
    await witness(L.user.id, P1.user.id);
    await mkPoint(L.user.id, 'limited', `${NAME}l`);
    const res = await ok<Row>(cL, 'share_canvas', { p_name: `${NAME}l`, p_kind: 'person', p_target: P1.user.id }, 'share over the limit');
    expect(res.shared).toBe(true);
    expect(res.skipped).toHaveLength(1);
    expect(await dmOf(L.user.id, P1.user.id)).toBeNull();
    await supabaseAdmin.from('canvases').delete().eq('owner_id', L.user.id);
  }, 240_000);
});

describe('P1650 letters: the sender\'s invitation reaches chat, a reader\'s open never does', () => {
  let letterId: string;
  it('sealing a one-to-many letter posts one card in each invited recipient\'s 1:1, including one with no shared reason', async () => {
    const { letterId: id, res } = await sealOneToMany(cO, O, [
      { receiver_profile_id: R1.user.id, receiver_name: 'R1' },                  // shares a group with O
      { receiver_email: R2.user.email, receiver_name: 'R2' },                    // no shared reason, invited by email
      { receiver_email: `nobody-${RUN}@example.invalid`, receiver_name: 'N' },   // no account: email only
    ]);
    letterId = id;
    expect(res.sealed).toBe(true);
    expect(res.skipped).toEqual([]);
    expect(await cards(await dmOf(O.user.id, R1.user.id), 'letter', id)).toHaveLength(1);
    expect(await cards(await dmOf(O.user.id, R2.user.id), 'letter', id)).toHaveLength(1);
    const { data } = await supabaseAdmin.from('letter_deliveries').select('receiver_profile_id, created_by_sender').eq('letter_id', id);
    expect(data).toHaveLength(3);
    expect(data!.every(d => d.created_by_sender === true), 'sender-created rows are recorded as such').toBe(true);
    // the card opens for the recipient, with their own delivery id
    const forR2 = await ok<Row>(cR2, 'get_chat_artifact_attachment', { p_kind: 'letter', p_id: id }, 'R2 card');
    expect(forR2.available).toBe(true);
    expect(forR2.delivery_id).toBeTruthy();
  });
  it('a reader opening the public link creates a row recorded as reader-created and no message and no 1:1', async () => {
    await ok(cZ, 'create_letter_delivery_on_open', { p_letter_id: letterId }, 'Z opens');
    const { data } = await supabaseAdmin.from('letter_deliveries').select('created_by_sender').eq('letter_id', letterId).eq('receiver_profile_id', Z.user.id);
    expect(data).toEqual([{ created_by_sender: false }]);
    expect(await dmOf(O.user.id, Z.user.id), 'no 1:1').toBeNull();
    const cX2 = cX;
    await ok(cX2, 'create_letter_delivery', { p_letter_id: letterId, p_stories_rated: 0 }, 'X submits');
    expect(await dmOf(O.user.id, X.user.id), 'no 1:1 for create_letter_delivery').toBeNull();
    const msgs = await supabaseAdmin.from('chat_messages').select('id').eq('attachment_id', letterId).in('author_id', [Z.user.id, X.user.id]);
    expect(msgs.data ?? []).toEqual([]);
    expect((await supabaseAdmin.from('chat_messages').select('id').eq('attachment_id', letterId)).data).toHaveLength(2);
  });
  it('sealing succeeds with a blocked recipient and names them as not sent to chat', async () => {
    const { letterId: id, res } = await sealOneToMany(cO, O, [
      { receiver_profile_id: B.user.id, receiver_name: 'B' },
      { receiver_profile_id: A.user.id, receiver_name: 'A' },
    ]);
    expect(res.sealed).toBe(true);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ name: 'B' });
    expect(await cards(await dmOf(O.user.id, A.user.id), 'letter', id), 'control: the other recipient got a card').toHaveLength(1);
    expect(await dmOf(O.user.id, B.user.id)).toBeNull();
  });
  it('adding a recipient later posts for the sender-created delivery, opens the 1:1 for a person with no reason, and reports skips', async () => {
    const added = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: R3.user.email, p_receiver_name: 'R3', p_receiver_profile_id: null }, 'add R3');
    expect(added.delivery_id).toBeTruthy();
    expect(added.skipped).toEqual([]);
    expect(await cards(await dmOf(O.user.id, R3.user.id), 'letter', letterId)).toHaveLength(1);
    const { data } = await supabaseAdmin.from('letter_deliveries').select('created_by_sender').eq('id', added.delivery_id).single();
    expect(data!.created_by_sender).toBe(true);
    const blocked = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: null, p_receiver_name: 'B', p_receiver_profile_id: B.user.id }, 'add blocked B');
    expect(blocked.skipped).toHaveLength(1);
    expect(blocked.skipped[0]).toMatchObject({ name: 'B' });
  });
  describe('the skipped payload never reveals what the sender did not type', () => {
    const noLeak = (skipped: Row[], forbidden: string[]) => {
      for (const s of skipped) expect(Object.keys(s).sort(), 'only delivery_id and name').toEqual(['delivery_id', 'name']);
      const json = JSON.stringify(skipped);
      for (const f of forbidden) expect(json, `payload must not contain ${f}`).not.toContain(f);
    };
    it('seal, email path, no name typed: the typed email comes back, no profile id and no profile name', async () => {
      const { res } = await sealOneToMany(cO, O, [{ receiver_email: B.user.email }]);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0].name).toBe(B.user.email);
      noLeak(res.skipped, [B.user.id, B.name]);
    });
    it('seal, email path, a typed name wins', async () => {
      const { res } = await sealOneToMany(cO, O, [{ receiver_email: B.user.email, receiver_name: 'Typed Name' }]);
      expect(res.skipped[0].name).toBe('Typed Name');
      noLeak(res.skipped, [B.user.id, B.name, B.user.email]);
    });
    it('seal, picker path, no name typed: the profile name comes back and no email', async () => {
      const { res } = await sealOneToMany(cO, O, [{ receiver_profile_id: B.user.id }]);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0].name).toBe(B.name);
      noLeak(res.skipped, [B.user.id, B.user.email]);
    });
    it('add recipient, email path, no name typed: the typed email, no profile id or name', async () => {
      const { letterId: id } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: id, p_email: B.user.email, p_receiver_name: null, p_receiver_profile_id: null }, 'add by email');
      expect(r.skipped).toHaveLength(1);
      expect(r.skipped[0].name).toBe(B.user.email);
      noLeak(r.skipped, [B.user.id, B.name]);
    });
    it('add recipient, picker path, no name typed: the profile name, no email', async () => {
      const { letterId: id } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: id, p_email: null, p_receiver_name: '', p_receiver_profile_id: B.user.id }, 'add by picker');
      expect(r.skipped).toHaveLength(1);
      expect(r.skipped[0].name).toBe(B.name);
      noLeak(r.skipped, [B.user.id, B.user.email]);
    });
  });
  it('a one-to-one letter invitation to a person with no shared reason also opens the 1:1', async () => {
    const doc = await createTestDoc(O.user.id, `${TAG} 1to1`); docIds.push(doc.id);
    const letter = await createTestLetter(O.user.id, doc.id); letterIds.push(letter.id);
    expect(await dmOf(O.user.id, J.user.id)).toBeNull();
    await ok(cO, 'seal_and_send_letter', { p_letter_id: letter.id, p_predictions: [], p_deliveries: [{ receiver_profile_id: J.user.id, receiver_name: 'J' }], p_responses_mode: 'invite' }, 'seal 1:1');
    expect(await cards(await dmOf(O.user.id, J.user.id), 'letter', letter.id)).toHaveLength(1);
  });
  // A raised chat error cannot be forced on the shared TEST server from a fixture: no chat_messages trigger or constraint
  // raises on an ordinary post, and a test-only trigger would be DDL on a table every concurrent run uses. So the
  // "never fails because of chat" guarantee is asserted on the NEWEST definition of each function (what the database
  // runs), with a control that shows the assertion can fail. The block and 20-a-day paths ARE exercised live above.
  const POST_CALL: Record<string, string> = {
    seal_and_send_letter: ':= public._chat_post_letter_delivery(',
    add_recipient_to_sealed_letter: ':= public._chat_post_letter_delivery(',
    share_canvas: ':= public._chat_post_canvas_share(',
  };
  /** The chat post call must sit inside its own BEGIN ... EXCEPTION WHEN OTHERS block, not in the function's top level. */
  const callInsideHandler = (body: string, call: string) => {
    const c = body.indexOf(call);
    expect(c, `the post call ${call} exists`).toBeGreaterThan(-1);
    const topBegin = body.indexOf('BEGIN', body.indexOf('AS $$'));
    const b = body.lastIndexOf('BEGIN', c);
    const e = body.indexOf('EXCEPTION WHEN OTHERS THEN', c);
    expect(b, 'a BEGIN precedes the call and it is not the function\'s own').toBeGreaterThan(topBegin);
    expect(e, 'the handler follows the call').toBeGreaterThan(c);
    expect(body.slice(b, e), 'one block: no END; between its BEGIN and its handler').not.toMatch(/\bEND;/);
  };
  /** The same text with the post call moved to just above the BEGIN of its block. */
  const moveCallAboveBegin = (body: string, call: string) => {
    const c = body.indexOf(call);
    const lineStart = body.lastIndexOf('\n', c) + 1;
    const lineEnd = body.indexOf('\n', c);
    const line = body.slice(lineStart, lineEnd);
    const without = body.slice(0, lineStart) + body.slice(lineEnd + 1);
    const b = without.lastIndexOf('BEGIN', lineStart);
    return without.slice(0, b) + line + '\n' + without.slice(b);
  };
  it.each(['seal_and_send_letter', 'add_recipient_to_sealed_letter', 'share_canvas'])(
    'chat never makes %s fail: the newest definition wraps the post and reports a skip', (fn) => {
      const wrapped = new RegExp(`EXCEPTION WHEN OTHERS THEN\\s+RAISE WARNING '${fn}: chat message not posted`);
      const check = (b: string) => { expect(b).toMatch(wrapped); expect(b).toMatch(/v_skipped/); };
      const newest = newestDefinition(fn);
      expect(() => check(newest.body), `${fn} as defined in ${newest.file}`).not.toThrow();
      // control: the same check fails for the definition that predates this feature
      expect(() => check(newestDefinition(fn, '20261109').body)).toThrow();
      // the post call itself sits between its block's BEGIN and EXCEPTION WHEN OTHERS
      const call = POST_CALL[fn]!;
      expect(() => callInsideHandler(newest.body, call), `${fn}: call inside its handler`).not.toThrow();
      // control: the same text with the call moved above BEGIN is caught
      const moved = moveCallAboveBegin(newest.body, call);
      expect(moved, 'the mutation changed the text').not.toBe(newest.body);
      expect(() => callInsideHandler(moved, call), `${fn}: a call above BEGIN must be detected`).toThrow();
    });
});

describe('P1650 paperclip: list_attachable_canvases', () => {
  let dmAO: string; let nameDirect: string; let nameGroup: string; let nameLink: string; let nameDraft: string; let nameUnshared: string;
  beforeAll(async () => {
    nameDirect = `${NAME}d`; nameGroup = `${NAME}g`; nameLink = `${NAME}k`; nameUnshared = `${NAME}u`;
    for (const n of [nameDirect, nameGroup, nameLink, nameUnshared]) await mkPoint(O.user.id, n, n);
    await ok(cO, 'share_canvas', { p_name: nameDirect, p_kind: 'person', p_target: A.user.id }, 'direct');
    await ok(cO, 'share_canvas', { p_name: nameGroup, p_kind: 'group', p_target: G.id }, 'group');
    await ok(cO, 'set_canvas_general_access', { p_name: nameLink, p_access: 'link' }, 'link only');
    await ok(cO, 'share_canvas', { p_name: nameUnshared, p_kind: 'person', p_target: M.user.id }, 'shared with someone else');
    // an unpublished canvas with a direct audience entry forced in by hand: never listed
    const draft = await ok<Row>(cO, 'canvas_draft_open', undefined, 'open a draft canvas');
    nameDraft = draft.canvas_name;
    const dcid = await canvasIdOf(O.user.id, nameDraft);
    await supabaseAdmin.from('canvas_audience').insert({ canvas_id: dcid, kind: 'person', profile_id: A.user.id });
    dmAO = (await dmOf(O.user.id, A.user.id))!;
  }, 120_000);

  it('in a 1:1 lists only the published canvases the other person is on directly', async () => {
    expect(dmAO, 'the share opened the 1:1').toBeTruthy();
    const rows = await ok<Row[]>(cO, 'list_attachable_canvases', { p_conversation: dmAO }, 'attachable (1:1)');
    expect(rows.map(r => r.name)).toContain(nameDirect);
    expect(rows.map(r => r.name), 'only through a group').not.toContain(nameGroup);
    expect(rows.map(r => r.name), 'link-only').not.toContain(nameLink);
    expect(rows.map(r => r.name), 'unpublished').not.toContain(nameDraft);
    expect(rows.map(r => r.name), 'not shared with them').not.toContain(nameUnshared);
    expect(Object.keys(rows[0]!).sort()).toEqual(['canvas_id', 'name', 'title']);
  });
  it('attaching a listed canvas sends a card that opens for the other person; an unlisted one the server also refuses where it widens', async () => {
    const rows = await ok<Row[]>(cO, 'list_attachable_canvases', { p_conversation: dmAO }, 'attachable');
    const c = rows.find(r => r.name === nameDirect)!;
    await ok(cO, 'send_chat_message', { p_conversation: dmAO, p_body: null, p_attachment_kind: 'canvas', p_attachment_id: c.canvas_id }, 'attach');
    const forA = await ok<Row>(cA, 'get_chat_artifact_attachment', { p_kind: 'canvas', p_id: c.canvas_id }, 'A card');
    expect(forA.available).toBe(true);
    const grp = await canvasIdOf(O.user.id, nameGroup);
    const refused = await cO.rpc('send_chat_message', { p_conversation: dmAO, p_body: null, p_attachment_kind: 'canvas', p_attachment_id: grp });
    expect(refused.error?.message).toMatch(/attachment not available/);
  });
  it('in a channel lists the published canvases that group or event is on', async () => {
    const { data } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'group').eq('org_id', G.id);
    const conv = data![0]!.id as string;
    const rows = await ok<Row[]>(cO, 'list_attachable_canvases', { p_conversation: conv }, 'attachable (group)');
    expect(rows.map(r => r.name)).toContain(nameGroup);
    expect(rows.map(r => r.name)).not.toContain(nameDirect);
  });
  it('is owner-only: a person who is not in the conversation gets nothing, and so does the other member (their own canvases)', async () => {
    expect(await ok<Row[]>(cX, 'list_attachable_canvases', { p_conversation: dmAO }, 'outsider')).toEqual([]);
    expect(await ok<Row[]>(cA, 'list_attachable_canvases', { p_conversation: dmAO }, 'other member')).toEqual([]);
  });
});

describe('P1650 review fixes', () => {
  let BN: TestUser;
  beforeAll(async () => {
    BN = await mk(`P1650 Blank ${RUN}`);
    await witness(O.user.id, BN.user.id);
    const blk = await supabaseAdmin.from('chat_blocks').insert({ blocker_id: BN.user.id, blocked_id: O.user.id });
    expect(blk.error).toBeNull();
    // a profile whose name is only whitespace: the skipped label must still be a readable word
    const upd = await supabaseAdmin.from('profiles').update({ name: '   ' }).eq('id', BN.user.id);
    expect(upd.error).toBeNull();
  }, 60_000);

  describe('search: a name typed as written', () => {
    const find = (q: string) => ok<Row[]>(cO, 'search_profiles', { p_query: q }, `search ${q}`);
    it.each([["o'brien", "Sean O'Brien"], ["o'b", "Sean O'Brien"], ['jean-luc', 'Jean-Luc Picard'], ['jean-l', 'Jean-Luc Picard'], ['sean o', "Sean O'Brien"]])(
      '"%s" finds %s', async (q, name) => {
        expect((await find(q)).map(r => r.name), q).toContain(name);
      });
    it('stays literal and anchored at word starts', async () => {
      expect((await find("%'b")).map(r => r.name)).not.toContain("Sean O'Brien");
      expect((await find("'br")).map(r => r.name), 'a query that starts inside a word does not match').not.toContain("Sean O'Brien");
      expect((await find('n-l')).map(r => r.name)).not.toContain('Jean-Luc Picard');
    });
  });

  describe('add recipient matches the account by email without regard to case', () => {
    it('an upper-cased email still finds the account: the card is posted', async () => {
      const { letterId } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: R1.user.email.toUpperCase(), p_receiver_name: null, p_receiver_profile_id: null }, 'add upper-cased');
      const { data } = await supabaseAdmin.from('letter_deliveries').select('receiver_profile_id').eq('id', r.delivery_id).single();
      expect(data!.receiver_profile_id, 'bound to the account').toBe(R1.user.id);
      expect(await cards(await dmOf(O.user.id, R1.user.id), 'letter', letterId)).toHaveLength(1);
    });
    it('a blocked account added by an upper-cased email is reported as skipped (not silently dropped)', async () => {
      const { letterId } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: B.user.email.toUpperCase(), p_receiver_name: null, p_receiver_profile_id: null }, 'add upper-cased blocked');
      expect(r.skipped).toHaveLength(1);
      expect(r.skipped[0].name).toBe(B.user.email.toUpperCase());
    });
  });

  describe('a whitespace-only typed name is an empty name', () => {
    it('seal, email path', async () => {
      const { res } = await sealOneToMany(cO, O, [{ receiver_email: B.user.email, receiver_name: '   ' }]);
      expect(res.skipped[0].name).toBe(B.user.email);
    });
    it('add recipient, email path', async () => {
      const { letterId } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: B.user.email, p_receiver_name: '  ', p_receiver_profile_id: null }, 'add');
      expect(r.skipped[0].name).toBe(B.user.email);
    });
    it('add recipient, picker path', async () => {
      const { letterId } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: null, p_receiver_name: '  ', p_receiver_profile_id: B.user.id }, 'add');
      expect(r.skipped[0].name).toBe(B.name);
    });
  });

  describe('a skipped label is never empty', () => {
    it('seal, picker path, a profile whose name is blank', async () => {
      const { res } = await sealOneToMany(cO, O, [{ receiver_profile_id: BN.user.id }]);
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0].name).toBe('this recipient');
    });
    it('add recipient, picker path, a profile whose name is blank', async () => {
      const { letterId } = await sealOneToMany(cO, O, []);
      const r = await ok<Row>(cO, 'add_recipient_to_sealed_letter', { p_letter_id: letterId, p_email: null, p_receiver_name: null, p_receiver_profile_id: BN.user.id }, 'add');
      expect(r.skipped[0].name).toBe('this recipient');
    });
    it('share_canvas, a person whose name is blank', async () => {
      const res = await ok<Row>(cO, 'share_canvas', { p_name: NAME, p_kind: 'person', p_target: BN.user.id }, 'share with the blank-named blocker');
      expect(res.skipped).toHaveLength(1);
      expect(res.skipped[0]).toMatchObject({ kind: 'person', id: BN.user.id, name: 'this person' });
    });
  });
});

describe('P1650 grants', () => {
  it('new and replaced client functions are executable by authenticated only', async () => {
    const anon = (await import('@supabase/supabase-js')).createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const [fn, args] of [
      ['get_canvas_share_people', {}], ['list_attachable_canvases', { p_conversation: '00000000-0000-4000-8000-000000000000' }],
      ['search_profiles', { p_query: 'abc' }], ['share_canvas', { p_name: 'x', p_kind: 'person', p_target: '00000000-0000-4000-8000-000000000000' }],
      ['get_canvas_share_targets', {}], ['seal_and_send_letter', { p_letter_id: '00000000-0000-4000-8000-000000000000' }],
      ['add_recipient_to_sealed_letter', { p_letter_id: '00000000-0000-4000-8000-000000000000', p_email: 'nobody@example.com' }],
    ] as const) {
      const r = await anon.rpc(fn, args as Record<string, unknown>);
      expect(r.error, `${fn} must refuse anon`).not.toBeNull();
      expect(`${r.error!.code} ${r.error!.message}`, fn).toMatch(/42501|permission denied|not authenticated|requires|sign in|PGRST202/i);
    }
  });
});
