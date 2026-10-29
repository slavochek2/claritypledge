// Deno test: from supabase/functions, `deno test --config deno.json -A mirror-reply/`
//
// P1576: mirror-reply's two entrances, with fakes. Each refusal sits next to the same call succeeding
// (the control), so a handler that refuses everything cannot pass.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { handleMirrorReply, INTERNAL_SECRET_OFF, safeEqual, type MirrorDeps } from './handler.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const MSG = '33333333-3333-4333-8333-333333333333';
const SECRET = 'internal-secret-value';
const RUN = { status: 'run', kind: 'reply', owner_id: OWNER, reserved_usd: 0.01, attempt: 1, context: [] };
const GOOD_MODEL = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'I hear you.' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } };

function deps(over: Partial<MirrorDeps> = {}, log: string[] = []): MirrorDeps {
  return {
    cors: {},
    envReady: true,
    enabled: true,
    internalSecret: SECRET,
    authUser: async (t) => (t === 'good' ? OWNER : null),
    hasTerms: async () => true,
    requestReply: async () => ({ job_id: JOB, state: 'queued' }),
    loadJob: async (id) => (id === JOB ? { owner_id: OWNER, kind: 'reply' } : null),
    rpc: async (name) => {
      log.push(name);
      if (name === '_mirror_begin_job') return { data: RUN, error: null };
      if (name === '_mirror_complete_job') return { data: { id: 'reply-row' }, error: null };
      return { data: null, error: null };
    },
    fit: async () => ({ contents: [] }) as never,
    callModel: async () => ({ status: 200, body: GOOD_MODEL }),
    ...over,
  };
}

const post = (headers: Record<string, string>, body: unknown) =>
  new Request('https://x/mirror-reply', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const internal = (secret: string, body: unknown = { job_id: JOB }) => post({ 'x-mirror-internal': secret }, body);

Deno.test('internal: the right secret runs a queued reply job end to end, with no user JWT', async () => {
  const log: string[] = [];
  const res = await handleMirrorReply(internal(SECRET), deps({}, log));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).state, 'done');
  assertEquals(log, ['_mirror_begin_job', '_mirror_complete_job']);
});

Deno.test('internal: wrong, empty and missing-value secrets are 401 and run nothing', async () => {
  for (const s of ['wrong', '', SECRET + 'x', SECRET.slice(1)]) {
    const log: string[] = [];
    const res = await handleMirrorReply(internal(s), deps({}, log));
    assertEquals(res.status, 401, `secret "${s}"`);
    assertEquals(log, []);
  }
});

Deno.test('internal: the off default refuses even a request that sends the off value', async () => {
  const log: string[] = [];
  for (const sent of [INTERNAL_SECRET_OFF, '']) {
    const res = await handleMirrorReply(internal(sent), deps({ internalSecret: INTERNAL_SECRET_OFF }, log));
    assertEquals(res.status, 401);
  }
  const unset = await handleMirrorReply(internal(''), deps({ internalSecret: '' }, log));
  assertEquals(unset.status, 401);
  assertEquals(log, []);
});

Deno.test('internal: a request with the header never falls back to the JWT path', async () => {
  const res = await handleMirrorReply(post({ 'x-mirror-internal': 'wrong', Authorization: 'Bearer good' }, { message_id: MSG }), deps());
  assertEquals(res.status, 401);
});

Deno.test('internal: unknown job and non-reply job are 404; a malformed id is 400', async () => {
  const log: string[] = [];
  const unknown = await handleMirrorReply(internal(SECRET, { job_id: '99999999-9999-4999-8999-999999999999' }), deps({}, log));
  assertEquals(unknown.status, 404);
  const ask = await handleMirrorReply(internal(SECRET), deps({ loadJob: async () => ({ owner_id: OWNER, kind: 'ask' }) }, log));
  assertEquals(ask.status, 404);
  const portrait = await handleMirrorReply(internal(SECRET), deps({ loadJob: async () => ({ owner_id: OWNER, kind: 'portrait' }) }, log));
  assertEquals(portrait.status, 404);
  assertEquals((await handleMirrorReply(internal(SECRET, { job_id: 'nope' }), deps())).status, 400);
  assertEquals(log, []);
});

Deno.test('internal: disabled mirror answers 503 and begins nothing (the job stays queued)', async () => {
  const log: string[] = [];
  const res = await handleMirrorReply(internal(SECRET), deps({ enabled: false }, log));
  assertEquals(res.status, 503);
  assertEquals((await res.json()).code, 'DISABLED');
  assertEquals(log, []);
});

Deno.test('internal: the OWNER of the job must have accepted the terms', async () => {
  const asked: string[] = [];
  const log: string[] = [];
  const res = await handleMirrorReply(internal(SECRET), deps({ hasTerms: async (id) => (asked.push(id), false) }, log));
  assertEquals(res.status, 409);
  assertEquals(asked, [OWNER]);
  assertEquals(log, []);
});

Deno.test('internal: a failing model records the failure on the same path as the user entrance', async () => {
  const log: string[] = [];
  const res = await handleMirrorReply(internal(SECRET), deps({ callModel: async () => ({ status: 429, body: null }) }, log));
  assertEquals(res.status, 429);
  assertEquals(log, ['_mirror_begin_job', '_mirror_fail_job']);
});

Deno.test('user: the JWT path still runs the job, and the transcript gate still serves Try again', async () => {
  const log: string[] = [];
  const ok = await handleMirrorReply(post({ Authorization: 'Bearer good' }, { message_id: MSG }), deps({}, log));
  assertEquals(ok.status, 200);
  assertEquals(log, ['_mirror_begin_job', '_mirror_complete_job']);

  const pending = await handleMirrorReply(post({ Authorization: 'Bearer good' }, { message_id: MSG }), deps({ requestReply: async () => ({ job_id: null, state: 'transcribing' }) }));
  assertEquals(pending.status, 202);
  const failed = await handleMirrorReply(post({ Authorization: 'Bearer good' }, { message_id: MSG }), deps({ requestReply: async () => ({ job_id: null, state: 'transcript_failed' }) }));
  assertEquals(failed.status, 409);
});

Deno.test('user: bad token 401, missing token 401, availability, disabled and terms gates', async () => {
  assertEquals((await handleMirrorReply(post({ Authorization: 'Bearer bad' }, { message_id: MSG }), deps())).status, 401);
  assertEquals((await handleMirrorReply(post({}, { message_id: MSG }), deps())).status, 401);
  const avail = await handleMirrorReply(post({ Authorization: 'Bearer good' }, { availability: true }), deps({ enabled: false }));
  assertEquals((await avail.json()).enabled, false);
  assertEquals((await handleMirrorReply(post({ Authorization: 'Bearer good' }, { message_id: MSG }), deps({ enabled: false }))).status, 503);
  assertEquals((await handleMirrorReply(post({ Authorization: 'Bearer good' }, { message_id: MSG }), deps({ hasTerms: async () => false }))).status, 409);
});

Deno.test('safeEqual: equal strings true, differing or different-length false', () => {
  assertEquals(safeEqual('abc', 'abc'), true);
  assertEquals(safeEqual('abc', 'abd'), false);
  assertEquals(safeEqual('abc', 'abcd'), false);
  assertEquals(safeEqual('', ''), true);
});
