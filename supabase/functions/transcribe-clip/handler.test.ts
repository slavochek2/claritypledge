// Deno test: run with `deno test --config supabase/functions/deno.json supabase/functions/transcribe-clip/handler.test.ts`
//
// P1576 Part A. Exercises every gate of handleTranscribeClip with fakes. The fixture can emit a
// header that LIES about its length (and trailing padding after the data), because the decoded
// duration is the only defence against over-long audio; a fixture of only well-formed short
// clips would leave that bound untested while looking green.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CLIP_RATE_LIMIT,
  ERR,
  handleTranscribeClip,
  MAX_CLIP_BYTES,
  MAX_CLIP_DURATION_MS,
  type HandlerDeps,
} from './handler.ts';

const ALICE = '11111111-1111-4111-8111-111111111111';

function makeWav(opts: {
  seconds?: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  declaredDataBytes?: number;
  trailing?: number;
  audioFormat?: number;
} = {}): Uint8Array<ArrayBuffer> {
  const sampleRate = opts.sampleRate ?? 16_000;
  const channels = opts.channels ?? 1;
  const bits = opts.bitsPerSample ?? 16;
  const seconds = opts.seconds ?? 5;
  const dataBytes = Math.round(seconds * sampleRate * (bits / 8) * channels);
  const buf = new Uint8Array(new ArrayBuffer(44 + dataBytes + (opts.trailing ?? 0)));
  const view = new DataView(buf.buffer);
  const put = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  put(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, opts.audioFormat ?? 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  put(36, 'data');
  view.setUint32(40, opts.declaredDataBytes ?? dataBytes, true);
  return buf;
}

type Fakes = HandlerDeps & { transcribed: Uint8Array[]; reserved: string[] };

function makeDeps(overrides: Partial<HandlerDeps> = {}): Fakes {
  const transcribed: Uint8Array[] = [];
  const reserved: string[] = [];
  return {
    transcribed,
    reserved,
    corsHeaders: { 'Access-Control-Allow-Origin': 'http://localhost:5001' },
    envReady: true,
    getUserId: (token) => Promise.resolve(token === 'alice' ? ALICE : null),
    reserveSlot: (userId) => { reserved.push(userId); return Promise.resolve(0); },
    transcribe: (audio) => { transcribed.push(audio); return Promise.resolve('hello there'); },
    ...overrides,
  };
}

function req(bearer: string | null, body: BodyInit | null, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { 'Content-Type': 'audio/wav', ...extra };
  if (bearer !== null) headers['Authorization'] = `Bearer ${bearer}`;
  return new Request('https://example.com/functions/v1/transcribe-clip', { method: 'POST', headers, body });
}

async function run(deps: HandlerDeps, r: Request): Promise<{ status: number; body: Record<string, unknown>; res: Response }> {
  const res = await handleTranscribeClip(r, deps);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, res };
}

// ── auth ────────────────────────────────────────────────────────────────────

Deno.test('401 without a Bearer token, and nothing downstream runs', async () => {
  const deps = makeDeps();
  const out = await run(deps, req(null, makeWav()));
  assertEquals(out.status, 401);
  assertEquals(deps.reserved.length, 0);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('401 for a token that resolves to no user', async () => {
  const deps = makeDeps();
  assertEquals((await run(deps, req('stranger', makeWav()))).status, 401);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('500 when the environment is not ready', async () => {
  assertEquals((await run(makeDeps({ envReady: false }), req('alice', makeWav()))).status, 500);
});

Deno.test('OPTIONS answers the preflight with CORS headers and no auth', async () => {
  const res = await handleTranscribeClip(
    new Request('https://example.com/x', { method: 'OPTIONS' }),
    makeDeps(),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5001');
});

Deno.test('405 for a non-POST method', async () => {
  const res = await handleTranscribeClip(new Request('https://example.com/x', { method: 'GET', headers: { Authorization: 'Bearer alice' } }), makeDeps());
  assertEquals(res.status, 405);
});

// ── body validation ─────────────────────────────────────────────────────────

Deno.test('400 for a body that is not a WAV', async () => {
  const deps = makeDeps();
  const out = await run(deps, req('alice', new Uint8Array(new ArrayBuffer(5000)).fill(7)));
  assertEquals(out.status, 400);
  assertEquals(out.body.error, ERR.notWav);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('400 for an empty body', async () => {
  const out = await run(makeDeps(), req('alice', new Uint8Array(new ArrayBuffer(0))));
  assertEquals(out.status, 400);
});

Deno.test('400 for a WAV with no audio in it', async () => {
  const out = await run(makeDeps(), req('alice', makeWav({ seconds: 0 })));
  assertEquals(out.status, 400);
  assertEquals(out.body.error, ERR.empty);
});

Deno.test('400 for any format other than 16 kHz mono 16-bit PCM', async () => {
  for (const o of [{ sampleRate: 48_000 }, { channels: 2 }, { bitsPerSample: 8 }]) {
    const out = await run(makeDeps(), req('alice', makeWav({ seconds: 1, ...o })));
    assertEquals(out.status, 400, JSON.stringify(o));
    assertEquals(out.body.error, ERR.wavFormat);
  }
});

Deno.test('413 for a clip longer than 3 minutes, judged by the decoded header', async () => {
  const deps = makeDeps();
  const out = await run(deps, req('alice', makeWav({ seconds: 181 })));
  assertEquals(out.status, 413);
  assertEquals(out.body.error, ERR.tooLong);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('exactly 3 minutes is accepted; the byte cap sits above it so the duration bound is reachable', async () => {
  const wav = makeWav({ seconds: MAX_CLIP_DURATION_MS / 1000 });
  assert(wav.length <= MAX_CLIP_BYTES, 'a 180 s clip must fit under the byte cap');
  assert(MAX_CLIP_BYTES < 2 * wav.length, 'but the byte cap must not allow double');
  const deps = makeDeps();
  assertEquals((await run(deps, req('alice', wav))).status, 200);
  assertEquals(deps.transcribed.length, 1);
});

Deno.test('413 for an oversized body by Content-Length, before the body is read', async () => {
  const deps = makeDeps();
  const out = await run(deps, req('alice', makeWav({ seconds: 1 }), { 'Content-Length': String(MAX_CLIP_BYTES + 1) }));
  assertEquals(out.status, 413);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('413 for an oversized streamed body that declares no length', async () => {
  const big = makeWav({ seconds: 1, trailing: MAX_CLIP_BYTES });
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(big.subarray(0, big.length >> 1)); c.enqueue(big.subarray(big.length >> 1)); c.close(); },
  });
  const r = new Request('https://example.com/x', {
    method: 'POST',
    headers: { Authorization: 'Bearer alice', 'Content-Type': 'audio/wav' },
    body: stream,
    // @ts-expect-error duplex is required by Deno/undici for a streamed body
    duplex: 'half',
  });
  const deps = makeDeps();
  assertEquals((await run(deps, r)).status, 413);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a header that declares 1 s but carries a long padded payload is refused, not sent on', async () => {
  const deps = makeDeps();
  const lying = makeWav({ seconds: 1, trailing: 2_000_000 });
  const out = await run(deps, req('alice', lying));
  assertEquals(out.status, 400);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('a header that declares far more data than arrived counts only what arrived', async () => {
  const deps = makeDeps();
  const out = await run(deps, req('alice', makeWav({ seconds: 1, declaredDataBytes: 0xFFFFFFFF })));
  assertEquals(out.status, 200);
  assertEquals(deps.transcribed.length, 1);
});

// ── rate limit ──────────────────────────────────────────────────────────────

Deno.test('the limit is 6 per minute per user', () => {
  assertEquals(CLIP_RATE_LIMIT, { limit: 6, windowSeconds: 60 });
});

Deno.test('429 with Retry-After when the limiter refuses, and Gemini is never called', async () => {
  const deps = makeDeps({ reserveSlot: () => Promise.resolve(60) });
  const out = await run(deps, req('alice', makeWav()));
  assertEquals(out.status, 429);
  assertEquals(out.res.headers.get('Retry-After'), '60');
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('the limiter is keyed by the authenticated user, never by anything in the request', async () => {
  const deps = makeDeps();
  await run(deps, req('alice', makeWav(), { 'x-user-id': 'someone-else' }));
  assertEquals(deps.reserved, [ALICE]);
});

Deno.test('fails CLOSED when the limiter errors: no transcription, no 200', async () => {
  const deps = makeDeps({ reserveSlot: () => Promise.reject(new Error('db down')) });
  const out = await run(deps, req('alice', makeWav()));
  assertEquals(out.status, 503);
  assertEquals(deps.transcribed.length, 0);
});

Deno.test('an unauthenticated request never spends a limiter slot', async () => {
  const deps = makeDeps();
  await run(deps, req('stranger', makeWav()));
  assertEquals(deps.reserved.length, 0);
});

// ── success / Gemini failure ────────────────────────────────────────────────

Deno.test('200 returns { text } and nothing else', async () => {
  const deps = makeDeps();
  const out = await run(deps, req('alice', makeWav({ seconds: 3 })));
  assertEquals(out.status, 200);
  assertEquals(out.body, { text: 'hello there' });
  assertEquals(deps.transcribed.length, 1);
  assertEquals(deps.transcribed[0].length, 44 + 3 * 32_000);
});

Deno.test('200 with empty text when the clip is silence', async () => {
  const out = await run(makeDeps({ transcribe: () => Promise.resolve('') }), req('alice', makeWav()));
  assertEquals(out.status, 200);
  assertEquals(out.body, { text: '' });
});

Deno.test('502 when Gemini fails, with a generic message that leaks nothing', async () => {
  const deps = makeDeps({ transcribe: () => Promise.reject(new Error('Gemini returned 500: secret detail')) });
  const out = await run(deps, req('alice', makeWav()));
  assertEquals(out.status, 502);
  assertEquals(out.body, { error: ERR.transcriber });
});

Deno.test('the audio is never logged', async () => {
  const logged: unknown[][] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => { logged.push(a); };
  console.error = (...a) => { logged.push(a); };
  console.warn = (...a) => { logged.push(a); };
  try {
    const wav = makeWav({ seconds: 1 });
    await run(makeDeps({ transcribe: () => Promise.reject(new Error('boom')) }), req('alice', wav));
    const dump = JSON.stringify(logged, (_k, v) => (v instanceof Uint8Array ? `bytes:${v.length}` : v));
    assert(!dump.includes('hello there'));
    for (const entry of logged) for (const part of entry) {
      assert(!(part instanceof Uint8Array), 'no logged argument may be the audio');
    }
  } finally {
    console.log = orig.log; console.error = orig.error; console.warn = orig.warn;
  }
});

// ── Gemini only ever receives bytes this function built (P1576 review M2) ───

Deno.test('Gemini gets a freshly built canonical file: a LIST chunk and trailing bytes the client sent are not forwarded', async () => {
  const base = makeWav({ seconds: 2, trailing: 300 });
  const list = new Uint8Array(12);
  list.set([0x4c, 0x49, 0x53, 0x54], 0); // 'LIST'
  new DataView(list.buffer).setUint32(4, 4, true);
  const wav = new Uint8Array([...base.subarray(0, 36), ...list, ...base.subarray(36)]);
  const deps = makeDeps();
  const out = await run(deps, req('alice', wav));
  assertEquals(out.status, 200);
  const sent = deps.transcribed[0];
  assertEquals(sent.length, 44 + 2 * 32_000);
  assertEquals(String.fromCharCode(...sent.subarray(36, 40)), 'data');
  assertEquals(String.fromCharCode(...sent.subarray(12, 16)), 'fmt ');
  assert(!String.fromCharCode(...sent).includes('LIST'), 'the client chunk layout must not survive');
});

Deno.test('a file with two fmt chunks is refused as not-a-WAV and nothing reaches Gemini', async () => {
  const base = makeWav({ seconds: 1 });
  const fmt = base.subarray(12, 36); // a whole 'fmt ' chunk, 8 + 16 bytes
  const slow = new Uint8Array(fmt); // a second fmt claiming 100 Hz, placed first
  new DataView(slow.buffer).setUint32(12, 100, true);
  const wav = new Uint8Array([...base.subarray(0, 12), ...slow, ...base.subarray(12)]);
  const deps = makeDeps();
  const out = await run(deps, req('alice', wav));
  assertEquals(out.status, 400);
  assertEquals(out.body.error, ERR.notWav);
  assertEquals(deps.transcribed.length, 0);
});
