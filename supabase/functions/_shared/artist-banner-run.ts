/**
 * P1453: runtime wiring for artist banners — Gemini image and vision calls, pixel measurement.
 * Shared by generate-banner (a user's own profile, interactive key) and generate-agent-banner
 * (operator, batch key). The decisions themselves live in artist-banner.ts (pure, unit-tested).
 *
 * Logging rule (P1453 security review): status codes and fixed error classes only — never a
 * prompt, a vision answer's free text, image bytes, or the key. The key goes in the
 * `x-goog-api-key` header, never in the URL.
 */

import { decode, imageSize, SMALL_COPY_MAX_PIXELS } from './banner-small.ts';
import { centralLuma, inkFor, type Ink } from './banner-ink.ts';
import {
  cryptoRng,
  creditFor,
  generateArtistBanner,
  pickArtist,
  type BannerCredit,
  type Candidate,
  type GeneratedImage,
  type VisionQuestion,
  type VisionVerdict,
} from './artist-banner.ts';
import type { ArtistEntry } from './artist-pool.ts';

export const IMAGE_MODEL_PRIMARY = 'gemini-3.1-flash-image-preview';
export const IMAGE_MODEL_FALLBACK = 'gemini-3-pro-image-preview';
/** Verified to accept image inlineData + a JSON response schema (P1453 /dev probe). */
export const VISION_MODEL = 'gemini-3.8-flash';

const IMAGE_TIMEOUT_MS = 45_000;
const VISION_TIMEOUT_MS = 20_000;
/**
 * Every Gemini call of one request finishes within this budget. Supabase cuts a request at 150 s
 * (504) — before the URL is returned, so the banner is lost and cleanup may already have run. The
 * remaining ~40 s cover upload, the credit write and cleanup (P1453 review: an "only check before
 * starting" deadline allowed 79 + 45 + 45 + 20 ≈ 190 s).
 */
const BUDGET_MS = 110_000;
/** Do not start an image call (primary or fallback) with less time than this left. */
const MIN_IMAGE_MS = 15_000;
/** Do not start a vision check with less than this left — the image ships 'unchecked'. */
const MIN_VISION_MS = 4_000;

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * One image from Gemini (primary model, then the fallback), or null. `aspectRatio` goes in
 * `imageConfig`; omitted, the request body is the same as before P1453.
 */
export async function geminiGenerateImage(
  apiKey: string,
  prompt: string,
  opts: {
    aspectRatio?: string;
    /** Absolute ms: no call starts with less than MIN_IMAGE_MS left, and none runs past it. */
    deadline?: number;
    /** Each non-2xx status from Gemini (429 = quota/cap, 403 = key refused). */
    onHttpStatus?: (status: number) => void;
  } = {},
): Promise<GeneratedImage | null> {
  const generationConfig: Record<string, unknown> = { responseModalities: ['IMAGE'] };
  if (opts.aspectRatio) generationConfig.imageConfig = { aspectRatio: opts.aspectRatio };
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig });

  for (const model of [IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK]) {
    const left = opts.deadline === undefined ? IMAGE_TIMEOUT_MS : opts.deadline - Date.now();
    if (left < MIN_IMAGE_MS) {
      console.error('Gemini image call skipped: request time budget spent', { model });
      break;
    }
    let res: Response;
    try {
      res = await fetch(geminiUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: AbortSignal.timeout(Math.min(IMAGE_TIMEOUT_MS, left)),
      });
    } catch (e) {
      console.error('Gemini image request failed', { model, error: (e as Error).name });
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      console.error('Gemini image model error', { model, status: res.status });
      opts.onHttpStatus?.(res.status);
      continue;
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (part?.inlineData?.data && part?.inlineData?.mimeType) {
          return { mimeType: part.inlineData.mimeType, data: part.inlineData.data };
        }
      }
    }
    console.error('Gemini image response had no image', { model });
  }
  return null;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Central-band luma and signature ink. An image over the pixel budget, or one that fails to
 * decode, is not measured: luma null (darkness check skipped) and the default cream ink — never
 * an error after the generation was paid for.
 */
export async function measureImage(image: GeneratedImage): Promise<{ luma: number | null; ink: Ink }> {
  try {
    const bytes = base64ToBytes(image.data);
    const size = imageSize(bytes, image.mimeType);
    if (size && size.width * size.height > SMALL_COPY_MAX_PIXELS) return { luma: null, ink: 'cream' };
    const px = await decode(bytes, image.mimeType);
    return { luma: Math.round(centralLuma(px)), ink: inkFor(px) };
  } catch (e) {
    console.error('Banner measure failed', { mime: image.mimeType, error: (e as Error).name });
    return { luma: null, ink: 'cream' };
  }
}

/** The blind multiple-choice check. 'unchecked' when the call itself fails. */
export async function visionCheck(
  apiKey: string,
  image: GeneratedImage,
  q: VisionQuestion,
  deadline?: number,
): Promise<VisionVerdict> {
  const left = deadline === undefined ? VISION_TIMEOUT_MS : deadline - Date.now();
  if (left < MIN_VISION_MS) return 'unchecked';
  try {
    const res = await fetch(geminiUrl(VISION_MODEL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: q.text }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { choice: { type: 'INTEGER' } }, required: ['choice'] },
        },
      }),
      signal: AbortSignal.timeout(Math.min(VISION_TIMEOUT_MS, left)),
    });
    if (!res.ok) {
      await res.body?.cancel();
      console.error('Vision check error', { status: res.status });
      return 'unchecked';
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const choice = JSON.parse(typeof text === 'string' ? text : '{}')?.choice;
    if (!Number.isInteger(choice)) return 'unchecked';
    return choice === q.correctIndex ? 'pass' : 'fail';
  } catch (e) {
    console.error('Vision check failed', { error: (e as Error).name });
    return 'unchecked';
  }
}

export interface ArtistBannerResult {
  entry: ArtistEntry;
  best: Candidate;
  generations: number;
}

/**
 * Pick an artist (never `excludeArtist`) and generate its banner with the fidelity loop.
 * `onGenerate` runs before each image generation — the rate limiter's hook. `onKeyBlocked` fires
 * when Gemini answers 429 or 403 (spend cap, revoked key), so an operator run can stop.
 * Every call fits one BUDGET_MS window. Logs one line per attempt: { artist, attempt, luma, vision }.
 */
export async function runArtistBanner(opts: {
  apiKey: string;
  excludeArtist?: string | null;
  keywords?: string | null;
  onGenerate?: (attempt: number) => Promise<boolean | undefined> | boolean | undefined;
  onKeyBlocked?: () => void;
  logTag: string;
}): Promise<ArtistBannerResult | null> {
  const deadline = Date.now() + BUDGET_MS;
  const onHttpStatus = (status: number) => {
    if (status === 429 || status === 403) opts.onKeyBlocked?.();
  };
  const entry = pickArtist(cryptoRng, { excludeArtist: opts.excludeArtist });
  let generations = 0;
  const result = await generateArtistBanner(entry, opts.keywords, cryptoRng, {
    onGenerate: async (attempt) => {
      const go = await opts.onGenerate?.(attempt);
      if (go !== false) generations++;
      return go;
    },
    generate: (prompt) => geminiGenerateImage(opts.apiKey, prompt, { aspectRatio: '21:9', deadline, onHttpStatus }),
    measure: measureImage,
    vision: (image, q) => visionCheck(opts.apiKey, image, q, deadline),
    log: (line) => console.log(`${opts.logTag} attempt`, line),
  });
  if (!result) return null;
  return { entry, best: result.best, generations };
}

export { creditFor, type BannerCredit };

// ── Storage ──────────────────────────────────────────────────────────────────

export const BANNER_BUCKET = 'banners';

const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

interface StorageUploader {
  storage: {
    from: (bucket: string) => {
      upload: (path: string, body: Uint8Array, o: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
}

/** Upload under `<entityType>/<entityId>/<uuid>.<ext>` — always a new key, never an upsert. */
export async function uploadBannerImage(
  client: StorageUploader,
  entityType: string,
  entityId: string,
  image: GeneratedImage,
): Promise<{ publicUrl: string; fileName: string; bytes: Uint8Array } | null> {
  const fileName = `${entityType}/${entityId}/${crypto.randomUUID()}.${MIME_EXT[image.mimeType] ?? 'png'}`;
  const bytes = base64ToBytes(image.data);
  const { error } = await client.storage.from(BANNER_BUCKET).upload(fileName, bytes, {
    contentType: image.mimeType,
    upsert: false,
  });
  if (error) {
    console.error('Storage upload error', { entityType, entityId, error: error.message });
    return null;
  }
  const { data } = client.storage.from(BANNER_BUCKET).getPublicUrl(fileName);
  return { publicUrl: data.publicUrl, fileName, bytes };
}
