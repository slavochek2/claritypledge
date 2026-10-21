// Deno test: run with
//   deno test supabase/functions/_shared/p1453-artist-banner-run.test.ts
//
// P1453: the Gemini calls respect one request-wide time budget (Supabase cuts a request at 150 s),
// and a capped or refused key is reported so an operator run can stop.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { geminiGenerateImage, runArtistBanner, visionCheck } from './artist-banner-run.ts';

function stubFetch(responses: Array<() => Response>) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => Promise.resolve(responses[calls++]!())) as typeof fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = real; } };
}

const IMAGE_OK = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AA==' } }] } }],
}));
const STATUS = (s: number) => () => new Response('{}', { status: s });

Deno.test('no image call starts when the request budget is nearly spent', async () => {
  const f = stubFetch([IMAGE_OK]);
  try {
    assertEquals(await geminiGenerateImage('k', 'p', { deadline: Date.now() + 5_000 }), null);
    assertEquals(f.calls(), 0);
  } finally { f.restore(); }
});

Deno.test('the fallback model still runs when there is time, and a 429 is reported', async () => {
  const seen: number[] = [];
  const f = stubFetch([STATUS(429), IMAGE_OK]);
  try {
    const img = await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000, onHttpStatus: (s) => seen.push(s) });
    assertEquals(img?.mimeType, 'image/png');
    assertEquals(f.calls(), 2);
    assertEquals(seen, [429]);
  } finally { f.restore(); }
});

Deno.test('a body that fails mid-read counts as that model failing, not as a thrown request', async () => {
  const broken = () => new Response(new ReadableStream({ start(c) { c.error(new DOMException('aborted', 'TimeoutError')); } }));
  const f = stubFetch([broken, IMAGE_OK]);
  try {
    const img = await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000 });
    assertEquals(img?.mimeType, 'image/png'); // fell through to the fallback model
    assertEquals(f.calls(), 2);
  } finally { f.restore(); }
});

Deno.test('the vision check is skipped (unchecked) once the budget is spent', async () => {
  const f = stubFetch([IMAGE_OK]);
  try {
    const q = { text: 'q', correctIndex: 0, noneIndex: 4, options: ['a', 'b', 'c', 'd'] };
    assertEquals(await visionCheck('k', { mimeType: 'image/png', data: 'AA==' }, q, Date.now() + 1_000), 'unchecked');
    assertEquals(f.calls(), 0);
  } finally { f.restore(); }
});

// P1534: the caller is told which calls may have been billed, so a portrait is charged what it cost.
Deno.test('billable calls: a refused call is not billed, an answered one is, with its model', async () => {
  const billed: string[] = [];
  const f = stubFetch([STATUS(429), IMAGE_OK]);
  try {
    await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000, onBillableCall: (m) => billed.push(m) });
    assertEquals(billed, ['gemini-3-pro-image-preview']);
  } finally { f.restore(); }
});

Deno.test('billable calls: the primary model answering is one call at its price', async () => {
  const billed: string[] = [];
  const f = stubFetch([IMAGE_OK]);
  try {
    await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000, onBillableCall: (m) => billed.push(m) });
    assertEquals(billed, ['gemini-3.1-flash-image-preview']);
  } finally { f.restore(); }
});

Deno.test('vision calls: a check skipped for time is not counted, a sent one is', async () => {
  let sent = 0;
  const q = { text: 'which?', correctIndex: 0 } as Parameters<typeof visionCheck>[2];
  const img = { mimeType: 'image/png', data: 'AA==' };
  assertEquals(await visionCheck('k', img, q, Date.now() + 1_000, () => sent++), 'unchecked');
  assertEquals(sent, 0);
  const f = stubFetch([STATUS(500)]);
  try {
    await visionCheck('k', img, q, Date.now() + 100_000, () => sent++);
    assertEquals(sent, 1);
  } finally { f.restore(); }
});

Deno.test('billable calls: a request that throws (timeout) is counted, on the safe side', async () => {
  const billed: string[] = [];
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => (calls++ === 0 ? Promise.reject(new DOMException('t', 'TimeoutError')) : Promise.resolve(IMAGE_OK()))) as typeof fetch;
  try {
    await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000, onBillableCall: (m) => billed.push(m) });
    assertEquals(billed, ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview']);
  } finally { globalThis.fetch = real; }
});

Deno.test('billable calls: an answered call with an unreadable body is counted', async () => {
  const billed: string[] = [];
  const broken = () => new Response(new ReadableStream({ start(c) { c.error(new DOMException('aborted', 'TimeoutError')); } }));
  const f = stubFetch([broken, STATUS(500)]);
  try {
    await geminiGenerateImage('k', 'p', { deadline: Date.now() + 100_000, onBillableCall: (m) => billed.push(m) });
    assertEquals(billed, ['gemini-3.1-flash-image-preview']);
  } finally { f.restore(); }
});

Deno.test('runArtistBanner forwards the billing callbacks: one image and one sent check are reported', async () => {
  const billed: string[] = [];
  let checks = 0;
  const VISION = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"choice":0}' }] } }] }));
  const f = stubFetch([IMAGE_OK, VISION]);
  try {
    await runArtistBanner({
      apiKey: 'k', logTag: 't', aspectRatio: '1:1', skipDarkness: true,
      onGenerate: (attempt) => attempt <= 1,
      onBillableCall: (m) => billed.push(m),
      onVisionCall: () => { checks++; },
    });
    assertEquals(billed, ['gemini-3.1-flash-image-preview']);
    assertEquals(checks, 1);
  } finally { f.restore(); }
});
