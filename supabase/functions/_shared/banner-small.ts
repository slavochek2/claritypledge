/**
 * P1417: event banners have a small copy — 800px wide WebP stored next to the original at
 * `<path>.w800.webp` — that the app loads on phones (src/lib/banner-small.ts derives the same path;
 * src/tests/p1417-banner-small-parity.test.ts pins the two together). Edge functions that save a
 * banner make the copy at save time and remove it with the banner.
 *
 * Supabase on-the-fly transforms are not enabled on this project, and the edge runtime has no
 * native image library, so the copy is encoded with the Squoosh codecs compiled to wasm (@jsquash),
 * imported from esm.sh like the other functions' dependencies (an `npm:` specifier fails the
 * pre-commit `deno check`, which resolves against the app's node_modules).
 * Measured in Deno on 1376x768 Gemini output: decode + resize + encode about 200 ms. The codecs
 * are imported lazily, so a function that never makes a copy never loads them.
 *
 * Best effort by design, and never in the save's way (P1417 delta review): the functions call
 * `scheduleSmallCopy`, which returns at once and hands the work to `EdgeRuntime.waitUntil`, so the
 * banner URL is returned before any codec loads. The work has an overall deadline (a dynamic import
 * cannot be aborted, and a stalled codec fetch would otherwise never settle), the upload has its own
 * timeout, and an image over the pixel budget is not decoded at all — the backfill
 * (scripts/event-banner-small.ts) makes those copies later. Every failure is logged and returns
 * null/false; the app falls back to the original when the copy is missing.
 *
 * Codec versions are pinned exactly; each module loads its .wasm from esm.sh next to itself.
 */

export const BANNER_SMALL_WIDTH = 800;
export const BANNER_SMALL_SUFFIX = `.w${BANNER_SMALL_WIDTH}.webp`;
const QUALITY = 75; // same as scripts/lib/banner-small-encode.ts
/** Above this the copy is left to the backfill: decoding it could exceed the edge CPU limit. 4K is 9.4M. */
export const SMALL_COPY_MAX_PIXELS = 10_000_000;
/** The whole background task — codec loads, encode, upload — settles by then, whatever hangs. */
export const SMALL_COPY_DEADLINE_MS = 25_000;
const UPLOAD_TIMEOUT_MS = 10_000;

/** Width and height from a PNG or JPEG header, without decoding; null when unknown. */
export function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (mime === 'image/png') {
      if (bytes.length < 24 || dv.getUint32(12) !== 0x49484452) return null; // 'IHDR'
      return { width: dv.getUint32(16), height: dv.getUint32(20) };
    }
    if (mime === 'image/jpeg') {
      if (dv.getUint16(0) !== 0xffd8) return null;
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = dv.getUint8(i + 1);
        // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
        }
        i += 2 + dv.getUint16(i + 2);
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function smallPathFor(path: string): string {
  return `${path}${BANNER_SMALL_SUFFIX}`;
}

async function decode(bytes: Uint8Array, mime: string): Promise<ImageData> {
  const buf = bytes.slice().buffer as ArrayBuffer;
  if (mime === 'image/png') return (await import('https://esm.sh/@jsquash/png@3.1.1/decode.js')).default(buf);
  if (mime === 'image/jpeg') return (await import('https://esm.sh/@jsquash/jpeg@1.6.0/decode.js')).default(buf);
  if (mime === 'image/webp') return (await import('https://esm.sh/@jsquash/webp@1.5.0/decode.js')).default(buf);
  throw new Error(`unsupported image type ${mime}`);
}

/** 800px-wide WebP (never enlarged), or null when the input cannot be decoded. */
export async function encodeSmallWebp(bytes: Uint8Array, mime: string): Promise<Uint8Array | null> {
  const size = imageSize(bytes, mime);
  if (size && size.width * size.height > SMALL_COPY_MAX_PIXELS) {
    console.warn('Small banner skipped: over the pixel budget, the backfill will make it', size);
    return null;
  }
  try {
    let img = await decode(bytes, mime);
    if (img.width > BANNER_SMALL_WIDTH) {
      const resize = (await import('https://esm.sh/@jsquash/resize@2.1.1')).default;
      const height = Math.max(1, Math.round((img.height * BANNER_SMALL_WIDTH) / img.width));
      img = await resize(img, { width: BANNER_SMALL_WIDTH, height });
    }
    const encode = (await import('https://esm.sh/@jsquash/webp@1.5.0/encode.js')).default;
    return new Uint8Array(await encode(img, { quality: QUALITY }));
  } catch (e) {
    console.error('Small banner encode failed', { mime, error: (e as Error).message });
    return null;
  }
}

/**
 * Encode and upload the small copy of `<bucket>/<path>` through the storage REST API (the JS
 * client can only send `max-age=…`; originals are stored `no-cache`, and the copy matches them).
 * Upserts: the copy belongs to an original that was just written, so any older one is stale.
 */
export async function storeSmallCopy(
  supabaseUrl: string,
  serviceKey: string,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<boolean> {
  try {
    const small = await encodeSmallWebp(bytes, mime);
    if (!small) return false;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${smallPathFor(path)}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'image/webp',
        'cache-control': 'no-cache',
        'x-upsert': 'true',
      },
      body: new Blob([small as Uint8Array<ArrayBuffer>], { type: 'image/webp' }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('Small banner upload failed', { bucket, path, status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (e) {
    console.error('Small banner store failed', { bucket, path, error: (e as Error).message });
    return false;
  }
}

type Settled = 'done' | 'timeout' | 'error';

/**
 * Run `task` after the response: returns immediately, registers the work with the runtime's
 * `EdgeRuntime.waitUntil` (Supabase background tasks) so the isolate is kept alive for it, and
 * settles it by `deadlineMs` whatever the task does. Without EdgeRuntime (local Deno, tests) the
 * work still runs unawaited.
 */
export function scheduleSmallCopy(task: () => Promise<unknown>, deadlineMs = SMALL_COPY_DEADLINE_MS): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Settled>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), deadlineMs);
  });
  const work = Promise.resolve()
    .then(task)
    .then((): Settled => 'done', (e): Settled => {
      console.error('Small banner task failed', { error: (e as Error)?.message });
      return 'error';
    });
  const settled = Promise.race([work, deadline]).then((outcome) => {
    clearTimeout(timer);
    if (outcome === 'timeout') console.error('Small banner task timed out; the backfill will make it', { deadlineMs });
    return outcome;
  });
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  rt?.waitUntil?.(settled);
}

interface StorageRemover {
  storage: { from: (bucket: string) => { remove: (paths: string[]) => Promise<{ error: { message: string } | null }> } };
}

/** Remove a banner and its small copy together (a missing copy is not an error). */
export async function removeBannerAndSmallCopy(client: StorageRemover, bucket: string, path: string) {
  return await client.storage.from(bucket).remove([path, smallPathFor(path)]);
}
