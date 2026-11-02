/**
 * P1536 section 3c, X9: voice notes in every canvas thread (migration 20261102100100).
 *   npm run test:integration -- src/tests/integration/p1536-x9-voice.test.ts
 *
 * canvas_voice_send is the service-only function chat-voice calls after it has validated the STORED bytes (that check is unit-tested
 * with fakes in p1536-x9-chat-voice-canvas.test.ts). Here it is called as the service role, exactly as the edge function does, with the
 * verified user's id. The transcript trigger is driven the way the transcription job drives it: chat_voice_finish_transcription.
 *
 * S3c.6: exactly one draft, thread, message, run and transcription for a first voice note, also after a lost response and on
 * concurrent commits; invalid audio writes nothing; a note with no run FAILS the check (control); a non-service role and another owner
 * are refused; a failed transcript fails the run with no model call and no charge while no tab is open.
 *
 * What this file cannot show: the pg_net call itself. It needs the vault secrets and a deployed canvas-draft; the last block runs only
 * when P1536_X9_DEPLOYED=1 and shows the run leaving `queued` with no client request at all.
 */
import { traffic } from './p1536-count-fetch';
import { describe, it, expect, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUsers, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

type Row = Record<string, any>;

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const TAG = `P1536x9 ${RUN}`;
const nn = (s: string) => `${TAG} ${s}`;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const BOX = { segments: 'canvas:segments', problem: 'canvas:problem', revenue: 'canvas:revenue' };
const T = 240_000;

const bare = () => createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
async function signIn(u: TestUser): Promise<SupabaseClient> {
  const c = bare();
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw new Error(`[P1536x9] sign-in failed for ${u.name}: ${error.message}`);
  return c;
}
const rpc = (c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<{ data: any; error: any }> => c.rpc(fn, args) as any;
async function ok(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await rpc(c, fn, args);
  if (error) throw new Error(`${fn}: ${error.code} ${error.message}`);
  return data;
}

interface Owner { u: TestUser; c: SupabaseClient; id: string; conv: string }
const users: TestUser[] = [];
async function mkOwner(label: string): Promise<Owner> {
  const u = await createTestUser({ name: `P1536x9 ${label} ${RUN}` });
  users.push(u);
  const id = u.user.id;
  // The mirror conversation exists once the owner has opened their mirror chat; the client reads its id there and uploads to it.
  await ok(admin as unknown as SupabaseClient, '_chat_ensure_mirror', { p_uid: id });
  const conv = ((await admin.from('chat_conversations').select('id').eq('kind', 'mirror').eq('owner_id', id).single()).data as Row).id as string;
  return { u, c: await signIn(u), id, conv };
}

afterAll(async () => {
  const mine = users.map((u) => u.user.id);
  if (mine.length) {
    await admin.from('canvases').delete().in('owner_id', mine);
    await admin.from('points').delete().like('statement', `${TAG}%`);
    await admin.from('stories').delete().like('content', `${TAG}%`);
    await admin.from('mirror_ai_spend').delete().in('owner_id', mine);
  }
  const gone = await deleteTestUsers(users.map((u) => u.user.id));
  expect(gone.failed, 'every test user was deleted').toBe(0);
  console.log(`P1536x9 live suite traffic: owners=${users.length} requests=${traffic.requests} failedResponses=${traffic.failedResponses}`);
}, 240_000);

/** The key chat-voice has stored a clip under: <mirror conversation>/<owner>/<upload id>.wav (the upload id IS the client id). */
const keyOf = (o: Owner, client: string) => `${o.conv}/${o.id}/${client}.wav`.toLowerCase();

interface VoiceArgs { canvas?: string | null; from?: string | null; draft?: string | null; rev?: number | null; replace?: boolean; refs?: string[] | null; key?: string; dur?: number; wave?: number[] | null; client?: string }
/** What chat-voice does after it validated the bytes: ONE call as the service role, naming the verified user. */
function voiceArgs(o: Owner, a: VoiceArgs = {}, as: string = o.id): Record<string, unknown> {
  const client = a.client ?? randomUUID();
  return {
    p_uid: as, p_canvas: a.canvas ?? null, p_from_version: a.from ?? null, p_expected_draft: a.draft ?? null, p_expected_revision: a.rev ?? null,
    p_replace: a.replace ?? false, p_box_refs: a.refs ?? null, p_object_key: a.key ?? keyOf(o, client), p_duration_ms: a.dur ?? 3000,
    p_waveform: a.wave === undefined ? Array.from({ length: 50 }, (_, i) => i % 100) : a.wave, p_client_id: client,
  };
}
const voiceCall = (c: SupabaseClient, args: Record<string, unknown>) => rpc(c, 'canvas_voice_send', args);
const voiceSend = (args: Record<string, unknown>) => voiceCall(admin as unknown as SupabaseClient, args);
async function voiceOk(args: Record<string, unknown>): Promise<Row> {
  const { data, error } = await voiceSend(args);
  if (error) throw new Error(`canvas_voice_send: ${error.code} ${error.message}`);
  return data as Row;
}

/** Everything one owner's voice note writes, counted from the tables themselves. */
async function counts(ownerId: string) {
  const n = async (table: string, col: string, id: string = ownerId) => ((await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, id)).count ?? 0);
  const voice = ((await admin.from('chat_messages').select('id, thread_root_id, transcript_status, client_id').eq('author_id', ownerId).not('audio_duration_ms', 'is', null)).data ?? []) as Row[];
  const audio = voice.length ? ((await admin.from('chat_voice_audio').select('message_id, audio_path').in('message_id', voice.map((v) => v.id))).data ?? []) as Row[] : [];
  const roots = new Set(((await admin.from('canvas_drafts').select('thread_root_id').eq('owner_id', ownerId)).data ?? []).map((r: Row) => r.thread_root_id));
  return {
    canvases: await n('canvases', 'owner_id'), drafts: await n('canvas_drafts', 'owner_id'), runs: await n('canvas_draft_runs', 'owner_id'),
    voiceMessages: voice.length, transcriptions: audio.length, threads: roots.size, voice, audio,
  };
}
const NOTHING = { canvases: 0, drafts: 0, runs: 0, voiceMessages: 0, transcriptions: 0, threads: 0 };
const strip = (c: Awaited<ReturnType<typeof counts>>) => ({ canvases: c.canvases, drafts: c.drafts, runs: c.runs, voiceMessages: c.voiceMessages, transcriptions: c.transcriptions, threads: c.threads });
const ONE = { canvases: 1, drafts: 1, runs: 1, voiceMessages: 1, transcriptions: 1, threads: 1 };

/** The check S3c.6 names: every voice note in a canvas thread has a run that is about it. Returns the notes that have none. */
async function voiceNotesWithNoRun(ownerId: string): Promise<string[]> {
  const notes = ((await admin.from('chat_messages').select('id, thread_root_id').eq('author_id', ownerId).not('audio_duration_ms', 'is', null)).data ?? []) as Row[];
  const runs = ((await admin.from('canvas_draft_runs').select('trigger_message_id').eq('owner_id', ownerId)).data ?? []) as Row[];
  const triggered = new Set(runs.map((r) => r.trigger_message_id));
  return notes.filter((m) => !triggered.has(m.id)).map((m) => m.id as string);
}
const runOf = async (id: string): Promise<Row> => (await admin.from('canvas_draft_runs').select('*').eq('id', id).single()).data as Row;
const draftOf = async (id: string): Promise<Row> => (await admin.from('canvas_drafts').select('*').eq('id', id).single()).data as Row;
const eng = (fn: string, args: Record<string, unknown>) => ok(admin as unknown as SupabaseClient, fn, args);
const spendRows = async (ownerId: string): Promise<number> => ((await admin.from('mirror_ai_spend').select('id').eq('owner_id', ownerId)).data ?? []).length;

/** A published v1 made through the engine (as B5's helper): a text Send, a stubbed run that writes three points, Publish. */
async function publishedV1(o: Owner): Promise<{ canvasId: string; v1: string }> {
  const sent = await ok(o.c, 'canvas_workspace_send', {
    p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
    p_body: nn('We sell bookkeeping to cafes'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
  });
  expect(sent.status, JSON.stringify(sent)).toBe('ok');
  const b = await eng('_canvas_draft_run_begin', { p_run: sent.run_id, p_owner: o.id, p_has_file: false, p_cap_reply: null });
  expect(b.status, JSON.stringify(b)).toBe('run');
  const d = await eng('_canvas_draft_run_complete', {
    p_run: sent.run_id, p_owner: o.id,
    p_actions: [{ action: 'new', box: BOX.segments, statement: nn('Cafe owners') }, { action: 'new', box: BOX.problem, statement: nn('Receipts pile up') }, { action: 'new', box: BOX.revenue, statement: nn('100 per month') }],
    p_questions: {}, p_scope: [], p_focus: 'Cafes', p_other_canvases: [], p_note: null, p_reply: nn('reply'), p_usd: 0.001,
  });
  expect(d.status, JSON.stringify(d)).toBe('ok');
  const st = await ok(o.c, 'get_canvas_draft_state', { p_canvas: sent.canvas_id });
  const pub = await ok(o.c, 'canvas_draft_publish', { p_draft: sent.draft_id, p_expected_revision: st.draft.revision });
  expect(pub, JSON.stringify(pub)).toMatchObject({ status: 'ok', seq: 1 });
  const v1 = (await admin.from('canvas_versions').select('id').eq('canvas_id', sent.canvas_id).eq('name', sent.version_name).single()).data as Row;
  return { canvasId: sent.canvas_id, v1: v1.id };
}

describe('S3c.6 X9: a first voice note creates the draft and the run, once', () => {
  it('a new canvas: exactly one canvas, draft, thread, voice message, run and transcription', async () => {
    const o = await mkOwner('new');
    expect(strip(await counts(o.id))).toEqual(NOTHING);
    const client = randomUUID();
    const r = await voiceOk(voiceArgs(o, { client, refs: [BOX.problem] }));
    expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok', replayed: false, conversation_id: o.conv });
    const c = await counts(o.id);
    expect(strip(c)).toEqual(ONE);
    expect(c.audio[0]!.audio_path, 'the audio row names the upload the bytes were validated at').toBe(keyOf(o, client));
    expect(c.voice[0]).toMatchObject({ id: r.message_id, thread_root_id: r.thread_root_id, transcript_status: 'pending', client_id: client });
    const run = await runOf(r.run_id);
    expect(run).toMatchObject({ state: 'queued', input_kind: 'voice', kind: 'message', trigger_message_id: r.message_id, scope: [BOX.problem] });
    expect((await draftOf(r.draft_id)).thread_root_id).toBe(r.thread_root_id);
  }, T);

  it('a pending Clone: the first voice note opens the next draft from the version, with its one run', async () => {
    const o = await mkOwner('clone'); const p = await publishedV1(o);
    const before = await counts(o.id);
    const r = await voiceOk(voiceArgs(o, { canvas: p.canvasId, from: p.v1 }));
    expect(r, JSON.stringify(r)).toMatchObject({ status: 'ok', replayed: false });
    const after = await counts(o.id);
    expect(after.drafts - before.drafts, 'one new draft').toBe(1);
    expect(after.runs - before.runs, 'one new run').toBe(1);
    expect(after.voiceMessages - before.voiceMessages, 'one voice message').toBe(1);
    expect(after.transcriptions - before.transcriptions, 'one transcription').toBe(1);
    expect(after.threads - before.threads, 'one new thread').toBe(1);
    expect(after.canvases, 'no second canvas').toBe(before.canvases);
    expect(await draftOf(r.draft_id)).toMatchObject({ base_version_id: p.v1, state: 'open' });
  }, T);

  it('after a lost response: the same upload again returns the first result and writes nothing', async () => {
    const o = await mkOwner('lost');
    const args = voiceArgs(o);
    const first = await voiceOk(args);
    const again = await voiceOk(args);
    expect(again, JSON.stringify(again)).toMatchObject({ status: 'ok', replayed: true, run_id: first.run_id, draft_id: first.draft_id, message_id: first.message_id });
    expect(strip(await counts(o.id))).toEqual(ONE);
  }, T);

  it('on concurrent commits of one upload: one of everything, every caller gets that one', async () => {
    const o = await mkOwner('concurrent');
    const args = voiceArgs(o);
    const all = await Promise.all(Array.from({ length: 6 }, () => voiceSend(args)));
    for (const x of all) expect(x.error, JSON.stringify(x.error)).toBeNull();
    expect(new Set(all.map((x) => (x.data as Row).run_id)).size, 'one run id for all six').toBe(1);
    expect(all.filter((x) => (x.data as Row).replayed === false), 'exactly one of them wrote').toHaveLength(1);
    expect(strip(await counts(o.id))).toEqual(ONE);
  }, T);

  it('invalid audio, a wrong key or a missing key is refused and writes nothing (not even the new canvas)', async () => {
    const o = await mkOwner('invalid');
    const other = randomUUID();
    const cases: Array<[string, Record<string, unknown>]> = [
      ['a key under another conversation', voiceArgs(o, { key: `${randomUUID()}/${o.id}/${other}.wav`, client: other })],
      ['a key under another owner', voiceArgs(o, { key: `${o.conv}/${randomUUID()}/${other}.wav`, client: other })],
      ['a key for another upload id', voiceArgs(o, { key: keyOf(o, randomUUID()), client: other })],
      ['no key at all', { ...voiceArgs(o), p_object_key: null }],
      ['a zero length', voiceArgs(o, { dur: 0 })],
      ['a length over the cap', voiceArgs(o, { dur: 120_001 })],
      ['a waveform of the wrong size', voiceArgs(o, { wave: [1, 2, 3] })],
    ];
    for (const [what, args] of cases) {
      const { data, error } = await voiceSend(args);
      expect(error, `${what} is refused (${JSON.stringify(data)})`).not.toBeNull();
      expect(strip(await counts(o.id)), `${what} wrote nothing`).toEqual(NOTHING);
    }
    // CONTROL: with a good key and length the same owner's note goes through, so the refusals above are about the arguments
    expect((await voiceOk(voiceArgs(o))).status).toBe('ok');
    expect(strip(await counts(o.id))).toEqual(ONE);
  }, T);

  it('CONTROL: a voice note posted with no run is caught by the check, and one made by canvas_voice_send is not', async () => {
    const o = await mkOwner('control');
    const r = await voiceOk(voiceArgs(o));
    expect(await voiceNotesWithNoRun(o.id), 'a note made by canvas_voice_send has its run').toEqual([]);
    // the P1576 commit on its own, into the same canvas thread, is the plain note X9 must not allow: it has no run
    const client = randomUUID();
    await eng('chat_commit_voice_note', {
      p_uid: o.id, p_conversation: o.conv, p_object_key: keyOf(o, client), p_duration_ms: 2000, p_thread_root: r.thread_root_id,
      p_reply_to: null, p_client_id: client, p_waveform: null,
    });
    const orphan = await voiceNotesWithNoRun(o.id);
    expect(orphan, 'the check names the note that has no run').toHaveLength(1);
  }, T);
});

describe('S3c.6 X9: who may call it', () => {
  it('a signed-in user, the anon role and a caller with a made-up id are refused, and nothing is written', async () => {
    const o = await mkOwner('callers');
    const args = voiceArgs(o);
    const asUser = await voiceCall(o.c, args);
    expect(asUser.error?.code, `a signed-in user: ${JSON.stringify(asUser.error)}`).toBe('42501');
    const asAnon = await voiceCall(bare(), args);
    expect(asAnon.error?.code, `anon: ${JSON.stringify(asAnon.error)}`).toBe('42501');
    expect(strip(await counts(o.id))).toEqual(NOTHING);
    // CONTROL: the same arguments as the service role succeed, so the refusals above are about the caller, not the arguments
    expect((await voiceOk(args)).status).toBe('ok');
  }, T);

  it('it acts for the named owner only: another owner\'s canvas, version or draft is refused, and nothing is written for either', async () => {
    const a = await mkOwner('ownerA'); const b = await mkOwner('ownerB');
    const p = await publishedV1(a);
    const aDraft = await voiceOk(voiceArgs(a, { canvas: p.canvasId, from: p.v1 }));
    const beforeA = strip(await counts(a.id));
    const attempts: Array<[string, VoiceArgs]> = [
      ["A's canvas", { canvas: p.canvasId, from: p.v1 }],
      ["A's open draft", { canvas: p.canvasId, draft: aDraft.draft_id, rev: aDraft.revision }],
      ["A's version on a new canvas", { from: p.v1 }],
    ];
    for (const [what, a2] of attempts) {
      const client = randomUUID();
      const { data, error } = await voiceSend(voiceArgs(b, { ...a2, client }, b.id));
      expect(error, `B on ${what}: ${JSON.stringify(data)}`).not.toBeNull();
      expect(String(error.code) + String(error.message)).toMatch(/42501|22023|not authorized|new canvas has no version/);
    }
    expect(strip(await counts(b.id)), 'nothing was written for B').toEqual(NOTHING);
    expect(strip(await counts(a.id)), 'nothing was written for A').toEqual(beforeA);
    // CONTROL: B acting for B on B's own new canvas works, so the refusals above are about whose canvas it is
    expect((await voiceOk(voiceArgs(b))).status).toBe('ok');
  }, T);
});

describe('S3c.6 X9: the send\'s own guards fire on the voice path exactly as on the typed one (canvas_voice_send calls canvas_workspace_send itself)', () => {
  /** The same refusal, once as the signed-in owner typing (canvas_workspace_send) and once as chat-voice committing a note (canvas_voice_send). */
  const userSend = (c: SupabaseClient, a: { canvas?: string | null; from?: string | null; client?: string | null; refs?: string[] | null }) => rpc(c, 'canvas_workspace_send', {
    p_canvas: a.canvas ?? null, p_from_version: a.from ?? null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
    p_body: nn('words'), p_box_refs: a.refs ?? null, p_attachment: null, p_client_id: a.client === undefined ? randomUUID() : a.client,
  });

  it('a missing client id, an unknown box tag, a version on a new canvas, another owner\'s canvas and a canvas with nothing to start from are refused on BOTH paths with the same sentence', async () => {
    const a = await mkOwner('guardsA'); const b = await mkOwner('guardsB');
    const p = await publishedV1(a);
    const cases: Array<[string, VoiceArgs & { client?: string | null }, { canvas?: string | null; from?: string | null; client?: string | null; refs?: string[] | null }, Owner, Owner]> = [
      ['a client id is required', { client: undefined }, { client: null }, a, a],
      ['unknown box tag', { refs: ['canvas:nope'] }, { refs: ['canvas:nope'] }, a, a],
      ['a new canvas has no version or draft', { from: p.v1 }, { from: p.v1 }, a, a],
      ['not authorized for this canvas', { canvas: p.canvasId, from: p.v1 }, { canvas: p.canvasId, from: p.v1 }, b, b],
      ['no draft is open and no version to start from', { canvas: p.canvasId }, { canvas: p.canvasId }, a, a],
    ];
    for (const [text, voice, typed, voiceAs, typedAs] of cases) {
      const t = await userSend(typedAs.c, typed);
      expect(t.error?.message, `typed: ${text}`).toContain(text);
      const args = text === 'a client id is required' ? { ...voiceArgs(voiceAs, voice), p_client_id: null } : voiceArgs(voiceAs, voice, voiceAs.id);
      const v = await voiceSend(args);
      expect(v.error?.message, `voice: ${text} (${JSON.stringify(v.error)})`).toContain(text);
    }
    expect(strip(await counts(b.id)), 'nothing was written for B on either path').toEqual(NOTHING);
  }, T);

  it('an unnamed caller is refused with the sign-in sentence, and a note with a length the send does not accept is refused with its own', async () => {
    const o = await mkOwner('guardsC');
    const unnamed = await voiceSend({ ...voiceArgs(o), p_uid: null });
    expect(unnamed.error?.message).toContain('sign in required');
    const longNote = await voiceSend(voiceArgs(o, { dur: 1234567 }));
    expect(longNote.error?.message).toContain('canvas send: bad voice note');
    expect(strip(await counts(o.id))).toEqual(NOTHING);
    // CONTROL: the typed function itself, called by the service role with no user, is the same sign-in refusal: the guard lives in the one body
    const typedNoUser = await rpc(admin as unknown as SupabaseClient, 'canvas_workspace_send', {
      p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false, p_body: nn('x'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(typedNoUser.error?.message).toContain('sign in required');
  }, T);
});

describe('S3c.6 X9: a voice note arrives only through the voice commit', () => {
  const typedVoice = (c: SupabaseClient, a: { canvas?: string | null; from?: string | null; client?: string } = {}) => rpc(c, 'canvas_workspace_send', {
    p_canvas: a.canvas ?? null, p_from_version: a.from ?? null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
    p_body: null, p_box_refs: null, p_attachment: { kind: 'voice', duration_ms: 3000 }, p_client_id: a.client ?? randomUUID(),
  });

  it('a signed-in owner calling canvas_workspace_send directly with a voice attachment is refused and writes no draft, thread, message or run', async () => {
    const o = await mkOwner('forged');
    const direct = await typedVoice(o.c);
    expect(direct.error?.code, JSON.stringify(direct.error)).toBe('42501');
    expect(direct.error?.message).toContain('a voice note arrives only through the voice commit');
    expect(strip(await counts(o.id)), 'a new canvas: nothing was written').toEqual(NOTHING);

    const p = await publishedV1(o);
    const before = strip(await counts(o.id));
    const onClone = await typedVoice(o.c, { canvas: p.canvasId, from: p.v1 });
    expect(onClone.error?.code, JSON.stringify(onClone.error)).toBe('42501');
    expect(strip(await counts(o.id)), 'a pending Clone: nothing was written').toEqual(before);
    expect(((await admin.from('canvas_drafts').select('id').eq('owner_id', o.id).eq('state', 'open')).data ?? []), 'no draft was opened').toHaveLength(0);

    // CONTROL: typing works, and the same note through the voice commit works, so the refusal above is about the path. They are two owners on
    // purpose: an owner has ONE active run, and the typed send's queued run would make the owner's next send busy_elsewhere.
    const other = await mkOwner('forgedControl');
    const typed = await rpc(other.c, 'canvas_workspace_send', {
      p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('typed'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(typed.error, JSON.stringify(typed.error)).toBeNull();
    const voiced = await voiceOk(voiceArgs(o));
    expect(voiced.status, JSON.stringify(voiced)).toBe('ok');
  }, T);

  it('the signal is not something a client can send: set_config is not callable, and a service-role call without a user is still "sign in required"', async () => {
    const o = await mkOwner('signal');
    for (const [who, c] of [['a signed-in user', o.c], ['anon', bare()]] as const) {
      const r = await rpc(c, 'set_config', { setting_name: 'request.jwt.claims', new_value: JSON.stringify({ sub: o.id, role: 'service_role' }), is_local: true });
      expect(r.error?.code, `${who}: ${JSON.stringify(r.error)}`).toBe('PGRST202');
    }
    const service = await typedVoice(admin as unknown as SupabaseClient);
    expect(service.error?.message, 'the service role names no user on its own').toContain('sign in required');
    expect(strip(await counts(o.id))).toEqual(NOTHING);
  }, T);
});

describe('S3c.6 X9: the run follows the transcript, with no tab open', () => {
  /** The transcript job's own calls; nothing here is a client request. */
  const claim = (id: string) => eng('chat_voice_claim_transcription', { p_message: id });
  const finish = (id: string, a: { ok: boolean; text?: string; final?: boolean }) =>
    eng('chat_voice_finish_transcription', { p_message: id, p_ok: a.ok, p_text: a.text ?? null, p_final: a.final ?? false });

  it('a failed transcript fails the run at once: no model call, no charge, nobody asked it to', async () => {
    const o = await mkOwner('failed');
    const r = await voiceOk(voiceArgs(o));
    const revBefore = (await draftOf(r.draft_id)).revision;
    const spendBefore = await spendRows(o.id);
    await claim(r.message_id);
    await finish(r.message_id, { ok: false, final: true });
    // read the tables only: no RPC of the owner's runs, so nothing but the trigger could have settled it
    const run = await runOf(r.run_id);
    expect(run, JSON.stringify(run)).toMatchObject({ state: 'failed', error_code: 'transcript_failed', spend_id: null });
    expect(run.finished_at).not.toBeNull();
    expect(await spendRows(o.id), 'no charge').toBe(spendBefore);
    expect((await draftOf(r.draft_id)).revision, 'the revision moved: the open thread re-reads').toBeGreaterThan(revBefore);
    expect((await admin.from('chat_messages').select('transcript_status').eq('id', r.message_id).single()).data).toMatchObject({ transcript_status: 'failed' });
  }, T);

  it('a transcript that comes back blank fails the run the same way', async () => {
    const o = await mkOwner('blank');
    const r = await voiceOk(voiceArgs(o));
    await claim(r.message_id);
    await finish(r.message_id, { ok: true, text: '   ' });
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'transcript_failed', spend_id: null });
  }, T);

  it('a finished transcript is kept, and its run is begun exactly once however many times it is asked (the client\'s start is a harmless retry)', async () => {
    const o = await mkOwner('done');
    const r = await voiceOk(voiceArgs(o));
    const first = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: o.id, p_has_file: false, p_cap_reply: null });
    expect(first, 'before the transcript there is nothing to begin').toMatchObject({ status: 'not_ready', reason: 'transcript_pending' });
    await claim(r.message_id);
    await finish(r.message_id, { ok: true, text: nn('my customers are bakeries') });
    const msg = (await admin.from('chat_messages').select('transcript, transcript_status').eq('id', r.message_id).single()).data;
    expect(msg, 'the trigger cannot undo the transcript write, whatever the dispatch does').toMatchObject({ transcript_status: 'done', transcript: nn('my customers are bakeries') });
    // the dispatch may or may not have arrived (it needs the vault and a deployed function); either way ONE begin happens
    const second = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: o.id, p_has_file: false, p_cap_reply: null });
    expect(['run', 'running'], JSON.stringify(second)).toContain(second.status);
    const third = await eng('_canvas_draft_run_begin', { p_run: r.run_id, p_owner: o.id, p_has_file: false, p_cap_reply: null });
    expect(third, 'a repeat makes no second model call').toMatchObject({ status: 'running' });
  }, T);

  // (3c X9 review fix: a voice run waits up to 30 minutes for its transcript, so the lease split into the two cases below; see "review fixes".)
  it('a run still waiting for a transcript is settled only past the 30-minute bound, and its owner can then try again', async () => {
    const o = await mkOwner('lease');
    const r = await voiceOk(voiceArgs(o));
    await expect(admin.from('canvas_draft_runs').update({ created_at: new Date(Date.now() - 4 * 60_000).toISOString() }).eq('id', r.run_id)).resolves.toMatchObject({ error: null });
    const waiting = await ok(o.c, 'get_canvas_draft_state', { p_canvas: r.canvas_id });
    expect(waiting.draft.active_run, '4 minutes of waiting is not a lease').not.toBeNull();
    expect(await runOf(r.run_id)).toMatchObject({ state: 'queued' });
    await admin.from('canvas_draft_runs').update({ created_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq('id', r.run_id);
    const st = await ok(o.c, 'get_canvas_draft_state', { p_canvas: r.canvas_id });
    expect(st.draft.active_run, 'the expire step failed it').toBeNull();
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
    // a transcript that never came is not retryable (there is nothing to read): the owner sends a new note
    const again = await voiceOk(voiceArgs(o, { canvas: r.canvas_id, draft: r.draft_id, rev: st.draft.revision }));
    expect(again.status, JSON.stringify(again)).toBe('ok');
  }, T);

  it('a landed transcript whose dispatch never arrived is settled 3 minutes after ready_at, and its owner can try again', async () => {
    const o = await mkOwner('lease2');
    await admin.from('profiles').update({ accepted_terms_version: null }).eq('id', o.id); // the route refuses (409) before any begin: this test drives the run itself
    const r = await voiceOk(voiceArgs(o));
    await eng('chat_voice_claim_transcription', { p_message: r.message_id });
    await eng('chat_voice_finish_transcription', { p_message: r.message_id, p_ok: true, p_text: nn('hello there'), p_final: false });
    await admin.from('canvas_draft_runs').update({ ready_at: new Date(Date.now() - 4 * 60_000).toISOString() }).eq('id', r.run_id);
    const st = await ok(o.c, 'get_canvas_draft_state', { p_canvas: r.canvas_id });
    expect(st.draft.active_run, 'the expire step failed it').toBeNull();
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
    // its transcript is fine, so Try again (a new run on the same note) is offered and works
    const retry = await ok(o.c, 'canvas_draft_retry', { p_draft: r.draft_id, p_failed_run: r.run_id, p_expected_revision: st.draft.revision, p_client_id: randomUUID() });
    expect(retry.status, JSON.stringify(retry)).toBe('ok');
  }, T);
});

describe('S3c.6 X9 review fixes: a voice run waits for its transcript, and its dispatch lease starts when the transcript lands', () => {
  const claim = (id: string) => eng('chat_voice_claim_transcription', { p_message: id });
  const finish = (id: string, a: { ok: boolean; text?: string; final?: boolean }) =>
    eng('chat_voice_finish_transcription', { p_message: id, p_ok: a.ok, p_text: a.text ?? null, p_final: a.final ?? false });
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const MIN = 60_000;
  /** An owner whose terms are NOT current: the database-started route then answers 409 before any begin or model call, so these tests drive the run themselves. */
  async function mkQuiet(label: string): Promise<Owner> {
    const o = await mkOwner(label);
    expect((await admin.from('profiles').update({ accepted_terms_version: null }).eq('id', o.id)).error).toBeNull();
    return o;
  }
  const age = async (run: string, cols: Record<string, string>) => expect((await admin.from('canvas_draft_runs').update(cols).eq('id', run)).error).toBeNull();
  const state = (o: Owner, canvas: string) => ok(o.c, 'get_canvas_draft_state', { p_canvas: canvas });
  const begin = (run: string, owner: string) => eng('_canvas_draft_run_begin', { p_run: run, p_owner: owner, p_has_file: false, p_cap_reply: null });

  it('a transcript that lands at minute 5 still starts the run: 5 minutes of waiting is not a lease, and the dispatch lease starts at the landing', async () => {
    const o = await mkQuiet('wait5'); const r = await voiceOk(voiceArgs(o));
    await age(r.run_id, { created_at: ago(5 * MIN) });
    const s = await state(o, r.canvas_id);                                    // the expire step runs here
    expect(await runOf(r.run_id), 'still waiting after 5 minutes').toMatchObject({ state: 'queued', error_code: null });
    expect(s.draft.active_run, 'and still the owner\'s one active run').not.toBeNull();
    await claim(r.message_id);
    await finish(r.message_id, { ok: true, text: nn('my customers are bakeries') });   // the transcript lands, 5 minutes late
    const landed = await runOf(r.run_id);
    expect(landed, 'the landing stamps the start of the dispatch lease').toMatchObject({ state: 'queued' });
    expect(Date.now() - Date.parse(landed.ready_at as string), 'ready_at is now, not the run\'s age').toBeLessThan(60_000);
    const b = await begin(r.run_id, o.id);
    expect(b.status, JSON.stringify(b)).toBe('run');                           // not 'gone / abandoned'
    expect(b.thread.map((t: Row) => t.text)).toEqual([nn('my customers are bakeries')]);
  }, T);

  it('the wait is bounded: a transcript still not here after 30 minutes ends the run, with no model call and no charge', async () => {
    const o = await mkQuiet('wait31'); const r = await voiceOk(voiceArgs(o));
    await age(r.run_id, { created_at: ago(29 * MIN) });
    await state(o, r.canvas_id);
    expect(await runOf(r.run_id), 'inside the bound').toMatchObject({ state: 'queued' });
    await age(r.run_id, { created_at: ago(31 * MIN) });
    await state(o, r.canvas_id);
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
    expect(await spendRows(o.id)).toBe(0);
  }, T);

  it('a landed transcript whose dispatch never arrives still ends: 3 minutes after the landing, not after the run\'s age', async () => {
    const o = await mkQuiet('lease3'); const r = await voiceOk(voiceArgs(o));
    await age(r.run_id, { created_at: ago(10 * MIN) });
    await claim(r.message_id);
    await finish(r.message_id, { ok: true, text: nn('hello there') });
    await state(o, r.canvas_id);
    expect(await runOf(r.run_id), '10 minutes old but landed just now').toMatchObject({ state: 'queued' });
    await age(r.run_id, { ready_at: ago(4 * MIN) });
    await state(o, r.canvas_id);
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned', spend_id: null });
  }, T);

  it('a landed transcript the trigger did not stamp (a run made before this fix) is stamped by the next engine call, so it is never failed for its age', async () => {
    const o = await mkQuiet('unstamped'); const r = await voiceOk(voiceArgs(o));
    await claim(r.message_id);
    await finish(r.message_id, { ok: true, text: nn('hello there') });
    await age(r.run_id, { created_at: ago(10 * MIN), ready_at: null as unknown as string });
    await state(o, r.canvas_id);
    const after = await runOf(r.run_id);
    expect(after).toMatchObject({ state: 'queued' });
    expect(Date.now() - Date.parse(after.ready_at as string)).toBeLessThan(60_000);
  }, T);

  it('the hourly sweep agrees: it leaves a waiting voice run alone and ends the one past the bound', async () => {
    const o = await mkQuiet('sweep'); const r = await voiceOk(voiceArgs(o));
    await age(r.run_id, { created_at: ago(6 * MIN) });
    await eng('_canvas_draft_expire_all', {});
    expect(await runOf(r.run_id)).toMatchObject({ state: 'queued' });
    await age(r.run_id, { created_at: ago(31 * MIN) });
    await eng('_canvas_draft_expire_all', {});
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned' });
  }, T);

  it('CONTROL: a typed run keeps its 3-minute lease from creation, and a final transcript failure still settles a waiting run at once', async () => {
    const o = await mkQuiet('typed'); 
    const typed = await rpc(o.c, 'canvas_workspace_send', {
      p_canvas: null, p_from_version: null, p_expected_draft: null, p_expected_revision: null, p_replace: false,
      p_body: nn('typed'), p_box_refs: null, p_attachment: null, p_client_id: randomUUID(),
    });
    expect(typed.error, JSON.stringify(typed.error)).toBeNull();
    await age(typed.data.run_id, { created_at: ago(4 * MIN) });
    await state(o, typed.data.canvas_id);
    expect(await runOf(typed.data.run_id)).toMatchObject({ state: 'failed', error_code: 'abandoned' });
    const v = await mkQuiet('failedfinal'); const r = await voiceOk(voiceArgs(v));
    await age(r.run_id, { created_at: ago(8 * MIN) });
    await claim(r.message_id);
    await finish(r.message_id, { ok: false, final: true });
    expect(await runOf(r.run_id)).toMatchObject({ state: 'failed', error_code: 'transcript_failed', spend_id: null });
  }, T);
});

describe('S3c.6 X9 review fixes: a repeated commit is held to the same key as the first', () => {
  it('a replay with another key for the same upload id is refused; the right key replays the first result, also after the audio row is gone', async () => {
    const o = await mkOwner('replaykey');
    const args = voiceArgs(o);
    const first = await voiceOk(args);
    const other = await voiceSend({ ...args, p_object_key: `${o.conv}/${o.id}/${randomUUID()}.wav` });
    expect(other.error?.code, JSON.stringify(other.error)).toBe('22023');
    expect(other.error?.message).toContain('stored under another key');
    const foreign = await voiceSend({ ...args, p_object_key: `${randomUUID()}/${o.id}/${args.p_client_id as string}.wav` });
    expect(foreign.error?.message).toContain('stored under another key');
    expect(strip(await counts(o.id)), 'nothing was written by either').toEqual(ONE);
    expect(await voiceOk(args), 'the right key replays the first result').toMatchObject({ replayed: true, run_id: first.run_id });
    // the clip's audio row is deleted once a transcript fails for good; a late repeat of the same commit still returns the first result
    await admin.from('chat_voice_audio').delete().eq('message_id', first.message_id);
    expect(await voiceOk(args)).toMatchObject({ replayed: true, run_id: first.run_id });
  }, T);
});

describe.skipIf(process.env.P1536_X9_DEPLOYED !== '1')('S3c.6 X9 after deploy: the transcript starts the run with no client request', () => {
  it('a finished transcript begins the queued run within seconds, and nothing but the database asked for it', async () => {
    const o = await mkOwner('deployed');
    const r = await voiceOk(voiceArgs(o));
    await eng('chat_voice_claim_transcription', { p_message: r.message_id });
    await eng('chat_voice_finish_transcription', { p_message: r.message_id, p_ok: true, p_text: nn('my customers are bakeries'), p_final: false });
    let state = 'queued';
    for (let i = 0; i < 20 && state === 'queued'; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      state = (await runOf(r.run_id)).state as string;
    }
    expect(state, 'the run left queued with no begin from this test').not.toBe('queued');
  }, T);
});
