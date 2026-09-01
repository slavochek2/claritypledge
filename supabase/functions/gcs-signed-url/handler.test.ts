// Deno test: run with `deno test supabase/functions/gcs-signed-url/handler.test.ts`
//
// P1223 (G6). Exercises every gate of handleGcsSignedUrl with fakes, including the failure
// paths the pre-fix function did not have (400 on shape / type mismatch, 403 on
// non-participant, 403 on another participant's object name) and the legitimate shapes the
// client actually sends (which must still be forwarded).
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ERR, handleGcsSignedUrl, type HandlerDeps } from './handler.ts';
import { isConsistentFileType, isValidContentType, isValidFileName, parseSessionObject, parseUploadTarget } from './validate.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const MALLORY = '44444444-4444-4444-8444-444444444444';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps & { forwarded: unknown[] } {
  const forwarded: unknown[] = [];
  return {
    forwarded,
    corsHeaders: { 'Access-Control-Allow-Origin': 'http://localhost:5001' },
    envReady: true,
    getUserId: (token) =>
      Promise.resolve(token === 'alice' ? ALICE : token === 'bob' ? BOB : token === 'mallory' ? MALLORY : null),
    // One session, ABC234: creator Alice ("Alice Smith"), joiner Bob ("Bob O'Neil").
    getSession: (code) =>
      Promise.resolve(code === 'ABC234'
        ? { creatorProfileId: ALICE, joinerProfileId: BOB, creatorName: 'Alice Smith', joinerName: "Bob O'Neil" }
        : null),
    // Profiles: Alice renamed herself after creating the session.
    getProfileName: (userId) =>
      Promise.resolve(userId === ALICE ? 'Alice Renamed' : userId === BOB ? "Bob O'Neil" : null),
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

const GOOD = { sessionCode: 'ABC234', fileName: 'alice-smith_chunk_000.webm', contentType: 'audio/webm;codecs=opus' };

async function status(deps: HandlerDeps, bearer: string, body: unknown): Promise<{ status: number; error?: string }> {
  const res = await handleGcsSignedUrl(req(bearer, body), deps);
  const parsed = await res.json().catch(() => ({}));
  return { status: res.status, error: parsed.error };
}

// ── auth / body ─────────────────────────────────────────────────────────────

Deno.test('401 without a Bearer token', async () => {
  const deps = makeDeps();
  const res = await handleGcsSignedUrl(req(null, GOOD), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).error, ERR.unauthorized);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('401 when the token does not resolve to a user', async () => {
  const deps = makeDeps();
  assertEquals(await status(deps, 'nobody', GOOD), { status: 401, error: ERR.unauthorized });
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
  assertEquals(await status(deps, 'alice', { sessionCode: 'ABC234', fileName: 'a.webm' }), { status: 400, error: ERR.missingFields });
});

// ── shape ───────────────────────────────────────────────────────────────────

Deno.test('400 on a sessionCode outside the charset — before any DB read', async () => {
  let lookups = 0;
  const deps = makeDeps({
    getSession: () => { lookups++; return Promise.resolve(null); },
    getRoomMembership: () => { lookups++; return Promise.resolve(null); },
  });
  for (const bad of ['abc234', '../ABC234', 'ABC234/..', 'ABC2345', 'ABC23', 'sessions/ABC234', 'rooms/ABC234', 'rooms/ABC234/alice', '']) {
    const r = await status(deps, 'alice', { ...GOOD, sessionCode: bad });
    assertEquals(r.status, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
  assertEquals(lookups, 0);
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('400 on fileName / contentType outside the allowlist', async () => {
  const deps = makeDeps();
  for (const fileName of ['../etc/passwd', 'a.webm.exe', 'Chunk.WEBM', 'a b.webm', 'a.mp3', '.webm']) {
    assertEquals(await status(deps, 'alice', { ...GOOD, fileName }), { status: 400, error: ERR.badFileName }, fileName);
  }
  for (const contentType of ['text/html', 'audio/webm; codecs=opus', 'application/json; charset=utf-8', 'audio/webm;codecs=<script>']) {
    assertEquals(await status(deps, 'alice', { ...GOOD, contentType }), { status: 400, error: ERR.badContentType }, contentType);
  }
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('400 when the extension and the content-type disagree — both spoof directions', async () => {
  const deps = makeDeps();
  // JSON declared as audio (would let an events file be stored as a "recording")
  assertEquals(
    await status(deps, 'alice', { ...GOOD, fileName: 'alice-smith_events_000.json', contentType: 'audio/webm' }),
    { status: 400, error: ERR.typeMismatch },
  );
  assertEquals(
    await status(deps, 'alice', { ...GOOD, fileName: 'events.json', contentType: 'audio/mp4' }),
    { status: 400, error: ERR.typeMismatch },
  );
  // audio declared as JSON (would let arbitrary JSON land under a .webm key)
  assertEquals(
    await status(deps, 'alice', { ...GOOD, fileName: 'alice-smith_chunk_000.webm', contentType: 'application/json' }),
    { status: 400, error: ERR.typeMismatch },
  );
  assertEquals(deps.forwarded.length, 0);
  // and the pure helper, for completeness
  assertEquals(isConsistentFileType('x.json', 'application/json'), true);
  assertEquals(isConsistentFileType('x.webm', 'audio/webm;codecs=opus'), true);
  assertEquals(isConsistentFileType('x.webm', 'audio/mp4'), true);
  assertEquals(isConsistentFileType('x.json', 'audio/webm'), false);
  assertEquals(isConsistentFileType('x.webm', 'application/json'), false);
});

// ── session binding ─────────────────────────────────────────────────────────

Deno.test('403 when the caller is signed in but not a participant of the session', async () => {
  const deps = makeDeps();
  assertEquals(await status(deps, 'mallory', GOOD), { status: 403, error: ERR.notParticipant });
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('403 when the session does not exist (same body as non-participant — no probing)', async () => {
  const deps = makeDeps();
  assertEquals(await status(deps, 'alice', { ...GOOD, sessionCode: 'ZZZ999' }), { status: 403, error: ERR.notParticipant });
});

Deno.test('creator is forwarded with the exact body shape the Cloud Function expects', async () => {
  const deps = makeDeps();
  assertEquals((await status(deps, 'alice', GOOD)).status, 200);
  assertEquals(deps.forwarded, [GOOD]);
});

// ── object-name binding (Codex HIGH) ────────────────────────────────────────

Deno.test('403 when a participant requests the OTHER participant\'s object names', async () => {
  const deps = makeDeps();
  // Bob (joiner) asks for Alice's (creator) keys, every shape the client produces:
  for (const fileName of [
    'alice-smith_chunk_000.webm',
    '_dev_alice-smith_chunk_000.webm',
    'alice-smith.webm',
    'alice-smith_events_003.json',
    'alice-renamed_chunk_000.webm', // her current profile name — also not Bob's
  ]) {
    const contentType = fileName.endsWith('.json') ? 'application/json' : 'audio/webm';
    assertEquals(await status(deps, 'bob', { sessionCode: 'ABC234', fileName, contentType }), { status: 403, error: ERR.notYourObject }, fileName);
  }
  // and the creator asking for the joiner's
  assertEquals(
    await status(deps, 'alice', { sessionCode: 'ABC234', fileName: 'bob-o-neil_chunk_000.webm', contentType: 'audio/webm' }),
    { status: 403, error: ERR.notYourObject },
  );
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('a participant\'s own object names are forwarded — session-row name OR current profile name', async () => {
  const deps = makeDeps();
  for (const fileName of [
    'alice-smith_chunk_000.webm',      // creator_name on the session row
    'alice-renamed_chunk_000.webm',    // profiles.name (renamed after creating the session)
    '_dev_alice-smith.webm',
    'alice-smith_events_007.json',
  ]) {
    const contentType = fileName.endsWith('.json') ? 'application/json' : 'audio/webm';
    assertEquals((await status(deps, 'alice', { sessionCode: 'ABC234', fileName, contentType })).status, 200, fileName);
  }
  // joiner's own name is sanitised the same way the client does it ("Bob O'Neil" → bob-o-neil)
  assertEquals((await status(deps, 'bob', { sessionCode: 'ABC234', fileName: 'bob-o-neil_chunk_001.webm', contentType: 'audio/mp4' })).status, 200);
  assertEquals(deps.forwarded.length, 5);
});

Deno.test('events.json (session-level, no owner segment) is writable by either participant', async () => {
  const deps = makeDeps();
  for (const bearer of ['alice', 'bob']) {
    for (const fileName of ['events.json', '_dev_events.json']) {
      assertEquals((await status(deps, bearer, { sessionCode: 'ABC234', fileName, contentType: 'application/json' })).status, 200, `${bearer} ${fileName}`);
    }
  }
  assertEquals(await status(deps, 'mallory', { sessionCode: 'ABC234', fileName: 'events.json', contentType: 'application/json' }), { status: 403, error: ERR.notParticipant });
});

Deno.test('a well-formed fileName that is not a /live shape, or names nobody in the session, is refused', async () => {
  const deps = makeDeps();
  // passes FILE_NAME_RE but has no owner/shared shape the /live client emits → 400
  assertEquals(await status(deps, 'alice', { sessionCode: 'ABC234', fileName: 'metadata.json', contentType: 'application/json' }), { status: 400, error: ERR.badFileName });
  // parses as owned by "chunk_000" — a name that belongs to no participant → 403
  assertEquals(await status(deps, 'alice', { sessionCode: 'ABC234', fileName: 'chunk_000.webm', contentType: 'audio/webm' }), { status: 403, error: ERR.notYourObject });
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('a participant with no usable name anywhere cannot claim an owned object', async () => {
  const deps = makeDeps({
    getSession: () => Promise.resolve({ creatorProfileId: ALICE, joinerProfileId: null, creatorName: '!!!', joinerName: null }),
    getProfileName: () => Promise.resolve(null),
  });
  assertEquals(await status(deps, 'alice', GOOD), { status: 403, error: ERR.notYourObject });
});

// ── room binding ────────────────────────────────────────────────────────────

Deno.test('room prefix: the named member is forwarded; anyone else is 403', async () => {
  const roomPrefix = `rooms/ROOM77/alice-${MEMBER_ID}`;
  const body = { sessionCode: roomPrefix, fileName: '_dev_chunk_003.webm', contentType: 'audio/mp4' };

  const ok = makeDeps();
  assertEquals((await status(ok, 'alice', body)).status, 200);
  assertEquals(ok.forwarded, [body]);

  const bob = makeDeps();
  assertEquals(await status(bob, 'bob', body), { status: 403, error: ERR.notParticipant });
  assertEquals(bob.forwarded.length, 0);

  // Right member id, wrong room code in the prefix → 403 (cannot re-point your own seat).
  const wrongRoom = makeDeps();
  assertEquals((await status(wrongRoom, 'alice', { ...body, sessionCode: `rooms/OTHER1/alice-${MEMBER_ID}` })).status, 403);
  assertEquals(wrongRoom.forwarded.length, 0);
});

Deno.test('room prefix: only chunk_NNN.webm is a room object name', async () => {
  const deps = makeDeps();
  const roomPrefix = `rooms/ROOM77/alice-${MEMBER_ID}`;
  for (const fileName of ['alice_chunk_000.webm', 'events.json', 'chunk_0000.webm', 'bob_events_000.json']) {
    const contentType = fileName.endsWith('.json') ? 'application/json' : 'audio/webm';
    assertEquals(await status(deps, 'alice', { sessionCode: roomPrefix, fileName, contentType }), { status: 400, error: ERR.badFileName }, fileName);
  }
  assertEquals(deps.forwarded.length, 0);
});

Deno.test('room prefix with an empty sanitised name (all-symbol display name) still parses', () => {
  const t = parseUploadTarget(`rooms/ROOM77/-${MEMBER_ID}`);
  assertEquals(t, { kind: 'room', code: 'ROOM77', memberId: MEMBER_ID });
});

// ── upstream / validators ───────────────────────────────────────────────────

Deno.test('upstream failure → 502 with a generic message', async () => {
  const deps = makeDeps({ forward: () => Promise.reject(new Error('boom')) });
  assertEquals(await status(deps, 'alice', GOOD), { status: 502, error: ERR.upstream });
});

Deno.test('validators admit every shape the client produces', () => {
  for (const f of ['alice_chunk_000.webm', '_dev_alice_chunk_012.webm', 'alice.webm', 'events.json', '_dev_events.json', 'alice_events_007.json', 'chunk_000.webm', '_dev_chunk_000.webm']) {
    assertEquals(isValidFileName(f), true, f);
  }
  for (const c of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'application/json']) {
    assertEquals(isValidContentType(c), true, c);
  }
  assertEquals(parseUploadTarget('ABC234'), { kind: 'session', code: 'ABC234' });
  assertEquals(parseSessionObject('alice-smith_chunk_000.webm'), { kind: 'owned', owner: 'alice-smith' });
  assertEquals(parseSessionObject('_dev_alice-smith_events_003.json'), { kind: 'owned', owner: 'alice-smith' });
  assertEquals(parseSessionObject('alice-smith.webm'), { kind: 'owned', owner: 'alice-smith' });
  assertEquals(parseSessionObject('_dev_events.json'), { kind: 'shared' });
  assertEquals(parseSessionObject('chunk_000.webm'), { kind: 'owned', owner: 'chunk_000' });
});
