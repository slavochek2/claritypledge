/**
 * @file p1619-mirror-fold-copies.spec.ts
 * @description P1619 (migration 20261105233000): the mirror agent stops re-sending copies once the talk moves on. Part 1 pins the pure
 * matcher (_mirror_copy_matches) rule by rule; part 2 drives the real _mirror_begin_job (no model call) through the 5/6 boundary, the
 * restart by naming, what is not counted, the reservation/profile agreement, older rows reaching the offer after folding, and the
 * erasure schedules. Synthetic fixtures only. A begun job is released with _mirror_fail_job (actual 0), as the p1604 spec does.
 *
 * The erasure schedule "a copy row held by an erase is skipped by the lock pass" needs a held row lock, which PostgREST cannot build (each
 * call is its own transaction): it runs through the psql harness (e2e/helpers/test-psql.ts, as p1592-erasure-interleaving) and skips with a
 * reason unless P1592_INTERLEAVING=1. The review-fix tests (the system root, the replies count, the candidate cap, the bad date, the
 * quoted time of a channel ask) are PostgREST-only and always run.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestOrganization, createTestMembership, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { RUN, signIn, ok, mirrorOf, myChatIds, adminConversation, purgeChatFor, sleep, type SignedIn } from '../helpers/test-chat';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HELD_LOCK_ENABLED, HELD_LOCK_SKIP_REASON, dropHeld, psql } from '../helpers/test-psql';

type Anyrow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
test.describe.configure({ mode: 'serial', timeout: 240_000 });

const users: TestUser[] = [];
const convs: string[] = [];
const roomIds: string[] = [];
const orgs: TestOrganization[] = [];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(randomBytes(6), (b) => ALPHABET[b % 32]).join('');
const voiceKey = (conv: string, uid: string) => { const id = randomUUID(); return { p_client_id: id, p_object_key: `${conv}/${uid}/${id}.wav` }; };
const refOf = (uid: string) => createHash('sha256').update(`p1512:${uid}`).digest('hex');

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
const iso = (ms: number) => new Date(ms).toISOString();

test.afterAll(async () => {
  test.setTimeout(240_000);
  if (roomIds.length) await supabaseAdmin.from('transcribe_rooms').delete().in('id', roomIds);
  await purgeChatFor(users.map((u) => u.user.id), convs);
  for (const u of users) await deleteTestUser(u.user.id).catch(() => {});
  for (const o of orgs) await deleteTestOrganization(o.id).catch(() => {});
});

// ── Part 1: the matcher, rule by rule ────────────────────────────────────────

const match = async (text: string, o: { names?: string[]; title?: string | null; src?: string | null; ref?: string } = {}) =>
  ok<boolean>(supabaseAdmin.rpc('_mirror_copy_matches', {
    p_text: text, p_names: o.names ?? [], p_title: o.title ?? null, p_src_at: o.src ?? null, p_ref: o.ref ?? '2026-11-06T12:00:00Z',
  }), `_mirror_copy_matches(${text})`);

test.describe('P1619: what names a copy', () => {
  test('speakers: exact words of 3+ characters, Cyrillic and case folded; short words and placeholders never', async () => {
    expect(await match('what did Karolin say?', { names: ['Karolin Vesna'] })).toBe(true);
    expect(await match('что сказала АЛИСА?', { names: ['Алиса Тестова'] }), 'Cyrillic, upper case in the text').toBe(true);
    expect(await match('what did Karoline say?', { names: ['Karolin Vesna'] }), 'a longer word is not the name').toBe(false);
    expect(await match('what did Bo say, and she, he, her?', { names: ['Bo Lu'] }), 'two-letter names and pronouns').toBe(false);
    expect(await match('she wrote it', { names: ['Karolin Vesna'] }), 'a pronoun with nothing to match').toBe(false);
  });
  test('"mirror", "general", "user", "deleted", "agent" never reopen a copy', async () => {
    const o = { names: ['Deleted user', 'mirror agent'], title: 'General' };
    for (const word of ['mirror', 'general', 'user', 'deleted', 'agent', 'the mirror general user']) {
      expect(await match(word, o), word).toBe(false);
    }
    expect(await match('team', { title: 'Team · General' }), 'a one-word title shorter than the phrase rule is still its own phrase: "team" has 4 characters').toBe(true);
    expect(await match('hello', { title: 'Mirror' })).toBe(false);
    expect(await match('hello eli', { title: 'Eli' }), 'a title under 4 characters never matches').toBe(false);
  });
  test('title: the whole phrase, without a trailing "· General"', async () => {
    const title = 'Quartz Harbor · General';
    expect(await match('what about quartz harbor?', { title })).toBe(true);
    expect(await match('what about quartz?', { title }), 'part of the phrase').toBe(false);
    expect(await match('quartz harbors', { title }), 'not a whole word').toBe(false);
  });
  test('date: the explicit forms, in UTC, of the source', async () => {
    const src = '2026-11-04T10:00:00Z';
    for (const t of ['2026-11-04', 'on 4 nov', 'nov 4', '4 november', 'November 4?', '04.11', '4.11.', '4/11', 'on 04.11, what']) {
      expect(await match(t, { src }), t).toBe(true);
    }
    for (const t of ['14 nov', '5 nov', '24.11', '2026-11-14', 'nov 40', '4 oct', 'the fourth']) {
      expect(await match(t, { src }), t).toBe(false);
    }
    // UTC, not the offset the timestamp was written in: 23:30 at -05:00 is already the 5th in UTC
    const late = '2026-11-04T23:30:00-05:00';
    expect(await match('5 nov', { src: late })).toBe(true);
    expect(await match('4 nov', { src: late })).toBe(false);
  });
  test('today, yesterday and an English weekday: only within their days; other languages do not match', async () => {
    const src = '2026-11-04T10:00:00Z'; // a Wednesday
    expect(await match('today', { src, ref: '2026-11-04T20:00:00Z' })).toBe(true);
    expect(await match('today', { src, ref: '2026-11-05T01:00:00Z' })).toBe(false);
    expect(await match('yesterday', { src, ref: '2026-11-05T01:00:00Z' })).toBe(true);
    expect(await match('yesterday', { src, ref: '2026-11-06T01:00:00Z' })).toBe(false);
    expect(await match('what did she say on Wednesday', { src, ref: '2026-11-10T09:00:00Z' }), '6 days').toBe(true);
    expect(await match('wednesday', { src, ref: '2026-11-12T09:00:00Z' }), '8 days: still inside').toBe(true);
    expect(await match('wednesday', { src, ref: '2026-11-13T09:00:00Z' }), '9 days: outside').toBe(false);
    expect(await match('last Tuesday', { src: '2026-11-03T10:00:00Z', ref: '2026-11-10T09:00:00Z' }), '"last Tuesday" on a Tuesday').toBe(true);
    expect(await match('вчера', { src, ref: '2026-11-05T01:00:00Z' }), 'recorded limit: no other language').toBe(false);
  });
});

test.describe('P1619 review fixes: the matcher', () => {
  const tokens = (text: string) => ok<string[]>(supabaseAdmin.rpc('_mirror_tokens', { p_text: text }), `_mirror_tokens(${text})`);
  test('words split on every non-alphanumeric: an emoji or symbol never stays glued to a name', async () => {
    expect(await tokens('Bob🙂 said')).toEqual(['bob', 'said']);
    expect(await tokens('x😀y👨‍👩‍👧z')).toEqual(['x', 'y', 'z']);
    expect(await tokens('a_b-c')).toEqual(['a', 'b', 'c']);
    expect(await match('what did Bob🙂 say', { names: ['Bob Lee'] }), 'the name with an emoji after it').toBe(true);
    expect(await match('Bob🙂', { names: ['Bob Lee'] })).toBe(true);
  });
  test('scripts and combining marks are never broken: Cyrillic, a Devanagari name, a decomposed accent', async () => {
    expect(await tokens('АЛИСА, привет')).toEqual(['алиса', 'привет']);
    expect(await tokens('राहुल शर्मा (Rahul)'), 'the vowel signs stay inside the word').toEqual(['राहुल', 'शर्मा', 'rahul']);
    expect(await match('राहुल ने क्या कहा?', { names: ['राहुल शर्मा'] }), 'a Devanagari name matches whole').toBe(true);
    expect(await match('राहल', { names: ['राहुल शर्मा'] }), 'CONTROL: a different word does not match').toBe(false);
    for (const [text, name] of [['سارة؟', 'سارة'], ['سارة، x', 'سارة'], ['राहुल।', 'राहुल'], ['田中太？', '田中太'], ['田中太： x', '田中太'], ['דודי־ x', 'דודי'], ['佐々木?', '佐々木']]) {
      expect(await match(text, { names: [name] }), `${name} followed by its own script's punctuation still matches`).toBe(true);
    }
    expect(await match('what did Zoe\u0308 say', { names: ['Zoë Ann'] }), 'e + combining diaeresis equals the precomposed name').toBe(true);
  });
  test('the array-taking helper decides exactly as the text one does', async () => {
    const cases: Array<{ text: string; names: string[]; title: string | null; src: string | null }> = [
      { text: 'what did Karolin say?', names: ['Karolin Vesna'], title: null, src: null },
      { text: 'what about quartz harbor?', names: [], title: 'Quartz Harbor · General', src: null },
      { text: 'and on 4 nov?', names: [], title: null, src: '2026-11-04T10:00:00Z' },
      { text: 'nothing here', names: ['Karolin Vesna'], title: 'Quartz Harbor', src: '2026-11-04T10:00:00Z' },
    ];
    for (const c of cases) {
      const viaText = await match(c.text, { names: c.names, title: c.title, src: c.src });
      const toks = await ok<string[]>(supabaseAdmin.rpc('_mirror_tokens', { p_text: c.text }), 'tokens');
      const ntok = (await Promise.all(c.names.map((n) => ok<string[]>(supabaseAdmin.rpc('_mirror_tokens', { p_text: n }), 'name tokens')))).flat().filter((t) => t.length >= 3);
      const phrase = c.title ? (await tokens(c.title.replace(/\s*·\s*general\s*$/i, ''))).join(' ') : null;
      const viaArr = await ok<boolean>(supabaseAdmin.rpc('_mirror_copy_matches_arr', {
        p_toks: toks, p_norm: c.text.normalize('NFC').toLowerCase(), p_ntok: ntok, p_phrase: phrase && phrase.length >= 4 ? phrase : null,
        p_src_at: c.src, p_ref: '2026-11-06T12:00:00Z',
      }), 'matches_arr');
      expect(viaArr, c.text).toBe(viaText);
    }
  });
  test('a snapshot time that cannot be a date parses to null, one that can does not', async () => {
    const parse = (t: string | null) => ok<string | null>(supabaseAdmin.rpc('_mirror_parse_ts', { p_text: t }), `_mirror_parse_ts(${t})`);
    expect(await parse('2026-13-45T10:00:00Z')).toBeNull();
    expect(await parse('2026-02-30')).toBeNull();
    expect(await parse('garbage')).toBeNull();
    expect(await parse(null)).toBeNull();
    expect(await parse('2026-11-04T10:00:00Z'), 'CONTROL: a real time parses').not.toBeNull();
  });
});

// ── Part 2: the real _mirror_begin_job ───────────────────────────────────────

interface Begin { status: string; session?: boolean; reserved_usd?: number; attempt?: number; context?: Anyrow[]; outside?: Anyrow[] | null; chat_total?: number | null }
interface Scene { owner: TestUser; sA: SignedIn; speaker: TestUser; sS: SignedIn; conv: string; mir: string; copyId: string; copyAt: string; srcFact: string }

const begin = (job: string) => ok<Begin>(supabaseAdmin.rpc('_mirror_begin_job', { p_job: job }), '_mirror_begin_job');
const release = (job: string, attempt?: number) =>
  supabaseAdmin.rpc('_mirror_fail_job', { p_job: job, p_code: 'test', p_actual_usd: 0, p_attempt: attempt ?? 1 });
const send = (s: SignedIn, conv: string, body: string, extra: Record<string, unknown> = {}) =>
  ok<Anyrow>(s.client.rpc('send_chat_message', { p_conversation: conv, p_body: body, ...extra }), `send ${body.slice(0, 24)}`);
const requestReply = async (s: SignedIn, message: string) =>
  (await ok<Array<{ job_id: string }>>(s.client.rpc('mirror_request_reply', { p_message: message }), 'mirror_request_reply'))[0]!;
const isFolded = (b: Begin) => (b.context ?? []).some((c) => c.folded);
const hasOpenCopy = (b: Begin) => (b.context ?? []).some((c) => c.clarify);

/** One owner, one speaker, their DM, a source message written `srcAt`, and the owner's Clarify copy of it. */
async function scene(label: string, speakerName: string, srcAt = Date.now() - 3_600_000): Promise<Scene> {
  const owner = await mk(`P1619 Owner ${label} ${RUN}`);
  const speaker = await mk(speakerName);
  const [sA, sS] = [await signIn(owner), await signIn(speaker)];
  const conv = await dm(owner, speaker);
  const srcFact = `SRC-FACT-${label}-${RUN}`;
  const { data: src } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: conv, author_id: speaker.user.id, body: srcFact, created_at: iso(srcAt) }).select('id').single();
  const mir = await mirrorOf(sA);
  const copy = await ok<Anyrow>(sA.client.rpc('clarify_chat_message', { p_source: src!.id }), 'clarify');
  return { owner, sA, speaker, sS, conv, mir, copyId: copy.id, copyAt: copy.created_at, srcFact };
}
/** n owner messages the model has not answered, placed just after the copy (admin insert, no job). */
async function fill(sc: Scene, n: number, extra: Record<string, unknown> = {}, text = 'filler words') {
  const base = Date.parse(sc.copyAt);
  const rows = Array.from({ length: n }, (_, i) => ({ conversation_id: sc.mir, author_id: sc.owner.user.id, body: `${text} ${i + 1}`, created_at: iso(base + 1 + i), ...extra }));
  const { error } = await supabaseAdmin.from('chat_messages').insert(rows);
  expect(error, error?.message).toBeNull();
  await sleep(150); // the trigger is sent after every fill
}
/** One owner message, its job begun and released: what the model would be offered for it. */
async function turn(sc: Scene, text: string, thread?: string): Promise<Begin & { job: string; msg: Anyrow }> {
  const msg = await send(sc.sA, sc.mir, text, thread ? { p_thread_root: thread } : {});
  const job = await requestReply(sc.sA, msg.id);
  const b = await begin(job.job_id);
  expect(b.status, `begin for "${text}"`).toBe('run');
  await release(job.job_id, b.attempt);
  return { ...b, job: job.job_id, msg };
}

test.describe('P1619: the window', () => {
  test('owner messages 1-5 after a copy keep it open, message 6 folds it, a naming message reopens it for that message and the next 5', async () => {
    const sc = await scene('win', `Marcella Orlin${RUN}`);
    const open: boolean[] = [];
    for (let i = 1; i <= 6; i++) {
      const b = await turn(sc, `neutral message ${i}`);
      open.push(hasOpenCopy(b));
      if (i === 6) expect(isFolded(b), 'folded: one line, not the copy').toBe(true);
    }
    expect(open, 'messages 1-5 open, the 6th folded').toEqual([true, true, true, true, true, false]);

    const named = await turn(sc, `what did Marcella say there?`);
    expect(hasOpenCopy(named), 'a message naming the speaker reopens it').toBe(true);
    const after: boolean[] = [];
    for (let i = 1; i <= 6; i++) after.push(hasOpenCopy(await turn(sc, `unrelated ${i}`)));
    expect(after, 'the next 5 stay open, the 6th after the match folds again').toEqual([true, true, true, true, true, false]);
  });

  test('the folded request holds no transcript text; the line says who, when, where, how long and "not shown"', async () => {
    const sc = await scene('line', `Ottilie Brandt${RUN}`);
    await fill(sc, 6);
    const b = await turn(sc, 'a question about something else');
    const copyItem = b.context!.find((c) => c.folded)!;
    expect(copyItem, 'the copy is one folded line').toBeTruthy();
    expect(JSON.stringify(b.context), 'the copied text is not sent').not.toContain(sc.srcFact);
    expect(copyItem.folded.from).toContain('Ottilie');
    expect(copyItem.folded.lines).toBe(1);
    expect(copyItem.folded.speakers[0]).toContain('Ottilie');
    expect(typeof copyItem.folded.original_at).toBe('string');
    expect(copyItem.at, 'the row keeps its own time').toBeTruthy();
  });

  test('what is NOT counted: a voice note still transcribing, a second copy, a channel ask; a transcribed voice note IS counted', async () => {
    const sc = await scene('notcount', `Perpetua Ivanov${RUN}`);
    await fill(sc, 4);
    // a voice note with no transcript yet, a channel ask, and a second copy of another source message
    const pend = await supabaseAdmin.rpc('chat_commit_voice_note', {
      p_uid: sc.owner.user.id, p_conversation: sc.mir, ...voiceKey(sc.mir, sc.owner.user.id), p_duration_ms: 3000,
    });
    expect(pend.error, pend.error?.message).toBeNull();
    const ask = await supabaseAdmin.from('chat_messages').insert({ conversation_id: sc.mir, author_id: sc.owner.user.id, body: 'a private channel ask', kind: 'message', context_conversation_id: sc.conv, created_at: iso(Date.parse(sc.copyAt) + 20) });
    expect(ask.error, ask.error?.message).toBeNull();
    const { data: src2 } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: sc.conv, author_id: sc.speaker.user.id, body: 'second source', created_at: iso(Date.now() - 3_000_000) }).select('id').single();
    await ok(sc.sA.client.rpc('clarify_chat_message', { p_source: src2!.id }), 'second clarify');
    await sleep(150);
    const fifth = await turn(sc, 'fifth counted message');
    const first = fifth.context!.find((c) => c.clarify?.body === sc.srcFact || c.folded);
    expect(first?.clarify, 'four fills + the trigger are 5 counted messages: the first copy is still open').toBeTruthy();

    // CONTROL: the same arrangement where a TRANSCRIBED voice note stands in the window folds it
    const sc2 = await scene('count2', `Rosamund Teller${RUN}`);
    await fill(sc2, 4);
    const v = await ok<Anyrow>(supabaseAdmin.rpc('chat_commit_voice_note', {
      p_uid: sc2.owner.user.id, p_conversation: sc2.mir, ...voiceKey(sc2.mir, sc2.owner.user.id), p_duration_ms: 3000,
    }), 'voice commit');
    await ok(supabaseAdmin.rpc('chat_voice_finish_transcription', { p_message: v.id, p_ok: true, p_text: `voice words ${RUN}` }), 'finish transcription');
    await sleep(150);
    const sixth = await turn(sc2, 'the sixth counted message');
    expect(isFolded(sixth), 'a transcribed voice note counts: m1-m4 + voice + trigger = 6, so the copy folds').toBe(true);
  });

  test('the date of the source, and the title of its chat, reopen a folded copy; a pronoun alone does not, and the line says what was set aside', async () => {
    const sc = await scene('date', `Thaddeus Quill${RUN}`, Date.parse('2026-10-14T09:00:00Z'));
    await fill(sc, 6);
    const pronoun = await turn(sc, 'what did he say about it?');
    expect(isFolded(pronoun), 'a pronoun with nothing to match').toBe(true);
    expect(JSON.stringify(pronoun.context)).toContain('"folded"');
    const dated = await turn(sc, 'and what was said on 14 oct?');
    expect(hasOpenCopy(dated), 'the date reopens it').toBe(true);
    expect(JSON.stringify(dated.context), 'with a correct, synthetic fact').toContain(sc.srcFact);
    expect(JSON.stringify(dated.context)).toContain('2026-10-14T09:00');

    // title: a group chat named for the organisation
    const org = await createTestOrganization({ name: `Quartz Harbor ${RUN}` });
    orgs.push(org);
    const owner = await mk(`P1619 Owner title ${RUN}`);
    const other = await mk(`Ysolde Varga${RUN}`);
    await createTestMembership(org.id, owner.user.id);
    await createTestMembership(org.id, other.user.id);
    const [sA, sO] = [await signIn(owner), await signIn(other)];
    await myChatIds(sA.client); await myChatIds(sO.client);
    const gconv = await adminConversation('group', { org_id: org.id });
    const srcMsg = await send(sO, gconv, `GROUP-FACT-${RUN}`);
    const mir = await mirrorOf(sA);
    const copy = await ok<Anyrow>(sA.client.rpc('clarify_chat_message', { p_source: srcMsg.id }), 'clarify group');
    const tsc: Scene = { owner, sA, speaker: other, sS: sO, conv: gconv, mir, copyId: copy.id, copyAt: copy.created_at, srcFact: `GROUP-FACT-${RUN}` };
    await fill(tsc, 6);
    expect(isFolded(await turn(tsc, 'general question'))).toBe(true);
    expect(isFolded(await turn(tsc, 'the mirror general user agent')), '"mirror", "general", "user" do not reopen it').toBe(true);
    const titled = await turn(tsc, `anything new in quartz harbor ${RUN}?`);
    expect(hasOpenCopy(titled), 'the chat title as a whole phrase reopens it').toBe(true);
  });
});

// ── session copies: profile and reservation agree ───────────────────────────

async function sessionScene(label: string, speakerName: string, lines = 6, padChars = 0): Promise<Scene & { ids: string[]; rootId: string }> {
  const owner = await mk(`P1619 Owner ${label} ${RUN}`);
  const speaker = await mk(speakerName);
  const [sA, sS] = [await signIn(owner), await signIn(speaker)];
  const conv = await dm(owner, speaker);
  let t0 = Date.now() - 3_600_000;
  const { data: root } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: conv, author_id: null, body: 'session|2026-11-04T10:00:00Z|1', system_kind: 'outside_rounds', created_at: iso(t0++) }).select('id').single();
  const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: conv, ended_at: new Date().toISOString() }).select('id').single();
  roomIds.push(room!.id);
  await supabaseAdmin.from('transcribe_session_threads').insert({ room_id: room!.id, conversation_id: conv, root_message_id: root!.id });
  const ids: string[] = [];
  const rows = Array.from({ length: lines }, (_, i) => ({ conversation_id: conv, author_id: i % 2 ? owner.user.id : speaker.user.id, body: `${'x'.repeat(padChars)} session line ${label} ${i}`, thread_root_id: root!.id, is_transcription: true, created_at: iso(t0++) }));
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await supabaseAdmin.from('chat_messages').insert(rows.slice(i, i + 50)).select('id');
    expect(error, error?.message).toBeNull();
    ids.push(...(data ?? []).map((r) => r.id as string));
  }
  const mir = await mirrorOf(sA);
  const copy = await ok<Anyrow>(sA.client.rpc('clarify_chat_message', { p_source: ids[ids.length - 1] }), 'clarify session');
  return { owner, sA, speaker, sS, conv, mir, copyId: copy.id, copyAt: copy.created_at, srcFact: `session line ${label} ${lines - 1}`, ids, rootId: root!.id as string };
}
const STANDARD = 0.105;
const SESSION = 0.225;

test.describe('P1619: profile and reservation agree with the fold state', () => {
  test('one open session copy: session profile and 0.225; the same copy folded: standard, 0.105, and no transcript', async () => {
    const sc = await sessionScene('one', `Wilhelmina Kask${RUN}`);
    const open = await turn(sc, 'about the session');
    expect([open.session, Number(open.reserved_usd)]).toEqual([true, SESSION]);
    await fill(sc, 6);
    const folded = await turn(sc, 'something unrelated');
    expect([folded.session, Number(folded.reserved_usd)], 'a folded session does not widen or reserve more').toEqual([false, STANDARD]);
    expect(JSON.stringify(folded.context)).not.toContain('session line one');
    expect(folded.context!.find((c) => c.folded)!.folded.lines, 'root + 6 lines').toBeGreaterThan(1);
  });

  test('several copies: one open among folded ones is a session reply; all folded is a standard reply', async () => {
    const sc = await sessionScene('many', `Xanthe Moro${RUN}`);
    await fill(sc, 6);
    const { data: src2 } = await supabaseAdmin.from('chat_messages').select('id').eq('conversation_id', sc.conv).not('thread_root_id', 'is', null).limit(1).single();
    const second = await ok<Anyrow>(sc.sA.client.rpc('clarify_chat_message', { p_source: src2!.id }), 'second session copy');
    await sleep(150);
    const mixed = await turn(sc, 'neutral');
    expect(mixed.context!.filter((c) => c.folded).length, 'the older copy folded').toBe(1);
    expect(hasOpenCopy(mixed), `the newer copy ${second.id} is open`).toBe(true);
    expect([mixed.session, Number(mixed.reserved_usd)]).toEqual([true, SESSION]);
    await fill({ ...sc, copyAt: second.created_at }, 6, {}, 'later filler');
    const none = await turn(sc, 'neutral again');
    expect(none.context!.filter((c) => c.folded).length).toBe(2);
    expect([none.session, Number(none.reserved_usd)]).toEqual([false, STANDARD]);
  });

  test('a thread question: an open copy in `outside` counts toward the profile; an unrelated thread reserves the standard amount', async () => {
    const sc = await sessionScene('out', `Yarrow Pell${RUN}`);
    const rootMsg = await send(sc.sA, sc.mir, 'thread root');
    const unrelated = await turn(sc, 'a neutral question in a thread', rootMsg.id);
    expect(unrelated.outside!.some((c) => c.clarify || c.folded), 'the main-chat copy is offered as outside').toBe(true);
    expect(unrelated.outside!.some((c) => c.folded), 'but folded: only a match in THIS thread opens it').toBe(true);
    expect([unrelated.session, Number(unrelated.reserved_usd)], 'an unrelated thread with a fresh main-chat copy').toEqual([false, STANDARD]);
    const named = await turn(sc, 'what did Yarrow say?', rootMsg.id);
    expect(named.outside!.some((c) => c.clarify), 'named in the thread: open in outside').toBe(true);
    expect([named.session, Number(named.reserved_usd)]).toEqual([true, SESSION]);
    // the copy's own thread: always open
  });

  test('older messages crowded out by the open copy reach the model once it folds', async () => {
    const owner = await mk(`P1619 Owner crowd ${RUN}`);
    const speaker = await mk(`Zebulon Arne${RUN}`);
    const [sA] = [await signIn(owner)];
    const mir = await mirrorOf(sA);
    // 56 older messages of ~3,000 characters (the marked one is the 50th newest: past the open 300,000 window by ~8,000, inside the folded 150,000 by ~3,000), then a ~158,000-character session copy: open, the copy takes most of the 300,000 window
    const base = Date.now() - 7_200_000;
    const older = Array.from({ length: 56 }, (_, i) => ({ conversation_id: mir, author_id: owner.user.id, body: `${i === 6 ? `CROWDED-FACT-${RUN} ` : ''}${'o'.repeat(2_980)}`, created_at: iso(base + i) }));
    const { error } = await supabaseAdmin.from('chat_messages').insert(older);
    expect(error, error?.message).toBeNull();
    // the session copy lives in a DM between the same two people
    const conv = await dm(owner, speaker);
    let t0 = Date.now() - 3_600_000;
    const { data: root } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: conv, author_id: null, body: 'session|2026-11-04T10:00:00Z|1', system_kind: 'outside_rounds', created_at: iso(t0++) }).select('id').single();
    const { data: room } = await supabaseAdmin.from('transcribe_rooms').insert({ code: newCode(), conversation_id: conv, ended_at: new Date().toISOString() }).select('id').single();
    roomIds.push(room!.id);
    await supabaseAdmin.from('transcribe_session_threads').insert({ room_id: room!.id, conversation_id: conv, root_message_id: root!.id });
    const rows = Array.from({ length: 200 }, (_, i) => ({ conversation_id: conv, author_id: i % 2 ? owner.user.id : speaker.user.id, body: `${'x'.repeat(790)} ${i}`, thread_root_id: root!.id, is_transcription: true, created_at: iso(t0++) }));
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += 50) {
      const { data, error: e2 } = await supabaseAdmin.from('chat_messages').insert(rows.slice(i, i + 50)).select('id');
      expect(e2, e2?.message).toBeNull();
      ids.push(...(data ?? []).map((r) => r.id as string));
    }
    const copy = await ok<Anyrow>(sA.client.rpc('clarify_chat_message', { p_source: ids[199] }), 'clarify');
    const sc: Scene = { owner, sA, speaker, sS: sA, conv, mir, copyId: copy.id, copyAt: copy.created_at, srcFact: 'x' };
    const open = await turn(sc, 'about the session');
    expect(open.session).toBe(true);
    expect(JSON.stringify(open.context), 'while open, the copy crowds the older message out').not.toContain(`CROWDED-FACT-${RUN}`);
    await fill(sc, 6);
    const folded = await turn(sc, 'something unrelated');
    expect(isFolded(folded)).toBe(true);
    expect(JSON.stringify(folded.context), 'after folding it reaches the model').toContain(`CROWDED-FACT-${RUN}`);
  });
});

// ── review fixes, through the real _mirror_begin_job ─────────────────────────

test.describe('P1619 review fixes: what a folded line says and what it survives', () => {
  test('a copy of a system root (a session title, no author) folds with no author and no "Deleted user" speaker', async () => {
    const sc = await sessionScene('sysroot', `Ludovika Pane${RUN}`);
    const copy = await ok<Anyrow>(sc.sA.client.rpc('clarify_chat_message', { p_source: sc.rootId }), 'clarify the session root');
    await fill({ ...sc, copyAt: copy.created_at }, 6);
    const b = await turn(sc, 'something unrelated');
    const rootLine = b.context!.find((c) => c.folded && !('from' in c.folded));
    expect(rootLine, 'the root copy is folded and names no author').toBeTruthy();
    expect(JSON.stringify(rootLine)).not.toContain('Deleted user');
    expect(rootLine!.folded.speakers, 'the real speakers still have their slots').toEqual(expect.arrayContaining([expect.stringContaining('Ludovika')]));
    expect(rootLine!.folded.speakers).not.toContain('Deleted user');
    expect(JSON.stringify(b.context), 'no folded line anywhere names a false author').not.toContain('Deleted user');
    // CONTROL, on a scene that holds a copy of a real line: it keeps its author
    const real = await scene('sysrootctl', `Ottilie Marsh${RUN}`);
    await fill(real, 6);
    const r = await turn(real, 'something unrelated');
    expect(r.context!.some((c) => c.folded?.from?.includes('Ottilie')), 'a copy with an author still names it').toBe(true);
  });

  test('a folded copy that roots a mirror thread keeps its replies count', async () => {
    const sc = await scene('replies', `Ignatia Roe${RUN}`);
    await send(sc.sA, sc.mir, 'a reply inside the copy thread', { p_thread_root: sc.copyId });
    await fill(sc, 6);
    const b = await turn(sc, 'a neutral main chat question');
    const line = b.context!.find((c) => c.folded);
    expect(line, 'the copy is folded').toBeTruthy();
    expect(line!.replies, 'its one reply is counted').toBe(1);
  });

  test('a copy whose snapshot date is impossible does not abort the start', async () => {
    const sc = await scene('baddate', `Caspian Dole${RUN}`);
    const bad = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: sc.mir, author_id: sc.owner.user.id, kind: 'clarify', created_at: iso(Date.parse(sc.copyAt) - 1),
      forward_snapshot: { author_name: 'Nobody Special', conversation_title: 'Odd chat', body: 'odd', created_at: '2026-13-45T10:00:00Z', thread: [] },
    });
    expect(bad.error, bad.error?.message).toBeNull();
    await fill(sc, 6);
    const b = await turn(sc, 'something neutral');   // turn() asserts status 'run': an exception would have thrown in begin()
    expect(b.context!.filter((c) => c.folded).length, 'both copies folded, the bad one without a time').toBe(2);
  });

  test('a copy past the 2000-row candidate cap: the thread root is still classified open, nothing unclassified is sent in full', async () => {
    test.setTimeout(300_000);
    // No lowered-cap hook exists, so this builds the real over-cap shape: 2001 cheap copies NEWER than one old session-flagged copy that
    // roots a mirror thread. Cheap on purpose (small snapshots); the fixture is removed with the users' chat rows.
    const owner = await mk(`P1619 Owner cap ${RUN}`);
    const sA = await signIn(owner);
    const mir = await mirrorOf(sA);
    const rootAt = Date.now() - 3 * 86_400_000;
    const secret = `OVERCAP-ROOT-${RUN}`;
    const { data: root, error: rErr } = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: mir, author_id: owner.user.id, kind: 'clarify', created_at: iso(rootAt),
      forward_snapshot: { author_name: 'Old Speaker', conversation_title: 'Old archive', body: secret, created_at: iso(rootAt - 3_600_000), thread: [], thread_total: 0, session_thread: true },
    }).select('id').single();
    expect(rErr, rErr?.message).toBeNull();
    const fillers = Array.from({ length: 2001 }, (_, i) => ({
      conversation_id: mir, author_id: owner.user.id, kind: 'clarify', created_at: iso(rootAt + 1_000 + i),
      forward_snapshot: { author_name: 'Filler Person', conversation_title: 'Filler stack', body: 'filler', created_at: iso(rootAt), thread: [] },
    }));
    for (let i = 0; i < fillers.length; i += 500) {
      const { error } = await supabaseAdmin.from('chat_messages').insert(fillers.slice(i, i + 500));
      expect(error, error?.message).toBeNull();
    }
    await send(sA, mir, 'a neutral reply in the old thread', { p_thread_root: root!.id });
    const sc = { owner, sA, mir } as unknown as Scene;
    const b = await turn(sc, 'a neutral question in the thread', root!.id);
    const rootItem = b.context!.find((c) => c.clarify);
    expect(rootItem, 'the thread root is offered as an OPEN copy, though 2001 newer copies exist').toBeTruthy();
    expect(JSON.stringify(rootItem)).toContain(secret);
    expect([b.session, Number(b.reserved_usd)], 'the profile and the reservation agree with the open session copy').toEqual([true, SESSION]);
    expect((b.outside ?? []).filter((c) => c.clarify), 'no main-chat copy the classifier did not open is sent in full').toEqual([]);
  });
});

test.describe('P1619 review fixes: a channel ask carries the quoted message\'s own time', () => {
  test('a forwarded message in the channel shows its original time to the model', async () => {
    const org = await createTestOrganization({ name: `P1619 Ask Org ${RUN}` });
    orgs.push(org);
    const owner = await mk(`P1619 Owner ask ${RUN}`);
    await createTestMembership(org.id, owner.user.id);
    const sA = await signIn(owner);
    await myChatIds(sA.client);
    const gconv = await adminConversation('group', { org_id: org.id });
    await mirrorOf(sA);
    const sentAt = '2026-10-01T12:00:00+00:00';
    const fwd = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: gconv, author_id: owner.user.id, kind: 'forward',
      forward_snapshot: { author_name: 'Quoted Person', body: `QUOTED-${RUN}`, created_at: sentAt },
    });
    expect(fwd.error, fwd.error?.message).toBeNull();
    const ask = await ok<Anyrow>(sA.client.rpc('mirror_ask', { p_channel: gconv, p_body: `what is that ${RUN}`, p_client_id: randomUUID() }), 'mirror_ask');
    const job = await requestReply(sA, ask.id);
    const b = await begin(job.job_id);
    expect(b.status).toBe('run');
    const quoted = b.context!.find((c) => c.quoted)?.quoted;
    expect(quoted, 'the forwarded message is in the ask context').toBeTruthy();
    expect(Date.parse(quoted.sent_at), 'with its original time').toBe(Date.parse(sentAt));
    await release(job.job_id, b.attempt);
  });
});

// ── erasure: a person named on a folded line ─────────────────────────────────

async function foldedScene(label: string): Promise<Scene> {
  const sc = await scene(label, `Evander Holt${label}${RUN}`);
  await fill(sc, 6);
  return sc;
}
const erase = async (s: SignedIn) => { const { error } = await s.client.rpc('erase_my_account'); expect(error, error?.message).toBeNull(); };
const adminJob = async (id: string) => (await supabaseAdmin.from('mirror_jobs').select('state, derived_refs').eq('id', id).single()).data as { state: string; derived_refs: string[] | null };
const body = async (id: string) => (await supabaseAdmin.from('chat_messages').select('body').eq('id', id).single()).data!.body as string | null;
async function complete(job: string, text: string): Promise<Anyrow> {
  const { data, error } = await supabaseAdmin.rpc('_mirror_complete_job', { p_job: job, p_body: text, p_actual_usd: 0 });
  if (error) throw new Error(error.message);
  return data as Anyrow;
}

test.describe('P1619: erasing a person named on a folded line', () => {
  test('erase BEFORE the lock pass: the start never sees their words or their name, and the job does not carry their ref', async () => {
    const sc = await foldedScene('e1');
    const msg = await send(sc.sA, sc.mir, 'unrelated question');
    const job = await requestReply(sc.sA, msg.id);
    await erase(sc.sS);
    const b = await begin(job.job_id);
    if (b.status === 'run') {
      expect(JSON.stringify(b.context)).not.toContain('Evander');
      expect(JSON.stringify(b.context)).not.toContain(sc.srcFact);
      expect((await adminJob(job.job_id)).derived_refs ?? []).not.toContain(refOf(sc.speaker.user.id));
      await release(job.job_id, b.attempt);
    } else {
      expect(['cancelled', 'busy', 'capped']).toContain(b.status);
    }
  });

  test('erase AFTER the reservation: the folded line named them, so the answer is cleared', async () => {
    const sc = await foldedScene('e2');
    const msg = await send(sc.sA, sc.mir, 'unrelated question');
    const job = await requestReply(sc.sA, msg.id);
    const b = await begin(job.job_id);
    expect(b.status).toBe('run');
    expect(isFolded(b)).toBe(true);
    expect((await adminJob(job.job_id)).derived_refs, 'a folded line still names every speaker').toContain(refOf(sc.speaker.user.id));
    const answer = await complete(job.job_id, `answer ${RUN}`);
    await erase(sc.sS);
    expect(await body(answer.id as string), 'the answer built on the folded line is cleared').toBeNull();
  });

  test('a RESTART with a changed fold state: the copy was open on the first attempt and folded on the second; the refs still name the speaker', async () => {
    const sc = await scene('e3', `Fenella Dray${RUN}`);
    await sleep(250);
    const msg = await send(sc.sA, sc.mir, 'unrelated question');
    const job = await requestReply(sc.sA, msg.id);
    const first = await begin(job.job_id);
    expect(first.status).toBe('run');
    expect(hasOpenCopy(first), 'first attempt: nothing else in the window, so open').toBe(true);
    // the attempt dies: it looks abandoned, and six earlier owner messages exist by the time it is restarted
    await supabaseAdmin.from('mirror_jobs').update({ started_at: iso(Date.now() - 600_000) }).eq('id', job.job_id);
    await fill(sc, 6);
    const second = await begin(job.job_id);
    expect(second.status).toBe('run');
    expect(isFolded(second), 'second attempt: the same trigger, a different fold state').toBe(true);
    expect((await adminJob(job.job_id)).derived_refs).toContain(refOf(sc.speaker.user.id));
    const answer = await complete(job.job_id, `restart answer ${RUN}`);
    await erase(sc.sS);
    expect(await body(answer.id as string)).toBeNull();
  });

  test('a copy row held by an erase is skipped by the lock pass: not read, not sent, absent from the refs, and it does not hold the session reservation (held row lock over psql)', async () => {
    test.skip(!HELD_LOCK_ENABLED, HELD_LOCK_SKIP_REASON);
    const sc = await sessionScene('held', `Hesper Vane${RUN}`);
    const app = `p1619_held_${RUN}`.slice(0, 60);
    const msg = await send(sc.sA, sc.mir, 'about the session');
    const job = await requestReply(sc.sA, msg.id);
    // an erase (or an edit) holding the copy row: FOR UPDATE conflicts with the start's FOR SHARE SKIP LOCKED
    const held = psql(`SET application_name = '${app}'; BEGIN; SELECT 1 FROM public.chat_messages WHERE id = '${sc.copyId}' FOR UPDATE; SELECT 'C_HELD'; SELECT pg_sleep(180);`);
    try {
      await held.seen('C_HELD');
      const b = await begin(job.job_id);
      expect(b.status).toBe('run');
      expect(b.context!.some((c) => c.clarify || c.folded), 'the held copy is neither read nor sent, open or folded').toBe(false);
      expect(JSON.stringify(b.context)).not.toContain(sc.srcFact);
      expect([b.session, Number(b.reserved_usd)], 'a skipped session copy does not hold the session profile or 0.225').toEqual([false, STANDARD]);
      expect((await adminJob(job.job_id)).derived_refs ?? [], 'the refs follow the rows that were locked and read').not.toContain(refOf(sc.speaker.user.id));
      await release(job.job_id, b.attempt);
    } finally {
      try { held.proc.kill(); } catch { /* gone */ }
      await dropHeld(app);
    }
    // CONTROL: the same copy, lock released, is an open session copy again and names its speaker
    const msg2 = await send(sc.sA, sc.mir, 'about the session again');
    const job2 = await requestReply(sc.sA, msg2.id);
    const b2 = await begin(job2.job_id);
    expect(b2.status).toBe('run');
    expect(hasOpenCopy(b2), 'unheld: open').toBe(true);
    expect([b2.session, Number(b2.reserved_usd)]).toEqual([true, SESSION]);
    expect((await adminJob(job2.job_id)).derived_refs).toContain(refOf(sc.speaker.user.id));
    await release(job2.job_id, b2.attempt);
  });
});
