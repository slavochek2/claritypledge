// Deno test: run with `deno test supabase/functions/transcribe-slice/handler.test.ts`
//
// P1236. Exercises every gate of handleTranscribeSlice with fakes.
//
// The fixture is built to make the security assertions REACHABLE rather than assumed. In
// particular `makeWav()` can emit a header that DISAGREES with the audio it carries and a
// header declaring more data than arrived — both are how a client would lie about duration,
// and the duration bound is the only defence against P1237 RQ5 (Gemini accepts over-long
// audio, bills it in full, and silently returns ~the opening five minutes, with no error to
// catch). A fixture that could only produce well-formed 5-second slices would leave that
// bound untested while looking green (epistemic.md gate 7b).
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ERR,
  handleTranscribeSlice,
  MAX_CONCURRENT_ROOMS_PER_USER,
  MAX_SLICES_PER_MEMBER,
  ROOM_MAX_DURATION_MINUTES,
  type HandlerDeps,
  type SliceMembership,
} from './handler.ts';
import { MAX_SLICE_BYTES, MAX_SLICE_DURATION_MS, parseWavHeader, VERR } from './validate.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ROOM_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ROOM = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const ROOM_CREATED = new Date('2026-09-08T11:00:00.000Z').toISOString();

/**
 * A canonical PCM WAV. `declaredDataBytes` lets a test emit a header that lies about how
 * much audio follows — see the file header for why that has to be constructible.
 */
function makeWav(opts: {
  seconds?: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  declaredDataBytes?: number;
  audioFormat?: number;
  extraChunk?: boolean;
} = {}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 16_000;
  const channels = opts.channels ?? 1;
  const bits = opts.bitsPerSample ?? 16;
  const seconds = opts.seconds ?? 5;
  const bytesPerFrame = (bits / 8) * channels;
  const dataBytes = Math.round(seconds * sampleRate * bytesPerFrame);
  const extra = opts.extraChunk ? 12 : 0; // a LIST chunk in front of `data`
  const buf = new Uint8Array(44 + extra + dataBytes);
  const view = new DataView(buf.buffer);
  const put = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };

  put(0, 'RIFF');
  view.setUint32(4, 36 + extra + dataBytes, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, opts.audioFormat ?? 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, bits, true);
  let off = 36;
  if (opts.extraChunk) {
    put(off, 'LIST');
    view.setUint32(off + 4, 4, true);
    off += 12;
  }
  put(off, 'data');
  view.setUint32(off + 4, opts.declaredDataBytes ?? dataBytes, true);
  return buf;
}

function b64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

const GOOD_AUDIO = b64(makeWav());

interface Recorder extends HandlerDeps {
  transcribed: Uint8Array[];
  inserted: Array<{ roomId: string; memberId: string; text: string }>;
  endedRooms: string[];
}

function makeDeps(overrides: Partial<HandlerDeps> = {}, membership?: Partial<SliceMembership>): Recorder {
  const transcribed: Uint8Array[] = [];
  const inserted: Array<{ roomId: string; memberId: string; text: string }> = [];
  const endedRooms: string[] = [];
  const base: SliceMembership = {
    memberId: MEMBER_ID,
    roomCreatedAt: ROOM_CREATED,
    // P1307 Decision 3: the per-person cap reads this. Defaults to the room's own creation
    // time, i.e. a member who joined when the room opened.
    memberJoinedAt: ROOM_CREATED,
    roomEndedAt: null,
    captureEndedAt: null,
    consentGivenAt: '2026-09-08T11:00:01.000Z',
    sliceCount: 0,
    ...membership,
  };
  return {
    transcribed,
    inserted,
    endedRooms,
    corsHeaders: { 'Access-Control-Allow-Origin': 'http://localhost:5001' },
    envReady: true,
    now: () => NOW,
    getUserId: (token) => Promise.resolve(token === 'alice' ? ALICE : token === 'bob' ? BOB : null),
    getMembership: (roomId, userId) =>
      Promise.resolve(roomId === ROOM_ID && userId === ALICE ? base : null),
    countActiveRooms: () => Promise.resolve(1),
    // P1307: the handler no longer ends rooms (D11 — the cap is per person, and the
    // server-side sweep is the only thing that ends a room). `endedRooms` stays on the
    // recorder so tests can keep asserting that nothing ended one.
    touchLastSeen: () => Promise.resolve(),
    transcribe: (audio) => { transcribed.push(audio); return Promise.resolve('hello there world'); },
    getPreviousText: () => Promise.resolve(null),
    insertMessage: (roomId, memberId, text) => { inserted.push({ roomId, memberId, text }); return Promise.resolve(); },
    ...overrides,
  };
}

function req(bearer: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer !== null) headers['Authorization'] = `Bearer ${bearer}`;
  return new Request('https://example.com/functions/v1/transcribe-slice', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(deps: HandlerDeps, bearer: string | null, body: unknown) {
  const res = await handleTranscribeSlice(req(bearer, body), deps);
  const parsed = await res.json().catch(() => ({}));
  return { status: res.status, body: parsed as Record<string, unknown> };
}

const SLICE = { roomId: ROOM_ID, sequence: 0, audio: GOOD_AUDIO };

// ── auth ────────────────────────────────────────────────────────────────────

Deno.test('401 without a Bearer token', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, null, SLICE)).status, 401);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('401 when the token does not resolve to a user', async () => {
  const deps = makeDeps();
  const r = await call(deps, 'nobody', SLICE);
  assertEquals(r.status, 401);
  assertEquals(r.body.error, ERR.unauthorized);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a bad JWT is refused before the body is even parsed', async () => {
  // Ordering: an unauthenticated caller must not be able to use the 400s as a free
  // payload-shape oracle for the ingest format.
  const deps = makeDeps();
  const r = await call(deps, 'nobody', '{not json');
  assertEquals(r.status, 401);
});

// ── payload: the fields that must never be readable ─────────────────────────

Deno.test('a payload carrying spoken_at is REFUSED — the ordering key is not the client\'s', async () => {
  // Decision 4 orders de-duplication on spoken_at, so a client that can set it can choose
  // the merge order. The allow-list means this is refused rather than silently ignored:
  // ignoring it would let a client believe it had been honoured.
  const deps = makeDeps();
  for (const field of ['spoken_at', 'spokenAt']) {
    const r = await call(deps, 'alice', { ...SLICE, [field]: '2020-01-01T00:00:00Z' });
    assertEquals(r.status, 400, field);
    assertEquals(r.body.error, VERR.unknownField, field);
  }
  assertEquals(deps.inserted.length, 0);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a payload naming a member, or carrying its own text, is REFUSED', async () => {
  const deps = makeDeps();
  for (const extra of [{ memberId: MEMBER_ID }, { member_id: MEMBER_ID }, { text: 'I said this' }, { isFinal: true }]) {
    const r = await call(deps, 'alice', { ...SLICE, ...extra });
    assertEquals(r.status, 400, JSON.stringify(extra));
    assertEquals(r.body.error, VERR.unknownField, JSON.stringify(extra));
  }
  assertEquals(deps.inserted.length, 0);
});

Deno.test('the insert always uses the SERVER-derived member id', async () => {
  // The complement of the two tests above: even with a legitimate payload, the id written
  // comes from getMembership, not from anything the caller could influence.
  const deps = makeDeps();
  await call(deps, 'alice', SLICE);
  assertEquals(deps.inserted.length, 1);
  assertEquals(deps.inserted[0].memberId, MEMBER_ID);
  assertEquals(deps.inserted[0].roomId, ROOM_ID);
});

// ── payload: shape and audio bounds ─────────────────────────────────────────

Deno.test('400 on unparsable JSON, a bad roomId, or a bad sequence', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', '{not json')).status, 400);
  assertEquals((await call(deps, 'alice', { ...SLICE, roomId: 'ROOM77' })).body.error, VERR.roomId);
  assertEquals((await call(deps, 'alice', { ...SLICE, sequence: -1 })).body.error, VERR.sequence);
  assertEquals((await call(deps, 'alice', { ...SLICE, sequence: 1.5 })).body.error, VERR.sequence);
  assertEquals((await call(deps, 'alice', { ...SLICE, sequence: 999_999 })).body.error, VERR.sequence);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('non-WAV bytes and non-PCM WAV are refused', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(new Uint8Array(200)) })).body.error, VERR.notWav);
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: 'not base64 @@@' })).body.error, VERR.audioEncoding);
  // audioFormat 3 = IEEE float. Readable as a header, but every duration derivation below
  // assumes PCM, so it is refused rather than approximated.
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ audioFormat: 3 })) })).body.error, VERR.notWav);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('only 16 kHz mono 16-bit is accepted', async () => {
  const deps = makeDeps();
  for (const opts of [{ sampleRate: 44_100 }, { sampleRate: 8_000 }, { channels: 2 }, { bitsPerSample: 8 }]) {
    const r = await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ seconds: 0.5, ...opts })) });
    assertEquals(r.body.error, VERR.wavFormat, JSON.stringify(opts));
  }
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('RQ5: audio longer than one slice is refused, and never reaches Gemini', async () => {
  // The defence against P1237 RQ5 is refusing to CONSTRUCT the request — there is no error
  // to catch downstream, because Gemini accepts the audio, bills it in full, and returns
  // ~the opening five minutes silently. There is no declared-duration field to disagree
  // with: the WAV header is the claim, and it is what gets checked.
  const deps = makeDeps();
  // UPDATED for P1307 Part 4: derived from the bound rather than a literal. This test used
  // 8.5 s against the old 8 s bound; P1307 widens the bound to 17 s, and its own test
  // asserts 8.5 s is now ACCEPTED — the same audio cannot be both.
  const long = makeWav({ seconds: MAX_SLICE_DURATION_MS / 1000 + 0.5 });
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(long) })).body.error, VERR.tooLong);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('the byte cap and the duration bound are ordered so BOTH can fire', async () => {
  // This is the assertion that would have caught the dead guard. With MAX_SLICE_BYTES at
  // 256 KiB the byte cap capped duration at 8.19 s, so VERR.tooLong was unreachable for
  // every well-formed 16 kHz mono slice while still reading as a working check. Changing
  // either constant in isolation must fail here rather than silently retire the other.
  const pcmBytesForMaxDuration = (MAX_SLICE_DURATION_MS / 1000) * 16_000 * 2 + 44;
  assert(
    MAX_SLICE_BYTES > pcmBytesForMaxDuration,
    `MAX_SLICE_BYTES (${MAX_SLICE_BYTES}) must exceed ${pcmBytesForMaxDuration} or the duration bound is dead code`,
  );

  const deps = makeDeps();
  // UPDATED for P1307 Part 4: both durations are derived from the bounds (they were the
  // literals 8.2 s and 11 s, which encoded the old 8 s / 320 KB pair).
  // Just over the duration bound, comfortably under the byte cap → the DURATION check fires.
  const justOverDuration = MAX_SLICE_DURATION_MS / 1000 + 0.2;
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ seconds: justOverDuration })) })).body.error, VERR.tooLong);
  // Over the byte cap → the BYTE check fires first, before anything is decoded.
  const overByteCap = Math.ceil(MAX_SLICE_BYTES / (16_000 * 2)) + 1;
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ seconds: overByteCap })) })).body.error, VERR.audioTooLarge);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a header declaring more data than arrived is read as truncated, not as long audio', async () => {
  // The inverse of the test above, and the reason parseWavHeader takes the MIN: believing
  // an over-declared size would let a 44-byte upload claim to be five minutes of audio and
  // be refused as "too long" — a confusing error for a real truncated upload, and a
  // duration derived from bytes that do not exist.
  const deps = makeDeps();
  const truncated = makeWav({ seconds: 1, declaredDataBytes: 20 * 16_000 * 2 });
  const r = await call(deps, 'alice', { ...SLICE, audio: b64(truncated) });
  assertEquals(r.status, 200);
  assertEquals(deps.transcribed.length, 1);
});

Deno.test('a slice over the byte cap is refused without being decoded', async () => {
  const deps = makeDeps();
  const oversized = 'A'.repeat(Math.ceil((MAX_SLICE_BYTES + 10_000) * 4 / 3));
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: oversized })).body.error, VERR.audioTooLarge);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a WAV with a chunk before `data` is still read correctly', async () => {
  // A fixed-offset header reader would interpret the LIST chunk's bytes as samples and
  // compute a duration from noise — the one number this validation exists to trust.
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ extraChunk: true })) })).status, 200);
  assertEquals(deps.transcribed.length, 1);
});

Deno.test('a WAV whose data chunk is empty is refused as silence, not sent', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'alice', { ...SLICE, audio: b64(makeWav({ seconds: 0 })) })).body.error, VERR.empty);
  assertEquals(deps.transcribed.length, 0);
});

// ── the header parser, under adversarial bytes ──────────────────────────────

Deno.test('parseWavHeader terminates and never throws on malformed input', () => {
  // This is the one loop in the request path driven by ATTACKER-CONTROLLED lengths: the
  // chunk walk reads a size out of the buffer and uses it to advance. Everything else here
  // is bounded by the byte cap. Termination is structural — `offset` becomes
  // `offset + 8 + size + pad`, so it advances by at least 8 per iteration regardless of
  // what `size` says, and a zero-size chunk cannot spin. These cases pin that, plus the
  // refuse-rather-than-guess behaviour on every field the duration derivation depends on.
  const hdr = (mutate: (v: DataView, b: Uint8Array) => void, len = 200): Uint8Array => {
    const b = new Uint8Array(len);
    const v = new DataView(b.buffer);
    const put = (o: number, t: string) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
    put(0, 'RIFF'); v.setUint32(4, len - 8, true); put(8, 'WAVE');
    put(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16_000, true);
    v.setUint32(28, 32_000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    put(36, 'data'); v.setUint32(40, len - 44, true);
    mutate(v, b);
    return b;
  };

  const mustRefuse: Array<[string, Uint8Array]> = [
    ['a chunk size of 0xFFFFFFFF walks past the buffer', hdr((v) => v.setUint32(16, 0xFFFFFFFF, true))],
    ['a zero-size chunk still advances', hdr((v, b) => {
      for (let i = 0; i < 4; i++) b[12 + i] = 'LIST'.charCodeAt(i);
      v.setUint32(16, 0, true);
    })],
    ['an odd chunk size (word-alignment pad path)', hdr((v) => v.setUint32(16, 17, true))],
    ['sampleRate 0 would divide by zero', hdr((v) => v.setUint32(24, 0, true))],
    ['bitsPerSample 0 would divide by zero', hdr((v) => v.setUint16(34, 0, true))],
    ['channels 0 would divide by zero', hdr((v) => v.setUint16(22, 0, true))],
    ['no data chunk anywhere', hdr((_v, b) => { for (let i = 0; i < 4; i++) b[36 + i] = 'junk'.charCodeAt(i); })],
    ['shorter than the smallest possible header', new Uint8Array(43)],
    ['all zeros', new Uint8Array(200)],
  ];

  for (const [label, bytes] of mustRefuse) {
    const started = Date.now();
    assertEquals(parseWavHeader(bytes), null, label);
    assert(Date.now() - started < 1_000, `parseWavHeader did not terminate promptly on: ${label}`);
  }

  // An over-declared data size is TRUNCATION, not long audio — 156 real bytes, not 4 GB.
  const overDeclared = parseWavHeader(hdr((v) => v.setUint32(40, 0xFFFFFFFF, true)));
  assertEquals(overDeclared?.dataBytes, 156);

  // A header with no samples parses, and is refused one layer up as VERR.empty rather than
  // being treated as a zero-length utterance.
  assertEquals(parseWavHeader(hdr(() => {}, 44))?.dataBytes, 0);
});

// ── membership and consent ──────────────────────────────────────────────────

Deno.test('403 when the caller is not a member of the named room', async () => {
  const deps = makeDeps();
  assertEquals((await call(deps, 'bob', SLICE)).body.error, ERR.notMember);
  assertEquals((await call(deps, 'alice', { ...SLICE, roomId: OTHER_ROOM })).body.error, ERR.notMember);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('403 when the member has not consented — and Gemini is never called', async () => {
  // epistemic.md gate 7. Everything else about this request is valid; consent is the only
  // thing standing between the caller and voice data leaving for a third party.
  const deps = makeDeps({}, { consentGivenAt: null });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 403);
  assertEquals(r.body.error, ERR.noConsent);
  assertEquals(deps.transcribed.length, 0);
  assertEquals(deps.inserted.length, 0);
});

Deno.test('consent is checked AFTER membership — a non-member learns nothing about the room', async () => {
  const deps = makeDeps({}, { consentGivenAt: null });
  assertEquals((await call(deps, 'bob', SLICE)).body.error, ERR.notMember);
});

// ── ceilings (Decision 6) ───────────────────────────────────────────────────

Deno.test('410 on a room that has already ended', async () => {
  const deps = makeDeps({}, { roomEndedAt: '2026-09-08T11:30:00.000Z' });
  assertEquals((await call(deps, 'alice', SLICE)).body.error, ERR.roomEnded);
  assertEquals(deps.transcribed.length, 0);
});

// UPDATED for P1307 Decision 3 / D11. These two tests originally pinned a PER-ROOM clock
// (roomCreatedAt) whose hard stop ended the room for everyone. D11 moves the cap to the
// person — a latecomer to a long event room keeps their own three hours — and the
// server-side sweep is now the only thing that ends a room. The ceiling and its 7c
// counterpart are kept; only the clock they read, and the "room ended" side effect, change.
Deno.test('a member past their own hard stop is refused with 410, and the room is NOT ended for everyone', async () => {
  const old = new Date(NOW.getTime() - (ROOM_MAX_DURATION_MINUTES + 1) * 60_000).toISOString();
  const deps = makeDeps({}, { memberJoinedAt: old });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 410);
  assertEquals(r.body.error, ERR.roomTooLong);
  assertEquals(deps.endedRooms, [], 'a member reaching their cap must not end the room for later joiners');
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a member one minute INSIDE their own hard stop is not touched', async () => {
  // gate 7c: the ceiling must not fire on legitimate use. 179 minutes is a long
  // conversation, not a forgotten page.
  const inside = new Date(NOW.getTime() - (ROOM_MAX_DURATION_MINUTES - 1) * 60_000).toISOString();
  const deps = makeDeps({}, { memberJoinedAt: inside });
  assertEquals((await call(deps, 'alice', SLICE)).status, 200);
  assertEquals(deps.endedRooms.length, 0);
  assertEquals(deps.inserted.length, 1);
});

Deno.test('429 at the per-member slice ceiling, and not one slice before it', async () => {
  const atCeiling = makeDeps({}, { sliceCount: MAX_SLICES_PER_MEMBER });
  assertEquals((await call(atCeiling, 'alice', SLICE)).body.error, ERR.sliceCeiling);
  assertEquals(atCeiling.transcribed.length, 0);

  const justUnder = makeDeps({}, { sliceCount: MAX_SLICES_PER_MEMBER - 1 });
  assertEquals((await call(justUnder, 'alice', SLICE)).status, 200);
  assertEquals(justUnder.inserted.length, 1);
});

Deno.test('429 when the account is streaming into too many rooms, and not at the limit itself', async () => {
  const over = makeDeps({ countActiveRooms: () => Promise.resolve(MAX_CONCURRENT_ROOMS_PER_USER + 1) });
  assertEquals((await call(over, 'alice', SLICE)).body.error, ERR.tooManyRooms);
  assertEquals(over.transcribed.length, 0);

  const at = makeDeps({ countActiveRooms: () => Promise.resolve(MAX_CONCURRENT_ROOMS_PER_USER) });
  assertEquals((await call(at, 'alice', SLICE)).status, 200);
});

// ── pre-warm ────────────────────────────────────────────────────────────────

Deno.test('the pre-warm POST runs every gate but sends no audio', async () => {
  const deps = makeDeps();
  const r = await call(deps, 'alice', { roomId: ROOM_ID, warmup: true });
  assertEquals(r.status, 200);
  assertEquals(r.body.warmed, true);
  assertEquals(deps.transcribed.length, 0);
  assertEquals(deps.inserted.length, 0);
});

Deno.test('a pre-warm from a member who has not consented is still refused', async () => {
  const deps = makeDeps({}, { consentGivenAt: null });
  assertEquals((await call(deps, 'alice', { roomId: ROOM_ID, warmup: true })).body.error, ERR.noConsent);
});

Deno.test('a pre-warm may not smuggle audio', async () => {
  const deps = makeDeps();
  const r = await call(deps, 'alice', { roomId: ROOM_ID, warmup: true, audio: GOOD_AUDIO });
  assertEquals(r.status, 400);
  assertEquals(deps.transcribed.length, 0);
});

// ── transcription, de-duplication, persistence ──────────────────────────────

Deno.test('Gemini is called exactly ONCE, with exactly the bytes that were validated', async () => {
  // Decision 8's hard constraint from P1237 RQ5: no code path may send a whole session or
  // a concatenation. The dep signature takes one Uint8Array, so "hand it more than one
  // slice" is not expressible; this pins the call count and the payload identity too.
  const deps = makeDeps();
  const audio = makeWav({ seconds: 5 });
  await call(deps, 'alice', { ...SLICE, audio: b64(audio) });
  assertEquals(deps.transcribed.length, 1);
  assertEquals(deps.transcribed[0].length, audio.length);
  assert(deps.transcribed[0].every((byte, i) => byte === audio[i]));
});

Deno.test('the lead-in overlap is de-duplicated against this member\'s own previous row', async () => {
  const deps = makeDeps({
    getPreviousText: () => Promise.resolve('and it still does not work on my phone'),
    transcribe: () => Promise.resolve('on my phone which is annoying'),
  });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 200);
  assertEquals(deps.inserted.length, 1);
  assertEquals(deps.inserted[0].text, 'which is annoying');
  assertEquals(r.body.stripped, 3);
});

Deno.test('silence writes nothing — a quiet second is not an utterance', async () => {
  const deps = makeDeps({ transcribe: () => Promise.resolve('   ') });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 200);
  assertEquals(r.body.text, '');
  assertEquals(deps.inserted.length, 0);
});

Deno.test('a slice that is entirely a repeat writes nothing', async () => {
  const deps = makeDeps({
    getPreviousText: () => Promise.resolve('one two three'),
    transcribe: () => Promise.resolve('one two three'),
  });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 200);
  assertEquals(r.body.text, '');
  assertEquals(deps.inserted.length, 0);
});

Deno.test('a transcriber failure is a 502 and writes nothing', async () => {
  const deps = makeDeps({ transcribe: () => Promise.reject(new Error('Gemini returned 429')) });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 502);
  assertEquals(r.body.error, ERR.transcriber);
  assertEquals(deps.inserted.length, 0);
});

Deno.test('a persistence failure is a 500 and does not report success', async () => {
  const deps = makeDeps({ insertMessage: () => Promise.reject(new Error('boom')) });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 500);
  assertEquals(r.body.error, ERR.persist);
});

Deno.test('OPTIONS is a CORS preflight and touches nothing', async () => {
  const deps = makeDeps();
  const res = await handleTranscribeSlice(
    new Request('https://example.com/functions/v1/transcribe-slice', { method: 'OPTIONS' }),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a missing env is a 500 before any auth work', async () => {
  const deps = makeDeps({ envReady: false });
  assertEquals((await call(deps, 'alice', SLICE)).status, 500);
});

// ── P1307 Part 4: every bound that touches a slice moves together ───────────
//
// Written before the migration: SLICE_INTERVAL_MS / MAX_SLICE_DURATION_MS / MAX_SLICE_BYTES
// / MAX_SLICES_PER_MEMBER are expected to change together (spec's bounds table). These
// tests import the SAME constants the tests above already import from validate.ts/handler.ts
// — they are not hardcoded here, so once those constants move, these tests automatically
// check the NEW relationship without needing a second edit. Until then they assert the OLD
// values are gone, which is the correct failing state for a not-yet-built feature.

Deno.test('P1307: a 13s + 1s lead-in slice (448,044 bytes) is accepted', async () => {
  const deps = makeDeps();
  const fourteenSeconds = makeWav({ seconds: 14 });
  // 44-byte header + 14s * 16,000 Hz * 2 bytes/sample = 448,044 bytes — the spec's own
  // worked number for the new cadence's steady-state slice.
  assertEquals(fourteenSeconds.length, 448_044);
  const r = await call(deps, 'alice', { ...SLICE, audio: b64(fourteenSeconds) });
  assertEquals(r.status, 200, `expected 200, got ${r.status} (${JSON.stringify(r.body)})`);
  assertEquals(deps.transcribed.length, 1);
});

Deno.test('P1307: the edge-first rollout is a SUPERSET — an old 5s slice still validates once the widened bounds are live', async () => {
  const deps = makeDeps();
  const fiveSeconds = makeWav({ seconds: 5 });
  const r = await call(deps, 'alice', { ...SLICE, audio: b64(fiveSeconds) });
  assertEquals(r.status, 200, 'a still-deployed 4s-cadence client must not be broken by deploying the new bounds first');
});

Deno.test('P1307: audio past the NEW duration bound is refused, and the old 8s bound no longer applies', async () => {
  const deps = makeDeps();
  // 8.5s exceeded the OLD 8s bound and is well inside the new ~17s one — this is the
  // inverse of the RQ5 test above, pinned to the NEW relationship rather than the old.
  const eightAndAHalf = makeWav({ seconds: 8.5 });
  const r = await call(deps, 'alice', { ...SLICE, audio: b64(eightAndAHalf) });
  assertEquals(r.status, 200, 'an 8.5s slice must be ACCEPTED under the new (~17s) duration bound');

  const overNewBound = makeWav({ seconds: MAX_SLICE_DURATION_MS / 1000 + 1 });
  const refused = await call(deps, 'alice', { ...SLICE, audio: b64(overNewBound) });
  assertEquals(refused.body.error, VERR.tooLong, 'audio past the NEW duration bound must still be refused — RQ5 is not reopened');
});

Deno.test('P1307: the byte cap and duration bound stay ordered at the NEW values (regenerates the P1236 dead-guard proof)', () => {
  // Re-run of the "both can fire" proof above, generalized to whatever MAX_SLICE_DURATION_MS
  // / MAX_SLICE_BYTES currently are — so a future bound change is caught here too, not just
  // once for the 13s migration.
  const pcmBytesForMaxDuration = (MAX_SLICE_DURATION_MS / 1000) * 16_000 * 2 + 44;
  assert(
    MAX_SLICE_BYTES > pcmBytesForMaxDuration,
    `MAX_SLICE_BYTES (${MAX_SLICE_BYTES}) must exceed ${pcmBytesForMaxDuration} or the duration bound is dead code`,
  );
  // The spec's own worked numbers: 17,000ms / 640,000 bytes are the CURRENT expectation —
  // this assertion documents that specific pair failing until Decision 9 lands, distinct
  // from the generic inequality above which would pass against ANY correctly-ordered pair.
  assertEquals(MAX_SLICE_DURATION_MS, 17_000, 'MAX_SLICE_DURATION_MS must move to the P1307 value');
  assertEquals(MAX_SLICE_BYTES, 640_000, 'MAX_SLICE_BYTES must move to the P1307 value');
});

Deno.test('P1307: MAX_SLICES_PER_MEMBER is re-derived (~1,000) for the 13s cadence, not left at 3,000', () => {
  // 180 minutes / 13s cadence ≈ 830 slices; the spec asks for ~1,000 (headroom for
  // rejoin/replay). Bounded, not pinned to one exact number, since /architect left it as an
  // approximation ("re-derived to ~1,000").
  assert(MAX_SLICES_PER_MEMBER < 3_000, `MAX_SLICES_PER_MEMBER (${MAX_SLICES_PER_MEMBER}) must be re-derived below the old 3,000`);
  assert(MAX_SLICES_PER_MEMBER >= 830, `MAX_SLICES_PER_MEMBER (${MAX_SLICES_PER_MEMBER}) must cover a full 180-minute room at 13s cadence`);
});

// ── P1307 Decision 3: the per-member cap is measured from THIS MEMBER'S joined_at ───
//
// SliceMembership gains `memberJoinedAt` (Decision 3, item 1). This is a TYPE CHANGE to
// handler.ts, so these two tests will not even compile until that field exists — that is
// the correct failing state, not a bug in the test.

Deno.test('P1307: the per-slice cap is measured from the MEMBER\'s own joined_at, not the room\'s created_at', async () => {
  // A member who joined 10 minutes ago in a room that itself is 4 hours old (Decision 3,
  // AC "a member who joined 10 min ago in a 4-hour-old room is accepted") — under the OLD
  // roomCreatedAt-based check this would already be refused; under the new memberJoinedAt
  // check it must be accepted.
  const roomCreatedFourHoursAgo = new Date(NOW.getTime() - 4 * 60 * 60_000).toISOString();
  const memberJoinedTenMinutesAgo = new Date(NOW.getTime() - 10 * 60_000).toISOString();
  const deps = makeDeps({}, {
    roomCreatedAt: roomCreatedFourHoursAgo,
    memberJoinedAt: memberJoinedTenMinutesAgo,
  } as Partial<SliceMembership>);

  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 200, 'a member 10 minutes into their own capture must be accepted even in a 4h-old room');
  assertEquals(deps.endedRooms.length, 0, 'the room itself must not be ended — only this member is past nothing');
});

Deno.test('P1307: a member 3h01 past THEIR OWN joined_at is refused, even in a freshly-created room', async () => {
  const roomCreatedJustNow = NOW.toISOString();
  const memberJoinedOverCap = new Date(NOW.getTime() - (3 * 60 + 1) * 60_000).toISOString();
  const deps = makeDeps({}, {
    roomCreatedAt: roomCreatedJustNow,
    memberJoinedAt: memberJoinedOverCap,
  } as Partial<SliceMembership>);

  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 410, 'a member over their own 3h cap must be refused even though the room itself is new');
  assertEquals(deps.transcribed.length, 0);
});

// ── P1307 Decision 2 correction: last_seen_at is stamped on every accepted REAL slice ──
//
// New HandlerDeps member `touchLastSeen`. Named provisionally — /dev may fold this into
// insertMessage's own service-role write instead of a separate deps function, per the
// spec's "costs no new round trip" note; if so, this test's shape (a spy call per accepted
// slice) still holds, only the deps field name changes. Flagged in the test report.

Deno.test('P1307: last_seen_at is touched on an accepted slice that produces text', async () => {
  const touched: string[] = [];
  const deps = makeDeps({
    touchLastSeen: (memberId: string) => { touched.push(memberId); return Promise.resolve(); },
  } as Partial<HandlerDeps>);
  await call(deps, 'alice', SLICE);
  assertEquals(touched, [MEMBER_ID], 'last_seen_at must be stamped for the member who sent the slice');
});

Deno.test('P1307: last_seen_at is touched even on a SILENT slice — it tracks "sent a slice", not "said something"', async () => {
  const touched: string[] = [];
  const deps = makeDeps({
    transcribe: () => Promise.resolve('   '),
    touchLastSeen: (memberId: string) => { touched.push(memberId); return Promise.resolve(); },
  } as Partial<HandlerDeps>);
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.body.text, '');
  assertEquals(touched, [MEMBER_ID], 'a silent slice is still a live signal — the sweep\'s staleness check depends on this');
});

Deno.test('P1307: a warmup ping does NOT touch last_seen_at — it returns before reaching Gemini', async () => {
  const touched: string[] = [];
  const deps = makeDeps({
    touchLastSeen: (memberId: string) => { touched.push(memberId); return Promise.resolve(); },
  } as Partial<HandlerDeps>);
  await call(deps, 'alice', { roomId: ROOM_ID, warmup: true });
  assertEquals(touched, [], 'the pre-warm POST must not count as presence — it is not a real slice');
});

// ── P1307: a member whose own capture has ended is refused (code review finding) ──
//
// gcs-signed-url already refuses archive uploads once capture_ended_at is set. The live slice
// path must refuse the same member, or End would stop the archive while slices kept being
// transcribed and stored until the whole room ended.

Deno.test('P1307: 410 once THIS member\'s capture has ended, and nothing reaches Gemini', async () => {
  const deps = makeDeps({}, { captureEndedAt: '2026-09-08T11:30:00.000Z' });
  const r = await call(deps, 'alice', SLICE);
  assertEquals(r.status, 410);
  assertEquals(r.body.error, ERR.captureEnded);
  assertEquals(deps.transcribed.length, 0);
  assertEquals(deps.inserted.length, 0);
});

Deno.test('P1307: control — a member whose capture is running is still transcribed', async () => {
  const deps = makeDeps({}, { captureEndedAt: null });
  assertEquals((await call(deps, 'alice', SLICE)).status, 200);
  assertEquals(deps.transcribed.length, 1);
});
