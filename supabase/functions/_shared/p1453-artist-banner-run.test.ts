// Deno test: run with
//   deno test supabase/functions/_shared/p1453-artist-banner-run.test.ts
//
// P1453: the Gemini calls respect one request-wide time budget (Supabase cuts a request at 150 s),
// and a capped or refused key is reported so an operator run can stop.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { geminiGenerateImage, visionCheck } from './artist-banner-run.ts';

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
