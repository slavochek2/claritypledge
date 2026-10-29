// Deno test: run with `deno test --config supabase/functions/deno.json supabase/functions/_shared/gemini-transcribe.test.ts`
//
// P1576: the shared Gemini transcription call and the WAV header reader the clip functions
// bound duration with. The header reader is the only defence against over-long audio (Gemini
// accepts it, bills it, and silently truncates), so the fixture can emit headers that lie.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canonicalWav, parseWavHeader, transcribeWav } from './gemini-transcribe.ts';

function makeWav(opts: {
  seconds?: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  declaredDataBytes?: number;
  audioFormat?: number;
  extraChunk?: boolean;
  oddExtraChunk?: boolean;
} = {}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 16_000;
  const channels = opts.channels ?? 1;
  const bits = opts.bitsPerSample ?? 16;
  const seconds = opts.seconds ?? 5;
  const dataBytes = Math.round(seconds * sampleRate * (bits / 8) * channels);
  const extra = opts.oddExtraChunk ? 8 + 5 + 1 : opts.extraChunk ? 8 + 4 : 0;
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
  view.setUint32(28, sampleRate * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  let at = 36;
  if (opts.extraChunk || opts.oddExtraChunk) {
    put(at, 'LIST');
    const size = opts.oddExtraChunk ? 5 : 4;
    view.setUint32(at + 4, size, true);
    at += 8 + size + (size % 2);
  }
  put(at, 'data');
  view.setUint32(at + 4, opts.declaredDataBytes ?? dataBytes, true);
  return buf;
}

// ── parseWavHeader ──────────────────────────────────────────────────────────

Deno.test('parseWavHeader reads a canonical 16 kHz mono 16-bit header', () => {
  const info = parseWavHeader(makeWav({ seconds: 5 }));
  assertEquals(info, { sampleRate: 16_000, channels: 1, bitsPerSample: 16, dataBytes: 160_000, durationMs: 5000 });
});

Deno.test('parseWavHeader walks chunks: a LIST chunk before data is not read as samples', () => {
  assertEquals(parseWavHeader(makeWav({ seconds: 2, extraChunk: true }))?.durationMs, 2000);
});

Deno.test('parseWavHeader honours the pad byte after an odd-sized chunk', () => {
  assertEquals(parseWavHeader(makeWav({ seconds: 2, oddExtraChunk: true }))?.durationMs, 2000);
});

Deno.test('parseWavHeader trusts the smaller of declared and arrived data (a lying header cannot inflate duration)', () => {
  const wav = makeWav({ seconds: 1, declaredDataBytes: 0xFFFFFFFF });
  assertEquals(parseWavHeader(wav)?.durationMs, 1000);
});

Deno.test('parseWavHeader reports a long declared recording as long (the cap is the caller job)', () => {
  assertEquals(parseWavHeader(makeWav({ seconds: 200 }))?.durationMs, 200_000);
});

Deno.test('parseWavHeader returns null for non-WAV, short, compressed and headerless-fmt input', () => {
  assertEquals(parseWavHeader(new Uint8Array(10)), null);
  assertEquals(parseWavHeader(new Uint8Array(100)), null);
  assertEquals(parseWavHeader(makeWav({ audioFormat: 3 })), null);
  const noFmt = makeWav();
  noFmt.set([0x78, 0x78, 0x78, 0x78], 12); // 'xxxx' where 'fmt ' was
  assertEquals(parseWavHeader(noFmt), null);
});

Deno.test('parseWavHeader reports the real format so the caller can refuse a non-16k file', () => {
  const info = parseWavHeader(makeWav({ sampleRate: 48_000, channels: 2 }));
  assertEquals(info?.sampleRate, 48_000);
  assertEquals(info?.channels, 2);
});

// ── transcribeWav ───────────────────────────────────────────────────────────

function fakeFetch(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(respond());
  }) as typeof fetch;
  return { impl, calls };
}
const ok = (parts: unknown[]) => new Response(JSON.stringify({ candidates: [{ content: { parts } }] }), { status: 200 });

Deno.test('transcribeWav sends audio ONLY (no systemInstruction), keyed by header, and reads audioTranscription.text', async () => {
  const f = fakeFetch(() => ok([{ audioTranscription: { text: '  hello world \n' } }]));
  const text = await transcribeWav('KEY', makeWav({ seconds: 1 }), f.impl);
  assertEquals(text, 'hello world');
  assertEquals(f.calls.length, 1);
  assert(f.calls[0].url.includes('gemini-3.5-transcribe:generateContent'));
  const headers = f.calls[0].init.headers as Record<string, string>;
  assertEquals(headers['x-goog-api-key'], 'KEY');
  assert(!f.calls[0].url.includes('KEY'), 'the key never goes in the URL');
  const body = JSON.parse(String(f.calls[0].init.body));
  assertEquals(Object.keys(body), ['contents']);
  assertEquals(body.contents[0].parts.length, 1);
  assertEquals(body.contents[0].parts[0].inlineData.mimeType, 'audio/wav');
  assert(body.contents[0].parts[0].inlineData.data.length > 0);
});

Deno.test('transcribeWav falls back to parts[0].text', async () => {
  const f = fakeFetch(() => ok([{ text: 'fallback' }]));
  assertEquals(await transcribeWav('K', makeWav(), f.impl), 'fallback');
});

Deno.test('transcribeWav returns "" for an empty candidate (silence is a legitimate result)', async () => {
  const empty = fakeFetch(() => new Response(JSON.stringify({ candidates: [{ content: { parts: [{}] } }] }), { status: 200 }));
  assertEquals(await transcribeWav('K', makeWav(), empty.impl), '');
  const none = fakeFetch(() => new Response(JSON.stringify({}), { status: 200 }));
  assertEquals(await transcribeWav('K', makeWav(), none.impl), '');
});

Deno.test('transcribeWav throws with the status in the message on a non-2xx', async () => {
  const f = fakeFetch(() => new Response('nope', { status: 429 }));
  const err = await assertRejects(() => transcribeWav('K', makeWav(), f.impl), Error);
  assert(err.message.includes('429'));
});

Deno.test('transcribeWav base64-encodes a large clip without blowing the argument limit', async () => {
  const f = fakeFetch(() => ok([{ audioTranscription: { text: 'x' } }]));
  await transcribeWav('K', makeWav({ seconds: 180 }), f.impl); // 5.76 MB
  const body = JSON.parse(String(f.calls[0].init.body));
  assertEquals(atob(body.contents[0].parts[0].inlineData.data).length, 44 + 180 * 32_000);
});

Deno.test('transcribeWav gives the request a deadline: a Gemini call that never answers is aborted and throws', async () => {
  let aborted = false;
  const hangs = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'TimeoutError')); });
    })) as unknown as typeof fetch;
  let threw = false;
  try {
    await transcribeWav('k', new Uint8Array(100), hangs, 20);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(aborted, true);
});

Deno.test('transcribeWav passes a signal on every call (default deadline 60 s)', async () => {
  let signal: AbortSignal | null | undefined;
  const ok = ((_url: string, init: RequestInit) => {
    signal = init.signal;
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ audioTranscription: { text: 'x' } }] } }] })));
  }) as unknown as typeof fetch;
  await transcribeWav('k', new Uint8Array(10), ok);
  assertEquals(signal instanceof AbortSignal, true);
});

// ── a header the validator and a decoder could read differently (P1576 review M2) ──────────────

/** RIFF/WAVE with an explicit chunk list; each chunk is [id, payload]. */
function riff(chunks: Array<[string, Uint8Array]>): Uint8Array {
  const total = 12 + chunks.reduce((n, [, p]) => n + 8 + p.length + (p.length % 2), 0);
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  const put = (off: number, s: string) => { for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, total - 8, true); put(8, 'WAVE');
  let at = 12;
  for (const [id, payload] of chunks) {
    put(at, id); view.setUint32(at + 4, payload.length, true); buf.set(payload, at + 8);
    at += 8 + payload.length + (payload.length % 2);
  }
  return buf;
}
function fmtChunk(sampleRate: number): Uint8Array {
  const b = new Uint8Array(16);
  const v = new DataView(b.buffer);
  v.setUint16(0, 1, true); v.setUint16(2, 1, true); v.setUint32(4, sampleRate, true);
  v.setUint32(8, sampleRate * 2, true); v.setUint16(12, 2, true); v.setUint16(14, 16, true);
  return b;
}
const pcm = (bytes: number) => new Uint8Array(bytes).map((_, i) => (i * 7) & 0xff);

Deno.test('parseWavHeader refuses a second fmt chunk (the validator and a decoder could pick different ones)', () => {
  // fmt(100 Hz) then fmt(16 kHz): the last-wins parse used to report 16 kHz / 1000 ms
  const wav = riff([['fmt ', fmtChunk(100)], ['fmt ', fmtChunk(16000)], ['data', pcm(32000)]]);
  assertEquals(parseWavHeader(wav), null);
  assertEquals(canonicalWav(wav), null);
  // control: the same data under ONE fmt chunk is read normally
  assertEquals(parseWavHeader(riff([['fmt ', fmtChunk(16000)], ['data', pcm(32000)]]))?.durationMs, 1000);
});

Deno.test('parseWavHeader refuses any chunk other than fmt, LIST and data', () => {
  for (const id of ['fact', 'JUNK', 'bext', 'cue ', 'smpl']) {
    const wav = riff([['fmt ', fmtChunk(16000)], [id, new Uint8Array(4)], ['data', pcm(3200)]]);
    assertEquals(parseWavHeader(wav), null, id);
  }
  // control: LIST is tolerated
  assertEquals(parseWavHeader(riff([['fmt ', fmtChunk(16000)], ['LIST', new Uint8Array(4)], ['data', pcm(3200)]]))?.dataBytes, 3200);
});

Deno.test('canonicalWav rebuilds a clean 44-byte header and copies exactly the PCM', () => {
  const samples = pcm(6400);
  const wav = riff([['fmt ', fmtChunk(16000)], ['LIST', new Uint8Array(5)], ['data', samples]]);
  const out = canonicalWav(wav)!;
  assertEquals(out.length, 44 + 6400);
  assertEquals(parseWavHeader(out), { sampleRate: 16000, channels: 1, bitsPerSample: 16, dataBytes: 6400, durationMs: 200 });
  assertEquals(out.subarray(44), samples);
  // the header is the canonical layout, byte for byte: data tag at 36, fmt chunk size 16
  assertEquals(String.fromCharCode(...out.subarray(36, 40)), 'data');
  assertEquals(new DataView(out.buffer).getUint32(16, true), 16);
});

Deno.test('canonicalWav never forwards trailing bytes or a declared size beyond what arrived', () => {
  const samples = pcm(3200);
  const padded = new Uint8Array([...riff([['fmt ', fmtChunk(16000)], ['data', samples]]), ...new Uint8Array(500).fill(9)]);
  // the data chunk is the last chunk, so the declared 3200 bytes are all there is; trailing junk is dropped
  assertEquals(canonicalWav(padded)!.length, 44 + 3200);
  // a header declaring more than arrived is trimmed to what arrived, in whole 16-bit samples
  const liar = riff([['fmt ', fmtChunk(16000)], ['data', pcm(3200)]]);
  new DataView(liar.buffer).setUint32(40, 999_999, true); // data chunk size lives at offset 40 here
  const out = canonicalWav(liar)!;
  assertEquals(out.length, 44 + 3200);
  assertEquals(new DataView(out.buffer).getUint32(40, true), 3200);
});

Deno.test('canonicalWav returns null for anything parseWavHeader refuses', () => {
  assertEquals(canonicalWav(new Uint8Array(10)), null);
  assertEquals(canonicalWav(riff([['data', pcm(100)]])), null);
});
