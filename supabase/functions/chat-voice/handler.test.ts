// Deno test: run from the repo root with
//   deno test --config supabase/functions/deno.json -A supabase/functions/chat-voice/
//
// P1576 Part B. Every gate of handleChatVoice, exercised with fakes. Each refusal sits next to the
// same call succeeding for the caller entitled to it (the control), so a handler that refuses
// everything cannot pass.
import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ERR,
  handleChatVoice,
  MAX_UPLOAD_BYTES,
  PLAYBACK_TTL_SECONDS,
  UPLOAD_TTL_SECONDS,
  VOICE_MAX_MS,
  type CommitInput,
  type HandlerDeps,
} from './handler.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '44444444-4444-4444-8444-444444444444';
const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CONV = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MIRROR_CONV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UPLOAD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
/** Keys are bound to their uploader: <conversation>/<user>/<upload>.wav */
const KEY = `${CONV}/${ALICE}/${UPLOAD_ID}.wav`;
const BOB_KEY = `${CONV}/${BOB}/${UPLOAD_ID}.wav`;
const MSG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SECRET = 'cron-secret-value';

/** A canonical 16 kHz mono 16-bit WAV header declaring `seconds` of audio; `size` is the stored object size. */
function wavHead(seconds: number, opts: { sampleRate?: number; channels?: number; bits?: number; declared?: number } = {}) {
  const sampleRate = opts.sampleRate ?? 16000;
  const channels = opts.channels ?? 1;
  const bits = opts.bits ?? 16;
  const dataBytes = opts.declared ?? Math.round(seconds * sampleRate * channels * (bits / 8));
  const b = new Uint8Array(44);
  const v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * (bits / 8), true);
  v.setUint16(32, channels * (bits / 8), true); v.setUint16(34, bits, true);
  tag(36, 'data'); v.setUint32(40, dataBytes, true);
  return { head: b, size: 44 + dataBytes };
}

/** The stored object as readObject returns it: the header fakes above, zero-filled to `size` bytes. */
function full(x: { head: Uint8Array; size: number }): Uint8Array {
  const b = new Uint8Array(x.size);
  b.set(x.head.subarray(0, Math.min(x.head.length, x.size)));
  return b;
}

/** Both reads for one stored object: the ranged header and the full body (the body is a spy-able call). */
function stored(x: { head: Uint8Array; size: number } | Uint8Array, bodyCalls?: string[]): Partial<HandlerDeps> {
  const bytes = x instanceof Uint8Array ? x : full(x);
  return {
    readObjectHead: () => Promise.resolve({ head: bytes.subarray(0, 1024), size: x instanceof Uint8Array ? x.length : x.size }),
    readObject: (key) => { bodyCalls?.push(key); return Promise.resolve(bytes); },
  };
}

/** wavHead(seconds) with real PCM: a ramp, so the waveform is not silent. */
function wavWithRamp(seconds: number): Uint8Array {
  const b = full(wavHead(seconds));
  const v = new DataView(b.buffer);
  const n = (b.length - 44) / 2;
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round((i / n) * 30000), true);
  return b;
}

type Calls = {
  signed: string[]; read: string[]; deleted: string[]; commits: CommitInput[]; background: Promise<unknown>[];
  body: string[]; transcribed: string[]; sweeps: number; playbackSigned: string[]; checks: Array<[string, string]>; committedChecks: string[]; reserves: Array<[string, string]>;
};

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { calls: Calls } {
  const calls: Calls = {
    signed: [], read: [], body: [], deleted: [], commits: [], background: [], transcribed: [], sweeps: 0,
    playbackSigned: [], checks: [], committedChecks: [], reserves: [],
  };
  return {
    calls,
    corsHeaders: { 'Access-Control-Allow-Origin': 'http://localhost:5001' },
    envReady: true,
    cronSecret: SECRET,
    getUserId: (t) => Promise.resolve(t === 'alice' ? ALICE : t === 'bob' ? BOB : t === 'mallory' ? MALLORY : null),
    newId: () => UPLOAD_ID,
    // ALICE is a member of CONV and OTHER_CONV; MIRROR_CONV is her own mirror (voice notes allowed since the
    // founder's decision, so the DATABASE says ok); MALLORY is nowhere.
    checkPost: (uid, conv) => {
      calls.checks.push([uid, conv]);
      if (uid !== ALICE && uid !== BOB) return Promise.resolve('forbidden');
      if (conv === MIRROR_CONV) return Promise.resolve(uid === ALICE ? 'ok' : 'forbidden');
      return Promise.resolve(conv === CONV || conv === OTHER_CONV ? 'ok' : 'forbidden');
    },
    // upload mode: membership + a quota slot, in one call, BEFORE anything is signed
    reserveUpload: (uid, conv) => {
      calls.reserves.push([uid, conv]);
      if (uid !== ALICE && uid !== BOB) return Promise.resolve('forbidden');
      if (conv === MIRROR_CONV) return Promise.resolve(uid === ALICE ? 'ok' : 'forbidden');
      return Promise.resolve(conv === CONV || conv === OTHER_CONV ? 'ok' : 'forbidden');
    },
    signUpload: (key) => {
      calls.signed.push(key);
      return Promise.resolve({ uploadUrl: `https://storage.googleapis.com/b/${key}?sig`, headers: { 'Content-Type': 'audio/wav' } });
    },
    readObjectHead: (key) => {
      calls.read.push(key);
      return Promise.resolve(wavHead(5));
    },
    readObject: (key) => {
      calls.body.push(key);
      return Promise.resolve(full(wavHead(5)));
    },
    isKeyCommitted: (key) => {
      calls.committedChecks.push(key);
      return Promise.resolve(false);
    },
    commitMessage: (input) => {
      calls.commits.push(input);
      return Promise.resolve({ kind: 'ok', message: { id: MSG, conversation_id: input.conversationId, audio_duration_ms: input.durationMs } });
    },
    playbackTarget: (uid, id) =>
      Promise.resolve(uid !== ALICE ? { kind: 'forbidden' } : id === MSG ? { kind: 'ok', objectKey: KEY } : { kind: 'gone' }),
    signPlayback: (key) => {
      calls.playbackSigned.push(key);
      return Promise.resolve(`https://storage.googleapis.com/b/${key}?get`);
    },
    background: (p) => { calls.background.push(p); },
    transcribeMessage: (id) => { calls.transcribed.push(id); return Promise.resolve(); },
    sweep: () => { calls.sweeps++; return Promise.resolve({ retried: 0, purged: 0, failedExhausted: 0 }); },
    ...overrides,
    // Not part of HandlerDeps any more: a failed commit never deletes. The spy stays so a handler that
    // starts deleting again (it would have to add the dependency back) is caught by every test below.
    ...({ deleteObject: (key: string) => { calls.deleted.push(key); return Promise.resolve(); } } as object),
  };
}

function req(bearer: string | null, body: unknown, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (bearer !== null) headers['Authorization'] = `Bearer ${bearer}`;
  return new Request('https://example.com/functions/v1/chat-voice', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(deps: HandlerDeps, bearer: string | null, body: unknown, extra: Record<string, string> = {}) {
  const res = await handleChatVoice(req(bearer, body, extra), deps);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// ── gates common to the user modes ───────────────────────────────────────────

Deno.test('OPTIONS answers the preflight', async () => {
  const res = await handleChatVoice(new Request('https://example.com', { method: 'OPTIONS' }), makeDeps());
  assertEquals(res.status, 200);
});

Deno.test('500 when the environment is not ready, before anything else runs', async () => {
  const deps = makeDeps({ envReady: false });
  assertEquals((await call(deps, 'alice', { mode: 'upload', conversationId: CONV })).status, 500);
  assertEquals(deps.calls.signed.length, 0);
});

Deno.test('401 without a Bearer token, and for a token that resolves to nobody', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, null, { mode: 'upload', conversationId: CONV })).status, 401);
  assertEquals((await call(deps, 'nobody', { mode: 'upload', conversationId: CONV })).status, 401);
  assertEquals(deps.calls.signed.length, 0);
});

Deno.test('400 for a body that is not JSON, and for an unknown mode', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', 'not json')).status, 400);
  assertEquals((await call(deps, 'alice', { mode: 'nope' })).status, 400);
  assertEquals((await call(deps, 'alice', {})).status, 400);
});

// ── upload ───────────────────────────────────────────────────────────────────

Deno.test('upload: a member gets a signed PUT for a server-derived key (control)', async () => {
  const deps = makeDeps();
  const { status, json } = await call(deps, 'alice', { mode: 'upload', conversationId: CONV });
  assertEquals(status, 200);
  assertEquals(json.objectKey, KEY);
  assertMatch(json.uploadUrl, /^https:\/\/storage\.googleapis\.com\//);
  assertEquals(json.maxBytes, MAX_UPLOAD_BYTES);
  assertEquals(deps.calls.signed, [KEY]);
  assertEquals(deps.calls.reserves, [[ALICE, CONV]]);
  // the upload URL is short-lived: after it expires nobody can re-create an object that purge removed
  assertEquals(UPLOAD_TTL_SECONDS, 300);
  assertEquals(json.expiresInSeconds, UPLOAD_TTL_SECONDS);
});

Deno.test('upload: the client cannot choose the key', async () => {
  const deps = makeDeps();
  const { json } = await call(deps, 'alice', { mode: 'upload', conversationId: CONV, objectKey: `${OTHER_CONV}/x.wav`, fileName: 'x' });
  assertEquals(json.objectKey, KEY);
  // bound to the caller: a different member gets a key under THEIR id
  const bob = await call(deps, 'bob', { mode: 'upload', conversationId: CONV });
  assertEquals(bob.json.objectKey, BOB_KEY);
});

Deno.test('upload: a non-member is refused and nothing is signed', async () => {
  const deps = makeDeps();
  const { status, json } = await call(deps, 'mallory', { mode: 'upload', conversationId: CONV });
  assertEquals(status, 403);
  assertEquals(json.error, ERR.notMember);
  assertEquals(deps.calls.signed.length, 0);
});

Deno.test('upload: the owner\'s own mirror conversation is accepted; another user is refused', async () => {
  const deps = makeDeps();
  const { status, json } = await call(deps, 'alice', { mode: 'upload', conversationId: MIRROR_CONV });
  assertEquals(status, 200);
  assertEquals(json.objectKey, `${MIRROR_CONV}/${ALICE}/${UPLOAD_ID}.wav`);
  const other = await call(deps, 'bob', { mode: 'upload', conversationId: MIRROR_CONV });
  assertEquals(other.status, 403);
});

Deno.test('upload: a malformed conversation or thread id is a 400 before any lookup', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', { mode: 'upload', conversationId: 'abc' })).status, 400);
  assertEquals((await call(deps, 'alice', { mode: 'upload', conversationId: CONV, threadRootId: 'zzz' })).status, 400);
  assertEquals(deps.calls.reserves.length, 0);
});

Deno.test('upload: over the upload quota answers 429 and signs nothing (control: the same caller below the quota succeeds above)', async () => {
  const deps = makeDeps({ reserveUpload: () => Promise.resolve('rate') });
  const { status, json } = await call(deps, 'alice', { mode: 'upload', conversationId: CONV });
  assertEquals(status, 429);
  assertEquals(json.error, ERR.uploadRate);
  assertEquals(deps.calls.signed.length, 0);
});

Deno.test('upload: the quota is reserved before the URL is signed, once per request', async () => {
  const order: string[] = [];
  const deps = makeDeps({
    reserveUpload: () => { order.push('reserve'); return Promise.resolve('ok'); },
    signUpload: () => { order.push('sign'); return Promise.resolve({ uploadUrl: 'https://storage.googleapis.com/x', headers: {} }); },
  });
  await call(deps, 'alice', { mode: 'upload', conversationId: CONV });
  assertEquals(order, ['reserve', 'sign']);
});

// ── commit ───────────────────────────────────────────────────────────────────

const COMMIT = { mode: 'commit', conversationId: CONV, objectKey: KEY };

Deno.test('commit: success inserts as the caller, keyed on the upload id, then transcribes in the background (control)', async () => {
  const deps = makeDeps();
  const { status, json } = await call(deps, 'alice', { ...COMMIT, threadRootId: OTHER_CONV, replyToId: MSG });
  assertEquals(status, 200);
  assertEquals(json.message.id, MSG);
  assertEquals(deps.calls.commits.length, 1);
  const c = deps.calls.commits[0];
  assertEquals(c.userId, ALICE);
  assertEquals(c.conversationId, CONV);
  assertEquals(c.objectKey, KEY);
  assertEquals(c.durationMs, 5000);
  assertEquals(c.clientId, UPLOAD_ID);
  assertEquals(c.threadRootId, OTHER_CONV);
  assertEquals(c.replyToId, MSG);
  // the transcript job is handed to the runtime, and runs for THIS message
  assertEquals(deps.calls.background.length, 1);
  await Promise.all(deps.calls.background);
  assertEquals(deps.calls.transcribed, [MSG]);
  assertEquals(deps.calls.deleted, []);
});

Deno.test('commit: a non-member is refused before the object is even read', async () => {
  const deps = makeDeps();
  // her OWN key, so only membership can refuse her (the uploader binding is tested separately)
  const { status } = await call(deps, 'mallory', { ...COMMIT, objectKey: `${CONV}/${MALLORY}/${UPLOAD_ID}.wav` });
  assertEquals(status, 403);
  assertEquals(deps.calls.read, []);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: a voice note in the owner\'s mirror conversation is committed and transcribed', async () => {
  const deps = makeDeps();
  const key = `${MIRROR_CONV}/${ALICE}/${UPLOAD_ID}.wav`;
  const { status } = await call(deps, 'alice', { mode: 'commit', conversationId: MIRROR_CONV, objectKey: key });
  assertEquals(status, 200);
  assertEquals(deps.calls.commits.length, 1);
  assertEquals(deps.calls.commits[0].conversationId, MIRROR_CONV);
  assertEquals(deps.calls.background.length, 1);
});

Deno.test('commit: 50 peak bars are computed from the stored PCM and passed to the database', async () => {
  const deps = makeDeps({ ...stored(wavWithRamp(5)) });
  const { status } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 200);
  const bars = deps.calls.commits[0].waveform!;
  assertEquals(bars.length, 50);
  assertEquals(bars[49], 100);
  assertEquals(bars.every((b, i) => Number.isInteger(b) && b >= 0 && b <= 100 && (i === 0 || b >= bars[i - 1])), true);
});

Deno.test('commit: a silent clip commits with 50 zeros', async () => {
  const deps = makeDeps();
  await call(deps, 'alice', COMMIT);
  assertEquals(deps.calls.commits[0].waveform, new Array(50).fill(0));
});

Deno.test('commit: a key under another conversation prefix is rejected without touching storage', async () => {
  const deps = makeDeps();
  // ALICE is a member of both, so only the prefix check can stop this
  const { status, json } = await call(deps, 'alice', { ...COMMIT, objectKey: `${OTHER_CONV}/${ALICE}/${UPLOAD_ID}.wav` });
  assertEquals(status, 400);
  assertEquals(json.error, ERR.badKey);
  assertEquals(deps.calls.read, []);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: keys that are not <conversation>/<uuid>.wav are rejected', async () => {
  const deps = makeDeps();
  for (const objectKey of [
    `${CONV}/../${OTHER_CONV}/${UPLOAD_ID}.wav`, `${CONV}/${ALICE}/${UPLOAD_ID}.webm`, `${CONV}/${ALICE}/x.wav`,
    `${CONV}/${ALICE}/${UPLOAD_ID}.wav/extra`, UPLOAD_ID, '', `/${CONV}/${ALICE}/${UPLOAD_ID}.wav`, 7,
    `${CONV}/${UPLOAD_ID}.wav`, // the old two-segment shape, no uploader
  ]) {
    const { status } = await call(deps, 'alice', { ...COMMIT, objectKey });
    assertEquals(status, 400, `key ${JSON.stringify(objectKey)}`);
  }
  assertEquals(deps.calls.read, []);
});

Deno.test('commit: no uploaded object is a 404 and writes nothing', async () => {
  const deps = makeDeps({ readObjectHead: () => Promise.resolve(null) });
  assertEquals((await call(deps, 'alice', COMMIT)).status, 404);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: a clip over the limit answers 413 and the object is left to the lifecycle rule, not deleted', async () => {
  const over = wavHead(VOICE_MAX_MS / 1000 + 1);
  const deps = makeDeps({ ...stored(over) });
  const { status, json } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 413);
  assertEquals(json.error, ERR.tooLong);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: exactly the limit is accepted (boundary control)', async () => {
  const exact = wavHead(VOICE_MAX_MS / 1000);
  const deps = makeDeps({ ...stored(exact) });
  const { status } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 200);
  assertEquals(deps.calls.commits[0].durationMs, VOICE_MAX_MS);
  assertEquals(deps.calls.deleted, []);
});

Deno.test('commit: a header that lies about its length is rejected by comparing it with the stored size', async () => {
  // header says 1 s, but 100 s of bytes were stored
  const liar = { head: wavHead(1).head, size: 44 + 100 * 32000 };
  const deps = makeDeps({ ...stored(liar) });
  const { status } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 400);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: not a WAV, or not 16 kHz mono 16-bit, or empty is rejected (object left in place)', async () => {
  const cases: Array<{ head: Uint8Array; size: number }> = [
    { head: new Uint8Array(64).fill(7), size: 64 },
    wavHead(5, { sampleRate: 44100 }),
    wavHead(5, { channels: 2 }),
    wavHead(5, { bits: 8 }),
    wavHead(0),
  ];
  for (const c of cases) {
    const deps = makeDeps({ ...stored(c) });
    assertEquals((await call(deps, 'alice', COMMIT)).status, 400);
    assertEquals(deps.calls.deleted, []);
    assertEquals(deps.calls.commits.length, 0);
  }
});

Deno.test('commit: the database refusing for rate answers 429 and leaves the object so the same key can be retried', async () => {
  const deps = makeDeps({ commitMessage: () => Promise.resolve({ kind: 'rate' }) });
  const { status } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 429);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.background.length, 0);
});

Deno.test('commit: the database refusing (membership changed, bad thread) leaves the object, no transcript job', async () => {
  const deps = makeDeps({ commitMessage: () => Promise.resolve({ kind: 'forbidden' }) });
  assertEquals((await call(deps, 'alice', COMMIT)).status, 403);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.background.length, 0);
});

// ── commit: keys belong to their uploader (IDOR) ─────────────────────────────

Deno.test('commit: another member\'s key is refused before ANY storage call, and their audio is not deleted', async () => {
  const deps = makeDeps();
  // BOB is a member of CONV, so only the uploader binding can stop this. ALICE's key, BOB's session.
  const { status, json } = await call(deps, 'bob', { ...COMMIT, objectKey: KEY });
  assertEquals(status, 403);
  assertEquals(json.error, ERR.notYours);
  assertEquals(deps.calls.read, []);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.committedChecks, []);
  assertEquals(deps.calls.commits.length, 0);
  assertEquals(deps.calls.background.length, 0);
});

Deno.test('commit: the uploader binding also holds when the commit would otherwise FAIL (the failure path must not delete a stranger\'s object)', async () => {
  // BOB tries to commit ALICE's key into a chat where the database would refuse him; nothing is deleted.
  const deps = makeDeps({ commitMessage: () => Promise.resolve({ kind: 'rate' }), ...stored(wavHead(121)) });
  for (const mode of [COMMIT, { ...COMMIT, threadRootId: OTHER_CONV }]) {
    assertEquals((await call(deps, 'bob', { ...mode, objectKey: KEY })).status, 403);
  }
  assertEquals(deps.calls.deleted, []);
});

Deno.test('commit: the owner\'s own key still works (control for the binding)', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'bob', { ...COMMIT, objectKey: BOB_KEY })).status, 200);
  assertEquals(deps.calls.commits[0].userId, BOB);
});

Deno.test('commit: a key that is already a committed message replays it and is never deleted, whatever fails', async () => {
  for (const failure of [{ kind: 'forbidden' }, { kind: 'rate' }, { kind: 'unsupported' }] as const) {
    const deps = makeDeps({
      isKeyCommitted: () => Promise.resolve(true),
      commitMessage: () => Promise.resolve(failure),
      ...stored(wavHead(121)),
    });
    await call(deps, 'alice', COMMIT);
    assertEquals(deps.calls.deleted, [], `failure ${failure.kind}`);
  }
});

Deno.test('commit: a committed key is idempotent: the database replays the row, no re-validation, no second transcript job', async () => {
  const deps = makeDeps({ isKeyCommitted: () => Promise.resolve(true) });
  const { status, json } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 200);
  assertEquals(json.message.id, MSG);
  assertEquals(deps.calls.read, []);
  assertEquals(deps.calls.commits.length, 1);
  assertEquals(deps.calls.background.length, 0);
  assertEquals(deps.calls.deleted, []);
});

Deno.test('commit: if the database cannot say whether the key is committed, nothing is deleted', async () => {
  const deps = makeDeps({ isKeyCommitted: () => Promise.reject(new Error('db down')) });
  const { status } = await call(deps, 'alice', COMMIT);
  assertEquals(status, 500);
  assertEquals(deps.calls.deleted, []);
  assertEquals(deps.calls.commits.length, 0);
});

Deno.test('commit: a rejected commit is retryable with the same key (nothing was consumed or removed)', async () => {
  let n = 0;
  const deps = makeDeps({ commitMessage: (input) => Promise.resolve(++n === 1 ? { kind: 'rate' } : { kind: 'ok', message: { id: MSG, audio_duration_ms: input.durationMs } }) });
  assertEquals((await call(deps, 'alice', COMMIT)).status, 429);
  assertEquals((await call(deps, 'alice', COMMIT)).status, 200);
  assertEquals(deps.calls.deleted, []);
});

// ── playback ─────────────────────────────────────────────────────────────────

Deno.test('playback: a member gets a signed GET for the stored key (control)', async () => {
  const deps = makeDeps();
  const { status, json } = await call(deps, 'alice', { mode: 'playback', messageId: MSG });
  assertEquals(status, 200);
  assertMatch(json.url, /^https:\/\/storage\.googleapis\.com\//);
  assertEquals(deps.calls.playbackSigned, [KEY]);
  // short on purpose: a deleted note must stop being playable within minutes, not a quarter of an hour
  assertEquals(PLAYBACK_TTL_SECONDS, 120);
  assertEquals(json.expiresInSeconds, PLAYBACK_TTL_SECONDS);
});

Deno.test('playback: a non-member is refused and no URL is signed', async () => {
  const deps = makeDeps();
  const { status } = await call(deps, 'mallory', { mode: 'playback', messageId: MSG });
  assertEquals(status, 403);
  assertEquals(deps.calls.playbackSigned, []);
});

Deno.test('playback: audio that is gone (expired or deleted) answers 410', async () => {
  const deps = makeDeps({ playbackTarget: () => Promise.resolve({ kind: 'gone' }) });
  const { status, json } = await call(deps, 'alice', { mode: 'playback', messageId: MSG });
  assertEquals(status, 410);
  assertEquals(json.error, ERR.gone);
  assertEquals(deps.calls.playbackSigned, []);
});

Deno.test('playback: a malformed message id is a 400', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', { mode: 'playback', messageId: 'x' })).status, 400);
});

// ── sweep ────────────────────────────────────────────────────────────────────

Deno.test('sweep: only the cron secret opens it (control + refusals)', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, null, { mode: 'sweep' })).status, 401);
  assertEquals((await call(deps, null, { mode: 'sweep' }, { 'x-cron-secret': 'wrong' })).status, 401);
  // a signed-in user's JWT is not the secret
  assertEquals((await call(deps, 'alice', { mode: 'sweep' })).status, 401);
  assertEquals(deps.calls.sweeps, 0);
  const ok = await call(deps, 'anon-jwt-for-gateway', { mode: 'sweep' }, { 'x-cron-secret': SECRET });
  assertEquals(ok.status, 200);
  assertEquals(deps.calls.sweeps, 1);
});

Deno.test('sweep: an unconfigured secret never matches an empty header', async () => {
  const deps = makeDeps({ cronSecret: '' });
  assertEquals((await call(deps, null, { mode: 'sweep' }, { 'x-cron-secret': '' })).status, 401);
  assertEquals((await call(deps, null, { mode: 'sweep' })).status, 401);
  assertEquals(deps.calls.sweeps, 0);
});

Deno.test('the cron secret does not open the user modes', async () => {
  const deps = makeDeps();
  const { status } = await call(deps, null, { mode: 'playback', messageId: MSG }, { 'x-cron-secret': SECRET });
  assertEquals(status, 401);
});

Deno.test('commit: a bad header never triggers the full read', async () => {
  const cases = [
    { head: new Uint8Array(64).fill(7), size: 64 }, wavHead(5, { sampleRate: 44100 }), wavHead(VOICE_MAX_MS / 1000 + 1),
    { head: wavHead(1).head, size: 44 + 100 * 32000 },
  ];
  for (const c of cases) {
    const deps = makeDeps({ readObjectHead: () => Promise.resolve(c) });
    const { status } = await call(deps, 'alice', COMMIT);
    assertEquals(status === 400 || status === 413, true);
    assertEquals(deps.calls.body, []);
  }
});

Deno.test('commit: a valid header reads the body exactly once; a body that differs from the header size is rejected', async () => {
  const ok = makeDeps();
  assertEquals((await call(ok, 'alice', COMMIT)).status, 200);
  assertEquals(ok.calls.body, [KEY]);
  const swapped = makeDeps({ readObject: () => Promise.resolve(new Uint8Array(100)) });
  assertEquals((await call(swapped, 'alice', COMMIT)).status, 400);
  assertEquals(swapped.calls.commits.length, 0);
});
