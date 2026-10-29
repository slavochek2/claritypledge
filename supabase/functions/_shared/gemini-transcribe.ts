/**
 * P1576: the one Gemini call that turns a WAV clip into text, plus the WAV header reader
 * the clip functions bound duration with. Used by transcribe-clip and chat-voice.
 *
 * The request is audio and nothing else. `gemini-3.5-transcribe` rejects `systemInstruction`
 * with HTTP 400 ("Developer instruction is not enabled for this model"), and an instruction
 * part would put instruction text in the same stream as untrusted speech. So there is no
 * prompt for the speaker's words to be interpolated into. (transcribe-slice, which this
 * mirrors, is deliberately left untouched.)
 *
 * The key is a parameter, never read here: each caller owns which budget-capped key it spends.
 */

/** Deadline for one Gemini call. A 3-minute clip answers in seconds; a minute means it is stuck. */
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MODEL = 'gemini-3.5-transcribe';
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationMs: number;
}

interface WavScan {
  fmt: { channels: number; sampleRate: number; bitsPerSample: number };
  /** Offset of the first PCM byte. */
  dataOffset: number;
  /** The smaller of the declared data size and the bytes that arrived. */
  dataBytes: number;
}

/**
 * The one place a WAV is read. Strict on purpose: exactly one `fmt ` chunk, before `data`, and no
 * chunk other than `fmt `, `LIST` and `data`. A file with two fmt chunks (or an extension area that
 * hides a second header) is read differently by different decoders; this reader refuses it rather
 * than pick a winner, so the format validated here is the only format there is.
 *
 * Walks the chunk list rather than assuming `data` sits at offset 36: a header with a LIST chunk in
 * front is valid WAV, and a fixed-offset reader would compute a duration from chunk bytes, which is
 * the one number a duration cap must be able to trust.
 *
 * Returns null for anything it cannot read with certainty. The smaller of the declared data size and
 * the bytes that arrived is used: a declared size larger than the buffer is a truncated upload, not a
 * long recording.
 */
function scanWav(bytes: Uint8Array): WavScan | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (off: number) => String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let offset = 12;
  let fmt: WavScan['fmt'] | null = null;

  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      if (fmt) return null; // a second fmt chunk
      if (size < 16 || body + 16 > bytes.length) return null;
      if (view.getUint16(body, true) !== 1) return null; // 1 = PCM
      fmt = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      if (!fmt) return null;
      const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels;
      if (!(bytesPerFrame > 0) || fmt.sampleRate <= 0) return null;
      return { fmt, dataOffset: body, dataBytes: Math.min(size, bytes.length - body) };
    } else if (id !== 'LIST') {
      return null;
    }
    // Chunks are word-aligned: an odd size carries one pad byte that is not counted in it.
    offset = body + size + (size % 2);
  }
  return null;
}

/** Reads a PCM WAV header. See scanWav for what it refuses. */
export function parseWavHeader(bytes: Uint8Array): WavInfo | null {
  const scan = scanWav(bytes);
  if (!scan) return null;
  const { fmt, dataBytes } = scan;
  const bytesPerFrame = (fmt.bitsPerSample / 8) * fmt.channels;
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bitsPerSample,
    dataBytes,
    durationMs: Math.round((dataBytes / bytesPerFrame / fmt.sampleRate) * 1000),
  };
}

/**
 * A fresh canonical file for the validated clip: a 44-byte header built here from the validated
 * parameters, then exactly the PCM that the data chunk holds (whole samples only). Nothing of the
 * client's header, chunk layout or trailing bytes survives, so the bytes Gemini decodes and bills are
 * the bytes that were validated. Returns null when parseWavHeader would.
 */
export function canonicalWav(bytes: Uint8Array): Uint8Array | null {
  const scan = scanWav(bytes);
  if (!scan) return null;
  const { fmt } = scan;
  const frame = (fmt.bitsPerSample / 8) * fmt.channels;
  const dataBytes = scan.dataBytes - (scan.dataBytes % frame);
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const put = (off: number, s: string) => { for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); put(8, 'WAVE');
  put(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, fmt.channels, true);
  view.setUint32(24, fmt.sampleRate, true); view.setUint32(28, fmt.sampleRate * frame, true);
  view.setUint16(32, frame, true); view.setUint16(34, fmt.bitsPerSample, true);
  put(36, 'data'); view.setUint32(40, dataBytes, true);
  out.set(bytes.subarray(scan.dataOffset, scan.dataOffset + dataBytes), 44);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) on a multi-MB clip blows the argument limit.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * One WAV clip in, its transcript out. Throws on a non-2xx with the status in the message.
 * An empty candidate is a legitimate result (silence) and returns ''.
 *
 * The transcript is at `parts[0].audioTranscription.text`; `.text` is kept as a fallback.
 * Reading the wrong field does not throw, it yields undefined, which is indistinguishable
 * from silence, so both are read.
 */
export async function transcribeWav(
  apiKey: string,
  wav: Uint8Array,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = GEMINI_TIMEOUT_MS,
): Promise<string> {
  const response = await fetchImpl(GEMINI_ENDPOINT, {
    method: 'POST',
    // A call that never answers must not hold an isolate (or a sweep) for ever.
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: 'audio/wav', data: toBase64(wav) } }] }],
    }),
  });
  if (!response.ok) throw new Error(`Gemini returned ${response.status}`);
  const payload = await response.json();
  const part = payload?.candidates?.[0]?.content?.parts?.[0];
  const text = part?.audioTranscription?.text ?? part?.text;
  return typeof text === 'string' ? text.trim() : '';
}
