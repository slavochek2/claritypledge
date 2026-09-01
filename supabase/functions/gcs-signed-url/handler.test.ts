// Deno test: run with `deno test supabase/functions/gcs-signed-url/handler.test.ts`
//
// P1223 (G6). Exercises every gate of handleGcsSignedUrl with fakes, including the two
// failure paths the pre-fix function did not have (400 on shape, 403 on non-participant)
// and the legitimate shapes the client actually sends (which must still be forwarded).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ERR, handleGcsSignedUrl, type HandlerDeps } from './handler.ts';
import { parseUploadTarget, isValidContentType, isValidFileName } from './validate.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { forwarded: unknown[] } {
  const forwarded: unknown[] = [];
  return {
    forwarded,
    corsHeaders: { 'Access-Control-Allow-Origin': 'http://localhost:5001' },
    envReady: true,
    getUserId: (token) => Promise.resolve(token === 'alice' ? ALICE : token === 'bob' ? BOB : null),
    // One session, ABC234: creator Alice, joiner nobody yet (guest joiner shape).
    getSessionParticipants: (code) =>
      Promise.resolve(code === 'ABC234' ? { creatorProfileId: ALICE, joinerProfileId: null } : null),
    // One room, ROOM77, with Alice as member MEMBER_ID.
    getRoomMembership: (memberId) =>
      Promise.resolve(memberId === MEMBER_ID ? { profileId: ALICE, roomCode: 'ROOM77' } : null),
    forward: (body) => {
      forwarded.push(body);
      return Promise.resolve(new Response(JSON.stringify({ uploadUrl: 'https://storage.example/signed', filePath: 'x' }), { status: 200 }));
    },
    ...overrides,
  };
}

function req(bearer: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer !== null) headers['Authorization'] = `Bearer ${bearer}`;
  return new Request('https://example.com/functions/v1/gcs-signed-url', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const GOOD = { sessionCode: 'ABC234', fileName: 'alice_chunk_000.webm', contentType: 'audio/webm;codecs=opus' };

Deno.test('401 without a Bearer token', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req(null, GOOD), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, ERR.unauthorized);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('401 when the token does not resolve to a user', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('nobody', GOOD), deps);
  assertEquals(res.status, 401);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('400 on unparsable JSON', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('alice', '{not json'), deps);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, ERR.invalidBody);
});

Deno.test('400 when a field is missing', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('alice', { sessionCode: 'ABC234', fileName: 'a.webm' }), deps);
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, ERR.missingFields);
});

Deno.test('400 on a sessionCode outside the charset — before any DB read', async () => {
  let lookups = 0;
  const deps = makeDeps({
    getSessionParticipants: () => { lookups++; return Promise.resolve(null); },
    getRoomMembership: () => { lookups++; return Promise.resolve(null); },
  });
  for (const bad of ['abc234', '../ABC234', 'ABC234/..', 'ABC2345', 'ABC23', 'sessions/ABC234', 'rooms/ABC234', 'rooms/ABC234/alice', '']) {
    const res = await handleGcsSignedUrl(req('alice', { ...GOOD, sessionCode: bad }), deps);
    assertEquals(res.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
  assertEquals(lookups, 0);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('400 on fileName / contentType outside the allowlist', async () => {
  const deps = makeDeps();
  for (const fileName of ['../etc/passwd', 'a.webm.exe', 'Chunk.WEBM', 'a b.webm', 'a.mp3', '.webm']) {
    const res = await handleGcsSignedUrl(req('alice', { ...GOOD, fileName }), deps);
    assertEquals(res.status, 400, `fileName ${JSON.stringify(fileName)}`);
    assertEquals((await res.json()).error, ERR.badFileName);
  }
  for (const contentType of ['text/html', 'audio/webm; codecs=opus', 'application/json; charset=utf-8', 'audio/webm;codecs=<script>']) {
    const res = await handleGcsSignedUrl(req('alice', { ...GOOD, contentType }), deps);
    assertEquals(res.status, 400, `contentType ${JSON.stringify(contentType)}`);
    assertEquals((await res.json()).error, ERR.badContentType);
  }
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('403 when the caller is signed in but not a participant of the session', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('bob', GOOD), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, ERR.notParticipant);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('403 when the session does not exist (same body as non-participant — no probing)', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('alice', { ...GOOD, sessionCode: 'ZZZ999' }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).error, ERR.notParticipant);
});

Deno.test('creator is forwarded with the exact body shape the Cloud Function expects', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req('alice', GOOD), deps);
  assertEquals(res.status, 200);
  assertEquals(deps.forwarded, [GOOD]);
});

Deno.test('joiner (joiner_profile_id) is a participant too', async () => {
  const deps = makeDeps({
    getSessionParticipants: () => Promise.resolve({ creatorProfileId: ALICE, joinerProfileId: BOB }),
  });
  const res = await handleGcsSignedUrl(req('bob', GOOD), deps);
  assertEquals(res.status, 200);
  assertEquals(deps.forwarded.length, 1);
});

Deno.test('room prefix: the named member is forwarded; anyone else is 403', async () => {
  const roomPrefix = `rooms/ROOM77/alice-${MEMBER_ID}`;
  const body = { sessionCode: roomPrefix, fileName: '_dev_chunk_003.webm', contentType: 'audio/mp4' };

  const ok = makeDeps();
  const okRes = await handleGcsSignedUrl(req('alice', body), ok);
  assertEquals(okRes.status, 200);
  assertEquals(ok.forwarded, [body]);

  const bob = makeDeps();
  const bobRes = await handleGcsSignedUrl(req('bob', body), bob);
  assertEquals(bobRes.status, 403);
  assertEquals(bob.forwarded.length, 0);

  // Right member id, wrong room code in the prefix → 403 (cannot re-point your own seat).
  const wrongRoom = makeDeps();
  const wrRes = await handleGcsSignedUrl(req('alice', { ...body, sessionCode: `rooms/OTHER1/alice-${MEMBER_ID}` }), wrongRoom);
  assertEquals(wrRes.status, 403);
  assertEquals(wrongRoom.forwarded.length, 0);
});

Deno.test('room prefix with an empty sanitised name (all-symbol display name) still parses', () => {
  const t = parseUploadTarget(`rooms/ROOM77/-${MEMBER_ID}`);
  assertEquals(t, { kind: 'room', code: 'ROOM77', memberId: MEMBER_ID });
});

Deno.test('upstream failure → 502 with a generic message', async () => {
  const deps = makeDeps({ forward: () => Promise.reject(new Error('boom')) });
  const res = await handleGcsSignedUrl(req('alice', GOOD), deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, ERR.upstream);
});

Deno.test('validators admit every shape the client produces', () => {
  for (const f of ['alice_chunk_000.webm', '_dev_alice_chunk_012.webm', 'alice.webm', 'events.json', '_dev_events.json', 'alice_events_007.json', 'chunk_000.webm', '_dev_chunk_000.webm']) {
    assertEquals(isValidFileName(f), true, f);
  }
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'application/json']) {
    assertEquals(isValidContentType(c), true, c);
  }
  assertEquals(parseUploadTarget('ABC234'), { kind: 'session', code: 'ABC234' });
});
