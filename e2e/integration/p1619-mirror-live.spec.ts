/**
 * @file p1619-mirror-live.spec.ts
 * @description P1619 live check through the REAL mirror reply path (the mirror-reply edge function and the model), on synthetic facts.
 * The SQL side (which copy folds, when) is pinned without a model in p1619-mirror-fold-copies.spec.ts; this file proves the whole chain
 * once: what the model is offered, what the ledger reserves, and what it answers. At most 6 model replies per run (this file uses 5).
 *
 * Assertions are on run-unique tokens and on the ledger, never on tone: the model is asked to put a token in its answer, and a reply
 * that must not have seen a text is checked for the absence of that text's token.
 *
 * Runs only where the mirror is on (MIRROR_AI_ENABLED and the mirror key on the test project); elsewhere every test is SKIPPED with
 * that reason, never passed. A real run costs a few cents (five replies, two of them with a transcript).
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { RUN, signIn, ok, mirrorOf, purgeChatFor, sleep, type SignedIn } from '../helpers/test-chat';

type Anyrow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
test.describe.configure({ mode: 'serial', timeout: 240_000 });

const NO_AI = 'the mirror is off on this project (MIRROR_AI_ENABLED and the mirror key are not set on test)';
const MAX_REPLIES = 6;
const STANDARD = 0.105;
const SESSION = 0.225;
const SAFE = RUN.replace(/[^a-z0-9]/gi, '');

const users: TestUser[] = [];
const convs: string[] = [];
const roomIds: string[] = [];
let aiOn = false;
let replies = 0;
const iso = (ms: number) => new Date(ms).toISOString();
// a room code: 6 characters from the unambiguous alphabet (as p1619-mirror-fold-copies.spec.ts)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let codeN = 0;
const newCode = () => { codeN += 1; return `${ALPHABET[(codeN * 7) % 32]}${ALPHABET[(codeN * 11 + 2) % 32]}${RUN.replace(/[^A-Z2-9]/gi, 'K').toUpperCase().padEnd(4, 'K').slice(0, 4)}`; };

async function mk(name: string): Promise<TestUser> {
  const u = await createTestUser({ name });
  users.push(u);
  return u;
}
async function dm(a: TestUser, b: TestUser): Promise<string> {
  const [lo, hi] = [a.user.id, b.user.id].sort();
  const { data } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
  convs.push(data!.id);
  return data!.id as string;
}

/** One owner message, answered by the real model through the edge function; returns the answer and the ledger row of that job. */
async function ask(s: SignedIn, mir: string, text: string): Promise<{ answer: string; reserved: number }> {
  expect(replies, `at most ${MAX_REPLIES} model replies per run`).toBeLessThan(MAX_REPLIES);
  const msg = await ok<Anyrow>(s.client.rpc('send_chat_message', { p_conversation: mir, p_body: text }), `send ${text.slice(0, 24)}`);
  replies += 1;
  const { error } = await s.client.functions.invoke('mirror-reply', { body: { message_id: msg.id } });
  expect(error, `mirror-reply: ${error?.message}`).toBeNull();
  const { data: job } = await supabaseAdmin.from('mirror_jobs').select('state, reply_message_id, spend_id').eq('trigger_message_id', msg.id).single();
  expect(job?.state, 'the job finished').toBe('done');
  const { data: row } = await supabaseAdmin.from('chat_messages').select('body').eq('id', job!.reply_message_id).single();
  const { data: spend } = await supabaseAdmin.from('mirror_ai_spend').select('reserved_usd').eq('id', job!.spend_id).single();
  return { answer: String(row?.body ?? ''), reserved: Number(spend?.reserved_usd) };
}

/** A transcript session thread the owner Clarified, with the fact on a LATE line. */
async function sessionCopy(owner: TestUser, speaker: TestUser, mir: string, fact: string, lines = 60): Promise<{ copyId: string; copyAt: string }> {
  const conv = await dm(owner, speaker);
  let t0 = Date.now() - 3_600_000;
  const { data: root } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: conv, author_id: null, body: 'session|2026-11-04T10:00:00Z|1', system_kind: 'outside_rounds', created_at: iso(t0++) }).select('id').single();
  const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: conv, ended_at: new Date().toISOString() }).select('id').single();
  roomIds.push(room!.id);
  await supabaseAdmin.from('transcribe_session_threads').insert({ room_id: room!.id, conversation_id: conv, root_message_id: root!.id });
  const rows = Array.from({ length: lines }, (_, i) => ({
    conversation_id: conv, author_id: i % 2 ? owner.user.id : speaker.user.id, thread_root_id: root!.id, is_transcription: true, created_at: iso(t0++),
    body: i === lines - 4 ? fact : `we went over the schedule for item ${i} and agreed to revisit it later`,
  }));
  const { data: ids, error } = await supabaseAdmin.from('chat_messages').insert(rows).select('id');
  expect(error, error?.message).toBeNull();
  const sO = await signIn(owner);
  const copy = await ok<Anyrow>(sO.client.rpc('clarify_chat_message', { p_source: ids![ids!.length - 1]!.id }), 'clarify the session');
  return { copyId: copy.id, copyAt: copy.created_at };
}
/** n owner messages after the copy that the model has not answered (admin insert: no job, no model call). */
async function fill(owner: TestUser, mir: string, copyAt: string, n: number) {
  const base = Date.parse(copyAt);
  const { error } = await supabaseAdmin.from('chat_messages').insert(
    Array.from({ length: n }, (_, i) => ({ conversation_id: mir, author_id: owner.user.id, body: `a note about lunch ${i + 1}`, created_at: iso(base + 1 + i) })));
  expect(error, error?.message).toBeNull();
  await sleep(150);
}

test.afterAll(async () => {
  test.setTimeout(240_000);
  if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
  await purgeChatFor(users.map((u) => u.user.id), convs);
  for (const u of users) await deleteTestUser(u.user.id).catch(() => {});
});

let owner: TestUser;
let speaker: TestUser;
let sA: SignedIn;
let mir: string;
let copyAt = '';
const SPEAKER_NAME = `Marguerite Zq${SAFE}`;
const CODE_WORD = `Plumquat${SAFE}`;
const SET_ASIDE = `SETASIDE${SAFE}`;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  owner = await mk(`P1619 Live Owner ${RUN}`);
  speaker = await mk(SPEAKER_NAME);
  sA = await signIn(owner);
  mir = await mirrorOf(sA);
  const { data } = await sA.client.functions.invoke('mirror-reply', { body: { availability: true } });
  aiOn = (data as { enabled?: boolean } | null)?.enabled === true;
  if (aiOn) copyAt = (await sessionCopy(owner, speaker, mir, `At the end ${SPEAKER_NAME.split(' ')[0]} said the code word is ${CODE_WORD}.`)).copyAt;
});

test('1. asked about a Clarified session, the agent answers from a LATE line of the transcript, with the full reservation', async () => {
  test.skip(!aiOn, NO_AI);
  const r = await ask(sA, mir, `What was the code word said near the end of that session? Reply with the code word only.`);
  expect(r.answer.toLowerCase(), 'the late line was read').toContain(CODE_WORD.toLowerCase());
  expect(r.reserved, 'a session copy that is offered reserves the session amount').toBe(SESSION);
});

test('2. once the talk has moved on, an unrelated question does not carry the transcript: the ledger reserves the standard amount', async () => {
  test.skip(!aiOn, NO_AI);
  await fill(owner, mir, copyAt, 6);
  const r = await ask(sA, mir, 'Name one fruit that is yellow.');
  expect(r.reserved, 'folded: the standard reservation').toBe(STANDARD);
  expect(r.answer.toLowerCase(), 'and the transcript token is not in a reply that was never shown it').not.toContain(CODE_WORD.toLowerCase());
});

test('3. a pronoun alone does not reopen it, and the agent says it has something set aside', async () => {
  test.skip(!aiOn, NO_AI);
  const r = await ask(sA, mir, `What did she say about the code word? Answer in one line. If you were not shown the text, end your answer with the exact token ${SET_ASIDE}; otherwise never write that token.`);
  expect(r.reserved).toBe(STANDARD);
  expect(r.answer, 'it says it has something set aside').toContain(SET_ASIDE);
  expect(r.answer.toLowerCase(), 'and it does not invent the fact').not.toContain(CODE_WORD.toLowerCase());
});

test('4. naming the speaker reopens it: the full reservation and a correct answer on the synthetic fact', async () => {
  test.skip(!aiOn, NO_AI);
  const first = SPEAKER_NAME.split(' ')[0];
  const r = await ask(sA, mir, `What did ${first} say the code word was? Reply with the code word only.`);
  expect(r.reserved, 'naming the speaker reopens the session copy').toBe(SESSION);
  expect(r.answer.toLowerCase()).toContain(CODE_WORD.toLowerCase());
});

test('5. "what did she say last <weekday>" with a source dated that weekday gets the right date', async () => {
  test.skip(!aiOn, NO_AI);
  const o2 = await mk(`P1619 Live Date ${RUN}`);
  const sp2 = await mk(`Octavia Brindle${SAFE}`);
  const s2 = await signIn(o2);
  const mir2 = await mirrorOf(s2);
  const conv = await dm(o2, sp2);
  const d = new Date(Date.now() - 3 * 86_400_000);
  d.setUTCHours(12, 0, 0, 0);
  const dateIso = d.toISOString().slice(0, 10);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const { data: src } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: conv, author_id: sp2.user.id, body: `The delivery moved to the north warehouse, reference code ${SAFE}.`, created_at: d.toISOString() }).select('id').single();
  const copy = await ok<Anyrow>(s2.client.rpc('clarify_chat_message', { p_source: src!.id }), 'clarify the dated message');
  await fill(o2, mir2, copy.created_at, 6);
  // a folded line also carries the date, so the date alone would not prove the copy reopened: the answer must also carry her reference code
  const r = await ask(s2, mir2, `What did she say last ${weekday}? Reply with the date it was said, as YYYY-MM-DD, then the reference code she gave.`);
  expect(r.answer.toLowerCase(), 'the weekday reopened the copy: her own words were read').toContain(SAFE.toLowerCase());
  expect(r.answer, 'with the right UTC date').toContain(dateIso);
});
