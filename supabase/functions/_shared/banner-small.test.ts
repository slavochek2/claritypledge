// Deno test: run with
//   deno test --allow-net --allow-env --allow-read supabase/functions/_shared/banner-small.test.ts
//
// P1417: the edge functions that save a banner (generate-banner, generate-event-banner) also save
// its small copy — 800px WebP at <path>.w800.webp, the path the app derives — and remove it with
// the banner. Making the copy is best effort: a failure is logged and never fails the save.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import encodePng from 'https://esm.sh/@jsquash/png@3.1.1/encode.js';
import decodeWebp from 'https://esm.sh/@jsquash/webp@1.5.0/decode.js';
import { BANNER_SMALL_SUFFIX, smallPathFor, encodeSmallWebp, storeSmallCopy, removeBannerAndSmallCopy, scheduleSmallCopy, imageSize, SMALL_COPY_MAX_PIXELS } from './banner-small.ts';

async function pngOf(width: number, height: number): Promise<Uint8Array> {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i / 4) % 256; data[i + 1] = 120; data[i + 2] = 200; data[i + 3] = 255;
  }
  return new Uint8Array(await encodePng({ data, width, height, colorSpace: 'srgb' } as ImageData));
}

Deno.test('path rule matches the app: <path>.w800.webp', () => {
  assertEquals(BANNER_SMALL_SUFFIX, '.w800.webp');
  assertEquals(smallPathFor('event/abc/def.png'), 'event/abc/def.png.w800.webp');
});

Deno.test('encodes a wide PNG to an 800px WebP, aspect kept', async () => {
  const out = await encodeSmallWebp(await pngOf(1376, 768), 'image/png');
  assert(out !== null);
  const img = await decodeWebp(out.buffer as ArrayBuffer);
  assertEquals([img.width, img.height], [800, 447]);
});

Deno.test('never enlarges a narrow banner', async () => {
  const out = await encodeSmallWebp(await pngOf(600, 300), 'image/png');
  const img = await decodeWebp(out!.buffer as ArrayBuffer);
  assertEquals([img.width, img.height], [600, 300]);
});

Deno.test('unsupported or broken input gives null, never throws', async () => {
  assertEquals(await encodeSmallWebp(new Uint8Array([1, 2, 3]), 'image/png'), null);
  assertEquals(await encodeSmallWebp(new Uint8Array([1, 2, 3]), 'image/gif'), null);
});

type Seen = { url: string; method: string; headers: Headers };
function stubFetch(status: number): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers) });
    return Promise.resolve(new Response('{}', { status }));
  };
  return seen;
}

Deno.test('storeSmallCopy: POSTs the WebP to <bucket>/<path>.w800.webp with the service key, no-cache', async () => {
  const real = globalThis.fetch;
  try {
    const seen = stubFetch(200);
    const ok = await storeSmallCopy('https://x.supabase.co', 'svc-key', 'banners', 'event/e1/b1.png', await pngOf(1376, 768), 'image/png');
    assertEquals(ok, true);
    assertEquals(seen.length, 1);
    assertEquals(seen[0]!.url, 'https://x.supabase.co/storage/v1/object/banners/event/e1/b1.png.w800.webp');
    assertEquals(seen[0]!.method, 'POST');
    assertEquals(seen[0]!.headers.get('content-type'), 'image/webp');
    assertEquals(seen[0]!.headers.get('cache-control'), 'no-cache');
    assertEquals(seen[0]!.headers.get('authorization'), 'Bearer svc-key');
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test('storeSmallCopy: an upload error is reported as false, never thrown', async () => {
  const real = globalThis.fetch;
  try {
    stubFetch(500);
    assertEquals(await storeSmallCopy('https://x.supabase.co', 'k', 'banners', 'event/e/b.png', await pngOf(900, 450), 'image/png'), false);
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test('removeBannerAndSmallCopy removes both objects in one call', async () => {
  const removed: string[][] = [];
  const client = { storage: { from: (_b: string) => ({ remove: (paths: string[]) => { removed.push(paths); return Promise.resolve({ error: null }); } }) } };
  await removeBannerAndSmallCopy(client, 'event-banners', 'e1/old.png');
  assertEquals(removed, [['e1/old.png', 'e1/old.png.w800.webp']]);
});

// ── P1417 delta review: the optional copy never delays or kills the main save ──

Deno.test('imageSize reads PNG and JPEG headers without decoding', async () => {
  assertEquals(imageSize(await pngOf(1376, 768), 'image/png'), { width: 1376, height: 768 });
  // Minimal JPEG: SOI, then SOF0 with height 600 / width 900.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x84, 0x03]);
  assertEquals(imageSize(jpeg, 'image/jpeg'), { width: 900, height: 600 });
  assertEquals(imageSize(new Uint8Array([1, 2, 3]), 'image/png'), null);
});

Deno.test('an image over the pixel budget is not decoded at all (the backfill can make it later)', async () => {
  // A PNG whose IHDR claims 20000x20000: if it were decoded this would fail loudly or run long.
  const huge = await pngOf(10, 10);
  new DataView(huge.buffer).setUint32(16, 20000);
  new DataView(huge.buffer).setUint32(20, 20000);
  assert(20000 * 20000 > SMALL_COPY_MAX_PIXELS);
  const t = performance.now();
  assertEquals(await encodeSmallWebp(huge, 'image/png'), null);
  assert(performance.now() - t < 50, 'returned without decoding');
});

Deno.test('storeSmallCopy bounds its upload with an abort signal', async () => {
  const real = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (_i: string | URL | Request, init?: RequestInit) => {
    signal = init?.signal;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };
  try {
    await storeSmallCopy('https://x.supabase.co', 'k', 'banners', 'event/e/b.png', await pngOf(900, 450), 'image/png');
    assert(signal instanceof AbortSignal, 'upload fetch carries a signal');
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test('scheduleSmallCopy returns at once, hands the task to EdgeRuntime.waitUntil, and the task settles by its deadline even if the work hangs', async () => {
  const registered: Promise<unknown>[] = [];
  (globalThis as unknown as { EdgeRuntime?: unknown }).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => registered.push(p) };
  try {
    const t = performance.now();
    scheduleSmallCopy(() => new Promise(() => {}), 50); // a stalled codec fetch never settles
    assert(performance.now() - t < 10, 'did not wait for the task');
    assertEquals(registered.length, 1);
    const outcome = await registered[0];
    assertEquals(outcome, 'timeout');
  } finally {
    delete (globalThis as unknown as { EdgeRuntime?: unknown }).EdgeRuntime;
  }
});

Deno.test('scheduleSmallCopy without EdgeRuntime (local) still does not block the caller', () => {
  const t = performance.now();
  scheduleSmallCopy(() => new Promise((r) => setTimeout(() => r(true), 30)), 100);
  assert(performance.now() - t < 10);
});
