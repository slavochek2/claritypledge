/**
 * P1236: pure input validation for transcribe-slice. No Deno / network / database — the
 * whole file is unit-testable, mirroring gcs-signed-url/validate.ts.
 *
 * Two constraints shape this file, and neither is stylistic.
 *
 * 1. **RQ5 (Decision 8).** With diarization off, Gemini does not reject over-long audio: it
 *    accepts it, bills it in full, and silently returns roughly the opening five minutes.
 *    There is no error to catch. So the ONLY defence is refusing to construct the request,
 *    and a client-declared duration cannot be the thing we check — a client that lies about
 *    it is exactly the case that matters. The duration is therefore DERIVED from the WAV
 *    header the audio itself carries, and the declared value does not exist in the payload.
 *
 * 2. **Attribution and ordering are server-derived** (Decision 4, and the Security Review's
 *    ⚠️ on Invariant #3). `spoken_at` orders de-duplication, so handing that column to the
 *    client hands it the merge order; `member_id` is the attribution key. Neither may be
 *    readable from the payload. The body is validated against a strict ALLOW-list rather
 *    than a deny-list of known-bad keys: a deny-list has to be remembered every time the
 *    payload grows, and the one time it isn't is the one that ships.
 */

/** 16 kHz mono 16-bit — the format `audio.py` already decodes to before Whisper, so the
 *  live path introduces no third sample format. Exact match, not a minimum. */
export const EXPECTED_SAMPLE_RATE = 16_000;
export const EXPECTED_CHANNELS = 1;
export const EXPECTED_BITS_PER_SAMPLE = 16;

/**
 * A 5 s slice (4 s new + 1 s lead-in) at that format is ~160 KB.
 *
 * This bound MUST sit above MAX_SLICE_DURATION_MS worth of PCM (8 s = 256,044 bytes with
 * the header), and the ordering is load-bearing rather than cosmetic. At 256 KiB it did
 * NOT: the byte cap capped duration at 8.19 s, so the duration check could only ever fire
 * in a 0.19 s band and was, for every well-formed 16 kHz mono slice, dead code that read
 * as a working guard. Caught by the RQ5 test, not by review.
 *
 * The two bounds do different jobs and both need to be reachable. This one is the
 * pre-decode guard — it refuses garbage, a non-WAV blob, or a padded payload before any
 * buffer is allocated. The duration bound is the semantic one and is derived from the
 * audio's own header. A test asserts this inequality directly so that changing either
 * constant alone fails loudly.
 */
export const MAX_SLICE_BYTES = 320_000;

/** Decision 1's cadence is 4 s with 1 s of lead-in, so a well-formed slice is 5 s. The
 *  bound is 8 s: wide enough that a late timer or a long final flush is not refused,
 *  narrow enough that RQ5's five-minute truncation window is unreachable by a factor of
 *  ~37. It is deliberately NOT the harness's 30 s ceiling — that number bounded a
 *  measurement script, and a live ingest has no reason to accept six slices' worth. */
export const MAX_SLICE_DURATION_MS = 8_000;

/** 180-minute room / 4 s cadence = 2700 slices, so a sequence beyond this cannot belong to
 *  a legitimate room. It bounds replay and nothing else — see the ordering note above. */
export const MAX_SEQUENCE = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every key the body may carry. Anything else is a 400, including a key we would have
 *  ignored — an unrecognised field is a client that disagrees with the server about what
 *  this endpoint does, and that is worth surfacing rather than absorbing. */
const ALLOWED_KEYS = new Set(['roomId', 'sequence', 'audio', 'warmup']);

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
}

export type ParsedRequest =
  | { kind: 'warmup'; roomId: string }
  | { kind: 'slice'; roomId: string; sequence: number; audio: Uint8Array; wav: WavInfo };

export const VERR = {
  body: 'Invalid request body',
  unknownField: 'Unrecognised field in request body',
  roomId: 'Invalid roomId',
  sequence: 'Invalid sequence',
  audioMissing: 'Missing audio',
  audioEncoding: 'audio is not valid base64',
  audioTooLarge: 'Slice exceeds the maximum size',
  notWav: 'Slice is not a RIFF/WAVE stream',
  wavFormat: 'Slice must be 16 kHz mono 16-bit PCM',
  tooLong: 'Slice exceeds the maximum duration',
  empty: 'Slice contains no audio',
} as const;

/**
 * Reads a canonical PCM WAV header.
 *
 * Deliberately walks the chunk list rather than assuming `data` sits at offset 36: the
 * worklet-side encoder is ours today, but a header with a LIST/fact chunk in front is
 * valid WAV, and a fixed-offset reader would silently interpret chunk bytes as samples —
 * i.e. compute a duration from noise, which is the one number this file exists to trust.
 *
 * Returns null for anything it cannot read with certainty. No partial credit.
 */
export function parseWavHeader(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let offset = 12;
  let fmt: { channels: number; sampleRate: number; bitsPerSample: number; audioFormat: number } | null = null;

  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return null;
      fmt = {
        audioFormat: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!fmt) return null;
      // Trust the SMALLER of the declared data size and what actually arrived. A declared
      // size larger than the buffer is a truncated upload, not a long recording, and
      // believing it would inflate the duration this function is asked to bound.
      const dataBytes = Math.min(size, bytes.length - body);
      if (fmt.audioFormat !== 1) return null; // 1 = PCM. Compressed formats change everything below.
      const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels;
      if (bytesPerFrame <= 0 || fmt.sampleRate <= 0) return null;
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: fmt.bitsPerSample,
        dataBytes,
        durationMs: Math.round((dataBytes / bytesPerFrame / fmt.sampleRate) * 1000),
      };
    }
    // Chunks are word-aligned: an odd size carries one pad byte that is not counted in it.
    offset = body + size + (size % 2);
  }
  return null;
}

/** base64 → bytes, refusing anything over the cap BEFORE allocating the decoded buffer. */
export function decodeSliceAudio(b64: unknown): Uint8Array | null | 'too-large' {
  if (typeof b64 !== 'string' || b64.length === 0) return null;
  // 4 base64 chars per 3 bytes. Checking the ENCODED length first means an oversized
  // payload is refused without ever being materialised.
  if (Math.floor((b64.length * 3) / 4) > MAX_SLICE_BYTES) return 'too-large';
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    return null;
  }
  if (binary.length > MAX_SLICE_BYTES) return 'too-large';
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Validates the whole body. Returns the parsed request, or an error string from VERR. */
export function validateSliceRequest(body: unknown): ParsedRequest | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: VERR.body };
  const b = body as Record<string, unknown>;

  for (const key of Object.keys(b)) {
    if (!ALLOWED_KEYS.has(key)) return { error: VERR.unknownField };
  }

  if (typeof b.roomId !== 'string' || !UUID_RE.test(b.roomId)) return { error: VERR.roomId };
  const roomId = b.roomId;

  if (b.warmup === true) {
    // The pre-warm POST carries no audio at all (Decision 6). It still runs every gate the
    // real path runs; it just has nothing to transcribe.
    if ('audio' in b || 'sequence' in b) return { error: VERR.unknownField };
    return { kind: 'warmup', roomId };
  }
  if ('warmup' in b && b.warmup !== false) return { error: VERR.body };

  if (typeof b.sequence !== 'number' || !Number.isInteger(b.sequence) || b.sequence < 0 || b.sequence > MAX_SEQUENCE) {
    return { error: VERR.sequence };
  }

  if (!('audio' in b)) return { error: VERR.audioMissing };
  const audio = decodeSliceAudio(b.audio);
  if (audio === 'too-large') return { error: VERR.audioTooLarge };
  if (!audio) return { error: VERR.audioEncoding };

  const wav = parseWavHeader(audio);
  if (!wav) return { error: VERR.notWav };
  if (
    wav.sampleRate !== EXPECTED_SAMPLE_RATE ||
    wav.channels !== EXPECTED_CHANNELS ||
    wav.bitsPerSample !== EXPECTED_BITS_PER_SAMPLE
  ) {
    return { error: VERR.wavFormat };
  }
  if (wav.dataBytes === 0) return { error: VERR.empty };
  if (wav.durationMs > MAX_SLICE_DURATION_MS) return { error: VERR.tooLong };

  return { kind: 'slice', roomId, sequence: b.sequence, audio, wav };
}
