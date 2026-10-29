/**
 * P1576 Part A: request handler for transcribe-clip, separated from the Deno.serve wiring so
 * every gate can be exercised with fakes (handler.test.ts).
 *
 * One WAV clip in, `{ text }` out. No room, no chat, no row: dictation text lands in the
 * composer on the client and nothing is persisted here. The audio is never stored and never
 * logged — the only things that reach a log line are a status and an error message.
 *
 * Order of gates, each failing closed:
 *   method → env present → Bearer JWT resolves to a user (401) → declared size (413) →
 *   per-user rate limit (429, or 503 if the limiter itself errors) → body read under a hard
 *   byte cap (413) → RIFF/WAVE header (400) → 16 kHz mono 16-bit (400) → not empty (400) →
 *   decoded duration within the cap (413) → no padding past the declared audio (400) →
 *   Gemini on exactly this clip (502 on failure).
 *
 * The duration comes from the WAV header the audio itself carries, never from anything the
 * client declares: Gemini accepts over-long audio, bills it in full and silently returns only
 * the opening part, so refusing to construct the request is the only defence.
 */
import { canonicalWav, parseWavHeader } from '../_shared/gemini-transcribe.ts';

/** Founder, 2026-10-26: dictation clip max 3 minutes. Enforced here, by decoded duration. */
export const MAX_CLIP_DURATION_MS = 180_000;

const HEADER_SLACK = 1024; // a RIFF header with extra chunks; never audio

/**
 * The pre-decode guard: a body over this is refused before it is buffered. It must sit ABOVE a
 * full-length clip (180 s = 5.76 MB) by a real margin, not a hair: a cap at the 180 s byte size
 * makes the duration check reachable only in a ~0.03 s band, dead code that reads as a working
 * guard (the transcribe-slice lesson). At 8 MB (250 s) a 181 s clip reaches the duration check
 * and gets the precise error, while the cap still bounds what one request can make us buffer.
 */
export const MAX_CLIP_BYTES = 8_000_000;

/** Per user. Fail-closed: if the limiter cannot decide, the clip is refused. */
export const CLIP_RATE_LIMIT = { limit: 6, windowSeconds: 60 } as const;

export const ERR = {
  unauthorized: 'Unauthorized',
  methodNotAllowed: 'Method not allowed',
  notWav: 'Clip is not a WAV file',
  wavFormat: 'Clip must be 16 kHz mono 16-bit PCM',
  empty: 'Clip contains no audio',
  padded: 'Clip carries data beyond its declared audio',
  tooLong: 'Clip exceeds the maximum duration',
  tooLarge: 'Clip exceeds the maximum size',
  rateLimited: 'Too many requests. Please wait a moment and try again.',
  unavailable: 'Service temporarily unavailable',
  transcriber: 'Transcription failed',
} as const;

export interface HandlerDeps {
  corsHeaders: Record<string, string>;
  envReady: boolean;
  /** Resolves a Bearer token to a user id, or null when invalid/expired. */
  getUserId: (token: string) => Promise<string | null>;
  /**
   * Reserves one slot for this user on database time. 0 = admitted, otherwise the Retry-After
   * in seconds. Must throw (or reject) when it cannot decide: the handler fails closed.
   */
  reserveSlot: (userId: string) => Promise<number>;
  /** ONE clip in, its transcript out ('' for silence). Throws on any Gemini failure. */
  transcribe: (wav: Uint8Array) => Promise<string>;
}

/** Reads the body, giving up the moment it passes `max` rather than buffering it all first. */
async function readCapped(req: Request, max: number): Promise<Uint8Array | 'too-large'> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return 'too-large';
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A refusal: the status, the message, and any extra headers (Retry-After). */
interface Refusal {
  status: number;
  error: string;
  headers?: Record<string, string>;
}

/** Everything that can turn a request away before its body is read: method, env, JWT, declared size, rate limit. */
async function admit(req: Request, deps: HandlerDeps): Promise<{ userId: string } | Refusal> {
  if (req.method !== 'POST') return { status: 405, error: ERR.methodNotAllowed };
  if (!deps.envReady) return { status: 500, error: ERR.unavailable };

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return { status: 401, error: ERR.unauthorized };
  const userId = await deps.getUserId(authHeader.slice('Bearer '.length));
  if (!userId) return { status: 401, error: ERR.unauthorized };

  // Declared size, before spending a limiter slot or buffering anything.
  const declared = Number(req.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) return { status: 413, error: ERR.tooLarge };

  // Rate limit, keyed by the authenticated user and nothing in the request.
  let retryAfter: number;
  try {
    retryAfter = await deps.reserveSlot(userId);
  } catch {
    console.error('[transcribe-clip] rate limiter unavailable');
    return { status: 503, error: ERR.unavailable };
  }
  if (!Number.isInteger(retryAfter) || retryAfter < 0) return { status: 503, error: ERR.unavailable };
  if (retryAfter > 0) {
    return {
      status: 429,
      error: ERR.rateLimited,
      headers: { 'Retry-After': String(retryAfter), 'Access-Control-Expose-Headers': 'Retry-After' },
    };
  }
  return { userId };
}

/** The WAV's own header decides what the clip is: format, emptiness, length, padding. */
function checkWav(wav: Uint8Array): Refusal | null {
  const info = parseWavHeader(wav);
  if (!info) return { status: 400, error: ERR.notWav };
  if (info.sampleRate !== 16_000 || info.channels !== 1 || info.bitsPerSample !== 16) {
    return { status: 400, error: ERR.wavFormat };
  }
  if (info.dataBytes === 0) return { status: 400, error: ERR.empty };
  if (info.durationMs > MAX_CLIP_DURATION_MS) return { status: 413, error: ERR.tooLong };
  // The audio Gemini is billed for is what the header declares; anything beyond a header's
  // worth of slack is a padded payload, not a recording.
  if (wav.length - info.dataBytes > 44 + HEADER_SLACK) return { status: 400, error: ERR.padded };
  return null;
}

export async function handleTranscribeClip(req: Request, deps: HandlerDeps): Promise<Response> {
  const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...deps.corsHeaders, ...extra },
    });
  const refuse = (r: Refusal) => json(r.status, { error: r.error }, r.headers);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: deps.corsHeaders });

  const admitted = await admit(req, deps);
  if ('status' in admitted) return refuse(admitted);

  const wav = await readCapped(req, MAX_CLIP_BYTES);
  if (wav === 'too-large') return refuse({ status: 413, error: ERR.tooLarge });
  const bad = checkWav(wav);
  if (bad) return refuse(bad);

  // Gemini, on exactly this clip: a header rebuilt here from the validated format plus the PCM the data
  // chunk holds. The client's own header, chunk layout and trailing bytes are never forwarded, so what
  // Gemini decodes and bills is what checkWav measured.
  const clean = canonicalWav(wav);
  if (!clean) return refuse({ status: 400, error: ERR.notWav });
  try {
    return json(200, { text: await deps.transcribe(clean) });
  } catch (err) {
    // Message only: never the audio, never the response body.
    console.error('[transcribe-clip] transcription failed:', err instanceof Error ? err.message.slice(0, 120) : 'unknown');
    return json(502, { error: ERR.transcriber });
  }
}
