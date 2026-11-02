// Deno test: run from the repo root with
//   deno test --config supabase/functions/deno.json -A supabase/functions/chat-voice/
//
// P1536 section 3c, X9 (S3c.6): the canvas mode of chat-voice's `commit`. The stored bytes are validated exactly as for any voice note,
// then the database is asked ONCE for the whole canvas send (draft, thread, message, run, audio row) through `commitCanvas`, acting
// for the user the Bearer token resolved to. Each refusal sits next to the same call succeeding (the control).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ERR,
  handleChatVoice,
  type CanvasCommitInput,
  type HandlerDeps,
} from './handler.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MIRROR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UPLOAD = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const KEY = `${MIRROR}/${ALICE}/${UPLOAD}.wav`;
const BOB_KEY = `${MIRROR}/${BOB}/${UPLOAD}.wav`;
const CANVAS = '33333333-3333-4333-8333-333333333333';
const VERSION = '44444444-4444-4444-8444-444444444444';
const DRAFT = '55555555-5555-4555-8555-555555555555';
const MSG = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function wav(seconds: number, opts: { rate?: number } = {}): Uint8Array {
  const rate = opts.rate ?? 16000;
  const data = Math.round(seconds * rate * 2);
  const b = new Uint8Array(44 + data);
  const v = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + data, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, data, true);
  for (let i = 0; i < data / 2; i++) v.setInt16(44 + i * 2, Math.round((i / (data / 2)) * 20000), true);
  return b;
}

interface Calls { canvas: CanvasCommitInput[]; terms: string[]; plain: number; read: string[]; body: string[]; background: Promise<unknown>[]; transcribed: string[]; deleted: string[] }

function makeDeps(over: Partial<HandlerDeps> = {}, audio: Uint8Array = wav(5)): HandlerDeps & { calls: Calls } {
  const calls: Calls = { canvas: [], terms: [], plain: 0, read: [], body: [], background: [], transcribed: [], deleted: [] };
  return {
    calls,
    corsHeaders: {},
    envReady: true,
    cronSecret: 'secret',
    getUserId: (t) => Promise.resolve(t === 'alice' ? ALICE : t === 'bob' ? BOB : null),
    newId: () => UPLOAD,
    checkPost: (uid, conv) => Promise.resolve(uid === ALICE && conv === MIRROR ? 'ok' : 'forbidden'),
    reserveUpload: () => Promise.resolve('ok'),
    signUpload: () => Promise.resolve({ uploadUrl: 'https://storage.googleapis.com/x', headers: {} }),
    readObjectHead: (k) => { calls.read.push(k); return Promise.resolve({ head: audio.subarray(0, 1024), size: audio.length }); },
    readObject: (k) => { calls.body.push(k); return Promise.resolve(audio); },
    isKeyCommitted: () => Promise.resolve(false),
    commitMessage: () => { calls.plain++; return Promise.resolve({ kind: 'ok', message: { id: MSG } }); },
    hasTerms: (uid) => { calls.terms.push(uid); return Promise.resolve(true); },
    commitCanvas: (input) => {
      calls.canvas.push(input);
      return Promise.resolve({ kind: 'ok', result: { status: 'ok', replayed: false, message_id: MSG, run_id: 'r1', draft_id: DRAFT } });
    },
    playbackTarget: () => Promise.resolve({ kind: 'gone' }),
    signPlayback: () => Promise.resolve(''),
    background: (p) => { calls.background.push(p); },
    transcribeMessage: (id) => { calls.transcribed.push(id); return Promise.resolve(); },
    sweep: () => Promise.resolve({}),
    ...over,
    ...({ deleteObject: (k: string) => { calls.deleted.push(k); return Promise.resolve(); } } as object),
  };
}

async function commit(deps: HandlerDeps, canvas: unknown, extra: Record<string, unknown> = {}, bearer = 'alice', key = KEY) {
  const res = await handleChatVoice(new Request('https://example.com/functions/v1/chat-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ mode: 'commit', conversationId: MIRROR, objectKey: key, canvas, ...extra }),
  }), deps);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const NEW_CANVAS = {};
const CLONE = { canvasId: CANVAS, fromVersionId: VERSION, boxRefs: ['canvas:problem'] };

Deno.test('canvas commit: validated bytes, one database call for the caller, transcription starts (control)', async () => {
  const deps = makeDeps();
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 200);
  assertEquals(json.canvas.status, 'ok');
  assertEquals(deps.calls.plain, 0); // the plain voice commit is NOT used: the canvas function owns the message
  assertEquals(deps.calls.canvas.length, 1);
  const c = deps.calls.canvas[0]!;
  assertEquals(c.userId, ALICE);
  assertEquals(c.clientId, UPLOAD); // the upload key's id is the client id
  assertEquals(c.objectKey, KEY);
  assertEquals(c.durationMs, 5000); // read from the stored header, never from the client
  assertEquals(c.waveform?.length, 50);
  assertEquals([c.canvasId, c.fromVersionId, c.expectedDraftId, c.expectedRevision, c.replace, c.boxRefs], [CANVAS, VERSION, null, null, false, ['canvas:problem']]);
  assertEquals(deps.calls.background.length, 1);
  await Promise.all(deps.calls.background);
  assertEquals(deps.calls.transcribed, [MSG]);
});

Deno.test('canvas commit: a new canvas needs no canvas fields', async () => {
  const deps = makeDeps();
  const { status } = await commit(deps, NEW_CANVAS);
  assertEquals(status, 200);
  const c = deps.calls.canvas[0]!;
  assertEquals([c.canvasId, c.fromVersionId, c.expectedDraftId, c.expectedRevision, c.replace, c.boxRefs], [null, null, null, null, false, null]);
});

Deno.test('canvas commit: an open draft carries its id, revision and replace flag through', async () => {
  const deps = makeDeps();
  await commit(deps, { canvasId: CANVAS, expectedDraftId: DRAFT, expectedRevision: 7, replace: true, fromVersionId: VERSION });
  const c = deps.calls.canvas[0]!;
  assertEquals([c.expectedDraftId, c.expectedRevision, c.replace], [DRAFT, 7, true]);
});

Deno.test('canvas commit: the caller is the token, whatever the body names', async () => {
  const deps = makeDeps();
  await commit(deps, { ...CLONE, userId: BOB, p_uid: BOB, ownerId: BOB });
  assertEquals(deps.calls.canvas[0]!.userId, ALICE);
  // another user's key is refused before any storage read or database write
  const other = makeDeps();
  const r = await commit(other, CLONE, {}, 'alice', BOB_KEY);
  assertEquals(r.status, 403);
  assertEquals(other.calls.read.length + other.calls.canvas.length, 0);
});

Deno.test('canvas commit: a refused send (stale view, busy) is the database answer, writes nothing and starts no transcription', async () => {
  const deps = makeDeps({
    commitCanvas: () => Promise.resolve({ kind: 'ok', result: { status: 'refused', code: 'stale_view', revision: 3 } }),
  });
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 200);
  assertEquals(json.canvas, { status: 'refused', code: 'stale_view', revision: 3 });
  assertEquals(deps.calls.background.length, 0);
});

Deno.test('canvas commit: a repeat (the first answer was lost) returns the first result and does not start a second transcription', async () => {
  const deps = makeDeps({
    isKeyCommitted: () => Promise.resolve(true),
    commitCanvas: (i) => { deps.calls.canvas.push(i); return Promise.resolve({ kind: 'ok', result: { status: 'ok', replayed: true, message_id: MSG, run_id: 'r1' } }); },
  });
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 200);
  assertEquals(json.canvas.replayed, true);
  assertEquals(deps.calls.read.length, 0); // an object a message already references is not read again
  assertEquals(deps.calls.background.length, 0);
});

Deno.test('canvas commit: a recording that is not a valid WAV is refused and nothing is written', async () => {
  const deps = makeDeps({}, wav(5, { rate: 44100 }));
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 400);
  assertEquals(json.error, ERR.badAudio);
  assertEquals(deps.calls.canvas.length, 0);
  assertEquals(deps.calls.deleted.length, 0);
});

Deno.test('canvas commit: a recording over two minutes is refused and nothing is written', async () => {
  const deps = makeDeps({}, wav(125));
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 413);
  assertEquals(json.error, ERR.tooLong);
  assertEquals(deps.calls.canvas.length, 0);
});

Deno.test('canvas commit: a missing object is refused (404) and nothing is written', async () => {
  const deps = makeDeps({ readObjectHead: () => Promise.resolve(null) });
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 404);
  assertEquals(json.error, ERR.notFound);
  assertEquals(deps.calls.canvas.length, 0);
});

Deno.test('canvas commit: an object that changed between the two reads is refused', async () => {
  const deps = makeDeps({ readObject: () => Promise.resolve(wav(4)) });
  const { status } = await commit(deps, CLONE);
  assertEquals(status, 400);
  assertEquals(deps.calls.canvas.length, 0);
});

Deno.test('canvas commit: a caller who may not post in the conversation is refused before storage is touched', async () => {
  const deps = makeDeps();
  const { status } = await commit(deps, CLONE, {}, 'bob', BOB_KEY);
  assertEquals(status, 403);
  assertEquals(deps.calls.read.length + deps.calls.canvas.length, 0);
});

Deno.test('canvas commit: forged canvas fields are a 400 before storage or the database is touched', async () => {
  for (const bad of [
    { canvasId: 'not-a-uuid' },
    { fromVersionId: 5 },
    { expectedDraftId: 'x' },
    { expectedRevision: -1 },
    { expectedRevision: 1.5 },
    { replace: 'yes' },
    { boxRefs: 'canvas:problem' },
    { boxRefs: Array.from({ length: 10 }, () => 'canvas:problem') },
    { boxRefs: [1] },
    'a string',
    [],
  ]) {
    const deps = makeDeps();
    const { status } = await commit(deps, bad);
    assertEquals(status, 400, JSON.stringify(bad));
    assertEquals(deps.calls.read.length + deps.calls.canvas.length, 0, JSON.stringify(bad));
  }
});

Deno.test('canvas commit: a canvas note is not a reply and has no thread of its own to name', async () => {
  for (const extra of [{ threadRootId: MSG }, { replyToId: MSG }]) {
    const deps = makeDeps();
    const { status } = await commit(deps, CLONE, extra);
    assertEquals(status, 400);
    assertEquals(deps.calls.canvas.length, 0);
  }
});

Deno.test('canvas commit: the database refusals map to the same statuses as a plain note', async () => {
  for (const [kind, status] of [['rate', 429], ['unsupported', 422], ['forbidden', 403], ['invalid', 400]] as const) {
    const deps = makeDeps({ commitCanvas: () => Promise.resolve({ kind }) });
    assertEquals((await commit(deps, CLONE)).status, status, kind);
    assertEquals(deps.calls.background.length, 0, kind);
  }
});

Deno.test('canvas commit: a deployment without the canvas function refuses instead of posting a plain note', async () => {
  const deps = makeDeps({ commitCanvas: undefined });
  const { status } = await commit(deps, CLONE);
  assertEquals(status, 422);
  assertEquals(deps.calls.plain + deps.calls.canvas.length, 0);
});

Deno.test('control: a commit with no canvas field is still the plain voice note, with no canvas call', async () => {
  const deps = makeDeps();
  const res = await handleChatVoice(new Request('https://example.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer alice' },
    body: JSON.stringify({ mode: 'commit', conversationId: MIRROR, objectKey: KEY }),
  }), deps);
  assertEquals(res.status, 200);
  assertEquals(deps.calls.plain, 1);
  assertEquals(deps.calls.canvas.length, 0);
});

// ── X9 review fixes ──────────────────────────────────────────────────────────

Deno.test('canvas commit: a caller without the current terms is refused (409) before the clip is read or anything is written', async () => {
  const deps = makeDeps({ hasTerms: (uid) => { deps.calls.terms.push(uid); return Promise.resolve(false); } });
  const { status, json } = await commit(deps, CLONE);
  assertEquals(status, 409);
  assertEquals(json, { error: 'terms_not_accepted', code: 'TERMS_NOT_ACCEPTED' });
  assertEquals(deps.calls.terms, [ALICE]); // asked for the verified caller
  assertEquals(deps.calls.read.length + deps.calls.body.length + deps.calls.canvas.length + deps.calls.background.length, 0);
});

Deno.test('canvas commit: the terms gate follows membership and the key checks, and a replay is gated too', async () => {
  const other = makeDeps();
  await commit(other, CLONE, {}, 'bob', BOB_KEY); // not a member: refused before the terms are even read
  assertEquals(other.calls.terms.length, 0);
  const replay = makeDeps({ isKeyCommitted: () => Promise.resolve(true), hasTerms: () => Promise.resolve(false) });
  assertEquals((await commit(replay, CLONE)).status, 409);
  assertEquals(replay.calls.canvas.length, 0);
});

Deno.test('canvas commit: a deployment that cannot read terms refuses the canvas mode instead of skipping the gate', async () => {
  const deps = makeDeps({ hasTerms: undefined });
  const { status } = await commit(deps, CLONE);
  assertEquals(status, 422);
  assertEquals(deps.calls.canvas.length + deps.calls.plain, 0);
});

Deno.test('control: a plain voice note never reads the terms (it stays as it was)', async () => {
  const deps = makeDeps();
  const res = await handleChatVoice(new Request('https://example.com', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer alice' },
    body: JSON.stringify({ mode: 'commit', conversationId: MIRROR, objectKey: KEY }),
  }), deps);
  assertEquals(res.status, 200);
  assertEquals(deps.calls.terms.length, 0);
});

Deno.test('canvas commit: the open-drafts cap is its own answer (409, TOO_MANY_DRAFTS), not the voice rate limit', async () => {
  const deps = makeDeps({ commitCanvas: () => Promise.resolve({ kind: 'draft_cap' }) });
  const { status, json } = await commit(deps, NEW_CANVAS);
  assertEquals(status, 409);
  assertEquals(json.code, 'TOO_MANY_DRAFTS');
  assertEquals(deps.calls.background.length, 0);
  const rate = makeDeps({ commitCanvas: () => Promise.resolve({ kind: 'rate' }) });
  const r = await commit(rate, NEW_CANVAS);
  assertEquals(r.status, 429);
  assertEquals(r.json.code, undefined);
});
