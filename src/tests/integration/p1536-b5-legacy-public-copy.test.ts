/**
 * P1536 3c B5, the case the API cannot seed: a draft opened from a version whose base holds a LEGACY PUBLIC canvas point.
 *   VITE_SUPABASE_URL=<hosted TEST> npx vitest run --config <integration config> src/tests/integration/p1536-b5-legacy-public-copy.test.ts
 *
 * A public point tagged for a canvas version cannot exist any more: the p1515 trigger refuses it for every role. So it is seeded the way
 * the P1515 sharing spec does it, with raw SQL through the hosted Management API (hosted TEST only, skipped by name elsewhere: P1557).
 *
 * The whole probe is ONE DO block that ends in RAISE EXCEPTION carrying its findings as JSON, so everything it did is rolled back by
 * Postgres itself, the DISABLE/ENABLE TRIGGER included (DDL is transactional). Nothing persists; the last test proves it by reading.
 * Inside it the trigger is enabled again before canvas_draft_open runs, so the opener is exercised under the real rules.
 *
 * It exercises the copy branch of _canvas_draft_new through the opener: the private copy, the owner's stance copied (another person's stance
 * on the same point is not), the owner's PRIVATE story linked to the copy (another author's story, and the owner's own non-private story,
 * are not), and the copied_from ledger.
 *
 * CONTROL (the probe can fail): the same script with the base points PRIVATE instead of public makes no copy, and the same assertion
 * function reports false for it.
 */
import { traffic } from './p1536-count-fetch';
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';
import { HOSTED_SQL_ONLY, notHostedSqlTarget, TEST_PROJECT_REFS } from '../../../e2e/helpers/e2e-namespace';

type Row = Record<string, any>;
const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1536b5legacy ${RUN}`;
const nn = (s: string) => `${TAG} ${s}`;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const TRIGGER = 'trg_p1515_canvas_points_are_private';
const T = 240_000;

/** Raw SQL on hosted TEST (Management API, the test-scoped write token). Returns the rows, or the failure text. */
async function testDb(sql: string): Promise<{ ok: boolean; status: number; rows?: Row[]; message: string }> {
  const ref = new globalThis.URL(URL_).hostname.split('.')[0]!;
  if (!TEST_PROJECT_REFS.includes(ref)) throw new Error(`refusing raw SQL against ${ref}: hosted TEST only`);
  let token = '';
  for (const root of [path.resolve(__dirname, '../../..'), path.resolve(__dirname, '../../../../../..')]) {
    const f = path.join(root, '.env.local');
    if (!fs.existsSync(f)) continue;
    const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('SUPABASE_TEST_WRITE_TOKEN='));
    if (line) { token = line.slice('SUPABASE_TEST_WRITE_TOKEN='.length).trim().replace(/^["']|["']$/g, ''); break; }
  }
  if (!token) throw new Error('SUPABASE_TEST_WRITE_TOKEN missing from .env.local');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let message = text; let rows: Row[] | undefined;
  try { const j = JSON.parse(text); if (Array.isArray(j)) rows = j; else if (j?.message) message = String(j.message); } catch { /* raw text */ }
  return { ok: res.ok, status: res.status, rows, message };
}
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * The probe: seed two legacy base points, open a draft from v1 as the owner, collect what exists, RAISE so it all rolls back.
 *   L1 (canvas:channels): the owner's stance AND another person's; the owner's private story AND another author's private story.
 *   L2 (canvas:solution): the owner's own story, but PUBLIC.
 */
function probeSql(a: { owner: string; other: string; v1Id: string; v1Name: string; story: string; s1: string; s2: string; visibility: 'public' | 'private' }): string {
  const vis = `${q(a.visibility)}::public.content_visibility`;
  const pt = (var_: string, statement: string, box: string) => `
  INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
  VALUES (${q(statement)}, ${q(a.owner)}, ${vis}, ARRAY[${q(TAG)}], ARRAY[${q(`canvas_${a.v1Name}`)}, ${q(box)}])
  RETURNING id INTO ${var_};`;
  return `
DO $probe$
DECLARE
  v_l1 uuid; v_l2 uuid; v_other_story uuid; v_pub_story uuid;
  v_res jsonb; v_draft public.canvas_drafts; v_dtag text; v_out jsonb;
BEGIN
  ALTER TABLE public.points DISABLE TRIGGER ${TRIGGER};${pt('v_l1', a.s1, 'canvas:channels')}${pt('v_l2', a.s2, 'canvas:solution')}
  ALTER TABLE public.points ENABLE TRIGGER ${TRIGGER};
  INSERT INTO public.point_positions (point_id, user_id, position, reasoning) VALUES
    (v_l1, ${q(a.owner)}, 'agree', 'probe reasoning'), (v_l1, ${q(a.other)}, 'disagree', 'other reasoning');
  INSERT INTO public.stories (author_id, content, visibility) VALUES (${q(a.other)}, ${q(`${TAG} other story`)}, 'private') RETURNING id INTO v_other_story;
  INSERT INTO public.stories (author_id, content, visibility) VALUES (${q(a.owner)}, ${q(`${TAG} public story`)}, 'public') RETURNING id INTO v_pub_story;
  INSERT INTO public.story_points (story_id, point_id, author_id) VALUES
    (${q(a.story)}, v_l1, ${q(a.owner)}), (v_other_story, v_l1, ${q(a.other)});
  ${a.visibility === 'public' ? `INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_pub_story, v_l2, ${q(a.owner)});` : '-- a private point cannot link a public story (the control has none)'}
  PERFORM set_config('request.jwt.claim.sub', ${q(a.owner)}, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ${q(a.owner)}, 'role', 'authenticated')::text, true);
  v_res := public.canvas_draft_open(${q(a.v1Id)}::uuid);
  SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = (v_res ->> 'draft_id')::uuid;
  v_dtag := 'canvas_' || v_draft.version_name;
  v_out := jsonb_build_object(
    'open', v_res, 'dtag', v_dtag, 'l1', v_l1, 'l2', v_l2, 'other_story', v_other_story, 'public_story', v_pub_story,
    'trigger_on_during_open', (SELECT t.tgenabled FROM pg_trigger t WHERE t.tgname = ${q(TRIGGER)}),
    'legacy_after', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'visibility', p.visibility, 'tags', p.system_tags) ORDER BY p.id), '[]'::jsonb)
                       FROM public.points p WHERE p.id IN (v_l1, v_l2)),
    'draft_points', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'visibility', p.visibility, 'tags', p.system_tags, 'statement', p.statement) ORDER BY p.id), '[]'::jsonb)
                       FROM public.points p WHERE p.first_validator_id = ${q(a.owner)} AND p.system_tags @> ARRAY[v_dtag]),
    'ledger', (SELECT COALESCE(jsonb_agg(jsonb_build_object('point_id', cp.point_id, 'copied_from', cp.copied_from,
                 'positions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('user', pp.user_id, 'position', pp.position, 'reasoning', pp.reasoning) ORDER BY pp.user_id), '[]'::jsonb)
                                 FROM public.point_positions pp WHERE pp.point_id = cp.point_id),
                 'stories', (SELECT COALESCE(jsonb_agg(sp.story_id ORDER BY sp.story_id), '[]'::jsonb) FROM public.story_points sp WHERE sp.point_id = cp.point_id)) ORDER BY cp.copied_from), '[]'::jsonb)
                 FROM public.canvas_draft_points cp WHERE cp.draft_id = v_draft.id));
  RAISE EXCEPTION 'PROBE_RESULT:%', v_out::text USING ERRCODE = 'P0001';
END
$probe$;`;
}

function parseProbe(r: { ok: boolean; message: string }): Row {
  const m = /PROBE_RESULT:(\{[\s\S]*\})/.exec(r.message);
  if (!m) throw new Error(`the probe did not report (it failed for another reason): ${r.message.slice(0, 600)}`);
  return JSON.parse(m[1]!) as Row;
}

/**
 * Both legacy public base points are carried as private copies, each recorded in the ledger. L1's copy keeps ONLY the owner's stance and
 * ONLY the owner's private story; L2's copy, whose only story is the owner's non-private one, links none. The legacy points are untouched.
 */
function legacyCopyHolds(res: Row, ids: string[], s1: string, s2: string, ownerId: string, ownerStory: string): boolean {
  const pts = res.draft_points as Row[];
  const ledger = res.ledger as Row[];
  const c1 = pts.find((p) => p.statement === s1); const c2 = pts.find((p) => p.statement === s2);
  const l1 = ledger.find((l) => l.copied_from === res.l1); const l2 = ledger.find((l) => l.copied_from === res.l2);
  const tags = (p: Row) => JSON.stringify([...p.tags].sort());
  return !!c1 && !!c2 && !!l1 && !!l2
    && res.open?.status === 'opened'
    && pts.length === ids.length + 2 && ids.every((id) => pts.some((p) => p.id === id))
    && c1.id !== res.l1 && c2.id !== res.l2 && c1.visibility === 'private' && c2.visibility === 'private'
    && tags(c1) === JSON.stringify(['canvas:channels', res.dtag].sort()) && tags(c2) === JSON.stringify(['canvas:solution', res.dtag].sort())
    && (res.legacy_after as Row[]).every((p) => p.visibility === 'public' && !(p.tags as string[]).includes(res.dtag))
    && ledger.length === 2 && l1.point_id === c1.id && l2.point_id === c2.id
    && JSON.stringify(l1.positions) === JSON.stringify([{ user: ownerId, position: 'agree', reasoning: 'probe reasoning' }])
    && JSON.stringify(l1.stories) === JSON.stringify([ownerStory])
    && l2.stories.length === 0 && l2.positions.length === 0;
}

const users: TestUser[] = [];
afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('stories').delete().like('content', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
    expect((await deleteTestUsers(mine)).failed, 'every test user was deleted').toBe(0);
  }
  console.log(`P1536b5 legacy-copy suite traffic: owners=${users.length} requests=${traffic.requests}`);
}, 240_000);

describe.skipIf(notHostedSqlTarget())(`B5: a legacy public base point is carried as a private copy (${HOSTED_SQL_ONLY})`, () => {
  it('opening from a version whose base holds a legacy public canvas point copies it privately; a private base point makes no copy (control); nothing persists', async () => {
    const u = await createTestUser({ name: `P1536b5 legacy ${RUN}` });
    users.push(u);
    const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    expect((await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD })).error).toBeNull();
    const owner = u.user.id;

    // a published v1 with a private story on one of its points, made through the engine as a person makes one
    const sent = (await c.rpc('canvas_workspace_send', {
      p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('We sell bookkeeping to cafes'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    })).data as Row;
    expect(sent.status, JSON.stringify(sent)).toBe('ok');
    const eng = admin as unknown as SupabaseClient;
    expect(((await eng.rpc('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: owner, p_has_file: false, p_cap_reply: null })).data as Row).status).toBe('run');
    const done = (await eng.rpc('_canvas_draft_run_complete', {
      p_run: sent.run_id, p_owner: owner, p_scope: [], p_focus: null, p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001, p_questions: {},
      p_actions: [
        { action: 'new', box: 'canvas:segments', statement: nn('Cafe owners'), story: nn('A cafe owner told me about receipts') },
        { action: 'new', box: 'canvas:problem', statement: nn('Receipts pile up') },
        { action: 'new', box: 'canvas:revenue', statement: nn('100 per month') },
      ],
    })).data as Row;
    expect(done.status, JSON.stringify(done)).toBe('ok');
    const st = (await c.rpc('get_canvas_draft_state', { p_canvas: sent.canvas_id })).data as Row;
    const pub = (await c.rpc('canvas_draft_publish', { p_draft: sent.draft_id, p_expected_revision: st.draft.revision })).data as Row;
    expect(pub, JSON.stringify(pub)).toMatchObject({ status: 'ok', seq: 1 });
    const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', sent.canvas_id).eq('name', sent.version_name).single()).data as Row;
    const ids = (((await admin.from('points').select('id').eq('first_validator_id', owner).contains('system_tags', [`canvas_${sent.version_name}`])).data ?? []) as Row[]).map((p) => p.id as string);
    expect(ids).toHaveLength(3);
    const link = ((await admin.from('story_points').select('story_id').in('point_id', ids).eq('author_id', owner)).data ?? []) as Row[];
    expect(link.length, 'the story is linked to a v1 point').toBe(1);
    const story = (await admin.from('stories').select('id, visibility, author_id').eq('id', link[0]!.story_id).single()).data as Row;
    expect(story, 'the story the copy must carry is the owner\'s and private').toMatchObject({ visibility: 'private', author_id: owner });

    const other = await createTestUser({ name: `P1536b5 legacy other ${RUN}` });
    users.push(other);
    const base = { owner, other: other.user.id, v1Id: v1.id as string, v1Name: sent.version_name as string, story: story.id as string };
    const s1 = nn('Legacy public point one'); const s2 = nn('Legacy public point two');
    const real = parseProbe(await testDb(probeSql({ ...base, s1, s2, visibility: 'public' })));
    expect(real.trigger_on_during_open, 'the trigger was back on while the opener ran (O = enabled)').toBe('O');
    expect(legacyCopyHolds(real, ids, s1, s2, owner, base.story), JSON.stringify(real)).toBe(true);
    // the filters did something: the other author's story and the owner's public story exist and are linked to the legacy points, but not to the copies
    const copies = (real.ledger as Row[]).flatMap((l) => l.stories as string[]);
    expect(copies).not.toContain(real.other_story);
    expect(copies).not.toContain(real.public_story);

    // CONTROL: private base points are not copied; the same assertion function must say so
    const c1 = nn('Control private one'); const c2 = nn('Control private two');
    const ctrl = parseProbe(await testDb(probeSql({ ...base, s1: c1, s2: c2, visibility: 'private' })));
    expect((ctrl.ledger as Row[]).length, 'control: nothing was copied').toBe(0);
    expect(legacyCopyHolds(ctrl, ids, c1, c2, owner, base.story), 'CONTROL: the assertion function fails when no copy was made').toBe(false);

    // ROLLED BACK: read afterwards (REST, and the catalog)
    expect(((await admin.from('points').select('id').like('statement', `${TAG}%`).in('visibility', ['public'])).data ?? []), 'no public point is left').toHaveLength(0);
    expect(((await admin.from('points').select('id').eq('first_validator_id', owner).in('statement', [s1, s2, c1, c2])).data ?? [])).toHaveLength(0);
    expect(((await admin.from('stories').select('id').like('content', `${TAG} %story`).in('author_id', [owner, other.user.id])).data ?? []), 'the probe\'s stories are not there').toHaveLength(0);
    expect(((await admin.from('canvas_drafts').select('id').eq('owner_id', owner).eq('state', 'open')).data ?? []), 'no draft was left open').toHaveLength(0);
    expect(((await admin.from('canvas_drafts').select('id').eq('owner_id', owner)).data ?? []), 'only the published draft exists').toHaveLength(1);
    expect(((await admin.from('point_positions').select('point_id').in('reasoning', ['probe reasoning', 'other reasoning'])).data ?? [])).toHaveLength(0);
    const trg = await testDb(`SELECT tgenabled FROM pg_trigger WHERE tgname = ${q(TRIGGER)}`);
    expect(trg.rows, 'the trigger is enabled again').toEqual([{ tgenabled: 'O' }]);
  }, T);
});

describe('why the probe needs raw SQL: no API route seeds a public canvas-tagged point', () => {
  it('the p1515 trigger refuses it as an insert, as a tag added to a public point, and as a visibility change on a tagged point (service role)', async () => {
    const u = await createTestUser({ name: `P1536b5 trigger ${RUN}` });
    users.push(u);
    const owner = u.user.id;
    const tag = `canvas_${RUN}_x`;
    const row = (visibility: string, system_tags: string[]) => ({ statement: nn(`trigger ${visibility} ${system_tags.join('+')}`), first_validator_id: owner, visibility, tags: [], system_tags });
    // CONTROL: the trigger is not blocking everything. A public point with no canvas tag, and a private tagged one, are fine.
    const publicPlain = await admin.from('points').insert(row('public', ['canvas:segments'])).select('id').single();
    expect(publicPlain.error, 'control: a public point without a canvas_ tag is allowed').toBeNull();
    const privateTagged = await admin.from('points').insert(row('private', [tag, 'canvas:segments'])).select('id').single();
    expect(privateTagged.error, 'control: a private canvas-tagged point is allowed').toBeNull();
    // 1. inserted public and tagged
    expect((await admin.from('points').insert(row('public', [tag, 'canvas:problem'])).select('id')).error?.code).toBe('23514');
    // 2. a canvas tag added to a public point afterwards
    expect((await admin.from('points').update({ system_tags: [tag, 'canvas:segments'] }).eq('id', publicPlain.data!.id)).error?.code).toBe('23514');
    // 3. a tagged private point made public afterwards
    expect((await admin.from('points').update({ visibility: 'public' }).eq('id', privateTagged.data!.id)).error?.code).toBe('23514');
  }, T);
});
